"""Markdown files edit in place for the people who own them; minutes edit by hand;
long text never lands in the audit log."""
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem


class MarkdownFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'md.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002', 'test003'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.owner, self.mate, self.other = (self.store.user(x) for x in ('test001', 'test002', 'test003'))
        self.project = self.store.put('projects', {'name': '项目', 'owner': 'test001', 'creator': 'test001', 'status': 'active',
                                                   'members': {'test001': 'accepted', 'test002': 'accepted', 'test003': 'accepted'},
                                                   'start': '2026-01-01'})
        self.store.db.commit()
        self.note = self.store.upload_file(self.mate, self.project['id'], '纪要.md', 'text/markdown', '# 旧'.encode())
        self.sheet = self.store.upload_file(self.mate, self.project['id'], '表.xlsx', '', b'PK\x03\x04')
        self.store.db.commit()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def edit(self, user, file, text):
        return self.store.action(user, 'file.text.update', {'id': file['id'], 'text': text})

    def test_the_uploader_owner_and_admins_can_rewrite_a_markdown_file(self):
        self.edit(self.mate, self.note, '# 新\n- 一')
        self.assertEqual(self.store.read_file(self.owner, self.note['id'])[1].decode(), '# 新\n- 一')
        self.edit(self.owner, self.note, '# Owner 改过')
        self.edit(self.store.user('superadmin'), self.note, '# 管理员改过')
        record, raw = self.store.read_file(self.mate, self.note['id'])
        self.assertEqual((raw.decode(), record['size'], record['updatedBy']), ('# 管理员改过', len('# 管理员改过'.encode()), 'superadmin'))

    def test_other_members_and_other_files_cannot_be_rewritten(self):
        with self.assertRaises(Problem):
            self.edit(self.other, self.note, '# 别人改')
        with self.assertRaises(Problem):
            self.edit(self.mate, self.sheet, 'text')
        self.store.put('projects', {**self.store.get('projects', self.project['id']), 'status': 'done'})
        self.store.db.commit()
        with self.assertRaises(Problem):
            self.edit(self.owner, self.note, '# 结项后改')

    def test_minutes_can_be_written_by_hand_and_stay_out_of_the_audit_log(self):
        meeting = self.store.action(self.owner, 'meeting.create', {'projectId': self.project['id'], 'title': '周会'})
        long_minutes = '## 结论\n' + '很长的纪要。' * 200
        saved = self.store.action(self.owner, 'meeting.transcript.update',
                                  {'id': meeting['id'], 'rawTranscript': '原稿', 'minutes': long_minutes, 'expectedRevision': meeting.get('revision', 0)})
        self.assertEqual(saved['minutes'], long_minutes)
        details = self.store.recent_audit(1)[-1]['details'] if hasattr(self.store, 'recent_audit') else self.store.all('audit')[-1]['details']
        self.assertEqual(details['minutes'], f'<{len(long_minutes)} 字>', '审计只记长度，不记正文')
        with self.assertRaises(Problem):
            self.store.action(self.owner, 'meeting.transcript.update', {'id': meeting['id'], 'minutes': 'x' * 50001,
                                                                         'expectedRevision': saved['revision']})


if __name__ == '__main__':
    unittest.main()
