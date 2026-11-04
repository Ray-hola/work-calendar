"""Project meetings: raw transcript continuity and template based minutes."""
import json
import tempfile
import threading
import unittest
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
        self.assertEqual(meeting['promptTemplate'], self.store.default_meeting_prompt())
        listed = self.store.action(self.member, 'meeting.list', {'projectId': self.project['id']})
        self.assertEqual([x['title'] for x in listed], ['周会'])

    def test_member_cannot_create_meeting_but_can_update_transcript(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'meeting.create', {'projectId': self.project['id'], 'title': '越权会议'})
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会'})
        updated = self.store.action(self.member, 'meeting.transcript.update', {'id': meeting['id'], 'rawTranscript': '确认周五发布', 'recording': True})
        self.assertEqual(updated['status'], 'recording')
        self.assertEqual(self.store.get('meetings', meeting['id'])['rawTranscript'], '确认周五发布')

    def test_minutes_generation_uses_template_and_keeps_raw_transcript(self):
        meeting = self.store.action(self.admin, 'meeting.create', {'projectId': self.project['id'], 'title': '周会', 'agenda': '发布计划', 'promptTemplate': '标题={{title}}\n议程={{agenda}}\n原稿={{transcript}}'})
        self.store.action(self.member, 'meeting.transcript.update', {'id': meeting['id'], 'rawTranscript': '确认周五发布'})
        result = self.store.action(self.member, 'meeting.minutes.generate', {'id': meeting['id']})
        self.assertIn('会议结论', result['minutes'])
        self.assertEqual(result['rawTranscript'], '确认周五发布')
        self.assertIn('标题=周会', _MinutesStub.payload['messages'][0]['content'])
        self.assertIn('原稿=确认周五发布', _MinutesStub.payload['messages'][0]['content'])
        self.assertEqual(_MinutesStub.calls, 1)

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


if __name__ == '__main__': unittest.main()
