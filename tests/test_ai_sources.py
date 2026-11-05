"""AI 来源与场景: several sources, and a source and model per job, without a network."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from server import Store, Problem
from test_assistant_config import _provider, _chat


class AiSourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'sources.sqlite3', seed=False)
        for name in ('superadmin', 'test001'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin, self.member = self.store.user('superadmin'), self.store.user('test001')
        self.store.put('settings', {'id': 'llm', 'value': {'baseUrl': 'https://old.example/v1', 'model': 'old-model',
                                                            'apiKey': 'sk-old', 'provider': 'custom'}})
        self.store.db.commit()
        self.seen = []

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def act(self, action, data, user=None):
        return self.store.action(user or self.admin, action, data)

    def test_an_existing_install_shows_its_record_as_one_source_used_by_every_scene(self):
        view = self.act('ai.settings.get', {})
        self.assertEqual([(s['id'], s['baseUrl'], s['apiKeySet']) for s in view['sources']], [('main', 'https://old.example/v1', True)])
        self.assertNotIn('apiKey', view['sources'][0])
        self.assertTrue(view['sources'][0]['apiKeyMasked'].endswith('-old'[-4:]))
        for scene in ('chat', 'plan', 'minutes'):
            self.assertEqual((view['scenes'][scene]['source'], view['scenes'][scene]['model']), ('main', 'old-model'))
        self.assertTrue(view['scenes']['plan']['follows'])
        self.assertEqual(view['scenes']['transcribe'], {'explicit': False, 'follows': False})
        with self.assertRaises(Problem):
            self.act('ai.settings.get', {}, self.member)

    def test_scenes_can_use_different_sources_and_models(self):
        view = self.act('ai.source.save', {'name': 'DeepSeek', 'provider': 'deepseek', 'baseUrl': 'https://api.deepseek.com/v1', 'apiKey': 'sk-ds'})
        extra = next(s for s in view['sources'] if s['name'] == 'DeepSeek')
        self.act('ai.scene.set', {'scene': 'minutes', 'source': extra['id'], 'model': 'deepseek-chat'})
        self.act('ai.scene.set', {'scene': 'plan', 'source': 'main', 'model': 'plan-model'})
        minutes = self.store.scene_connection('minutes')
        self.assertEqual((minutes['base'], minutes['key'], minutes['model']), ('https://api.deepseek.com/v1', 'sk-ds', 'deepseek-chat'))
        self.assertEqual(self.store.scene_connection('plan')['model'], 'plan-model')
        self.assertEqual(self.store.scene_connection('chat')['model'], 'old-model', '没设置的场景照旧')
        # 规划任务 follows 对话助手 again when its own choice is cleared.
        self.act('ai.scene.set', {'scene': 'plan', 'source': ''})
        self.act('ai.scene.set', {'scene': 'chat', 'source': extra['id'], 'model': 'deepseek-reasoner'})
        self.assertEqual(self.store.scene_connection('plan')['model'], 'deepseek-reasoner')
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'chat', 'source': ''})
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'chat', 'source': extra['id'], 'model': ''})

    def test_the_planning_request_goes_to_the_planning_model(self):
        self.act('ai.source.save', {'name': 'Plan host', 'provider': 'custom', 'baseUrl': 'https://plan.example/v1', 'apiKey': 'sk-plan'})
        plan_source = next(s for s in self.act('ai.settings.get', {})['sources'] if s['name'] == 'Plan host')
        self.act('ai.scene.set', {'scene': 'plan', 'source': plan_source['id'], 'model': 'planner'})
        sent = []

        def reply(request):
            sent.append((request.full_url, json.loads(request.data.decode())['model'], request.get_header('Authorization')))
            return _chat('<plan>{"projects":[],"tasks":[]}</plan>')
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': reply}, self.seen)):
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '安排下周的发布'}], 'planning': True})
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '今天有什么任务'}]})
        self.assertEqual(sent[0], ('https://plan.example/v1/chat/completions', 'planner', 'Bearer sk-plan'))
        self.assertEqual(sent[-1][:2], ('https://old.example/v1/chat/completions', 'old-model'))

    def test_meeting_minutes_use_the_minutes_model(self):
        self.act('ai.source.save', {'name': 'Minutes host', 'provider': 'custom', 'baseUrl': 'https://minutes.example/v1', 'apiKey': 'sk-min'})
        host = next(s for s in self.act('ai.settings.get', {})['sources'] if s['name'] == 'Minutes host')
        self.act('ai.scene.set', {'scene': 'minutes', 'source': host['id'], 'model': 'scribe'})
        project = self.act('project.create', {'name': '会议项目', 'owner': 'superadmin', 'cycle': 'infinite'})
        meeting = self.act('meeting.create', {'projectId': project['id'], 'title': '周会', 'rawTranscript': '确认周五发布'})
        sent = []

        def reply(request):
            sent.append((request.full_url, json.loads(request.data.decode())['model'], request.get_header('Authorization')))
            return _chat('## 会议结论\n周五发布')
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': reply}, self.seen)):
            done = self.store.meeting_generate_minutes(self.admin, {'id': meeting['id']})
        self.assertEqual(sent, [('https://minutes.example/v1/chat/completions', 'scribe', 'Bearer sk-min')])
        self.assertIn('周五发布', done['minutes'])

    def test_speech_and_chat_sources_do_not_mix(self):
        view = self.act('ai.source.save', {'name': '本地 ASR', 'kind': 'speech', 'baseUrl': 'http://asr.example/v1'})
        self.assertIn('speech', [s['id'] for s in view['sources']])
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'chat', 'source': 'speech', 'model': 'x'})
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'transcribe', 'source': 'main', 'model': 'x'})
        self.act('ai.scene.set', {'scene': 'transcribe', 'source': 'speech', 'model': 'whisper-1', 'language': 'en'})
        connection = self.store.scene_connection('transcribe')
        self.assertEqual((connection['model'], connection['language']), ('whisper-1', 'en'))
        self.assertEqual(self.store.speech_status(self.member), {'configured': True})

    def test_a_source_in_use_cannot_be_deleted_and_a_new_address_drops_old_models(self):
        with self.assertRaises(Problem) as raised:
            self.act('ai.source.delete', {'id': 'main'})
        self.assertIn('对话助手', raised.exception.message)
        self.store.save_source_models('main', ['a', 'b'])
        self.act('ai.source.save', {'id': 'main', 'name': '主力', 'provider': 'custom', 'baseUrl': 'https://old.example/v1'})
        self.assertEqual(self.store.ai_source('main')['models'], ['a', 'b'], '同一地址保留模型列表')
        self.assertEqual(self.store.ai_source('main')['apiKey'], 'sk-old', '没填 Key 时保留原来的')
        self.act('ai.source.save', {'id': 'main', 'name': '主力', 'provider': 'custom', 'baseUrl': 'https://moved.example/v1'})
        self.assertEqual(self.store.ai_source('main')['models'], [])
        view = self.act('ai.source.save', {'name': '备用', 'provider': 'custom', 'baseUrl': 'https://spare.example/v1'})
        spare = next(s for s in view['sources'] if s['name'] == '备用')
        self.act('ai.source.delete', {'id': spare['id']})
        self.assertNotIn(spare['id'], [s['id'] for s in self.act('ai.settings.get', {})['sources']])

    def test_testing_a_saved_source_refreshes_its_model_list(self):
        routes = {'/models': {'data': [{'id': 'gpt-b'}, {'id': 'gpt-a'}]}, '/chat/completions': _chat('好')}
        with mock.patch('server.urllib.request.urlopen', _provider(routes, self.seen)):
            result = self.act('agent.config.test', {'sourceId': 'main'})
        self.assertTrue(result['ok'])
        self.assertEqual(self.seen[0].get_header('Authorization'), 'Bearer sk-old', '用来源自己的 Key')
        self.assertEqual(self.store.ai_source('main')['models'], ['gpt-a', 'gpt-b'])
        # A model switch from the assistant's header lands on 对话助手.
        self.act('ai.scene.set', {'scene': 'chat', 'source': 'main', 'model': 'gpt-a'})
        self.act('agent.config.model', {'model': 'gpt-b'})
        self.assertEqual(self.store.scene_connection('chat')['model'], 'gpt-b')

    def test_context_size_is_set_on_its_own(self):
        self.assertEqual(self.act('ai.context.set', {'contextChars': 64000})['contextChars'], 64000)
        with self.assertRaises(Problem):
            self.act('ai.context.set', {'contextChars': 5})

    def test_reasoning_effort_inherits_and_survives_model_changes(self):
        self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': 'high'})
        for scene in ('chat', 'plan', 'minutes'):
            self.assertEqual(self.store.scene_connection(scene)['reasoningEffort'], 'high')
        self.act('ai.scene.set', {'scene': 'plan', 'source': 'main', 'model': 'planner', 'reasoningEffort': 'low'})
        self.act('ai.scene.set', {'scene': 'plan', 'source': 'main', 'model': 'new-planner'})
        self.assertEqual(self.store.scene_connection('plan')['reasoningEffort'], 'low')
        self.act('agent.config.model', {'model': 'new-chat'})
        self.assertEqual(self.store.scene_connection('chat')['reasoningEffort'], 'high')
        self.act('ai.scene.set', {'scene': 'plan', 'source': ''})
        self.assertEqual(self.store.scene_connection('plan')['reasoningEffort'], 'high')
        self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': 'auto'})
        self.assertEqual(self.store.scene_connection('minutes')['reasoningEffort'], 'auto')

    def test_reasoning_effort_validation_and_permissions(self):
        for value in ('invalid', None, [], 1):
            with self.subTest(value=value), self.assertRaises(Problem):
                self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': value})
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'transcribe', 'reasoningEffort': 'high'})
        with self.assertRaises(Problem):
            self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': 'high'}, self.member)

    def test_effort_is_sent_to_chat_planning_and_minutes_from_server_settings(self):
        self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': 'high'})
        self.act('ai.scene.set', {'scene': 'plan', 'source': 'main', 'model': 'planner', 'reasoningEffort': 'low'})
        project = self.act('project.create', {'name': '会议项目', 'owner': 'superadmin', 'cycle': 'infinite'})
        meeting = self.act('meeting.create', {'projectId': project['id'], 'title': '周会', 'rawTranscript': '周五发布'})
        sent = []
        def reply(request):
            sent.append(json.loads(request.data.decode()))
            return _chat('确认周五发布')
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': reply}, [])):
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '你好'}], 'reasoningEffort': 'none'})
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '安排发布'}], 'planning': True})
            self.store.meeting_generate_minutes(self.admin, {'id': meeting['id']})
        self.assertEqual([p['reasoning_effort'] for p in sent], ['high', 'low', 'high'])
        self.assertTrue(all('temperature' not in p for p in sent))

    def test_default_omits_effort_and_explicit_levels_are_not_silently_downgraded(self):
        for effort in ('auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'):
            payload = self.store.llm_payload('gateway-model', [], temperature=0.2, reasoning_effort=effort)
            if effort == 'auto':
                self.assertNotIn('reasoning_effort', payload)
                self.assertIn('temperature', payload)
            else:
                self.assertEqual(payload['reasoning_effort'], effort)
                self.assertNotIn('temperature', payload)

    def test_unsupported_effort_surfaces_provider_error_without_downgrading(self):
        self.act('ai.scene.set', {'scene': 'chat', 'reasoningEffort': 'high'})
        seen = []
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': 400}, seen)):
            with self.assertRaises(Problem):
                self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '你好'}]})
        self.assertEqual(len(seen), 1)
        self.assertEqual(json.loads(seen[0].data)['reasoning_effort'], 'high')

    def test_chat_metadata_never_falls_back_to_another_sources_catalogue_or_key(self):
        self.store.save_source_models('main', ['old-model'])
        view = self.act('ai.source.save', {'name': 'Local', 'baseUrl': 'http://local.example/v1'})
        source = next(s for s in view['sources'] if s['name'] == 'Local')
        self.act('ai.scene.set', {'scene': 'chat', 'source': source['id'], 'model': 'local-model'})
        config = self.act('agent.config.get', {})
        self.assertEqual((config['baseUrl'], config['model'], config['models']),
                         ('http://local.example/v1', 'local-model', []))
        self.assertFalse(config['apiKeySet'])
        self.assertEqual(config['apiKeyMasked'], '')
        self.act('ai.source.save', {'id': source['id'], 'baseUrl': 'http://local.example/v1', 'apiKey': 'new-secret'})
        self.assertTrue(self.act('agent.config.get', {})['apiKeyMasked'].endswith('cret'))
        self.assertEqual(self.act('agent.config.get', {}, self.member)['models'], [])

    def test_speech_probes_persist_catalogues_for_builtin_and_extra_sources(self):
        self.act('ai.source.save', {'kind': 'speech', 'name': 'First', 'baseUrl': 'http://asr.example/v1'})
        view = self.act('ai.source.save', {'kind': 'speech', 'name': 'Second', 'baseUrl': 'http://asr2.example/v1'})
        ids = [s['id'] for s in view['sources'] if s['kind'] == 'speech']
        for id in ids:
            with self.subTest(id=id):
                with mock.patch('server.urllib.request.urlopen', _provider({'/models': {'data': [{'id': 'whisper-1'}, {'id': 'whisper-large'}]}}, [])):
                    result = self.act('agent.config.test', {'sourceId': id})
                self.assertTrue(result['ok'])
                fresh = self.act('ai.settings.get', {})
                self.assertEqual(next(s['models'] for s in fresh['sources'] if s['id'] == id), ['whisper-1', 'whisper-large'])
                self.act('ai.source.save', {'id': id, 'kind': 'speech', 'baseUrl': 'http://changed.example/v1'})
                self.assertEqual(self.store.ai_source(id)['models'], [])

    def test_speech_can_be_disabled_reenabled_and_deleted_without_legacy_fallback(self):
        self.act('ai.source.save', {'kind': 'speech', 'baseUrl': 'http://asr.example/v1'})
        self.assertTrue(self.store.speech_status(self.member)['configured'])
        self.act('ai.scene.set', {'scene': 'transcribe', 'source': ''})
        self.assertFalse(self.store.speech_status(self.member)['configured'])
        with mock.patch('server.urllib.request.urlopen') as network:
            with self.assertRaises(Problem): self.store.transcribe(self.member, b'audio')
            network.assert_not_called()
        self.assertTrue(self.act('ai.settings.get', {})['scenes']['transcribe']['disabled'])
        self.act('ai.scene.set', {'scene': 'transcribe', 'source': 'speech', 'model': 'whisper-1'})
        self.assertTrue(self.store.speech_status(self.member)['configured'])
        self.act('ai.scene.set', {'scene': 'transcribe', 'source': ''})
        self.act('ai.source.delete', {'id': 'speech'})
        self.assertFalse(self.store.speech_status(self.member)['configured'])
        self.assertNotIn('speech', [s['id'] for s in self.store.ai_sources()])
        # Adding a replacement must not silently undo an explicit disable.
        self.act('ai.source.save', {'kind': 'speech', 'baseUrl': 'http://replacement.example/v1'})
        self.assertFalse(self.store.speech_status(self.member)['configured'])

    def test_source_edits_during_a_probe_cannot_restore_an_old_catalogue(self):
        for kind in ('chat', 'speech'):
            for change in ('address', 'key'):
                with self.subTest(kind=kind, change=change):
                    if kind == 'speech':
                        self.act('ai.source.save', {'id': 'speech', 'kind': 'speech', 'baseUrl': 'http://asr.example/v1'})
                    id = 'speech' if kind == 'speech' else 'main'
                    source = self.store.ai_source(id)
                    self.store.save_source_models(id, [])
                    def listing(request):
                        payload = {'id': id, 'kind': kind, 'baseUrl': source['baseUrl']}
                        payload.update({'baseUrl': 'https://changed.example/v1'} if change == 'address' else {'apiKey': 'replacement-key'})
                        self.act('ai.source.save', payload)
                        return {'data': [{'id': 'old-result'}]}
                    with mock.patch('server.urllib.request.urlopen', _provider({'/models': listing, '/chat/completions': _chat('好')}, [])):
                        result = self.act('agent.config.test', {'sourceId': id})
                    self.assertFalse(result['ok'])
                    self.assertIn('重新测试', result['reason'])
                    self.assertEqual(self.store.ai_source(id)['models'], [])

    def test_a_deleted_source_is_not_recreated_by_its_pending_probe(self):
        self.act('ai.source.save', {'kind': 'speech', 'baseUrl': 'http://asr.example/v1'})
        self.act('ai.scene.set', {'scene': 'transcribe', 'source': ''})
        def listing(request):
            self.act('ai.source.delete', {'id': 'speech'})
            return {'data': [{'id': 'old-result'}]}
        with mock.patch('server.urllib.request.urlopen', _provider({'/models': listing}, [])):
            result = self.act('agent.config.test', {'sourceId': 'speech'})
        self.assertFalse(result['ok'])
        self.assertNotIn('speech', [s['id'] for s in self.store.ai_sources()])


if __name__ == '__main__':
    unittest.main()
