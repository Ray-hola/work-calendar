"""Approvals cannot be skipped, reach every admin and stay reachable; chat
polling stays out of the audit log; a deferral never lands on a day gone by."""
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from server import Store, Problem, now


class ApprovalAndInboxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'approvals.sqlite3', seed=False)
        for name in ('superadmin', 'owner', 'mate'):
            self.store.create_user(name, 'test-password-long', name == 'superadmin')
        self.store.create_user('boss2', 'test-password-long', role='admin')
        self.admin, self.boss, self.owner, self.mate = (self.store.user(n) for n in ('superadmin', 'boss2', 'owner', 'mate'))
        self.day = lambda k: (now().date() + timedelta(days=k)).isoformat()
        self.project = self.store.action(self.admin, 'project.create', {'name': 'P', 'owner': 'owner', 'start': self.day(-10),
                                                                         'cycle': 'infinite', 'members': ['mate']})

    def tearDown(self):
        self.store.close(); self.tmp.cleanup()

    def act(self, user, action, data):
        return self.store.action(user, action, data)

    def status(self, project):
        return self.store.get('projects', project['id'])['status']

    def notices(self, account, title, unread=False):
        return [n for n in self.store.snapshot(self.store.user(account))['notifications']
                if n['title'] == title and not (unread and n['read'])]

    def task(self, **fields):
        return self.act(self.owner, 'task.create', {'name': '周报', 'projectId': self.project['id'], 'assignee': 'mate',
                                                    'date': self.day(0), **fields})

    def test_a_project_waiting_for_approval_cannot_be_started_through_an_update(self):
        asked = self.act(self.owner, 'project.create', {'name': '待批'})
        self.assertEqual(asked['status'], 'pending')
        for user in (self.owner, self.admin):
            with self.assertRaises(Problem):
                self.act(user, 'project.update', {'id': asked['id'], 'status': 'active'})
        self.assertEqual(self.status(asked), 'pending')
        self.act(self.admin, 'project.review', {'id': asked['id'], 'accept': True})
        self.assertEqual(self.status(asked), 'active')

    def test_only_an_admin_closes_or_reopens_a_project(self):
        for closed in ('done', 'archived'):
            with self.assertRaises(Problem):
                self.act(self.owner, 'project.update', {'id': self.project['id'], 'status': closed})
        self.act(self.owner, 'project.update', {'id': self.project['id'], 'status': 'paused'})
        self.act(self.owner, 'project.update', {'id': self.project['id'], 'status': 'active'})
        self.act(self.admin, 'project.update', {'id': self.project['id'], 'status': 'archived'})
        with self.assertRaises(Problem):
            self.act(self.owner, 'project.update', {'id': self.project['id'], 'status': 'active'})
        self.assertEqual(self.status(self.project), 'archived')
        self.act(self.admin, 'project.update', {'id': self.project['id'], 'status': 'active'})
        self.assertEqual(self.status(self.project), 'active')

    def test_every_active_admin_hears_an_approval_and_one_settles_it_for_all(self):
        asked = self.act(self.owner, 'project.create', {'name': '待批'})
        self.act(self.owner, 'project.complete_request', {'id': self.project['id'], 'report': '收尾'})
        for account in ('superadmin', 'boss2'):
            self.assertEqual(len(self.notices(account, '项目审批申请', unread=True)), 1)
            self.assertEqual(len(self.notices(account, '项目完成待审批', unread=True)), 1)
        self.assertEqual(self.notices('owner', '项目审批申请'), [])
        self.act(self.boss, 'project.review', {'id': asked['id'], 'accept': True})
        self.act(self.boss, 'project.complete_review', {'id': self.project['id'], 'accept': False, 'reason': '再等等'})
        self.assertEqual(self.notices('superadmin', '项目审批申请', unread=True), [])
        self.assertEqual(self.notices('superadmin', '项目完成待审批', unread=True), [])

    def test_a_one_off_task_request_reaches_every_admin(self):
        groups = self.store.creation_policy()['groups']
        self.act(self.admin, 'creation.update', {'groups': [{**g, 'tempTask': 'approval'} for g in groups]})
        asked = self.act(self.mate, 'task.create', {'name': '临时', 'date': self.day(0)})
        self.assertTrue(asked['requested'])
        for account in ('superadmin', 'boss2'):
            self.assertEqual(len(self.notices(account, '任务创建申请', unread=True)), 1)
        self.act(self.boss, 'task.request_review', {'id': asked['id'], 'accept': True})
        self.assertEqual(self.notices('superadmin', '任务创建申请', unread=True), [])

    def test_the_built_in_account_hears_alone_when_no_admin_is_active(self):
        self.store.db.execute("UPDATE users SET active=0 WHERE admin=1")
        self.store.notify_admins('项目审批申请', '正文', 'approval', self.project['id'])
        self.assertEqual({n['to'] for n in self.store.all('notifications') if n['title'] == '项目审批申请'}, {'superadmin'})

    def test_chat_polling_stays_out_of_the_audit_log(self):
        for action in ('chat.list', 'chat.presence', 'chat.read'):
            self.assertTrue(self.act(self.mate, action, {'channel': 'general'}) is not None)
        self.act(self.mate, 'chat.send', {'channel': 'general', 'body': '在吗'})
        chat = [a['action'] for a in self.store.all('audit') if a['action'].startswith('chat.')]
        self.assertEqual(chat, ['chat.send'])

    def test_deleting_a_task_drops_the_change_still_waiting_on_it(self):
        task = self.task()
        asked = self.act(self.mate, 'task.edit_request', {'id': task['id'], 'name': '周报（改）', 'reason': '范围变了'})
        self.assertEqual(len(self.notices('owner', '任务修改待审批', unread=True)), 1)
        self.act(self.owner, 'task.delete', {'id': task['id']})
        self.assertEqual(self.store.all('edit_requests'), [])
        self.assertEqual(self.notices('owner', '任务修改待审批', unread=True), [])
        self.assertEqual(self.store.snapshot(self.owner)['editRequests'], [])
        with self.assertRaises(Problem):
            self.act(self.owner, 'task.edit_review', {'id': asked['id'], 'accept': True})

    def test_clearing_read_notices_keeps_an_approval_that_is_still_open(self):
        task = self.task()
        asked = self.act(self.mate, 'task.edit_request', {'id': task['id'], 'name': '周报（改）', 'reason': '范围变了'})
        self.act(self.owner, 'inbox.read', {'all': True})
        open_notice = self.notices('owner', '任务修改待审批')[0]
        cleared = self.act(self.owner, 'inbox.delete', {'read': True})
        self.assertEqual(cleared['kept'], 1)
        self.assertEqual(self.act(self.owner, 'inbox.delete', {'ids': [open_notice['id']]}), {'deleted': 0, 'kept': 1})
        self.assertEqual(len(self.notices('owner', '任务修改待审批')), 1)
        self.act(self.owner, 'task.edit_review', {'id': asked['id'], 'accept': True})
        self.assertEqual(self.act(self.owner, 'inbox.delete', {'ids': [open_notice['id']]}), {'deleted': 1, 'kept': 0})

    def test_an_open_project_approval_survives_clearing_and_a_settled_one_does_not(self):
        asked = self.act(self.owner, 'project.create', {'name': '待批'})
        self.act(self.admin, 'inbox.read', {'all': True})
        self.assertEqual(self.act(self.admin, 'inbox.delete', {'read': True})['kept'], 1)
        self.act(self.admin, 'project.review', {'id': asked['id'], 'accept': True})
        self.assertEqual(self.act(self.admin, 'inbox.delete', {'read': True})['kept'], 0)
        self.assertEqual(self.notices('superadmin', '项目审批申请'), [])

    def test_a_task_is_never_deferred_to_a_day_already_gone(self):
        spanning = self.task(date=self.day(-3), deadline=self.day(1))
        data = {'id': spanning['id'], 'reason': '时间不足', 'remaining': '收尾', 'duration': 15}
        with self.assertRaises(Problem) as refused:
            self.act(self.mate, 'task.defer', {**data, 'date': self.day(-2)})
        self.assertEqual(refused.exception.message, '递延日期不能早于今天')
        self.act(self.mate, 'task.defer', {**data, 'date': self.day(0)})
        moved = next(t for t in self.store.all('tasks') if t.get('originId') == spanning['id'])
        self.assertEqual((moved['date'], moved['status']), (self.day(0), 'todo'))


if __name__ == '__main__':
    unittest.main()
