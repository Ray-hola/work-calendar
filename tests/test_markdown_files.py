"""Markdown files edit in place for the people who own them; minutes edit by hand;
long text never lands in the audit log."""
import tempfile
import unittest
import http.cookiejar
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
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

    def test_new_meeting_preserves_manual_minutes_and_rejects_oversize(self):
        text = '## 手写结论\n\n- [ ] 跟进评审'
        meeting = self.store.action(self.owner, 'meeting.create',
                                    {'projectId': self.project['id'], 'title': '手写纪要', 'minutes': text})
        self.assertEqual(self.store.action(self.owner, 'meeting.get', {'id': meeting['id']})['minutes'], text)
        with self.assertRaises(Problem):
            self.store.action(self.owner, 'meeting.create',
                              {'projectId': self.project['id'], 'title': '太长', 'minutes': '字' * 50001})


class TextFileHTTPTests(unittest.TestCase):
    """Exercise the actual request ceiling, cookies and authorization, not just Store."""
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        db = Path(cls.tmp.name) / 'http.sqlite3'
        store = Store(db, seed=False)
        for name in ('superadmin', 'member1', 'member2'):
            store.create_user(name, 'password-long', name == 'superadmin')
        p = store.put('projects', {'name': 'HTTP 文件', 'owner': 'superadmin', 'creator': 'superadmin', 'status': 'active',
                                   'start': '2026-11-01', 'members': {x: 'accepted' for x in ('superadmin', 'member1', 'member2')}})
        cls.file = store.upload_file(store.user('member1'), p['id'], 'large.md', 'text/markdown', b'initial')
        store.db.commit(); store.close()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.process = subprocess.Popen([sys.executable, str(Path(__file__).resolve().parents[1] / 'server.py'),
                                        '--port', str(port), '--db', str(db)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(cls.base + '/api/health', timeout=.2):
                    return
            except OSError:
                if cls.process.poll() is not None:
                    break
                time.sleep(.05)
        cls.process.terminate(); cls.process.wait(timeout=5); cls.tmp.cleanup()
        raise RuntimeError('isolated HTTP test server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate(); cls.process.wait(timeout=5); cls.tmp.cleanup()

    def client(self, user=None):
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if user:
            with client.open(urllib.request.Request(self.base + '/api/login',
                    data=json.dumps({'username': user, 'password': 'password-long'}).encode(),
                    headers={'X-Work-Calendar': '1', 'Content-Type': 'application/json'}), timeout=5): pass
        return client

    def save(self, client, raw, **headers):
        return client.open(urllib.request.Request(self.base + '/api/files/text?id=' + self.file['id'], data=raw,
            headers={'X-Work-Calendar': '1', 'Content-Type': 'text/plain; charset=utf-8', **headers}), timeout=5)

    def test_multibyte_text_larger_than_generic_json_limit_round_trips(self):
        client = self.client('member1'); raw = ('## 会议纪要\n' + '保留完整内容\n' * 30000).encode()
        self.assertGreater(len(raw), 200000)
        with self.save(client, raw) as r: self.assertEqual(json.load(r)['size'], len(raw))
        with client.open(self.base + '/api/files/' + self.file['id'], timeout=5) as r: self.assertEqual(r.read(), raw)
        with self.save(client, b'') as r: self.assertEqual(json.load(r)['size'], 0)

    def test_http_save_keeps_auth_encoding_and_size_boundaries(self):
        for user, status in ((None, 401), ('member2', 403)):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.save(self.client(user), b'unauthorized')
            self.assertEqual(error.exception.code, status); error.exception.close()
        client = self.client('member1')
        for raw, headers, status in ((b'\xff\xfe', {}, 400), (b'', {'Content-Length': '20000001'}, 413),
                                     (b'text', {'Origin': 'https://other.example'}, 403)):
            with self.assertRaises(urllib.error.HTTPError) as error: self.save(client, raw, **headers)
            self.assertEqual(error.exception.code, status); error.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as error:
            client.open(urllib.request.Request(self.base + '/api/action', data=b'x' * 210000,
                headers={'X-Work-Calendar': '1', 'Content-Type': 'application/json'}), timeout=5)
        self.assertEqual(error.exception.code, 413); error.exception.close()


if __name__ == '__main__':
    unittest.main()
