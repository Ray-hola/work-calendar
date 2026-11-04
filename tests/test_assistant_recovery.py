"""Regression coverage for the assistant audit's privacy and recovery failures."""
import json
import threading
import unittest
from unittest import mock

import test_agent_workspace as support
from test_assistant_config import _provider, _chat
from server import Store, Problem, now


class AssistantRecoveryTests(unittest.TestCase):
    setUp = support.AgentWorkspaceTests.setUp
    tearDown = support.AgentWorkspaceTests.tearDown
    chat = support.AgentWorkspaceTests.chat

    def test_keys_are_bound_to_api_root_for_probe_save_and_speech(self):
        original = {'baseUrl': 'https://old.example/v1', 'model': 'm', 'apiKey': 'fixture-old-secret'}
        self.store.put('settings', {'id': 'llm', 'value': original})
        self.store.db.commit()
        seen = []
        with mock.patch('server.urllib.request.urlopen', _provider({'/models': {'data': [{'id': 'm'}]}, '/chat/completions': _chat('好')}, seen)):
            self.store.action(self.admin, 'agent.config.test', {'baseUrl': 'https://new.example/v1', 'model': 'm'})
            self.assertTrue(all(r.get_header('Authorization') is None for r in seen))
            seen.clear()
            self.store.action(self.admin, 'agent.config.test', {'baseUrl': 'https://old.example/v1/chat/completions', 'model': 'm'})
            self.assertTrue(all(r.get_header('Authorization') == 'Bearer fixture-old-secret' for r in seen))
        self.store.action(self.admin, 'agent.config.set', {'baseUrl': 'https://new.example/v1', 'model': 'm'})
        self.assertFalse(self.store._llm_record()['value'].get('apiKey'))
        self.store.action(self.admin,'agent.config.set',{'baseUrl':'https://new.example/v1','model':'m','apiKey':'fixture-conflicting-secret','clearApiKey':True})
        self.assertFalse(self.store._llm_record()['value'].get('apiKey'))
        self.store.action(self.admin, 'agent.asr.set', {**original})
        self.store.action(self.admin, 'agent.asr.set', {'baseUrl': 'https://new.example/v1'})
        self.assertFalse(self.store._asr_record()['value'].get('apiKey'))
        self.store.action(self.admin, 'agent.asr.set', {'disabled': True})
        self.assertFalse(self.store.asr_config(self.admin)['configured'])

    def test_nested_credentials_are_absent_from_records_audit_and_history(self):
        secret = 'fixture-password-never-retained'
        self.store.action(self.admin, 'agent.execute', {'action': 'account.create', 'confirmed': True,
            'sessionId': 'privacy', 'data': {'username': 'newmember', 'password': secret, 'role': 'member'}})
        self.assertTrue(self.store.check_password('newmember', secret))
        for table in ('audit', 'agent_messages'):
            self.assertNotIn(secret, json.dumps(self.store.all(table)))
        self.store.record_agent_message(self.admin['id'], 'assistant', '<action>'+json.dumps({'action': 'account.create', 'data': {'password': secret}})+'</action>')
        self.assertNotIn(secret, json.dumps(self.store.agent_history(self.admin, {})))
        # Exercise migration against the exact old raw nested-record shape.
        self.store.put('audit', {'id': 'old-sensitive', 'details': {'data': {'apiKey': secret}}})
        self.store.db.execute("DELETE FROM jobs WHERE id='migrate:assistant-credentials-v1'")
        self.store.db.commit()
        self.store.scrub_assistant_records()
        self.assertNotIn(secret, json.dumps(self.store.all('audit')))
        self.assertTrue(self.store.check_password('newmember', secret))

    def test_model_account_proposal_never_returns_a_password(self):
        result = self.chat(support.calls(support.tool('business_action', {'action': 'account.create',
            'data': {'username': 'newmember', 'password': 'fixture-generated-secret'}})))
        self.assertNotIn('fixture-generated-secret', result['content'])
        self.assertNotIn('fixture-generated-secret', json.dumps(self.store.all('agent_messages')))
        self.assertNotIn('newmember', [u['id'] for u in self.store.users()])

    def create_card(self, identity='stable-test-card-0001'):
        return {'cardId': identity, 'kind': 'task', 'operation': 'create', 'confirmed': True,
                'changes': {'name': '可重试任务', 'assignee': 'mate', 'date': now().date().isoformat(), 'duration': 30}}

    def test_durable_card_receipt_survives_reopen_and_rejects_changed_intent(self):
        card = self.create_card()
        first = self.store.action(self.admin, 'work.card.apply', card)
        self.store.close();self.store = Store(self.store.path, seed=False)
        again = self.store.action(self.admin, 'work.card.apply', card)
        self.assertEqual(first['id'], again['id'])
        self.assertEqual(len(self.store.all('tasks')), 1)
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'work.card.apply', {**card, 'changes': {**card['changes'], 'name': '不同意图'}})
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'work.card.apply', {k: v for k, v in card.items() if k != 'cardId'})
        self.assertEqual(len(self.store.all('tasks')), 1)
        with self.assertRaises(Problem):
            self.store.action(self.member, 'work.card.apply', {**card, 'changes': {**card['changes'], 'assignee': 'ghost'}})

    def test_draft_round_trip_versions_receipts_and_user_isolation(self):
        raw = self.store.prepare_work_cards(self.admin, {'tasks': [{'name': '原名', 'assignee': 'mate'}]})
        self.store.save_initial_draft(self.admin, 'draft-chat', raw);self.store.db.commit()
        board = {'projects': [], 'tasks': [{**raw['tasks'][0], 'name': '用户修改', 'state': 'rejected', 'selected': True}], 'next': 1}
        saved = self.store.action(self.admin, 'agent.draft.save', {'draftId': raw['draftId'], 'conversationId': 'draft-chat', 'version': 0, 'board': board})
        self.assertEqual(saved['version'], 1)
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'agent.draft.save', {'draftId': raw['draftId'], 'conversationId': 'draft-chat', 'version': 0, 'board': board})
        fetched = self.store.action(self.admin, 'agent.draft.get', {'draftId': raw['draftId']})
        self.assertEqual(fetched['board']['tasks'][0]['name'], '用户修改')
        self.assertEqual(fetched['board']['tasks'][0]['state'], 'rejected')
        self.assertIsNone(self.store.action(self.member, 'agent.draft.get', {'draftId': raw['draftId']})['board'])
        made = self.store.action(self.admin, 'work.card.apply', self.create_card(raw['tasks'][0]['cardId']))
        fetched = self.store.action(self.admin, 'agent.draft.get', {'draftId': raw['draftId']})
        self.assertEqual(fetched['receipts'][raw['tasks'][0]['cardId']]['id'], made['id'])

    def test_rewind_persists_active_context_but_keeps_business_receipts(self):
        a = self.store.record_agent_message(self.admin['id'], 'user', '保留问题', {'conversation': 'branch'})
        self.store.record_agent_message(self.admin['id'], 'assistant', '放弃答案', {'conversation': 'branch'})
        self.store.record_agent_message(self.admin['id'], 'action', '操作事实仍保留', {'conversation': 'branch'})
        self.store.db.commit()
        self.store.action(self.admin, 'agent.conversation.rewind', {'conversationId': 'branch', 'messageId': a['id']})
        self.store.record_agent_message(self.admin['id'], 'assistant', '新分支答案', {'conversation': 'branch'})
        history = self.store.agent_history(self.admin, {'conversationId': 'branch'})['messages']
        self.assertEqual([m['content'] for m in history], ['保留问题', '操作事实仍保留', '新分支答案'])
        self.assertEqual(len(self.store.all('agent_messages')), 4)

    def test_late_chat_cannot_resurrect_deleted_or_rewound_conversation(self):
        for mutation in ('delete', 'rewind'):
            thread = 'late-' + mutation
            self.store.action(self.admin, 'agent.conversation.create', {'conversationId': thread})
            entered, release = threading.Event(), threading.Event()
            errors = []
            def slow(_):
                entered.set();release.wait(3);return _chat('迟到答案')
            def run():
                try:
                    self.store.llm_chat(self.admin, {'sessionId': thread, 'messages': [{'role': 'user', 'content': '问题'}]})
                except Problem as error:
                    errors.append(error.status)
            with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': slow}, [])):
                worker = threading.Thread(target=run);worker.start()
                try:
                    self.assertTrue(entered.wait(2))
                    self.store.action(self.admin, 'agent.conversation.' + mutation, {'conversationId': thread})
                finally:
                    release.set();worker.join(3)
            self.assertEqual(errors, [409])
            self.assertFalse(self.store.agent_history(self.admin, {'conversationId': thread})['messages'])

    def test_configuration_probe_does_not_hold_workspace_lock(self):
        entered, release, read_done = threading.Event(), threading.Event(), threading.Event()
        errors = []
        def slow(_):
            entered.set();release.wait(3);return {'data': [{'id': 'm'}]}
        def run():
            try:self.store.action(self.admin, 'agent.config.test', {'baseUrl': 'https://fixture.example/v1', 'model': 'm'})
            except Exception as error:errors.append(str(error))
        with mock.patch('server.urllib.request.urlopen', _provider({'/models': slow, '/chat/completions': _chat('好')}, [])):
            worker = threading.Thread(target=run);worker.start()
            reader = None
            try:
                self.assertTrue(entered.wait(2))
                reader = threading.Thread(target=lambda: (self.store.action(self.admin, 'agent.capabilities', {}), read_done.set()))
                reader.start();self.assertTrue(read_done.wait(.5))
            finally:
                release.set();worker.join(3)
                if reader:reader.join(3)
        self.assertFalse(errors)

    def test_goal_remains_protected_and_audio_filename_matches_mime(self):
        self.chat(_chat('完成'), runGoal='原始目标与约束必须保留')
        payload = json.loads(self.seen[0].data)
        self.assertTrue(any('原始目标与约束必须保留' in m['content'] for m in payload['messages']))
        self.store.action(self.admin, 'agent.asr.set', {'baseUrl': 'https://audio.example/v1'})
        seen = []
        with mock.patch('server.urllib.request.urlopen', _provider({'/audio/transcriptions': {'text': '测试'}}, seen)):
            self.store.transcribe(self.admin, b'fake-mp4-audio', 'audio/mp4')
        self.assertIn(b'filename="clip.mp4"', seen[0].data)
        self.assertIn(b'Content-Type: audio/mp4', seen[0].data)

    def test_clear_key_and_history_are_explicit_and_old_cards_cannot_write(self):
        self.store.action(self.admin, 'agent.asr.set', {'baseUrl':'https://audio.example/v1','apiKey':'fixture-key'})
        self.store.action(self.admin, 'agent.asr.set', {'baseUrl':'https://audio.example/v1','apiKey':'fixture-ignored','clearApiKey':True})
        self.assertFalse(self.store._asr_record()['value'].get('apiKey'))
        self.store.action(self.admin,'agent.conversation.create',{'conversationId':'old'})
        self.store.action(self.admin,'agent.conversation.delete',{'conversationId':'old'})
        with self.assertRaises(Problem):
            self.store.action(self.admin,'work.card.apply',{**self.create_card(),'sessionId':'old'})
        self.assertEqual(self.store.all('tasks'),[])

    def test_card_identity_is_unique_and_receipts_are_available_even_before_autosave(self):
        raw=self.store.prepare_work_cards(self.admin,{'tasks':[{'name':'A','cardId':'same-identity'},{'name':'B','cardId':'same-identity'}]})
        self.assertNotEqual(raw['tasks'][0]['cardId'],raw['tasks'][1]['cardId'])
        card=self.create_card();first=self.store.action(self.admin,'work.card.apply',card)
        recovered=self.store.action(self.admin,'agent.draft.get',{'draftId':'not-yet-saved','cardIds':[card['cardId']]})
        self.assertEqual(recovered['receipts'][card['cardId']]['id'],first['id'])

    def test_labelled_password_in_user_text_is_redacted_before_the_model(self):
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': _chat('请在确认卡输入密码')}, self.seen)):
            self.store.llm_chat(self.admin, {'messages':[{'role':'user','content':'创建账户，password: fixture-input-secret'}]})
        self.assertNotIn('fixture-input-secret', self.seen[0].data.decode())
        self.assertNotIn('fixture-input-secret', json.dumps(self.store.all('agent_messages')))
