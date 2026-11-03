"""AI 接入配置 and the assistant's index-and-chunk context, without a network.

The provider is replaced by a fake urlopen, so these run where loopback
sockets are not available too.
"""
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

from server import Store, Problem, CONTEXT_DEFAULT


class _Reply:
    def __init__(self, body):
        self.raw = json.dumps(body).encode()

    def read(self, n=-1):
        return self.raw

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _provider(routes, seen):
    """A fake urlopen: routes maps a URL suffix to a body, an HTTP code or an exception."""
    def urlopen(request, timeout=None):
        seen.append(request)
        for suffix, answer in routes.items():
            if request.full_url.endswith(suffix):
                if isinstance(answer, Exception):
                    raise answer
                if isinstance(answer, int):
                    raise urllib.error.HTTPError(request.full_url, answer, 'err', {},
                                                 io.BytesIO(json.dumps({'error': {'message': 'nope'}}).encode()))
                return _Reply(answer(request) if callable(answer) else answer)
        raise AssertionError('unexpected url ' + request.full_url)
    return urlopen


def _chat(text):
    return {'choices': [{'message': {'content': text}, 'finish_reason': 'stop'}], 'model': 'm'}


class AssistantConfigTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'config.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin, self.member = self.store.user('superadmin'), self.store.user('test001')
        self.store.put('settings', {'id': 'llm', 'value': {'baseUrl': 'https://api.example.com/v1', 'model': 'm',
                                                            'apiKey': 'sk-saved', 'provider': 'custom'}})
        self.store.db.commit()
        self.seen = []

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def probe(self, routes, **data):
        with mock.patch('server.urllib.request.urlopen', _provider(routes, self.seen)):
            return self.store.action(self.admin, 'agent.config.test', data)

    def test_a_working_key_lists_its_models_and_answers(self):
        result = self.probe({'/models': {'data': [{'id': 'gpt-b'}, {'id': 'gpt-a'}]}, '/chat/completions': _chat('好')},
                           provider='openai', baseUrl='https://api.openai.com/v1/chat/completions', model='gpt-a')
        self.assertTrue(result['ok'])
        self.assertEqual(result['models'], ['gpt-a', 'gpt-b'])
        self.assertIn('2 个可用模型', result['message'])
        self.assertEqual([r.full_url for r in self.seen],
                         ['https://api.openai.com/v1/models', 'https://api.openai.com/v1/chat/completions'])
        self.assertEqual(self.seen[0].get_header('Authorization'), 'Bearer sk-saved', '没填 Key 时用已保存的')

    def test_failures_say_why(self):
        bad_key = self.probe({'/models': 401}, baseUrl='https://api.example.com/v1', apiKey='sk-wrong')
        self.assertFalse(bad_key['ok'])
        self.assertIn('API Key 无效', bad_key['reason'])
        self.assertIn('nope', bad_key['reason'], '服务商给的原话也带上')
        offline = self.probe({'/models': urllib.error.URLError('refused')}, baseUrl='https://down.example.com/v1')
        self.assertIn('连不上服务', offline['reason'])
        wrong_model = self.probe({'/models': {'data': [{'id': 'x'}]}, '/chat/completions': 404},
                                baseUrl='https://api.example.com/v1', model='y')
        self.assertFalse(wrong_model['ok'])
        self.assertEqual(wrong_model['models'], ['x'], '列表仍然给出，方便改选')
        self.assertIn('模型「y」验证失败', wrong_model['reason'])
        self.assertIn('http(s)', self.probe({}, baseUrl='ftp://x')['reason'])

    def test_a_provider_without_a_model_list_is_checked_by_answering(self):
        result = self.probe({'/models': 404, '/chat/completions': _chat('好')}, baseUrl='https://api.example.com/v1', model='m')
        self.assertTrue(result['ok'])
        self.assertEqual(result['models'], [])

    def test_anthropic_keys_also_go_in_its_own_header(self):
        self.probe({'/models': {'data': [{'id': 'claude-x'}]}, '/chat/completions': _chat('好')},
                   baseUrl='https://api.anthropic.com/v1', apiKey='sk-ant-1')
        self.assertEqual(self.seen[0].get_header('X-api-key'), 'sk-ant-1')
        self.assertEqual(self.seen[0].get_header('Anthropic-version'), '2023-06-01')

    def test_reasoning_models_use_compatible_probe_and_chat_parameters(self):
        for model in ('o3', 'o4-mini', 'gpt-5', 'openai/o3'):
            with self.subTest(model=model):
                def chat(request):
                    body = json.loads(request.data)
                    self.assertNotIn('max_tokens', body)
                    self.assertNotIn('temperature', body)
                    if body['messages'][0].get('content') == '只回复：好':
                        self.assertGreaterEqual(body['max_completion_tokens'], 2048)
                    return _chat('好')
                result = self.probe({'/models': {'data': [{'id': model}]}, '/chat/completions': chat},
                                    baseUrl='https://api.openai.com/v1', model=model)
                self.assertTrue(result['ok'])
                self.store.set_llm_config(self.admin, {'baseUrl': 'https://api.openai.com/v1', 'model': model})
                with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': chat}, self.seen)):
                    self.assertEqual(self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '你好'}]})['content'], '好')
        self.assertEqual(self.store.llm_payload('gpt-4.1', [], temperature=0.2, probe=True)['max_tokens'], 256)
        self.assertEqual(self.store.llm_payload('gpt-4.1', [], temperature=0.2)['temperature'], 0.2)

    def test_model_listing_alone_never_proves_a_working_connection(self):
        before = self.store._llm_record()
        result = self.probe({'/models': 401, '/chat/completions': 401}, provider='opencode-go',
                            baseUrl='https://opencode.ai/zen/go/v1')
        self.assertFalse(result['ok'])
        self.assertIn('401', result['reason'])
        for listing in ({'unexpected': 'body'}, {'data': []}, {'data': {'id': 'not-a-list'}}):
            result = self.probe({'/models': listing}, baseUrl='https://api.example.com/v1')
            self.assertFalse(result['ok'])
            self.assertIn('模型 ID', result['reason'])
        self.assertEqual(self.store._llm_record(), before, '验证不保存配置')

    def test_a_discovered_chat_model_is_actually_verified(self):
        result = self.probe({'/models': {'data': [{'id': 'a-embedding'}, {'id': 'chat-model'}]},
                             '/chat/completions': _chat('好')}, baseUrl='https://api.example.com/v1')
        self.assertTrue(result['ok'])
        self.assertEqual(result['testedModel'], 'chat-model')
        self.assertEqual(json.loads(self.seen[-1].data)['model'], 'chat-model')
        for reply in ({}, [], _chat(''), _chat([{'text': {}}]), {'choices': []}, {'choices': [{'message': {'refusal': '拒绝'}}]}):
            with self.subTest(reply=reply):
                result = self.probe({'/models': {'data': [{'id': 'm'}]}, '/chat/completions': reply},
                                    baseUrl='https://api.example.com/v1', model='m')
                self.assertFalse(result['ok'])
                self.assertIn('没有返回有效', result['reason'])
        result = self.probe({'/models': 404, '/chat/completions': _chat([{'type': 'text', 'text': '好'}])},
                            baseUrl='https://api.example.com/v1', model='manual')
        self.assertTrue(result['ok'])






    def test_models_and_context_ceiling_are_saved_and_the_model_can_be_switched(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.config.test', {'baseUrl': 'https://api.example.com/v1'})
        saved = self.store.action(self.admin, 'agent.config.set', {'provider': 'openai', 'baseUrl': 'https://api.openai.com/v1',
                                                                   'model': 'gpt-a', 'models': ['gpt-a', 'gpt-b'], 'contextChars': 0})
        self.assertEqual((saved['models'], saved['contextChars']), (['gpt-a', 'gpt-b'], 64000))
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'agent.config.set', {'baseUrl': 'https://api.openai.com/v1', 'model': 'gpt-a', 'contextChars': 7})
        switched = self.store.action(self.admin, 'agent.config.model', {'model': 'gpt-b'})
        self.assertEqual(switched['model'], 'gpt-b')
        self.assertEqual(self.store._llm_record()['value']['apiKey'], 'sk-saved', '换模型不动密钥')
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.config.model', {'model': 'gpt-a'})
        self.assertEqual(self.store.action(self.member, 'agent.config.get', {})['models'], [])







if __name__ == '__main__':
    unittest.main()
