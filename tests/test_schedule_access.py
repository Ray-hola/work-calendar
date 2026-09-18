"""Schedule visibility checks; all data stays in a temporary database."""
import tempfile
import unittest
from datetime import date, datetime, timedelta, time
from zoneinfo import ZoneInfo
TZ=ZoneInfo('Asia/Shanghai')
from pathlib import Path

from server import Store, Problem, now


class ScheduleAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'test.sqlite3', seed=False)
        self.members = ['test001', 'test002', 'test003']
        for name in ['superadmin', *self.members]:
            self.store.create_user(name, 'test-only-password', admin=name == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.day = now().date().isoformat()
        # Existing standalone records remain readable; new work must be project-owned.
        self.personal = {
            name: self.store.put('tasks', {
                'name': name + ' legacy personal', 'date': self.day, 'duration': 30,
                'assignee': name, 'projectId': None, 'priority': 'P1', 'status': 'todo',
                'fixed': False, 'type': '通用',
            }) for name in self.members
        }
        self.store.db.commit()

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_admin_sees_all_personal_and_fixed_schedules(self):
        self.store.action(self.admin, 'repeat.create', {
            'name': 'daily check', 'assignees': self.members, 'frequency': 'daily',
            'start': self.day, 'end': self.day, 'duration': 15,
        })
        tasks = self.store.snapshot(self.admin)['tasks']
        self.assertEqual({t['assignee'] for t in tasks}, set(self.members))
        self.assertEqual(len(tasks), 6)
        self.assertEqual(sum(t['fixed'] for t in tasks), 3)
        for name in self.members:
            member_tasks = self.store.snapshot(self.store.user(name))['tasks']
            self.assertEqual(len(member_tasks), 2)
            self.assertTrue(all(t['assignee'] == name for t in member_tasks))

    def test_project_owner_and_collaborator_task_visibility(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'team project', 'owner': 'test001', 'members': self.members,
            'start': self.day, 'cycle': 'infinite',
        })
        for request in self.store.all('requests'):
            self.store.action(self.store.user(request['to']), 'request.respond', {
                'id': request['id'], 'accept': True,
            })
        for name in self.members:
            self.store.action(self.admin, 'task.create', {
                'name': name + ' project', 'assignee': name, 'projectId': project['id'],
                'date': self.day, 'duration': 20,
            })
        # All accepted project members remain visible to admin; collaborators only see their own project task.
        self.assertEqual(len(self.store.snapshot(self.admin)['tasks']), 6)
        self.assertEqual(len(self.store.snapshot(self.store.user('test002'))['tasks']), 2)
        owner_tasks = self.store.snapshot(self.store.user('test001'))['tasks']
        self.assertEqual(len(owner_tasks), 4)
        for name in ['test002', 'test003']:
            tasks = self.store.snapshot(self.store.user(name))['tasks']
            self.assertEqual(len(tasks), 2)
            self.assertTrue(all(t['assignee'] == name for t in tasks))

    def test_new_tasks_require_a_project(self):
        with self.assertRaises(Problem) as error:
            self.store.action(self.store.user('test001'), 'task.create', {
                'name': 'unauthorized', 'assignee': 'test002', 'date': self.day,
            })
        self.assertEqual(error.exception.status, 400)

    def test_project_application_sets_creator_as_owner_and_owner_can_invite(self):
        applicant = self.store.user('test002')
        project = self.store.action(applicant, 'project.create', {
            'name': 'member proposal', 'start': self.day, 'cycle': 'infinite',
        })
        self.assertEqual(project['status'], 'pending')
        self.assertEqual(project['owner'], 'test002')
        approval = next(n for n in self.store.all('notifications') if n['to'] == 'superadmin' and n['kind'] == 'approval')
        approved = self.store.action(self.admin, 'project.review', {'id': approval['reference'], 'accept': True})
        self.assertEqual(approved['owner'], 'test002')
        self.store.action(applicant, 'project.invite', {'id': project['id'], 'members': ['test003']})
        self.store.action(applicant, 'project.invite', {'id': project['id'], 'members': ['test003']})
        updated = self.store.get('projects', project['id'])
        self.assertEqual(updated['members']['test003'], 'pending')
        self.assertEqual(len([r for r in self.store.all('requests') if r['projectId'] == project['id'] and r['to'] == 'test003']), 1)
        request = next(r for r in self.store.all('requests') if r['projectId'] == project['id'] and r['to'] == 'test003')
        self.store.action(self.store.user('test003'), 'request.respond', {'id': request['id'], 'accept': True})
        self.assertEqual(self.store.get('projects', project['id'])['members']['test003'], 'accepted')

    def test_invalid_project_ranges_and_unknown_account_are_rejected(self):
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'project.create', {
                'name': 'bad cycle', 'start': self.day, 'end': self.day,
                'cycle': 'weekly', 'priority': 'P9',
            })
        project = self.store.action(self.admin, 'project.create', {
            'name': 'valid range', 'start': self.day, 'end': self.day, 'cycle': 'range',
        })
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'project.update', {
                'id': project['id'], 'start': '2026-09-30', 'end': '2026-09-01',
            })
        with self.assertRaises(Problem) as error:
            self.store.action(self.admin, 'account.toggle', {'id': 'missing', 'active': False})
        self.assertEqual(error.exception.status, 404)

    def test_ended_projects_and_their_tasks_are_hidden_from_every_account(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'expired', 'owner': 'test001', 'start': '2026-09-01',
            'end': '2026-09-05', 'cycle': 'range',
        })
        self.store.put('tasks', {'name': 'expired child', 'projectId': project['id'],
                                 'assignee': 'test001', 'date': '2026-09-04',
                                 'duration': 30, 'priority': 'P1', 'status': 'todo',
                                 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        for actor in (self.admin, self.store.user('test001')):
            self.assertNotIn(project['id'], [p['id'] for p in self.store.snapshot(actor)['projects']])
            self.assertFalse(any(t.get('projectId') == project['id'] for t in self.store.snapshot(actor)['tasks']))
        done = self.store.action(self.admin, 'project.create', {'name': 'done', 'owner': 'test001'})
        self.store.action(self.admin, 'project.update', {'id': done['id'], 'status': 'done'})
        self.assertNotIn(done['id'], [p['id'] for p in self.store.snapshot(self.admin)['projects']])


    def test_admin_direct_collaborators_are_immediately_assignable(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'direct', 'owner': 'test001', 'members': ['test002', 'test002'],
            'start': self.day,
        })
        self.assertEqual(project['members'], {'test001': 'accepted', 'test002': 'accepted'})
        self.assertFalse(self.store.all('requests'))
        self.assertTrue(any(n['to'] == 'test001' and n['title'] == '项目 Owner 指派' for n in self.store.all('notifications')))
        task = self.store.action(self.admin, 'task.create', {
            'name': 'child', 'projectId': project['id'], 'assignee': 'test002', 'date': self.day,
        })
        self.assertIn(task['id'], [t['id'] for t in self.store.snapshot(self.store.user('test002'))['tasks']])
        self.assertNotIn(project['id'], [p['id'] for p in self.store.snapshot(self.store.user('test003'))['projects']])

    def test_project_invitation_loads_return_period_total_without_task_details(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'load check', 'owner': 'test001', 'members': ['test002'],
            'start': '2026-09-01', 'end': '2026-09-30', 'cycle': 'range',
        })
        self.store.action(self.admin, 'task.create', {
            'name': 'inside one', 'projectId': project['id'], 'assignee': 'test002',
            'date': '2026-09-10',
        })
        self.store.action(self.admin, 'task.create', {
            'name': 'inside two', 'projectId': project['id'], 'assignee': 'test002',
            'date': '2026-09-30',
        })
        self.store.put('tasks', {'name': 'outside', 'assignee': 'test002', 'projectId': None,
                                 'date': '2026-10-01', 'duration': 30, 'priority': 'P1',
                                 'status': 'todo', 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        loads = self.store.action(self.store.user('test001'), 'project.member_loads', {'id': project['id']})
        self.assertEqual(loads, {'projectId': project['id'], 'counts': {'test002': 3, 'test003': 1}})
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'project.member_loads', {'id': project['id']})

    def test_owner_can_create_and_reassign_project_tasks_with_notifications(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'owned', 'owner': 'test001', 'members': ['test002', 'test003'],
        })
        owner = self.store.user('test001')
        task = self.store.action(owner, 'task.create', {
            'name': 'owned child', 'projectId': project['id'], 'assignee': 'test002', 'date': self.day,
        })
        before = len(self.store.all('notifications'))
        self.store.action(owner, 'task.update', {'id': task['id'], 'assignee': 'test003'})
        self.assertEqual(self.store.get('tasks', task['id'])['assignee'], 'test003')
        self.assertEqual({n['to'] for n in self.store.all('notifications')[before:]}, {'test002', 'test003'})
        for member in ('test002', 'test003'):
            with self.assertRaises(Problem) as error:
                self.store.action(self.store.user(member), 'task.update', {'id': task['id'], 'assignee': 'test001'})
            self.assertEqual(error.exception.status, 403)
            with self.assertRaises(Problem):
                self.store.action(self.store.user(member), 'task.create', {'name': 'forged', 'projectId': project['id']})
            with self.assertRaises(Problem):
                self.store.action(self.store.user(member), 'project.invite', {'id': project['id'], 'members': ['test001']})

    def test_admin_assignment_resolves_pending_invite_without_allowing_stale_rejection(self):
        project = self.store.action(self.admin, 'project.create', {'name': 'pending invite', 'owner': 'test001'})
        owner = self.store.user('test001')
        self.store.action(owner, 'project.invite', {'id': project['id'], 'members': ['test002']})
        request = next(r for r in self.store.all('requests') if r['projectId'] == project['id'])
        with self.assertRaises(Problem):
            self.store.action(owner, 'task.create', {'name': 'too early', 'projectId': project['id'], 'assignee': 'test002'})
        self.store.action(self.admin, 'project.invite', {'id': project['id'], 'members': ['test002']})
        self.assertEqual(self.store.get('projects', project['id'])['members']['test002'], 'accepted')
        self.assertEqual(self.store.get('requests', request['id'])['status'], 'accepted')
        with self.assertRaises(Problem) as error:
            self.store.action(self.store.user('test002'), 'request.respond', {'id': request['id'], 'accept': False})
        self.assertEqual(error.exception.status, 409)
        notices = len(self.store.all('notifications'))
        self.store.action(self.admin, 'project.invite', {'id': project['id'], 'members': ['test002']})
        self.assertEqual(len(self.store.all('notifications')), notices)

    def test_assignment_edges_leave_existing_task_unchanged(self):
        project = self.store.action(self.admin, 'project.create', {'name': 'bounds', 'owner': 'test001', 'members': ['test002']})
        task = self.store.action(self.admin, 'task.create', {'name': 'bounds child', 'projectId': project['id'], 'assignee': 'test002'})
        for assignee in ('test003', 'missing'):
            with self.assertRaises(Problem):
                self.store.action(self.admin, 'task.update', {'id': task['id'], 'assignee': assignee})
            self.assertEqual(self.store.get('tasks', task['id'])['assignee'], 'test002')
        self.store.action(self.admin, 'account.toggle', {'id': 'test002', 'active': False})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'task.create', {'name': 'inactive user', 'projectId': project['id'], 'assignee': 'test002'})
        self.store.action(self.admin, 'task.update', {'id': task['id'], 'assignee': 'test001'})
        self.assertEqual(self.store.get('tasks', task['id'])['assignee'], 'test001')
        self.assertTrue(any(n['to']=='test002' and n['title']=='任务被调整' for n in self.store.all('notifications')))
        self.store.action(self.admin, 'account.toggle', {'id': 'test002', 'active': True})
        self.store.action(self.admin, 'task.update', {'id': task['id'], 'assignee': 'test002'})
        self.store.action(self.store.user('test002'), 'task.complete', {'id': task['id'], 'summary': 'done', 'actual': 30})
        for actor in (self.admin, self.store.user('test001')):
            with self.assertRaises(Problem) as error:
                self.store.action(actor, 'task.update', {'id': task['id'], 'assignee': 'test001'})
            self.assertEqual(error.exception.status, 409)
        self.store.action(self.admin, 'project.update', {'id': project['id'], 'status': 'paused'})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'task.create', {'name': 'paused', 'projectId': project['id']})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'assignment.manual', {'projectId': project['id'], 'taskId': task['id'], 'assignee': 'test001'})

    def test_defer_respects_project_end_and_restarts_next_occurrence(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'defer bounds', 'owner': 'test001', 'members': ['test002'],
            'start': self.day, 'end': (date.fromisoformat(self.day) + timedelta(days=1)).isoformat(),
            'cycle': 'range',
        })
        task = self.store.action(self.admin, 'task.create', {
            'name': 'carry me', 'projectId': project['id'], 'assignee': 'test002',
            'date': self.day, 'status': 'doing',
        })
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'task.defer', {
                'id': task['id'], 'reason': '超出项目期限', 'remaining': '继续处理',
                'date': (date.fromisoformat(self.day) + timedelta(days=2)).isoformat(),
            })
        next_day = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        self.store.action(self.store.user('test002'), 'task.defer', {
                'id': task['id'], 'reason': '时间不足', 'remaining': '继续处理', 'date': next_day,
                'duration': 30,
            })
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'deferred')
        carried = next(t for t in self.store.all('tasks') if t.get('originId') == task['id'])
        self.assertEqual(carried['date'], next_day)
        self.assertEqual(carried['status'], 'todo')

    def test_member_can_start_a_todo_task_and_cannot_start_it_twice(self):
        task = self.personal['test002']
        started = self.store.action(self.store.user('test002'), 'task.start', {'id': task['id']})
        self.assertEqual(started['status'], 'doing')
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'task.start', {'id': task['id']})

    def test_defer_carry_never_leaves_deadline_before_new_date(self):
        task = self.personal['test002']
        task['deadline'] = self.day
        self.store.put('tasks', task)
        target = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        self.store.action(self.store.user('test002'), 'task.defer', {
            'id': task['id'], 'reason': '时间不足', 'remaining': '继续处理', 'date': target,
        })
        carried = next(t for t in self.store.all('tasks') if t.get('originId') == task['id'])
        self.assertEqual(carried['deadline'], target)

    def test_defer_replaces_occurrence_and_marks_original_superseded(self):
        task = self.personal['test002']
        target = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        original = self.store.action(self.store.user('test002'), 'task.defer', {
            'id': task['id'], 'reason': '时间不足', 'remaining': '继续处理', 'date': target,
        })
        successor = next(t for t in self.store.all('tasks') if t.get('originId') == task['id'])
        self.assertEqual(original['supersededBy'], successor['id'])
        snapshot = {t['id']: t for t in self.store.snapshot(self.store.user('test002'))['tasks']}
        self.assertTrue(snapshot[task['id']].get('superseded'))
        self.assertEqual(snapshot[task['id']].get('supersededBy'), successor['id'])
        self.assertFalse(snapshot[successor['id']].get('superseded'))

    def test_completing_a_successor_settles_the_superseded_original(self):
        task = self.personal['test002']
        target = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        self.store.action(self.store.user('test002'), 'task.defer', {
            'id': task['id'], 'reason': '等待他人', 'remaining': '继续处理', 'date': target,
        })
        successor = next(t for t in self.store.all('tasks') if t.get('originId') == task['id'])
        self.store.action(self.store.user('test002'), 'task.complete',
                          {'id': successor['id'], 'summary': '依赖已完成', 'actual': 20})
        self.store.action(self.admin, 'task.review', {'id': successor['id'], 'accept': True})
        settled = self.store.get('tasks', task['id'])
        self.assertEqual(settled['status'], 'done')
        self.assertTrue(settled.get('carriedCompletion'))

    def test_deferred_chain_counts_once_in_diary_statistics(self):
        task = self.personal['test002']
        target = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        self.store.action(self.store.user('test002'), 'task.defer', {
            'id': task['id'], 'reason': '时间不足', 'remaining': '继续处理', 'date': target,
        })
        rows = {(r['date'], r['userId']): r for r in self.store.diary_statistics(self.admin, self.day, target)}
        self.assertEqual(rows[(self.day, 'test002')]['total'], 0)
        self.assertEqual(rows[(target, 'test002')]['total'], 1)

    def test_auto_carry_leaves_only_the_newest_occurrence_live(self):
        start = date.fromisoformat(self.day) - timedelta(days=2)
        task = self.store.put('tasks', {
            'name': '自动递延', 'date': start.isoformat(), 'duration': 30,
            'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'doing',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(8), TZ))
        chain = [t for t in self.store.all('tasks') if t.get('originId') == task['id'] or t['id'] == task['id']]
        live = [t for t in chain if not t.get('supersededBy')]
        self.assertEqual(len(live), 1)
        self.assertEqual(live[0]['date'], self.day)

    def test_task_auto_starts_when_scheduled_time_arrives(self):
        task = self.store.put('tasks', {
            'name': '到点自动开始', 'date': self.day, 'time': '00:01', 'duration': 30,
            'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'todo',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.snapshot(self.store.user('test002'))
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'doing')
        self.assertTrue(any(l.get('taskId') == task['id'] and l.get('kind') == 'auto_start' for l in self.store.all('logs')))

    def test_task_stays_todo_before_scheduled_time(self):
        task = self.store.put('tasks', {
            'name': '未来任务', 'date': self.day, 'time': '23:59', 'duration': 30,
            'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'todo',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.snapshot(self.store.user('test002'))
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'todo')

    def test_daily_reports_skip_noon_draft_and_fallback_at_midnight(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '日报规则', 'owner': 'test001', 'members': ['test002'], 'start': self.day,
        })
        self.store.action(self.store.user('test002'), 'report.save', {
            'kind': 'collaborator', 'projectId': project['id'], 'date': self.day,
            'content': {'done': '完成接口', 'risks': '无', 'next': '继续联调'},
        })
        midday = datetime.combine(date.fromisoformat(self.day), time(13), TZ)
        self.store.schedule(midday)
        self.assertFalse(any('12:00' in n.get('title', '') for n in self.store.all('notifications')))
        midnight = datetime.combine(date.fromisoformat(self.day) + timedelta(days=1), time(0, 1), TZ)
        self.store.schedule(midnight)
        notices = [n for n in self.store.all('notifications') if n['to'] == 'superadmin']
        self.assertTrue(any(n['title'].startswith('自动项目日报') for n in notices))
        self.assertTrue(any(n['title'].startswith('成员当日总结') for n in notices))

    def test_scheduler_catches_up_multiple_missed_days(self):
        start = date.fromisoformat(self.day) - timedelta(days=3)
        task = self.store.put('tasks', {
            'name': '跨日任务', 'date': start.isoformat(), 'duration': 30,
            'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'doing',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(8), TZ))
        chain = [t for t in self.store.all('tasks') if t.get('originId') == task['id'] or t['id'] == task['id']]
        self.assertEqual({t['date'] for t in chain}, {(start + timedelta(days=i)).isoformat() for i in range(4)})
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'deferred')
        self.assertEqual(next(t['status'] for t in chain if t['date'] == self.day), 'doing')


class TaskApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.store=Store(Path(self.temp.name)/'approval.sqlite3',seed=False)
        for name in ['superadmin','test001','test002']:
            self.store.create_user(name,'test-only-password',admin=name=='superadmin')
        self.admin=self.store.user('superadmin'); self.owner=self.store.user('test001'); self.member=self.store.user('test002'); self.day=now().date().isoformat()
        self.project=self.store.action(self.admin,'project.create',{'name':'approval','owner':'test001','members':['test002'],'start':self.day})
    def tearDown(self): self.store.close(); self.temp.cleanup()
    def test_member_completion_waits_for_owner_then_approves(self):
        task=self.store.action(self.admin,'task.create',{'name':'child','projectId':self.project['id'],'assignee':'test002','date':self.day})
        result=self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'已完成','actual':30})
        self.assertEqual(result['status'],'pending_approval'); self.assertEqual(result['completionSummary'],'已完成')
        notice=next(n for n in self.store.all('notifications') if n['to']=='test001' and n['kind']=='task_approval')
        self.store.action(self.owner,'task.review',{'id':task['id'],'accept':True})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'done')
        self.assertTrue(any(n['to']=='test002' and n['kind']=='task_approval' for n in self.store.all('notifications')))

    def test_snapshot_repairs_legacy_task_approval_delivery_to_owner(self):
        task=self.store.action(self.admin,'task.create',{'name':'legacy route','projectId':self.project['id'],'assignee':'test002','date':self.day})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'待审批','actual':20})
        stored=self.store.get('tasks',task['id']);stored['approval']['approver']='superadmin';self.store.put('tasks',stored)
        notices=[n for n in self.store.all('notifications') if n.get('reference')==task['id'] and n.get('kind')=='task_approval']
        notices[0]['to']='superadmin';self.store.put('notifications',notices[0]);self.store.db.commit()
        self.store.snapshot(self.owner)
        repaired=self.store.get('tasks',task['id'])
        self.assertEqual(repaired['approval']['approver'],'test001')
        self.assertTrue(any(n['to']=='test001' and n['reference']==task['id'] and not n['read'] for n in self.store.all('notifications')))

    def test_project_completion_requires_all_tasks_and_report_then_superadmin_review(self):
        task=self.store.action(self.admin,'task.create',{'name':'结项子任务','projectId':self.project['id'],'assignee':'test002','date':self.day})
        with self.assertRaises(Problem):
            self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'未完成报告'})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'完成','actual':20})
        self.store.action(self.owner,'task.review',{'id':task['id'],'accept':True})
        p=self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'全部子任务已完成，验收通过。'})
        self.assertEqual(p['status'],'pending_completion')
        self.assertEqual(p['completionReport'],'全部子任务已完成，验收通过。')
        self.assertTrue(any(n['to']=='superadmin' and n['kind']=='project_completion' for n in self.store.all('notifications')))
        self.store.action(self.admin,'project.complete_review',{'id':self.project['id'],'accept':True})
        self.assertEqual(self.store.get('projects',self.project['id'])['status'],'done')

    def test_project_completion_ignores_deferred_history_when_successor_is_done(self):
        """A deferred occurrence is history; its completed successor closes the project."""
        task=self.store.action(self.admin,'task.create',{
            'name':'递延后结项','projectId':self.project['id'],'assignee':'test002','date':self.day,
        })
        target=(date.fromisoformat(self.day)+timedelta(days=1)).isoformat()
        self.store.action(self.member,'task.defer',{
            'id':task['id'],'date':target,'reason':'等待依赖','remaining':'完成依赖后继续',
        })
        carried=next(t for t in self.store.all('tasks') if t.get('originId')==task['id'])
        self.store.action(self.member,'task.complete',{'id':carried['id'],'summary':'依赖已完成','actual':20})
        self.store.action(self.owner,'task.review',{'id':carried['id'],'accept':True})
        result=self.store.action(self.owner,'project.complete_request',{
            'id':self.project['id'],'report':'递延任务已在下一工作日完成并验收。',
        })
        self.assertEqual(result['status'],'pending_completion')

    def test_project_completion_uses_latest_occurrence_for_multi_day_auto_carry(self):
        task=self.store.action(self.admin,'task.create',{
            'name':'多日递延结项','projectId':self.project['id'],'assignee':'test002','date':self.day,
        })
        first=(date.fromisoformat(self.day)+timedelta(days=1)).isoformat()
        second=(date.fromisoformat(self.day)+timedelta(days=2)).isoformat()
        # Automatic carries share the root originId across every day.
        task['status']='deferred';self.store.put('tasks',task)
        carry1={**task,'id':'carry-1','originId':task['id'],'date':first,'status':'deferred'}
        carry2={**task,'id':'carry-2','originId':task['id'],'date':second,'status':'done'}
        self.store.put('tasks',carry1);self.store.put('tasks',carry2);self.store.db.commit()
        self.assertTrue(self.store.project_tasks_complete(self.project['id']))

    def test_project_completion_allows_deferred_lineage_after_successor_is_done(self):
        task=self.store.action(self.admin,'task.create',{'name':'递延后完成','projectId':self.project['id'],'assignee':'test002','date':self.day})
        target=(date.fromisoformat(self.day)+timedelta(days=1)).isoformat()
        original=self.store.action(self.member,'task.defer',{'id':task['id'],'date':target,'reason':'等待依赖','remaining':'继续处理'})
        successor=next(t for t in self.store.all('tasks') if t.get('originId')==original['id'])
        self.store.action(self.member,'task.complete',{'id':successor['id'],'summary':'递延后完成','actual':20})
        self.store.action(self.owner,'task.review',{'id':successor['id'],'accept':True})
        result=self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'递延任务已完成'})
        self.assertEqual(result['status'],'pending_completion')
    def test_standalone_member_task_also_requires_superadmin(self):
        task=self.store.put('tasks', {'name':'standalone','date':self.day,'duration':30,'assignee':'test002','projectId':None,'priority':'P1','status':'todo','fixed':False,'type':'通用'})
        self.store.db.commit()
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'已完成','actual':30})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'pending_approval')
        with self.assertRaises(Problem): self.store.action(self.owner,'task.review',{'id':task['id'],'accept':True})
        self.store.action(self.admin,'task.review',{'id':task['id'],'accept':True})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'done')

    def test_rejection_creates_rework_task(self):
        task=self.store.action(self.admin,'task.create',{'name':'child','projectId':self.project['id'],'assignee':'test002','date':self.day})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'请审核','actual':20})
        retry=self.store.action(self.owner,'task.review',{'id':task['id'],'accept':False,'reason':'请补充验收证据'})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'rejected')
        self.assertEqual(retry['status'],'todo'); self.assertEqual(retry['assignee'],'test002'); self.assertIn('补充验收证据',retry['desc'])

    def test_rejection_after_carry_starts_rework_after_today(self):
        old_day = (date.fromisoformat(self.day) - timedelta(days=2)).isoformat()
        project = self.store.action(self.admin, 'project.create', {
            'name': '跨日审批', 'owner': 'test001', 'members': ['test002'], 'start': old_day,
        })
        task = self.store.action(self.admin, 'task.create', {
            'name': '跨日待审', 'projectId': project['id'], 'assignee': 'test002', 'date': old_day,
        })
        self.store.action(self.member, 'task.complete', {'id': task['id'], 'summary': '待审', 'actual': 20})
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(8), TZ))
        self.store.action(self.owner, 'task.review', {'id': task['id'], 'accept': False, 'reason': '请补充证据'})
        retry = next(t for t in self.store.all('tasks') if t.get('reworkOf') == task['id'])
        self.assertGreater(retry['date'], self.day)
    def test_owner_completion_is_approved_by_project_owner(self):
        task=self.store.action(self.owner,'task.create',{'name':'owner task','projectId':self.project['id'],'assignee':'test001','date':self.day})
        self.store.action(self.owner,'task.complete',{'id':task['id'],'summary':'owner done','actual':30})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'pending_approval')
        self.store.action(self.owner,'task.review',{'id':task['id'],'accept':True})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'done')

    def test_task_edit_request_owner_approval_updates_task_and_notifies(self):
        task=self.store.action(self.admin,'task.create',{'name':'可调整','projectId':self.project['id'],'assignee':'test002','date':self.day})
        req=self.store.action(self.member,'task.edit_request',{'id':task['id'],'reason':'客户验收顺延','changes':{'date':self.day,'deadline':self.day,'assignee':'test002','name':'调整后任务'}})
        self.assertEqual(req['status'],'pending'); self.assertEqual(req['approver'],'test001')
        snap=self.store.snapshot(self.owner)
        self.assertEqual(snap['editRequests'][0]['requester'],'test002')
        approved=self.store.action(self.owner,'task.edit_review',{'id':req['id'],'accept':True})
        self.assertEqual(approved['name'],'调整后任务'); self.assertEqual(self.store.get('edit_requests',req['id'])['status'],'approved')
        self.assertTrue(any(n['to']=='test002' and n['kind']=='task_edit_approval' for n in self.store.all('notifications')))

    def test_task_edit_rejection_keeps_task_and_records_reason(self):
        task=self.store.action(self.admin,'task.create',{'name':'不可调整','projectId':self.project['id'],'assignee':'test002','date':self.day})
        req=self.store.action(self.member,'task.edit_request',{'id':task['id'],'reason':'尝试调整','date':self.day,'name':'新名称'})
        rejected=self.store.action(self.owner,'task.edit_review',{'id':req['id'],'accept':False,'reason':'请先补充依据'})
        self.assertEqual(rejected['status'],'rejected'); self.assertEqual(self.store.get('tasks',task['id'])['name'],'不可调整')
        self.assertTrue(any(n['to']=='test002' and n['kind']=='task_edit_rejected' and '补充依据' in n['body'] for n in self.store.all('notifications')))

    def test_task_edit_request_rules_and_superadmin_flow(self):
        task=self.store.action(self.owner,'task.create',{'name':'Owner任务','projectId':self.project['id'],'assignee':'test001','date':self.day})
        req=self.store.action(self.owner,'task.edit_request',{'id':task['id'],'reason':'改期限','changes':{'deadline':self.day}})
        self.assertEqual(req['approver'],'superadmin')
        with self.assertRaises(Problem): self.store.action(self.owner,'task.edit_request',{'id':task['id'],'reason':'重复','changes':{'name':'重复'}})
        self.store.action(self.admin,'task.edit_review',{'id':req['id'],'accept':True})
        self.assertEqual(self.store.get('tasks',task['id'])['deadline'],self.day)
        done=self.store.action(self.admin,'task.create',{'name':'已完成','projectId':self.project['id'],'assignee':'test002','date':self.day})
        self.store.action(self.member,'task.complete',{'id':done['id'],'summary':'完成','actual':20})
        with self.assertRaises(Problem): self.store.action(self.member,'task.edit_request',{'id':done['id'],'reason':'不能改','changes':{'name':'x'}})


    def test_project_delete_requires_name_confirmation_and_cascades(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'disposable project', 'owner': 'test001', 'members': ['test002'],
            'start': self.day, 'cycle': 'infinite',
        })
        for request in self.store.all('requests'):
            self.store.action(self.store.user(request['to']), 'request.respond', {'id': request['id'], 'accept': True})
        task = self.store.action(self.admin, 'task.create', {
            'name': 'child', 'projectId': project['id'], 'assignee': 'test002', 'date': self.day,
        })
        self.store.action(self.store.user('test002'), 'task.edit_request', {
            'id': task['id'], 'reason': '调整', 'changes': {'name': 'child renamed'},
        })
        self.assertTrue(any(r.get('taskId') == task['id'] for r in self.store.all('edit_requests')))

        with self.assertRaises(Problem) as wrong_name:
            self.store.action(self.admin, 'project.delete', {'id': project['id'], 'confirm': 'nope'})
        self.assertEqual(wrong_name.exception.status, 400)
        with self.assertRaises(Problem) as missing_confirm:
            self.store.action(self.store.user('test002'), 'project.delete', {'id': project['id']})
        self.assertEqual(missing_confirm.exception.status, 403)

        result = self.store.action(self.admin, 'project.delete', {'id': project['id'], 'confirm': project['name']})
        self.assertEqual(result['deleted'], True)
        self.assertEqual(result['tasks'], 1)
        self.assertFalse(any(p['id'] == project['id'] for p in self.store.all('projects')))
        self.assertFalse(any(t.get('projectId') == project['id'] for t in self.store.all('tasks')))
        self.assertFalse(any(r.get('taskId') == task['id'] for r in self.store.all('edit_requests')))
        self.assertFalse(any(n.get('reference') in (project['id'], task['id']) for n in self.store.all('notifications')))
        self.assertTrue(any(a['action'] == 'project.delete' for a in self.store.all('audit')))

    def test_project_owner_can_delete_own_project_with_confirmation(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'owner cleanup', 'owner': 'test001', 'members': [],
            'start': self.day, 'cycle': 'infinite',
        })
        owner = self.store.user('test001')
        with self.assertRaises(Problem):
            self.store.action(owner, 'project.delete', {'id': project['id'], 'confirm': 'wrong'})
        result = self.store.action(owner, 'project.delete', {'id': project['id'], 'confirm': 'owner cleanup'})
        self.assertEqual(result['deleted'], True)
        self.assertFalse(any(p['id'] == project['id'] for p in self.store.all('projects')))

    def test_account_delete_protects_builtin_self_and_open_work(self):
        self.store.create_user('extra', 'test-only-password')
        self.store.create_user('busy', 'test-only-password')
        self.store.put('tasks', {'name': 'busy task', 'date': self.day, 'duration': 30, 'assignee': 'busy',
                                 'projectId': None, 'priority': 'P1', 'status': 'todo', 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        # The built-in superadmin account can never be removed.
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'account.delete', {'id': 'superadmin', 'confirm': 'superadmin'})
        # A typed confirmation is required before anything is deleted.
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'account.delete', {'id': 'extra', 'confirm': 'nope'})
        self.assertTrue(any(u['id'] == 'extra' for u in self.store.users()))
        # An account with open work is refused so its responsibilities can be handed over.
        with self.assertRaises(Problem) as blocked:
            self.store.action(self.admin, 'account.delete', {'id': 'busy', 'confirm': 'busy'})
        self.assertEqual(blocked.exception.status, 409)
        self.assertTrue(any(u['id'] == 'busy' for u in self.store.users()))
        # A clean account is removed and the action is audited.
        result = self.store.action(self.admin, 'account.delete', {'id': 'extra', 'confirm': 'extra'})
        self.assertEqual(result['deleted'], True)
        self.assertFalse(any(u['id'] == 'extra' for u in self.store.users()))
        self.assertTrue(any(a['action'] == 'account.delete' for a in self.store.all('audit')))

    def test_account_delete_blocks_active_project_ownership(self):
        self.store.create_user('boss', 'test-only-password')
        self.store.action(self.admin, 'project.create', {
            'name': 'owned project', 'owner': 'boss', 'members': [],
            'start': self.day, 'cycle': 'infinite',
        })
        with self.assertRaises(Problem) as blocked:
            self.store.action(self.admin, 'account.delete', {'id': 'boss', 'confirm': 'boss'})
        self.assertEqual(blocked.exception.status, 409)
        self.assertTrue(any(u['id'] == 'boss' for u in self.store.users()))

    def test_account_delete_clears_personal_data_and_membership(self):
        self.store.create_user('extra', 'test-only-password')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'member project', 'owner': 'test001', 'members': ['extra'],
            'start': self.day, 'cycle': 'infinite',
        })
        self.assertEqual(self.store.get('projects', project['id'])['members'].get('extra'), 'accepted')
        self.store.login('extra', 'test-only-password')
        self.store.put('agent_messages', {'user': 'extra', 'role': 'user', 'content': 'hi'})
        self.store.put('diaries', {'id': f'diary:extra:{self.day}', 'author': 'extra', 'date': self.day, 'content': 'note'})
        self.store.put('notifications', {'to': 'extra', 'title': 't', 'body': 'b', 'kind': 'task', 'read': False})
        self.store.put('requests', {'projectId': project['id'], 'to': 'extra', 'status': 'pending', 'read': False})
        self.store.db.commit()
        result = self.store.action(self.admin, 'account.delete', {'id': 'extra', 'confirm': 'extra'})
        self.assertEqual(result['deleted'], True)
        self.assertFalse(any(u['id'] == 'extra' for u in self.store.users()))
        self.assertFalse(any(m.get('user') == 'extra' for m in self.store.all('agent_messages')))
        self.assertFalse(any(d.get('author') == 'extra' for d in self.store.all('diaries')))
        self.assertFalse(any(n.get('to') == 'extra' for n in self.store.all('notifications')))
        self.assertFalse(any(r.get('to') == 'extra' for r in self.store.all('requests')))
        self.assertFalse(any(r['user_id'] == 'extra' for r in self.store.db.execute('SELECT user_id FROM sessions')))
        self.assertNotIn('extra', self.store.get('projects', project['id'])['members'])


if __name__ == '__main__':
    unittest.main()
