"""Small failures that would otherwise repeat every scheduler run or stall everyone."""
import tempfile
import unittest
from datetime import datetime, time, timedelta
from pathlib import Path

from server import Store, Problem, now


class RobustnessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'robust.sqlite3', seed=False)
        for name in ('superadmin', 'test001'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.today = now().date()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def run_scheduler(self):
        self.store.db.commit()
        self.store.schedule(datetime.combine(self.today, time(1, 0), now().tzinfo))

    def test_an_open_task_with_a_pending_approval_that_cannot_carry_closes_it(self):
        yesterday = (self.today - timedelta(days=1)).isoformat()
        project = self.store.put('projects', {'name': '已到期', 'owner': 'test001', 'creator': 'test001', 'status': 'active',
                                              'members': {'test001': 'accepted'}, 'start': yesterday, 'end': yesterday})
        self.store.put('tasks', {'id': 'wait', 'name': '待批的任务', 'desc': '', 'projectId': project['id'], 'assignee': 'test001',
                                 'status': 'todo', 'date': yesterday, 'approval': {'status': 'pending', 'approver': 'superadmin'}})
        self.run_scheduler()
        task = self.store.get('tasks', 'wait')
        self.assertEqual(task['status'], 'skipped')
        self.assertEqual(task['approval']['status'], 'expired', '项目结束、无法递延时审批随之关闭')
        self.assertTrue(any(n['to'] == 'superadmin' and n['title'] == '任务审批已关闭' for n in self.store.all('notifications')))

    def test_an_overdue_task_whose_project_is_gone_does_not_stop_the_scheduler(self):
        yesterday = (self.today - timedelta(days=1)).isoformat()
        self.store.put('tasks', {'id': 'orphan', 'name': '孤儿任务', 'desc': '', 'projectId': 'gone', 'assignee': 'test001',
                                 'status': 'todo', 'date': yesterday})
        self.run_scheduler()
        self.assertEqual(self.store.get('tasks', 'orphan')['status'], 'skipped')

    def test_repeated_wrong_passwords_wait_but_only_for_that_account_and_place(self):
        for _ in range(Store.LOGIN_FAILURES):
            with self.assertRaises(Problem) as wrong:
                self.store.login('test001', 'nope', '10.0.0.5')
            self.assertEqual(wrong.exception.status, 401)
        with self.assertRaises(Problem) as blocked:
            self.store.login('test001', 'password-long', '10.0.0.5')
        self.assertEqual(blocked.exception.status, 429, '连续输错后正确密码也要等')
        self.assertTrue(self.store.login('test001', 'password-long', '10.0.0.9'), '别处登录不受影响')
        self.assertTrue(self.store.login('superadmin', 'password-long', '10.0.0.5'), '别的账户不受影响')

    def test_a_successful_login_clears_expired_sessions(self):
        self.store.db.execute('INSERT INTO sessions VALUES (?,?,?)', ('old', 'test001', (now() - timedelta(days=1)).isoformat()))
        self.store.db.commit()
        self.store.login('test001', 'password-long')
        self.assertIsNone(self.store.db.execute("SELECT 1 FROM sessions WHERE token='old'").fetchone())
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM sessions').fetchone()[0], 1)

    def test_the_state_no_longer_carries_unused_profiles(self):
        self.assertNotIn('profiles', self.store.snapshot(self.store.user('superadmin')))


if __name__ == '__main__':
    unittest.main()
