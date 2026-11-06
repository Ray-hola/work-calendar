"""The state snapshot stays correct and cheap as tables grow."""
import tempfile
import unittest
from pathlib import Path

from server import Store, now


class SnapshotScaleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'scale.sqlite3', seed=False)
        for name in ('superadmin', 'test001'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin, self.member = self.store.user('superadmin'), self.store.user('test001')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_a_task_whose_project_is_gone_does_not_break_the_snapshot(self):
        self.store.put('tasks', {'id': 'orphan', 'name': '孤儿任务', 'projectId': 'gone', 'assignee': 'test001',
                                 'status': 'todo', 'date': '2020-01-01', 'time': '09:00', 'createdAt': '2020-01-01T08:00:00+08:00'})
        self.store.put('reports', {'author': 'superadmin', 'projectId': 'gone', 'kind': 'manual', 'content': {}})
        self.store.db.commit()
        self.store.snapshot(self.member)
        self.store.snapshot(self.admin)
        self.assertEqual(self.store.get('tasks', 'orphan')['status'], 'todo', '找不到项目时不自动开始')

    def test_admins_see_only_the_latest_audit_rows_in_order(self):
        for i in range(80):
            self.store.audit('superadmin', f'step.{i}', {})
        self.store.db.commit()
        audit = self.store.snapshot(self.admin)['audit']
        self.assertEqual([a['action'] for a in audit], [f'step.{i}' for i in range(20, 80)])
        self.assertEqual(self.store.snapshot(self.member)['audit'], [])

    def test_tables_are_read_fresh_by_the_next_snapshot(self):
        first = self.store.snapshot(self.admin)
        self.assertIsNone(getattr(self.store._reads, 'cache', None), '快照结束后不留缓存')
        self.store.put('tasks', {'id': 't-new', 'name': '新任务', 'assignee': 'test001', 'status': 'todo',
                                 'date': now().date().isoformat(), 'time': '23:59', 'createdAt': now().isoformat()})
        self.store.db.commit()
        second = self.store.snapshot(self.admin)
        self.assertNotIn('t-new', {t['id'] for t in first['tasks']})
        self.assertIn('t-new', {t['id'] for t in second['tasks']})

    def test_the_snapshot_names_the_rolling_last_day(self):
        snap = self.store.snapshot(self.member)
        self.assertGreater(snap['dateHorizon'], '2027-04-30')


if __name__ == '__main__':
    unittest.main()
