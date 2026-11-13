"""Interface language is each account's own preference: unset until chosen,
then 'zh' or 'en', and it reaches the page with the rest of the state."""
import tempfile
import unittest
from pathlib import Path

from server import Store, Problem, ROOT


class LanguageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'lang.sqlite3', seed=False)
        for name in ('superadmin', 'test001', 'test002'):
            self.store.create_user(name, 'password-long', name == 'superadmin')
        self.member = self.store.user('test001')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_language_is_unset_until_the_holder_picks_one(self):
        self.assertEqual(self.store.user('test001').get('lang'), '')
        self.assertEqual(self.store.snapshot(self.member)['user'].get('lang'), '')

    def test_each_account_keeps_its_own_choice(self):
        self.assertEqual(self.store.action(self.member, 'profile.language', {'lang': 'en'}), {'id': 'test001', 'lang': 'en'})
        self.assertEqual(self.store.snapshot(self.store.user('test001'))['user'].get('lang'), 'en')
        self.assertEqual(self.store.user('test002').get('lang'), '', 'nobody else changes')
        self.store.action(self.store.user('test001'), 'profile.language', {'lang': 'zh'})
        self.assertEqual(self.store.user('test001').get('lang'), 'zh')

    def test_unknown_languages_are_refused(self):
        for value in ('fr', '', None, 1):
            with self.assertRaises(Problem) as caught:
                self.store.action(self.member, 'profile.language', {'lang': value})
            self.assertEqual(caught.exception.status, 400)
        self.assertEqual(self.store.user('test001').get('lang'), '')

    def test_the_dictionary_ships_with_the_other_front_end_files(self):
        dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
        self.assertIn(' i18n.js ', dockerfile)
        index = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertLess(index.index('src="i18n.js'), index.index('src="app.js'), 'the dictionary loads before the app')
        server = (ROOT / 'server.py').read_text(encoding='utf-8')
        self.assertIn("'/i18n.js':'i18n.js'", server)


if __name__ == '__main__':
    unittest.main()
