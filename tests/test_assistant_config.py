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

from server import Store, Problem, CONTEXT_DEFAULT, LOOKUP_CHARS


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
        self.assertIn('模型「y」不可用', wrong_model['reason'])
        self.assertIn('http(s)', self.probe({}, baseUrl='ftp://x')['reason'])

    def test_a_provider_without_a_model_list_is_checked_by_answering(self):
        result = self.probe({'/models': 404, '/chat/completions': _chat('好')}, baseUrl='https://api.example.com/v1', model='m')
        self.assertTrue(result['ok'])
        self.assertEqual(result['models'], [])

    def test_anthropic_keys_also_go_in_its_own_header(self):
        self.probe({'/models': {'data': [{'id': 'claude-x'}]}}, baseUrl='https://api.anthropic.com/v1', apiKey='sk-ant-1')
        self.assertEqual(self.seen[0].get_header('X-api-key'), 'sk-ant-1')
        self.assertEqual(self.seen[0].get_header('Anthropic-version'), '2023-06-01')

    def test_models_and_context_ceiling_are_saved_and_the_model_can_be_switched(self):
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.config.test', {'baseUrl': 'https://api.example.com/v1'})
        saved = self.store.action(self.admin, 'agent.config.set', {'provider': 'openai', 'baseUrl': 'https://api.openai.com/v1',
                                                                   'model': 'gpt-a', 'models': ['gpt-a', 'gpt-b'], 'contextChars': 0})
        self.assertEqual((saved['models'], saved['contextChars']), (['gpt-a', 'gpt-b'], 0))
        with self.assertRaises(Problem):
            self.store.action(self.admin, 'agent.config.set', {'baseUrl': 'https://api.openai.com/v1', 'model': 'gpt-a', 'contextChars': 7})
        switched = self.store.action(self.admin, 'agent.config.model', {'model': 'gpt-b'})
        self.assertEqual(switched['model'], 'gpt-b')
        self.assertEqual(self.store._llm_record()['value']['apiKey'], 'sk-saved', '换模型不动密钥')
        with self.assertRaises(Problem):
            self.store.action(self.member, 'agent.config.model', {'model': 'gpt-a'})
        self.assertEqual(self.store.action(self.member, 'agent.config.get', {})['models'], [])

    def put_task(self, name, day, status='done', assignee='superadmin', **extra):
        return self.store.put('tasks', {'name': name, 'date': day, 'duration': 30, 'assignee': assignee, 'projectId': None,
                                        'priority': 'P1', 'status': status, 'fixed': False, **extra})

    def test_finished_work_goes_as_an_index_with_chunks_behind_it(self):
        for i in range(300):
            self.put_task('九月旧任务 %d ' % i + '说明' * 40, '2026-09-%02d' % (i % 28 + 1), desc='细节' * 100)
        late = self.put_task('十月收尾', '2026-10-20')
        doing = self.put_task('正在做的', '2026-10-21', status='doing')
        self.store.db.commit()
        context = json.loads(self.store.agent_context(self.admin))
        self.assertEqual([t['id'] for t in context['tasks']], [doing['id']], 'tasks 只放未完成的，且完整')
        self.assertTrue(context['taskIndex'][0].startswith(late['id'] + '|十月收尾|'), '索引最新的在前')
        self.assertEqual(len(context['taskIndex']), 301)
        self.assertIn({'id': 'tasks:2026-09', 'what': '2026-09 的全部任务详情', 'count': 300}, context['chunks'])
        tight = json.loads(self.store.agent_context(self.admin, budget=12_000))
        self.assertLess(len(tight['taskIndex']), 301, '超出上限时索引从最旧的开始省略')
        self.assertEqual([t['id'] for t in tight['tasks']], [doing['id']], '未完成任务一条不少')
        self.assertIn('tasks:2026-09', [c['id'] for c in tight['chunks']], '省掉的仍能按块查到')
        self.assertEqual(self.store.context_budget(), CONTEXT_DEFAULT)

    def test_lookups_serve_a_chunk_ids_or_a_search_within_what_one_may_see(self):
        mine = self.put_task('我的九月任务', '2026-09-03', assignee='test001', desc='发布会彩排')
        self.put_task('别人的九月任务', '2026-09-04', assignee='test002', desc='发布会场地')
        self.store.db.commit()
        rows = lambda who, q: json.loads(self.store.agent_lookup(who, q))['rows']
        self.assertEqual([r['name'] for r in rows(self.member, {'chunk': 'tasks:2026-09'})], ['我的九月任务'])
        self.assertEqual(len(rows(self.admin, {'chunk': 'tasks:2026-09'})), 2)
        self.assertEqual(rows(self.member, {'taskIds': [mine['id']]})[0]['desc'], '发布会彩排')
        self.assertEqual([r['name'] for r in rows(self.admin, {'search': '发布会'})], ['我的九月任务', '别人的九月任务'])
        self.assertIn('没有看懂', self.store.agent_lookup(self.member, {}))
        for i in range(400):
            self.put_task('长 %d' % i, '2026-08-01', desc='字' * 500)
        self.store.db.commit()
        big = json.loads(self.store.agent_lookup(self.admin, {'chunk': 'tasks:2026-08'}))
        self.assertEqual(big['count'], 400)
        self.assertLess(big['shown'], 400)
        self.assertLessEqual(len(self.store.agent_lookup(self.admin, {'chunk': 'tasks:2026-08'})), LOOKUP_CHARS)

    def test_the_model_reads_a_chunk_then_answers(self):
        self.put_task('九月的复盘会', '2026-09-08')
        self.store.db.commit()
        answers = iter(['我先查一下。<lookup>{"chunk":"tasks:2026-09"}</lookup>', '九月开过一次复盘会。'])
        sent = []

        def chat(request):
            sent.append(json.loads(request.data.decode()))
            return _chat(next(answers))
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': chat}, self.seen)):
            result = self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '九月开过复盘会吗'}]})
        self.assertEqual((result['content'], result['lookups']), ('九月开过一次复盘会。', 1))
        second = sent[1]['messages']
        self.assertIn('九月的复盘会', second[-1]['content'])
        self.assertTrue(second[-1]['content'].startswith('【系统查询结果】'))
        self.assertIn('<lookup>', sent[0]['messages'][0]['content'], '系统提示里教了怎么查')
        stored = [m['content'] for m in self.store.all('agent_messages')]
        self.assertEqual(stored, ['九月开过复盘会吗', '九月开过一次复盘会。'], '只记录真正的问答')

    def test_a_model_that_keeps_looking_up_is_stopped(self):
        with mock.patch('server.urllib.request.urlopen',
                        _provider({'/chat/completions': _chat('<lookup>{"search":"x"}</lookup>')}, self.seen)):
            result = self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '找一下'}]})
        self.assertEqual(result['lookups'], 4)
        self.assertNotIn('<lookup>', result['content'])


if __name__ == '__main__':
    unittest.main()
