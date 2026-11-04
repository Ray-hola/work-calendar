"""Per-call SQLite workspace containing only application-authorized records.

The connection is disposable and never attaches the application's database.
SQL runs with a read-only authorizer, function allow-list and resource limits.
"""
import json
import sqlite3
import time

RESULT_CHARS = 8_000
MAX_ROWS = 100
MAX_CALLS = 8

# JSON columns preserve domain details; flat columns make joins and aggregates easy.
TABLES = {
    'people': ('账户目录；只有公开姓名、角色与启用状态', 'id displayName nickname role active'),
    'projects': ('当前可见项目，members 为账户到 accepted/pending 状态的 JSON', 'id name desc background owner creator status start end members'),
    'tasks': ('可见任务的当前递延链末端及合并期次代表；stackCount为期数，统计卡片数量用此表，避免重复计数', 'id name desc projectId assignee creator date deadline time duration priority status fixed completedAt completionSummary originId repeatId stackCount'),
    'task_history': ('可见任务的全部历史记录；superseded=1 表示已被后续递延或返工任务接替', 'id name desc projectId assignee creator date deadline time duration priority status fixed completedAt completionSummary originId repeatId stackCount superseded'),
    'logs': ('可见任务的工作记录，kind=complete/defer 等', 'id taskId actor kind date createdAt actual estimated reason summary'),
    'completions': ('工作日志中的真实完成事件，已去除递延链重复，包含按权限可见的历史归档完成；历史完成统计用此表', 'id kind taskId projectId name assignee owner completedAt'),
    'reports': ('可见日报和报告；团队日报 content 已应用人工修订', 'id author projectId kind date content createdAt updatedAt'),
    'diaries': ('当前账户有权看的个人日记；content 是 JSON', 'id author date content auto createdAt updatedAt'),
    'notifications': ('仅当前账户的通知', 'id to title body kind read reference createdAt'),
    'repeats': ('有权查看的固定安排；assignees 为 JSON 数组', 'id name desc projectId assignees active start end time duration priority'),
    'achievements': ('按现有成果库权限可见的历史项目与结项资料', 'id name owner status completedAt completionReport taskStats'),
    'files': ('有权读取的项目附件元数据；不含文件字节', 'id projectId name contentType size uploader createdAt'),
    'file_projects': ('附件所属项目的可见索引，含仍有权读取附件的归档项目；不含归档项目私密正文', 'id name owner status end completedAt folderId'),
    'folders': ('有权查看的项目文件夹', 'id name order createdAt'),
    'profiles': ('按工作台既有权限可见的成员工作画像', 'id user completed ratio efficiency minutes load deferrals suitable'),
    'requests': ('发给当前账户的项目邀请', 'id projectId to from status createdAt'),
    'task_requests': ('有权查看的任务申请', 'id projectId requester assignee status createdAt'),
    'edit_requests': ('有权查看的任务修改申请', 'id taskId requester approver status createdAt'),
}
NUMBERS = {'active', 'duration', 'fixed', 'superseded', 'actual', 'estimated', 'read', 'auto', 'size', 'completed', 'ratio', 'minutes', 'deferrals', 'order', 'stackCount'}
FUNCTIONS = frozenset('count sum total avg min max abs round coalesce ifnull nullif lower upper length substr substring instr replace trim ltrim rtrim like glob date time datetime strftime julianday unixepoch json json_extract json_array_length json_type json_valid group_concat printf format typeof iif likelihood likely unlikely'.split())


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


class WorkspaceError(Exception):
    pass


def schema():
    return {'dialect': 'SQLite', 'tables': {name: {'description': info[0], 'columns': info[1].split() + ['data']}
                                           for name, info in TABLES.items()},
            'notes': ['每个表只含当前账户有权查看的数据；data 为完整记录 JSON。查询为空仅表示当前可见范围内无匹配，不能推断其他成员没有数据。',
                      'status: todo/doing/done/deferred/skipped/pending_approval/rejected；日期 YYYY-MM-DD。',
                      '跨表用 JOIN，统计用 COUNT/SUM/GROUP BY；不要靠分页样本计算全量统计。',
                      '用 json_extract(content,\'$.done\') 等读取 JSON；名单不确定时查询 people。',
                      '分页查询要 ORDER BY 稳定字段，并把 nextOffset 传回；长记录用 workspace_read。']}


