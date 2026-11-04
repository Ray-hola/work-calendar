"""Optional fixed-period grouping: one card and one real completion."""
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo
from server import Store, Problem


class RepeatStackingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.at=datetime(2026,11,4,10,tzinfo=ZoneInfo('Asia/Shanghai'))
        self.base=self.at
        self.clock=patch('server.now',side_effect=lambda:self.at);self.clock.start()
        self.store=Store(Path(self.tmp.name)/'stack.sqlite3',seed=False)
        for name in ('superadmin','member','other','admin'):
            self.store.create_user(name,'fixture-password',name=='superadmin')
        self.store.db.execute("UPDATE users SET role='admin',admin=1 WHERE id='admin'")
        self.admin=self.store.user('superadmin');self.member=self.store.user('member')

    def tearDown(self):
        self.store.close();self.clock.stop();self.tmp.cleanup()

    def rule(self,**extra):
        return self.store.action(self.admin,'repeat.create',{'name':'Same name','assignees':['member'],'start':self.base.date().isoformat(),'end':(self.base.date()+timedelta(days=14)).isoformat(),'frequency':'daily','duration':30,**extra})

    def advance(self,days):
        self.at=self.base+timedelta(days=days);self.store.schedule(self.at)

    def enable(self,value=True):
        self.store.action(self.admin,'repeat.stacking.update',{'enabled':value})

    def visible(self,user=None,day=None):
        return [t for t in self.store.snapshot(user or self.member)['tasks'] if not t.get('superseded') and t.get('date')==(day or self.at.date().isoformat())]

    def pending(self,user=None):
        return [t for t in self.visible(user) if t['status'] in ('todo','doing')]

    def finish(self,id):
        return self.store.action(self.member,'task.complete',{'id':id,'summary':'one execution','actual':35})

    def test_snapshot_uses_one_trigger_instant_for_status_hidden_cards_and_period_count(self):
        self.rule(time='09:00');self.store.snapshot(self.member);self.enable()
        self.at=(self.base+timedelta(days=1)).replace(hour=8,minute=59,second=59)
        self.store.schedule(self.at)
        advance=self.store.advance_due_tasks
        def crossing(at=None):
            result=advance(at)
            self.at=self.at.replace(hour=9,minute=0,second=0)
            return result
        with patch.object(self.store,'advance_due_tasks',side_effect=crossing):
            cards=self.pending()
        self.assertEqual(len(cards),2)
        self.assertEqual({t['status'] for t in cards},{'todo','doing'})
        self.assertTrue(all(not t.get('stackCount') for t in cards))
        cards=self.pending()
        self.assertEqual(len(cards),1)
        self.assertEqual((cards[0]['status'],cards[0]['stackCount']),('doing',2))

    def test_lineage_projection_reuses_groups_when_clock_crosses_trigger(self):
        self.rule(time='09:00');self.store.snapshot(self.member);self.enable()
        self.at=(self.base+timedelta(days=1)).replace(hour=8,minute=59,second=59)
        self.store.schedule(self.at)
        group=self.store._repeat_stack_groups
        def crossing(tasks,*args,**kwargs):
            result=group(tasks,*args,**kwargs)
            self.at=self.at.replace(hour=9,minute=0,second=0)
            return result
        with patch.object(self.store,'_repeat_stack_groups',side_effect=crossing) as grouping:
            leaves=self.store._lineage_leaves(self.store.all('tasks'))
        pending=[t for t in leaves if t['date']<=self.at.date().isoformat() and t['status'] in ('todo','doing')]
        self.assertEqual(grouping.call_count,1)
        self.assertEqual(len(pending),2)
        self.assertTrue(all(not t.get('stackCount') for t in pending))

    def test_due_pending_and_in_progress_periods_share_one_card(self):
        self.rule();self.advance(1);self.enable()
        tasks=self.store.all('tasks')
        current=next(t for t in tasks if t['date']==self.at.date().isoformat())
        current['status']='todo';self.store.put('tasks',current)
        leaves=self.store._lineage_leaves(self.store.all('tasks'))
        pending=[t for t in leaves if t['date']==self.at.date().isoformat() and t['status'] in ('todo','doing')]
        self.assertEqual(len(pending),1)
        self.assertEqual(pending[0]['stackCount'],2)

    def test_default_and_setting_permissions_and_strict_boolean(self):
        self.assertFalse(self.store.snapshot(self.member)['repeatStacking'])
        for name in ('member','admin'):
            with self.assertRaises(Problem) as raised:self.store.action(self.store.user(name),'repeat.stacking.update',{'enabled':True})
            self.assertEqual(raised.exception.status,403)
        for value in ('false',1,None):
            with self.assertRaises(Problem):self.store.action(self.admin,'repeat.stacking.update',{'enabled':value})
        self.enable();self.assertTrue(self.store.snapshot(self.member)['repeatStacking'])

    def test_disabled_mode_keeps_each_period_and_only_completes_one(self):
        self.rule();self.advance(2);self.assertEqual(len(self.pending()),3)
        self.finish(self.pending()[-1]['id']);self.assertEqual(len(self.pending()),2)

    def test_toggle_is_reversible_without_rewriting_tasks(self):
        self.rule();self.advance(2);before=self.store.all('tasks')
        self.enable();card=self.pending()[0]
        self.assertEqual((len(self.pending()),card['stackCount']),(1,3))
        self.assertEqual(len(card['stackTaskIds']),3)
        self.enable(False);self.assertEqual(len(self.pending()),3)
        self.assertEqual(self.store.all('tasks'),before)

    def test_completion_and_retry_from_any_period_only_records_one_execution(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0]
        self.finish(card['stackTaskIds'][0]);self.assertEqual(self.pending(),[])
        self.assertEqual(len(self.visible()),1)
        self.assertEqual(self.visible()[0]['stackCount'],3)
        logs=lambda:[x for x in self.store.all('logs') if x.get('kind')=='complete']
        self.assertEqual(len(logs()),1);self.assertEqual(logs()[0]['actual'],35)
        for id in card['stackTaskIds']:self.finish(id)
        self.assertEqual(len(logs()),1)
        self.assertEqual(len(self.store.work_completions(self.admin)),1)
        self.enable(False);self.assertEqual(len(self.visible()),1)
        future=[t for t in self.store.all('tasks') if t['date']>self.at.date().isoformat()]
        self.assertTrue(future);self.assertTrue(all(t['status']=='todo' for t in future))
        with self.assertRaises(Problem):self.store.action(self.store.user('other'),'task.complete',{'id':card['id'],'summary':'invalid','actual':1})

    def test_sql_profiles_and_diary_use_the_same_single_work_unit(self):
        self.rule();self.advance(2);self.enable()
        tasks=[t for t in self.store.workspace_rows(self.member,'tasks') if t['date']<=self.at.date().isoformat()]
        self.assertEqual(len(tasks),1);self.assertEqual(tasks[0]['stackCount'],3)
        self.assertEqual(self.store.profile('member')['minutes'],30+7*30)
        self.finish(tasks[0]['id'])
        diary=self.store.diary_digest('member',self.at.date().isoformat())
        self.assertIn('Same name',str(diary))
        self.assertEqual(len([t for t in self.store._lineage_leaves(self.store.all('tasks')) if t['date']==self.at.date().isoformat()]),1)

    def test_weekly_multiplier_counts_periods_not_days(self):
        self.rule(frequency='weekly');self.enable();self.advance(5)
        self.assertEqual(len(self.pending()),1);self.assertNotIn('stackCount',self.pending()[0])
        self.advance(8);self.assertEqual(len(self.pending()),1);self.assertEqual(self.pending()[0]['stackCount'],2)
        before=len(self.store.all('tasks'));self.store.schedule(self.at)
        self.assertEqual(len(self.store.all('tasks')),before);self.assertEqual(self.pending()[0]['stackCount'],2)

    def test_manual_deferral_without_repeat_id_still_tracks_its_period(self):
        self.rule();original=self.pending()[0]
        self.store.action(self.member,'task.defer',{'id':original['id'],'date':(self.base.date()+timedelta(days=2)).isoformat(),'reason':'later','remaining':'same work'})
        manual=self.store.get('tasks',self.store.get('tasks',original['id'])['supersededBy'])
        self.assertIsNone(manual['repeatId'])
        self.advance(2);self.enable();self.assertEqual(self.pending()[0]['stackCount'],3)
        self.finish(self.pending()[0]['id']);self.assertFalse(self.pending())

    def test_defer_bundle_to_future_keeps_one_bundle_without_consuming_future_periods(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];target=(self.base.date()+timedelta(days=4)).isoformat()
        self.store.action(self.member,'task.defer',{'id':card['id'],'date':target,'reason':'later','remaining':'same work'})
        self.assertFalse(self.pending())
        future=self.visible(day=target)
        self.assertEqual(len(future),2)  # carried group + that future day's independent occurrence
        self.assertEqual(sorted(t.get('stackCount',1) for t in future),[1,3])
        self.enable(False);self.assertEqual(len(self.visible(day=target)),4)
        self.enable();self.advance(4)
        self.assertEqual(len(self.pending()),1);self.assertEqual(self.pending()[0]['stackCount'],5)

    def test_members_and_same_named_rules_never_mix(self):
        self.rule(assignees=['member','other']);self.rule();self.advance(2);self.enable()
        self.assertEqual(sorted(t['stackCount'] for t in self.pending()),[3,3])
        self.assertEqual([t['stackCount'] for t in self.pending(self.store.user('other'))],[3])
        self.finish(self.pending()[0]['id']);self.assertEqual(len(self.pending()),1)
        self.assertEqual(len(self.pending(self.store.user('other'))),1)

    def test_active_multi_day_period_is_not_treated_as_overdue(self):
        self.rule(span=3);self.enable();self.advance(1)
        active=[t for t in self.store.snapshot(self.member)['tasks'] if not t.get('superseded') and t['date']<=self.at.date().isoformat()]
        self.assertEqual(len(active),2);self.assertTrue(all('stackCount' not in t for t in active))

    def test_skip_current_period_preserves_carried_work(self):
        rule=self.rule();self.advance(1);self.enable();self.assertEqual(self.pending()[0]['stackCount'],2)
        self.store.action(self.admin,'repeat.skip',{'id':rule['id'],'date':self.at.date().isoformat()})
        self.assertEqual(len(self.pending()),1);self.assertNotIn('stackCount',self.pending()[0])
        self.assertTrue(self.pending()[0]['originId'])

    def test_reopen_and_complete_keeps_history_one_work_unit(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];self.finish(card['id'])
        self.store.action(self.admin,'task.reopen',{'id':card['id'],'reason':'needs changes'})
        self.assertEqual(len(self.pending()),1);self.assertEqual(self.pending()[0]['stackCount'],3)
        self.assertEqual(self.store.work_completions(self.admin),[])
        self.finish(card['id']);self.assertEqual(len(self.store.work_completions(self.admin)),1)

    def test_batch_failure_rolls_back_all_periods(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];before=self.store.all('tasks')
        with self.assertRaises(Problem):self.store.action(self.member,'task.defer',{'id':card['id'],'date':self.at.date().isoformat(),'reason':'invalid','remaining':'invalid'})
        self.assertEqual(self.store.all('tasks'),before)

    def test_period_change_rejects_a_stale_group_confirmation(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];self.enable(False)
        with self.assertRaises(Problem) as error:self.store.action(self.member,'task.complete',{'id':card['id'],'stackPeriods':card['stackPeriods'],'summary':'stale','actual':1})
        self.assertEqual(error.exception.status,409);self.assertEqual(len(self.pending()),3)

    def test_failure_after_first_deferred_period_rolls_back_the_whole_group(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];before=self.store.all('tasks');logs=self.store.all('logs')
        progress=self.store._task_progress;calls=[]
        def fail_second(user,action,data,**options):
            calls.append(data['id'])
            if len(calls)==2:raise Problem(409,'simulated conflict')
            return progress(user,action,data,**options)

        with patch.object(self.store,'_task_progress',side_effect=fail_second):
            with self.assertRaises(Problem):self.store.action(self.member,'task.defer',{'id':card['id'],'date':(self.at.date()+timedelta(days=1)).isoformat(),'reason':'later','remaining':'same'})
        self.assertEqual(len(calls),2);self.assertEqual(self.store.all('tasks'),before);self.assertEqual(self.store.all('logs'),logs)

    def test_rules_paused_after_grouping_preserve_the_outstanding_group(self):
        rule=self.rule();self.advance(2);self.enable()
        self.store.action(self.admin,'repeat.toggle',{'id':rule['id'],'active':False})
        self.assertEqual(len(self.pending()),1);self.assertEqual(self.pending()[0]['stackCount'],3)

    def test_different_projects_never_share_a_group(self):
        rule=self.rule();self.advance(2)
        # Move only one period to a separate scope; grouping keys must use each
        # current task's project rather than just its rule or display name.
        live=self.pending();live[0]['projectId']='another-project'
        with self.store.db:self.store.put('tasks',live[0])
        self.enable();groups=self.store._repeat_stack_groups(self.store.all('tasks'))
        self.assertEqual([len(g) for g in groups],[2]);self.assertTrue(all(t.get('projectId') is None for t in groups[0]))

    def test_report_deduplication_does_not_change_unrelated_legacy_task_counts(self):
        self.rule();self.advance(2);self.enable();self.finish(self.pending()[0]['id'])
        with self.store.db:
            ordinary=self.store.put('tasks',{'id':'ordinary','name':'ordinary','assignee':'member','date':self.at.date().isoformat(),'status':'deferred','duration':10})
            self.store.put('tasks',{**ordinary,'id':'ordinary-copy','originId':'ordinary','status':'done'})
        digest=self.store.diary_digest('member',self.at.date().isoformat())
        self.assertEqual((digest['tasks'],digest['completed']),(3,2))
        self.enable(False);self.assertEqual(self.store.diary_digest('member',self.at.date().isoformat())['tasks'],3)

    def test_project_report_counts_grouped_periods_once(self):
        project=self.store.action(self.admin,'project.create',{'name':'project','owner':'member','members':['member'],'start':self.base.date().isoformat(),'cycle':'infinite'})
        self.rule(projectId=project['id']);self.advance(2);self.enable()
        content,_=self.store.aggregate(project,self.at.date().isoformat(),self.at)
        self.assertEqual(content['progress'],'0/1 项当日任务已完成')
        self.finish(self.pending()[0]['id'])
        content,_=self.store.aggregate(project,self.at.date().isoformat(),self.at)
        self.assertEqual(content['progress'],'1/1 项当日任务已完成')

    def test_reopened_old_group_keeps_period_dates_when_joining_a_new_period(self):
        self.rule();self.advance(1);self.enable();card=self.pending()[0];self.finish(card['id'])
        self.advance(2);self.store.action(self.admin,'task.reopen',{'id':card['id'],'reason':'redo'})
        current=self.pending()
        self.assertEqual(len(current),1);self.assertEqual(current[0]['stackCount'],3)
        self.assertEqual(current[0]['stackDates'],[(self.base.date()+timedelta(days=i)).isoformat() for i in range(3)])
        self.finish(current[0]['id']);self.assertFalse(self.pending())

    def test_next_period_does_not_join_before_its_trigger_time(self):
        self.rule(time='09:00');self.enable();self.at=(self.base+timedelta(days=1)).replace(hour=8)
        self.store.schedule(self.at);self.assertEqual(len(self.pending()),2)
        self.assertTrue(all('stackCount' not in t for t in self.pending()))
        self.at=self.at.replace(hour=9)
        self.assertEqual(len(self.pending()),1);self.assertEqual(self.pending()[0]['stackCount'],2)

    def test_history_snapshots_group_scope_and_actual_time_immutably(self):
        self.rule();self.advance(2);self.enable();card=self.pending()[0];self.finish(card['id'])
        original=next(x for x in self.store.all('logs') if x.get('kind')=='complete')
        self.assertEqual((original['stackCount'],original['actual']),(3,35))
        self.assertEqual(len(original['stackDates']),3)
        self.store.action(self.member,'task.completion.update',{'id':card['id'],'summary':'corrected','actual':40})
        edit=next(x for x in self.store.all('logs') if x.get('kind')=='complete_edit')
        self.assertEqual((edit['stackCount'],edit['actual']),(3,40))
        self.advance(3);self.store.action(self.admin,'task.reopen',{'id':card['id'],'reason':'redo'})
        reopened=next(x for x in self.store.all('logs') if x.get('kind')=='reopen')
        self.assertEqual(reopened['stackCount'],3)
        self.finish(self.pending()[0]['id'])
        completions=[x for x in self.store.all('logs') if x.get('kind')=='complete']
        self.assertEqual([x['stackCount'] for x in completions],[3,4])
        self.assertEqual(completions[0],original)

    def test_the_project_owner_hears_once_about_a_whole_group(self):
        project=self.store.action(self.admin,'project.create',{'name':'P','owner':'other','members':['member'],'start':self.base.date().isoformat(),'cycle':'infinite'})
        self.rule(projectId=project['id']);self.advance(2);self.enable()
        notices=lambda:[n for n in self.store.all('notifications') if n['to']=='other' and n['title']=='项目任务进度']
        card=self.pending()[0];self.assertEqual(card['stackCount'],3)
        self.store.action(self.member,'task.defer',{'id':card['id'],'stackPeriods':card['stackPeriods'],'date':(self.at.date()+timedelta(days=1)).isoformat(),'reason':'later','remaining':'same'})
        self.assertEqual(len(notices()),1,'整组递延只通知一次')
        self.assertIn('（合并 3 期）',notices()[0]['body'])
        self.advance(3);card=self.pending()[0]
        self.store.action(self.member,'task.complete',{'id':card['id'],'stackPeriods':card['stackPeriods'],'summary':'done','actual':30})
        self.assertEqual(len(notices()),2,'整组完成也只通知一次')
        self.assertIn('（合并 4 期）',notices()[1]['body'])
        self.assertIn('"stackCount": 4',notices()[1]['body'],'通知附带的记录写明期数')

    def test_group_deferral_logs_share_a_batch_with_frozen_periods(self):

        self.rule();self.advance(2);self.enable();card=self.pending()[0]
        self.store.action(self.member,'task.defer',{'id':card['id'],'date':(self.at.date()+timedelta(days=1)).isoformat(),'reason':'later','remaining':'same'})
        events=[x for x in self.store.all('logs') if x.get('stackBatchId')]
        self.assertEqual(len(events),3);self.assertEqual(len({x['stackBatchId'] for x in events}),1)
        self.assertTrue(all(x['stackCount']==3 and len(x['stackDates'])==3 for x in events))
