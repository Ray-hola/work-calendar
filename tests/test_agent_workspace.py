"""On-demand tool runtime: authority, SQL isolation, protocol and total budgets."""
import io
import json
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from agent_workspace import Workspace, WorkspaceError, RESULT_CHARS, MAX_CALLS, compact
from server import Store, Problem
from test_assistant_config import _provider, _chat


def tool(name, arguments, call_id='call_1'):
    return {'id': call_id, 'type': 'function', 'function': {'name': name, 'arguments': compact(arguments)}}


def calls(*items):
    return {'choices': [{'message': {'content': None, 'tool_calls': list(items)}, 'finish_reason': 'tool_calls'}]}


class AgentWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'workspace.sqlite3', seed=False)
        for name in ('superadmin', 'owner', 'mate', 'outsider'):
            self.store.create_user(name, 'test-password-long', name == 'superadmin')
        self.admin, self.member = self.store.user('superadmin'), self.store.user('mate')
        self.store.put('settings', {'id': 'llm', 'value': {'baseUrl': 'https://fake.example/v1', 'model': 'm'}})
        self.project = self.store.put('projects', {'id': 'p', 'name': '项目', 'owner': 'owner', 'creator': 'owner',
                            'status': 'active', 'members': {'owner': 'accepted', 'mate': 'accepted'}, 'start': '2026-01-01'})
        self.store.db.commit()
        self.seen = []

    def tearDown(self):
        self.store.close();self.tmp.cleanup()

    def task(self, name, assignee='mate', **extra):
        return self.store.put('tasks', {'name': name, 'date': '2026-11-03', 'duration': 30, 'assignee': assignee,
            'status': 'doing', 'priority': 'P1', 'projectId': None, **extra})

    def workspace(self, user=None):
        return Workspace(lambda table: self.store.workspace_rows(user or self.admin, table))

    def chat(self, responder, user=None, **data):
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': responder}, self.seen)):
            return self.store.llm_chat(user or self.admin, {'messages': [{'role': 'user', 'content': '查看工作'}], **data})

    def test_greetings_do_not_build_or_send_any_business_snapshot(self):
        for i in range(1000):self.task('不能默认发送的私密任务' + str(i), desc='细节' * 100)
        self.store.db.commit()
        with mock.patch.object(self.store, 'snapshot', side_effect=AssertionError('must not preload')), \
             mock.patch.object(self.store, 'workspace_rows', side_effect=AssertionError('must not query for greeting')):
            result = self.chat(_chat('你好'), messages=[{'role': 'user', 'content': '你好'}])
        payload = json.loads(self.seen[0].data)
        self.assertNotIn('不能默认发送', compact(payload))
        self.assertNotIn('taskIndex', compact(payload));self.assertNotIn('diaryStats', compact(payload))
        self.assertLess(len(compact(payload)), 12000)
        self.assertEqual(result['tools'], [])
        self.assertIn('workspace_query', [t['function']['name'] for t in payload['tools']])

    def test_sql_executes_joins_aggregates_and_ctes_on_all_matching_records(self):
        for i in range(601):self.task('任务' + str(i), projectId='p')
        self.task('旧递延', projectId='p', supersededBy='successor')
        self.store.db.commit()
        result = self.workspace().query({'sql': 'WITH x AS (SELECT * FROM tasks WHERE date=?) SELECT p.name AS project,count(*) AS n,sum(t.duration) AS minutes FROM x t JOIN projects p ON t.projectId=p.id GROUP BY p.id', 'params': ['2026-11-03']})
        self.assertEqual(result['rows'], [{'project': '项目', 'n': 601, 'minutes': 18030.0}])
        self.assertEqual(self.workspace().query({'sql': 'SELECT count(*) AS n FROM task_history'})['rows'][0]['n'], 602)

    def test_rows_obey_task_project_diary_notification_and_report_permissions(self):
        mine = self.task('本人临时任务')['id'];private = self.task('他人私密任务', 'outsider')['id']
        self.task('协作任务', projectId='p');self.task('Owner自己的项目任务', 'owner', projectId='p')
        self.store.put('diaries', {'id': 'mine', 'author': 'mate', 'date': '2026-09-01', 'content': {'note': '自己的日记'}})
        self.store.put('diaries', {'id': 'private', 'author': 'outsider', 'date': '2026-09-01', 'content': {'note': '他人的日记'}})
        self.store.put('notifications', {'id': 'n', 'to': 'outsider', 'body': '其他人通知'})
        self.store.put('reports', {'id': 'brief:2026-09-03', 'author': 'system', 'kind': 'brief', 'projectId': None,
            'date': '2026-09-03', 'content': {'risks': ['旧结论']}, 'edits': {'risks': ['修订后的结论']}})
        self.store.db.commit()
        w = self.workspace(self.member)
        self.assertEqual({r['name'] for r in w.query({'sql': 'SELECT name FROM tasks'})['rows']}, {'本人临时任务', '协作任务'})
        self.assertEqual(w.read({'table': 'tasks', 'id': private}), {'found': False})
        self.assertTrue(w.read({'table': 'tasks', 'id': mine})['found'])
        self.assertEqual([r['id'] for r in w.query({'sql': 'SELECT id FROM diaries'})['rows']], ['mine'])
        self.assertEqual(w.query({'sql': 'SELECT body FROM notifications'})['rows'], [])
        self.assertEqual(w.query({'sql': 'SELECT id FROM reports'})['rows'], [])
        self.assertIn('修订后的结论', self.workspace().read({'table': 'reports', 'id': 'brief:2026-09-03'})['text'])
        owner_rows = self.workspace(self.store.user('owner')).query({'sql': 'SELECT name FROM tasks'})['rows']
        self.assertEqual({r['name'] for r in owner_rows}, {'协作任务', 'Owner自己的项目任务'})
        public = self.workspace().query({'sql': 'SELECT data FROM people'})
        self.assertNotIn('hash', compact(public));self.assertNotIn('salt', compact(public))

    def test_sql_cannot_escape_to_files_secrets_or_business_writes(self):
        item = self.task('不能被修改');self.store.db.commit()
        attacks = ["UPDATE tasks SET name='被篡改'", 'DELETE FROM tasks', 'DROP TABLE tasks',
            "ATTACH DATABASE '/tmp/should-not-be-created.sqlite3' AS stolen", 'PRAGMA database_list',
            'SELECT * FROM settings', 'SELECT * FROM users', 'SELECT * FROM sqlite_master',
            "SELECT load_extension('evil')", "SELECT readfile('/etc/passwd')", "SELECT writefile('/tmp/x','x')",
            "CREATE TEMP TABLE x AS SELECT * FROM tasks", 'SELECT 1; DELETE FROM tasks',
            'WITH x AS (SELECT * FROM tasks) DELETE FROM tasks', 'SELECT randomblob(1000000000)']
        for sql in attacks:
            with self.subTest(sql=sql),self.assertRaises(WorkspaceError):self.workspace().query({'sql': sql})
        self.assertEqual(self.store.get('tasks', item['id'])['name'], '不能被修改')
        with self.assertRaises(WorkspaceError):self.workspace().read({'table': 'settings', 'id': 'llm'})

    def test_query_time_and_output_are_bounded_and_pages_advance(self):
        with self.assertRaises(WorkspaceError):
            self.workspace().query({'sql': 'WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x) SELECT sum(n) AS n FROM x'})
        expected = [self.task(str(i), desc='说明' * 1000)['id'] for i in range(120)]
        self.store.db.commit();found=[];offset=0
        while True:
            page = self.workspace().query({'sql': 'SELECT id,name,desc FROM tasks ORDER BY rowid', 'limit': 10, 'offset': offset})
            self.assertLessEqual(len(compact(page)), RESULT_CHARS)
            found.extend(r['id'] for r in page['rows'])
            self.assertTrue(page['clipped'])
            if not page['hasMore']:break
            self.assertGreater(page['nextOffset'], offset);offset=page['nextOffset']
        self.assertEqual(found, expected)
        with self.assertRaises(WorkspaceError):self.workspace().query({'sql': 'SELECT 1', 'offset': -1})
        with self.assertRaises(WorkspaceError):self.workspace().query({'sql': 'SELECT 1 AS n,2 AS n'})
        with self.assertRaises(WorkspaceError):self.workspace().query({'sql': "SELECT 'a' LIKE ?", 'params': ['%' * 257]})

    def test_record_read_is_lossless_and_indicates_the_next_text_offset(self):
        text = '引号"与换行\n' * 4000 + '最后的内容'
        item = self.task('长记录', desc=text);self.store.db.commit()
        offset, parts = 0, []
        while True:
            result = self.workspace().read({'table': 'tasks', 'id': item['id'], 'field': 'desc', 'offset': offset})
            self.assertLessEqual(len(compact(result)), RESULT_CHARS);parts.append(result['text'])
            if result['complete']:break
            self.assertGreater(result['nextOffset'], offset);offset=result['nextOffset']
        self.assertEqual(''.join(parts), text)

    def test_native_tool_only_replies_execute_then_send_paired_tool_results(self):
        self.task('目标任务');self.store.db.commit()
        answers = iter([calls(tool('workspace_schema', {}, 'schema')),
                        calls(tool('workspace_query', {'sql': 'SELECT id,name FROM tasks'}, 'query')),
                        _chat('查到目标任务。')])
        result = self.chat(lambda request: next(answers), sessionId='native-session')
        self.assertEqual(result['content'], '查到目标任务。');self.assertEqual(result['toolCalls'], 2)
        payloads = [json.loads(r.data) for r in self.seen]
        self.assertEqual(payloads[1]['messages'][-1]['role'], 'tool')
        self.assertEqual(payloads[1]['messages'][-1]['tool_call_id'], 'schema')
        self.assertIn('目标任务', payloads[2]['messages'][-1]['content'])
        records = self.store.all('agent_messages')
        self.assertEqual([r['content'] for r in records], ['查看工作', '查到目标任务。'])
        self.assertTrue(all(r['conversation'] == 'native-session' for r in records))
        self.assertEqual(len(records[-1]['tools']), 2)

    def test_multiple_reads_and_sql_error_recovery_work_without_blank_retries(self):
        answers=iter([calls(tool('workspace_query', {'sql': 'SELECT * FROM secret'}, 'bad'), tool('workspace_schema', {}, 'schema')),
                      calls(tool('workspace_query', {'sql': 'SELECT count(*) AS n FROM tasks'}, 'fixed')),
                      _chat('没有任务。')])
        result=self.chat(lambda r:next(answers))
        self.assertEqual(len(self.seen),3);self.assertEqual([t['ok'] for t in result['tools']],[False,True,True])
        second=json.loads(self.seen[1].data)['messages']
        self.assertEqual([m['tool_call_id'] for m in second if m['role']=='tool'],['bad','schema'])

    def test_business_tool_prepares_one_confirmable_action_without_executing_it(self):
        result=self.chat(calls(tool('business_action', {'action':'repeat.create','data':{'name':'准备固定安排'}},'write')))
        self.assertIn('<action>',result['content']);self.assertIn('请确认',result['content'])
        self.assertEqual(self.store.all('tasks'),[])
        for user,planning in [(self.member,False),(self.admin,True)]:
            answers=iter([calls(tool('business_action',{'action':'task.create','data':{'name':'不应创建'}},'write')),_chat('不能直接操作。')])
            result=self.chat(lambda r:next(answers),user=user,planning=planning)
            self.assertFalse(result['tools'][0]['ok']);self.assertEqual(self.store.all('tasks'),[])
            names=[t['function']['name'] for t in json.loads(self.seen[-2].data)['tools']]
            self.assertNotIn('business_action',names)

    def test_old_gateways_have_one_explicit_tools_compatibility_fallback(self):
        count=0
        def provider(request,timeout=None):
            nonlocal count
            self.seen.append(request);count+=1;payload=json.loads(request.data)
            if count==1:
                self.assertIn('tools',payload)
                raise urllib.error.HTTPError(request.full_url,400,'unsupported',{},io.BytesIO(b'{"error":{"message":"Unsupported parameter: tools"}}'))
            self.assertNotIn('tools',payload)
            from test_assistant_config import _Reply
            return _Reply(_chat('<tool>{"name":"workspace_query","arguments":{"sql":"SELECT 2+3 AS n"}}</tool>') if count==2 else _chat('等于5。'))
        with mock.patch('server.urllib.request.urlopen',provider):
            result=self.store.llm_chat(self.admin,{'messages':[{'role':'user','content':'计算'}]})
        self.assertEqual(result['content'],'等于5。');self.assertEqual(result['toolCalls'],1)
        self.assertEqual(json.loads(self.seen[-1].data)['messages'][-1]['role'],'user')
        before=len(self.seen)
        with self.assertRaises(Problem):self.chat(401)
        self.assertEqual(len(self.seen),before+1,'鉴权错误不应走兼容重试')

    def test_every_outgoing_payload_fits_the_budget_and_tool_pairs_stay_together(self):
        self.store.set_llm_config(self.admin,{'baseUrl':'https://fake.example/v1','model':'m','contextChars':16000})
        for i in range(50):self.task('任务'+str(i),desc='大段内容'*400)
        self.store.db.commit();counter=0
        def answer(request):
            nonlocal counter
            payload=json.loads(request.data);self.assertLessEqual(len(compact(payload)),16000)
            outstanding=set()
            for message in payload['messages']:
                for call in message.get('tool_calls',[]):outstanding.add(call['id'])
                if message['role']=='tool':
                    self.assertIn(message['tool_call_id'],outstanding);outstanding.remove(message['tool_call_id'])
            self.assertEqual(outstanding,set())
            counter+=1
            return calls(tool('workspace_query',{'sql':'SELECT id,desc FROM tasks ORDER BY rowid','offset':counter-1},str(counter))) if counter<5 else _chat('这是部分结果。')
        history=[{'role':'user','content':'旧问题'+('x'*3000)},{'role':'assistant','content':'旧答复'+('y'*3000)}]*5
        result=self.chat(answer,messages=history+[{'role':'user','content':'最新问题'}])
        self.assertGreater(result['trimmed'],0);self.assertLessEqual(result['contextChars'],16000)
        self.assertTrue(all('最新问题' in compact(json.loads(r.data)) for r in self.seen))
        with mock.patch('server.urllib.request.urlopen') as upstream:
            with self.assertRaises(Problem):self.store.llm_chat(self.admin,{'messages':[{'role':'user','content':'x'*40000}]})
            upstream.assert_not_called()

    def test_repeated_tool_calls_stop_and_bad_native_envelopes_are_rejected(self):
        result=self.chat(calls(tool('workspace_query',{'sql':'SELECT 1 AS n'})))
        self.assertEqual(result['toolCalls'],MAX_CALLS);self.assertTrue(result['incomplete'])
        with self.assertRaises(Problem):self.chat({'choices':[{'message':{'tool_calls':[{'function':{'name':'workspace_schema','arguments':'{}'}}]}}]})

    def test_model_io_does_not_hold_the_app_database_lock(self):
        entered,released,read=threading.Event(),threading.Event(),threading.Event();errors=[]
        def provider(request):entered.set();released.wait(3);return _chat('你好')
        def chat():
            try:self.store.action(self.admin,'agent.chat',{'messages':[{'role':'user','content':'你好'}]})
            except Exception as e:errors.append(e)
        with mock.patch('server.urllib.request.urlopen',_provider({'/chat/completions':provider},self.seen)):
            worker=threading.Thread(target=chat);worker.start();self.assertTrue(entered.wait(1))
            reader=threading.Thread(target=lambda:(self.store.snapshot(self.admin),read.set()));reader.start()
            try:self.assertTrue(read.wait(1),'等待模型时工作台仍应能读取数据')
            finally:released.set();worker.join(3);reader.join(3)
        self.assertEqual(errors,[])

    def test_continuations_are_small_and_bound_to_the_parent_account_and_conversation(self):
        item=self.task('长资料',desc='内容'*1600);self.store.db.commit()
        answers=iter([calls(tool('workspace_read',{'table':'tasks','id':item['id'],'field':'desc'})),_chat('读取了前一部分。')])
        first=self.chat(lambda r:next(answers),sessionId='own-session')
        self.assertTrue(first['incomplete'])
        answers=iter([calls(tool('workspace_read',{'table':'tasks','id':item['id'],'field':'desc','offset':2500})),_chat('已读完。')])
        second=self.chat(lambda r:next(answers),sessionId='own-session',parentMessageId=first['messageId'])
        environment=json.loads(json.loads(self.seen[-2].data)['messages'][1]['content'])
        self.assertEqual(environment['continuations'][0]['arguments']['offset'],2500)
        self.assertLess(len(compact(environment)),2500)
        self.assertFalse(second['incomplete'])
        self.chat(_chat('你好'),sessionId='other-session',parentMessageId=first['messageId'])
        self.assertNotIn('continuations',json.loads(json.loads(self.seen[-1].data)['messages'][1]['content']))
        self.chat(_chat('你好'),user=self.member,sessionId='own-session',parentMessageId=first['messageId'])
        self.assertNotIn('continuations',json.loads(json.loads(self.seen[-1].data)['messages'][1]['content']))

    def test_oversized_model_replies_remain_safe_to_replay(self):
        result=self.chat(_chat('长'*50000))
        self.assertLessEqual(len(result['content']),40000);self.assertTrue(result['incomplete'])

    def test_archived_completion_and_file_indexes_keep_existing_visibility(self):
        self.project.update(status='done',completedAt='2026-11-03T10:00:00+08:00')
        self.store.put('projects',self.project)
        task=self.task('归档任务',projectId='p',status='done',completedAt='2026-11-03T09:00:00+08:00')
        self.store.put('files',{'id':'file','projectId':'p','name':'归档.txt','size':12,'uploader':'owner'})
        self.store.db.commit()
        mine=self.workspace(self.member)
        self.assertEqual(mine.query({'sql':'SELECT name FROM tasks'})['rows'],[])
        self.assertIn(task['name'],[r['name'] for r in mine.query({'sql':'SELECT name FROM completions'})['rows']])
        self.assertEqual(mine.query({'sql':'SELECT name FROM files'})['rows'],[{'name':'归档.txt'}])
        self.assertEqual(mine.query({'sql':'SELECT name FROM file_projects'})['rows'],[{'name':'项目'}])
        outsider=self.workspace(self.store.user('outsider'))
        self.assertEqual(outsider.query({'sql':'SELECT name FROM files'})['rows'],[])
        self.assertEqual(outsider.query({'sql':'SELECT name FROM file_projects'})['rows'],[])
        self.assertEqual(mine.query({'sql':'SELECT id FROM achievements'})['rows'],[])
        self.assertEqual(self.workspace().query({'sql':'SELECT count(*) AS n FROM achievements'})['rows'][0]['n'],1)

    def test_invitations_applications_and_profiles_follow_workbench_scope(self):
        for who in ('mate','outsider'):
            self.store.put('requests',{'id':'invite-'+who,'to':who,'projectId':'p','status':'pending'})
            self.store.put('task_requests',{'id':'request-'+who,'requester':who,'projectId':'p','status':'pending'})
        self.store.put('edit_requests',{'id':'edit','requester':'outsider','approver':'mate','status':'pending'})
        self.store.db.commit()
        mine=self.workspace(self.member);owner=self.workspace(self.store.user('owner'))
        self.assertEqual([r['id'] for r in mine.query({'sql':'SELECT id FROM requests'})['rows']],['invite-mate'])
        self.assertEqual([r['id'] for r in mine.query({'sql':'SELECT id FROM task_requests'})['rows']],['request-mate'])
        self.assertEqual(len(owner.query({'sql':'SELECT id FROM task_requests'})['rows']),2)
        self.assertEqual(mine.query({'sql':'SELECT id FROM edit_requests'})['rows'],[{'id':'edit'}])
        self.assertEqual(owner.query({'sql':'SELECT id FROM edit_requests'})['rows'],[])
        self.assertEqual({r['id'] for r in owner.query({'sql':'SELECT id FROM profiles'})['rows']},{'owner','mate'})
        self.assertEqual({r['id'] for r in mine.query({'sql':'SELECT id FROM profiles'})['rows']},{'mate'})

    def test_legacy_or_malformed_budgets_never_disable_the_new_ceiling(self):
        for value,expected in [(80000,16000),(200000,32000),(500000,64000),(0,64000),([],32000),({},32000),(True,32000),('unlimited',32000)]:
            record=self.store._llm_record();record['value']['contextChars']=value;self.store.put('settings',record)
            self.assertEqual(self.store.context_budget(),expected)
