"""Fixed routine and automatic collection policy coverage."""
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from server import Store, Problem, AGENT_WRITE_TOOLS


class RepeatFeatureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'repeat.sqlite3', seed=False)
        for uid in ('superadmin', 'test001'):
            self.store.create_user(uid, 'password-long', uid == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.member = self.store.user('test001')
        self.today = date.today()

    def tearDown(self):
        self.store.close(); self.tmp.cleanup()

    def test_weekday_and_specific_date_materialization(self):
        monday = self.today + timedelta(days=(7 - self.today.weekday()) % 7)
        repeat = self.store.action(self.admin, 'repeat.create', {
            'name': 'weekly routine', 'assignees': ['test001'], 'start': self.today.isoformat(),
            'end': (monday + timedelta(days=8)).isoformat(), 'frequency': 'weekly',
            'weekdays': [monday.weekday()],
        })
        tasks = [t for t in self.store.all('tasks') if t.get('repeatId') == repeat['id']]
        self.assertTrue(tasks)
        self.assertTrue(all(date.fromisoformat(t['date']).weekday() == monday.weekday() for t in tasks))

        one_off = self.store.action(self.admin, 'repeat.create', {
            'name': 'holiday check', 'assignees': ['test001'], 'start': self.today.isoformat(),
            'frequency': 'dates', 'dates': [(self.today + timedelta(days=2)).isoformat()],
        })
        self.assertEqual(len([t for t in self.store.all('tasks') if t.get('repeatId') == one_off['id']]), 1)

    def test_skip_routine_occurrence_persists_and_hides_materialization(self):
        repeat = self.store.action(self.admin, 'repeat.create', {
            'name': 'daily routine', 'assignees': ['test001'], 'start': self.today.isoformat(),
            'end': (self.today + timedelta(days=2)).isoformat(), 'frequency': 'daily',
        })
        self.store.action(self.admin, 'repeat.skip', {'id': repeat['id'], 'date': self.today.isoformat()})
        self.assertIn(self.today.isoformat(), self.store.get('repeats', repeat['id'])['skipDates'])
        skipped = [t for t in self.store.all('tasks') if t.get('repeatId') == repeat['id'] and t.get('date') == self.today.isoformat()]
        self.assertTrue(skipped and skipped[0]['status'] == 'skipped')

    def test_collection_policy_accepts_weekdays_and_dates(self):
        self.store.action(self.admin, 'collection.update', {'weekdays': [1], 'dates': []})
        self.assertTrue(self.store.collection_enabled('2026-09-08'))  # Tuesday
        self.assertFalse(self.store.collection_enabled('2026-09-07'))
        self.store.action(self.admin, 'automation.update', {'mode': 'dates', 'dates': ['2026-12-31'], 'time': '23:45'})
        self.assertEqual(self.store.collection_time().strftime('%H:%M'), '23:45')
        self.assertTrue(self.store.collection_enabled('2026-12-31'))
        self.assertFalse(self.store.collection_enabled('2026-12-30'))

    def test_calendar_horizon_is_inclusive_and_rejects_later_dates(self):
        self.store.db.commit()
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'project.create', {
                'name': 'too late', 'start': '2027-04-02', 'cycle': 'infinite',
            })
        repeat = self.store.action(self.admin, 'repeat.create', {
            'name': 'horizon routine', 'assignees': ['test001'],
            'start': '2027-03-31', 'frequency': 'daily',
        })
        tasks = [t for t in self.store.all('tasks') if t.get('repeatId') == repeat['id']]
        self.assertEqual({t['date'] for t in tasks}, {'2027-03-31', '2027-04-01'})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'repeat.create', {
                'name': 'outside routine', 'assignees': ['test001'],
                'start': '2027-04-01', 'frequency': 'dates', 'dates': ['2027-04-02'],
            })

    def test_agent_capabilities_are_read_only_for_members(self):
        admin_caps = self.store.action(self.admin, 'agent.capabilities', {})
        member_caps = self.store.action(self.member, 'agent.capabilities', {})
        self.assertEqual(admin_caps['mode'], 'operator')
        self.assertIn('task.create', admin_caps['tools'])
        self.assertIn('task.create', admin_caps['requiresConfirmation'])
        self.assertEqual(member_caps['mode'], 'readonly')
        self.assertIn('task.read', member_caps['tools'])
        self.assertIn('report.read', member_caps['tools'])
        self.assertIn('worklog.read', member_caps['tools'])
        self.assertIn('repeat.read', member_caps['tools'])
        self.assertNotIn('task.create', member_caps['tools'])
        self.assertTrue(self.store.action(self.member, 'agent.authorize', {'tool': 'task.read'})['allowed'])
        for tool in AGENT_WRITE_TOOLS:
            with self.subTest(tool=tool), self.assertRaises(Problem):
                self.store.action(self.member, 'agent.authorize', {'tool': tool})

    def test_agent_execute_requires_confirmation_and_applies_action(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': 'Agent 项目', 'owner': 'test001', 'members': ['test001'],
            'start': self.today.isoformat(), 'cycle': 'infinite'})
        proposal = {'action': 'task.create', 'data': {
            'name': 'Agent 创建的任务', 'projectId': project['id'],
            'assignee': 'test001', 'date': self.today.isoformat()}}
        pending = self.store.action(self.admin, 'agent.execute', proposal)
        self.assertTrue(pending['requiresConfirmation'])
        self.assertFalse(any(t.get('name') == 'Agent 创建的任务' for t in self.store.all('tasks')))
        applied = self.store.action(self.admin, 'agent.execute', {**proposal, 'confirmed': True})
        self.assertEqual(applied['name'], 'Agent 创建的任务')
        self.assertTrue(any(t.get('name') == 'Agent 创建的任务' for t in self.store.all('tasks')))
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.execute', {**proposal, 'confirmed': True})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'agent.execute', {'action': 'shell.exec', 'confirmed': True})

    def test_llm_config_is_admin_only_and_key_is_masked(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.config.set', {
                'baseUrl': 'http://localhost:11434/v1', 'model': 'qwen2.5'})
        cfg = self.store.action(self.admin, 'agent.config.set', {
            'baseUrl': 'http://localhost:11434/v1/', 'model': 'qwen2.5',
            'apiKey': 'secret-key-1234'})
        self.assertTrue(cfg['configured'])
        self.assertTrue(cfg['apiKeySet'])
        self.assertNotEqual(cfg['apiKeyMasked'], 'secret-key-1234')
        self.assertNotIn('apiKey', cfg)
        # The persisted record is private to the server and never appears in
        # the browser-safe config response or audit details.
        self.assertEqual(self.store.action(self.member, 'agent.config.get', {})['apiKeyMasked'], '•••••••••••1234')
        self.assertFalse(any('secret-key-1234' in str(a) for a in self.store.all('audit')))

    def test_opencode_go_preset_uses_compatible_endpoint_and_hides_selection_from_members(self):
        cfg = self.store.action(self.admin, 'agent.config.set', {
            'provider': 'opencode-go', 'baseUrl': '', 'model': '', 'apiKey': 'go-key'})
        self.assertEqual(cfg['baseUrl'], 'https://opencode.ai/zen/go/v1/chat/completions')
        self.assertEqual(cfg['model'], 'grok-4.5')
        self.assertEqual(cfg['provider'], 'opencode-go')
        self.assertIn('kimi-k3', cfg['opencodeGoModels'])
        member_cfg = self.store.action(self.member, 'agent.config.get', {})
        self.assertEqual(member_cfg['baseUrl'], '')
        self.assertEqual(member_cfg['model'], '')
        self.assertTrue(member_cfg['configured'])

    def test_agent_chat_requires_a_configured_endpoint(self):
        with self.assertRaises(Problem) as ctx:
            self.store.action(self.member, 'agent.chat', {
                'messages': [{'role': 'user', 'content': '我今天有什么任务？'}]})
        self.assertEqual(ctx.exception.status, 409)

    def test_agent_execute_requires_confirmation_and_member_cannot_write(self):
        pending = self.store.action(self.admin, 'agent.execute', {
            'action': 'task.create', 'data': {'name': '待确认'}})
        self.assertTrue(pending['requiresConfirmation'])
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.execute', {
                'action': 'task.create', 'confirmed': True,
                'data': {'name': '越权'}})

    def test_non_admin_cannot_change_routine_or_collection(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'repeat.skip', {'id': 'missing', 'date': self.today.isoformat()})
        with self.assertRaises(Problem):
            self.store.action(self.member, 'collection.update', {'weekdays': [0]})

    def test_superadmin_can_delete_one_off_task_but_not_fixed_occurrence(self):
        task = self.store.put('tasks', {
            'name': 'one-off', 'projectId': None, 'assignee': 'test001',
            'date': self.today.isoformat(), 'time': '09:00', 'duration': 30,
            'priority': 'P1', 'status': 'todo', 'fixed': False,
        })
        result = self.store.action(self.admin, 'task.delete', {'id': task['id']})
        self.assertTrue(result['deleted'])
        self.assertFalse(any(t['id'] == task['id'] for t in self.store.all('tasks')))
        fixed = self.store.put('tasks', {
            'name': 'fixed-occurrence', 'projectId': None, 'assignee': 'test001',
            'date': self.today.isoformat(), 'time': '09:00', 'duration': 30,
            'priority': 'P1', 'status': 'todo', 'fixed': True, 'repeatId': 'routine-1',
        })
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'task.delete', {'id': fixed['id']})

    def test_diary_save_is_upserted_and_private_to_author(self):
        day=self.today.isoformat()
        first=self.store.action(self.member,'diary.save',{'date':day,'content':'今天完成接口联调'})
        self.assertEqual(first['id'],f'diary:test001:{day}')
        self.store.action(self.member,'diary.save',{'date':day,'content':'补充测试结果'})
        self.assertEqual(len(self.store.all('diaries')),1)
        self.assertEqual(self.store.action(self.member,'diary.get',{'date':day})['content'],'补充测试结果')
        self.assertEqual(self.store.action(self.admin,'diary.get',{'date':day,'userId':'test001'})['author'],'test001')
        self.assertEqual(len(self.store.snapshot(self.member)['diaries']),1)
        self.assertEqual(len(self.store.snapshot(self.admin)['diaries']),1)

    def test_diary_statistics_reports_daily_load_and_project_progress(self):
        project=self.store.action(self.admin,'project.create',{'name':'日志项目','owner':'test001','members':['test001'],'start':self.today.isoformat()})
        t1=self.store.action(self.admin,'task.create',{'name':'已完成','projectId':project['id'],'assignee':'test001','date':self.today.isoformat(),'duration':30})
        self.store.action(self.admin,'task.create',{'name':'进行中','projectId':project['id'],'assignee':'test001','date':self.today.isoformat(),'duration':60})
        t1['status']='done'; self.store.put('tasks',t1); self.store.db.commit()
        row=next(x for x in self.store.snapshot(self.admin)['diaryStats'] if x['userId']=='test001' and x['date']==self.today.isoformat())
        self.assertEqual((row['completed'],row['total'],row['load'],row['loadTotal']),(1,2,30,90))
        self.assertEqual(row['projects'][0]['completed'],1)

    def test_scheduler_creates_one_nightly_diary_digest(self):
        day=(self.today-timedelta(days=1)).isoformat()
        task=self.store.put('tasks', {
            'name':'夜间统计任务','projectId':None,'assignee':'test001',
            'date':day,'time':'09:00','duration':45,'priority':'P1',
            'status':'done','fixed':False,
        })
        at=datetime.combine(self.today, datetime.min.time().replace(hour=23, minute=31), ZoneInfo('Asia/Shanghai'))
        first=self.store.schedule(at)
        second=self.store.schedule(at+timedelta(minutes=1))
        diaries=[d for d in self.store.all('diaries') if d.get('author')=='test001' and d.get('date')==day]
        notices=[n for n in self.store.all('notifications') if n.get('kind')=='diary_digest' and n.get('reference')==f'diary:test001:{day}:2330']
        self.assertEqual(len(diaries),1)
        self.assertTrue(diaries[0].get('auto'))
        self.assertEqual(len(notices),1)
        self.assertGreaterEqual(first['created'],1)
        self.assertEqual(second['created'],0)

    def test_work_log_deduplicates_carried_task_chain(self):
        root=self.store.put('tasks',{'name':'跨日完成','projectId':None,'assignee':'test001','date':self.today.isoformat(),'duration':30,'status':'deferred'})
        copy=self.store.put('tasks',{**root,'id':'carried-copy','originId':root['id'],'date':(self.today+timedelta(days=1)).isoformat(),'status':'done'})
        self.store.put('logs',{'taskId':root['id'],'kind':'complete_pending','createdAt':f'{self.today.isoformat()}T18:00:00+08:00'})
        self.store.put('logs',{'taskId':copy['id'],'kind':'approval','decision':'approved','createdAt':f'{(self.today+timedelta(days=1)).isoformat()}T09:00:00+08:00'})
        events=self.store.work_completions(self.admin)
        self.assertEqual(len([e for e in events if e['name']=='跨日完成']),1)
        self.assertTrue(next(e for e in events if e['name']=='跨日完成')['completedAt'].startswith((self.today+timedelta(days=1)).isoformat()))

    def test_achievement_archive_is_admin_only_and_contains_lifecycle(self):
        project = self.store.action(self.admin, 'project.create', {
            'name': '成果库项目', 'owner': 'test001', 'members': ['test001'],
            'start': self.today.isoformat(), 'cycle': 'infinite',
        })
        task = self.store.action(self.admin, 'task.create', {
            'name': '交付子任务', 'projectId': project['id'], 'assignee': 'test001',
            'date': self.today.isoformat(), 'duration': 45,
        })
        # Simulate an approved completion and project closeout, keeping the
        # same persisted fields used by the real approval actions.
        task['status'] = 'done'; task['completedAt'] = timestamp = f'{self.today.isoformat()}T18:00:00+08:00'
        self.store.put('tasks', task)
        project.update({'status': 'done', 'completedAt': timestamp,
                        'completedBy': 'superadmin', 'completionReport': '交付完成'})
        self.store.put('projects', project); self.store.db.commit()
        archive = self.store.snapshot(self.admin)['achievements']
        self.assertEqual(len(archive), 1)
        item = archive[0]
        self.assertEqual(item['taskStats']['completed'], 1)
        self.assertEqual(item['completionReport'], '交付完成')
        self.assertEqual(item['lifecycle'][-1]['stage'], 'done')
        self.assertEqual(self.store.snapshot(self.member)['achievements'], [])


if __name__ == '__main__':
    unittest.main()