def tools(actions):
    def function(name, description, properties, required=()):
        return {'type': 'function', 'function': {'name': name, 'description': description,
                'parameters': {'type': 'object', 'properties': properties, 'required': list(required), 'additionalProperties': False}}}
    text = {'type': 'string'}
    result = [function('workspace_schema', '查看只读 SQL 工作区的表和字段。', {}),
              function('workspace_query', '执行 SELECT/CTE 查询授权数据。支持 JOIN 和聚合；结果有分页和截短标记，统计请直接用 SQL 聚合。',
                       {'sql': text, 'params': {'type': 'array', 'items': {'type': ['string', 'number', 'null']}},
                        'offset': {'type': 'integer', 'minimum': 0}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': MAX_ROWS}}, ['sql']),
              function('workspace_read', '按表与 ID 读取完整记录或指定字段。长文本按 nextOffset 连续读取，不必把整月资料都放进上下文。',
                       {'table': {'type': 'string', 'enum': list(TABLES)}, 'id': text, 'field': text,
                        'offset': {'type': 'integer', 'minimum': 0}}, ['table', 'id'])]
    card = {'type': 'object', 'properties': {'operation': {'type': 'string', 'enum': ['create', 'update', 'delete']},
            'id': text}, 'additionalProperties': True}
    result.append(function('work_cards', '统一起草任务和项目的创建、修改、删除卡片。修改/删除须先查询真实 id；字段直接放在卡片对象上，只传要改的字段。此工具只起草，等待用户在卡片里编辑并确认；不能自动执行。',
                           {'projects': {'type': 'array', 'items': card, 'maxItems': 6},
                            'tasks': {'type': 'array', 'items': card, 'maxItems': 30}}))
    if actions:
        result.append(function('business_action', '准备一项业务修改，交给页面已有确认与执行流程。这里只提出操作，不代表操作已执行；一次只提出一项。',
                               {'action': {'type': 'string', 'enum': actions}, 'data': {'type': 'object'}}, ['action', 'data']))
    return result


class Workspace:
    def __init__(self, load_rows):
        self.load_rows = load_rows

    def query(self, args):
        sql = args.get('sql')
        params = args.get('params', [])
        offset, limit = args.get('offset', 0), args.get('limit', 30)
        if not isinstance(sql, str) or not sql.strip() or len(sql) > 6_000:
            raise WorkspaceError('请提供不超过6000字符的 SELECT 或 WITH 查询')
        if not isinstance(params, list) or len(params) > 100 or any(not isinstance(p, (str, int, float, type(None))) for p in params):
            raise WorkspaceError('params 必须是最多100个字符串、数字或null')
        if type(offset) is not int or offset < 0 or offset > 1_000_000 or type(limit) is not int or not 1 <= limit <= MAX_ROWS:
            raise WorkspaceError('offset/limit 超出分页范围')
        db = sqlite3.connect(':memory:')
        db.row_factory = sqlite3.Row
        needed = set()

        def authorize(action, first, second, *_):
            if action == sqlite3.SQLITE_READ:
                if first not in TABLES:
                    return sqlite3.SQLITE_DENY
                needed.add(first)
                return sqlite3.SQLITE_OK
            if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_RECURSIVE):
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_FUNCTION and str(second).lower() in FUNCTIONS:
                return sqlite3.SQLITE_OK
            return sqlite3.SQLITE_DENY

        try:
            for table, (_, columns) in TABLES.items():
                definitions = ','.join('"' + col + '" ' + ('REAL' if col in NUMBERS else 'TEXT') for col in columns.split() + ['data'])
                db.execute(f'CREATE TABLE "{table}" ({definitions})')
            for name, value in [('SQLITE_LIMIT_LENGTH', 1_000_000), ('SQLITE_LIMIT_SQL_LENGTH', 8_000),
                                ('SQLITE_LIMIT_COLUMN', 64), ('SQLITE_LIMIT_EXPR_DEPTH', 50),
                                ('SQLITE_LIMIT_VDBE_OP', 50_000), ('SQLITE_LIMIT_VARIABLE_NUMBER', 100),
                                ('SQLITE_LIMIT_LIKE_PATTERN_LENGTH', 256)]:
                if hasattr(db, 'setlimit'):
                    db.setlimit(getattr(sqlite3, name), value)
            db.set_authorizer(authorize)
            # Compilation discovers only the tables needed for this query.
            # EXPLAIN never executes an expression or reads business rows.
            db.execute('EXPLAIN ' + sql, params).close()
            db.set_authorizer(None)
            for table in sorted(needed):
                columns = TABLES[table][1].split() + ['data']
                def values(row):
                    for col in columns:
                        value = row if col == 'data' else row.get(col)
                        yield compact(value) if isinstance(value, (dict, list)) else value
                placeholders = ','.join('?' for _ in columns)
                db.executemany(f'INSERT INTO "{table}" VALUES ({placeholders})',
                               (tuple(values(row)) for row in self.load_rows(table)))
            db.commit()
            db.execute('PRAGMA query_only=ON')
            db.set_authorizer(authorize)
            deadline, steps = time.monotonic() + 2, 0
            def progress():
                nonlocal steps
                steps += 100
                return int(steps > 1_000_000 or time.monotonic() > deadline)
            db.set_progress_handler(progress, 100)
            cursor = db.execute(sql, params)
            if cursor.description is None:
                raise WorkspaceError('工作区仅支持只读查询')
            if len({c[0] for c in cursor.description}) != len(cursor.description):
                raise WorkspaceError('结果列名重复，请用 AS 为列设置不同名称')
            if len(cursor.description) > 20 or any(len(c[0]) > 64 for c in cursor.description):
                raise WorkspaceError('请最多选择20列，并使用不超过64字符的列名')
            # Offset is bounded and subject to the same CPU deadline.
            for _ in range(offset):
                if cursor.fetchone() is None:
                    break
            rows, clipped = [], []
            more = False
            for index in range(limit + 1):
                raw = cursor.fetchone()
                if raw is None:
                    break
                if index == limit:
                    more = True
                    break
                row = dict(raw)
                for key, value in row.items():
                    if isinstance(value, str) and len(value) > 1200:
                        row[key] = value[:1200]
                        clipped.append({'row': offset + index, 'column': key})
                clipped = list({(item['row'], item['column']): item for item in clipped}.values())
                candidate = {'rows': rows + [row], 'clipped': clipped}
                if len(compact(candidate)) > RESULT_CHARS - 600:
                    # A very wide first row is still inspectable field by field.
                    if not rows:
                        for key, value in row.items():
                            if isinstance(value, str) and len(value) > 80:
                                row[key] = value[:80]
                                clipped.append({'row': offset + index, 'column': key})
                        rows.append(row)
                        more = cursor.fetchone() is not None
                    else:
                        more = True
                    break
                rows.append(row)
            clipped = [item for item in {(item['row'], item['column']): item for item in clipped}.values() if item['row'] < offset + len(rows)]
            result = {'columns': [c[0] for c in cursor.description], 'rows': rows, 'shown': len(rows),
                    'offset': offset, 'nextOffset': offset + len(rows) if more else None,
                    'hasMore': more, 'clipped': clipped,
                    'note': 'clipped 中的字段未返回全文，请按表和id用 workspace_read 读取；hasMore 表示查询尚有后续行。'}
            if len(compact(result)) > RESULT_CHARS:
                raise WorkspaceError('结果列过宽，请减少列数或用 substr 读取部分内容')
            return result
        except (sqlite3.Error, OverflowError, ValueError) as exc:
            raise WorkspaceError('只读查询未完成：' + str(exc)[:180]) from None
        finally:
            db.close()

    def read(self, args):
        table, record_id, field, offset = args.get('table'), args.get('id'), args.get('field'), args.get('offset', 0)
        if table not in TABLES or not isinstance(record_id, str) or not record_id or len(record_id) > 200:
            raise WorkspaceError('请指定已知表和记录 ID')
        if type(offset) is not int or not 0 <= offset <= 1_000_000:
            raise WorkspaceError('offset 无效')
        row = next((r for r in self.load_rows(table) if r.get('id') == record_id), None)
        if row is None:
            return {'found': False}
        if field is not None and (not isinstance(field, str) or field not in row):
            raise WorkspaceError('字段不存在；省略 field 可读取完整记录')
        value = row[field] if field is not None else row
        raw = value if isinstance(value, str) else compact(value)
        text = raw[offset:offset + 2_500]
        following = offset + len(text)
        return {'found': True, 'table': table, 'id': record_id, 'field': field, 'format': 'text' if isinstance(value, str) else 'json',
                'offset': offset, 'text': text, 'totalChars': len(raw),
                'nextOffset': following if following < len(raw) else None, 'complete': following >= len(raw)}
