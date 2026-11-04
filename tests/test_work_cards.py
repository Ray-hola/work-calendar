"""Unified drafts never write; reviewed cards retain normal rights and versions."""
import json
import re
import uuid
import unittest
import test_agent_workspace as support
from agent_workspace import WorkspaceError
from server import Problem, WORK_CARD_ACTIONS


class WorkCardTests(unittest.TestCase):
    setUp = support.AgentWorkspaceTests.setUp
    tearDown = support.AgentWorkspaceTests.tearDown
    task = support.AgentWorkspaceTests.task
    chat = support.AgentWorkspaceTests.chat

    def preview(self, kind, operation, user=None, **fields):
        return self.store.action(user or self.admin, 'work.cards.preview', {kind+'s':[{**fields,'operation':operation}]})[kind+'s'][0]

    def apply(self, kind, card, user=None, **extra):
        card.setdefault('cardId',uuid.uuid4().hex)
        return self.store.action(user or self.admin, 'work.card.apply', {'kind':kind,'operation':card['operation'],'cardId':card['cardId'],
            'id':card.get('id'),'revision':card.get('revision'),'changes':{k:v for k,v in card.items() if k not in ('before','revision','impact','id','operation','cardId')},'confirmed':True,**extra})

    def make_project(self):
        return self.store.action(self.admin, 'project.create', {'name':'原项目','owner':'owner','start':'2026-11-03','cycle':'infinite','members':['mate']})

    def test_native_tool_unifies_all_six_operations_without_writing(self):
        p=self.make_project();t=self.task('原任务',projectId=p['id']);self.store.db.commit()
        for kind in ('project','task'):
            for op in ('create','update','delete'):
                with self.subTest(kind=kind,operation=op):
                    item={'operation':op,'name':'拟定名称'}
                    if op!='create':item['id']=p['id'] if kind=='project' else t['id']
                    result=self.chat(support.calls(support.tool('work_cards',{kind+'s':[item]})))
                    self.assertIn('<plan>',result['content']);self.assertNotIn('<action>',result['content'])
                    card=json.loads(re.search(r'<plan>(.*?)</plan>',result['content']).group(1))[kind+'s'][0]
                    self.assertEqual(card['operation'],op)
                    if op!='create':self.assertTrue(card['revision']);self.assertIn('before',card)
                    payload=json.loads(self.seen[-1].data)
                    definitions={t['function']['name']:t['function'] for t in payload['tools']}
                    self.assertIn('work_cards',definitions)
                    other=definitions['business_action']['parameters']['properties']['action']['enum']
                    self.assertFalse(set(other)&WORK_CARD_ACTIONS)
        self.assertEqual(self.store.get('tasks',t['id'])['name'],'原任务')
        self.assertEqual(self.store.get('projects',p['id'])['name'],'原项目')

    def test_text_action_compatibility_also_routes_six_operations_to_cards(self):
        p=self.make_project();t=self.task('原任务',projectId=p['id']);self.store.db.commit()
        for kind in ('project','task'):
            for op in ('create','update','delete'):
                data={'name':'待确认'}
                if op!='create':data['id']=p['id'] if kind=='project' else t['id']
                result=self.chat(support._chat('<action>'+json.dumps({'action':kind+'.'+op,'data':data})+'</action>'))
                self.assertIn('<plan>',result['content']);self.assertNotIn('<action>',result['content'])
        with self.assertRaises(Problem) as error:self.store.execute_agent_action(self.admin,{'action':'task.create','confirmed':True,'data':{'name':'旁路'}})
        self.assertEqual(error.exception.status,409)

    def test_non_management_business_tools_cannot_prepare_crud(self):
        responses=iter([support.calls(support.tool('business_action',{'action':'project.delete','data':{'id':'p'}})),support._chat('改用管理卡片。')])
        result=self.chat(lambda r:next(responses))
        self.assertFalse(result['tools'][0]['ok']);self.assertNotIn('<action>',result['content'])

    def test_reviewed_creates_use_normal_permissions_and_record_receipts(self):
        p=self.apply('project',{'operation':'create','name':'新项目','owner':'owner','start':'2026-11-03','cycle':'infinite','members':['mate']},sessionId='card-session')
        t=self.apply('task',{'operation':'create','name':'新任务','assignee':'mate','projectId':p['id'],'date':'2026-11-03'})
        self.assertEqual(t['projectId'],p['id'])
        self.assertTrue(any(m.get('action')=='project.create' and m.get('conversation')=='card-session' for m in self.store.all('agent_messages')))
        with self.assertRaises(Problem):self.store.action(self.admin,'work.card.apply',{'kind':'task','operation':'create','changes':{'name':'未确认'}})

    def test_updates_keep_existing_fields_and_reject_stale_versions(self):
        t=self.task('原任务',desc='必须保留',time='10:30',deadline='2026-11-10');self.store.db.commit()
        card=self.preview('task','update',id=t['id'],name='新名字')
        self.store.put('tasks',{**t,'priority':'P0'});self.store.db.commit()
        with self.assertRaises(Problem) as error:self.apply('task',card)
        self.assertEqual(error.exception.status,409)
        fresh=self.preview('task','update',id=t['id'],name='新名字')
        result=self.apply('task',fresh)
        self.assertEqual((result['name'],result['desc'],result['priority'],result['time'],result['deadline']),('新名字','必须保留','P0','10:30','2026-11-10'))

    def test_project_delete_requires_typed_name_and_current_dependency_version(self):
        p=self.make_project();t=self.task('关联任务',projectId=p['id']);self.store.db.commit()
        card=self.preview('project','delete',id=p['id'],confirm=p['name'])
        self.assertNotIn('confirm',card);self.assertEqual(card['impact']['tasks'],1)
        with self.assertRaises(Problem):self.apply('project',card,confirm='错误名字')
        self.store.put('tasks',{**t,'desc':'删除确认期间变动，但数量未变'});self.store.db.commit()
        with self.assertRaises(Problem) as error:self.apply('project',card,confirm=p['name'])
        self.assertEqual(error.exception.status,409)
        fresh=self.preview('project','delete',id=p['id']);self.apply('project',fresh,confirm=p['name'])
        self.assertFalse(any(r['id']==p['id'] for r in self.store.all('projects')))
        self.assertFalse(any(r['id']==t['id'] for r in self.store.all('tasks')))

    def test_member_cannot_delete_task_or_manage_another_owners_project(self):
        p=self.make_project();t=self.task('自己的任务');self.store.db.commit()
        with self.assertRaises(Problem):self.preview('project','delete',user=self.member,id=p['id'])
        card=self.preview('task','delete',user=self.member,id=t['id'])
        with self.assertRaises(Problem):self.apply('task',card,user=self.member,confirm=t['name'])
        fixed=self.task('固定任务',fixed=True);self.store.db.commit()
        with self.assertRaises(Problem):self.apply('task',self.preview('task','delete',id=fixed['id']),confirm=fixed['name'])

    def test_readonly_member_submits_change_request_under_own_business_rights(self):
        p=self.make_project();t=self.task('他人安排的任务',creator='owner',projectId=p['id']);self.store.db.commit()
        card=self.preview('task','update',user=self.member,id=t['id'],name='申请新名称')
        with self.assertRaises(Problem):self.apply('task',card,user=self.member)
        result=self.apply('task',card,user=self.member,request=True,reason='实际安排调整')
        self.assertEqual(result['status'],'pending')
        self.assertEqual(self.store.get('tasks',t['id'])['name'],t['name'])
        self.assertEqual(self.store.agent_capabilities(self.member)['mode'],'readonly')

    def test_preview_does_not_accept_forged_baselines_or_private_targets(self):
        private=self.task('他人私密任务','outsider');self.store.db.commit()
        with self.assertRaises(Problem):self.preview('task','update',user=self.member,id=private['id'],name='x')
        own=self.task('自己的任务');self.store.db.commit()
        card=self.preview('task','update',id=own['id'],name='修改',before={'name':'伪造'},revision='fake')
        self.assertEqual(card['before']['name'],own['name']);self.assertNotEqual(card['revision'],'fake')
        with self.assertRaises(Problem):self.preview('task','drop',id=own['id'])
        result=self.apply('task',card,changes={'name':'修改','projectId':'private','creator':'outsider'})
        self.assertIsNone(result['projectId']);self.assertNotEqual(result.get('creator'),'outsider')

    def test_project_update_and_task_delete_use_the_same_reviewed_route(self):
        p=self.make_project();card=self.preview('project','update',id=p['id'],name='新项目名')
        self.apply('project',card);self.assertEqual(self.store.get('projects',p['id'])['name'],'新项目名')
        t=self.task('待删除任务');self.store.db.commit();card=self.preview('task','delete',id=t['id'])
        with self.assertRaises(Problem):self.apply('task',card)
        self.apply('task',card,confirm=t['name']);self.assertFalse(any(r['id']==t['id'] for r in self.store.all('tasks')))
        audit=[r for r in self.store.all('audit') if r.get('action')=='work.card.apply']
        self.assertTrue(audit);self.assertTrue(all('changes' not in r['details'] for r in audit))

    def test_collaborator_changes_share_project_update_cards_and_keep_domain_rules(self):
        p=self.make_project();self.assertEqual(p['members']['mate'],'accepted')
        card=self.preview('project','update',id=p['id'],addMembers=['outsider'],removeMembers=['mate'])
        result=self.apply('project',card)
        self.assertEqual(result['members']['outsider'],'accepted');self.assertNotIn('mate',result['members'])
        owner=self.store.user('owner')
        card=self.preview('project','update',user=owner,id=p['id'],addMembers=['mate'])
        result=self.apply('project',card,user=owner)
        self.assertEqual(result['members']['mate'],'accepted')
        result=self.chat(support._chat('<action>'+json.dumps({'action':'project.invite','data':{'id':p['id'],'members':['mate']}})+'</action>'))
        self.assertNotIn('<action>',result['content']);self.assertIn('addMembers',result['content'])

    def test_invalid_collaborator_change_rolls_back_other_edits_and_requires_explicit_operations(self):
        p=self.make_project();card=self.preview('project','update',id=p['id'],name='不应保存',removeMembers=['owner'])
        with self.assertRaises(Problem):self.apply('project',card)
        self.assertEqual(self.store.get('projects',p['id'])['name'],p['name'])
        with self.assertRaises(Problem):self.preview('project','update',id=p['id'],members=['outsider'])
