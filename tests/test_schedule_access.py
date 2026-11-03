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

    def test_temp_tasks_outside_projects(self):
        member = self.store.user('test001')
        own = self.store.action(member, 'task.create', {
            'name': 'own errand', 'assignee': 'test001', 'date': self.day, 'duration': 20,
        })
        self.assertIsNone(own['projectId'])
        self.assertEqual(own['type'], '临时')
        self.store.action(member, 'task.complete', {'id': own['id'], 'summary': 'done', 'actual': 20, 'feeling': '顺利'})
        self.assertEqual(self.store.get('tasks', own['id'])['status'], 'done')
        handed = self.store.action(self.admin, 'task.create', {
            'name': 'admin errand', 'assignee': 'test002', 'date': self.day, 'duration': 20,
        })
        # Finishing it needs no sign-off; whoever handed it over is told.
        self.store.action(self.store.user('test002'), 'task.complete', {'id': handed['id'], 'summary': 'done', 'actual': 20})
        self.assertEqual(self.store.get('tasks', handed['id'])['status'], 'done')
        self.assertTrue(any(n['to'] == 'superadmin' and n['title'] == '任务已完成' for n in self.store.all('notifications')))
        self.assertIn(handed['id'], {t['id'] for t in self.store.snapshot(self.store.user('test002'))['tasks']})
        self.assertNotIn(handed['id'], {t['id'] for t in self.store.snapshot(member)['tasks']})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'task.create', {'name': 'self', 'assignee': 'superadmin', 'date': self.day})

    def test_a_diary_is_read_only_by_its_author_and_the_admins(self):
        owner, member = self.store.user('test001'), self.store.user('test002')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'private', 'owner': 'test001', 'members': ['test002'], 'start': self.day,
        })
        self.store.put('notifications', {
            'to': 'test001', 'title': '成员日记 · test002', 'body': '旧的抄送',
            'kind': 'diary', 'reference': 'old', 'read': False,
        })
        self.store.db.commit()
        self.store.action(member, 'diary.save', {
            'date': self.day, 'content': {'done': '联调', 'risks': '无', 'next': '上线', 'note': '有点累，想早点睡'},
        })
        snap = self.store.snapshot(owner)
        self.assertFalse(snap['diaries'])
        self.assertFalse(any('有点累' in str(n.get('body')) for n in self.store.all('notifications')))
        with self.assertRaises(Problem):
            self.store.action(owner, 'diary.get', {'date': self.day, 'userId': 'test002'})
        read = self.store.action(self.admin, 'diary.get', {'date': self.day, 'userId': 'test002'})
        self.assertEqual(read['content']['note'], '有点累，想早点睡')
        # The project summary its Owner reads says a diary came in, not what it says.
        content, missing = self.store.aggregate(self.store.get('projects', project['id']), self.day, now())
        self.assertEqual(missing, [])
        self.assertNotIn('联调', content['collaborators'])
        # 随记 stays out of the team brief.
        brief = self.store.compose_brief(self.day)
        row = next(m for m in brief['content']['members'] if m['id'] == 'test002')
        self.assertNotIn('note', row['summary'])
        # Copies delivered before, as notices or inside old automatic summaries,
        # are cleared the next time the store opens; the clean-up runs once.
        old = self.store.put('reports', {
            'kind': 'automatic', 'projectId': project['id'], 'date': self.day,
            'content': {'collaborators': 'test002（日记）：有点累，想早点睡\ntest003：未提交'},
        })
        self.store.db.execute("DELETE FROM jobs WHERE id='migrate:diary-privacy'")
        self.store.db.commit()
        path = self.store.path; self.store.close(); self.store = Store(path, seed=False)
        self.assertFalse(any(n.get('kind') == 'diary' for n in self.store.all('notifications')))
        self.assertEqual(self.store.get('reports', old['id'])['content']['collaborators'],
                         'test002：已写当日日记\ntest003：未提交')
        self.store.put('notifications', {'to': 'test001', 'title': '迟到的抄送', 'kind': 'diary', 'read': False})
        self.store.db.commit()
        path = self.store.path; self.store.close(); self.store = Store(path, seed=False)
        self.assertTrue(any(n.get('kind') == 'diary' for n in self.store.all('notifications')))

    def test_member_hands_a_temp_task_to_someone_else(self):
        giver, taker, other = (self.store.user(x) for x in ('test001', 'test002', 'test003'))
        task = self.store.action(giver, 'task.create', {
            'name': '帮忙核对报价', 'assignee': 'test002', 'date': self.day, 'duration': 30,
        })
        self.assertEqual((task['projectId'], task['creator'], task['assignee']), (None, 'test001', 'test002'))
        notice = next(n for n in self.store.all('notifications')
                      if n['to'] == 'test002' and n['reference'] == task['id'])
        self.assertEqual((notice['title'], notice['fresh']), ('收到任务指派', True))
        # Both ends see it; nobody else does.
        self.assertIn(task['id'], {t['id'] for t in self.store.snapshot(giver)['tasks']})
        self.assertIn(task['id'], {t['id'] for t in self.store.snapshot(taker)['tasks']})
        self.assertNotIn(task['id'], {t['id'] for t in self.store.snapshot(other)['tasks']})
        with self.assertRaises(Problem):
            self.store.action(giver, 'task.create', {'name': '给管理员', 'assignee': 'superadmin', 'date': self.day})
        # The giver adjusts and may hand it on; the taker asks the giver.
        moved = self.store.action(giver, 'task.update', {'id': task['id'], 'duration': 45})
        self.assertEqual(moved['duration'], 45)
        with self.assertRaises(Problem):
            self.store.action(taker, 'task.update', {'id': task['id'], 'duration': 10})
        tomorrow = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        req = self.store.action(taker, 'task.edit_request', {
            'id': task['id'], 'changes': {'date': tomorrow}, 'reason': '今天排满了',
        })
        self.assertEqual(req['approver'], 'test001')
        self.store.action(giver, 'task.edit_review', {'id': req['id'], 'accept': True})
        self.assertEqual(self.store.get('tasks', task['id'])['date'], tomorrow)
        # Progress goes back to the giver, who can also send finished work back.
        self.store.action(taker, 'task.complete', {'id': task['id'], 'summary': '核对完了', 'actual': 30})
        self.assertTrue(any(n['to'] == 'test001' and n['title'] == '任务已完成' for n in self.store.all('notifications')))
        with self.assertRaises(Problem):
            self.store.action(other, 'task.reopen', {'id': task['id'], 'reason': '不对'})
        reopened = self.store.action(giver, 'task.reopen', {'id': task['id'], 'reason': '少了一家'})
        self.assertEqual(reopened['status'], 'todo')

    def hand_task(self, giver='test001', taker='test002'):
        return self.store.action(self.store.user(giver), 'task.create', {
            'name': '帮忙核对', 'assignee': taker, 'date': self.day, 'duration': 30,
        })

    def test_a_disabled_giver_leaves_edit_approval_to_superadmin(self):
        task = self.hand_task()
        self.store.action(self.admin, 'account.toggle', {'id': 'test001', 'active': False})
        tomorrow = (date.fromisoformat(self.day) + timedelta(days=1)).isoformat()
        req = self.store.action(self.store.user('test002'), 'task.edit_request', {
            'id': task['id'], 'changes': {'date': tomorrow}, 'reason': '改期',
        })
        self.assertEqual(req['approver'], 'superadmin')

    def test_a_one_off_task_cannot_be_moved_to_an_admin(self):
        task = self.hand_task()
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'task.edit_request', {
                'id': task['id'], 'changes': {'assignee': 'superadmin'}, 'reason': '交给管理员',
            })

    def test_an_account_with_handed_out_work_is_not_deleted(self):
        task = self.hand_task()
        self.store.put('tasks', {**self.personal['test001'], 'status': 'done'})
        self.store.db.commit()
        delete = {'id': 'test001', 'confirm': 'test001'}
        with self.assertRaises(Problem) as error:
            self.store.action(self.admin, 'account.delete', delete)
        self.assertIn('临时任务', error.exception.message)
        self.store.action(self.store.user('test002'), 'task.complete', {
            'id': task['id'], 'summary': '完成', 'actual': 30,
        })
        self.store.action(self.admin, 'account.delete', delete)
        self.assertFalse(any(u['id'] == 'test001' for u in self.store.users()))

    def test_a_disabled_account_is_not_joined_until_enabled(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'later', 'owner': 'test001', 'start': self.day,
        })
        self.store.action(self.admin, 'account.toggle', {'id': 'test003', 'active': False})
        project = self.store.get('projects', project['id'])
        project['members']['test003'] = 'pending'; self.store.put('projects', project)
        self.assertEqual(self.store.invite(project), [])
        self.assertEqual(self.store.get('projects', project['id'])['members']['test003'], 'pending')
        self.store.action(self.admin, 'account.toggle', {'id': 'test003', 'active': True})
        self.assertEqual(self.store.invite(self.store.get('projects', project['id'])), ['test003'])

    def test_a_reopened_project_gets_back_the_work_it_closed(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'reopen', 'owner': 'test001', 'members': ['test002'], 'start': self.day,
        })
        make = lambda name: self.store.action(self.admin, 'task.create', {
            'name': name, 'projectId': project['id'], 'assignee': 'test002', 'date': self.day,
        })
        waiting, running = make('waiting'), make('running')
        self.store.action(self.store.user('test002'), 'task.start', {'id': running['id']})
        self.store.action(self.admin, 'project.complete', {'id': project['id']})
        self.assertEqual(self.store.get('tasks', running['id'])['status'], 'skipped')
        self.store.action(self.admin, 'project.update', {'id': project['id'], 'status': 'active'})
        self.assertEqual(self.store.get('tasks', waiting['id'])['status'], 'todo')
        self.assertEqual(self.store.get('tasks', running['id'])['status'], 'doing')

    def test_the_week_report_tells_filed_days_from_composed_ones(self):
        week = self.store.action(self.admin, 'brief.week', {'date': self.day})
        self.assertEqual([b['filed'] for b in week['briefs'] if b['date'] == self.day], [False])
        self.store.build_brief(self.day)
        week = self.store.action(self.admin, 'brief.week', {'date': self.day})
        self.assertEqual([b['filed'] for b in week['briefs'] if b['date'] == self.day], [True])

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
        # Joining is automatic: no request waits in test003's inbox, one notice says so.
        self.assertEqual(self.store.get('projects', project['id'])['members']['test003'], 'accepted')
        self.assertFalse(any(r['to'] == 'test003' and r['status'] == 'pending' for r in self.store.all('requests')))
        joined = [n for n in self.store.all('notifications') if n['to'] == 'test003' and n['title'] == '已加入项目']
        self.assertEqual(len(joined), 1)
        self.assertTrue(joined[0]['fresh'])

    def test_a_member_who_left_and_is_added_again_gets_their_work_back(self):
        owner, member = self.store.user('test001'), self.store.user('test002')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'comeback', 'owner': 'test001', 'start': self.day,
        })
        self.store.action(owner, 'project.invite', {'id': project['id'], 'members': ['test002']})
        task = self.store.action(owner, 'task.create', {
            'name': 'kept', 'projectId': project['id'], 'assignee': 'test002', 'date': self.day,
        })
        self.store.action(member, 'project.member.remove', {'id': project['id'], 'member': 'test002'})
        self.assertNotIn(task['id'], {t['id'] for t in self.store.snapshot(member)['tasks']})
        self.assertEqual(self.store.get('tasks', task['id'])['assignee'], 'test002')
        self.store.action(owner, 'project.invite', {'id': project['id'], 'members': ['test002']})
        self.assertIn(task['id'], {t['id'] for t in self.store.snapshot(member)['tasks']})

    def test_invitations_left_waiting_from_before_are_accepted(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'legacy invite', 'owner': 'test001', 'start': self.day,
        })
        project['members']['test003'] = 'pending'; self.store.put('projects', project)
        request = self.store.put('requests', {
            'projectId': project['id'], 'to': 'test003', 'status': 'pending', 'read': False,
        })
        self.store.db.commit()
        self.store.snapshot(self.store.user('test003'))
        self.assertEqual(self.store.get('projects', project['id'])['members']['test003'], 'accepted')
        self.assertEqual(self.store.get('requests', request['id'])['status'], 'accepted')

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
        # setUp's standalone tasks are dated today, so they count only while
        # today falls inside the project period.
        in_period = '2026-09-01' <= self.day <= '2026-09-30'
        self.assertEqual(loads['counts'], {'test002': 2 + in_period, 'test003': int(in_period)})
        self.assertNotIn('tasks', loads)
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'project.member_loads', {'id': project['id']})

    def test_member_loads_for_a_task_window_sum_minutes_inside_it(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'window check', 'owner': 'test001', 'members': ['test002'],
            'start': '2026-12-01', 'end': '2026-12-31', 'cycle': 'range',
        })
        for name, day, deadline, minutes in (('early', '2026-12-05', None, 60), ('spans', '2026-12-18', '2026-12-20', 30)):
            self.store.action(self.admin, 'task.create', {
                'name': name, 'projectId': project['id'], 'assignee': 'test002',
                'date': day, 'deadline': deadline, 'duration': minutes,
            })
        self.store.put('tasks', {'name': 'elsewhere', 'assignee': 'test002', 'projectId': None,
                                 'date': '2026-12-21', 'duration': 45, 'priority': 'P1',
                                 'status': 'todo', 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        loads = self.store.action(self.store.user('test001'), 'project.member_loads',
                                  {'id': project['id'], 'start': '2026-12-20', 'end': '2026-12-21'})
        self.assertEqual(loads['minutes']['test002'], 75)
        self.assertEqual(loads['minutes']['test003'], 0)
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test001'), 'project.member_loads',
                              {'id': project['id'], 'start': '2026-12-21', 'end': '2026-12-20'})

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

    def test_invite_resolves_a_waiting_request_without_allowing_stale_rejection(self):
        project = self.store.action(self.admin, 'project.create', {'name': 'pending invite', 'owner': 'test001'})
        owner = self.store.user('test001')
        # A request from before joining became automatic is still waiting.
        project['members']['test002'] = 'pending'; self.store.put('projects', project)
        request = self.store.put('requests', {
            'projectId': project['id'], 'to': 'test002', 'status': 'pending', 'read': False,
        })
        self.store.db.commit()
        self.store.action(owner, 'project.invite', {'id': project['id'], 'members': ['test002']})
        self.assertEqual(self.store.get('projects', project['id'])['members']['test002'], 'accepted')
        self.assertEqual(self.store.get('requests', request['id'])['status'], 'accepted')
        self.store.action(owner, 'task.create', {'name': 'on time', 'projectId': project['id'], 'assignee': 'test002'})
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

    def test_unfinished_fixed_task_carries_to_the_next_day(self):
        yesterday = (date.fromisoformat(self.day) - timedelta(days=1)).isoformat()
        rule = self.store.action(self.admin, 'repeat.create', {
            'name': '日报', 'assignees': ['test002'], 'frequency': 'daily', 'start': yesterday,
        })
        occurrence = self.store.put('tasks', {
            'id': f'repeat:{rule["id"]}:test002:{yesterday}', 'repeatId': rule['id'], 'name': '日报',
            'date': yesterday, 'time': '09:00', 'duration': 30, 'assignee': 'test002', 'projectId': None,
            'priority': 'P1', 'status': 'todo', 'fixed': True, 'type': '固定安排',
        })
        self.store.db.commit()
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(8), TZ))
        source = self.store.get('tasks', occurrence['id'])
        self.assertEqual(source['status'], 'deferred')
        carried = self.store.get('tasks', source['supersededBy'])
        self.assertEqual((carried['date'], carried['status'], carried['originId']), (self.day, 'todo', occurrence['id']))
        self.assertTrue(carried['fixed'])
        # Today's own occurrence is separate work, and the old day drops out of the member's board.
        member_tasks = self.store.snapshot(self.store.user('test002'))['tasks']
        live = [t for t in member_tasks if t.get('repeatId') == rule['id'] and not t.get('superseded') and t['date'] <= self.day]
        self.assertEqual([t['date'] for t in live], [self.day, self.day])
        self.assertTrue(next(t for t in member_tasks if t['id'] == occurrence['id'])['superseded'])
        # Skipping today's occurrence leaves the carried one alone.
        self.store.action(self.admin, 'repeat.skip', {'id': rule['id'], 'date': self.day})
        self.assertIn(self.store.get('tasks', carried['id'])['status'], ('todo', 'doing'))
        self.assertEqual(self.store.get('tasks', f'repeat:{rule["id"]}:test002:{self.day}')['status'], 'skipped')
        # A second scheduler run the same day carries nothing more.
        before = len(self.store.all('tasks'))
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(9), TZ))
        self.assertEqual(len(self.store.all('tasks')), before)

    def test_multi_day_task_is_not_carried_inside_its_span(self):
        day = date.fromisoformat(self.day)
        task = self.store.put('tasks', {
            'name': '跨三天', 'date': (day - timedelta(days=1)).isoformat(), 'deadline': (day + timedelta(days=1)).isoformat(),
            'duration': 120, 'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'doing',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(8), TZ))
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'doing')
        self.assertFalse(any(t.get('originId') == task['id'] for t in self.store.all('tasks')))
        self.assertFalse(any(l['taskId'] == task['id'] and l['kind'] == 'defer' for l in self.store.all('logs')))

    def test_overdue_multi_day_task_moves_once_to_the_day_after_its_span(self):
        day = date.fromisoformat(self.day)
        task = self.store.put('tasks', {
            'name': '超期跨天', 'date': (day - timedelta(days=4)).isoformat(), 'deadline': (day - timedelta(days=2)).isoformat(),
            'duration': 60, 'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'todo',
            'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(8), TZ))
        chain = sorted((t for t in self.store.all('tasks') if t.get('originId') == task['id']), key=lambda t: t['date'])
        # One hop to the day after the span, then the ordinary daily carry to today.
        self.assertEqual([t['date'] for t in chain], [(day - timedelta(days=1)).isoformat(), self.day])
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'deferred')

    def test_carries_made_inside_a_span_are_folded_back(self):
        day = date.fromisoformat(self.day)
        source = self.store.put('tasks', {
            'name': '旧递延', 'date': (day - timedelta(days=1)).isoformat(), 'deadline': (day + timedelta(days=1)).isoformat(),
            'duration': 90, 'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'deferred',
            'fixed': False, 'type': '通用', 'supersededBy': 'old-copy',
        })
        self.store.put('tasks', {**source, 'id': 'old-copy', 'date': self.day, 'originId': source['id'], 'status': 'doing',
                                 'supersededBy': None})
        self.store.put('logs', {'taskId': source['id'], 'actor': 'system', 'kind': 'defer', 'nextTaskId': 'old-copy',
                                'target': self.day, 'date': self.day, 'createdAt': now().isoformat()})
        self.store.put('logs', {'taskId': 'old-copy', 'actor': 'system', 'kind': 'auto_start', 'date': self.day, 'createdAt': now().isoformat()})
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(8), TZ))
        restored = self.store.get('tasks', source['id'])
        self.assertEqual((restored['status'], restored.get('supersededBy'), restored['date']), ('doing', None, source['date']))
        self.assertFalse(any(t['id'] == 'old-copy' for t in self.store.all('tasks')))
        kinds = [l['kind'] for l in self.store.all('logs') if l['taskId'] == source['id']]
        self.assertEqual(kinds, ['auto_start'])
        live = [t for t in self.store.snapshot(self.store.user('test002'))['tasks'] if t['name'] == '旧递延']
        self.assertEqual([(t['id'], bool(t.get('superseded'))) for t in live], [(source['id'], False)])

    def test_a_finished_in_span_copy_folds_back_as_finished_work(self):
        day = date.fromisoformat(self.day)
        source = self.store.put('tasks', {
            'name': '已完成的跨天', 'date': (day - timedelta(days=1)).isoformat(), 'deadline': (day + timedelta(days=1)).isoformat(),
            'duration': 90, 'assignee': 'test002', 'projectId': None, 'priority': 'P1', 'status': 'done',
            'carriedCompletion': True, 'fixed': False, 'type': '通用', 'supersededBy': 'done-copy',
        })
        self.store.put('tasks', {**source, 'id': 'done-copy', 'date': self.day, 'originId': source['id'], 'status': 'done',
                                 'carriedCompletion': None, 'supersededBy': None, 'completionSummary': '做完了'})
        self.store.put('logs', {'taskId': source['id'], 'actor': 'system', 'kind': 'defer', 'nextTaskId': 'done-copy',
                                'target': self.day, 'date': self.day, 'createdAt': now().isoformat()})
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(8), TZ))
        restored = self.store.get('tasks', source['id'])
        self.assertEqual((restored['status'], restored['completionSummary']), ('done', '做完了'))
        self.assertFalse(restored.get('carriedCompletion'))
        # Its assignee can still correct the record, which a settled history row would refuse.
        self.store.action(self.store.user('test002'), 'task.completion.update', {'id': source['id'], 'summary': '补充说明'})

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
        # The superadmin gets one team brief for the day instead of a notice per report.
        self.assertEqual([n['title'] for n in notices], [f'团队日报 · {self.day}'])
        brief = self.store.get('reports', f'brief:{self.day}')
        project_entry = next(p for p in brief['content']['projects'] if p['id'] == project['id'])
        self.assertEqual(project_entry['source'], 'auto')
        self.assertIn('test002', project_entry['content']['collaborators'])
        self.assertTrue(any('Owner 未提交' in r for r in brief['content']['risks']))
        # The automatic project report is still filed for the record.
        self.assertTrue(any(r.get('kind') == 'automatic' and r['projectId'] == project['id'] for r in self.store.all('reports')))
        # Owners still hear from their collaborators directly.
        self.assertTrue(any(n['to'] == 'test001' and n['title'].startswith('协作者进度') for n in self.store.all('notifications')))

    def test_brief_is_announced_once_and_kept_current(self):
        day = date.fromisoformat(self.day)
        yesterday, older = (day - timedelta(days=1)).isoformat(), (day - timedelta(days=3)).isoformat()
        for name, when, status in (('昨天完成', yesterday, 'done'), ('昨天没做完', yesterday, 'doing'), ('三天前', older, 'done')):
            self.store.put('tasks', {'name': name, 'date': when, 'duration': 30, 'assignee': 'test002', 'projectId': None,
                                     'priority': 'P1', 'status': status, 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(0, 5), TZ))
        self.store.schedule(datetime.combine(day, time(0, 6), TZ))
        briefs = [n for n in self.store.all('notifications') if n['kind'] == 'brief']
        # Older days are filed quietly; the day just finished is announced once.
        self.assertEqual([n['title'] for n in briefs], [f'团队日报 · {yesterday}'])
        self.assertTrue(self.store.get('reports', f'brief:{older}'))
        member = next(m for m in self.store.get('reports', f'brief:{yesterday}')['content']['members'] if m['id'] == 'test002')
        self.assertEqual((member['completed'], member['tasks'], member['source']), (1, 2, 'auto'))
        # People with nothing that day are left out, even though the digest wrote them an automatic diary.
        self.assertEqual([m['id'] for m in self.store.get('reports', f'brief:{yesterday}')['content']['members']], ['test002'])
        self.assertFalse(any(n['to'] == 'superadmin' and n['kind'] in ('diary', 'diary_digest') for n in self.store.all('notifications')))
        # A diary written late updates the filed brief without a second notice.
        self.store.action(self.store.user('test002'), 'diary.save', {'date': yesterday, 'content': {'done': '补记：联调完成', 'risks': '无', 'next': '上线'}})
        member = next(m for m in self.store.get('reports', f'brief:{yesterday}')['content']['members'] if m['id'] == 'test002')
        self.assertEqual((member['source'], member['summary']['done']), ('diary', '补记：联调完成'))
        self.assertEqual(len([n for n in self.store.all('notifications') if n['kind'] == 'brief']), 1)
        # Admins get an index card in the snapshot and the full brief on request; members get neither.
        cards = [r for r in self.store.snapshot(self.admin)['reports'] if r['kind'] == 'brief']
        self.assertEqual(sorted(c['date'] for c in cards), [older, yesterday])
        self.assertNotIn('content', cards[0])
        self.assertEqual(self.store.action(self.admin, 'brief.get', {'date': yesterday})['date'], yesterday)
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'brief.get', {'date': yesterday})
        self.assertFalse(any(r['kind'] == 'brief' for r in self.store.snapshot(self.store.user('test002'))['reports']))

    def test_admin_rewrites_a_filed_brief_and_exports_the_week(self):
        day = date.fromisoformat(self.day)
        yesterday = (day - timedelta(days=1)).isoformat()
        self.store.put('tasks', {'name': '联调', 'date': yesterday, 'duration': 60, 'assignee': 'test002', 'projectId': None,
                                 'priority': 'P1', 'status': 'done', 'fixed': False, 'type': '通用'})
        self.store.db.commit()
        self.store.schedule(datetime.combine(day, time(0, 5), TZ))
        before = self.store.action(self.admin, 'brief.get', {'date': yesterday})
        auto_risks = before['content']['risks']
        edited = self.store.action(self.admin, 'brief.update', {'date': yesterday, 'risks': ['  周三前要定版  ', ''],
                                                                'members': {'test002': {'done': '联调完成，接口已对齐', 'next': before['content']['members'][0]['summary'].get('next', '')}}})
        self.assertEqual(edited['content']['risks'], ['周三前要定版'])
        member = edited['content']['members'][0]
        self.assertEqual((member['summary']['done'], member['edited']), ('联调完成，接口已对齐', True))
        # Only what changed is kept; unchanged fields are not copied into the overlay.
        self.assertEqual(self.store.get('reports', f'brief:{yesterday}')['edits']['members'], {'test002': {'done': '联调完成，接口已对齐'}})
        # A late diary rebuilds the brief underneath, and the admin's changes survive it.
        self.store.action(self.store.user('test002'), 'diary.save', {'date': yesterday, 'content': {'done': '补记', 'risks': '无', 'next': '上线'}})
        again = self.store.action(self.admin, 'brief.get', {'date': yesterday})
        self.assertEqual((again['content']['risks'], again['content']['members'][0]['summary']['done'], again['content']['members'][0]['summary']['next']),
                         (['周三前要定版'], '联调完成，接口已对齐', '上线'))
        self.assertNotEqual(auto_risks, again['content']['risks'])
        with self.assertRaises(Problem) as error:
            self.store.action(self.store.user('test002'), 'brief.update', {'date': yesterday, 'risks': []})
        self.assertEqual(error.exception.status, 403)
        # The week runs Saturday to Friday like the week view and stops at today.
        week = self.store.action(self.admin, 'brief.week', {'date': yesterday})
        saturday = date.fromisoformat(yesterday) - timedelta(days=(date.fromisoformat(yesterday).weekday() + 2) % 7)
        self.assertEqual(saturday.weekday(), 5)
        self.assertEqual((week['start'], week['end']), (saturday.isoformat(), (saturday + timedelta(days=6)).isoformat()))
        self.assertTrue(all(week['start'] <= b['date'] <= min(week['end'], self.day) for b in week['briefs']))
        filed = next(b for b in week['briefs'] if b['date'] == yesterday)
        self.assertEqual(filed['content']['risks'], ['周三前要定版'])
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test002'), 'brief.week', {'date': yesterday})

    def test_inbox_notices_can_be_deleted_one_by_one_or_in_bulk(self):
        member, other = self.store.user('test002'), self.store.user('test003')
        notes = [self.store.notify('test002', f'通知 {i}', '内容', 'task') for i in range(4)]
        theirs = self.store.notify('test003', '别人的', '内容', 'task')
        self.store.action(member, 'inbox.read', {'id': notes[0]['id']})
        self.assertEqual(self.store.action(member, 'inbox.delete', {'ids': [notes[1]['id'], notes[2]['id']]})['deleted'], 2)
        with self.assertRaises(Problem):
            self.store.action(member, 'inbox.delete', {'ids': [theirs['id']]})
        with self.assertRaises(Problem):
            self.store.action(member, 'inbox.delete', {'ids': []})
        # Clearing the read ones leaves unread notices and other people's alone.
        self.assertEqual(self.store.action(member, 'inbox.delete', {'read': True})['deleted'], 1)
        left = {n['id'] for n in self.store.all('notifications')}
        self.assertEqual(left & {n['id'] for n in notes}, {notes[3]['id']})
        self.assertIn(theirs['id'], left)
        self.store.action(other, 'inbox.delete', {'ids': [theirs['id']]})

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


