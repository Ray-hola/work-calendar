"""Assistant chat resilience: blank replies and the size of the payload.

The endpoint used to answer with an empty message now and then, which the
browser could only report as "服务端 Agent 未返回文本" — no cause, nothing to
act on. These cover the retry, the diagnostic, and the context trimming that
made the payload twice as large as it needed to be.
"""
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from server import Store


class _Stub(BaseHTTPRequestHandler):
    """A chat endpoint whose answer we can steer from the test."""

    mode = 'ok'
    calls = 0
    seen = []

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        type(self).seen.append(json.loads(raw.decode('utf-8')))
        type(self).calls += 1
        blank = self.mode == 'always_blank' or (self.mode == 'blank_then_ok' and self.calls == 1)
        body = {'choices': [{'message': {'content': '' if blank else '收到'}, 'finish_reason': 'stop'}],
                'model': 'stub-model', 'usage': {'total_tokens': 11}}
        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *a):
        pass


class AssistantChatTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'chat.sqlite3', seed=False)
        self.store.create_user('superadmin', 'password-long', True)
        self.admin = self.store.user('superadmin')

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), _Stub)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        _Stub.mode, _Stub.calls, _Stub.seen = 'ok', 0, []
        self.store.put('settings', {'id': 'llm', 'value': {
            'baseUrl': 'http://127.0.0.1:%d/v1/chat/completions' % self.server.server_address[1],
            'model': 'stub-model', 'apiKey': '', 'temperature': 0.2,
        }, 'updatedAt': self.store.timestamp() if hasattr(self.store, 'timestamp') else ''})

    def tearDown(self):
        self.server.shutdown()
        self.store.close()
        self.tmp.cleanup()

    def ask(self):
        return self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': '你好'}]})

    def test_a_normal_reply_is_used_as_is(self):
        self.assertEqual(self.ask()['content'], '收到')
        self.assertEqual(_Stub.calls, 1, '正常回复不该触发重试')

    def test_a_transient_blank_is_retried_once(self):
        _Stub.mode = 'blank_then_ok'
        self.assertEqual(self.ask()['content'], '收到')
        self.assertEqual(_Stub.calls, 2, '空回复应重试一次')

    def test_a_persistent_blank_says_what_happened(self):
        _Stub.mode = 'always_blank'
        with self.assertRaises(Exception) as caught:
            self.ask()
        message = str(getattr(caught.exception, 'message', caught.exception))
        self.assertEqual(_Stub.calls, 2, '重试一次后应放弃')
        self.assertIn('连续两次都没有返回内容', message)
        self.assertIn('stub-model', message)
        self.assertIn('finish_reason', message)

    def test_the_context_sent_to_the_model_stays_small(self):
        self.ask()
        payload = _Stub.seen[-1]
        raw = next(m['content'] for m in payload['messages']
                   if m['role'] == 'system' and '"diaryStats"' in m['content'])
        context = json.loads(raw[raw.index('{'):])
        rows = [r for r in context['diaryStats'] if isinstance(r, dict) and r.get('date')]
        if rows:
            dates = sorted(r['date'] for r in rows)
            span = (__import__('datetime').date.fromisoformat(dates[-1])
                    - __import__('datetime').date.fromisoformat(dates[0])).days
            self.assertLessEqual(span, 6, '助手上下文里的日记统计只应带一周，实际跨度 %d 天' % span)
        self.assertLess(len(json.dumps(context, ensure_ascii=False)), 25000,
                        '上下文不应无节制增长')


    # ------------------------------------------------ 空行与长度上限
    def test_a_stored_blank_turn_is_skipped_rather_than_refusing_the_request(self):
        """One blank line used to brick the account.

        The model answered empty once, the blank was recorded, and every later
        request replayed it — which the proxy refused, so the assistant stayed
        broken until someone edited the database by hand.
        """
        self.store.record_agent_message('superadmin', 'user', '先把这周的排期拉出来')
        self.store.record_agent_message('superadmin', 'assistant', '')
        self.store.record_agent_message('superadmin', 'user', '再看一遍')

        payload = [{'role': 'user', 'content': '先把这周的排期拉出来'},
                   {'role': 'assistant', 'content': ''},
                   {'role': 'user', 'content': '再看一遍'}]
        result = self.store.llm_chat(self.admin, {'messages': payload})
        self.assertEqual(result['content'], '收到', '历史里的空行应被跳过，而不是让整次请求失败')

        forwarded = _Stub.seen[-1]['messages']
        self.assertTrue(all(m['content'] for m in forwarded), '转发给模型的消息里不能有空内容')

    def test_a_blank_line_is_never_written_to_the_transcript(self):
        self.assertIsNone(self.store.record_agent_message('superadmin', 'assistant', ''))
        self.assertIsNone(self.store.record_agent_message('superadmin', 'user', '   '))
        self.assertEqual([m for m in self.store.all('agent_messages')
                          if m['role'] in ('user', 'assistant')], [],
                         '空行是缺陷而不是信息，不该入库')

    def test_the_callers_own_empty_message_is_still_refused(self):
        with self.assertRaises(Exception) as caught:
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': ''}]})
        self.assertEqual(caught.exception.status, 400)
        self.assertIn('不能为空', caught.exception.message)

    def test_an_oversized_message_says_how_long_it_was(self):
        with self.assertRaises(Exception) as caught:
            self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': 'x' * 12001}]})
        self.assertEqual(caught.exception.status, 400)
        self.assertIn('12000', caught.exception.message)
        self.assertIn('12001', caught.exception.message, '报错要说清这条到底多长')

    def test_a_message_at_the_ceiling_is_accepted(self):
        """The store truncates to the same 12000 the proxy enforces, so a
        replayed record can never be rejected for length."""
        exact = 'x' * 12000
        self.store.llm_chat(self.admin, {'messages': [{'role': 'user', 'content': exact}]})
        # 服务端会在末尾再补一条策略消息，所以不能只看最后一条。
        forwarded = [m['content'] for m in _Stub.seen[-1]['messages']]
        self.assertIn(exact, forwarded, '正好到上限的消息应原样转发')

if __name__ == '__main__':
    unittest.main()
