import tempfile
import unittest
from pathlib import Path
from server import Store,Problem,now

class WeeklyOutcomesTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'week.sqlite3',seed=False)
        self.s.create_user('admin','test-password',admin=True);self.s.create_user('member','test-password')
    def tearDown(self):self.s.close();self.tmp.cleanup()
    def project(self,id,**fields):
        p={'id':id,'name':'项目'+id,'desc':'项目目标和范围','owner':'member','members':{'member':'accepted'},'status':'active','start':'2026-11-01','createdAt':'2026-11-01T10:00:00+08:00'};p.update(fields);self.s.put('projects',p)
    def task(self,id,**fields):
        t={'id':id,'projectId':'p','name':id,'assignee':'member','date':'2026-11-02','status':'todo','createdAt':'2026-11-01T10:00:00+08:00'};t.update(fields);self.s.put('tasks',t)
    def log(self,id,kind,at,**fields):
        self.s.put('logs',{'taskId':id,'actor':'member','kind':kind,'createdAt':at+'T12:00:00+08:00','date':'2026-10-20',**fields})
    def week(self):return self.s.week_work('2026-10-31','2026-11-06')
    def test_completed_project_combines_name_description_and_closeout(self):
        self.project('p',status='done',completedAt='2026-11-04T12:00:00+08:00',completionReport='交付上线，验收通过')
        w=self.week();self.assertEqual(len(w['completedProjects']),1);p=w['completedProjects'][0]
        for text in ['项目p','项目目标和范围','交付上线，验收通过']:self.assertIn(text,p['summary'])
        self.assertEqual(p['completedOn'],'2026-11-04');self.assertEqual(p['members'],['member']);self.assertEqual(w['unfinishedProjects'],[])
    def test_completed_tasks_do_not_mean_project_completed(self):
        self.project('p');self.task('t',status='done');self.log('t','complete','2026-11-03',summary='任务完成')
        w=self.week();self.assertEqual(w['completedProjects'],[]);self.assertEqual(len(w['unfinishedProjects']),1);self.assertEqual(w['unfinishedProjects'][0]['remaining'],[])
    def test_requested_completion_is_still_pending_approval(self):
        self.project('p',status='pending_completion',completionRequestedAt='2026-11-04T12:00:00+08:00',completionReport='待审批成果')
        w=self.week();self.assertEqual(w['completedProjects'],[]);self.assertEqual(w['unfinishedProjects'][0]['status'],'pending_completion')
    def test_only_actual_project_completion_date_selects_the_week(self):
        self.project('old',status='done',completedAt='2026-10-30T12:00:00+08:00',start='2026-10-01',createdAt='2026-10-01T12:00:00+08:00')
        self.project('missing',status='done',end='2026-11-05')
        self.project('future',start='2026-11-09');self.project('rejected',status='rejected')
        self.assertEqual(self.week()['completedProjects'],[]);self.assertEqual(self.week()['unfinishedProjects'],[])
    def test_historical_week_preserves_project_and_task_before_later_completion(self):
        self.project('p',status='done',completedAt='2026-11-10T12:00:00+08:00',completionReport='后来完成')
        self.task('t',status='done',completedAt='2026-11-10T12:00:00+08:00');self.log('t','complete','2026-11-10')
        w=self.week();self.assertEqual(w['completedProjects'],[]);self.assertEqual(len(w['unfinishedProjects'][0]['remaining']),1)
        self.assertNotIn('后来完成',str(w))
    def test_repeated_deferrals_are_one_remaining_item_under_the_project(self):
        self.project('p');self.task('a',status='deferred');self.task('b',originId='a',date='2026-11-04',status='deferred')
        self.task('c',originId='a',date='2026-11-09',createdAt='2026-11-05T10:00:00+08:00')
        self.log('a','defer','2026-11-03',remaining='验证',reason='接口',target='2026-11-04')
        self.log('b','defer','2026-11-05',remaining='最终验收',reason='环境',target='2026-11-09')
        items=self.week()['unfinishedProjects'][0]['remaining'];self.assertEqual(len(items),1);self.assertEqual((items[0]['remaining'],items[0]['scheduledOn']),('最终验收','2026-11-09'))
    def test_future_only_and_skipped_tasks_do_not_fill_project_backlog(self):
        self.project('p');self.task('future',date='2026-11-09');self.task('skip',status='skipped');self.log('skip','skip','2026-11-04')
        self.assertEqual(self.week()['unfinishedProjects'][0]['remaining'],[])
    def test_legacy_standalone_work_stays_in_unfinished_only(self):
        self.task('temp',projectId=None)
        w=self.week();self.assertEqual(w['completedProjects'],[]);self.assertEqual(len(w['unfinishedOther']),1)
    def test_missing_closeout_is_not_fabricated_and_diaries_are_not_project_outcomes(self):
        self.project('p',status='done',completedAt='2026-11-03T12:00:00+08:00')
        self.s.put('diaries',{'id':'d','author':'member','date':'2026-11-03','content':{'done':'个人完成任务','note':'私人随记'}})
        w=self.week();self.assertIn('未填写完成描述',w['completedProjects'][0]['summary']);self.assertNotIn('私人随记',str(w));self.assertNotIn('个人完成任务',str(w))
    def test_week_endpoint_remains_admin_only(self):
        with self.assertRaises(Problem):self.s.action(self.s.user('member'),'brief.week',{'date':now().date().isoformat()})
        w=self.s.action(self.s.user('admin'),'brief.week',{'date':now().date().isoformat()});self.assertIn('completedProjects',w['work'])

    def test_completion_before_planned_start_still_counts_by_actual_closeout(self):
        self.project('p',start='2026-11-09',status='done',completedAt='2026-11-04T12:00:00+08:00')
        self.assertEqual(len(self.week()['completedProjects']),1)
    def test_undated_legacy_project_is_not_invented_as_historical_backlog(self):
        self.project('p',start='',createdAt='',status='done',completedAt='2026-11-04T12:00:00+08:00')
        self.assertEqual(self.s.week_work('2026-10-24','2026-10-30')['unfinishedProjects'],[])