class CreationPolicyTests(unittest.TestCase):
    """Rule groups decide whether members start projects and tasks directly, by request, or not at all, and how far their AI assistant goes."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'creation.sqlite3', seed=False)
        for name in ['superadmin', 'test001', 'test002', 'test003']:
            self.store.create_user(name, 'test-only-password', admin=name == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.day = now().date().isoformat()
        self.project = self.store.action(self.admin, 'project.create', {
            'name': '协作项目', 'owner': 'test001', 'members': ['test002', 'test003'], 'start': self.day})

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def member(self, name):
        return self.store.user(name)

    def set_group(self, rules, members=('test002',)):
        groups = [{'id': 'default', 'name': '普通用户', 'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none'},
                  {'id': 'leads', 'name': '组长', **rules}]
        return self.store.action(self.admin, 'creation.update', {'groups': groups, 'assign': {m: 'leads' for m in members}})

    def test_default_group_keeps_the_original_rules(self):
        rules = self.store.snapshot(self.member('test002'))['creationRules']
        self.assertEqual((rules['group'], rules['project'], rules['tempTask'], rules['projectTask']), ('default', 'approval', 'direct', 'none'))
        self.assertEqual(self.store.snapshot(self.admin)['creationRules']['projectTask'], 'direct')
        self.assertIsNone(self.store.snapshot(self.member('test002'))['creationPolicy'])
        self.assertEqual(self.store.snapshot(self.admin)['creationPolicy']['groups'][0]['id'], 'default')
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test002'), 'task.create', {'name': 'x', 'projectId': self.project['id'], 'assignee': 'test002', 'date': self.day})
        self.assertEqual(error.exception.status, 403)

    def test_only_superadmin_edits_groups_and_bad_rules_are_refused(self):
        self.store.create_user('boss', 'test-only-password')
        self.store.action(self.admin, 'account.role', {'id': 'boss', 'role': 'admin'})
        for who in (self.member('test002'), self.store.user('boss')):
            with self.assertRaises(Problem) as error:
                self.store.action(who, 'creation.update', {'groups': [{'id': 'default', 'name': '普通用户', 'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'}]})
            self.assertEqual(error.exception.status, 403)
        bad = [
            [{'id': 'leads', 'name': '组长', 'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'}],
            [{'id': 'default', 'name': '普通用户', 'project': 'maybe', 'tempTask': 'direct', 'projectTask': 'none'}],
            [{'id': 'default', 'name': '普通用户', 'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'},
             {'id': 'b', 'name': '普通用户', 'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'}],
            [{'id': 'Bad Id', 'name': '组长', 'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'}],
        ]
        for groups in bad:
            with self.assertRaises(Problem) as error:
                self.store.action(self.admin, 'creation.update', {'groups': groups})
            self.assertEqual(error.exception.status, 400)
        # Admin accounts and unknown ids are never filed into a group.
        policy = self.set_group({'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'}, members=('test002', 'boss', 'ghost'))
        self.assertEqual(policy['assign'], {'test002': 'leads'})

    def test_group_decides_whether_a_project_starts_at_once(self):
        self.set_group({'project': 'direct', 'tempTask': 'direct', 'projectTask': 'none'})
        started = self.store.action(self.member('test002'), 'project.create', {'name': '组长项目', 'members': ['test003'], 'start': self.day})
        self.assertEqual((started['status'], started['owner']), ('active', 'test002'))
        self.assertEqual(started['members']['test003'], 'accepted')
        self.assertFalse(any(n['kind'] == 'approval' and n['reference'] == started['id'] for n in self.store.all('notifications')))
        # Someone in the default group still asks first.
        asked = self.store.action(self.member('test003'), 'project.create', {'name': '普通申请', 'start': self.day})
        self.assertEqual(asked['status'], 'pending')
        self.set_group({'project': 'none', 'tempTask': 'direct', 'projectTask': 'none'})
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test002'), 'project.create', {'name': '不允许', 'start': self.day})
        self.assertEqual(error.exception.status, 403)

    def test_one_off_task_request_goes_to_the_admins(self):
        self.set_group({'project': 'approval', 'tempTask': 'approval', 'projectTask': 'none'})
        result = self.store.action(self.member('test002'), 'task.create', {'name': '采购', 'assignee': 'test002', 'date': self.day, 'duration': 40})
        self.assertTrue(result['requested'])
        self.assertFalse(any(t['name'] == '采购' for t in self.store.all('tasks')))
        notice = next(n for n in self.store.all('notifications') if n['kind'] == 'task_request')
        self.assertEqual((notice['to'], notice['reference']), ('superadmin', result['id']))
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test001'), 'task.request_review', {'id': result['id'], 'accept': True})
        self.assertEqual(error.exception.status, 403)
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'task.request_review', {'id': result['id'], 'accept': False})
        approved = self.store.action(self.admin, 'task.request_review', {'id': result['id'], 'accept': True})
        task = self.store.get('tasks', approved['taskId'])
        self.assertEqual((task['assignee'], task['creator'], task['approvedBy'], task['duration'], task['projectId']), ('test002', 'test002', 'superadmin', 40, None))
        self.assertTrue(self.store.get('notifications', notice['id'])['read'])
        self.assertTrue(any(n['to'] == 'test002' and n['title'] == '任务申请已通过' for n in self.store.all('notifications')))
        self.assertFalse(any(n['to'] == 'test002' and n['title'] == '收到任务指派' for n in self.store.all('notifications')))
        with self.assertRaises(Problem) as error:
            self.store.action(self.admin, 'task.request_review', {'id': result['id'], 'accept': True})
        self.assertEqual(error.exception.status, 409)
        self.set_group({'project': 'approval', 'tempTask': 'none', 'projectTask': 'none'})
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test002'), 'task.create', {'name': '不允许', 'assignee': 'test002', 'date': self.day})
        self.assertEqual(error.exception.status, 403)

    def test_collaborator_adds_project_work_directly_or_by_owner_approval(self):
        pid = self.project['id']
        self.set_group({'project': 'approval', 'tempTask': 'direct', 'projectTask': 'direct'})
        direct = self.store.action(self.member('test002'), 'task.create', {'name': '补测试', 'projectId': pid, 'assignee': 'test003', 'date': self.day})
        self.assertEqual((direct['creator'], direct['assignee']), ('test002', 'test003'))
        self.assertTrue(any(n['to'] == 'test001' and n['title'] == '协作者新建任务' for n in self.store.all('notifications')))
        self.assertTrue(any(n['to'] == 'test003' and n['title'] == '收到任务指派' for n in self.store.all('notifications')))
        # Members of the group still cannot add work to a project they are not in.
        other = self.store.action(self.admin, 'project.create', {'name': '别的项目', 'owner': 'test003', 'start': self.day})
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test002'), 'task.create', {'name': 'x', 'projectId': other['id'], 'assignee': 'test002', 'date': self.day})
        self.assertEqual(error.exception.status, 403)

        self.set_group({'project': 'approval', 'tempTask': 'direct', 'projectTask': 'approval'})
        asked = self.store.action(self.member('test002'), 'task.create', {'name': '整理文档', 'projectId': pid, 'assignee': 'test002', 'date': self.day})
        self.assertEqual((asked['approver'], asked['projectId']), ('test001', pid))
        visible = lambda name: {r['id'] for r in self.store.snapshot(self.member(name))['taskRequests']}
        self.assertIn(asked['id'], visible('test001'))
        self.assertIn(asked['id'], visible('test002'))
        self.assertNotIn(asked['id'], visible('test003'))
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test003'), 'task.request_review', {'id': asked['id'], 'accept': True})
        self.assertEqual(error.exception.status, 403)
        rejected = self.store.action(self.member('test001'), 'task.request_review', {'id': asked['id'], 'accept': False, 'reason': '本周排满'})
        self.assertEqual((rejected['status'], rejected['reason']), ('rejected', '本周排满'))
        self.assertTrue(any(n['to'] == 'test002' and n['title'] == '任务申请被驳回' for n in self.store.all('notifications')))
        again = self.store.action(self.member('test002'), 'task.create', {'name': '整理文档', 'projectId': pid, 'assignee': 'test002', 'date': self.day})
        done = self.store.action(self.member('test001'), 'task.request_review', {'id': again['id'], 'accept': True})
        task = self.store.get('tasks', done['taskId'])
        self.assertEqual((task['projectId'], task['assignee'], task['creator'], task['approvedBy']), (pid, 'test002', 'test002', 'test001'))
        # The project's own Owner is never asked to request work in it.
        own = self.store.action(self.member('test001'), 'task.create', {'name': 'Owner 自己排', 'projectId': pid, 'assignee': 'test002', 'date': self.day})
        self.assertNotIn('requested', own)

    def test_members_of_a_removed_group_fall_back_to_the_default(self):
        self.set_group({'project': 'direct', 'tempTask': 'direct', 'projectTask': 'direct'})
        self.assertEqual(self.store.creation_rules(self.member('test002'))['group'], 'leads')
        self.store.action(self.admin, 'creation.update', {'groups': [{'id': 'default', 'name': '普通用户', 'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none'}], 'assign': {'test002': 'leads'}})
        rules = self.store.creation_rules(self.member('test002'))
        self.assertEqual((rules['group'], rules['project']), ('default', 'approval'))

    def test_rule_group_opens_or_closes_the_ai_assistant(self):
        # Groups saved before the assistant rule existed read as 查询与规划.
        self.set_group({'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none'})
        lead = self.member('test002')
        self.assertEqual(self.store.action(lead, 'agent.capabilities', {})['mode'], 'readonly')
        with self.assertRaises(Problem) as error:
            self.store.action(self.admin, 'creation.update', {'groups': [{'id': 'default', 'name': '默认规则', 'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none', 'agent': 'everything'}]})
        self.assertEqual(error.exception.status, 400)

        self.set_group({'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none', 'agent': 'off'})
        caps = self.store.action(self.member('test002'), 'agent.capabilities', {})
        self.assertEqual((caps['mode'], caps['tools']), ('off', []))
        self.assertEqual(self.store.snapshot(self.member('test002'))['creationRules']['agent'], 'off')
        with self.assertRaises(Problem) as error:
            self.store.action(self.member('test002'), 'agent.authorize', {'tool': 'agent.chat'})
        self.assertEqual(error.exception.status, 403)
        # The default group is untouched by it.
        self.assertEqual(self.store.action(self.member('test003'), 'agent.capabilities', {})['mode'], 'readonly')

        self.set_group({'project': 'approval', 'tempTask': 'direct', 'projectTask': 'none', 'agent': 'operate'})
        lead = self.member('test002')
        caps = self.store.action(lead, 'agent.capabilities', {})
        self.assertEqual(caps['mode'], 'operator')
        self.assertIn('task.create', caps['requiresConfirmation'])
        self.assertNotIn('account.manage', caps['tools'])
        made = self.store.action(lead, 'agent.execute', {'action': 'task.create', 'confirmed': True, 'data': {
            'name': '助手代建', 'assignee': 'test002', 'date': self.day}})
        self.assertEqual((made['name'], made['assignee']), ('助手代建', 'test002'))
        # It still acts with the member's own rights, nothing more.
        for payload in ({'action': 'task.create', 'data': {'name': 'x', 'projectId': self.project['id'], 'assignee': 'test002', 'date': self.day}},
                        {'action': 'account.create', 'data': {'username': 'test009', 'password': 'password-long'}}):
            with self.subTest(action=payload['action']), self.assertRaises(Problem) as error:
                self.store.action(lead, 'agent.execute', {**payload, 'confirmed': True})
            self.assertEqual(error.exception.status, 403)


class AccountPageTests(unittest.TestCase):
    """个性签名, and the account order superadmin drags on the account page."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'signature.sqlite3', seed=False)
        for name in ['superadmin', 'test001']:
            self.store.create_user(name, 'test-only-password', admin=name == 'superadmin')

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_superadmin_sets_the_account_order_and_cannot_move_itself(self):
        admin = self.store.user('superadmin')
        self.store.create_user('test002', 'test-only-password')
        saved = self.store.action(admin, 'account.order', {'order': ['test002', 'ghost', 'test001', 'test002', 'superadmin']})
        self.assertEqual(saved['order'], ['test002', 'test001', 'superadmin'])
        self.assertEqual(self.store.snapshot(admin)['accountOrder'], ['test002', 'test001', 'superadmin'])
        self.assertEqual(self.store.snapshot(self.store.user('test001'))['accountOrder'], [])
        with self.assertRaises(Problem) as error:
            self.store.action(self.store.user('test001'), 'account.order', {'order': ['test001']})
        self.assertEqual(error.exception.status, 403)
        # Dragging your own row into another 权限组 is refused; others move freely.
        with self.assertRaises(Problem):
            self.store.action(admin, 'account.role', {'id': 'superadmin', 'role': 'admin'})
        self.store.action(admin, 'account.role', {'id': 'test001', 'role': 'admin'})
        self.assertEqual(self.store.user('test001')['role'], 'admin')

    def test_signature_is_one_trimmed_line_and_survives_an_older_page(self):
        me = self.store.user('test001')
        saved = self.store.action(me, 'profile.self', {'nickname': '一一', 'avatar': '', 'signature': '  慢慢来，\n比较快。  ' + '长' * 60})
        self.assertTrue(saved['signature'].startswith('慢慢来， 比较快。'))
        self.assertEqual(len(saved['signature']), 40)
        self.assertEqual(self.store.user('test001')['signature'], saved['signature'])
        # A page that predates the field sends no signature; it is kept.
        self.store.action(me, 'profile.self', {'nickname': '一一', 'avatar': ''})
        self.assertEqual(self.store.user('test001')['signature'], saved['signature'])
        self.store.action(me, 'profile.self', {'nickname': '一一', 'avatar': '', 'signature': ''})
        self.assertEqual(self.store.user('test001')['signature'], '')
        self.assertIn('signature', self.store.snapshot(self.store.user('superadmin'))['users'][0])


class TaskApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.store=Store(Path(self.temp.name)/'approval.sqlite3',seed=False)
        for name in ['superadmin','test001','test002']:
            self.store.create_user(name,'test-only-password',admin=name=='superadmin')
        self.admin=self.store.user('superadmin'); self.owner=self.store.user('test001'); self.member=self.store.user('test002'); self.day=now().date().isoformat()
        self.project=self.store.action(self.admin,'project.create',{'name':'approval','owner':'test001','members':['test002'],'start':self.day})
    def tearDown(self): self.store.close(); self.temp.cleanup()
    def test_member_completion_is_done_at_once_and_the_owner_is_told(self):
        task=self.store.action(self.admin,'task.create',{'name':'child','projectId':self.project['id'],'assignee':'test002','date':self.day})
        result=self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'已完成','actual':30})
        self.assertEqual(result['status'],'done'); self.assertEqual(result['completionSummary'],'已完成')
        self.assertFalse(any(n['kind']=='task_approval' for n in self.store.all('notifications')))
        self.assertTrue(any(n['to']=='test001' and n['kind']=='progress' and n['reference']==task['id'] for n in self.store.all('notifications')))
        with self.assertRaises(Problem):
            self.store.action(self.owner,'task.review',{'id':task['id'],'accept':True})

    def test_submissions_left_pending_are_settled_as_done(self):
        task=self.store.action(self.admin,'task.create',{'name':'旧待审','projectId':self.project['id'],'assignee':'test002','date':self.day})
        stored=self.store.get('tasks',task['id'])
        stored.update(status='pending_approval',completionSummary='旧提交',approval={'status':'pending','approver':'test001','summary':'旧提交'})
        self.store.put('tasks',stored)
        notice=self.store.notify('test001','任务完成待审批','请审批','task_approval',task['id']);self.store.db.commit()
        self.store.snapshot(self.owner)
        settled=self.store.get('tasks',task['id'])
        self.assertEqual(settled['status'],'done')
        self.assertTrue(self.store.get('notifications',notice['id'])['read'])
        self.assertTrue(self.store.project_tasks_complete(self.project['id']))

    def test_assignee_corrects_the_completion_record(self):
        task=self.store.action(self.admin,'task.create',{'name':'可修改','projectId':self.project['id'],'assignee':'test002','date':self.day})
        with self.assertRaises(Problem):
            self.store.action(self.member,'task.completion.update',{'id':task['id'],'summary':'还没做完'})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'初稿','actual':20,'feeling':'一般'})
        edited=self.store.action(self.member,'task.completion.update',{'id':task['id'],'summary':'补上了验收截图','actual':35,'feeling':'顺利'})
        self.assertEqual((edited['status'],edited['completionSummary'],edited['completionActual'],edited['completionFeeling']),('done','补上了验收截图',35,'顺利'))
        log=next(l for l in self.store.all('logs') if l['taskId']==task['id'] and l['kind']=='complete_edit')
        self.assertEqual(log['before']['completionSummary'],'初稿')
        self.assertTrue(any(n['to']=='test001' and n['title']=='完成记录已修改' for n in self.store.all('notifications')))
        # Only the assignee edits their own record.
        for other in (self.owner,self.admin):
            with self.assertRaises(Problem):
                self.store.action(other,'task.completion.update',{'id':task['id'],'summary':'代改'})

    def test_project_completion_needs_a_report_then_superadmin_review(self):
        task=self.store.action(self.admin,'task.create',{'name':'结项子任务','projectId':self.project['id'],'assignee':'test002','date':self.day})
        with self.assertRaises(Problem):
            self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':''})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'完成','actual':20})
        p=self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'全部子任务已完成，验收通过。'})
        self.assertEqual(p['status'],'pending_completion')
        self.assertEqual(p['completionReport'],'全部子任务已完成，验收通过。')
        self.assertTrue(any(n['to']=='superadmin' and n['kind']=='project_completion' for n in self.store.all('notifications')))
        self.store.action(self.admin,'project.complete_review',{'id':self.project['id'],'accept':True})
        self.assertEqual(self.store.get('projects',self.project['id'])['status'],'done')

    def test_owner_may_close_a_project_early_and_open_work_closes_with_it(self):
        open_task=self.store.action(self.admin,'task.create',{
            'name':'还没做','projectId':self.project['id'],'assignee':'test002','date':self.day,
        })
        self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'方向调整，提前结项。'})
        notice=next(n for n in self.store.all('notifications')
                    if n['to']=='superadmin' and n['kind']=='project_completion')
        self.assertIn('仍有 1 项未完成任务',notice['body'])
        self.store.action(self.admin,'project.complete_review',{'id':self.project['id'],'accept':True})
        self.assertEqual(self.store.get('projects',self.project['id'])['status'],'done')
        closed=self.store.get('tasks',open_task['id'])
        self.assertEqual((closed['status'],closed['skipReason']),('skipped','项目已完成'))

    def test_admin_completes_a_running_project_directly(self):
        end=(date.fromisoformat(self.day)+timedelta(days=10)).isoformat()
        self.store.action(self.admin,'project.update',{'id':self.project['id'],'end':end,'cycle':'range'})
        task=self.store.action(self.admin,'task.create',{
            'name':'未完成','projectId':self.project['id'],'assignee':'test002','date':self.day,
        })
        with self.assertRaises(Problem):
            self.store.action(self.owner,'project.complete',{'id':self.project['id']})
        p=self.store.action(self.admin,'project.complete',{'id':self.project['id']})
        self.assertEqual((p['status'],p['endedEarly']),('done',True))
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'skipped')
        self.assertTrue(any(n['to']=='test002' and n['title']=='项目已完成' for n in self.store.all('notifications')))
        with self.assertRaises(Problem):
            self.store.action(self.admin,'project.complete',{'id':self.project['id']})

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
        result=self.store.action(self.owner,'project.complete_request',{'id':self.project['id'],'report':'递延任务已完成'})
        self.assertEqual(result['status'],'pending_completion')
    def test_standalone_member_task_completes_directly(self):
        task=self.store.put('tasks', {'name':'standalone','date':self.day,'duration':30,'assignee':'test002','projectId':None,'priority':'P1','status':'todo','fixed':False,'type':'通用'})
        self.store.db.commit()
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'已完成','actual':30})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'done')
        # Outside a project only an admin can send it back.
        with self.assertRaises(Problem): self.store.action(self.owner,'task.reopen',{'id':task['id'],'reason':'再看看'})
        self.assertEqual(self.store.action(self.admin,'task.reopen',{'id':task['id'],'reason':'再看看'})['status'],'todo')

    def test_owner_sends_finished_work_back(self):
        task=self.store.action(self.admin,'task.create',{'name':'child','projectId':self.project['id'],'assignee':'test002','date':self.day})
        self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'请看','actual':20})
        self.assertTrue(any(e['taskId']==task['id'] for e in self.store.work_completions(self.admin)))
        with self.assertRaises(Problem):
            self.store.action(self.member,'task.reopen',{'id':task['id'],'reason':'自己打回'})
        with self.assertRaises(Problem):
            self.store.action(self.owner,'task.reopen',{'id':task['id'],'reason':' '})
        back=self.store.action(self.owner,'task.reopen',{'id':task['id'],'reason':'请补充验收证据'})
        self.assertEqual((back['status'],back['reopen']['reason'],back['reopen']['by']),('todo','请补充验收证据','test001'))
        self.assertTrue(any(n['to']=='test002' and n['title']=='任务被打回' and '补充验收证据' in n['body'] for n in self.store.all('notifications')))
        self.assertFalse(self.store.project_tasks_complete(self.project['id']))
        self.assertFalse(any(e['taskId']==task['id'] for e in self.store.work_completions(self.admin)))
        # Open work cannot be sent back again; finishing it closes the loop.
        with self.assertRaises(Problem):
            self.store.action(self.owner,'task.reopen',{'id':task['id'],'reason':'再打回'})
        done=self.store.action(self.member,'task.complete',{'id':task['id'],'summary':'已补充','actual':10})
        self.assertEqual(done['status'],'done')
        self.assertTrue(any(l['taskId']==task['id'] and l['kind']=='reopen' and l['reason']=='请补充验收证据' for l in self.store.all('logs')))

    def test_sending_back_a_past_task_puts_it_on_today(self):
        old_day = (date.fromisoformat(self.day) - timedelta(days=2)).isoformat()
        project = self.store.action(self.admin, 'project.create', {
            'name': '跨日打回', 'owner': 'test001', 'members': ['test002'], 'start': old_day,
        })
        task = self.store.action(self.admin, 'task.create', {
            'name': '前天的任务', 'projectId': project['id'], 'assignee': 'test002', 'date': old_day, 'deadline': old_day,
        })
        self.store.action(self.member, 'task.complete', {'id': task['id'], 'summary': '做完', 'actual': 20})
        back = self.store.action(self.admin, 'task.reopen', {'id': task['id'], 'reason': '数据有误'})
        self.assertEqual((back['date'], back['deadline']), (self.day, self.day))
        # The overnight rollover leaves it alone today.
        self.store.schedule(datetime.combine(date.fromisoformat(self.day), time(8), TZ))
        self.assertEqual(self.store.get('tasks', task['id'])['status'], 'todo')
    def test_owner_own_task_completes_without_self_review(self):
        task=self.store.action(self.owner,'task.create',{'name':'owner task','projectId':self.project['id'],'assignee':'test001','date':self.day})
        self.store.action(self.owner,'task.complete',{'id':task['id'],'summary':'owner done','actual':30})
        self.assertEqual(self.store.get('tasks',task['id'])['status'],'done')
        self.assertFalse(any(n['to']=='test001' and n['kind']=='task_approval' for n in self.store.all('notifications')),
                         'Owner 自己的任务不应再给自己发审批通知')

    def test_a_bad_assignee_is_a_form_error_not_a_login_error(self):
        """反馈 #1：负责人取到空值时服务端曾回 401「请重新登录」。"""
        task=self.store.action(self.admin,'task.create',{'name':'调整','projectId':self.project['id'],'assignee':'test002','date':self.day})
        with self.assertRaises(Problem) as caught:
            self.store.action(self.admin,'task.update',{'id':task['id'],'assignee':''})
        self.assertEqual(caught.exception.status,400)
        self.assertNotIn('登录',caught.exception.message)

    def test_a_session_for_a_disabled_account_still_asks_to_log_in(self):
        token=self.store.login('test002','test-only-password')
        with self.store.db:
            self.store.db.execute('UPDATE users SET active=0 WHERE id=?',('test002',))
        with self.assertRaises(Problem) as caught:
            self.store.authenticate(token)
        self.assertEqual(caught.exception.status,401)

    def test_owner_reorders_project_tasks_by_lineage(self):
        """反馈 #4：手动顺序存在项目上，只接受本项目的任务。"""
        a=self.store.action(self.owner,'task.create',{'name':'A','projectId':self.project['id'],'assignee':'test002','date':self.day})
        b=self.store.action(self.owner,'task.create',{'name':'B','projectId':self.project['id'],'assignee':'test002','date':self.day})
        project=self.store.action(self.owner,'project.reorder',{'id':self.project['id'],'order':[b['id'],'not-a-task',a['id'],b['id']]})
        self.assertEqual(project['taskOrder'],[b['id'],a['id']])
        self.assertEqual(self.store.get('projects',self.project['id'])['taskOrder'],[b['id'],a['id']])
        with self.assertRaises(Problem) as caught:
            self.store.action(self.member,'project.reorder',{'id':self.project['id'],'order':[a['id']]})
        self.assertEqual(caught.exception.status,403)
        with self.assertRaises(Problem):
            self.store.action(self.owner,'project.reorder',{'id':self.project['id'],'order':'a,b'})

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

    def test_project_settings_rename_move_dates_and_hand_over_owner(self):
        self.store.create_user('test003', 'test-only-password')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'settings', 'owner': 'test001', 'members': ['test002'],
            'start': '2026-12-01', 'end': '2026-12-31', 'cycle': 'range',
        })
        owner = self.store.user('test001')
        self.store.action(owner, 'task.create', {
            'name': 'mid', 'assignee': 'test002', 'projectId': project['id'], 'date': '2026-12-20', 'duration': 30,
        })
        renamed = self.store.action(owner, 'project.update', {
            'id': project['id'], 'name': 'settings v2', 'start': '2026-12-01', 'end': '2026-12-25', 'cycle': 'range',
        })
        self.assertEqual((renamed['name'], renamed['end']), ('settings v2', '2026-12-25'))
        self.assertTrue(any(n['to'] == 'test002' and n['title'] == '项目信息调整' for n in self.store.all('notifications')))
        # Open work may not be left outside the project's dates, and the name stays required.
        with self.assertRaises(Problem):
            self.store.action(owner, 'project.update', {'id': project['id'], 'end': '2026-12-10'})
        with self.assertRaises(Problem):
            self.store.action(owner, 'project.update', {'id': project['id'], 'name': '  '})
        self.assertEqual(self.store.get('projects', project['id'])['end'], '2026-12-25')
        # Only an admin hands a project to a new Owner; the old one stays on as a collaborator.
        with self.assertRaises(Problem):
            self.store.action(owner, 'project.update', {'id': project['id'], 'owner': 'test003'})
        moved = self.store.action(self.admin, 'project.update', {'id': project['id'], 'owner': 'test003'})
        self.assertEqual(moved['owner'], 'test003')
        self.assertEqual(moved['members']['test001'], 'accepted')
        self.assertTrue(any(n['to'] == 'test003' and n['title'] == '项目 Owner 指派' for n in self.store.all('notifications')))

    def test_fixed_task_under_a_project_lives_and_ends_with_it(self):
        self.store.create_user('test003', 'test-only-password')
        today = now().date()
        start, end = (today + timedelta(days=1)).isoformat(), (today + timedelta(days=10)).isoformat()
        project = self.store.action(self.admin, 'project.create', {
            'name': 'with routine', 'owner': 'test001', 'members': ['test002'],
            'start': self.day, 'end': end, 'cycle': 'range',
        })
        # Only project members can take a fixed task attached to it.
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'repeat.create', {
                'name': 'standup', 'assignees': ['test003'], 'frequency': 'daily', 'start': start, 'projectId': project['id'],
            })
        rule = self.store.action(self.admin, 'repeat.create', {
            'name': 'standup', 'assignees': ['test002'], 'frequency': 'daily', 'start': start, 'projectId': project['id'],
        })
        occurrences = [t for t in self.store.all('tasks') if t.get('repeatId') == rule['id']]
        self.assertEqual(len(occurrences), 10)
        self.assertTrue(all(t['projectId'] == project['id'] for t in occurrences))
        self.assertEqual(max(t['date'] for t in occurrences), end)
        owner_view = self.store.snapshot(self.store.user('test001'))
        self.assertIn(rule['id'], {r['id'] for r in owner_view['repeats']})
        self.assertTrue(any(t.get('repeatId') == rule['id'] for t in owner_view['tasks']))
        self.assertNotIn(rule['id'], {r['id'] for r in self.store.snapshot(self.store.user('test003'))['repeats']})
        # Occurrences never hold up closeout; closing the project ends the rule.
        self.store.put('tasks', {
            'name': 'deliver', 'date': self.day, 'duration': 30, 'assignee': 'test002', 'projectId': project['id'],
            'priority': 'P1', 'status': 'done', 'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.assertTrue(self.store.project_tasks_complete(project['id']))
        self.store.action(self.store.user('test001'), 'project.complete_request', {'id': project['id'], 'report': 'done'})
        self.store.action(self.admin, 'project.complete_review', {'id': project['id'], 'accept': True})
        self.assertFalse(self.store.get('repeats', rule['id'])['active'])
        statuses = {t['status'] for t in self.store.all('tasks') if t.get('repeatId') == rule['id']}
        self.assertEqual(statuses, {'skipped'})
        self.store.action(self.admin, 'project.delete', {'id': project['id'], 'confirm': 'with routine'})
        self.assertFalse(any(r['id'] == rule['id'] for r in self.store.all('repeats')))

    def test_fixed_task_rule_can_be_attached_moved_and_detached(self):
        self.store.create_user('test003', 'test-only-password')
        today = now().date()
        start, short_end = (today + timedelta(days=1)).isoformat(), (today + timedelta(days=5)).isoformat()
        first = self.store.action(self.admin, 'project.create', {
            'name': 'first', 'owner': 'test001', 'members': ['test002'], 'start': self.day, 'end': short_end, 'cycle': 'range',
        })
        second = self.store.action(self.admin, 'project.create', {
            'name': 'second', 'owner': 'test001', 'members': ['test002'], 'start': self.day, 'cycle': 'infinite',
        })
        outsider = self.store.action(self.admin, 'project.create', {
            'name': 'outsider', 'owner': 'test003', 'start': self.day, 'cycle': 'infinite',
        })
        rule = self.store.action(self.admin, 'repeat.create', {
            'name': 'standup', 'assignees': ['test002'], 'frequency': 'daily', 'start': start,
            'end': (today + timedelta(days=10)).isoformat(),
        })
        occurrences = lambda: [t for t in self.store.all('tasks') if t.get('repeatId') == rule['id']]
        self.assertEqual(len(occurrences()), 10)
        # A project whose members do not include the assignee is refused.
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'repeat.update', {'id': rule['id'], 'projectId': outsider['id']})
        # Attaching keeps the rule inside the project's dates.
        self.store.action(self.admin, 'repeat.update', {'id': rule['id'], 'projectId': first['id']})
        inside = [t for t in occurrences() if t['status'] == 'todo']
        self.assertTrue(all(t['projectId'] == first['id'] and t['date'] <= short_end for t in inside))
        self.assertEqual(len(inside), 5)
        self.assertTrue(any(n['to'] == 'test002' and n['title'] == '固定安排调整' for n in self.store.all('notifications')))
        # Moving to an open-ended project brings the trimmed days back.
        self.store.action(self.admin, 'repeat.update', {'id': rule['id'], 'projectId': second['id']})
        self.assertEqual({(t['projectId'], t['status']) for t in occurrences()}, {(second['id'], 'todo')})
        self.assertEqual(len(occurrences()), 10)
        # A rule stopped by its project closing comes back when taken out of it.
        self.store.put('tasks', {
            'name': 'deliver', 'date': self.day, 'duration': 30, 'assignee': 'test002', 'projectId': second['id'],
            'priority': 'P1', 'status': 'done', 'fixed': False, 'type': '通用',
        })
        self.store.db.commit()
        self.store.action(self.store.user('test001'), 'project.complete_request', {'id': second['id'], 'report': 'done'})
        self.store.action(self.admin, 'project.complete_review', {'id': second['id'], 'accept': True})
        self.assertFalse(self.store.get('repeats', rule['id'])['active'])
        self.store.action(self.admin, 'repeat.update', {'id': rule['id'], 'projectId': None})
        self.assertTrue(self.store.get('repeats', rule['id'])['active'])
        self.assertIsNone(self.store.get('repeats', rule['id'])['projectId'])
        self.assertEqual({(t['projectId'], t['status']) for t in occurrences()}, {(None, 'todo')})


class ProjectSpaceTests(unittest.TestCase):
    """项目空间: the folder tree, the write-up and the project's files."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'space.sqlite3', seed=False)
        for name in ['superadmin', 'test001', 'test002', 'test003']:
            self.store.create_user(name, 'test-only-password', admin=name == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.day = now().date().isoformat()

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def test_project_space_folders_background_and_staffing(self):

        owner, other = self.store.user('test001'), self.store.user('test002')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'space', 'owner': 'test001', 'members': ['test002'], 'start': self.day, 'cycle': 'infinite',
        })
        # Folders are the admins' to keep.
        with self.assertRaises(Problem):
            self.store.action(owner, 'folder.create', {'name': '战略'})
        folder = self.store.action(self.admin, 'folder.create', {'name': '战略'})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'folder.create', {'name': '战略'})
        self.assertEqual(self.store.snapshot(other)['folders'], [], '未归入可见项目的文件夹不应返回成员')
        # The Owner files the project and writes it up; a collaborator only reads.
        self.store.action(owner, 'project.space', {
            'id': project['id'], 'folderId': folder['id'], 'background': '为什么做',
            'staffing': {'test002': '调研', 'test003': '不在项目里', 'test001': '  '},
        })
        saved = self.store.get('projects', project['id'])
        self.assertEqual((saved['folderId'], saved['background'], saved['staffing']), (folder['id'], '为什么做', {'test002': '调研'}))
        with self.assertRaises(Problem):
            self.store.action(other, 'project.space', {'id': project['id'], 'background': 'x'})
        with self.assertRaises(Problem):
            self.store.action(owner, 'project.space', {'id': project['id'], 'folderId': 'missing'})
        # Removing the folder leaves the project unfiled, not gone.
        self.store.action(self.admin, 'folder.delete', {'id': folder['id']})
        self.assertIsNone(self.store.get('projects', project['id'])['folderId'])
        self.assertEqual(self.store.all('folders'), [])

    def test_dragging_in_the_directory_moves_and_orders_items(self):
        owner, other = self.store.user('test001'), self.store.user('test002')
        project = self.store.action(self.admin, 'project.create', {
            'name': 'drag', 'owner': 'test001', 'members': ['test002'], 'start': self.day, 'cycle': 'infinite',
        })
        folder = self.store.action(self.admin, 'folder.create', {'name': '归档'})
        # The Owner drops their project into a folder at a chosen spot.
        self.store.action(owner, 'nav.move', {'kind': 'project', 'id': project['id'], 'folderId': folder['id'], 'order': 1.5})
        saved = self.store.get('projects', project['id'])
        self.assertEqual((saved['folderId'], saved['navOrder']), (folder['id'], 1.5))
        # Back to the root.
        self.store.action(owner, 'nav.move', {'kind': 'project', 'id': project['id'], 'order': -3})
        self.assertIsNone(self.store.get('projects', project['id'])['folderId'])
        # A collaborator cannot move it, and only admins move folders.
        with self.assertRaises(Problem):
            self.store.action(other, 'nav.move', {'kind': 'project', 'id': project['id'], 'order': 0})
        with self.assertRaises(Problem):
            self.store.action(owner, 'nav.move', {'kind': 'folder', 'id': folder['id'], 'order': 0})
        self.store.action(self.admin, 'nav.move', {'kind': 'folder', 'id': folder['id'], 'order': 7})
        self.assertEqual(self.store.get('folders', folder['id'])['navOrder'], 7)
        for bad in ({'order': 'nan'}, {'order': 'inf'}, {'order': 0, 'folderId': 'missing'}):
            with self.assertRaises((Problem, ValueError)):
                self.store.action(owner, 'nav.move', {'kind': 'project', 'id': project['id'], **bad})

        for bad in ({}, {'order': None}, {'order': 'bad'}, {'order': True},
                    {'order': 10**1000}, {'kind': 'unknown', 'order': 0}):
            with self.assertRaises(Problem) as rejected:
                self.store.action(owner, 'nav.move', {'kind': 'project', 'id': project['id'], **bad})
            self.assertEqual(rejected.exception.status, 400)
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'nav.move', {
                'kind': 'folder', 'id': folder['id'], 'folderId': folder['id'], 'order': 0,
            })

    def test_open_ended_projects_count_people_over_two_weeks(self):
        owner = self.store.user('test001')
        today = now().date()
        day = lambda n: (today + timedelta(days=n)).isoformat()
        open_ended = self.store.action(self.admin, 'project.create', {
            'name': 'long', 'owner': 'test001', 'members': ['test002'], 'start': day(-60), 'cycle': 'infinite',
        })
        bounded = self.store.action(self.admin, 'project.create', {
            'name': 'short', 'owner': 'test001', 'members': ['test002'], 'start': day(-60), 'end': day(30), 'cycle': 'range',
        })
        def task(offset, **extra):
            self.store.put('tasks', {'name': f't{offset}', 'date': day(offset), 'duration': 60, 'assignee': 'test002',
                                     'projectId': bounded['id'], 'priority': 'P1', 'status': 'todo', 'fixed': False,
                                     'type': '通用', **extra})
        task(-30); task(-3); task(5); task(20); task(-20, deadline=day(-1))
        task(2, status='skipped')
        self.store.db.commit()
        loads = self.store.action(owner, 'project.member_loads', {'id': open_ended['id']})
        self.assertEqual((loads['start'], loads['end']), (day(-6), day(7)))
        # -3, 5 and the task running from -20 to -1; not -30, 20 or the skipped one.
        self.assertEqual((loads['counts']['test002'], loads['minutes']['test002']), (3, 180))
        whole = self.store.action(owner, 'project.member_loads', {'id': bounded['id']})
        self.assertEqual((whole['start'], whole['end'], whole['counts']['test002']), (day(-60), day(30), 5))
        # 当前工作量 leaves out plans beyond next week.
        self.assertEqual(self.store.profile('test002')['minutes'], 4 * 60)

    def test_project_files_follow_project_access(self):


        owner, member, outsider = [self.store.user(x) for x in ('test001', 'test002', 'test003')]
        project = self.store.action(self.admin, 'project.create', {
            'name': 'files', 'owner': 'test001', 'members': ['test002'], 'start': self.day, 'cycle': 'infinite',
        })
        record = self.store.upload_file(member, project['id'], '../方案 v1.pdf', 'application/pdf', b'%PDF-1')
        self.assertEqual((record['name'], record['size'], record['uploader']), ('方案 v1.pdf', 6, 'test002'))
        self.assertEqual(self.store.read_file(owner, record['id'])[1], b'%PDF-1')
        self.assertEqual([f['id'] for f in self.store.snapshot(owner)['files']], [record['id']])
        self.assertEqual(self.store.snapshot(outsider)['files'], [])
        with self.assertRaises(Problem):
            self.store.read_file(outsider, record['id'])
        with self.assertRaises(Problem):
            self.store.upload_file(outsider, project['id'], 'x.txt', 'text/plain', b'x')
        with self.assertRaises(Problem):
            self.store.upload_file(member, project['id'], 'empty.txt', 'text/plain', b'')
        # Only the uploader, the Owner or an admin removes a file.
        mine = self.store.upload_file(owner, project['id'], 'owner.txt', 'text/plain', b'o')
        with self.assertRaises(Problem):
            self.store.action(member, 'file.delete', {'id': mine['id']})
        self.store.action(member, 'file.delete', {'id': record['id']})
        with self.assertRaises(Problem):
            self.store.read_file(owner, record['id'])
        # Deleting the project takes its files with it.
        self.store.action(owner, 'project.delete', {'id': project['id'], 'confirm': 'files'})
        self.assertEqual(self.store.all('files'), [])
        self.assertIsNone(self.store.db.execute('SELECT 1 FROM file_blobs').fetchone())

    def test_folder_snapshot_filters_projects_by_the_signed_in_member(self):
        folder = self.store.action(self.admin, 'folder.create', {'name': '内部目录'})
        empty = self.store.action(self.admin, 'folder.create', {'name': '待归类目录'})
        project = self.store.action(self.admin, 'project.create', {
            'name': '成员项目', 'owner': 'test001', 'members': ['test002'], 'start': self.day,
        })
        self.store.action(self.admin, 'project.space', {'id': project['id'], 'folderId': folder['id']})
        for who in ('test001', 'test002'):
            self.assertEqual([f['id'] for f in self.store.snapshot(self.store.user(who))['folders']], [folder['id']])
        self.assertEqual(self.store.snapshot(self.store.user('test003'))['folders'], [])
        self.assertEqual({f['id'] for f in self.store.snapshot(self.admin)['folders']}, {folder['id'], empty['id']})

    def test_completed_project_files_remain_readable_through_the_archive(self):
        owner, member, outsider = [self.store.user(x) for x in ('test001', 'test002', 'test003')]
        project = self.store.action(self.admin, 'project.create', {
            'name': '结项附件', 'owner': 'test001', 'members': ['test002'], 'start': self.day,
        })
        folder = self.store.action(self.admin, 'folder.create', {'name': '归档目录'})
        self.store.action(owner, 'project.space', {'id': project['id'], 'folderId': folder['id']})
        file = self.store.upload_file(member, project['id'], '交付.txt', 'text/plain', b'final deliverable')
        self.store.action(self.admin, 'project.complete', {'id': project['id'], 'report': '已验收'})
        for viewer in (self.admin, owner, member):
            self.assertEqual(self.store.read_file(viewer, file['id'])[1], b'final deliverable')
            state = self.store.snapshot(viewer)
            self.assertNotIn(project['id'], {p['id'] for p in state['projects']})
            self.assertEqual([p['id'] for p in state['fileArchives']], [project['id']])
            self.assertEqual([f['id'] for f in state['files']], [file['id']])
            with self.assertRaises(Problem):
                self.store.upload_file(viewer, project['id'], 'new.txt', 'text/plain', b'new')
            with self.assertRaises(Problem):
                self.store.action(viewer, 'file.delete', {'id': file['id']})
        self.assertEqual(self.store.snapshot(outsider)['fileArchives'], [])
        self.assertEqual(self.store.snapshot(outsider)['files'], [])
        self.assertEqual(self.store.snapshot(outsider)['folders'], [])
        with self.assertRaises(Problem):
            self.store.read_file(outsider, file['id'])
        self.store.action(self.admin, 'project.update', {'id': project['id'], 'status': 'active'})
        state = self.store.snapshot(owner)
        self.assertEqual(state['fileArchives'], [])
        self.assertIn(project['id'], {p['id'] for p in state['projects']})

    def test_expired_and_archived_projects_keep_their_attachments(self):
        owner, outsider = self.store.user('test001'), self.store.user('test003')
        for state in ('expired', 'archived'):
            project = self.store.action(self.admin, 'project.create', {
                'name': state, 'owner': 'test001', 'members': [], 'start': self.day,
            })
            file = self.store.upload_file(owner, project['id'], '记录.txt', 'text/plain', b'record')
            if state == 'expired':
                project['end'] = (date.fromisoformat(self.day) - timedelta(days=1)).isoformat()
            else:
                project['status'] = 'archived'
            self.store.put('projects', project)
            self.store.db.commit()
            self.assertEqual(self.store.read_file(owner, file['id'])[1], b'record')
            self.assertIn(project['id'], {p['id'] for p in self.store.snapshot(owner)['fileArchives']})
            with self.assertRaises(Problem):
                self.store.read_file(outsider, file['id'])


if __name__ == '__main__':

    unittest.main()
