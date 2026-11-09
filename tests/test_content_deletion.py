"""Project content deletion: ownership, read-only archives and stale writers."""
import concurrent.futures
import json
import tempfile
import threading
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from server import Store, Problem, now


class ContentDeletionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'content.sqlite3', seed=False)
        for name in ('superadmin', 'owner01', 'member1', 'member2', 'outsider'):
            self.store.create_user(name, 'test-password', name == 'superadmin')
        self.store.create_user('admin01', 'test-password', role='admin')
        self.owner = self.store.user('owner01')
        self.project = self.store.put('projects', {'name': '删除回归项目', 'owner': 'owner01', 'creator': 'owner01',
            'status': 'active', 'start': now().date().isoformat(),
            'members': {name: 'accepted' for name in ('owner01', 'member1', 'member2')}})
        self.meeting = self.store.action(self.owner, 'meeting.create', {'projectId': self.project['id'],
            'title': '可删除会议', 'rawTranscript': '会议原稿', 'minutes': '## 会议纪要'})
        self.other_meeting = self.store.action(self.owner, 'meeting.create', {'projectId': self.project['id'], 'title': '保留会议'})
        self.file = self.store.upload_file(self.store.user('member1'), self.project['id'], '可删除.md', 'text/markdown', b'original file')
        self.keep_file = self.store.upload_file(self.owner, self.project['id'], 'keep.txt', 'text/plain', b'keep')
        self.store.db.commit()

    def tearDown(self):
        self.store.close(); self.tmp.cleanup()

    def delete_meeting(self, user='owner01', **data):
        return self.store.action(self.store.user(user), 'meeting.delete', {'id': self.meeting['id'], **data})

    def test_meeting_deletion_removes_transcript_minutes_and_list_entry_only(self):
        result = self.delete_meeting(expectedRevision=0)
        self.assertEqual(result, {'id': self.meeting['id'], 'projectId': self.project['id'], 'deleted': True})
        with self.assertRaises(Problem) as missing:
            self.store.action(self.owner, 'meeting.get', {'id': self.meeting['id']})
        self.assertEqual(missing.exception.status, 404)
        listed = self.store.action(self.owner, 'meeting.list', {'projectId': self.project['id']})
        self.assertEqual([m['id'] for m in listed], [self.other_meeting['id']])
        self.assertEqual(self.store.read_file(self.owner, self.file['id'])[1], b'original file')
        audit = next(a for a in self.store.all('audit') if a['action'] == 'meeting.delete')
        self.assertEqual(audit['action'], 'meeting.delete')
        self.assertNotIn('原稿', json.dumps(audit['details'], ensure_ascii=False))
        with self.assertRaises(Problem): self.delete_meeting()

    def test_owner_creator_and_admin_can_delete_meetings(self):
        for name in ('owner01', 'superadmin', 'admin01'):
            meeting = self.store.action(self.owner, 'meeting.create', {'projectId': self.project['id'], 'title': name})
            self.store.action(self.store.user(name), 'meeting.delete', {'id': meeting['id']})
        # A former Owner retains deletion rights to a meeting they created,
        # while still participating in the active project.
        self.store.put('projects', {**self.project, 'owner': 'member2'}); self.store.db.commit()
        self.delete_meeting('owner01')

    def test_member_and_outsider_cannot_delete_others_meetings_or_files(self):
        for name in ('member2', 'outsider'):
            for action, record in (('meeting.delete', self.meeting), ('file.delete', self.file)):
                with self.assertRaises(Problem) as denied:
                    self.store.action(self.store.user(name), action, {'id': record['id']})
                self.assertEqual(denied.exception.status, 403)
        self.assertEqual(self.store.get('meetings', self.meeting['id'])['minutes'], '## 会议纪要')
        self.assertEqual(self.store.read_file(self.owner, self.file['id'])[1], b'original file')

    def test_former_creator_who_left_project_cannot_delete(self):
        project = {**self.project, 'owner': 'member2', 'creator': 'member2',
                   'members': {'member1': 'accepted', 'member2': 'accepted'}}
        self.store.put('projects', project); self.store.db.commit()
        with self.assertRaises(Problem) as denied: self.delete_meeting('owner01')
        self.assertEqual(denied.exception.status, 403)

    def test_done_archived_or_expired_project_content_stays_readonly(self):
        # A project past its end date is still running (overdue), so only closed ones are frozen.
        for change in ({'status': 'done'}, {'status': 'archived'}):
            self.store.put('projects', {**self.project, **change}); self.store.db.commit()
            for user in ('owner01', 'member1', 'superadmin'):
                for action, record in (('meeting.delete', self.meeting), ('file.delete', self.file)):
                    with self.assertRaises(Problem) as denied:
                        self.store.action(self.store.user(user), action, {'id': record['id']})
                    self.assertEqual(denied.exception.status, 403)
            self.assertEqual(self.store.read_file(self.owner, self.file['id'])[1], b'original file')

    def test_changed_meeting_is_not_deleted_with_an_old_revision(self):
        saved = self.store.action(self.owner, 'meeting.transcript.update', {'id': self.meeting['id'],
            'rawTranscript': '其他成员新增内容', 'expectedRevision': 0})
        with self.assertRaises(Problem) as stale: self.delete_meeting(expectedRevision=0)
        self.assertEqual(stale.exception.status, 409)
        self.assertEqual(self.store.get('meetings', self.meeting['id'])['rawTranscript'], '其他成员新增内容')
        self.delete_meeting(expectedRevision=saved['revision'])

    def test_overdue_project_keeps_file_and_meeting_management_open(self):
        self.store.put('projects', {**self.project, 'end': (now().date() - timedelta(days=2)).isoformat()})
        self.store.db.commit()
        updated = self.store.action(self.store.user('member1'), 'file.text.update', {'id': self.file['id'], 'text': 'updated after deadline'})
        self.assertEqual(updated['id'], self.file['id'])
        self.store.action(self.store.user('member1'), 'file.delete', {'id': self.file['id']})
        self.delete_meeting(expectedRevision=0)
        self.assertIsNone(self.store.db.execute('SELECT 1 FROM files WHERE id=?', (self.file['id'],)).fetchone())
        self.assertEqual([m['id'] for m in self.store.action(self.owner, 'meeting.list', {'projectId': self.project['id']})], [self.other_meeting['id']])

    def test_file_uploader_owner_and_admin_remove_metadata_and_blob(self):
        for name in ('member1', 'owner01', 'superadmin', 'admin01'):
            f = self.store.upload_file(self.store.user('member1'), self.project['id'], name + '.md', 'text/markdown', b'content')
            self.store.db.commit()
            self.store.action(self.store.user(name), 'file.delete', {'id': f['id']})
            self.assertIsNone(self.store.db.execute('SELECT 1 FROM files WHERE id=?', (f['id'],)).fetchone())
            self.assertIsNone(self.store.db.execute('SELECT 1 FROM file_blobs WHERE id=?', (f['id'],)).fetchone())
            with self.assertRaises(Problem):
                self.store.action(self.store.user(name), 'file.text.update', {'id': f['id'], 'text': 'late save'})
        self.assertEqual(self.store.read_file(self.owner, self.keep_file['id'])[1], b'keep')

    def test_late_minutes_generation_cannot_recreate_a_deleted_meeting(self):
        self.store.set_llm_config(self.store.user('superadmin'), {'baseUrl': 'http://127.0.0.1:9/v1', 'model': 'test', 'apiKey': 'test-only'})
        entered, release = threading.Event(), threading.Event()
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_):
                entered.set()
                if not release.wait(5): raise TimeoutError('test response was not released')
                return json.dumps({'choices': [{'message': {'content': 'late minutes'}}]}).encode()
        with patch('server.urllib.request.urlopen', return_value=Response()), concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(self.store.action, self.owner, 'meeting.minutes.generate', {'id': self.meeting['id']})
            try:
                self.assertTrue(entered.wait(3))
                self.delete_meeting()
            finally: release.set()
            with self.assertRaises(Problem) as gone: pending.result(timeout=5)
            self.assertEqual(gone.exception.status, 404)
        self.assertIsNone(self.store.db.execute('SELECT 1 FROM meetings WHERE id=?', (self.meeting['id'],)).fetchone())


if __name__ == '__main__': unittest.main()
