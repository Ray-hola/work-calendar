import tempfile
import unittest
from pathlib import Path
from server import Store

class WeeklyOutcomesTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.s=Store(Path(self.tmp.name)/'week.sqlite3',seed=False)
        self.s.create_user('admin','test-password',admin=True);self.s.create_user('member','test-password')
    def tearDown(self):self.s.close();self.tmp.cleanup()
    def task(self,id,**fields):
        t={'id':id,'name':id,'assignee':'member','date':'2026-11-02','status':'todo','createdAt':'2026-11-01T10:00:00+08:00'};t.update(fields);self.s.put('tasks',t)
    def log(self,id,kind,at,**fields):
        self.s.put('logs',{'taskId':id,'actor':'member','kind':kind,'createdAt':at+'T12:00:00+08:00','date':'2026-10-20',**fields})
    def week(self):return self.s.week_work('2026-10-31','2026-11-06')
    def test_completion_uses_event_date_and_feedback_edits_without_counting_twice(self):
        self.task('a',date='2026-10-20',status='done');self.log('a','complete','2026-11-03',summary='完成联调',actual=50,feeling='困难',followup='补文档')
        self.log('a','complete_edit','2026-11-04',summary='修订总结',actual=70,feeling='顺利')
        w=self.week();self.assertEqual(len(w['completed']),1);self.assertEqual(w['completed'][0]['completedOn'],'2026-11-03')
        self.assertEqual((w['completed'][0]['summary'],w['completed'][0]['actual'],w['completed'][0]['followup']),('修订总结',70,'补文档'));self.assertEqual(w['unfinished'],[])
    def test_historical_week_retains_pending_after_later_completion_and_deduplicates_deferrals(self):
        self.task('a',status='done',carriedCompletion=True,completedAt='2026-11-10T10:00:00+08:00')
        self.task('b',originId='a',date='2026-11-04',status='done',completedAt='2026-11-10T10:00:00+08:00')
        self.task('c',originId='a',date='2026-11-09',status='done',createdAt='2026-11-05T10:00:00+08:00',completedAt='2026-11-10T10:00:00+08:00')
        self.log('a','defer','2026-11-03',remaining='验证',reason='等待接口',target='2026-11-04')
        self.log('b','defer','2026-11-05',remaining='最终验收',reason='环境未好',target='2026-11-09')
        self.log('c','complete','2026-11-10',summary='完成')
        w=self.week();self.assertEqual(w['completed'],[]);self.assertEqual(len(w['unfinished']),1)
        self.assertEqual((w['unfinished'][0]['remaining'],w['unfinished'][0]['scheduledOn']),('最终验收','2026-11-09'))
    def test_future_skipped_and_previous_completions_do_not_become_pending(self):
        self.task('future',date='2026-11-09');self.task('skip',status='skipped');self.log('skip','skip','2026-11-04')
        self.task('old',status='done',completedAt='2026-10-30T12:00:00+08:00');self.log('old','complete','2026-10-30')
        self.assertEqual(self.week()['unfinished'],[]);self.assertEqual(self.week()['completed'],[])
    def test_reopened_task_keeps_weekly_achievement_and_remaining_work(self):
        self.task('a');self.log('a','complete','2026-11-02',summary='初稿');self.log('a','reopen','2026-11-03',reason='补验证')
        w=self.week();self.assertTrue(w['completed'][0]['reopened']);self.assertEqual(w['unfinished'][0]['reason'],'补验证')
    def test_manual_feedback_excludes_private_notes_and_auto_placeholders(self):
        self.s.put('diaries',{'id':'d','author':'member','date':'2026-11-03','content':{'done':'完成联调','risks':'等待反馈','next':'验收','note':'私人随记'}})
        self.s.put('diaries',{'id':'auto','author':'member','date':'2026-11-04','auto':True,'content':{'done':'自动摘要'}})
        feedback=self.week()['feedback'];self.assertEqual(len(feedback),1);self.assertNotIn('note',feedback[0]['content'])
    def test_week_endpoint_remains_admin_only_and_returns_work(self):
        from server import Problem,now
        with self.assertRaises(Problem):self.s.action(self.s.user('member'),'brief.week',{'date':now().date().isoformat()})
        w=self.s.action(self.s.user('admin'),'brief.week',{'date':now().date().isoformat()});self.assertIn('work',w)

    def test_later_skip_does_not_remove_historical_backlog(self):
        self.task('a',status='skipped');self.log('a','skip','2026-11-10')
        self.assertEqual(len(self.week()['unfinished']),1)
    def test_admin_daily_feedback_corrections_are_preserved(self):
        self.s.put('diaries',{'id':'d','author':'member','date':'2026-11-03','content':{'done':'原反馈'}})
        w=self.s.week_work('2026-10-31','2026-11-06',[{'date':'2026-11-03','content':{'members':[{'id':'member','name':'member','edited':True,'summary':{'done':'修订反馈','note':'不公开'}}]}}])
        self.assertEqual(len(w['feedback']),1);self.assertEqual(w['feedback'][0]['content'],{'done':'修订反馈'})

    def test_completion_feedback_is_attributed_to_the_performer(self):
        self.task('a',assignee='admin',status='done');self.log('a','complete','2026-11-03',summary='完成')
        self.assertEqual(self.week()['completed'][0]['assignee'],'member')

    def test_project_daily_feedback_corrections_replace_original_owner_report(self):
        self.s.put('reports',{'id':'r','kind':'owner','projectId':'p','author':'member','date':'2026-11-03','content':{'progress':'原进展'}})
        w=self.s.week_work('2026-10-31','2026-11-06',[{'date':'2026-11-03','content':{'projects':[{'id':'p','name':'项目','owner':'member','edited':True,'content':{'progress':'修订进展'}}]}}])
        self.assertEqual(len(w['feedback']),1);self.assertEqual(w['feedback'][0]['content'],{'progress':'修订进展'})

    def test_legacy_completion_never_reports_estimate_as_actual_time(self):
        self.task('a',status='done',duration=120,completedAt='2026-11-03T12:00:00+08:00')
        self.assertEqual(self.week()['completed'][0]['actual'],0)

    def test_missing_completion_time_is_not_invented_from_scheduled_date(self):
        self.task('a',status='done')
        self.assertEqual(self.week()['completed'],[])
