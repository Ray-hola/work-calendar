"""Work Calendar: local authenticated application, SQLite storage and scheduler."""
from __future__ import annotations
import argparse
import calendar
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time as _time
import urllib.error
import urllib.parse
import urllib.request

# OpenCode Go exposes these models through the OpenAI-compatible
# ``/chat/completions`` endpoint. Keep this list in one place so the UI and
# API validation can evolve without leaking any credentials.
OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1/chat/completions'
# Synced from OpenCode Go's official catalog (last checked 2026-09-13).
# The proxy currently emits OpenAI chat/completions payloads, so only entries
# marked ``chat`` are selectable; the complete catalog is still exposed to the
# superadmin UI with its native protocol and endpoint for clarity.
OPENCODE_GO_CATALOG = (
    {'id':'grok-4.6','name':'Grok 4.6','protocol':'responses','endpoint':'https://opencode.ai/zen/go/v1/responses'},
    {'id':'glm-5.3-flash','name':'GLM-5.3-Flash','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'glm-5.3','name':'GLM-5.3','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'glm-5.2','name':'GLM-5.2','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'glm-5.1','name':'GLM-5.1','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'gpt-5.6-luna','name':'GPT 5.6 Luna','protocol':'responses','endpoint':'https://opencode.ai/zen/go/v1/responses'},
    {'id':'kimi-k3','name':'Kimi K3','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'kimi-k2.7-code','name':'Kimi K2.7 Code','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'kimi-k2.6','name':'Kimi K2.6','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'longcat-2.0','name':'LongCat-2.0','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'mimo-v2.5','name':'MiMo-V2.5','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'mimo-v2.5-pro','name':'MiMo-V2.5-Pro','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'minimax-m3','name':'MiniMax M3','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'minimax-m2.7','name':'MiniMax M2.7','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'muse-spark-1.3-contributor','name':'Muse Spark 1.3 Contributor','protocol':'responses','endpoint':'https://opencode.ai/zen/go/v1/responses'},
    {'id':'muse-spark-1.2-contributor','name':'Muse Spark 1.2 Contributor','protocol':'responses','endpoint':'https://opencode.ai/zen/go/v1/responses'},
    {'id':'qwen3.8-max','name':'Qwen3.8 Max','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'qwen3.8-flash','name':'Qwen3.8 Flash','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'qwen3.7-max','name':'Qwen3.7 Max','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'qwen3.7-plus','name':'Qwen3.7 Plus','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'qwen3.6-plus','name':'Qwen3.6 Plus','protocol':'messages','endpoint':'https://opencode.ai/zen/go/v1/messages'},
    {'id':'deepseek-v4.1-flash','name':'DeepSeek V4.1 Flash','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'deepseek-v4-pro','name':'DeepSeek V4 Pro','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'deepseek-v4-flash','name':'DeepSeek V4 Flash','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'deepseek-v4-flash-vision-exp','name':'DeepSeek V4 Flash Vision Exp','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'hy4-preview','name':'Hy4 preview','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
    {'id':'hy3','name':'Hy3','protocol':'chat','endpoint':OPENCODE_GO_BASE_URL},
)
OPENCODE_GO_MODELS = tuple(x['id'] for x in OPENCODE_GO_CATALOG if x['protocol'] == 'chat')
OPENCODE_GO_DEFAULT_MODEL = 'glm-5.3-flash'
from datetime import date, datetime, time, timedelta
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
TZ = ZoneInfo('Asia/Shanghai')
# MVP 的日期范围先开放到 2027-04-30（含当天）。统一由后端校验，避免
# 浏览器绕过日期输入限制后创建超出当前产品范围的安排。
CALENDAR_END = date(2027, 4, 30)
TABLES = ('projects', 'tasks', 'logs', 'repeats', 'reports', 'diaries', 'notifications', 'requests', 'edit_requests', 'suggestions', 'audit', 'corrections', 'settings', 'agent_messages')

# Agent capability boundary.  The future chat/browser adapter must use these
# capabilities instead of exposing Store internals or the generic action API.
# Members get information retrieval only; superadmin is the operator account.
AGENT_READ_TOOLS = frozenset({
    'agent.chat', 'agent.config.read',
    'schedule.read', 'project.read', 'task.read', 'timeline.read',
    'inbox.read', 'diary.read', 'report.read', 'worklog.read',
    'repeat.read', 'request.read', 'edit_request.read', 'achievement.read',
    'member_load.read', 'profile.read',
})
AGENT_WRITE_TOOLS = frozenset({
    'agent.config.manage',
    'account.manage', 'project.create', 'project.review',
    'project.update', 'project.invite', 'project.complete_request',
    'project.complete_review', 'request.manage',
    'task.create', 'task.update', 'task.delete', 'task.review',
    'task.edit_review', 'repeat.manage', 'automation.manage',
    'report.manage', 'report.schedule.manage', 'assignment.manage',
    'collection.manage', 'profile.correct', 'scheduler.run',
})

# Mapping used by the chat adapter when a model proposes a concrete Store
# action.  Keeping this allow-list here prevents a future UI from forwarding an
# arbitrary action string while still reusing the application's existing
# authorization rules.
AGENT_ACTION_TO_TOOL = {
    'account.create': 'account.manage', 'account.toggle': 'account.manage',
    'account.delete': 'account.manage',
    'project.create': 'project.create', 'project.review': 'project.review',
    'project.update': 'project.update', 'project.invite': 'project.invite',
    'project.complete_request': 'project.complete_request',
    'project.complete_review': 'project.complete_review',
    'task.create': 'task.create', 'task.update': 'task.update',
    'task.delete': 'task.delete', 'task.complete': 'task.review',
    'task.review': 'task.review', 'task.edit_request': 'task.edit_review',
    'task.edit_review': 'task.edit_review', 'repeat.create': 'repeat.manage',
    'repeat.update': 'repeat.manage', 'repeat.skip': 'repeat.manage',
    'automation.update': 'automation.manage', 'collection.update': 'collection.manage',
    'report.schedule.update': 'report.schedule.manage',
    'achievement.read': 'achievement.read',
}

def now():
    return datetime.now(TZ)

def timestamp():
    return now().isoformat()

def uid():
    return secrets.token_hex(10)

def required(data, key):
    value = str(data.get(key, '')).strip()
    if not value:
        raise Problem(400, f'请填写 {key}')
    return value

def valid_date(value):
    try:
        parsed = date.fromisoformat(str(value))
    except (ValueError, TypeError):
        raise Problem(400, '日期格式应为 YYYY-MM-DD')
    if parsed > CALENDAR_END:
        raise Problem(400, f'日期范围目前只支持到 {CALENDAR_END.isoformat()}')
    return parsed.isoformat()

def valid_clock(value):
    """Return a normalized HH:MM clock value for automation settings."""
    try:
        parsed = time.fromisoformat(str(value or '00:00'))
        return parsed.strftime('%H:%M')
    except (TypeError, ValueError):
        raise Problem(400, '时间格式应为 HH:MM')

def duration(value):
    try:
        n = int(value)
        if 0 < n <= 1440:
            return n
    except (TypeError, ValueError):
        pass
    raise Problem(400, '时长应为 1 至 1440 分钟')

class Problem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message
        super().__init__(message)

class Store:
    def __init__(self, path, seed=True):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT \'member\')')
        # Existing databases predate the role column: default them to
        # superadmin/member from the old boolean so operators keep working.
        columns = {row['name'] for row in self.db.execute('PRAGMA table_info(users)')}
        if 'role' not in columns:
            self.db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'")
            self.db.execute("UPDATE users SET role=CASE WHEN admin=1 THEN 'superadmin' ELSE 'member' END")
        # Profile columns: 中文名称 is assigned by the superadmin group, while
        # 昵称 and the avatar belong to the account holder.
        if 'display_name' not in columns:
            self.db.execute('ALTER TABLE users ADD COLUMN display_name TEXT')
        if 'nickname' not in columns:
            self.db.execute('ALTER TABLE users ADD COLUMN nickname TEXT')
        if 'avatar' not in columns:
            self.db.execute('ALTER TABLE users ADD COLUMN avatar TEXT')
        self.db.execute('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, ran_at TEXT NOT NULL)')
        for table in TABLES:
            self.db.execute(f'CREATE TABLE IF NOT EXISTS {table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)')
        self.db.commit()
        # One JSON record stores the global automatic collection policy.  The
        # default keeps the existing behaviour: collect the previous day's
        # summaries every day at midnight.
        if not self.db.execute("SELECT 1 FROM settings WHERE id='automation'").fetchone():
            self.db.execute('INSERT INTO settings(id,data) VALUES(?,?)', ('automation', json.dumps({
                'id': 'automation', 'value': {
                    'enabled': True, 'time': '00:00',
                    'weekdays': [0, 1, 2, 3, 4, 5, 6], 'dates': []
                }
            }, ensure_ascii=False)))
            self.db.commit()
        self.initial_passwords = {}
        if seed and not self.users():
            self.seed()

    def close(self):
        self.db.close()

    def all(self, table):
        assert table in TABLES
        return [json.loads(r['data']) for r in self.db.execute(f'SELECT data FROM {table} ORDER BY rowid')]

    def get(self, table, id):
        assert table in TABLES
        r = self.db.execute(f'SELECT data FROM {table} WHERE id=?', (id,)).fetchone()
        if not r:
            raise Problem(404, '记录不存在')
        return json.loads(r['data'])

    def put(self, table, obj):
        assert table in TABLES
        obj.setdefault('id', uid())
        self.db.execute(f'INSERT INTO {table}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', (obj['id'], json.dumps(obj, ensure_ascii=False)))
        return obj

    def users(self):
        rows = self.db.execute('SELECT id,admin,active,role,display_name,nickname,avatar FROM users ORDER BY admin DESC,id')
        result = []
        for row in rows:
            item = dict(row)
            item['displayName'] = item.pop('display_name') or ''
            item['nickname'] = item.pop('nickname') or ''
            item['avatar'] = item.pop('avatar') or ''
            result.append(item)
        return result

    def user(self, id):
        u = next((u for u in self.users() if u['id'] == id and u['active']), None)
        if not u:
            raise Problem(401, '请重新登录')
        return u

    def admin(self, user):
        """Operational administrator: the superadmin and admin groups."""
        if not user['admin']:
            raise Problem(403, '此操作需要管理员权限')

    def superadmin(self, user):
        """Account, role and password management stay with the superadmin group."""
        if user.get('role') != 'superadmin':
            raise Problem(403, '此操作需要 superadmin 权限')

    def agent_capabilities(self, user):
        """Return the explicit capability contract for an embedded agent."""
        tools = AGENT_READ_TOOLS | (AGENT_WRITE_TOOLS if user.get('admin') else frozenset())
        return {
            'role': user.get('role') or ('superadmin' if user.get('admin') else 'member'),
            'mode': 'operator' if user.get('admin') else 'readonly',
            'tools': sorted(tools),
            'requiresConfirmation': sorted(AGENT_WRITE_TOOLS) if user.get('admin') else [],
        }

    def authorize_agent_tool(self, user, tool):
        """Authorize one semantic Agent tool before an adapter executes it."""
        tool = str(tool or '').strip()
        capabilities = self.agent_capabilities(user)
        if tool not in capabilities['tools']:
            raise Problem(403, '当前账户的 Agent 仅支持查询，不能执行该操作')
        return {'allowed': True, 'tool': tool, 'mode': capabilities['mode'],
                'requiresConfirmation': tool in AGENT_WRITE_TOOLS}

    def _llm_record(self):
        """Read the private LLM connection record without exposing its key."""
        return next((x for x in self.all('settings') if x.get('id') == 'llm'),
                    {'id': 'llm', 'value': {}})

    def llm_config(self, user):
        """Return the connection settings safe for the browser to display."""
        self.authorize_agent_tool(user, 'agent.config.read')
        value = dict(self._llm_record().get('value') or {})
        key = str(value.get('apiKey') or '')
        # Members may use the configured proxy but do not need to know the
        # provider URL or selected model. Configuration remains a superadmin
        # concern; only safe status metadata is returned to other roles.
        is_admin = bool(user.get('admin'))
        return {
            # Local OpenAI-compatible servers (for example Ollama) may not
            # require a key, so configuration status is based on endpoint/model.
            'configured': bool(value.get('baseUrl') and value.get('model')),
            'baseUrl': str(value.get('baseUrl') or '') if is_admin else '',
            'model': str(value.get('model') or '') if is_admin else '',
            'provider': str(value.get('provider') or 'custom') if is_admin else '',
            'opencodeGoModels': list(OPENCODE_GO_MODELS) if is_admin else [],
            'apiKeySet': bool(key),
            # Never echo a short key verbatim.  For normal keys keep only the
            # final four characters so the operator can recognise which key is
            # configured without exposing the credential to the browser.
            'apiKeyMasked': (('•' * len(key)) if len(key) <= 4 else ('•' * (len(key) - 4) + key[-4:])) if key else '',
            'updatedAt': self._llm_record().get('updatedAt'),
        }

    def set_llm_config(self, user, data):
        """Persist an OpenAI-compatible endpoint; only superadmin may change it."""
        self.admin(user)
        provider = str(data.get('provider') or 'custom').strip()
        base = str(data.get('baseUrl', '')).strip().rstrip('/')
        model = str(data.get('model', '')).strip()
        if provider == 'opencode-go':
            # Selecting the preset is enough to fill the canonical endpoint;
            # custom model ids are still accepted for forward compatibility.
            base = base or OPENCODE_GO_BASE_URL
            # Keep the original preset default for existing installations;
            # superadmin can select newer models such as glm-5.3-flash.
            model = model or 'grok-4.5'
        if not base or not model:
            raise Problem(400, '请填写 API Base URL 和模型名称')
        parsed = urllib.parse.urlparse(base)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            raise Problem(400, 'API Base URL 必须是 http(s) 地址')
        if len(base) > 500 or len(model) > 200:
            raise Problem(400, 'API 配置长度超出限制')
        previous = self._llm_record()
        value = dict(previous.get('value') or {})
        value.update({'baseUrl': base, 'model': model, 'provider': provider})
        if 'apiKey' in data:
            key = str(data.get('apiKey') or '').strip()
            if len(key) > 500:
                raise Problem(400, 'API Key 长度超出限制')
            if key:
                value['apiKey'] = key
            elif data.get('clearApiKey'):
                value.pop('apiKey', None)
        try:
            value['temperature'] = max(0.0, min(2.0, float(data.get('temperature', value.get('temperature', 0.2)))))
        except (TypeError, ValueError):
            raise Problem(400, 'temperature 必须是 0 至 2 的数字')
        record = {'id': 'llm', 'value': value, 'updatedAt': timestamp()}
        self.put('settings', record)
        return self.llm_config(user)

    def llm_chat(self, user, data):
        """Proxy a chat request to an OpenAI-compatible endpoint.

        The API key never leaves the server.  Members are explicitly read-only:
        callers may submit questions, but cannot ask this endpoint to execute a
        write tool on their behalf.
        """
        self.authorize_agent_tool(user, 'agent.chat')
        if not isinstance(data.get('messages'), list) or not data['messages']:
            raise Problem(400, '请提供至少一条消息')
        messages = []
        for item in data['messages'][-40:]:
            if not isinstance(item, dict) or item.get('role') not in ('system', 'user', 'assistant'):
                raise Problem(400, '消息格式无效')
            content = str(item.get('content', ''))
            if not content or len(content) > 12000:
                raise Problem(400, '消息内容不能为空且不能超过 12000 字符')
            messages.append({'role': item['role'], 'content': content})
        # Keep the permission contract in the model context as a second line of
        # defence; actual mutations still go through Store.action authorization.
        policy = ('你是「战略小组台账」助手。当前账户是 superadmin，可协助查询并提出管理操作；'
                  '任何创建、指派、调整或审批都必须先向用户展示拟执行内容并等待明确确认。'
                  if user.get('admin') else
                  '你是「战略小组台账」查询助手。当前账户是普通成员，只能回答该成员有权看到的信息，'
                  '不能创建、删除、指派、调整或审批任何数据。')
        if user.get('admin'):
            # Teach the operator model the one structured envelope the browser
            # knows how to turn into a confirmation card.  Without this the
            # assistant can only describe an action and never apply it.
            policy += ('\n当用户要求创建、指派、调整、审批或删除数据，且你能从上下文确定必填字段时，'
                       '先在正文用一两句话说明拟执行内容，然后另起一行输出一个动作块：'
                       '<action>{"action":"动作名","data":{...}}</action>。'
                       '动作块必须是单行合法 JSON，不要放进 Markdown 代码围栏，也不要输出多个动作块。'
                       f'可用动作名：{", ".join(sorted(AGENT_ACTION_TO_TOOL))}。'
                       '创建任务的示例：'
                       '<action>{"action":"task.create","data":{"name":"整理周报","projectId":"项目ID","assignee":"成员账户","date":"2026-09-14","duration":60,"priority":"P1"}}</action>。'
                       '日期使用 YYYY-MM-DD，优先级为 P0/P1/P2。前端会解析动作块并请用户确认后再执行，'
                       '所以只输出动作块即可，不要声称已经执行完成。')
            # Prerequisites the model cannot guess from the data alone. Without
            # these it proposes a valid-looking task.create that the store then
            # refuses, and the run stops on a failure the assistant could have
            # fixed by itself in one more step.
            policy += ('\n动手之前先核对前置条件，可以省掉大多数失败：\n'
                       '- 项目任务的负责人必须是该项目 members 里状态为 accepted 的成员。'
                       '如果目标成员不在其中，先输出 project.invite（data:{"id":"项目ID","members":["账户"]}），'
                       '拿到成功回执后再输出原来的 task.create。\n'
                       '- 只有 status 为 active 的项目可以安排任务。待审批的项目先输出 '
                       'project.review（data:{"id":"项目ID","accept":true}）。\n'
                       '- 任务日期必须落在项目的 start 与 end 之间，且不能超出可排期范围。\n'
                       '每执行完一个动作，回执里会附上「数据核对」，写明数据实际发生了什么变化。'
                       '先拿它和你的预期比一比，对得上再输出下一个动作；对不上或没有生效，先修正它，不要继续往下推进。\n'
                       '执行失败时系统会回一条【系统回执·失败】。先读懂原因再决定怎么做：'
                       '如果是缺了前置步骤（例如负责人还没加入项目、项目还没审批），就补上那一步再继续；'
                       '确实做不到的，用一句话向用户说明原因并结束，不要重复提交同一个动作。')
        # A caller-supplied system message is untrusted input.  The policy is
        # placed first for provider compatibility and repeated last so it
        # remains authoritative if a custom prompt tries to override it.
        # Give the model the same, already-filtered workspace view as the
        # signed-in user.  Without this context a chat request could only
        # answer generic questions and could not actually report today's work.
        # snapshot() applies the normal visibility rules, so member data stays
        # private while superadmin receives the team view.
        state = self.snapshot(user)
        context = {k: state.get(k) for k in (
            'today', 'projects', 'tasks', 'reports', 'diaries', 'diaryStats',
            'notifications', 'workCompletions', 'achievements', 'repeats', 'agentCapabilities')}
        # The diary dashboard needs a month of per-account rows broken down by
        # project; the assistant does not, and those rows were 78% of the
        # payload — a one-line question cost 13k prompt tokens. A week is still
        # more than enough to answer anything the assistant is asked about it.
        context['diaryStats'] = self.diary_statistics(
            user, start=(now().date() - timedelta(days=6)).isoformat())
        context_text = json.dumps(context, ensure_ascii=False, separators=(',', ':'))
        messages.insert(0, {'role': 'system', 'content':
                            '以下是当前账户可见的战略小组台账数据，仅用于回答查询；'
                            '不要把其中的内部字段或权限信息原样泄露给其他用户：\n' + context_text[:80000]})
        messages.insert(0, {'role': 'system', 'content': policy})
        messages.append({'role': 'system', 'content': policy})
        record = self._llm_record(); cfg = dict(record.get('value') or {})
        base = str(cfg.get('baseUrl') or '').rstrip('/'); model = str(cfg.get('model') or '')
        key = str(cfg.get('apiKey') or '')
        if not base or not model:
            raise Problem(409, '请先由 superadmin 配置 LLM API')
        session_id = str(data.get('sessionId') or f'work-calendar-{user["id"]}').strip()
        if not session_id or len(session_id) > 128 or any(ch not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:' for ch in session_id):
            raise Problem(400, 'Agent 会话 ID 格式无效')
        endpoint = base if base.endswith('/chat/completions') else base + '/chat/completions'
        payload = {'model': model, 'messages': messages,
                   'temperature': float(cfg.get('temperature', 0.2)),
                   'stream': False}
        headers = {'Content-Type': 'application/json', 'User-Agent': 'WorkCalendar/1.0',
                   'x-opencode-session': session_id}
        if key:
            headers['Authorization'] = f'Bearer {key}'

        def send_once():
            body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            request = urllib.request.Request(endpoint, data=body, method='POST', headers=headers)
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    raw = response.read(1_000_000)
                return json.loads(raw.decode('utf-8'))
            except urllib.error.HTTPError as exc:
                detail = exc.read(4000).decode('utf-8', errors='replace')
                raise Problem(502, f'LLM 服务返回 HTTP {exc.code}：{detail[:300]}')
            except (urllib.error.URLError, TimeoutError) as exc:
                raise Problem(502, f'LLM 服务连接失败：{str(exc)[:200]}')
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise Problem(502, 'LLM 服务返回了无法解析的响应')

        # The endpoint occasionally answers with an empty message. The browser
        # only saw "服务端 Agent 未返回文本", which says nothing about why. Ask
        # once more (an empty reply is usually transient) and, if it is still
        # empty, report what actually came back instead of a blank response.
        result = {}
        choice = {}
        content = ''
        for attempt in (1, 2):
            result = send_once()
            choices = result.get('choices') or []
            if not choices:
                raise Problem(502, 'LLM 响应缺少 choices')
            choice = choices[0]
            message = choice.get('message') or {}
            # Some gateways put the answer under reasoning_content, and a few
            # return the content as a list of parts.
            raw_content = message.get('content') or message.get('reasoning_content') or ''
            if isinstance(raw_content, list):
                raw_content = ''.join(str(part.get('text', '')) for part in raw_content if isinstance(part, dict))
            content = raw_content
            if str(content).strip():
                break
            if attempt == 1:
                _time.sleep(0.6)
        if not str(content).strip():
            usage = result.get('usage') or {}
            raise Problem(502, '模型（%s）连续两次都没有返回内容（finish_reason=%s，tokens=%s）。'
                               '可以稍后重试，或在 AI 接入配置里换一个模型。'
                          % (model, choice.get('finish_reason'), usage.get('total_tokens', '?')))
        # Keep a per-user transcript so the assistant panel can be reopened like
        # a chat app and superadmin can review what the agent was asked to do.
        last_user = next((item['content'] for item in reversed(messages) if item['role'] == 'user'), '')
        if last_user:
            self.record_agent_message(user['id'], 'user', last_user)
        self.record_agent_message(user['id'], 'assistant', content)
        return {'content': content, 'model': result.get('model', model),
                'usage': result.get('usage'), 'finishReason': choice.get('finish_reason')}

    def execute_agent_action(self, user, data):
        """Execute a model-proposed business action after explicit confirmation.

        Only superadmin may drive the operator agent; members are read-only and
        are rejected here even if a client forges the confirmation flag.
        """
        if not user.get('admin'):
            raise Problem(403, '只有管理员账户的 Agent 可以执行操作，成员仅可查询')
        action = str(data.get('action') or '').strip()
        tool = AGENT_ACTION_TO_TOOL.get(action)
        if not tool:
            raise Problem(400, 'Agent 不支持该业务操作')
        capability = self.authorize_agent_tool(user, tool)
        if capability['requiresConfirmation'] and not bool(data.get('confirmed')):
            return {'requiresConfirmation': True, 'action': action, 'tool': tool}
        payload = data.get('data') if isinstance(data.get('data'), dict) else {}
        result = self._action(user, action, payload)
        self.record_agent_message(user['id'], 'action', f'已执行：{action}', {
            'action': action, 'data': payload})
        return result

    def record_agent_message(self, user_id, role, content, extra=None):
        """Persist one line of the embedded assistant transcript.

        The record is scoped to a user so the chat history can be reopened and
        so superadmin can review what the agent did on someone's behalf.
        """
        record = {'id': uid(), 'user': user_id, 'role': role,
                  'content': str(content or '')[:12000], 'createdAt': timestamp()}
        if isinstance(extra, dict):
            record.update(extra)
        return self.put('agent_messages', record)

    def agent_history(self, user, data):
        """Return the stored assistant transcript for one account."""
        target = str(data.get('userId') or user['id'])
        if target != user['id']:
            self.admin(user)
        rows = [m for m in self.all('agent_messages') if m.get('user') == target]
        # all() already returns rows in insertion (rowid) order, which is the
        # chronological transcript even when several records share a timestamp.
        return {'userId': target, 'messages': rows[-400:]}

    def create_user(self, id, password, admin=False, role=None):
        if not id.isalnum() or not 3 <= len(id) <= 30 or len(password) < 6:
            raise Problem(400, '账户需为 3–30 位字母数字，密码至少 6 位')
        if role is None:
            role = 'superadmin' if admin else 'member'
        if role not in ('superadmin', 'admin', 'member'):
            raise Problem(400, '角色无效')
        salt = secrets.token_hex(16)
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        try:
            self.db.execute('INSERT INTO users(id,salt,hash,admin,role) VALUES(?,?,?,?,?)',
                            (id, salt, digest, int(role in ('superadmin', 'admin')), role))
        except sqlite3.IntegrityError:
            raise Problem(409, '账户已存在')
        self.db.commit()

    def hash_password(self, password, salt=None):
        salt = salt or secrets.token_hex(16)
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return salt, digest

    def check_password(self, id, password):
        r = self.db.execute('SELECT salt,hash FROM users WHERE id=?', (id,)).fetchone()
        salt = bytes.fromhex(r['salt']) if r else b'no-such-user-salt'
        digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
        return bool(r) and hmac.compare_digest(digest, r['hash'])

    def set_password(self, id, password):
        if len(password) < 6:
            raise Problem(400, '密码至少 6 位')
        salt, digest = self.hash_password(password)
        with self.lock, self.db:
            self.db.execute('UPDATE users SET salt=?,hash=? WHERE id=?', (salt, digest, id))

    def login(self, id, password):
        with self.lock, self.db:
            r = self.db.execute('SELECT * FROM users WHERE id=? AND active=1', (id,)).fetchone()
            salt = bytes.fromhex(r['salt']) if r else b'no-such-user-salt'
            digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
            if not r or not hmac.compare_digest(digest, r['hash']):
                raise Problem(401, '账户或密码错误')
            token = secrets.token_urlsafe(32)
            self.db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), id, (now()+timedelta(days=7)).isoformat()))
            return token

    def authenticate(self, token):
        with self.lock:
            r = self.db.execute('SELECT user_id,expires FROM sessions WHERE token=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
            if not r or datetime.fromisoformat(r['expires']) <= now():
                raise Problem(401, '请登录工作台')
            return self.user(r['user_id'])

    def notify(self, to, title, body, kind='task', reference=None):
        if not any(u['id']==to for u in self.users()):raise Problem(404,'通知接收账户不存在')
        return self.put('notifications', {'to':to, 'title':title, 'body':body, 'kind':kind, 'reference':reference, 'read':False, 'createdAt':timestamp()})

    def audit(self, actor, action, details):
        self.put('audit', {'actor':actor, 'action':action, 'details':details, 'createdAt':timestamp()})

    def can_view_project(self, user, p):
        if p.get('status') in ('done','archived'):
            return False
        if p.get('end') and p['end'] < now().date().isoformat():
            return False
        return bool(user['admin'] or p['owner']==user['id'] or p['creator']==user['id'] or p['members'].get(user['id'])=='accepted')

    def project_owner(self, user, p):
        if not user['admin'] and p['owner']!=user['id']:
            raise Problem(403, '只有项目 Owner 或 superadmin 可以操作')

    def project_tasks_complete(self, project_id):
        """Return whether every task lineage in a project has a completed leaf.

        Deferred and rejected records are historical occurrences. Their
        successor (via originId or reworkOf) is the record that must finish;
        otherwise an old deferred row would permanently block project closeout.
        """
        tasks=[t for t in self.all('tasks') if t.get('projectId')==project_id]
        if not tasks:
            return False
        by_id={t.get('id'):t for t in tasks if t.get('id')}
        groups={}
        for task in tasks:
            root=task.get('id'); parent=task.get('originId') or task.get('reworkOf'); seen=set()
            while parent and parent in by_id and parent not in seen:
                seen.add(parent); root=parent
                parent=by_id[parent].get('originId') or by_id[parent].get('reworkOf')
            groups.setdefault(root,[]).append(task)
        latest=[max(chain,key=lambda t:(str(t.get('date','')),str(t.get('createdAt','')))) for chain in groups.values()]
        return bool(latest) and all(t.get('status')=='done' for t in latest)

    def can_view_task(self, user, t):
        if not t.get('projectId'):
            return bool(user['admin'] or t['assignee']==user['id'])
        p = self.get('projects', t['projectId'])
        if p.get('status') in ('done','archived') or (p.get('end') and p['end'] < now().date().isoformat()):
            return False
        return bool(user['admin'] or (p['status'] not in ('pending','rejected') and (p['owner']==user['id'] or (t['assignee']==user['id'] and p['members'].get(user['id'])=='accepted'))))

    def performer(self, user, t):
        if user.get('admin'):
            raise Problem(403, 'superadmin 账号仅用于看板、审批和调度')
        if not self.can_view_task(user, t) or t['assignee']!=user['id']:
            raise Problem(403, '只能记录自己的任务')
        if t['status'] in ('done','deferred','skipped','pending_approval','rejected'):
            raise Problem(409, '本次任务已记录，不能重复提交')

    def task_approver(self, task):
        """Return the account that must approve a submitted task."""
        # superadmin's own work has no higher approver.
        if task.get('assignee') == 'superadmin':
            return None
        pid = task.get('projectId')
        if not pid:
            return 'superadmin'
        project = self.get('projects', pid)
        # Every project task is approved by that project's Owner. Project
        # closure itself is the separate superadmin approval boundary.
        return project.get('owner')

    def task_edit_approver(self, task):
        """Return the account that must approve a requested task change."""
        # Editing an Owner's own task still requires superadmin review; the
        # task-completion approval rule above is intentionally independent.
        if task.get('assignee') == 'superadmin':
            return None
        pid = task.get('projectId')
        if not pid:
            return 'superadmin'
        project = self.get('projects', pid)
        return 'superadmin' if task.get('assignee') == project.get('owner') else project.get('owner')

    def _task_edit_changes(self, task, data):
        """Normalize and validate the editable task fields without mutating task."""
        raw = data.get('changes') if isinstance(data.get('changes'), dict) else data
        allowed = ('name', 'desc', 'date', 'time', 'duration', 'assignee', 'priority', 'deadline')
        changes = {k: raw[k] for k in allowed if k in raw}
        if not changes:
            raise Problem(400, '请填写至少一项要修改的任务内容')
        result = {}
        if 'name' in changes:
            result['name'] = required(changes, 'name')
        if 'desc' in changes:
            result['desc'] = str(changes.get('desc', ''))
        if 'date' in changes:
            result['date'] = valid_date(changes['date'])
        if 'time' in changes:
            result['time'] = str(changes['time']).strip() or task.get('time', '09:00')
        if 'duration' in changes:
            result['duration'] = duration(changes['duration'])
        if 'assignee' in changes:
            result['assignee'] = str(changes['assignee']).strip()
            self.user(result['assignee'])
        if 'priority' in changes:
            result['priority'] = str(changes['priority'])
            if result['priority'] not in ('P0', 'P1', 'P2'):
                raise Problem(400, '优先级无效')
        if 'deadline' in changes:
            value = changes['deadline']
            result['deadline'] = valid_date(value) if value else None
        if task.get('projectId'):
            project = self.get('projects', task['projectId'])
            proposed_date = result.get('date', task.get('date'))
            if project.get('status') != 'active':
                raise Problem(409, '只能调整进行中项目的任务')
            if project.get('start') and proposed_date < project['start']:
                raise Problem(400, '任务日期不能早于项目开始日期')
            if project.get('end') and proposed_date > project['end']:
                raise Problem(400, '任务日期不能晚于项目截止日期')
            if project.get('end') and result.get('deadline') and result['deadline'] > project['end']:
                raise Problem(400, '任务期限不能晚于项目截止日期')
            proposed_assignee = result.get('assignee', task.get('assignee'))
            blocked = self.member_gate(project, proposed_assignee)
            if blocked:
                raise Problem(400, blocked)
        elif 'assignee' in result and result['assignee'] != task.get('assignee'):
            raise Problem(400, '无项目任务不能申请调整负责人')
        proposed_date = result.get('date', task.get('date'))
        proposed_deadline = result.get('deadline', task.get('deadline'))
        if proposed_deadline and proposed_date and proposed_deadline < proposed_date:
            raise Problem(400, '截止期限不能早于任务日期')
        return result

    def _approval_chain(self, task):
        root = task.get('originId') or task['id']
        return [t for t in self.all('tasks') if t['id'] == root or t.get('originId') == root]

    def _carry_task(self, task, target_day, reason='当日未完成，系统自动递延'):
        """Create one next-day occurrence while retaining the source record."""
        if task.get('projectId'):
            project = self.get('projects', task['projectId'])
            if project.get('status') != 'active' or (project.get('end') and target_day > project['end']):
                return None
        existing = next((x for x in self.all('tasks') if x.get('originId') == (task.get('originId') or task['id']) and x.get('date') == target_day), None)
        if existing:
            return existing
        carried_deadline = task.get('deadline')
        if carried_deadline and carried_deadline < target_day:
            carried_deadline = target_day
        # Preserve an in-progress task across automatic day rollover; manual
        # defer creates a fresh todo occurrence in the action handler below.
        copy = {**task, 'id': uid(), 'date': target_day,
                'originId': task.get('originId') or task['id'], 'fixed': False,
                'deadline': carried_deadline, 'createdAt': timestamp()}
        self.put('tasks', copy)
        self.put('logs', {'taskId': task['id'], 'actor': 'system', 'kind': 'defer', 'reason': reason,
                          'remaining': task.get('desc') or task.get('name'), 'target': target_day,
                          'nextTaskId': copy['id'], 'date': now().date().isoformat(), 'createdAt': timestamp()})
        return copy

    def invite(self, project):
        for member, status in project['members'].items():
            if status == 'pending':
                existing=next((r for r in self.all('requests') if r['projectId']==project['id'] and r['to']==member and r['status']=='pending'),None)
                request=existing or self.put('requests', {'projectId':project['id'],'to':member,'status':'pending','read':False,'createdAt':timestamp()})
                if not existing:
                    self.notify(member, '项目协作邀请', f'请确认加入「{project["name"]}」。接受后项目任务才进入你的日程。', 'request', project['id'])

    def member_gate(self, project, member):
        """Explain why `member` cannot take work here, phrased as a next step.

        The three states read very differently to whoever has to fix them, and
        the old single message ("负责人必须先接受项目邀请") was wrong for the
        most common one: a member who was never invited at all. The action name
        is included so the assistant can repair this by itself instead of
        handing the failure back to the user.
        """
        state = (project.get('members') or {}).get(member)
        name = project.get('name') or project['id']
        if state == 'accepted':
            return None
        fix = ('先用 project.invite 把 %s 加入「%s」（data:{"id":"%s","members":["%s"]}），'
               '再安排任务' % (member, name, project['id'], member))
        if state == 'pending':
            return '%s 还没确认「%s」的协作邀请，请%s。' % (member, name, fix)
        return '%s 还不是「%s」的成员，请%s。' % (member, name, fix)

    def assign_members(self, user, project, members):
        """Administrator assignments supersede any outstanding invitation."""
        self.admin(user)
        changed=[]
        for member in dict.fromkeys(members):
            self.user(member)
            if project['members'].get(member)=='accepted':continue
            project['members'][member]='accepted';changed.append(member)
            for r in self.all('requests'):
                if r['projectId']==project['id'] and r['to']==member and r['status']=='pending':
                    r.update(status='accepted',read=True,resolvedBy=user['id']);self.put('requests',r)
            for n in self.all('notifications'):
                if n['to']==member and n['kind']=='request' and n.get('reference')==project['id']:
                    n['read']=True;self.put('notifications',n)
            self.notify(member,'项目协作指派',f'superadmin 已将你加入「{project["name"]}」，已直接生效，可查看分配给你的项目任务。','project',project['id'])
        if changed and project['owner']!=user['id']:
            self.notify(project['owner'],'项目协作者已调整',f'superadmin 为「{project["name"]}」添加协作者：'+ '、'.join(changed)+'。','project',project['id'])
        self.put('projects',project)

    def make_task(self, user, data):
        name=required(data,'name'); day=valid_date(data.get('date',now().date().isoformat()))
        assignee=data.get('assignee',user['id']); self.user(assignee)
        pid=data.get('projectId') or None
        if not pid:raise Problem(400,'任务必须归属项目，请先选择项目')
        if pid:
            p=self.get('projects',pid);self.project_owner(user,p)
            if p['status']!='active':raise Problem(409,'项目「%s」还不是进行中状态，先用 project.review（data:{"id":"%s","accept":true}）审批通过，再安排任务'%(p['name'],p['id']))
            if p.get('end') and day>p['end']:raise Problem(400,'任务日期不能晚于项目截止日期')
            blocked=self.member_gate(p,assignee)
            if blocked:raise Problem(400,blocked)
        priority=data.get('priority','P1')
        if priority not in ('P0','P1','P2'):raise Problem(400,'优先级无效')
        task={'name':name,'desc':str(data.get('desc','')),'priority':priority,'projectId':pid,'duration':duration(data.get('duration',30)), 'date':day,'time':str(data.get('time','09:00')),'deadline':data.get('deadline') or None,'assignee':assignee,'status':'todo','fixed':False,'type':data.get('type','通用'),'createdAt':timestamp()}
        self.put('tasks',task)
        if assignee!=user['id']:self.notify(assignee,'收到任务指派',f'{user["id"]} 指派「{name}」，安排日期 {day}。','task',task['id'])
        return task

    def seed(self):
        with self.lock, self.db:
            for id in ('superadmin','test001','test002','test003'):
                password=secrets.token_urlsafe(12)
                self.initial_passwords[id]=password
                self.create_user(id,password,id=='superadmin')
            today=now().date(); day=today.isoformat()
            p=self.put('projects',{'name':'Work Calendar MVP','desc':'完成日程、任务和协作闭环','owner':'test001','creator':'superadmin','members':{'test001':'accepted','test002':'accepted','test003':'accepted'},'status':'active','priority':'P0','priorityLocked':False,'cycle':'range','start':day,'end':(today+timedelta(days=14)).isoformat(),'createdAt':timestamp()})
            admin=self.user('superadmin')
            for name,assignee,priority,mins,kind in [('核验周轴与悬停','test001','P0',90,'设计'),('测试任务完成与递延','test002','P1',45,'测试'),('检查收件箱隔离','test003','P1',40,'测试'),('整理项目日报','test001','P2',30,'文档')]:
                self.make_task(admin,{'name':name,'desc':'内置测试任务，可以实际完成、递延或调整负责人。','assignee':assignee,'priority':priority,'duration':mins,'type':kind,'projectId':p['id'],'date':day})
            self.audit('system','seed','创建四个核验账户与示例项目')

    def profile(self, user_id):
        completed=[l for l in self.all('logs') if l['kind']=='complete' and l['actor']==user_id]
        tasks=[t for t in self.all('tasks') if t['assignee']==user_id]
        estimates=sum(l.get('estimated',0) for l in completed); actual=sum(l.get('actual',0) for l in completed)
        ratio=round(actual/estimates,2) if estimates else None
        kinds={}
        for l in completed:kinds[l.get('type','通用')]=kinds.get(l.get('type','通用'),0)+1
        deferred=[l for l in self.all('logs') if l['kind']=='defer' and l['actor']==user_id]
        pending=sum(t['duration'] for t in tasks if t['status'] in ('todo','doing'))
        return {'user':user_id,'completed':len(completed),'ratio':ratio,'efficiency':'待观察' if ratio is None else ('良好' if ratio<=1 else '正常' if ratio<=1.5 else '需要关注'),'suitable':[k for k,v in kinds.items() if v>=3],'minutes':pending,'load':'低' if pending<240 else '中' if pending<=480 else '高','deferrals':len(deferred),'sources':completed+deferred,'corrections':[c for c in self.all('corrections') if c['user']==user_id]}

    def advance_due_tasks(self, at=None):
        """Promote scheduled work to in-progress when its start time arrives."""
        at = (at or now()).astimezone(TZ)
        changed = 0
        for task in self.all('tasks'):
            if task.get('assignee') == 'superadmin' or task.get('status') != 'todo' or not task.get('date'):
                continue
            try:
                day = date.fromisoformat(task['date'])
                clock = time.fromisoformat(str(task.get('time') or '09:00'))
            except (TypeError, ValueError):
                continue
            if datetime.combine(day, clock, TZ) > at:
                continue
            if task.get('projectId'):
                project = self.get('projects', task['projectId'])
                if project.get('status') != 'active' or (project.get('end') and project['end'] < at.date().isoformat()):
                    continue
            task['status'] = 'doing'
            self.put('tasks', task)
            self.put('logs', {'taskId': task['id'], 'actor': 'system', 'kind': 'auto_start',
                              'createdAt': timestamp(), 'date': at.date().isoformat()})
            if task.get('projectId'):
                project = self.get('projects', task['projectId'])
                if project.get('owner') and project['owner'] != task.get('assignee'):
                    self.notify(project['owner'], '项目任务自动开始',
                                f'{task.get("assignee")} 的「{task.get("name", "") }」已到开始时间，状态自动更新为进行中。',
                                'progress', task['id'])
            changed += 1
        return changed

    def snapshot(self, user):
        with self.lock, self.db:
            self.advance_due_tasks()
            self.reconcile_task_approvals()
            projects=[p for p in self.all('projects') if self.can_view_project(user,p)]
            tasks=[t for t in self.all('tasks') if self.can_view_task(user,t)]
            ids={t['id'] for t in tasks}; pids={p['id'] for p in projects}
            reports=[r for r in self.all('reports') if r['author']==user['id'] or user['admin'] or (r.get('projectId') and self.get('projects',r['projectId'])['owner']==user['id'])]
            # Personal diaries are private to their author; superadmin can browse
            # every member notebook from the diary dashboard.
            diaries=[d for d in self.all('diaries') if user['admin'] or d.get('author')==user['id']]
            edit_requests=[r for r in self.all('edit_requests') if user['admin'] or r.get('requester')==user['id'] or r.get('approver')==user['id']]
            automation=next((x.get('value',{}) for x in self.all('settings') if x.get('id')=='automation'),{})
            return {'user':user,'users':self.users(),'today':now().date().isoformat(),'projects':projects,'tasks':tasks,'logs':[l for l in self.all('logs') if l['taskId'] in ids],'workCompletions':self.work_completions(user),'achievements':self.achievements(user),'repeats':[r for r in self.all('repeats') if user['admin'] or user['id'] in r['assignees']],'reports':reports,'diaries':diaries,'diaryStats':self.diary_statistics(user),'notifications':[n for n in self.all('notifications') if n['to']==user['id'] and '12:00 初稿' not in str(n.get('title',''))], 'requests':[r for r in self.all('requests') if r['to']==user['id']], 'editRequests':edit_requests, 'suggestions':[s for s in self.all('suggestions') if s['projectId'] in pids and (user['admin'] or self.get('projects',s['projectId'])['owner']==user['id'])], 'profiles':[self.profile(u['id']) for u in self.users() if user['admin'] or u['id']==user['id'] or any(p['owner']==user['id'] and u['id'] in p['members'] for p in projects)], 'collectionSettings':automation, 'automation':automation, 'agentCapabilities':self.agent_capabilities(user), 'audit':self.all('audit')[-60:] if user['admin'] else []}

    def diary_statistics(self, viewer, start=None, end=None):
        """Return daily completion/load summaries for the diary dashboard.

        Members receive only their own rows.  Superadmin receives one row per
        active account, which powers the notebook cabinet and the daily log.
        The calculation is intentionally derived from tasks so it remains
        correct even before the nightly collector has run.
        """
        today=now().date()
        start=date.fromisoformat(start) if start else today-timedelta(days=31)
        end=date.fromisoformat(end) if end else today
        accounts=[u['id'] for u in self.users() if u['active'] and (viewer['admin'] or u['id']==viewer['id'])]
        projects={p['id']:p for p in self.all('projects') if self.can_view_project(viewer,p)}
        tasks=self.all('tasks')
        rows=[]
        day=start
        while day<=end:
            ds=day.isoformat()
            for account in accounts:
                assigned=[t for t in tasks if t.get('assignee')==account and t.get('date')==ds and (not t.get('projectId') or t.get('projectId') in projects)]
                scheduled=[t for t in assigned if t.get('status')!='skipped']
                done=[t for t in scheduled if t.get('status')=='done']
                by_project=[]
                for pid,p in projects.items():
                    pt=[t for t in assigned if t.get('projectId')==pid and t.get('status')!='skipped']
                    if pt: by_project.append({'projectId':pid,'project':p.get('name',''),'completed':sum(t.get('status')=='done' for t in pt),'total':len(pt)})
                rows.append({'date':ds,'userId':account,'completed':len(done),'total':len(scheduled),'load':sum(int(t.get('duration',0) or 0) for t in done),'loadTotal':sum(int(t.get('duration',0) or 0) for t in scheduled),'loadRatio':(len(done)/len(scheduled) if scheduled else 0),'projects':by_project})
            day+=timedelta(days=1)
        return rows

    def work_completions(self, viewer):
        """Return deduplicated real task/project completion events for the log."""
        events=[]; seen=set(); projects={p['id']:p for p in self.all('projects')}
        logs=self.all('logs')
        groups={}
        for task in self.all('tasks'):
            if not viewer['admin'] and task.get('assignee')!=viewer['id']: continue
            groups.setdefault(task.get('originId') or task.get('id'),[]).append(task)
        for root,chain in groups.items():
            ids={t.get('id') for t in chain}
            approvals=[l for l in logs if l.get('taskId') in ids and l.get('kind')=='approval' and l.get('decision')=='approved']
            completes=[l for l in logs if l.get('taskId') in ids and l.get('kind') in ('complete','complete_pending')]
            event=max(approvals or completes,key=lambda l:str(l.get('createdAt','')),default=None)
            task=max(chain,key=lambda t:(str(t.get('date','')),str(t.get('createdAt',''))))
            if not event and task.get('status')=='done': event={'createdAt':task.get('completedAt') or task.get('date','')+'T23:59:59+08:00'}
            if not event or root in seen: continue
            seen.add(root);project=projects.get(task.get('projectId'))
            events.append({'kind':'task','taskId':task.get('id'),'projectId':task.get('projectId'),
                           'name':task.get('name',''),'assignee':task.get('assignee',''),
                           'projectName':project.get('name') if project else None,'completedAt':event.get('createdAt','')})
        for project in projects.values():
            if project.get('status')=='done' and (viewer['admin'] or project.get('owner')==viewer['id']) and project.get('completedAt'):
                events.append({'kind':'project','projectId':project.get('id'),'name':project.get('name',''),'owner':project.get('owner',''),'completedAt':project['completedAt']})
        return events

    def achievements(self, viewer):
        """Return the superadmin-only project成果库.

        Finished projects are intentionally removed from the normal calendar,
        timeline and project lists.  The成果库 is their durable read-only
        archive: each card contains the project lifecycle and a de-duplicated
        task summary so deferred/rework occurrences do not inflate progress.
        Members receive an empty collection and therefore cannot discover
        another member's completed projects through the state endpoint.
        """
        if not viewer.get('admin'):
            return []
        all_tasks = self.all('tasks')
        result = []
        for project in self.all('projects'):
            if project.get('status') not in ('done', 'archived') and not project.get('completedAt'):
                continue
            tasks = [t for t in all_tasks if t.get('projectId') == project.get('id')]
            # Collapse deferred/rejected/rework occurrences into one logical
            # task chain, matching project_tasks_complete's closeout rules.
            by_id = {t.get('id'): t for t in tasks if t.get('id')}
            groups = {}
            for task in tasks:
                root = task.get('id'); parent = task.get('originId') or task.get('reworkOf'); seen = set()
                while parent and parent in by_id and parent not in seen:
                    seen.add(parent); root = parent
                    parent = by_id[parent].get('originId') or by_id[parent].get('reworkOf')
                groups.setdefault(root, []).append(task)
            leaves = [max(chain, key=lambda t: (str(t.get('date', '')), str(t.get('createdAt', '')))) for chain in groups.values()]
            counts = {
                'total': len(leaves),
                'completed': sum(t.get('status') == 'done' for t in leaves),
                'deferred': sum(t.get('status') == 'deferred' for t in leaves),
                'pending': sum(t.get('status') not in ('done', 'deferred', 'skipped') for t in leaves),
                'minutes': sum(int(t.get('duration', 0) or 0) for t in leaves),
            }
            lifecycle = []
            created = project.get('createdAt')
            if created:
                lifecycle.append({'stage': 'created', 'label': '项目创建', 'at': created, 'actor': project.get('creator')})
            activated = project.get('activatedAt') or project.get('approvedAt')
            if activated:
                lifecycle.append({'stage': 'active', 'label': '审批通过并启动', 'at': activated, 'actor': project.get('approvedBy', 'superadmin')})
            requested = project.get('completionRequestedAt')
            if requested:
                lifecycle.append({'stage': 'pending_completion', 'label': '提交结项审批', 'at': requested, 'actor': project.get('completionRequestedBy')})
            completed = project.get('completedAt')
            if completed:
                lifecycle.append({'stage': 'done', 'label': '项目完成', 'at': completed, 'actor': project.get('completedBy', 'superadmin')})
            # Keep the business lifecycle order even when seeded/test data has
            # timestamps that are out of chronological order.
            lifecycle.sort(key=lambda item: {'created': 0, 'active': 1,
                                             'pending_completion': 2, 'done': 3}.get(item.get('stage'), 99))
            result.append({
                'id': project.get('id'), 'name': project.get('name', ''),
                'desc': project.get('desc', ''), 'owner': project.get('owner'),
                'creator': project.get('creator'), 'members': project.get('members', {}),
                'status': project.get('status'), 'priority': project.get('priority'),
                'cycle': project.get('cycle'), 'start': project.get('start'),
                'end': project.get('end'), 'createdAt': created,
                'completionRequestedAt': requested, 'completionRequestedBy': project.get('completionRequestedBy'),
                'completedAt': completed, 'completedBy': project.get('completedBy'),
                'completionReport': project.get('completionReport', ''),
                'completionRejection': project.get('completionRejection'),
                'taskStats': counts, 'lifecycle': lifecycle,
                'tasks': [{'id': t.get('id'), 'name': t.get('name', ''), 'assignee': t.get('assignee'),
                           'status': t.get('status'), 'date': t.get('date'), 'completedAt': t.get('completedAt')}
                          for t in leaves],
            })
        return sorted(result, key=lambda item: str(item.get('completedAt') or item.get('createdAt') or ''), reverse=True)

    def action(self, user, action, data):
        with self.lock, self.db:
            result=self._action(user,action,data)
            # Never persist credentials or chat message bodies in the audit log.
            self.audit(user['id'], action, {k:v for k,v in data.items()
                                            if k not in ('password', 'apiKey', 'messages')})
            return result or {'ok':True}

    def reconcile_task_approvals(self):
        """Keep persisted pending approvals and inbox delivery in sync with the Owner.

        Called inside the snapshot transaction. This repairs pre-existing requests
        after a routing change and missing notices, without resubmitting tasks.
        """
        tasks = self.all('tasks')
        projects = {p['id']: p for p in self.all('projects')}
        groups = {}
        for task in tasks:
            if task.get('status') != 'pending_approval':
                continue
            project = projects.get(task.get('projectId'))
            if task.get('projectId') and (not project or project.get('status') != 'active' or
                                         (project.get('end') and project['end'] < now().date().isoformat())):
                continue
            groups.setdefault(task.get('originId') or task['id'], []).append(task)
        notifications = self.all('notifications')
        for root, pending in groups.items():
            task = max(pending, key=lambda t: (t.get('date', ''), t.get('createdAt', '')))
            approver = self.task_approver(task)
            if not approver:
                continue
            changed = False
            for item in pending:
                approval = item.get('approval') or {}
                if approval.get('approver') != approver or approval.get('status') != 'pending':
                    item['approval'] = {**approval, 'approver': approver, 'status': 'pending'}
                    self.put('tasks', item)
                    changed = True
            ids = {t['id'] for t in tasks if t['id'] == root or t.get('originId') == root}
            notices = [n for n in notifications if n.get('kind') == 'task_approval' and
                       n.get('title') == '任务完成待审批' and n.get('reference') in ids]
            notice = next((n for n in notices if n.get('to') == approver), None)
            if notice is None and notices:
                notice = notices[0]
                previous = notice['to']
                notice.update(to=approver, read=False)
                self.put('notifications', notice)
                self.audit('system', 'task.approval_reroute', {'taskId': task['id'], 'from': previous, 'to': approver})
            elif notice is None:
                summary = task.get('completionSummary') or (task.get('approval') or {}).get('summary', '')
                notice = self.notify(approver, '任务完成待审批',
                                     f'{task["assignee"]} 提交「{task["name"]}」完成总结，请审批。\n完成总结：{summary}',
                                     'task_approval', task['id'])
            elif changed:
                notice['read'] = False
                self.put('notifications', notice)
            for duplicate in notices:
                if duplicate['id'] != notice['id']:
                    duplicate.update(kind='task_approval_superseded', read=True)
                    self.put('notifications', duplicate)

    def _action(self, user, action, d):
        if action=='achievement.read':
            return self.achievements(user)
        if action=='agent.capabilities':
            return self.agent_capabilities(user)
        if action=='agent.authorize':
            return self.authorize_agent_tool(user, d.get('tool'))
        if action=='agent.config.get':
            return self.llm_config(user)
        if action=='agent.config.set':
            return self.set_llm_config(user, d)
        if action=='agent.chat':
            return self.llm_chat(user, d)
        if action=='agent.execute':
            return self.execute_agent_action(user, d)
        if action=='agent.history':
            return self.agent_history(user, d)
        if action=='agent.history.clear':
            target=str(d.get('userId') or user['id'])
            if target!=user['id']:
                self.admin(user)
            with self.lock,self.db:
                for message in self.all('agent_messages'):
                    if message.get('user')==target:
                        self.db.execute('DELETE FROM agent_messages WHERE id=?',(message['id'],))
            self.audit(user['id'],'agent.history.clear',{'target':target})
            return {'cleared':True,'userId':target}
        if action=='account.profile':
            # 中文名称 is the formal name the superadmin group assigns; 昵称 is
            # the holder's own choice and is edited through profile.self.
            self.superadmin(user)
            target=required(d,'id')
            if not any(x['id']==target for x in self.users()):
                raise Problem(404,'账户不存在')
            display_name=str(d.get('displayName') or '').strip()[:24]
            with self.lock,self.db:
                self.db.execute('UPDATE users SET display_name=? WHERE id=?',(display_name,target))
            self.audit(user['id'],'account.profile',{'target':target,'displayName':display_name})
            return {'id':target,'displayName':display_name}
        if action=='profile.self':
            # Members may always rename themselves and pick an avatar; both are
            # display-only and never touch task ownership or permissions.
            nickname=str(d.get('nickname') or '').strip()[:24]
            avatar=str(d.get('avatar') or '')
            if avatar and not avatar.startswith('data:image/'):
                raise Problem(400,'头像格式无效')
            if len(avatar)>160000:
                raise Problem(400,'头像文件过大，请换一张更小的图片')
            with self.lock,self.db:
                self.db.execute('UPDATE users SET nickname=?,avatar=? WHERE id=?',(nickname,avatar,user['id']))
            self.audit(user['id'],'profile.self',{'nickname':nickname})
            return {'id':user['id'],'nickname':nickname,'avatar':avatar}
        if action=='account.create':
            # Only the superadmin group manages accounts and roles.
            self.superadmin(user)
            username=required(d,'username');password=required(d,'password')
            role=str(d.get('role') or ('superadmin' if d.get('admin') else 'member'))
            self.create_user(username,password,role=role)
            display_name=str(d.get('displayName') or '').strip()[:24]
            if display_name:
                with self.lock,self.db:
                    self.db.execute('UPDATE users SET display_name=? WHERE id=?',(display_name,username))
            self.audit(user['id'],'account.create',{'target':username,'role':role,'displayName':display_name})
            return
        if action=='account.toggle':
            self.superadmin(user)
            row=self.db.execute('SELECT admin,role FROM users WHERE id=?',(d['id'],)).fetchone()
            if not row:raise Problem(404,'账户不存在')
            active=int(bool(d['active']))
            if not active and row['role']=='superadmin':
                # The last active superadmin must stay usable, otherwise no
                # account could manage roles or reset passwords.
                others=self.db.execute("SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1 AND id<>?",(d['id'],)).fetchone()['n']
                if others==0:raise Problem(400,'不能停用最后一个 superadmin')
            self.db.execute('UPDATE users SET active=? WHERE id=?',(active,d['id']))
            self.audit(user['id'],'account.toggle',{'target':d['id'],'active':bool(active)})
            return
        if action=='account.role':
            # superadmin-only: move an account between the superadmin, admin and
            # member groups without touching its data or password.
            self.superadmin(user)
            target=str(d.get('id') or '').strip()
            role=str(d.get('role') or '').strip()
            if role not in ('superadmin','admin','member'):
                raise Problem(400,'角色无效')
            row=self.db.execute('SELECT role,active FROM users WHERE id=?',(target,)).fetchone()
            if not row:raise Problem(404,'账户不存在')
            if row['role']=='superadmin' and role!='superadmin':
                others=self.db.execute("SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1 AND id<>?",(target,)).fetchone()['n']
                if others==0:raise Problem(400,'不能撤销最后一个 superadmin')
            self.db.execute('UPDATE users SET admin=?,role=? WHERE id=?',(int(role in ('superadmin','admin')),role,target))
            self.audit(user['id'],'account.role',{'target':target,'role':role})
            return
        if action=='account.admin':
            # Backwards-compatible alias for granting/revoking the superadmin group.
            self.superadmin(user)
            target=str(d.get('id') or '').strip()
            row=self.db.execute('SELECT role,active FROM users WHERE id=?',(target,)).fetchone()
            if not row:raise Problem(404,'账户不存在')
            role='superadmin' if bool(d.get('admin')) else 'member'
            if row['role']=='superadmin' and role!='superadmin':
                others=self.db.execute("SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1 AND id<>?",(target,)).fetchone()['n']
                if others==0:raise Problem(400,'不能撤销最后一个 superadmin')
            self.db.execute('UPDATE users SET admin=?,role=? WHERE id=?',(int(role in ('superadmin','admin')),role,target))
            self.audit(user['id'],'account.admin',{'target':target,'role':role})
            return
        if action=='account.delete':
            # Destructive and irreversible, superadmin-only, with the same typed
            # confirmation as project deletion.  Safe mode refuses to remove an
            # account that still owns active work, so nothing is left pointing
            # at a missing member; historical (done/archived) records are kept.
            self.superadmin(user)
            target=str(d.get('id') or '').strip()
            if target=='superadmin':
                raise Problem(400,'内置 superadmin 账户不能删除')
            if target==user['id']:
                raise Problem(400,'不能删除当前登录账户')
            row=self.db.execute('SELECT role,active FROM users WHERE id=?',(target,)).fetchone()
            if not row:raise Problem(404,'账户不存在')
            if row['role']=='superadmin':
                others=self.db.execute("SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1 AND id<>?",(target,)).fetchone()['n']
                if others==0:raise Problem(400,'不能删除最后一个 superadmin')
            if str(d.get('confirm','')).strip()!=target:
                raise Problem(400,'请输入完整的账户名以确认删除')
            terminal_tasks=('done','deferred','skipped','rejected')
            owned=[p['name'] for p in self.all('projects') if p.get('owner')==target and p.get('status') not in ('done','archived','rejected')]
            assigned=[t for t in self.all('tasks') if t.get('assignee')==target and t.get('status') not in terminal_tasks]
            active_repeats=[r for r in self.all('repeats') if r.get('active') and target in (r.get('assignees') or [])]
            pending_suggestions=[s for s in self.all('suggestions') if s.get('status')=='pending' and s.get('assignee')==target]
            pending_edits=[e for e in self.all('edit_requests') if e.get('status')=='pending' and e.get('requester')==target]
            blockers=[]
            if owned:blockers.append(f'仍负责 {len(owned)} 个进行中的项目（'+ '、'.join(owned[:5]) +'）')
            if assigned:blockers.append(f'仍有 {len(assigned)} 项未完成任务')
            if active_repeats:blockers.append(f'仍在 {len(active_repeats)} 条固定任务规则中')
            if pending_suggestions:blockers.append(f'有 {len(pending_suggestions)} 条待处理的分配建议')
            if pending_edits:blockers.append(f'有 {len(pending_edits)} 条待审批的任务修改申请')
            if blockers:
                raise Problem(409,'请先转交该账户的职责后再删除：'+ '；'.join(blockers))
            with self.lock,self.db:
                self.db.execute('DELETE FROM users WHERE id=?',(target,))
                self.db.execute('DELETE FROM sessions WHERE user_id=?',(target,))
                for message in self.all('agent_messages'):
                    if message.get('user')==target:self.db.execute('DELETE FROM agent_messages WHERE id=?',(message['id'],))
                for diary in self.all('diaries'):
                    if diary.get('author')==target:self.db.execute('DELETE FROM diaries WHERE id=?',(diary['id'],))
                for notice in self.all('notifications'):
                    if notice.get('to')==target:self.db.execute('DELETE FROM notifications WHERE id=?',(notice['id'],))
                for request in self.all('requests'):
                    if request.get('to')==target:self.db.execute('DELETE FROM requests WHERE id=?',(request['id'],))
                for repeat in self.all('repeats'):
                    if target in (repeat.get('assignees') or []):
                        repeat['assignees']=[a for a in repeat['assignees'] if a!=target]
                        if repeat['assignees']:self.put('repeats',repeat)
                        else:self.db.execute('DELETE FROM repeats WHERE id=?',(repeat['id'],))
                for project in self.all('projects'):
                    if target in (project.get('members') or {}):
                        project['members'].pop(target,None);self.put('projects',project)
            self.audit(user['id'],'account.delete',{'target':target})
            return {'id':target,'deleted':True}
        if action=='project.create':
            owner=d.get('owner',user['id']) if user['admin'] else user['id'];self.user(owner)
            members={m:'pending' for m in d.get('members',[]) if m!=owner};members[owner]='accepted'
            for m in members:self.user(m)
            cycle=d.get('cycle','infinite');
            if cycle not in ('infinite','range','deadline'):raise Problem(400,'项目周期无效')
            priority=d.get('priority','P1')
            if priority not in ('P0','P1','P2'):raise Problem(400,'优先级无效')
            start=valid_date(d['start']) if d.get('start') else now().date().isoformat();end=valid_date(d['end']) if d.get('end') else None
            if end and end<start:raise Problem(400,'结束日期不能早于开始日期')
            if cycle!='infinite' and not end:raise Problem(400,'请填写项目截止日期')
            created_at=timestamp()
            p=self.put('projects',{'name':required(d,'name'),'desc':str(d.get('desc','')),'owner':owner,'creator':user['id'],'members':members,'status':'active' if user['admin'] else 'pending','priority':priority,'priorityLocked':False,'cycle':cycle,'start':start,'end':end,'createdAt':created_at, **({'activatedAt':created_at,'approvedBy':user['id']} if user['admin'] else {})})
            if user['admin']:
                self.assign_members(user,p,[m for m in members if m!=owner])
                if owner!=user['id']:self.notify(owner,'项目 Owner 指派',f'superadmin 指定你负责「{p["name"]}」，可在项目下创建和分配任务。','project',p['id'])
            else:self.notify('superadmin','项目审批申请',f'{user["id"]} 申请创建「{p["name"]}」。','approval',p['id'])
            return p
        if action=='project.delete':
            # Destructive and irreversible: allowed for superadmin and the
            # project owner, and only when the caller echoes the exact project
            # name so an accidental click cannot erase a project.  The cascade
            # removes the project's tasks and every record that pointed at the
            # project or those tasks.
            p=self.get('projects',d.get('id'))
            self.project_owner(user,p)
            if str(d.get('confirm','')).strip()!=p['name']:
                raise Problem(400,'请输入完整的项目名称以确认删除')
            tasks=[t for t in self.all('tasks') if t.get('projectId')==p['id']]
            task_ids={t['id'] for t in tasks}
            counts={'tasks':len(tasks),'done':len([t for t in tasks if t.get('status')=='done'])}
            with self.lock,self.db:
                for t in tasks:
                    self.db.execute('DELETE FROM tasks WHERE id=?',(t['id'],))
                for table in ('reports','suggestions','requests','edit_requests'):
                    for row in self.all(table):
                        if row.get('projectId')==p['id'] or row.get('taskId') in task_ids:
                            self.db.execute(f'DELETE FROM {table} WHERE id=?',(row['id'],))
                for log in self.all('logs'):
                    if log.get('taskId') in task_ids:
                        self.db.execute('DELETE FROM logs WHERE id=?',(log['id'],))
                for notice in self.all('notifications'):
                    if notice.get('reference')==p['id'] or notice.get('reference') in task_ids:
                        self.db.execute('DELETE FROM notifications WHERE id=?',(notice['id'],))
                self.db.execute('DELETE FROM projects WHERE id=?',(p['id'],))
            self.audit(user['id'],'project.delete',{'project':p['name'],'projectId':p['id'],**counts})
            for member,status in (p.get('members') or {}).items():
                if member!=user['id'] and status=='accepted':
                    self.notify(member,'项目已删除',f'{user["id"]} 删除了项目「{p["name"]}」及其全部子任务。','project',None)
            return {'id':p['id'],'deleted':True,**counts}
        if action=='project.review':
            self.admin(user);p=self.get('projects',d['id'])
            if p['status']!='pending':raise Problem(409,'该申请已经处理')
            if d.get('accept'):
                p['status']='active';p['approvedAt']=timestamp();p['approvedBy']=user['id'];self.invite(p)
            else:p['status']='rejected';p['rejection']=required(d,'reason')
            self.put('projects',p);self.notify(p['creator'],'项目审批结果',f'「{p["name"]}」'+('已通过' if d.get('accept') else '被驳回：'+p['rejection']),'approval',p['id']);return p
        if action=='project.complete_request':
            p=self.get('projects',d['id']);self.project_owner(user,p)
            if p['status']!='active':raise Problem(409,'只有进行中的项目可以申请完成')
            if not self.project_tasks_complete(p['id']):
                raise Problem(409,'项目下所有子任务完成并审批通过后才能申请结项')
            report=required(d,'report')
            if len(report)>10000: raise Problem(400,'结项报告不能超过 10000 个字符')
            p['status']='pending_completion';p['completionReport']=report;p['completionRequestedBy']=user['id'];p['completionRequestedAt']=timestamp();self.put('projects',p)
            self.notify('superadmin','项目完成待审批',f'{user["id"]} 申请将项目「{p["name"]}」结项，请审批。\n结项报告：{report}','project_completion',p['id']);return p
        if action=='project.complete_review':
            self.admin(user);p=self.get('projects',d['id'])
            if p['status']!='pending_completion':raise Problem(409,'该项目没有待审批的完成申请')
            if d.get('accept'):
                p['status']='done';p['completedBy']=user['id'];p['completedAt']=timestamp()
            else:
                p['status']='active';p['completionRejection']=required(d,'reason')
            self.put('projects',p);self.notify(p['owner'],'项目完成审批结果',f'「{p["name"]}」'+('已完成' if d.get('accept') else '完成申请被驳回：'+p['completionRejection']),'project_completion',p['id']);return p
        if action=='project.invite':
            p=self.get('projects',d['id']);self.project_owner(user,p)
            if p['status']!='active':raise Problem(409,'项目「%s」还不是进行中状态，先用 project.review（data:{"id":"%s","accept":true}）审批通过，再新增协作者'%(p['name'],p['id']))
            members=list(dict.fromkeys(d.get('members',[])))
            members=[m for m in members if m!=p['owner']]
            if not members:raise Problem(400,'请选择要邀请的协作者')
            if user['admin']:
                self.assign_members(user,p,members);return p
            for member in members:
                self.user(member)
                if p['members'].get(member)=='accepted':continue
                p['members'][member]='pending'
            self.put('projects',p);self.invite(p);return p
        if action=='project.member_loads':
            p=self.get('projects',d['id']);self.project_owner(user,p)
            if p['status']!='active':raise Problem(409,'只能查看进行中项目的成员负载')
            start=p.get('start') or '0000-01-01';end=p.get('end') or '9999-12-31'
            active={u['id'] for u in self.users() if u.get('active') and not u.get('admin')}
            counts={member:0 for member in active if member!=p.get('owner')}
            for task in self.all('tasks'):
                member=task.get('assignee')
                if member in counts and start<=task.get('date','')<=end:counts[member]+=1
            return {'projectId':p['id'],'counts':counts}
        if action=='project.update':
            p=self.get('projects',d['id']);self.project_owner(user,p)
            if d.get('status')=='done' and not user['admin']:
                raise Problem(403,'项目完成需由 superadmin 审批')
            if 'owner' in d:
                self.admin(user);self.user(d['owner']);p['owner']=d['owner'];p['members'][d['owner']]='accepted'
            for k in ('desc','priority','priorityLocked','status','start','end'):
                if k in d:p[k]=d[k]
            if p['status'] not in ('active','paused','done','archived'):raise Problem(400,'不能绕过审批更改项目状态')
            if p['priority'] not in ('P0','P1','P2'):raise Problem(400,'优先级无效')
            p['start']=valid_date(p.get('start') or now().date().isoformat());p['end']=valid_date(p['end']) if p.get('end') else None
            if p['end'] and p['end']<p['start']:raise Problem(400,'结束日期不能早于开始日期')
            if p.get('cycle') not in ('infinite','range','deadline'):raise Problem(400,'项目周期无效')
            if p['cycle']!='infinite' and not p['end']:raise Problem(400,'有截止日期的项目必须填写结束日期')
            self.put('projects',p);return p
        if action=='request.respond':
            r=self.get('requests',d['id'])
            if r['to']!=user['id']:raise Problem(403,'只能处理自己的协作邀请')
            if r['status']!='pending':raise Problem(409,'邀请已经处理')
            p=self.get('projects',r['projectId'])
            if p['status']!='active':raise Problem(409,'项目当前不可加入')
            r['status']='accepted' if d.get('accept') else 'rejected';r['read']=True;p['members'][user['id']]=r['status'];self.put('projects',p);self.put('requests',r)
            for n in self.all('notifications'):
                if n['to']==user['id'] and n.get('kind')=='request' and n.get('reference')==p['id'] and not n.get('read'):n['read']=True;self.put('notifications',n)
            self.notify(p['owner'],'协作邀请结果',f'{user["id"]} '+('接受' if d.get('accept') else '拒绝')+f'加入「{p["name"]}」。','request',p['id']);return
        if action=='request.read':
            r=self.get('requests',d['id'])
            if r['to']!=user['id']:raise Problem(403,'不能更改其他用户的协作邀请')
            r['read']=True;self.put('requests',r);return r
        if action=='task.create':return self.make_task(user,d)
        if action=='task.delete':
            self.admin(user)
            task=self.get('tasks',d.get('id'))
            if task.get('repeatId') or task.get('fixed'):
                raise Problem(409,'固定安排请使用“挖空本次”，不能删除固定规则')
            if task.get('status') in ('pending_approval','awaiting_approval','submitted'):
                raise Problem(409,'待审批任务不能删除，请先完成审批')
            task_id=task['id']; assignee=task.get('assignee')
            self.db.execute('DELETE FROM tasks WHERE id=?',(task_id,))
            # Resolve any stale inbox cards that pointed at the removed task.
            for notice in self.all('notifications'):
                if notice.get('reference')==task_id and not notice.get('read'):
                    notice['read']=True;self.put('notifications',notice)
            if assignee and assignee!=user['id']:
                self.notify(assignee,'任务已删除',f'superadmin 删除了「{task.get("name","")}」。','task',task_id)
            return {'id':task_id,'deleted':True}
        if action=='task.edit_request':
            t=self.get('tasks', d.get('id'))
            if not self.can_view_task(user, t) or t.get('assignee') != user['id']:
                raise Problem(403, '只能申请修改自己负责的任务')
            if t.get('status') in ('pending', 'pending_approval', 'rejected', 'done', 'deferred', 'skipped'):
                raise Problem(409, '当前任务状态不允许申请修改')
            approver=self.task_edit_approver(t)
            if not approver:
                raise Problem(400, 'superadmin 的任务无需申请修改，可直接调整')
            if any(r.get('taskId')==t['id'] and r.get('status')=='pending' for r in self.all('edit_requests')):
                raise Problem(409, '该任务已有待审批的修改申请')
            changes=self._task_edit_changes(t, d)
            reason=required(d, 'reason')
            req=self.put('edit_requests', {'taskId':t['id'],'requester':user['id'],'approver':approver,
                                           'changes':changes,'reason':reason,'status':'pending','read':False,
                                           'createdAt':timestamp()})
            self.notify(approver, '任务修改待审批', f'{user["id"]} 申请修改「{t["name"]}」。\n修改理由：{reason}', 'task_edit_approval', req['id'])
            self.put('logs', {'taskId':t['id'],'actor':user['id'],'kind':'edit_request','requestId':req['id'],
                              'changes':changes,'reason':reason,'createdAt':timestamp(),'date':now().date().isoformat()})
            return req
        if action=='task.edit_review':
            req=self.get('edit_requests', d.get('id'))
            if req.get('status')!='pending':
                raise Problem(409, '该修改申请已经处理')
            if req.get('approver')!=user['id']:
                raise Problem(403, '只有指定审批人可以处理该修改申请')
            t=self.get('tasks', req['taskId'])
            if t.get('status') in ('pending', 'pending_approval', 'rejected', 'done', 'deferred', 'skipped'):
                raise Problem(409, '当前任务状态不允许修改')
            # Validate again at approval time so stale requests cannot bypass project/member rules.
            changes=self._task_edit_changes(t, req.get('changes') or {})
            for n in self.all('notifications'):
                if n.get('to')==user['id'] and n.get('kind')=='task_edit_approval' and n.get('reference')==req['id'] and not n.get('read'):
                    n['read']=True;self.put('notifications', n)
            if d.get('accept'):
                old=dict(t)
                t.update(changes)
                self.put('tasks', t)
                req.update(status='approved', reviewedBy=user['id'], reviewedAt=timestamp(), read=True)
                self.put('edit_requests', req)
                self.put('logs', {'taskId':t['id'],'actor':user['id'],'kind':'edit_approval','decision':'approved',
                                  'requestId':req['id'],'before':old,'after':t,'createdAt':timestamp(),
                                  'date':now().date().isoformat()})
                recipients={req['requester'], old.get('assignee'), t.get('assignee')}
                for recipient in sorted(x for x in recipients if x and x!=user['id']):
                    self.notify(recipient, '任务修改已通过', f'「{t["name"]}」的修改申请已由 {user["id"]} 通过，新的负责人：{t["assignee"]}，日期：{t["date"]}。', 'task_edit_approval', req['id'])
                return t
            reason=required(d, 'reason')
            req.update(status='rejected', rejection=reason, reviewedBy=user['id'], reviewedAt=timestamp(), read=True)
            self.put('edit_requests', req)
            self.put('logs', {'taskId':t['id'],'actor':user['id'],'kind':'edit_approval','decision':'rejected',
                              'requestId':req['id'],'reason':reason,'createdAt':timestamp(),
                              'date':now().date().isoformat()})
            self.notify(req['requester'], '任务修改被驳回', f'「{t["name"]}」的修改申请被 {user["id"]} 驳回。\n驳回理由：{reason}', 'task_edit_rejected', req['id'])
            return req
        if action=='task.start':
            t=self.get('tasks',d['id']);self.performer(user,t)
            if t.get('status')!='todo':
                raise Problem(409,'只有待开始任务可以标记为进行中')
            t['status']='doing'
            self.put('tasks',t)
            self.put('logs',{'taskId':t['id'],'actor':user['id'],'kind':'start','createdAt':timestamp(),'date':now().date().isoformat()})
            if t.get('projectId'):
                p=self.get('projects',t['projectId'])
                if p['owner']!=user['id']:
                    self.notify(p['owner'],'项目任务开始',f'{user["id"]} 已开始「{t["name"]}」。','progress',t['id'])
            return t
        if action=='task.update':
            t=self.get('tasks',d['id']);old=dict(t)
            if t.get('projectId'):
                project=self.get('projects',t['projectId']);self.project_owner(user,project)
                if project['status']!='active':raise Problem(409,'只能调整进行中项目的任务')
            elif not user['admin']:
                if t['assignee']!=user['id'] or d.get('assignee',t['assignee'])!=t['assignee']:raise Problem(403,'不能修改他人安排')
            if t['status'] in ('done','deferred','skipped','pending_approval','rejected'):raise Problem(409,'已归档任务不可调整')
            for k in ('name','desc','date','time','duration','assignee','priority','deadline','status'):
                if k in d:t[k]=d[k]
            t['name']=required(t,'name')
            t['date']=valid_date(t['date']);t['duration']=duration(t['duration']);self.user(t['assignee'])
            if t.get('deadline'):
                t['deadline']=valid_date(t['deadline'])
                if t['deadline'] < t['date']: raise Problem(400,'截止时间不能早于安排日期')
            if t.get('projectId'):
                project=self.get('projects',t['projectId'])
                if project.get('start') and t['date'] < project['start']: raise Problem(400,'任务日期不能早于项目开始日期')
                if project.get('end') and t['date']>project['end']:raise Problem(400,'任务日期不能晚于项目截止日期')
                if project.get('end') and t.get('deadline') and t['deadline']>project['end']: raise Problem(400,'任务期限不能晚于项目截止日期')
                blocked=self.member_gate(project,t['assignee'])
                if blocked:raise Problem(400,blocked)
            if t['priority'] not in ('P0','P1','P2') or t['status'] not in ('todo','doing'):raise Problem(400,'状态或优先级不合法')
            self.put('tasks',t);self.put('logs',{'taskId':t['id'],'actor':user['id'],'kind':'adjust','before':old,'after':t,'createdAt':timestamp(),'date':now().date().isoformat()})
            for recipient in {old['assignee'],t['assignee']}:
                if recipient!=user['id']:self.notify(recipient,'任务被调整',f'{user["id"]} 调整「{t["name"]}」：{old["assignee"]} → {t["assignee"]}，{old["date"]} → {t["date"]}。','task',t['id'])
            return t
        if action in ('task.complete','task.defer','task.skip'):
            t=self.get('tasks',d['id']);self.performer(user,t)
            log={'taskId':t['id'],'actor':user['id'],'date':t['date'],'createdAt':timestamp(),'estimated':t['duration'],'type':t['type']}
            if action=='task.complete':
                summary=required(d,'summary')
                approver=self.task_approver(t)
                log.update(kind='complete_pending' if approver else 'complete',summary=summary,actual=duration(d.get('actual')),feeling=d.get('feeling','一般'),followup=str(d.get('followup','')))
                t['completionSummary']=summary; t['completionActual']=log['actual']; t['completionFeeling']=log['feeling']; t['submittedAt']=timestamp()
                if approver:
                    t['status']='pending_approval'
                    t['approval']={'status':'pending','approver':approver,'summary':summary,'submittedBy':user['id'],'submittedAt':timestamp()}
                    self.notify(approver,'任务完成待审批',f'{user["id"]} 提交「{t["name"]}」完成总结，请审批。\n完成总结：{summary}','task_approval',t['id'])
                else:
                    t['status']='done'
            elif action=='task.defer':
                target=valid_date(d.get('date'))
                if target<=t['date']:raise Problem(400,'递延日期必须晚于原日期')
                if t.get('projectId'):
                    project=self.get('projects',t['projectId'])
                    if project.get('status')!='active':raise Problem(409,'只能递延进行中项目的任务')
                    if project.get('start') and target<project['start']:raise Problem(400,'递延日期不能早于项目开始日期')
                    if project.get('end') and target>project['end']:raise Problem(400,'递延日期不能晚于项目截止日期')
                carried_deadline=t.get('deadline')
                if carried_deadline and carried_deadline<target:
                    carried_deadline=target
                log.update(kind='defer',reason=required(d,'reason'),remaining=required(d,'remaining'),target=target);copy={**t,'id':uid(),'date':target,'status':'todo','fixed':False,'repeatId':None,'desc':log['remaining'],'duration':duration(d.get('duration',t.get('duration'))),'deadline':carried_deadline,'originId':t['id']};self.put('tasks',copy);log['nextTaskId']=copy['id'];t['status']='deferred'
            else:
                if not t['fixed']:raise Problem(400,'只有固定安排可以跳过本次')
                log.update(kind='skip',reason=str(d.get('reason','临时跳过')));t['status']='skipped'
            self.put('tasks',t);self.put('logs',log)
            if t.get('projectId'):
                p=self.get('projects',t['projectId'])
                if p['owner']!=user['id']:self.notify(p['owner'],'项目任务进度',f'{user["id"]} 将「{t["name"]}」记录为 {t["status"]}。'+json.dumps(log,ensure_ascii=False),'progress',t['id'])
            return t
        if action=='task.review':
            t=self.get('tasks',d['id'])
            if t.get('status')!='pending_approval':
                raise Problem(409,'该任务当前没有待审批记录')
            approver=self.task_approver(t)
            if t.get('projectId'):
                project=self.get('projects', t['projectId'])
                if project.get('status') != 'active' or (project.get('end') and project['end'] < now().date().isoformat()):
                    raise Problem(409,'项目已结束，任务审批已关闭')
            if not approver or user['id']!=approver:
                raise Problem(403,'只有指定审批人可以审批该任务')
            chain=self._approval_chain(t)
            # Resolve inbox cards for the approver as soon as a decision is made.
            for n in self.all('notifications'):
                if n.get('to') == user['id'] and n.get('kind') == 'task_approval' and n.get('reference') in {x['id'] for x in chain} and not n.get('read'):
                    n['read'] = True; self.put('notifications', n)
            if d.get('accept'):
                for item in chain:
                    if item.get('status')=='pending_approval':
                        item['status']='done';item['approval']={**item.get('approval',{}),'status':'approved','reviewedBy':user['id'],'reviewedAt':timestamp()};self.put('tasks',item);self.put('logs',{'taskId':item['id'],'actor':user['id'],'kind':'approval','decision':'approved','createdAt':timestamp(),'date':now().date().isoformat()})
                for recipient in sorted({item['assignee'] for item in chain}):
                    self.notify(recipient,'任务完成已通过',f'「{t["name"]}」已由 {user["id"]} 审批通过，任务已结束。','task_approval',t['id'])
                return self.get('tasks',t['id'])
            reason=required(d,'reason')
            for item in chain:
                if item.get('status')=='pending_approval':
                    item['status']='rejected';item['approval']={**item.get('approval',{}),'status':'rejected','reason':reason,'reviewedBy':user['id'],'reviewedAt':timestamp()};self.put('tasks',item);self.put('logs',{'taskId':item['id'],'actor':user['id'],'kind':'approval','decision':'rejected','reason':reason,'createdAt':timestamp(),'date':now().date().isoformat()})
            # A pending approval may have been carried across several days.
            # Rework must start after the latest occurrence and never land in
            # the past when the reviewer acts later.
            latest=max((x.get('date') for x in chain if x.get('date')), default=t['date'])
            minimum=(max(date.fromisoformat(latest), now().date())+timedelta(days=1)).isoformat()
            target=valid_date(d.get('date') or minimum)
            if target < minimum:
                raise Problem(400,'重做日期必须晚于当前待审批任务日期')
            if t.get('projectId'):
                project=self.get('projects',t['projectId'])
                if project.get('status')!='active':raise Problem(409,'项目已结束，不能创建驳回重做任务')
                if project.get('end') and target>project['end']:raise Problem(409,'项目截止日期已到，无法创建重做任务')
            retry={**t,'id':uid(),'name':'驳回重做：'+t['name'],'desc':reason,'date':target,'status':'todo','fixed':False,'originId':None,'reworkOf':t['id'],'approval':None,'createdAt':timestamp()}
            self.put('tasks',retry);self.notify(t['assignee'],'任务完成被驳回',f'「{t["name"]}」被 {user["id"]} 驳回，请于 {target} 重做。建议：{reason}','task_rejected',retry['id'])
            return retry

        if action=='repeat.create':
            self.admin(user);assignees=d.get('assignees',[])
            if not assignees:raise Problem(400,'请选择接收固定安排的成员')
            for a in assignees:self.user(a)
            start=valid_date(d.get('start'));end=valid_date(d['end']) if d.get('end') else None
            if end and end<start:raise Problem(400,'结束日期不能早于开始日期')
            frequency=d.get('frequency','weekly')
            if frequency not in ('daily','weekly','workdays','custom','dates','specific','monthly'):raise Problem(400,'重复周期无效')
            every=int(d.get('every',1))
            # `every` counts weeks for weekly rules (2 = 隔周执行) and days for
            # custom rules.
            if frequency=='weekly':
                if not 1<=every<=52:raise Problem(400,'周间隔应在 1–52 周内')
            elif not 1<=every<=366:raise Problem(400,'自定义间隔应在1–366天内')
            month_day=int(d.get('monthDay',1) or 1)
            if not 1<=month_day<=31:raise Problem(400,'每月执行日应在 1–31 号之间')
            span=int(d.get('span',1) or 1)
            if not 1<=span<=30:raise Problem(400,'持续天数应在 1–30 天内')
            weekdays=d.get('weekdays', d.get('days', []))
            if weekdays in (None, ''): weekdays=[]
            if not isinstance(weekdays,list): weekdays=[weekdays]
            try: weekdays=sorted(set(int(x) for x in weekdays))
            except (TypeError,ValueError): raise Problem(400,'每周日期必须是 0–6 的数字')
            if any(x<0 or x>6 for x in weekdays): raise Problem(400,'每周日期必须是 0–6 的数字')
            specific=d.get('dates', d.get('specificDates', [])) or []
            if not isinstance(specific,list): specific=[specific]
            specific=sorted(set(valid_date(x) for x in specific))
            skip_dates=d.get('skipDates', d.get('excludedDates', [])) or []
            if not isinstance(skip_dates,list): skip_dates=[skip_dates]
            skip_dates=sorted(set(valid_date(x) for x in skip_dates))
            if frequency in ('dates','specific') and not specific: raise Problem(400,'指定日期周期至少需要一个日期')
            r=self.put('repeats',{'name':required(d,'name'),'desc':d.get('desc',''),'assignees':assignees,'priority':d.get('priority','P1'),'duration':duration(d.get('duration',30)),'start':start,'end':end,'time':valid_clock(d.get('time','09:00')),'frequency':frequency,'every':every,'weekdays':weekdays,'monthDay':month_day,'span':span,'specificDates':specific,'skipDates':skip_dates,'active':True,'createdAt':timestamp()})
            self.materialize(now().date(), CALENDAR_END)
            for a in assignees:self.notify(a,'固定安排已发布',f'superadmin 发布「{r["name"]}」，周期 {frequency}，自 {start} 起。','repeat',r['id'])
            return r
        if action=='repeat.toggle':
            self.admin(user);r=self.get('repeats',d['id']);r['active']=bool(d['active']);self.put('repeats',r)
            for a in r['assignees']:self.notify(a,'固定安排调整',f'「{r["name"]}」已'+('启用' if r['active'] else '暂停')+'。','repeat',r['id'])
            return
        if action in ('repeat.update','repeat.skip','repeat.exception'):
            self.admin(user);r=self.get('repeats',d.get('id') or d.get('repeatId'))
            if action=='repeat.update':
                for key in ('name','desc','priority','active','time','frequency','every','monthDay','span'):
                    if key in d:r[key]=valid_clock(d[key]) if key=='time' else d[key]
                if 'name' in r:r['name']=required(r,'name')
                if r.get('priority','P1') not in ('P0','P1','P2'):raise Problem(400,'优先级无效')
                if r.get('frequency') not in ('daily','weekly','workdays','custom','dates','specific','monthly'):raise Problem(400,'重复周期无效')
                try:
                    r['every']=int(r.get('every',1))
                    r['monthDay']=int(r.get('monthDay',1) or 1)
                    r['span']=int(r.get('span',1) or 1)
                except (TypeError,ValueError):raise Problem(400,'周期参数无效')
                if r['frequency']=='weekly':
                    if not 1<=r['every']<=52:raise Problem(400,'周间隔应在 1–52 周内')
                elif not 1<=r['every']<=366:raise Problem(400,'自定义间隔应在1–366天内')
                if not 1<=r['monthDay']<=31:raise Problem(400,'每月执行日应在 1–31 号之间')
                if not 1<=r['span']<=30:raise Problem(400,'持续天数应在 1–30 天内')
                if 'weekdays' in d or 'days' in d:
                    vals=d.get('weekdays',d.get('days')) or []
                    if not isinstance(vals,list):vals=[vals]
                    try:r['weekdays']=sorted(set(int(x) for x in vals))
                    except (TypeError,ValueError):raise Problem(400,'每周日期必须是 0–6 的数字')
                    if any(x<0 or x>6 for x in r['weekdays']):raise Problem(400,'每周日期必须是 0–6 的数字')
                if 'dates' in d or 'specificDates' in d:
                    vals=d.get('dates',d.get('specificDates')) or []
                    if not isinstance(vals,list):vals=[vals]
                    r['specificDates']=sorted(set(valid_date(x) for x in vals))
                if r.get('frequency') in ('dates','specific') and not r.get('specificDates'):
                    raise Problem(400,'指定日期周期至少需要一个日期')
                if 'start' in d:r['start']=valid_date(d['start'])
                if 'end' in d:r['end']=valid_date(d['end']) if d.get('end') else None
                if r.get('end') and r['end']<r.get('start',''):raise Problem(400,'结束日期不能早于开始日期')
                self.put('repeats',r);self.materialize(now().date(), CALENDAR_END);return r
            day=valid_date(d.get('date') or d.get('day'))
            skip=bool(d.get('skip',True));dates=set(r.get('skipDates',[]))
            if skip: dates.add(day)
            else: dates.discard(day)
            r['skipDates']=sorted(dates);self.put('repeats',r)
            for task in self.all('tasks'):
                if task.get('repeatId')==r['id'] and task.get('date')==day and task.get('status') in ('todo','doing'):
                    task['status']='skipped' if skip else 'todo';task['skipReason']='superadmin 临时跳过本次' if skip else ''
                    self.put('tasks',task);self.put('logs',{'taskId':task['id'],'actor':user['id'],'kind':'skip' if skip else 'restore','reason':'superadmin 临时跳过本次' if skip else '恢复固定安排','createdAt':timestamp(),'date':day})
            for a in r['assignees']:self.notify(a,'固定安排临时调整',f'「{r["name"]}」{day} 已'+('挖空，本次无需执行。' if skip else '恢复。'),'repeat',r['id'])
            return r
        if action in ('automation.update','report.schedule.update'):
            self.admin(user)
            cfg=dict(next((x.get('value',{}) for x in self.all('settings') if x.get('id')=='automation'),{}))
            incoming=d.get('collection') if isinstance(d.get('collection'),dict) else d
            mode=incoming.get('mode',cfg.get('mode','daily'))
            if mode not in ('daily','weekly','dates','specific'):raise Problem(400,'自动收集周期无效')
            cfg['mode']=mode;cfg['time']=valid_clock(incoming.get('time',cfg.get('time','00:00')))
            if 'enabled' in incoming: cfg['enabled']=bool(incoming.get('enabled'))
            vals=incoming.get('weekdays',incoming.get('days',cfg.get('weekdays',[]))) or []
            if not isinstance(vals,list):vals=[vals]
            try:cfg['weekdays']=sorted(set(int(x) for x in vals))
            except (TypeError,ValueError):raise Problem(400,'收集星期必须是 0–6 的数字')
            if any(x<0 or x>6 for x in cfg['weekdays']):raise Problem(400,'收集星期必须是 0–6 的数字')
            vals=incoming.get('dates',incoming.get('specificDates',cfg.get('dates',[]))) or []
            if not isinstance(vals,list):vals=[vals]
            cfg['dates']=sorted(set(valid_date(x) for x in vals))
            if mode in ('weekly',) and not cfg['weekdays']:raise Problem(400,'每周收集至少选择一天')
            if mode in ('dates','specific') and not cfg['dates']:raise Problem(400,'指定日期收集至少需要一个日期')
            self.put('settings',{'id':'automation','value':cfg,'updatedAt':timestamp()});return cfg
        if action in ('diary.save','diary.update'):
            day=valid_date(d.get('date') or d.get('day'))
            content=d.get('content','')
            if isinstance(content,dict):
                # Keep structured editor payloads intact while still enforcing
                # a predictable size limit for local storage.
                if len(json.dumps(content,ensure_ascii=False))>20000: raise Problem(400,'日记内容不能超过 20000 个字符')
            else:
                content=str(content).strip()
                if len(content)>10000: raise Problem(400,'日记内容不能超过 10000 个字符')
            entry=self.put('diaries',{'id':f'diary:{user["id"]}:{day}','author':user['id'],'date':day,'content':content,'updatedAt':timestamp()})
            # A submitted diary is visible to the relevant project Owner and
            # to superadmin. Upsert the notice so editing the same day does
            # not flood either inbox.
            projects=[p for p in self.all('projects') if p.get('status')=='active' and
                      (p.get('owner')==user['id'] or p.get('members',{}).get(user['id'])=='accepted')]
            recipients={'superadmin'}
            recipients.update(p['owner'] for p in projects if p.get('owner') and p['owner']!=user['id'])
            text=json.dumps(content,ensure_ascii=False) if isinstance(content,dict) else str(content)
            for recipient in recipients:
                ref=f'diary:{user["id"]}:{day}:2330' if recipient=='superadmin' else f'diary:{user["id"]}:{day}:{recipient}'
                notice=next((n for n in self.all('notifications') if n.get('kind') in ('diary','diary_digest') and n.get('reference')==ref),None)
                payload={'id':notice['id'] if notice else uid(),'to':recipient,
                         'title':f'成员日记 · {user["id"]} · {day}',
                         'body':text,'kind':'diary','reference':ref,'read':False,'createdAt':timestamp()}
                self.put('notifications',payload)
            return entry
        if action=='diary.get':
            day=valid_date(d.get('date') or d.get('day'))
            author=str(d.get('userId') or user['id'])
            if author!=user['id'] and not user['admin']:
                raise Problem(403,'只能查看自己的日记')
            return next((x for x in self.all('diaries') if x.get('author')==author and x.get('date')==day),None)
        if action=='report.save':
            kind=d.get('kind','personal');day=valid_date(d.get('date'));pid=d.get('projectId') or None
            if kind not in ('personal','owner','collaborator'):raise Problem(400,'报告类型无效')
            if kind!='personal':
                p=self.get('projects',pid)
                if p['status']!='active':raise Problem(409,'只能为进行中的项目提交报告')
                if day < p['start'] or (p.get('end') and day > p['end']):raise Problem(400,'报告日期必须在项目周期内')
                if kind=='owner' and p['owner']!=user['id']:raise Problem(403,'只有该项目 Owner 可以提交项目总结')
                if kind=='collaborator' and (p['members'].get(user['id'])!='accepted' or p['owner']==user['id']):raise Problem(403,'只有接受协作的成员可以提交协作进度')
            content=d.get('content',{})
            fields=('done','progress','collaborators','risks','next') if kind=='owner' else ('done','risks','next')
            if any(not str(content.get(k,'')).strip() for k in fields):raise Problem(400,'请完整填写报告；没有风险时可填写“无”')
            report=self.put('reports',{'id':f'{kind}:{pid}:{user["id"]}:{day}','kind':kind,'projectId':pid,'author':user['id'],'date':day,'content':content,'confirmed':True,'createdAt':timestamp()})
            if kind=='owner':
                self.notify('superadmin',f'Owner 项目进度汇报 · {day}',f'{user["id"]} / {p["name"]}\n'+ '\n'.join(f'{k}：{v}' for k,v in content.items()),'report',report['id'])
            elif kind=='collaborator':
                body=f'{user["id"]} / {p["name"]}\n'+ '\n'.join(f'{k}：{v}' for k,v in content.items())
                self.notify(p['owner'],f'协作者进度 · {day}',body,'report',report['id'])
                self.notify('superadmin',f'成员当日总结 · {user["id"]} · {day}',body,'report',report['id'])
            return report
        if action=='inbox.read':
            records=self.all('notifications') if d.get('all') else [self.get('notifications',d['id'])]
            for n in records:
                if n['to']!=user['id']:
                    if not d.get('all'):raise Problem(403,'不能更改其他用户的通知')
                    continue
                n['read']=True;self.put('notifications',n)
            if d.get('all'):
                for r in self.all('requests'):
                    if r['to']==user['id'] and r.get('status')=='pending':r['read']=True;self.put('requests',r)
            return
        if action=='profile.correct':
            return self.put('corrections',{'user':user['id'],'text':required(d,'text'),'createdAt':timestamp()})
        if action in ('assignment.propose','assignment.manual'):
            p=self.get('projects',d['projectId']);self.project_owner(user,p)
            if p['status']!='active':raise Problem(409,'只能分配进行中项目的任务')
            active={u['id'] for u in self.users() if u['active']}
            candidates=[m for m,status in p['members'].items() if status=='accepted' and m in active]
            if not candidates:raise Problem(400,'项目没有可分配成员')
            task=self.get('tasks',d['taskId'])
            if task['projectId']!=p['id']:raise Problem(400,'任务不属于项目')
            ranked=sorted(candidates,key=lambda m:self.profile(m)['minutes'])
            chosen=d.get('assignee',ranked[0]) if action=='assignment.manual' else ranked[0]
            if chosen not in candidates:raise Problem(400,'成员不在项目范围')
            suggestion=self.put('suggestions',{'projectId':p['id'],'taskId':task['id'],'assignee':chosen,'deadline':d.get('deadline',task['date']),'reason':f'规则建议：当前预计工作量 {self.profile(chosen)["minutes"]} 分钟；类型 {task["type"]}；优先级 {task["priority"]}。','status':'pending','createdAt':timestamp()})
            if action=='assignment.manual':return self._action(user,'assignment.review',{'id':suggestion['id'],'accept':True,'assignee':chosen,'deadline':suggestion['deadline']})
            return suggestion
        if action=='assignment.review':
            s=self.get('suggestions',d['id']);p=self.get('projects',s['projectId']);self.project_owner(user,p)
            if s['status']!='pending':raise Problem(409,'该建议已经审核')
            if d.get('accept'):
                who=d.get('assignee',s['assignee'])
                if who not in p['members']:raise Problem(400,'负责人不在项目范围')
                t=self.get('tasks',s['taskId'])
                if t['status'] in ('done','deferred','skipped'):raise Problem(409,'已归档任务不可重新分配')
                blocked=self.member_gate(p,who)
                if blocked:raise Problem(400,blocked)
                self._action(user,'task.update',{'id':t['id'],'assignee':who,'deadline':valid_date(d.get('deadline',s['deadline']))})
                s['status']='accepted';s['assignee']=who
            else:s['status']='rejected';s['reasonRejected']=required(d,'reason')
            self.put('suggestions',s);return s
        if action=='collection.update':
            self.admin(user)
            current=next((x for x in self.all('settings') if x.get('id')=='automation'), {'id':'automation','value':{}})
            old=current.get('value') or {}
            value={**old}
            if 'enabled' in d:value['enabled']=bool(d.get('enabled'))
            if 'time' in d:value['time']=valid_clock(d.get('time'))
            if 'weekdays' in d:
                raw=d.get('weekdays')
                if not isinstance(raw,list):raise Problem(400,'每周日期必须是数组')
                try:days=sorted(set(int(x) for x in raw))
                except (TypeError,ValueError):raise Problem(400,'每周日期无效')
                if any(x<0 or x>6 for x in days):raise Problem(400,'每周日期应为 0 至 6（周一至周日）')
                value['weekdays']=days
            if 'dates' in d:
                raw=d.get('dates')
                if not isinstance(raw,list):raise Problem(400,'指定日期必须是数组')
                try:dates=sorted(set(valid_date(x) for x in raw))
                except Problem:raise
                value['dates']=dates
            # Keep the legacy endpoint aligned with the newer mode-aware
            # endpoint so switching between weekly and one-off dates is
            # deterministic for the scheduler.
            if 'dates' in d and value.get('dates'):
                value['mode']='dates'
            elif 'weekdays' in d:
                value['mode']='weekly'
            if value.get('enabled', True) and not value.get('weekdays') and not value.get('dates'):
                raise Problem(400,'请至少选择一个每周日期或指定日期')
            current['value']=value;current['updatedAt']=timestamp();self.put('settings',current)
            self.audit(user['id'],'collection.update',{'before':old,'after':value})
            return value
        if action=='scheduler.run':
            self.admin(user);return self.schedule()
        raise Problem(404,'未知操作')

    def materialize(self, start, end):
        # Never materialize occurrences outside the product date horizon, even
        # when an internal caller supplies a wider preview window.
        end=min(end, CALENDAR_END)
        if start > end:
            return
        existing={t['id'] for t in self.all('tasks')}
        for r in self.all('repeats'):
            if not r['active']:continue
            base=date.fromisoformat(r['start']);last=date.fromisoformat(r['end']) if r['end'] else end
            day=max(base,start)
            while day<=min(last,end):
                delta=(day-base).days;freq=r['frequency'];weekdays=r.get('weekdays') or []
                specific=set(r.get('specificDates',r.get('dates',[])) or [])
                every=max(1,int(r.get('every',1) or 1))
                month_day=int(r.get('monthDay',1) or 1)
                weekly_hit=(day.weekday() in weekdays) if weekdays else (day.weekday()==base.weekday())
                match=(freq=='daily' or
                       (freq=='weekly' and weekly_hit and (delta//7)%every==0) or
                       (freq=='workdays' and day.weekday()<5) or
                       (freq=='custom' and delta%every==0) or
                       (freq=='monthly' and day.day==min(month_day,calendar.monthrange(day.year,day.month)[1])) or
                       (freq in ('dates','specific') and day.isoformat() in specific))
                if day.isoformat() in set(r.get('skipDates',r.get('excludedDates',[])) or []): match=False
                if match:
                    span=max(1,int(r.get('span',1) or 1))
                    deadline=(day+timedelta(days=span-1)).isoformat() if span>1 else None
                    for user in r['assignees']:
                        id=f'repeat:{r["id"]}:{user}:{day.isoformat()}'
                        if id not in existing:
                            self.put('tasks',{'id':id,'repeatId':r['id'],'name':r['name'],'desc':r['desc'],'priority':r['priority'],'duration':r['duration'],'date':day.isoformat(),'time':r['time'],'deadline':deadline,'span':span,'projectId':None,'assignee':user,'status':'todo','fixed':True,'type':'固定安排','createdAt':timestamp()});existing.add(id)
                day+=timedelta(days=1)

    def aggregate(self, p, day, cutoff):
        reports=[r for r in self.all('reports') if r['projectId']==p['id'] and r['date']==day and r['kind']=='collaborator' and datetime.fromisoformat(r['createdAt'])<=cutoff]
        expected=[m for m,v in p['members'].items() if v=='accepted' and m!=p['owner']]
        diaries=[r for r in self.all('diaries') if r.get('date')==day and r.get('author') in expected]
        missing=[m for m in expected if not any(r['author']==m for r in reports) and not any(r.get('author')==m for r in diaries)]
        tasks=[t for t in self.all('tasks') if t.get('projectId')==p['id'] and t['date']==day]
        entries=[r['author']+'：'+json.dumps(r['content'],ensure_ascii=False) for r in reports]
        entries += [r['author']+'（日记）：'+json.dumps(r.get('content',''),ensure_ascii=False) for r in diaries if not any(x['author']==r['author'] for x in reports)]
        return {'done':'；'.join(t['name'] for t in tasks if t['status']=='done') or '暂无已记录的完成任务','progress':f'{sum(t["status"]=="done" for t in tasks)}/{len(tasks)} 项当日任务已完成','collaborators':'\n'.join(entries) or '暂无已提交的协作进度','risks':'；'.join(missing)+' 未提交协作进度' if missing else '所有协作者已提交进度','next':'；'.join(t['desc'] or t['name'] for t in tasks if t['status']!='done') or '当前任务记录中无剩余工作'},missing

    def diary_digest(self, member, day):
        """Build the nightly member diary summary from that day's work."""
        tasks=[t for t in self.all('tasks') if t.get('assignee')==member and t.get('date')==day and t.get('status')!='skipped']
        done=[t for t in tasks if t.get('status')=='done']
        deferred=[t for t in tasks if t.get('status') in ('deferred','doing','todo','pending_approval','rejected')]
        existing=next((d for d in self.all('diaries') if d.get('author')==member and d.get('date')==day),None)
        content=existing.get('content') if existing else {
            'done':'\n'.join('✓ '+t.get('name','') for t in done) or '今日暂无完成任务',
            'risks':'\n'.join(t.get('name','')+'（未完成）' for t in deferred) or '无',
            'next':'继续推进未完成任务' if deferred else '暂无待续工作',
        }
        return {'member':member,'date':day,'tasks':len(tasks),'completed':len(done),
                'load':sum(int(t.get('duration',0) or 0) for t in done),
                'loadTotal':sum(int(t.get('duration',0) or 0) for t in tasks),
                'content':content}

    def collection_enabled(self, day):
        """Whether the configured automatic collection runs for a report day."""
        cfg=next((x.get('value',{}) for x in self.all('settings') if x.get('id')=='automation'),{})
        if cfg.get('enabled', True) is False: return False
        mode=cfg.get('mode','daily')
        if mode=='daily': return True
        if mode=='dates' or mode=='specific':
            return day in set(cfg.get('dates',[]) or [])
        weekdays=cfg.get('weekdays')
        if weekdays is None: return True
        return date.fromisoformat(day).weekday() in set(weekdays)

    def collection_time(self):
        cfg=next((x.get('value',{}) for x in self.all('settings') if x.get('id')=='automation'),{})
        try:return time.fromisoformat(cfg.get('time','00:00'))
        except (TypeError,ValueError):return time(0,0)

    def schedule(self, at=None):
        at=at or now()
        if at.tzinfo is None:raise ValueError('scheduler requires timezone aware time')
        at=at.astimezone(TZ);count=0
        with self.lock, self.db:
            self.materialize(at.date(), CALENDAR_END)
            # Roll unfinished work forward at the first scheduler run of a new day.
            # Pending approvals are copied with their pending status; approval of any
            # copy resolves the whole chain. Ordinary unfinished work is copied as todo.
            for task in list(self.all('tasks')):
                if task.get('date','') >= at.date().isoformat() or task.get('fixed'):
                    continue
                if task.get('status') not in ('todo','doing','pending_approval'):
                    continue
                current=task
                while current.get('date','') < at.date().isoformat() and current.get('status') in ('todo','doing','pending_approval'):
                    target=(date.fromisoformat(current['date']) + timedelta(days=1)).isoformat()
                    carry_key=f'carry:{current["id"]}:{target}'
                    copy=None
                    if not self.db.execute('SELECT 1 FROM jobs WHERE id=?',(carry_key,)).fetchone():
                        copy=self._carry_task(current,target, '待审批任务跨日保留' if current['status']=='pending_approval' else '当日未完成，系统自动递延')
                        self.db.execute('INSERT INTO jobs VALUES (?,?)',(carry_key,at.isoformat()))
                    else:
                        root=current.get('originId') or current['id']
                        copy=next((x for x in self.all('tasks') if x.get('originId')==root and x.get('date')==target),None)
                    if not copy:
                        current['status']='skipped';current['skipReason']='项目已结束，无法继续递延'
                        if current.get('status')=='pending_approval' or current.get('approval',{}).get('status')=='pending':
                            current.setdefault('approval',{})['status']='expired'
                            approver=current.get('approval',{}).get('approver')
                            if approver:
                                for n in self.all('notifications'):
                                    if n.get('to')==approver and n.get('kind')=='task_approval' and n.get('reference')==current.get('id'):
                                        n['read']=True;self.put('notifications',n)
                                self.notify(approver,'任务审批已关闭',f'「{current.get("name","")}」所属项目已结束，任务审批自动关闭。','task_approval',current.get('id'))
                        self.put('tasks',current)
                        break
                    if current.get('status') in ('todo','doing'):
                        current['status']='deferred';self.put('tasks',current)
                    current=copy
            self.advance_due_tasks(at)
            # Every member gets one daily diary rollup at 23:30. A hand-written
            # diary is preserved; otherwise the rollup becomes the day's
            # structured diary entry. The stable job key makes this idempotent.
            # Catch up every due day, including the current day after 23:30;
            # this also fills gaps after the service has been stopped for days.
            candidate_days={t.get('date') for t in self.all('tasks') if t.get('date')}
            candidate_days.update(d.get('date') for d in self.all('diaries') if d.get('date'))
            candidate_days.add(at.date().isoformat())
            for digest_day in sorted(x for x in candidate_days if x and x <= at.date().isoformat()):
                digest_due=datetime.combine(date.fromisoformat(digest_day),time(23,30),TZ)
                if at<digest_due: continue
                for member in (u['id'] for u in self.users() if u['active'] and not u['admin']):
                    key=f'diary:{member}:{digest_day}:2330'
                    if self.db.execute('SELECT 1 FROM jobs WHERE id=?',(key,)).fetchone(): continue
                    digest=self.diary_digest(member,digest_day)
                    manual=next((d for d in self.all('diaries') if d.get('author')==member and d.get('date')==digest_day),None)
                    if not manual:
                        self.put('diaries',{'id':f'diary:{member}:{digest_day}','author':member,'date':digest_day,
                                           'content':digest['content'],'auto':True,'updatedAt':at.isoformat()})
                    body=(f"{member} · {digest_day}\n完成任务：{digest['completed']}/{digest['tasks']} · "
                          f"投入 {digest['load']} 分钟\n"+json.dumps(digest['content'],ensure_ascii=False))
                    ref=f'diary:{member}:{digest_day}:2330'
                    notice=next((n for n in self.all('notifications') if n.get('kind') in ('diary','diary_digest') and n.get('reference')==ref),None)
                    if notice:
                        notice.update(title=f'成员日记统计 · {member} · {digest_day}',body=body,kind='diary_digest',read=False,createdAt=at.isoformat());self.put('notifications',notice)
                    else:
                        self.notify('superadmin',f'成员日记统计 · {member} · {digest_day}',body,'diary_digest',ref)
                    count+=1
                    self.db.execute('INSERT INTO jobs VALUES (?,?)',(key,at.isoformat()))
            for p in self.all('projects'):
                if p['status']!='active':continue
                try:
                    day=date.fromisoformat(p.get('start') or p['createdAt'][:10])
                    project_end=date.fromisoformat(p['end']) if p.get('end') else None
                except (TypeError,ValueError):
                    continue
                if day>at.date():continue
                last_day=min(at.date(),project_end) if project_end else at.date()
                while day<=last_day:
                    daystr=day.isoformat()
                    collection_day = day + timedelta(days=1)
                    for stage,due in [('missing',datetime.combine(day,time(23,30),TZ)),('final',datetime.combine(collection_day,self.collection_time(),TZ))]:
                        key=f'{p["id"]}:{daystr}:{stage}'
                        if due>at or self.db.execute('SELECT 1 FROM jobs WHERE id=?',(key,)).fetchone():continue
                        if stage=='final' and not self.collection_enabled(daystr):
                            self.db.execute('INSERT INTO jobs VALUES (?,?)',(key,at.isoformat()))
                            continue
                        owner_report=next((r for r in self.all('reports') if r['projectId']==p['id'] and r['date']==daystr and r['kind']=='owner' and datetime.fromisoformat(r['createdAt'])<=due),None)
                        content,missing=self.aggregate(p,daystr,due)
                        if stage=='missing':
                            if missing:self.notify(p['owner'],f'23:30 协作进度缺失 · {daystr}',f'「{p["name"]}」未提交：'+ '、'.join(missing),'missing',p['id']);count+=1
                        elif stage=='final':
                            # Only missing reports generate a midnight fallback. Submitted
                            # owner/collaborator reports are delivered when saved and are
                            # not duplicated as a noon draft or a second inbox card.
                            if not owner_report:
                                content['ownerMissing']=True
                                report=self.put('reports',{'id':key,'kind':'automatic','stage':'final','projectId':p['id'],'author':'system','date':daystr,'content':content,'confirmed':False,'createdAt':at.isoformat(),'cutoff':due.isoformat()})
                                self.notify('superadmin',f'自动项目日报 · {p["name"]} · {daystr}',f'Owner 未提交项目进度汇报，系统按当日完成任务自动汇总。\n'+json.dumps(content,ensure_ascii=False),'report',report['id']);count+=1
                        self.db.execute('INSERT INTO jobs VALUES (?,?)',(key,at.isoformat()))
                    day+=timedelta(days=1)
            if count:self.audit('scheduler','scheduled_reports',{'at':at.isoformat(),'sent':count})
        return {'created':count}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--host',default=os.environ.get('WORK_CALENDAR_HOST','127.0.0.1'),help='监听地址；使用 Cloudflare Tunnel/反向代理时保持 127.0.0.1')
    parser.add_argument('--port',type=int,default=int(os.environ.get('WORK_CALENDAR_PORT','4173')))
    parser.add_argument('--db',default=os.environ.get('WORK_CALENDAR_DB',str(ROOT/'data'/'work-calendar.sqlite3')))
    parser.add_argument('--allowed-origin',action='append',default=[],help='允许的浏览器 Origin，可重复传入或用 WORK_CALENDAR_ORIGINS 逗号分隔')
    parser.add_argument('--secure-cookie',action='store_true',default=os.environ.get('WORK_CALENDAR_SECURE_COOKIE','0').lower() in ('1','true','yes'),help='通过 HTTPS 访问时给会话 Cookie 加 Secure')
    args=parser.parse_args()
    configured_origins={x.strip().rstrip('/') for x in os.environ.get('WORK_CALENDAR_ORIGINS','').split(',') if x.strip()}
    configured_origins.update(x.strip().rstrip('/') for x in args.allowed_origin if x.strip())
    configured_origins.update({f'http://127.0.0.1:{args.port}',f'http://localhost:{args.port}'})
    store=Store(args.db)
    if store.initial_passwords:
        path=Path(args.db).parent/'initial-accounts.txt'
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            f.write('战略小组台账 本地核验账户（请勿上传或公开分享）\n')
            for id,pw in store.initial_passwords.items():f.write(f'{id}\t{pw}\n')
        print(f'账户密码已保存：{path}',flush=True)
    class Handler(BaseHTTPRequestHandler):
        def send(self,status,payload,extra=None):
            raw=json.dumps(payload,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)))
            for k,v in (extra or {}).items():self.send_header(k,v)
            self.end_headers();self.wfile.write(raw)
        def token(self):
            c=cookies.SimpleCookie();c.load(self.headers.get('Cookie',''));return c['wc_session'].value if 'wc_session' in c else ''
        def do_GET(self):
            try:
                if self.path=='/api/state':self.send(200,store.snapshot(store.authenticate(self.token())));return
                if self.path=='/api/health':self.send(200,{'ok':True,'timezone':'Asia/Shanghai'});return
                filename={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'}.get(self.path.split('?')[0])
                if not filename:self.send(404,{'error':'页面不存在'});return
                raw=(ROOT/filename).read_bytes();self.send_response(200);self.send_header('Content-Type',{'index.html':'text/html; charset=utf-8','app.js':'text/javascript; charset=utf-8','styles.css':'text/css; charset=utf-8'}[filename]);self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
            except Problem as e:self.send(e.status,{'error':e.message})
        def do_POST(self):
            try:
                if self.headers.get('X-Work-Calendar')!='1':raise Problem(403,'请求来源校验失败')
                origin=self.headers.get('Origin')
                if origin and origin.rstrip('/') not in configured_origins:raise Problem(403,'请求来源不匹配')
                size=int(self.headers.get('Content-Length','0'))
                if size>200_000:raise Problem(413,'请求内容过大')
                d=json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(d,dict):raise Problem(400,'请求参数必须是对象')
                if self.path=='/api/login':
                    token=store.login(str(d.get('username','')),str(d.get('password','')))
                    secure='; Secure' if args.secure_cookie else ''
                    self.send(200,{'ok':True},{'Set-Cookie':f'wc_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800{secure}'});return
                user=store.authenticate(self.token())
                if self.path=='/api/logout':
                    with store.lock,store.db:store.db.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(self.token().encode()).hexdigest(),))
                    secure='; Secure' if args.secure_cookie else ''
                    self.send(200,{'ok':True},{'Set-Cookie':f'wc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0{secure}'});return
                # Password changes use a dedicated route so a user can rotate
                # their own credential (with the current password) while
                # superadmin can reset another member's password.
                if self.path=='/api/password':
                    target=str(d.get('id') or user['id'])
                    store.user(target)
                    newpw=str(d.get('password',''))
                    if target!=user['id']:
                        store.superadmin(user)
                        store.set_password(target,newpw)
                        with store.lock,store.db:store.db.execute('DELETE FROM sessions WHERE user_id=?',(target,))
                        store.audit(user['id'],'account.password',{'target':target,'by':'superadmin'})
                        self.send(200,{'ok':True,'forced':True});return
                    if not store.check_password(user['id'],str(d.get('current',''))):
                        raise Problem(400,'当前密码不正确')
                    store.set_password(target,newpw)
                    tok=hashlib.sha256(self.token().encode()).hexdigest()
                    with store.lock,store.db:store.db.execute('DELETE FROM sessions WHERE user_id=? AND token<>?',(target,tok))
                    store.audit(user['id'],'account.password',{'target':target,'by':'self'})
                    self.send(200,{'ok':True});return
                # The embedded Agent uses a dedicated route so the model
                # adapter never has to know about the generic business action
                # endpoint.  It still lands in the same capability gate.
                if self.path=='/api/agent/chat':
                    self.send(200,store.action(user,'agent.chat',d));return
                if self.path!='/api/action':raise Problem(404,'未知接口')
                if not isinstance(d.get('data',{}),dict):raise Problem(400,'data 参数必须是对象')
                self.send(200,store.action(user,required(d,'action'),d.get('data',{})))
            except Problem as e:self.send(e.status,{'error':e.message})
            except (ValueError,TypeError,KeyError) as e:self.send(400,{'error':'参数不完整或格式无效'})
            except Exception:
                import traceback;traceback.print_exc();self.send(500,{'error':'操作未完成，请稍后重试'})
    stop=threading.Event()
    def scheduler():
        while not stop.is_set():
            try:store.schedule()
            except Exception:
                import traceback;traceback.print_exc()
            stop.wait(30)
    thread=threading.Thread(target=scheduler,daemon=True);thread.start()
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f'战略小组台账 正在运行：http://{args.host}:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:stop.set();thread.join(timeout=5);server.server_close();store.close()

if __name__=='__main__':main()
