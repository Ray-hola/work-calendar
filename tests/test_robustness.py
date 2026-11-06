"""Small failures that would otherwise repeat every scheduler run or stall everyone."""
import tempfile
import unittest
import concurrent.futures
import hashlib
import threading
from datetime import datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch

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

    def paused_login(self, mutation):
        """Pause the real password hash, mutate from another thread, then resume."""
        entered, release = threading.Event(), threading.Event()
        result = concurrent.futures.Future()
        original = hashlib.scrypt

        def delayed(*args, **kwargs):
            if threading.current_thread().name == 'login-worker':
                entered.set()
                if not release.wait(5):
                    raise TimeoutError('login race test was not released')
            return original(*args, **kwargs)

        def worker():
            try: result.set_result(self.store.login('test001', 'password-long', 'fixture-client'))
            except Exception as exc: result.set_exception(exc)

        thread = threading.Thread(target=worker, name='login-worker')
        with patch('server.hashlib.scrypt', side_effect=delayed):
            thread.start()
            try:
                self.assertTrue(entered.wait(3), 'password verification should start')
                # A real snapshot must finish while the password hash is paused.
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    snapshot = pool.submit(lambda: self.store.snapshot(self.store.user('superadmin')))
                    try: self.assertEqual(snapshot.result(timeout=2)['user']['id'], 'superadmin')
                    finally:
                        if not snapshot.done(): release.set()
                mutation()
            finally:
                release.set(); thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
        return result

    def assert_no_session(self, result):
        with self.assertRaises(Problem) as rejected: result.result(timeout=1)
        self.assertEqual(rejected.exception.status, 401)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM sessions').fetchone()[0], 0)

    def test_password_reset_revokes_an_inflight_old_password_login(self):
        old_session = self.store.login('test001', 'password-long', 'fixture-client')
        def reset():
            self.store.set_password('test001', 'new-password-long')
            with self.store.lock, self.store.db:
                self.store.db.execute('DELETE FROM sessions WHERE user_id=?', ('test001',))
        self.assert_no_session(self.paused_login(reset))
        with self.assertRaises(Problem): self.store.authenticate(old_session)
        token = self.store.login('test001', 'new-password-long', 'fixture-client')
        self.assertEqual(self.store.authenticate(token)['id'], 'test001')

    def test_account_disabled_during_hash_cannot_receive_a_session(self):
        def disable():
            with self.store.lock, self.store.db:
                self.store.db.execute("UPDATE users SET active=0 WHERE id='test001'")
        self.assert_no_session(self.paused_login(disable))

    def test_deleted_and_recreated_account_cannot_use_the_old_verification(self):
        def recreate():
            with self.store.lock, self.store.db:
                self.store.db.execute("DELETE FROM users WHERE id='test001'")
                self.store.create_user('test001', 'replacement-password')
        self.assert_no_session(self.paused_login(recreate))
        self.assertTrue(self.store.login('test001', 'replacement-password'))

    def test_unchanged_credentials_still_login_after_hashing_outside_lock(self):
        token = self.paused_login(lambda: None).result(timeout=1)
        self.assertEqual(self.store.authenticate(token)['id'], 'test001')

    def test_login_globally_removes_other_accounts_expired_failures(self):
        at = now()
        with patch('server.now', return_value=at), patch('server.hashlib.scrypt', return_value=b'0' * 64):
            for i in range(10):
                with self.assertRaises(Problem): self.store.login(f'missing{i}', 'wrong', 'fixture-client')
        self.assertEqual(len(self.store._login_failures), 10)
        with patch('server.now', return_value=at + Store.LOGIN_WINDOW):
            self.store.login('superadmin', 'password-long')
        self.assertEqual(self.store._login_failures, {})

    def test_failure_cache_evicts_least_recent_pairs_at_its_bound(self):
        with patch.object(self.store, 'LOGIN_FAILURE_KEYS', 4), patch('server.hashlib.scrypt', return_value=b'0' * 64):
            for name in ('missing0', 'missing1', 'missing2', 'missing3', 'missing0', 'missing4'):
                with self.assertRaises(Problem): self.store.login(name, 'wrong', 'fixture-client')
                self.assertLessEqual(len(self.store._login_failures), 4)
        key = lambda name: (hashlib.sha256(name.encode()).digest(), hashlib.sha256(b'fixture-client').digest())
        self.assertNotIn(key('missing1'), self.store._login_failures)
        self.assertIn(key('missing0'), self.store._login_failures)
        self.assertTrue(all(len(times) <= Store.LOGIN_FAILURES for times in self.store._login_failures.values()))

    def test_arbitrary_long_login_inputs_do_not_become_unbounded_cache_keys(self):
        with patch('server.hashlib.scrypt', return_value=b'0' * 64):
            with self.assertRaises(Problem): self.store.login('x' * 100000, 'wrong', 'c' * 100000)
        self.assertEqual(len(self.store._login_failures), 1)
        self.assertTrue(all(len(part) == 32 for key in self.store._login_failures for part in key))

    def test_failed_verification_is_timed_when_hashing_finishes(self):
        clock = [now()]
        def reset_after_delay():
            clock[0] += timedelta(hours=1)
            self.store.set_password('test001', 'replacement-password')
        with patch('server.now', side_effect=lambda: clock[0]):
            self.assert_no_session(self.paused_login(reset_after_delay))
        self.assertEqual(list(self.store._login_failures.values()), [[clock[0]]])

    def test_throttle_expires_without_blocking_a_later_correct_password(self):
        at = now()
        with patch('server.now', return_value=at):
            for _ in range(Store.LOGIN_FAILURES):
                with self.assertRaises(Problem): self.store.login('test001', 'wrong', 'fixture-client')
        with patch('server.now', return_value=at + Store.LOGIN_WINDOW):
            token = self.store.login('test001', 'password-long', 'fixture-client')
            self.assertEqual(self.store.authenticate(token)['id'], 'test001')
        self.assertEqual(self.store._login_failures, {})

    def test_simultaneous_hash_results_cannot_overflow_the_failure_window(self):
        count = Store.LOGIN_FAILURES + 1
        barrier = threading.Barrier(count)
        def hash_together(*args, **kwargs):
            barrier.wait(timeout=5); return b'0' * 64
        def attempt():
            try: self.store.login('test001', 'wrong', 'fixture-client')
            except Problem as exc: return exc.status
        with patch('server.hashlib.scrypt', side_effect=hash_together), concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
            outcomes = list(pool.map(lambda _: attempt(), range(count)))
        self.assertEqual(outcomes.count(401), Store.LOGIN_FAILURES)
        self.assertEqual(outcomes.count(429), 1)
        self.assertEqual([len(times) for times in self.store._login_failures.values()], [Store.LOGIN_FAILURES])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM sessions').fetchone()[0], 0)

    def test_the_state_no_longer_carries_unused_profiles(self):
        self.assertNotIn('profiles', self.store.snapshot(self.store.user('superadmin')))


if __name__ == '__main__':
    unittest.main()
