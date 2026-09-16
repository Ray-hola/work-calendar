"""Team chat: one room, every signed-in account, outside the task permission model."""
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem


class ChatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'chat.sqlite3', seed=False)
        self.store.create_user('superadmin', 'password-long', True)
        self.store.create_user('member1', 'password-long', False)
        self.admin = self.store.user('superadmin')
        self.member = self.store.user('member1')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_a_member_can_talk_even_without_task_permissions(self):
        sent = self.store.action(self.member, 'chat.send', {'body': '今天的周报我晚点交'})
        self.assertEqual(sent['author'], 'member1')
        listed = self.store.action(self.admin, 'chat.list', {})['messages']
        self.assertEqual([m['body'] for m in listed], ['今天的周报我晚点交'])

    def test_both_sides_see_the_same_room(self):
        self.store.action(self.member, 'chat.send', {'body': '一'})
        self.store.action(self.admin, 'chat.send', {'body': '二'})
        for viewer in (self.admin, self.member):
            bodies = [m['body'] for m in self.store.action(viewer, 'chat.list', {})['messages']]
            self.assertEqual(bodies, ['一', '二'], '两个账户应看到同一个房间')

    def test_since_returns_only_newer_messages(self):
        for index, at in enumerate(['2026-09-16T10:00:00+08:00', '2026-09-16T10:05:00+08:00', '2026-09-16T10:10:00+08:00']):
            message = self.store.action(self.member, 'chat.send', {'body': f'第 {index + 1} 条'})
            message['createdAt'] = at
            self.store.put('messages', message)
        rows = self.store.action(self.admin, 'chat.list', {'since': '2026-09-16T10:05:00+08:00'})['messages']
        self.assertEqual([m['body'] for m in rows], ['第 3 条'], 'since 之后的消息才应返回')

    def test_empty_and_oversized_bodies_are_refused(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.send', {'body': '   '})
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.send', {'body': 'x' * 1001})
        self.assertEqual(self.store.action(self.admin, 'chat.list', {})['messages'], [])

    def test_the_limit_is_capped_so_a_client_cannot_ask_for_everything(self):
        for index in range(5):
            self.store.action(self.member, 'chat.send', {'body': f'#{index}'})
        rows = self.store.action(self.admin, 'chat.list', {'limit': '2'})['messages']
        self.assertEqual([m['body'] for m in rows], ['#3', '#4'], 'limit 应返回最新的若干条')

    def test_snapshot_carries_a_cheap_unread_summary_without_bodies(self):
        self.assertEqual(self.store.snapshot(self.admin)['chat']['count'], 0)
        self.store.action(self.member, 'chat.send', {'body': '在吗'})
        summary = self.store.snapshot(self.admin)['chat']
        self.assertEqual(summary['count'], 1)
        self.assertEqual(summary['lastBy'], 'member1')
        self.assertTrue(summary['lastAt'])
        self.assertNotIn('body', summary, '摘要不应带消息正文')


if __name__ == '__main__':
    unittest.main()
