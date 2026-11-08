"""A running project past its end date stays open: its work keeps rolling
forward and its Owner is reminded every day until it is completed or moved."""
import tempfile
import unittest
from datetime import datetime, time, timedelta
from pathlib import Path

from server import Store, Problem, TZ, now


class OverdueProjectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'overdue.sqlite3'
        self.store = Store(self.path, seed=False)
        for name in ('superadmin', 'test001', 'test002'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.today = now().date()
        self.end = (self.today - timedelta(days=2)).isoformat()
        self.project = self.store.put('projects', {
            'name': '双周洞察', 'owner': 'test001', 'creator': 'test001', 'status': 'active',
            'members': {'test001': 'accepted', 'test002': 'accepted'},
            'start': (self.today - timedelta(days=5)).isoformat(), 'end': self.end, 'cycle': 'range',
        })
        self.store.db.commit()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def task(self, tid, day, status='todo', **extra):
        self.store.put('tasks', {
            'id': tid, 'name': tid, 'desc': '', 'projectId': self.project['id'], 'assignee': 'test002',
            'status': status, 'date': day, 'duration': 30, 'priority': 'P1', 'fixed': False, 'type': '通用', **extra,
        })
        self.store.db.commit()

    def run_on(self, day, hour=1):
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(hour, 0), TZ))

    def leaf(self, root):
        chain = [t for t in self.store.all('tasks') if t['id'] == root or t.get('originId') == root]
        return max(chain, key=lambda t: t['date'])

    def reminders(self):
        return [n for n in self.store.all('notifications') if n['title'] == '项目已逾期']

    def test_unfinished_work_keeps_rolling_past_the_end_date(self):
        self.task('late', self.end)
        self.run_on(self.today)
        leaf = self.leaf('late')
        self.assertEqual((leaf['date'], leaf['status']), (self.today.isoformat(), 'todo'))
        self.assertEqual(self.store.get('tasks', 'late')['status'], 'deferred')
        self.assertFalse(any(t['status'] == 'skipped' for t in self.store.all('tasks')))

    def test_the_overdue_project_stays_in_everyones_view(self):
        self.task('late', self.today.isoformat())
        for who in ('test001', 'test002', 'superadmin'):
            state = self.store.snapshot(self.store.user(who))
            self.assertIn(self.project['id'], {p['id'] for p in state['projects']}, who)
            self.assertIn('late', {t['id'] for t in state['tasks']}, who)

    def test_the_owner_is_reminded_once_a_day_until_the_project_closes(self):
        self.task('late', self.end)
        self.run_on(self.today)
        self.run_on(self.today, hour=9)
        first = self.reminders()
        self.assertEqual(len(first), 1, '同一天只提醒一次')
        self.assertEqual(first[0]['to'], 'test001')
        self.assertIn('已逾期 2 天', first[0]['body'])
        self.assertIn('还有 1 项任务没完成', first[0]['body'])
        tomorrow = self.today + timedelta(days=1)
        self.run_on(tomorrow)
        notes = sorted(self.reminders(), key=lambda n: n['createdAt'])
        self.assertEqual(len(notes), 2, '第二天再提醒一次')
        self.assertTrue(self.store.get('notifications', first[0]['id'])['read'], '前一天的提醒被今天的取代')
        self.assertIn('已逾期 3 天', notes[-1]['body'])
        # Completed projects are not chased.
        self.store.action(self.store.user('superadmin'), 'project.complete', {'id': self.project['id']})
        self.run_on(tomorrow + timedelta(days=1))
        self.assertEqual(len(self.reminders()), 2)

    def test_moving_the_end_date_stops_the_reminders(self):
        later = (self.today + timedelta(days=7)).isoformat()
        project = self.store.get('projects', self.project['id']); project['end'] = later
        self.store.put('projects', project)
        self.run_on(self.today)
        self.assertEqual(self.reminders(), [])

    def test_a_disabled_owner_hands_the_reminder_to_superadmin(self):
        self.store.action(self.store.user('superadmin'), 'account.toggle', {'id': 'test001', 'active': False})
        self.run_on(self.today)
        self.assertEqual([n['to'] for n in self.reminders()], ['superadmin'])

    def test_work_can_be_deferred_by_hand_past_the_end_once_it_is_reached(self):
        self.task('mine', self.today.isoformat())
        later = (self.today + timedelta(days=1)).isoformat()
        moved = self.store.action(self.store.user('test002'), 'task.defer', {
            'id': 'mine', 'date': later, 'reason': '没做完', 'remaining': '收尾',
        })
        self.assertEqual(moved['status'], 'deferred')
        # While the project still runs, its end date still bounds a deferral.
        project = self.store.get('projects', self.project['id'])
        project['end'] = (self.today + timedelta(days=3)).isoformat(); self.store.put('projects', project)
        self.task('early', self.today.isoformat())
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'task.defer', {
                'id': 'early', 'date': (self.today + timedelta(days=5)).isoformat(), 'reason': '晚点', 'remaining': '全部',
            })

    def test_work_dropped_by_the_old_rule_comes_back_once(self):
        self.task('dropped', self.end, status='skipped', skipReason='项目已结束，无法继续递延')
        closed = self.store.put('projects', {**self.project, 'id': 'closed', 'status': 'done'})
        self.store.put('tasks', {**self.store.get('tasks', 'dropped'), 'id': 'stays', 'projectId': closed['id']})
        self.store.db.execute("DELETE FROM jobs WHERE id='migrate:overdue-carry'")
        # The old run had already marked its failed carry as done.
        next_day = (datetime.fromisoformat(self.end) + timedelta(days=1)).date().isoformat()
        self.store.db.execute('INSERT INTO jobs VALUES (?,?)', (f'carry:dropped:{next_day}', 'old'))
        self.store.db.commit()
        self.store.close(); self.store = Store(self.path, seed=False)
        self.assertEqual(self.store.get('tasks', 'dropped')['status'], 'todo')
        self.assertEqual(self.store.get('tasks', 'stays')['status'], 'skipped', '已结项的项目不动')
        self.run_on(self.today)
        self.assertEqual(self.leaf('dropped')['date'], self.today.isoformat())
        # Runs once: a later skip is left alone.
        self.store.put('tasks', {**self.store.get('tasks', 'stays'), 'id': 'later', 'projectId': self.project['id']})
        self.store.db.commit()
        self.store.close(); self.store = Store(self.path, seed=False)
        self.assertEqual(self.store.get('tasks', 'later')['status'], 'skipped')

    def test_a_task_of_a_closed_project_that_cannot_carry_leaves_a_record(self):
        project = self.store.get('projects', self.project['id']); project['status'] = 'paused'
        self.store.put('projects', project)
        self.task('stuck', self.end)
        self.run_on(self.today)
        self.assertEqual(self.store.get('tasks', 'stuck')['status'], 'skipped')
        self.assertTrue(any(l.get('taskId') == 'stuck' and l['kind'] == 'skip' for l in self.store.all('logs')))


if __name__ == '__main__':
    unittest.main()
