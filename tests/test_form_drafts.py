"""草稿箱 and the rule-group switch that keeps 临时任务 to oneself."""
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem, FORM_DRAFT_CHARS, FORM_DRAFT_LIMIT, now


class FormDraftTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'drafts.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.day = now().date().isoformat()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def save(self, who='test001', key='task.new', **extra):
        data = {'key': key, 'title': '新任务', 'fields': {'taskName': '写周报', 'taskDesc': '先列提纲'},
                'reopen': {'fn': 'newTask', 'args': [None]}, **extra}
        return self.store.action(self.store.user(who), 'formdraft.save', data)

    def test_a_draft_is_kept_for_its_author_only(self):
        self.save()
        mine = self.store.snapshot(self.store.user('test001'))['formDrafts']
        self.assertEqual([(d['key'], d['fields']['taskDesc']) for d in mine], [('task.new', '先列提纲')])
        self.assertEqual(self.store.snapshot(self.store.user('test002'))['formDrafts'], [])
        self.assertEqual(self.store.snapshot(self.admin)['formDrafts'], [], '管理员也看不到别人的草稿')
        # Saving the same form again replaces its draft.
        self.save(fields={'taskName': '写周报', 'taskDesc': '改成先写结论'})
        mine = self.store.snapshot(self.store.user('test001'))['formDrafts']
        self.assertEqual([d['fields']['taskDesc'] for d in mine], ['改成先写结论'])

    def test_drafts_are_not_written_to_the_audit_log(self):
        self.save()
        self.store.action(self.store.user('test001'), 'formdraft.delete', {'key': 'task.new'})
        self.assertFalse(any(a['action'].startswith('formdraft.') for a in self.store.all('audit')))
        self.assertEqual(self.store.snapshot(self.store.user('test001'))['formDrafts'], [])

    def test_bad_drafts_are_refused(self):
        for extra in ({'key': '../x'}, {'fields': {}}, {'fields': {'a': 1}},
                      {'fields': {'taskDesc': 'x' * (FORM_DRAFT_CHARS + 1)}}, {'reopen': {'fn': 'eval', 'args': []}},
                      {'reopen': ['newTask']}, {'reopen': {'fn': 'newTask', 'args': ''}},
                      {'reopen': {'fn': 'newTask', 'args': [{'x': 1}]}}):
            with self.subTest(extra=extra), self.assertRaises(Problem):
                self.save(**extra)

    def test_delayed_draft_operations_cannot_run_under_the_next_account(self):
        self.save(who='test002')
        with self.assertRaises(Problem) as rejected:
            self.save(who='test002', owner='test001')
        self.assertEqual(rejected.exception.status, 403)
        with self.assertRaises(Problem) as rejected:
            self.store.action(self.store.user('test002'), 'formdraft.delete', {'owner': 'test001', 'key': 'task.new'})
        self.assertEqual(rejected.exception.status, 403)
        self.assertEqual(len(self.store.form_drafts('test002')), 1)

    def test_deleting_names_the_drafts_and_counts_what_went(self):
        member = self.store.user('test001')
        self.save()
        for data in ({}, {'key': None}, {'keys': ['../x']}):
            with self.subTest(data=data), self.assertRaises(Problem):
                self.store.action(member, 'formdraft.delete', data)
        gone = self.store.action(member, 'formdraft.delete', {'keys': ['task.new', 'task.gone']})
        self.assertEqual(gone, {'deleted': 1})
        # Another account's draft with the same key is not touched.
        self.save(who='test002')
        self.assertEqual(self.store.action(member, 'formdraft.delete', {'key': 'task.new'}), {'deleted': 0})
        self.assertEqual(len(self.store.snapshot(self.store.user('test002'))['formDrafts']), 1)

    def test_a_write_that_arrives_late_cannot_undo_newer_text(self):
        member = self.store.user('test001')
        self.save(fields={'taskName': '新的'}, typedAt='2026-11-13T10:00:02.000Z')
        kept = self.save(fields={'taskName': '旧的'}, typedAt='2026-11-13T10:00:01.000Z')
        self.assertEqual(kept['fields']['taskName'], '新的')
        self.store.action(member, 'formdraft.delete', {'key': 'task.new', 'typedAt': '2026-11-13T10:00:01.500Z'})
        self.assertEqual(len(self.store.form_drafts('test001')), 1, '删除之后才打的字留着')
        # A malformed time is ignored and the save still lands.
        self.save(typedAt='not a time')
        self.assertEqual(self.store.form_drafts('test001')[0]['typedAt'], '')
        self.store.action(member, 'formdraft.delete', {'key': 'task.new', 'typedAt': '2026-11-13T10:00:03.000Z'})
        self.assertEqual(self.store.form_drafts('test001'), [])

    def test_only_the_newest_drafts_are_kept(self):
        for i in range(FORM_DRAFT_LIMIT + 3):
            self.save(key=f'task.edit:{i}')
        keys = [d['key'] for d in self.store.snapshot(self.store.user('test001'))['formDrafts']]
        self.assertEqual(len(keys), FORM_DRAFT_LIMIT)
        self.assertNotIn('task.edit:0', keys)

    def test_deleting_an_account_removes_its_drafts(self):
        self.save(who='test002')
        self.store.action(self.admin, 'account.delete', {'id': 'test002', 'confirm': 'test002'})
        self.assertEqual(self.store.all('form_drafts'), [])


class TempAssignRuleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'rules.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002', 'test003'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin = self.store.user('superadmin')
        self.day = now().date().isoformat()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def set_rule(self, temp_assign):
        groups = self.store.creation_policy()['groups']
        groups = [{**g, 'tempAssign': temp_assign} if g['id'] == 'default' else g for g in groups]
        self.store.action(self.admin, 'creation.update', {'groups': groups, 'assign': {}})

    def hand(self, assignee):
        return self.store.action(self.store.user('test001'), 'task.create', {
            'name': '帮忙核对', 'assignee': assignee, 'date': self.day, 'duration': 30,
        })

    def test_by_default_a_member_may_hand_a_temp_task_on(self):
        self.assertEqual(self.store.creation_rules(self.store.user('test001'))['tempAssign'], 'anyone')
        self.assertEqual(self.hand('test002')['assignee'], 'test002')

    def test_a_self_only_group_keeps_temp_tasks_to_oneself(self):
        self.set_rule('self')
        self.assertEqual(self.store.snapshot(self.store.user('test001'))['creationRules']['tempAssign'], 'self')
        with self.assertRaises(Problem) as refused:
            self.hand('test002')
        self.assertEqual(refused.exception.status, 403)
        own = self.hand('test001')
        with self.assertRaises(Problem):
            self.store.action(self.store.user('test001'), 'task.update', {'id': own['id'], 'assignee': 'test002'})
        # Other edits to one's own temp task still go through.
        moved = self.store.action(self.store.user('test001'), 'task.update', {'id': own['id'], 'duration': 45})
        self.assertEqual(moved['duration'], 45)
        # Admins still hand temp tasks to members.
        given = self.store.action(self.admin, 'task.create', {'name': '派给成员', 'assignee': 'test002', 'date': self.day})
        self.assertEqual(given['assignee'], 'test002')

    def test_no_edit_request_can_hand_a_temp_task_on(self):
        # So approving one never gets round the 只给自己 rule either.
        task = self.hand('test002')
        with self.assertRaises(Problem) as refused:
            self.store.action(self.store.user('test002'), 'task.edit_request', {
                'id': task['id'], 'changes': {'assignee': 'test003'}, 'reason': '交给更合适的人',
            })
        self.assertEqual(refused.exception.status, 400)
        self.assertEqual(refused.exception.message, '无项目任务不能申请调整负责人')

    def test_an_unknown_assign_rule_is_refused(self):
        with self.assertRaises(Problem):
            self.set_rule('everyone')


if __name__ == '__main__':
    unittest.main()
