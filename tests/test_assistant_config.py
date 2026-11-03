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

    def read_pages(self, who, query):
        rows, fragments, pages = [], {}, []
        while query is not None:
            self.assertLess(len(pages), 30, '分页必须前进并结束')
            text = self.store.agent_lookup(who, query)
            self.assertLessEqual(len(text), LOOKUP_CHARS)
            page = json.loads(text);pages.append(page)
            for row in page['rows']:
                if 'fragment' in row:
                    fragment = row['fragment'];parts = fragments.setdefault(row['id'], '')
                    self.assertEqual(fragment['offset'], len(parts))
                    fragments[row['id']] += fragment['text']
                    if len(fragments[row['id']]) == fragment['totalChars']:
                        rows.append(json.loads(fragments[row['id']]))
                else:
                    rows.append(row)
            query = page['next']
        self.assertTrue(pages[-1]['complete'])
        return rows, pages

    def test_every_monthly_row_can_be_read_without_duplicates(self):
        expected = [self.put_task(f'分页 {i:03d}', '2026-09-01', desc='字' * 700)['id'] for i in range(401)]
        private = self.put_task('私人内容', '2026-09-01', assignee='test002')['id']
        self.store.db.commit()
        rows, pages = self.read_pages(self.admin, {'chunk': 'tasks:2026-09'})
        self.assertGreater(len(pages), 1)
        self.assertEqual([r['id'] for r in rows], expected + [private])
        self.assertEqual(rows[0]['desc'], '字' * 700)
        mine = self.put_task('自己的', '2026-09-01', assignee='test001')['id'];self.store.db.commit()
        rows, _ = self.read_pages(self.member, {'chunk': 'tasks:2026-09'})
        self.assertEqual([r['id'] for r in rows], [mine])
        self.assertIn('分页位置无效', self.store.agent_lookup(self.admin, {'search': '分页', 'offset': -1}))

    def test_brief_lookup_reads_full_edited_content_and_preserves_permissions(self):
        brief = self.store.put('reports', {'id': 'brief:2026-09-03', 'kind': 'brief', 'date': '2026-09-03',
            'author': 'system', 'projectId': None, 'content': {'members': [], 'projects': [], 'risks': ['旧风险']},
            'edits': {'risks': ['人工修订的结论']}})
        self.store.db.commit()
        self.assertNotIn('content', self.store.snapshot(self.admin)['reports'][0])
        rows, _ = self.read_pages(self.admin, {'chunk': 'reports:2026-09'})
        self.assertEqual(rows[0]['content']['risks'], ['人工修订的结论'])
        self.assertEqual(self.store.get('reports', brief['id'])['content']['risks'], ['旧风险'])
        self.assertEqual(self.read_pages(self.member, {'chunk': 'reports:2026-09'})[0], [])

    def test_oversized_reports_diaries_and_task_text_are_lossless_fragments(self):
        text = ('长报告："引号"\\与换行\n' * 8000) + '最后一段不可丢失'
        for table, chunk, extra in [('reports', 'reports:2026-08', {'kind': 'brief', 'projectId': None}),
                                     ('diaries', 'diaries:2026-08', {})]:
            row = self.store.put(table, {'date': '2026-08-01', 'author': 'superadmin', 'content': {'note': text}, **extra})
            self.store.db.commit()
            rows, pages = self.read_pages(self.admin, {'chunk': chunk})
            self.assertGreater(len(pages), 1)
            self.assertEqual(rows, [row])
            self.assertEqual(self.read_pages(self.member, {'chunk': chunk})[0], [])
        task = self.put_task('很长的任务', '2026-08-01', desc=text);self.store.db.commit()
        rows, pages = self.read_pages(self.admin, {'taskIds': [task['id']]})
        self.assertGreater(len(pages), 1);self.assertEqual(rows[0]['desc'], text)

    def test_chat_follows_next_page_and_keeps_its_conversation(self):
        for i in range(150):self.put_task(f'任务 {i}', '2026-09-01', desc='字' * 700)
        self.store.db.commit()
        sent = []
        def chat(request):
            payload = json.loads(request.data);sent.append(payload)
            if len(sent) == 1:return _chat('<lookup>{"chunk":"tasks:2026-09"}</lookup>')
            page = json.loads(payload['messages'][-1]['content'].split('\n')[1])
            return _chat('<lookup>' + json.dumps(page['next']) + '</lookup>') if page['next'] else _chat('已读完所有页。')
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': chat}, self.seen)):
            result = self.store.llm_chat(self.admin, {'sessionId': 'review-conversation', 'messages': [{'role': 'user', 'content': '读完九月任务'}]})
        self.assertEqual(result['content'], '已读完所有页。')
        stored = self.store.all('agent_messages')
        self.assertEqual([m['content'] for m in stored], ['读完九月任务', '已读完所有页。'])
        self.assertTrue(all(m['conversation'] == 'review-conversation' for m in stored))
        replies = iter(['<lookup>{"chunk":"tasks:2026-09"}</lookup>', '目前有这些。'])
        with mock.patch('server.urllib.request.urlopen', _provider({'/chat/completions': lambda r: _chat(next(replies))}, self.seen)):
            result = self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '再查'}]})
        self.assertIn('不是完整结果', result['content'])

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
