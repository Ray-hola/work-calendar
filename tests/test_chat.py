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


    def test_a_project_channel_keeps_its_own_messages(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '渠道测试', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.store.action(self.member, 'chat.send', {'body': '大厅的话'})
        self.store.action(self.member, 'chat.send', {'body': '项目里的话', 'channel': project['id']})
        hall = [m['body'] for m in self.store.action(self.admin, 'chat.list', {})['messages']]
        room = [m['body'] for m in self.store.action(self.admin, 'chat.list', {'channel': project['id']})['messages']]
        self.assertEqual(hall, ['大厅的话'], '默认频道只应看到大厅')
        self.assertEqual(room, ['项目里的话'], '项目频道只应看到本频道')

    def test_an_unknown_channel_is_refused(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.send', {'body': 'x', 'channel': 'nope'})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'chat.list', {'channel': 'nope'})

    def test_a_mention_notifies_the_other_person_but_never_yourself(self):
        sent = self.store.action(self.admin, 'chat.send', {
            'body': '@王零零 周报麻烦今天交', 'mentions': ['member1', 'superadmin', 'ghost']})
        self.assertEqual(sent['mentions'], ['member1'], '自己与不存在的账户都不该进 mentions')
        notices = [n for n in self.store.all('notifications') if n.get('kind') == 'chat_mention']
        self.assertEqual([n['to'] for n in notices], ['member1'])
        self.assertIn('周报麻烦今天交', notices[0]['body'])
        self.assertEqual(notices[0]['reference'], sent['id'])

    def test_unread_counts_other_people_only_and_clears_on_read(self):
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 0)
        self.store.action(self.admin, 'chat.send', {'body': '我自己发的'})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 0, '自己发的不算未读')
        sent = self.store.action(self.member, 'chat.send', {'body': '别人发的'})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 1)
        self.store.action(self.admin, 'chat.read', {'at': sent['createdAt']})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 0, '标记已读后应清零')
        self.assertEqual(self.store.snapshot(self.member)['chat']['unread'], 1, '成员自己那边仍有一条未读')

    def test_presence_reports_active_accounts_only(self):
        seen = self.store.action(self.admin, 'chat.presence', {})
        self.assertEqual(list(seen), ['superadmin'])
        self.assertTrue(seen['superadmin']['online'])
        self.assertIn('at', seen['superadmin'], '应带上最后活跃时间')
        self.store.action(self.member, 'chat.presence', {})
        self.assertEqual(set(self.store.action(self.admin, 'chat.presence', {})), {'superadmin', 'member1'})

    def test_mentions_must_be_real_accounts(self):
        sent = self.store.action(self.member, 'chat.send', {'body': '嗨', 'mentions': ['superadmin', 'nobody', 'superadmin']})
        self.assertEqual(sent['mentions'], ['superadmin'], '重复与不存在的账户应被丢掉')


    def test_the_two_standing_channels_are_always_writable(self):
        self.store.action(self.member, 'chat.send', {'body': '工作的事', 'channel': 'general'})
        self.store.action(self.member, 'chat.send', {'body': '摸鱼的事', 'channel': 'lounge'})
        self.assertEqual([m['body'] for m in self.store.action(self.admin, 'chat.list', {'channel': 'general'})['messages']],
                         ['工作的事'])
        self.assertEqual([m['body'] for m in self.store.action(self.admin, 'chat.list', {'channel': 'lounge'})['messages']],
                         ['摸鱼的事'])
        self.assertEqual([m['body'] for m in self.store.action(self.admin, 'chat.list', {})['messages']],
                         ['工作的事'], '不传频道时默认落在「沟通」')

    def test_messages_from_before_channels_belong_to_the_default_room(self):
        legacy = self.store.action(self.member, 'chat.send', {'body': '老消息'})
        legacy['channel'] = 'all'
        self.store.put('messages', legacy)
        listed = self.store.action(self.admin, 'chat.list', {'channel': 'general'})['messages']
        self.assertEqual([m['body'] for m in listed], ['老消息'], '旧大厅消息应归入「沟通」')

    def test_a_finished_project_keeps_its_history_readable_but_not_writable(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '要归档的项目', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.store.action(self.member, 'chat.send', {'body': '项目进行中的讨论', 'channel': project['id']})
        # Finishing a project has its own coverage elsewhere; this case is about
        # what happens to its channel once it is no longer live.
        archived = self.store.get('projects', project['id'])
        archived['status'] = 'done'
        self.store.put('projects', archived)
        self.assertNotEqual(archived['status'], 'active', '项目应已归档')
        with self.assertRaises(Problem) as caught:
            self.store.action(self.member, 'chat.send', {'body': '还能说吗', 'channel': project['id']})
        self.assertIn('成果库', str(caught.exception.message))
        listed = self.store.action(self.admin, 'chat.list', {'channel': project['id']})['messages']
        self.assertEqual([m['body'] for m in listed], ['项目进行中的讨论'], '归档后仍应可读')


if __name__ == '__main__':
    unittest.main()
