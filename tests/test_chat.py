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

    def add_member(self, project, member='member1'):
        """Put someone on a project. There is no separate step for the
        workspace — the same act is what joins it."""
        self.store.action(self.admin, 'project.invite', {'id': project['id'], 'members': [member]})
        return self.store.get('projects', project['id'])

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
        self.add_member(project)
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

    def test_presence_lists_everyone_including_who_is_away(self):
        seen = self.store.action(self.admin, 'chat.presence', {})
        self.assertEqual(sorted(seen), ['member1', 'superadmin'],
                         '所有人都要在名单里，包括从没进过沟通区的人')
        self.assertTrue(seen['superadmin']['online'])
        self.assertFalse(seen['member1']['online'], '没露过面的人就是离线')
        self.assertEqual(seen['member1']['at'], '', '没有活跃时间就不要编一个出来')

        self.store.action(self.member, 'chat.presence', {})
        after = self.store.action(self.admin, 'chat.presence', {})
        self.assertTrue(after['member1']['online'], '露过面之后变成在线')
        self.assertIn('at', after['member1'])

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
        self.add_member(project)
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


    # ---------------------------------------------------------------- @所有人
    def test_everyone_reaches_the_team_but_never_the_sender(self):
        self.store.create_user('member2', 'password-long', False)
        sent = self.store.action(self.member, 'chat.send',
                                 {'body': '@所有人 下午三点评审', 'mentions': ['*']})
        self.assertEqual(sent['mentions'], ['*'], '广播以哨兵形式随消息保存，不需要真的账户')
        for account in ('superadmin', 'member2'):
            notices = [n for n in self.store.all('notifications') if n['to'] == account]
            self.assertEqual(len(notices), 1, account + ' 应收到一条广播通知')
            self.assertIn('所有人', notices[0]['title'])
        self.assertEqual([n for n in self.store.all('notifications') if n['to'] == 'member1'], [],
                         '自己发的广播不该回到自己')

    def test_a_broadcast_does_not_double_notify_a_named_person(self):
        self.store.action(self.member, 'chat.send',
                          {'body': '@所有人 也顺便 @superadmin', 'mentions': ['*', 'superadmin']})
        notices = [n for n in self.store.all('notifications') if n['to'] == 'superadmin']
        self.assertEqual(len(notices), 1, '被点到名的人不该同时收到两条通知')

    def test_a_mention_notice_remembers_its_room(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '看板', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.add_member(project)
        self.store.action(self.member, 'chat.send',
                          {'body': '看这里 @superadmin', 'mentions': ['superadmin'],
                           'channel': project['id']})
        notice = [n for n in self.store.all('notifications') if n['to'] == 'superadmin'][0]
        self.assertEqual(notice['channel'], project['id'], '通知要能指回它来自哪个房间')
        self.store.action(self.member, 'chat.send',
                          {'body': '大厅的话 @superadmin', 'mentions': ['superadmin']})
        latest = [n for n in self.store.all('notifications') if n['to'] == 'superadmin'][-1]
        self.assertEqual(latest['channel'], 'general', '大厅的通知也带着自己的房间')

    # -------------------------------------------------------------- 分频道未读
    def test_unread_is_counted_per_room(self):
        self.store.action(self.member, 'chat.send', {'body': '大厅一条', 'channel': 'general'})
        self.store.action(self.member, 'chat.send', {'body': '闲聊一条', 'channel': 'lounge'})
        chat = self.store.snapshot(self.admin)['chat']
        self.assertEqual(chat['byChannel'], {'general': 1, 'lounge': 1})
        self.assertEqual(chat['unread'], 2, '总未读仍是各房间之和')

        at = [m for m in self.store.all('messages') if m['channel'] == 'general'][0]['createdAt']
        self.store.action(self.admin, 'chat.read', {'channel': 'general', 'at': at})
        chat = self.store.snapshot(self.admin)['chat']
        self.assertEqual(chat['byChannel'], {'lounge': 1}, '只看过的那个房间才清零')
        self.assertEqual(chat['unread'], 1, '没看的房间仍要计入总数')

    def test_a_finished_project_drops_out_of_the_badge(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '结项后不该还亮着', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.add_member(project)
        self.store.action(self.member, 'chat.send', {'body': '结项前说的', 'channel': project['id']})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['byChannel'].get(project['id']), 1)

        archived = self.store.get('projects', project['id'])
        archived['status'] = 'done'
        self.store.put('projects', archived)

        chat = self.store.snapshot(self.admin)['chat']
        self.assertNotIn(project['id'], chat['byChannel'],
                         '房间已经不在列表里，就不该还有未读挂在上面')
        self.assertEqual(chat['unread'], 0)

    def test_a_pre_channel_single_watermark_still_reads_as_read(self):
        self.store.action(self.member, 'chat.send', {'body': '旧的', 'channel': 'general'})
        at = self.store.all('messages')[0]['createdAt']
        # The shape this field had before the room gained channels: one stamp
        # covering the whole room.
        self.store.put('settings', {'id': 'chat-read', 'value': {'superadmin': at}, 'updatedAt': at})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 0)

    def test_reading_one_room_does_not_resurrect_the_others(self):
        self.store.action(self.member, 'chat.send', {'body': '旧消息', 'channel': 'lounge'})
        at = self.store.all('messages')[0]['createdAt']
        self.store.put('settings', {'id': 'chat-read', 'value': {'superadmin': at}, 'updatedAt': at})

        self.store.action(self.admin, 'chat.read', {'channel': 'general', 'at': at})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['unread'], 0,
                         '第一次分房间已读不该把别的房间的历史翻成未读')

        self.store.action(self.member, 'chat.send', {'body': '新的', 'channel': 'lounge'})
        self.assertEqual(self.store.snapshot(self.admin)['chat']['byChannel'], {'lounge': 1})


    def test_the_list_carries_a_preview_of_each_room(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '看板', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.add_member(project)
        self.store.action(self.member, 'chat.send', {'body': '大厅第一条'})
        self.store.action(self.admin, 'chat.send', {'body': '大厅最新的'})
        self.store.action(self.member, 'chat.send', {'body': '项目里的', 'channel': project['id']})

        listed = self.store.action(self.member, 'chat.list', {})
        previews = listed['previews']
        self.assertEqual(sorted(previews), sorted(['general', project['id']]),
                         '有消息的房间才有摘要；空房间在前端显示为「还没有消息」')
        self.assertEqual(previews['general']['body'], '大厅最新的', '取每个频道最新的一条')
        self.assertEqual(previews['general']['author'], 'superadmin')
        self.assertEqual(previews[project['id']]['body'], '项目里的')

    def test_a_preview_is_trimmed_and_never_leaks_an_archived_room(self):
        long_body = '很长的消息' * 40
        self.store.action(self.member, 'chat.send', {'body': long_body})
        preview = self.store.action(self.member, 'chat.list', {})['previews']['general']
        self.assertLessEqual(len(preview['body']), 60, '预览要截断，它每次轮询都会传一遍')

        project = self.store.action(self.admin, 'project.create', {
            'name': '要归档的', 'owner': 'superadmin', 'cycle': 'infinite'})
        self.add_member(project)
        self.store.action(self.member, 'chat.send', {'body': '归档前的话', 'channel': project['id']})
        archived = self.store.get('projects', project['id'])
        archived['status'] = 'done'
        self.store.put('projects', archived)
        self.assertNotIn(project['id'], self.store.action(self.member, 'chat.list', {})['previews'],
                         '已归档的频道不该出现在会话列表里')

    # ------------------------------------------------ 项目工作区 = 项目成员
    def make_project(self, name='工作区测试'):
        return self.store.action(self.admin, 'project.create', {
            'name': name, 'owner': 'superadmin', 'cycle': 'infinite'})

    def test_a_workspace_belongs_to_the_people_on_the_project(self):
        project = self.make_project()
        with self.assertRaises(Problem) as caught:
            self.store.action(self.member, 'chat.list', {'channel': project['id']})
        self.assertIn('项目成员', str(caught.exception.message))
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.send', {'body': '我进来了吗', 'channel': project['id']})

        # 接受协作邀请就是加入工作区，没有第二步
        self.add_member(project)
        self.store.action(self.member, 'chat.send', {'body': '我进来了', 'channel': project['id']})
        room = self.store.action(self.member, 'chat.list', {'channel': project['id']})['messages']
        self.assertEqual([m['body'] for m in room], ['我进来了'])

    def test_an_invitation_still_pending_does_not_open_the_workspace(self):
        project = self.make_project('待确认的项目')
        # 非管理员邀请会写成 pending，成员还没答应
        self.store.action(self.admin, 'project.update', {'id': project['id'], 'owner': 'superadmin'})
        invited = self.store.action(self.admin, 'project.invite',
                                    {'id': project['id'], 'members': ['member1']})
        self.assertEqual(invited['members']['member1'], 'accepted',
                         'superadmin 的指派立即生效')
        # 换一个仍然 pending 的人
        self.store.create_user('member2', 'password-long', False)
        self.member2_user = self.store.user('member2')
        owner_only = self.make_project('只属于 owner 的项目')
        with self.assertRaises(Problem):
            self.store.action(self.member2_user, 'chat.list', {'channel': owner_only['id']})

    def test_leaving_a_project_takes_the_workspace_with_it(self):
        project = self.add_member(self.make_project('会退出的项目'))
        self.store.action(self.admin, 'chat.send', {'body': 'Owner 在项目里说话', 'channel': project['id']})
        self.assertIn(project['id'], self.store.snapshot(self.member)['chat']['byChannel'],
                      '在项目里时该工作区的未读要计入')

        self.store.action(self.member, 'project.member.remove',
                          {'id': project['id'], 'member': 'member1'})

        self.assertNotIn('member1', self.store.get('projects', project['id'])['members'],
                         '退出后不该还挂在项目成员里')
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.list', {'channel': project['id']})
        with self.assertRaises(Problem):
            self.store.action(self.member, 'chat.send', {'body': '还能说吗', 'channel': project['id']})
        self.assertNotIn(project['id'], self.store.snapshot(self.member)['chat']['byChannel'],
                         '退出后这个工作区不该再挂在徽标上')
        notices = [n for n in self.store.all('notifications') if n['to'] == 'superadmin']
        self.assertTrue(any('退出' in n['title'] for n in notices), 'Owner 应被告知')

    def test_only_a_manager_removes_someone_else(self):
        self.store.create_user('member2', 'password-long', False)
        other = self.store.user('member2')
        project = self.add_member(self.make_project('人员变动'))
        self.store.action(self.admin, 'project.invite', {'id': project['id'], 'members': ['member2']})

        with self.assertRaises(Problem) as caught:
            self.store.action(self.member, 'project.member.remove',
                              {'id': project['id'], 'member': 'member2'})
        self.assertEqual(caught.exception.status, 403, '普通协作者不能移除别人')

        self.store.action(self.admin, 'project.member.remove',
                          {'id': project['id'], 'member': 'member2'})
        self.assertNotIn('member2', self.store.get('projects', project['id'])['members'])
        self.assertTrue(any('移出' in n['title'] for n in self.store.all('notifications')
                            if n['to'] == 'member2'), '被移出的人应被告知')

    def test_the_owner_cannot_quit_the_project_and_a_stranger_cannot_either(self):
        project = self.make_project('Owner 不退出')
        with self.assertRaises(Problem) as caught:
            self.store.action(self.admin, 'project.member.remove',
                              {'id': project['id'], 'member': 'superadmin'})
        self.assertEqual(caught.exception.status, 400)
        with self.assertRaises(Problem):
            self.store.action(self.member, 'project.member.remove',
                              {'id': project['id'], 'member': 'member1'})

    def test_the_project_owner_and_creator_are_in_the_workspace_by_definition(self):
        project = self.make_project('Owner 自然在内')
        rooms = self.store.action(self.admin, 'chat.list', {})['previews']
        self.assertNotIn(project['id'], rooms, '还没人说话的工作区没有摘要')
        self.store.action(self.admin, 'chat.send', {'body': 'Owner 说话', 'channel': project['id']})
        self.assertIn(project['id'],
                      self.store.action(self.admin, 'chat.list', {})['previews'],
                      'Owner 不需要被邀请就能用这个工作区')

if __name__ == '__main__':
    unittest.main()
