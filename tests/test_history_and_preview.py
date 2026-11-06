"""Older chat history pages back cleanly; only provably safe files preview."""
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem, preview_type


class ChatHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'history.sqlite3', seed=False)
        for name in ('superadmin', 'test001'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.member = self.store.user('test001')
        for i in range(300):
            self.store.put('messages', {'channel': 'general', 'author': 'superadmin', 'body': f'第 {i} 条',
                                        'createdAt': f'2026-11-05T{8 + i // 60:02d}:{i % 60:02d}:00+08:00'})
        self.store.put('messages', {'channel': 'lounge', 'author': 'superadmin', 'body': '别的频道',
                                    'createdAt': '2026-11-05T12:00:00+08:00'})
        self.store.db.commit()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def page(self, **data):
        return self.store.action(self.member, 'chat.list', {'channel': 'general', **data})

    def test_pages_walk_back_through_every_message_once(self):
        first = self.page()
        self.assertEqual(len(first['messages']), 120)
        self.assertTrue(first['more'])
        self.assertEqual(first['messages'][-1]['body'], '第 299 条')
        seen = [m['body'] for m in first['messages']]
        cursor, more = first['messages'][0]['createdAt'], first['more']
        while more:
            older = self.page(before=cursor, limit=120)
            seen = [m['body'] for m in older['messages']] + seen
            cursor, more = older['messages'][0]['createdAt'], older['more']
        self.assertEqual(seen, [f'第 {i} 条' for i in range(300)], '按顺序、不重复、不漏')

    def test_new_messages_since_the_last_poll_say_nothing_about_older_ones(self):
        latest = self.page(since='2026-11-05T12:58:00+08:00')
        self.assertEqual([m['body'] for m in latest['messages']], ['第 299 条'])
        self.assertFalse(latest['more'])

    def test_tied_timestamps_cross_pages_without_losing_or_repeating_messages(self):
        for i in range(245):
            self.store.put('messages', {'channel': 'general', 'author': 'superadmin', 'body': f'tied {i}',
                                       'createdAt': '2026-11-06T08:00:00.000000+08:00'})
        self.store.db.commit()
        page, seen = self.page(), []
        while True:
            seen = [m['body'] for m in page['messages']] + seen
            if not page['more']:
                break
            page = self.page(beforeCursor=page['beforeCursor'])
        self.assertEqual(seen, [f'第 {i} 条' for i in range(300)] + [f'tied {i}' for i in range(245)])

    def test_poll_cursor_sees_messages_with_the_same_timestamp(self):
        latest = self.page()
        self.store.put('messages', {'channel': 'general', 'author': 'superadmin', 'body': 'same-time new message',
                                   'createdAt': latest['messages'][-1]['createdAt']})
        self.store.db.commit()
        polled = self.page(sinceCursor=latest['sinceCursor'])
        self.assertEqual([m['body'] for m in polled['messages']], ['same-time new message'])
        self.assertFalse(self.page(sinceCursor=polled['sinceCursor'])['messages'])

    def test_invalid_cursor_is_rejected(self):
        for cursor in ('bad', {'at': 'time', 'rowid': True}, {'at': 'time', 'rowid': -1}):
            with self.assertRaises(Problem):
                self.page(beforeCursor=cursor)


class PreviewTypeTests(unittest.TestCase):
    def test_raster_images_are_recognised_by_their_bytes(self):
        self.assertEqual(preview_type('a.png', b'\x89PNG\r\n\x1a\n' + b'0' * 20), 'image/png')
        self.assertEqual(preview_type('photo', b'\xff\xd8\xff\xe0' + b'0' * 20), 'image/jpeg')
        self.assertEqual(preview_type('a.gif', b'GIF89a' + b'0' * 20), 'image/gif')
        self.assertEqual(preview_type('a.webp', b'RIFF\x00\x00\x00\x00WEBP' + b'0' * 8), 'image/webp')

    def test_pages_and_unknown_files_stay_downloads(self):
        self.assertIsNone(preview_type('logo.png', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
        self.assertIsNone(preview_type('page.html', b'<html><script>alert(1)</script></html>'))
        self.assertIsNone(preview_type('report.pdf', b'<html><script>alert(1)</script></html>'), '只看名字是 PDF 不算')
        self.assertIsNone(preview_type('notes.txt', b'\xff\xfe\x00broken'), '不是 UTF-8 的文本不预览')

    def test_a_real_pdf_previews(self):
        self.assertEqual(preview_type('report.pdf', b'%PDF-1.7\n%...'), 'application/pdf')
        self.assertEqual(preview_type('report', b'%PDF-1.4\n%...'), 'application/pdf')

    def test_text_is_shown_as_plain_text_never_as_a_page(self):
        self.assertEqual(preview_type('notes.md', '# 纪要\n<script>x</script>'.encode()), 'text/plain; charset=utf-8')


if __name__ == '__main__':
    unittest.main()
