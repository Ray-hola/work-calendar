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
        self.assertEqual([t['taskId'] for t in w['completedTasks']],['t']);self.assertEqual(w['completedTasks'][0]['summary'],'任务完成')
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

    def test_standalone_completion_uses_actual_time_summary_and_feedback(self):
        self.task('temp',projectId=None,date='2026-10-20',status='done',completedAt='2026-11-03T12:00:00+08:00',desc='整理报价范围')
        self.log('temp','complete','2026-11-03',summary='已整理六家报价',actual=45,feeling='困难',followup='还需确认两家口径')
        w=self.week();self.assertEqual(w['completedProjects'],[]);self.assertEqual(w['unfinishedOther'],[])
        t=w['completedTasks'][0];self.assertEqual((t['taskId'],t['completedOn'],t['description'],t['summary']),('temp','2026-11-03','整理报价范围','已整理六家报价'))
        self.assertEqual((t['actual'],t['feeling'],t['followup'],t['assigneeName']),(45,'困难','还需确认两家口径','member'))

    def test_completed_project_and_its_completed_tasks_are_both_available(self):
        self.project('p',status='done',completedAt='2026-11-04T12:00:00+08:00',completionReport='项目验收完成')
        self.task('child',status='done');self.log('child','complete','2026-11-03',summary='接口联调通过')
        w=self.week();self.assertEqual(len(w['completedProjects']),1);self.assertEqual(len(w['completedTasks']),1)
        self.assertEqual(w['completedTasks'][0]['projectName'],'项目p');self.assertEqual(w['completedTasks'][0]['projectDescription'],'项目目标和范围')

    def test_deferred_completion_is_one_item_with_the_final_completion_record(self):
        self.project('p');self.task('a',status='done',carriedCompletion=True,completedAt='2026-11-04T12:00:00+08:00')
        self.task('b',originId='a',date='2026-11-04',status='done',completedAt='2026-11-04T12:00:00+08:00')
        self.log('a','defer','2026-11-03',remaining='继续联调');self.log('b','complete','2026-11-04',summary='联调完成',actual=30)
        rows=self.week()['completedTasks'];self.assertEqual([t['taskId'] for t in rows],['b']);self.assertEqual(rows[0]['actual'],30)

    def test_merged_repeat_periods_have_one_completion_and_one_actual_duration(self):
        for id in ('a','b'):
            self.task(id,projectId=None,repeatId='r',fixed=True,status='done',completedAt='2026-11-04T12:00:00+08:00',
                      **({'stackCompletedBy':'b','carriedCompletion':True} if id=='a' else {'stackPeriods':['a','b']}))
        self.log('b','complete','2026-11-04',summary='两期一起完成',actual=50,stackCount=2,stackPeriods=['a','b'])
        rows=self.week()['completedTasks'];self.assertEqual(len(rows),1);self.assertEqual((rows[0]['taskId'],rows[0]['stackCount'],rows[0]['actual']),('b',2,50))

    def test_separate_repeat_occurrences_are_not_merged_just_for_sharing_a_name(self):
        for id,day in [('a','2026-11-02'),('b','2026-11-04')]:
            self.task(id,projectId=None,name='固定复盘',repeatId='r',fixed=True,status='done');self.log(id,'complete',day,summary='独立完成')
        self.assertEqual([t['taskId'] for t in self.week()['completedTasks']],['a','b'])

    def test_task_completion_date_never_falls_back_to_the_planned_date(self):
        self.task('old',projectId=None,status='done',createdAt='2026-10-01T12:00:00+08:00',completedAt='2026-10-30T12:00:00+08:00')
        self.task('next',projectId=None,status='done',completedAt='2026-11-07T12:00:00+08:00')
        self.task('utc-next',projectId=None,status='done',completedAt='2026-11-06T17:00:00Z')
        self.task('undated',projectId=None,status='done')
        self.task('early',projectId=None,date='2026-11-10',status='done',completedAt='2026-11-04T12:00:00+08:00',completionSummary='提前完成')
        self.assertEqual([t['taskId'] for t in self.week()['completedTasks']],['early'])

    def test_reopened_task_moves_to_remaining_work(self):
        self.project('p');self.task('t',status='todo');self.log('t','complete','2026-11-03',summary='首次完成')
        self.log('t','reopen','2026-11-05',reason='补齐数据来源')
        w=self.week();self.assertEqual(w['completedTasks'],[]);self.assertEqual(w['unfinishedProjects'][0]['remaining'][0]['reason'],'补齐数据来源')

    def test_historical_completion_does_not_take_a_later_redo_or_summary(self):
        self.project('p');self.task('t',status='done',completedAt='2026-11-11T12:00:00+08:00',completionSummary='后来结果')
        self.log('t','complete','2026-11-03',summary='当周结果',actual=20,feeling='困难')
        self.log('t','reopen','2026-11-10',reason='后来打回');self.log('t','complete','2026-11-11',summary='后来结果',actual=90,feeling='顺利')
        row=self.week()['completedTasks'][0];self.assertEqual((row['summary'],row['actual'],row['feeling']),('当周结果',20,'困难'));self.assertNotIn('后来结果',str(self.week()))

    def test_completion_edits_follow_the_cutoff_and_keep_original_followup(self):
        self.task('t',projectId=None,status='done',completedAt='2026-11-03T12:00:00+08:00',completionSummary='后来改写')
        self.log('t','complete','2026-11-03',summary='原总结',actual=20,feeling='困难',followup='需要复核')
        self.log('t','complete_edit','2026-11-04',summary='修正后的总结',actual=25,feeling='一般')
        self.log('t','complete_edit','2026-11-08',summary='后来改写',actual=90,feeling='顺利')
        row=self.week()['completedTasks'][0];self.assertEqual((row['summary'],row['actual'],row['feeling'],row['followup']),('修正后的总结',25,'一般','需要复核'))

    def test_completion_is_not_dropped_when_project_metadata_is_missing(self):
        self.task('t',projectId='missing',status='done');self.log('t','complete','2026-11-03',summary='保留任务成果')
        self.assertEqual(self.week()['completedTasks'][0]['summary'],'保留任务成果')

    def test_state_events_are_ordered_by_instant_across_timezones(self):
        self.task('t',projectId=None,status='todo')
        self.s.put('logs',{'taskId':'t','kind':'complete','actor':'member','createdAt':'2026-11-06T18:00:00+08:00','summary':'先完成'})
        self.s.put('logs',{'taskId':'t','kind':'reopen','actor':'member','createdAt':'2026-11-06T11:00:00Z','reason':'后打回'})
        self.assertEqual(self.week()['completedTasks'],[]);self.assertEqual(len(self.week()['unfinishedOther']),1)
