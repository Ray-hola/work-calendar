"""Project task lists show each piece of work once, and an Owner can remove it."""
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from server import Store, Problem, now


class ProjectTaskTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'tasks.sqlite3', seed=False)
        for name in ('superadmin', 'owner', 'mate', 'other'):
            self.store.create_user(name, 'test-password-long', name == 'superadmin')
        self.admin, self.owner, self.mate, self.other = (self.store.user(n) for n in ('superadmin', 'owner', 'mate', 'other'))
        self.day = lambda k: (now().date() + timedelta(days=k)).isoformat()
        self.project = self.store.action(self.admin, 'project.create', {'name': 'P', 'owner': 'owner', 'start': self.day(-10),
                                                                         'cycle': 'infinite', 'members': ['mate']})

    def tearDown(self):
        self.store.close(); self.tmp.cleanup()

    def task(self, name, date, user=None):
        return self.store.action(user or self.owner, 'task.create', {'name': name, 'projectId': self.project['id'], 'assignee': 'mate',
                                                                      'date': date, 'time': '00:00', 'duration': 30})

    def live(self, user=None):
        return sorted((t['name'], t['status']) for t in self.store.snapshot(user or self.owner)['tasks']
                      if t.get('projectId') == self.project['id'] and not t.get('superseded'))

    def test_a_deferred_task_shows_once_after_its_first_record_is_removed(self):
        first = self.task('周报', self.day(-3)); self.store.schedule(); self.store.db.commit()
        self.assertEqual(self.live(), [('周报', 'doing')])
        self.store.db.execute('DELETE FROM tasks WHERE id=?', (first['id'],)); self.store.db.commit()
        self.assertEqual(self.live(), [('周报', 'doing')])

    def test_moving_the_carried_task_earlier_keeps_it_the_live_one(self):
        self.task('周报', self.day(-2)); self.store.schedule(); self.store.db.commit()
        current = next(t for t in self.store.all('tasks') if t['status'] not in ('deferred',))
        current['date'] = self.day(-5); self.store.put('tasks', current); self.store.db.commit()
        self.assertEqual(self.live(), [('周报', current['status'])])


    def test_the_project_owner_deletes_a_task_and_its_deferred_records(self):
        self.task('周报', self.day(-3)); self.store.schedule(); self.store.db.commit()
        live = next(t for t in self.store.snapshot(self.owner)['tasks'] if not t.get('superseded'))
        self.assertGreater(len(self.store.all('tasks')), 1)
        self.store.action(self.owner, 'task.delete', {'id': live['id']}); self.store.db.commit()
        self.assertEqual(self.store.all('tasks'), [])
        self.assertEqual(self.live(), [])
        notice = [n for n in self.store.all('notifications') if n.get('to') == 'mate' and n.get('title') == '任务已删除']
        self.assertTrue(notice and notice[-1]['body'].startswith('owner'))

    def test_a_task_time_is_a_clock_and_its_description_is_text(self):
        with self.assertRaises(Problem):
            self.store.action(self.owner, 'task.create', {'name': '周报', 'projectId': self.project['id'], 'assignee': 'mate',
                                                          'date': self.day(0), 'time': 'banana'})
        t = self.task('周报', self.day(1))
        with self.assertRaises(Problem):
            self.store.action(self.owner, 'task.update', {'id': t['id'], 'time': 'banana'})
        with self.assertRaises(Problem):
            self.store.action(self.mate, 'task.edit_request', {'id': t['id'], 'time': '25:99', 'reason': '改时间'})
        moved = self.store.action(self.owner, 'task.update', {'id': t['id'], 'time': '14:30:00', 'desc': None})
        self.assertEqual((moved['time'], moved['desc']), ('14:30', ''))
        asked = self.store.action(self.mate, 'task.edit_request', {'id': t['id'], 'time': '16:00', 'reason': '改时间'})
        self.assertEqual(asked['changes'], {'time': '16:00'})

    def test_a_task_cannot_be_created_before_its_project_starts(self):
        with self.assertRaises(Problem) as refused:
            self.task('太早', self.day(-11))
        self.assertEqual(refused.exception.message, '任务日期不能早于项目开始日期')
        self.assertEqual(self.task('首日', self.day(-10))['date'], self.day(-10))

    def test_the_automatic_start_notice_names_the_person_not_the_account(self):
        self.store.db.execute("UPDATE users SET display_name='小梅' WHERE id='mate'")
        self.task('周报', self.day(-1)); self.store.snapshot(self.owner)
        notice = next(n for n in self.store.all('notifications') if n['title'] == '项目任务自动开始')
        self.assertTrue(notice['body'].startswith('小梅 的「周报」'), notice['body'])

    def test_only_the_owner_or_superadmin_may_delete_project_tasks(self):
        t = self.task('周报', self.day(1))
        for user in (self.mate, self.other):
            with self.assertRaises(Problem): self.store.action(user, 'task.delete', {'id': t['id']})
        self.store.action(self.admin, 'task.delete', {'id': t['id']})
        self.assertEqual(self.live(), [])

    def test_owners_cannot_delete_tasks_once_the_project_has_ended(self):
        t = self.task('周报', self.day(1))
        p = self.store.get('projects', self.project['id']); p['status'] = 'done'; self.store.put('projects', p)
        with self.assertRaises(Problem): self.store.action(self.owner, 'task.delete', {'id': t['id']})

    def test_members_still_cannot_delete_temporary_tasks(self):
        t = self.store.action(self.mate, 'task.create', {'name': '临时', 'assignee': 'mate', 'date': self.day(1), 'time': '09:00', 'duration': 30})
        with self.assertRaises(Problem): self.store.action(self.mate, 'task.delete', {'id': t['id']})


if __name__ == '__main__':
    unittest.main()
