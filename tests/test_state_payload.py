"""Chat, meetings and notices are read in proportion to what is shown, not
to everything ever stored; and a deleted project takes its records with it."""
import random
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem, CHAT_DEFAULT, CHAT_LEGACY, CHAT_CHANNEL_SQL, CHAT_TIME_SQL, READ_NOTICES_KEPT


def legacy_channel(m):
    channel = str(m.get('channel') or CHAT_DEFAULT)
    return CHAT_DEFAULT if channel == CHAT_LEGACY else channel


class StatePayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'payload.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002', 'test003'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.admin, self.owner, self.mate, self.outsider = (self.store.user(x) for x in ('superadmin', 'test001', 'test002', 'test003'))
        self.project = self.store.put('projects', {'name': '项目', 'owner': 'test001', 'creator': 'test001', 'status': 'active',
                                                   'members': {'test001': 'accepted', 'test002': 'accepted'}, 'start': '2026-01-01'})
        self.store.db.commit()

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_chat_reads_match_scanning_every_message(self):
        rng = random.Random(3)
        channels = [None, '', CHAT_LEGACY, CHAT_DEFAULT, 'lounge', self.project['id']]
        for i in range(400):
            message = {'author': rng.choice(['test001', 'test002', 'superadmin']), 'body': f'第 {i} 条',
                       'createdAt': f'2026-11-05T10:{i // 60:02d}:{i % 60:02d}+08:00'}
            channel = rng.choice(channels)
            if channel is not None:
                message['channel'] = channel
            self.store.put('messages', message)
        self.store.put('settings', {'id': 'chat-read', 'value': {'test002': {CHAT_DEFAULT: '2026-11-05T10:03:00+08:00', 'lounge': ''}}})
        self.store.db.commit()
        everything = self.store.all('messages')
        visible = self.store.chat_visible_channels(self.mate)
        summary = self.store.chat_summary(self.mate)
        book = {CHAT_DEFAULT: '2026-11-05T10:03:00+08:00', 'lounge': ''}
        expected = {}
        for m in everything:
            ch = legacy_channel(m)
            if ch in visible and m.get('author') != 'test002' and m['createdAt'] > book.get(ch, ''):
                expected[ch] = expected.get(ch, 0) + 1
        self.assertEqual(summary['byChannel'], expected)
        self.assertEqual(summary['count'], len(everything))
        self.assertEqual(summary['lastAt'], everything[-1]['createdAt'])
        previews = self.store.chat_previews(self.mate)
        for ch in visible:
            newest = [m for m in everything if legacy_channel(m) == ch][-1]
            self.assertEqual(previews[ch]['createdAt'], newest['createdAt'])
        listed = self.store.action(self.mate, 'chat.list', {'channel': CHAT_DEFAULT, 'limit': 30,
                                                             'since': '2026-11-05T10:01:00+08:00'})['messages']
        want = [m for m in everything if legacy_channel(m) == CHAT_DEFAULT and m['createdAt'] > '2026-11-05T10:01:00+08:00'][-30:]
        self.assertEqual([m['id'] for m in listed], [m['id'] for m in want])

    def test_meetings_travel_without_their_text_until_opened(self):
        meeting = self.store.put('meetings', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '原稿' * 500,
                                              'minutes': '## 结论', 'participants': [], 'createdAt': '2026-11-05T10:00:00+08:00'})
        self.store.db.commit()
        listed = self.store.snapshot(self.mate)['meetings'][0]
        self.assertNotIn('rawTranscript', listed)
        self.assertNotIn('minutes', listed)
        self.assertEqual((listed['transcriptChars'], listed['hasMinutes']), (1000, True))
        full = self.store.action(self.mate, 'meeting.get', {'id': meeting['id']})
        self.assertEqual(full['rawTranscript'], '原稿' * 500)
        with self.assertRaises(Problem):
            self.store.action(self.outsider, 'meeting.get', {'id': meeting['id']})

    def test_chat_limits_by_timestamp_with_insertion_order_breaking_ties(self):
        for message_id, clock in [('latest', '12:00'), ('old', '11:59'), ('tie', '12:00')]:
            self.store.put('messages', {'id': message_id, 'channel': CHAT_LEGACY, 'author': 'test001',
                                        'body': message_id, 'createdAt': f'2026-11-05T{clock}:00+08:00'})
        self.store.db.commit()
        listed = self.store.chat_list(self.mate, {'channel': CHAT_DEFAULT, 'limit': 2})['messages']
        self.assertEqual([m['id'] for m in listed], ['latest', 'tie'])
        self.assertEqual(self.store.chat_previews(self.mate)[CHAT_DEFAULT]['body'], 'tie')
        since = self.store.chat_list(self.mate, {'channel': CHAT_DEFAULT, 'limit': 1,
                                                'since': '2026-11-05T11:59:30+08:00'})['messages']
        self.assertEqual([m['id'] for m in since], ['tie'])
        plan = self.store.db.execute(f'EXPLAIN QUERY PLAN SELECT data FROM messages WHERE {CHAT_CHANNEL_SQL}=? '
                                     f'ORDER BY {CHAT_TIME_SQL} DESC, rowid DESC LIMIT 2', (CHAT_DEFAULT,)).fetchall()
        detail = ' '.join(row['detail'] for row in plan)
        self.assertIn('messages_by_channel_time', detail)
        self.assertNotIn('TEMP B-TREE', detail, '时间排序应继续使用频道索引')

    def test_delete_card_rechecks_new_and_changed_meetings_and_messages(self):
        for table in ('meetings', 'messages'):
            with self.subTest(table=table):
                card = self.store.prepare_work_cards(self.owner, {'projects': [
                    {'operation': 'delete', 'id': self.project['id']} ]})['projects'][0]
                record = self.store.put(table, {'projectId': self.project['id'], 'channel': self.project['id'],
                                                'title': '新会议', 'body': '新消息', 'rawTranscript': '新原稿'})
                self.store.db.commit()
                data = {'kind': 'project', 'operation': 'delete', 'id': self.project['id'], 'confirmed': True,
                        'confirm': self.project['name'], 'cardId': 'delete-probe-' + table, 'revision': card['revision']}
                with self.assertRaises(Problem) as stale:
                    self.store.action(self.owner, 'work.card.apply', data)
                self.assertEqual(stale.exception.status, 409)
                fresh = self.store.prepare_work_cards(self.owner, {'projects': [
                    {'operation': 'delete', 'id': self.project['id']} ]})['projects'][0]
                self.assertEqual(fresh['impact'][table], 1)
                self.store.put(table, {**record, 'rawTranscript': '原稿已变化', 'body': '消息已变化'})
                self.store.db.commit()
                with self.assertRaises(Problem) as changed:
                    self.store.action(self.owner, 'work.card.apply', {**data, 'revision': fresh['revision']})
                self.assertEqual(changed.exception.status, 409)
        fresh = self.store.prepare_work_cards(self.owner, {'projects': [
            {'operation': 'delete', 'id': self.project['id']} ]})['projects'][0]
        self.store.action(self.owner, 'work.card.apply', {**data, 'revision': fresh['revision']})
        self.assertEqual(self.store.all('meetings'), [])
        self.assertEqual(self.store.all('messages'), [])

    def test_old_read_notices_are_capped_but_unread_and_actionable_ones_stay(self):
        for i in range(READ_NOTICES_KEPT + 50):
            self.store.put('notifications', {'to': 'test002', 'title': f'旧 {i}', 'body': '', 'kind': 'task', 'read': True})
        for i in range(3):
            self.store.put('notifications', {'to': 'test002', 'title': f'审批 {i}', 'body': '', 'kind': 'approval', 'read': True})
        for i in range(5):
            self.store.put('notifications', {'to': 'test002', 'title': f'未读 {i}', 'body': '', 'kind': 'task', 'read': False})
        self.store.put('notifications', {'to': 'test001', 'title': '别人的', 'body': '', 'kind': 'task', 'read': False})
        self.store.db.commit()
        notices = self.store.snapshot(self.mate)['notifications']
        titles = [n['title'] for n in notices]
        self.assertEqual(sum(t.startswith('未读') for t in titles), 5)
        self.assertEqual(sum(t.startswith('审批') for t in titles), 3)
        old = [t for t in titles if t.startswith('旧')]
        self.assertEqual(old, [f'旧 {i}' for i in range(50, READ_NOTICES_KEPT + 50)], '保留最新的 200 条已读')
        self.assertNotIn('别人的', titles)

    def test_deleting_a_project_removes_its_meetings_and_chat(self):
        self.store.put('meetings', {'projectId': self.project['id'], 'title': '周会', 'rawTranscript': '机密'})
        self.store.put('messages', {'channel': self.project['id'], 'author': 'test001', 'body': '项目里', 'createdAt': '2026-11-05T10:00:00+08:00'})
        self.store.put('messages', {'channel': CHAT_DEFAULT, 'author': 'test001', 'body': '大厅里', 'createdAt': '2026-11-05T10:00:01+08:00'})
        self.store.db.commit()
        self.store.action(self.owner, 'project.delete', {'id': self.project['id'], 'confirm': '项目'})
        self.assertEqual(self.store.all('meetings'), [])
        self.assertEqual([m['body'] for m in self.store.all('messages')], ['大厅里'])


if __name__ == '__main__':
    unittest.main()
