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


if __name__ == '__main__':
    unittest.main()
