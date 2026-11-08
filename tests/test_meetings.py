"""Project meetings: raw transcript continuity and template based minutes."""
import json
import tempfile
import threading
import unittest
import concurrent.futures
import urllib.request
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from server import Store, Problem


class _MinutesStub(BaseHTTPRequestHandler):
    calls = 0
    payload = None
    def do_POST(self):
        _MinutesStub.calls += 1
        size = int(self.headers.get('Content-Length', '0'))
        _MinutesStub.payload = json.loads(self.rfile.read(size).decode())
        body = json.dumps({'choices': [{'message': {'content': '## 会议结论\n- 确认周五发布\n\n## 待办事项\n- 小王：周四前准备清单'}}]}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *_): pass


class MeetingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'meeting.sqlite3', seed=False)
        self.store.create_user('superadmin', 'password-long', True)
        self.store.create_user('member1', 'password-long', False)
        self.admin = self.store.user('superadmin'); self.member = self.store.user('member1')
        self.project = self.store.action(self.admin, 'project.create', {'name': '会议项目', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.store.action(self.admin, 'project.invite', {'id': self.project['id'], 'members': ['member1']})
        _MinutesStub.calls = 0; _MinutesStub.payload = None
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), _MinutesStub)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.store.set_llm_config(self.admin, {'baseUrl': f'http://127.0.0.1:{self.http.server_address[1]}/v1', 'model': 'minutes-test', 'apiKey': 'secret'})

    def tearDown(self):
        self.http.shutdown(); self.http.server_close(); self.store.close(); self.tmp.cleanup()

    def test_owner_creates_meeting_with_default_template_and_members_can_read(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'agenda': '发布计划'})
        self.assertNotIn('promptTemplate', meeting)
        listed = self.store.action(self.member, 'meeting.list', {'projectId': self.project['id']})
        self.assertEqual([x['title'] for x in listed], ['周会'])

    def test_member_cannot_create_meeting_but_can_update_transcript(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'meeting.create', {'projectId': self.project['id'], 'title': '越权会议'})
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会'})
        updated = self.store.action(self.member, 'meeting.transcript.update', {'id': meeting['id'], 'rawTranscript': '确认周五发布', 'recording': True})
        self.assertEqual(updated['status'], 'recording')
        self.assertEqual(self.store.get('meetings', meeting['id'])['rawTranscript'], '确认周五发布')

    def test_live_save_rejects_stale_revision_without_losing_another_edit(self):
        m = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会'})
        first = self.store.action(self.admin, 'meeting.transcript.update', {'id': m['id'], 'expectedRevision': 0, 'rawTranscript': '第一段', 'recording': True})
        self.assertEqual(first['revision'], 1)
        with self.assertRaises(Problem) as error:
            self.store.action(self.member, 'meeting.transcript.update', {'id': m['id'], 'expectedRevision': 0, 'rawTranscript': '旧页面'})
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(self.store.get('meetings', m['id'])['rawTranscript'], '第一段')
        final = self.store.action(self.admin, 'meeting.transcript.update', {'id': m['id'], 'expectedRevision': 1, 'rawTranscript': '第一段\n尾段', 'recording': False})
        self.assertEqual((final['revision'], final['status']), (2, 'ended'))

    def test_transcript_revision_still_requires_project_access(self):
        self.store.create_user('outsider', 'password-long', False)
        m = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会'})
        with self.assertRaises(Problem):
            self.store.action(self.store.user('outsider'), 'meeting.transcript.update', {'id': m['id'], 'expectedRevision': 0, 'rawTranscript': '越权'})
        self.assertEqual(self.store.get('meetings', m['id'])['rawTranscript'], '')

    def test_minutes_generation_uses_template_and_keeps_raw_transcript(self):
        self.store.action(self.admin, 'meeting.prompt.update', {'prompt': '标题={{title}}\n议程={{agenda}}\n原稿={{transcript}}'})
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'agenda': '发布计划'})
        self.store.action(self.member, 'meeting.transcript.update', {'id': meeting['id'], 'rawTranscript': '确认周五发布'})
        result = self.store.action(self.member, 'meeting.minutes.generate', {'id': meeting['id']})
        self.assertIn('会议结论', result['minutes'])
        self.assertEqual(result['rawTranscript'], '确认周五发布')
        self.assertIn('标题=周会', _MinutesStub.payload['messages'][0]['content'])
        self.assertIn('原稿=确认周五发布', _MinutesStub.payload['messages'][0]['content'])
        self.assertEqual(_MinutesStub.calls, 1)

    def test_system_prompt_is_admin_only_validated_and_persistent(self):
        for prompt in ('', ' ' * 4, 'x' * 12001):
            with self.assertRaises(Problem): self.store.action(self.admin, 'meeting.prompt.update', {'prompt': prompt})
        with self.assertRaises(Problem): self.store.action(self.member, 'meeting.prompt.update', {'prompt': '越权修改'})
        self.store.action(self.admin, 'meeting.prompt.update', {'prompt': '只写决策和待办'})
        self.assertEqual(self.store.snapshot(self.admin)['meetingPrompt'], '只写决策和待办')
        self.assertIsNone(self.store.snapshot(self.member)['meetingPrompt'])
        self.store.close()
        self.store = Store(Path(self.tmp.name) / 'meeting.sqlite3', seed=False)
        self.assertEqual(self.store.meeting_prompt(), '只写决策和待办')

    def test_existing_meeting_uses_latest_system_prompt_and_cannot_override_it(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '小王周四交付', 'promptTemplate': '创建时绕过'})
        self.assertEqual(meeting['rawTranscript'], '小王周四交付')
        self.assertNotIn('promptTemplate', meeting)
        # A legacy per-meeting prompt must never shadow the global setting.
        meeting['promptTemplate'] = '旧会议模板'
        self.store.put('meetings', meeting)
        self.store.action(self.member, 'meeting.transcript.update', {'id': meeting['id'], 'rawTranscript': '小王周四交付', 'promptTemplate': '成员绕过'})
        self.assertEqual(self.store.get('meetings', meeting['id'])['promptTemplate'], '旧会议模板')
        self.store.action(self.admin, 'meeting.prompt.update', {'prompt': '新的全局整理规则'})
        self.store.action(self.member, 'meeting.minutes.generate', {'id': meeting['id']})
        messages = _MinutesStub.payload['messages']
        self.assertEqual(messages[0], {'role': 'system', 'content': '新的全局整理规则'})
        self.assertIn('小王周四交付', messages[1]['content'])
        self.assertNotIn('旧会议模板', json.dumps(messages, ensure_ascii=False))

    def test_default_prompt_without_variables_still_sends_source_transcript(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '周五发布'})
        self.store.action(self.member, 'meeting.minutes.generate', {'id': meeting['id']})
        self.assertEqual(_MinutesStub.payload['messages'][0]['content'], self.store.default_meeting_prompt())
        self.assertEqual(json.loads(_MinutesStub.payload['messages'][1]['content'])['transcript'], '周五发布')

    def test_minutes_requires_transcript_and_does_not_expose_api_key(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '空会'})
        with self.assertRaises(Problem): self.store.action(self.member, 'meeting.minutes.generate', {'id': meeting['id']})
        self.assertNotIn('secret', json.dumps(self.store.snapshot(self.member), ensure_ascii=False))

    def test_snapshot_contains_only_projects_the_viewer_can_open(self):
        own = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '可见'})
        other = self.store.action(self.admin, 'project.create', {'name': '私有', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.store.action(self.admin, 'meeting.create', {'projectId': other['id'], 'title': '不应给成员'})
        visible = self.store.snapshot(self.member)['meetings']
        self.assertEqual([m['id'] for m in visible], [own['id']])

    def generate_while(self, meeting, change):
        """Hold real stub I/O until another worker has completed an operation."""
        entered, release = threading.Event(), threading.Event()
        original = urllib.request.urlopen
        def wait_for_change(*args, **kwargs):
            entered.set()
            if not release.wait(5): raise TimeoutError('test release timed out')
            return original(*args, **kwargs)
        with patch('server.urllib.request.urlopen', wait_for_change), concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            generation = pool.submit(self.store.action, self.member, 'meeting.minutes.generate', {'id': meeting['id']})
            try:
                self.assertTrue(entered.wait(2))
                pool.submit(change).result(timeout=2)
            finally:
                release.set()
            return generation.result(timeout=3)

    def test_waiting_for_model_does_not_block_snapshot_or_task_writes(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '周五发布'})
        def concurrent_work():
            self.store.snapshot(self.member)
            task = self.store.action(self.admin, 'task.create', {'name': '仍可创建任务', 'assignee': 'member1', 'date': '2026-11-05', 'duration': 30})
            self.assertTrue(task.get('id'))
        result = self.generate_while(meeting, concurrent_work)
        self.assertIn('会议结论', result['minutes'])
        audits = [x for x in self.store.all('audit') if x['action'] == 'meeting.minutes.generate']
        self.assertEqual(len(audits), 1)

    def test_generation_never_overwrites_changed_source_template_or_minutes(self):
        for field in ('rawTranscript', 'title', 'agenda', 'minutes', 'prompt'):
            with self.subTest(field=field):
                meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '周五发布'})
                def change():
                    with self.store.lock, self.store.db:
                        if field == 'prompt': self.store.set_meeting_prompt(self.admin, {'prompt': '新模板'})
                        else:
                            latest = self.store.get('meetings', meeting['id']); latest[field] = '新的内容'
                            self.store.put('meetings', latest)
                with self.assertRaises(Problem) as error: self.generate_while(meeting, change)
                self.assertEqual(error.exception.status, 409)
                latest = self.store.get('meetings', meeting['id'])
                self.assertEqual(latest['minutes'], '新的内容' if field == 'minutes' else '')

    def test_generation_rechecks_deleted_meeting_and_membership(self):
        for change_kind in ('delete', 'remove_member', 'disable_account', 'archive'):
            with self.subTest(change=change_kind):
                with self.store.lock, self.store.db:
                    p = self.store.get('projects', self.project['id']);p['status']='active';p['members']['member1']='accepted';self.store.put('projects',p)
                    self.store.db.execute("UPDATE users SET active=1 WHERE id='member1'")
                meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '周五发布'})
                def change():
                    with self.store.lock, self.store.db:
                        if change_kind == 'delete': self.store.db.execute('DELETE FROM meetings WHERE id=?', (meeting['id'],))
                        elif change_kind == 'disable_account': self.store.db.execute("UPDATE users SET active=0 WHERE id='member1'")
                        else:
                            p = self.store.get('projects', self.project['id'])
                            if change_kind == 'archive': p['status']='archived'
                            else: p['members'].pop('member1', None)
                            self.store.put('projects', p)
                with self.assertRaises(Problem): self.generate_while(meeting, change)
                if change_kind == 'delete':
                    with self.assertRaises(Problem): self.store.get('meetings', meeting['id'])
                else: self.assertEqual(self.store.get('meetings', meeting['id'])['minutes'], '')

    def test_archived_meeting_only_projects_remain_readable_but_not_editable(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '保留的原稿'})
        for status, end in (('archived', None), ('done', None)):
            with self.subTest(status=status, end=end):
                with self.store.lock, self.store.db:
                    p=self.store.get('projects',self.project['id']);p['status']=status;p['end']=end;self.store.put('projects',p)
                for user in (self.member, self.admin):
                    snapshot=self.store.snapshot(user)
                    self.assertIn(self.project['id'], [x['id'] for x in snapshot['fileArchives']])
                    self.assertIn(meeting['id'], [x['id'] for x in snapshot['meetings']])
                    self.assertEqual(self.store.action(user,'meeting.list',{'projectId':self.project['id']})[0]['rawTranscript'],'保留的原稿')
                    with self.assertRaises(Problem): self.store.action(user,'meeting.transcript.update',{'id':meeting['id'],'rawTranscript':'不应写入'})
                    with self.assertRaises(Problem): self.store.action(user,'meeting.minutes.generate',{'id':meeting['id']})
        self.store.create_user('outsider','password-long',False); outsider=self.store.user('outsider')
        self.assertEqual(self.store.snapshot(outsider)['meetings'], [])
        with self.assertRaises(Problem): self.store.action(outsider,'meeting.list',{'projectId':self.project['id']})


if __name__ == '__main__': unittest.main()
