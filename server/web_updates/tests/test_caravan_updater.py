import hashlib
import http.server
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from caravan_updater import Updater, Rejected, inspect_zip
from caravan_bridge import attach


def package(path, version='1.0', extra=None):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('caravan-release.json', json.dumps({'target': 'caravan-web', 'version': version}))
        z.writestr('index.html', '<script src="game.js"></script>')
        z.writestr('game.js', 'document.title="Caravan";')
        for name, data in (extra or {}).items():
            z.writestr(name, data)

class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.public = self.root / 'site' / 'caravan'
        self.public.mkdir(parents=True)
        (self.public / 'index.html').write_text('original')
        (self.public.parent / 'index.html').write_text('site home')
        self.zip = self.root / 'release.zip'
        package(self.zip)
        self.u = Updater(self.root / 'state', self.public,
                         lambda pid, token, dst: dst.write_bytes(self.zip.read_bytes()))
        self.pid = 'input_' + 'a' * 32

    def validate(self):
        self.u.state['packageId'] = self.pid
        self.u.perform('validate', self.pid, 'unused')
        self.assertEqual(self.u.state['state'], 'validated')

    def test_install_activates_complete_release_and_keeps_original_backup(self):
        self.validate()
        self.u.perform('install', self.pid, '')
        self.assertEqual(self.u.state['state'], 'installed')
        self.assertEqual((self.root / 'state' / 'previous-index.html').read_text(), 'original')
        self.assertEqual((self.public.parent / 'index.html').read_text(), 'site home')
        release = self.public / 'releases' / self.u.state['activeRelease']
        self.assertTrue((release / 'game.js').is_file())
        self.assertIn(self.u.state['activeRelease'], (self.public / 'index.html').read_text())

    def test_changed_package_is_rejected_without_touching_live_game(self):
        self.validate()
        self.u.package.write_bytes(b'changed')
        self.u.perform('install', self.pid, '')
        self.assertEqual(self.u.state['error'], 'PACKAGE_CHANGED')
        self.assertEqual((self.public / 'index.html').read_text(), 'original')

    def test_no_install_without_validated_same_id(self):
        with self.assertRaises(Rejected):
            self.u.submit(self.pid, 'install', 'request-key-12345', '')

    def test_replay_does_not_start_second_operation(self):
        with patch('caravan_updater.threading.Thread') as thread:
            self.u.submit(self.pid, 'validate', 'request-key-12345', '')
            self.u.submit(self.pid, 'validate', 'request-key-12345', '')
            self.assertEqual(thread.call_count, 1)
            with self.assertRaises(Rejected):
                self.u.submit(self.pid, 'install', 'request-key-12345', '')
            with self.assertRaises(Rejected):
                self.u.submit(self.pid, 'validate', 'another-key-12345', '')

    def test_failed_activation_preserves_index(self):
        self.validate()
        with patch('caravan_updater.shutil.copytree', side_effect=OSError('disk full')):
            self.u.perform('install', self.pid, '')
        self.assertEqual(self.u.state['state'], 'failed')
        self.assertEqual((self.public / 'index.html').read_text(), 'original')

    def test_zip_traversal_links_scripts_and_missing_manifest_rejected(self):
        for name in ['../escape.js', '/absolute.js', 'dir/../bad.js', 'a\\b.js', 'run.py', 'sw.js', '.env', 'folder/.secret.txt']:
            with self.subTest(name=name):
                package(self.zip, extra={name: 'bad'})
                with self.assertRaises(Rejected):
                    inspect_zip(self.zip)
        package(self.zip)
        with zipfile.ZipFile(self.zip, 'a') as z:
            info = zipfile.ZipInfo('link.js')
            info.create_system = 3
            info.external_attr = 0o120777 << 16
            z.writestr(info, 'index.html')
        with self.assertRaises(Rejected):
            inspect_zip(self.zip)

    def test_only_current_and_previous_managed_release_kept(self):
        active = []
        for version in ['1', '2', '3']:
            package(self.zip, version=version)
            self.validate()
            self.u.perform('install', self.pid, '')
            self.assertEqual(self.u.state['state'], 'installed')
            active.append(self.u.state['activeRelease'])
        self.assertEqual({p.name for p in (self.public / 'releases').iterdir()}, set(active[-2:]))

    def test_restart_marks_interrupted_operation_failed(self):
        self.u.state.update(state='installing')
        self.u.save()
        restored = Updater(self.root / 'state', self.public, None)
        self.assertEqual(restored.state['error'], 'INTERRUPTED')
        self.assertFalse(restored.state['canInstall'])

class BridgeTests(unittest.TestCase):
    def test_other_routes_are_untouched_and_updater_still_requires_auth(self):
        class Existing(http.server.BaseHTTPRequestHandler):
            def authorized(self):
                self.auth_checked = True
                return False
            def send_json(self, status, body):
                self.reply = status, body
            def do_GET(self):
                self.original_called = True
            def do_POST(self):
                self.original_called = True
        attach({'Existing': Existing})
        handler = object.__new__(Existing)
        handler.path = '/v1/jobs'
        handler.do_GET()
        self.assertTrue(handler.original_called)
        handler.path = '/v1/updates'
        handler.original_called = False
        handler.do_GET()
        self.assertTrue(handler.auth_checked)
        self.assertFalse(handler.original_called)

if __name__ == '__main__':
    unittest.main()

class FullFlowTests(unittest.TestCase):
    def test_authenticated_http_to_unix_download_validate_install(self):
        import http.client
        import os
        import threading
        import time
        from types import SimpleNamespace
        import caravan_bridge
        import caravan_update_service as service
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public = root / 'public'
            public.mkdir()
            (public / 'index.html').write_text('old game')
            release = root / 'release.zip'
            package(release, version='integration-1')
            token = 'Bearer ' + 'x' * 40
            class API(http.server.BaseHTTPRequestHandler):
                def log_message(self, *args):
                    pass
                def send_json(self, code, data):
                    self.send_response(code)
                    self.end_headers()
                    self.wfile.write(json.dumps(data).encode())
                def authorized(self):
                    if self.headers.get('Authorization') != token:
                        self.send_json(401, {'error': 'UNAUTHORIZED'})
                        return False
                    return True
                def do_GET(self):
                    if not self.authorized():
                        return
                    if self.path.endswith('/content'):
                        raw = release.read_bytes()
                        self.send_response(200)
                        self.send_header('Content-Length', str(len(raw)))
                        self.end_headers()
                        self.wfile.write(raw)
                    else:
                        self.send_json(200, {'existing': True})
                def do_POST(self):
                    self.send_json(404, {})
            attach({'API': API})
            api = http.server.ThreadingHTTPServer(('127.0.0.1', 0), API)
            sock = str(root / 'control.sock')
            # The host blocks AF_UNIX; exercise identical HTTP bridge over loopback.
            local = http.server.ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
            local.updater = Updater(root / 'state', public, service.download)
            threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (api, local)]
            for t in threads:
                t.start()
            def request(method, path, key=None, authenticated=True):
                c = http.client.HTTPConnection('127.0.0.1', api.server_port, timeout=5)
                headers = {'Authorization': token} if authenticated else {}
                if method == 'POST':
                    headers.update({'Content-Type': 'application/json', 'Idempotency-Key': key})
                c.request(method, path, json.dumps({'target': 'caravan-web'}) if method == 'POST' else None, headers)
                response = c.getresponse()
                value = json.loads(response.read())
                code = response.status
                c.close()
                return code, value
            try:
                def bridge_connection(_host, timeout):
                    return http.client.HTTPConnection('127.0.0.1', local.server_port, timeout=timeout)
                with patch.object(caravan_bridge, 'UnixConnection', side_effect=bridge_connection), patch.object(service, 'API_ORIGIN', 'http://127.0.0.1:' + str(api.server_port)), patch.object(service.Handler, 'allowed', return_value=True):
                    self.assertEqual(request('GET', '/v1/updates', authenticated=False)[0], 401)
                    self.assertTrue(request('GET', '/v1/overview')[1]['existing'])
                    self.assertTrue(request('GET', '/v1/updates')[1]['ready'])
                    pid = 'input_' + 'a' * 32
                    self.assertEqual(request('POST', '/v1/updates/' + pid + '/validate', 'validate-key-12345')[0], 202)
                    for _ in range(200):
                        state = request('GET', '/v1/updates')[1]
                        if state['state'] != 'validating':
                            break
                        time.sleep(.01)
                    self.assertTrue(state['canInstall'], state)
                    self.assertEqual(request('POST', '/v1/updates/' + pid + '/install', 'install-key-12345')[0], 202)
                    for _ in range(200):
                        state = request('GET', '/v1/updates')[1]
                        if state['state'] != 'installing':
                            break
                        time.sleep(.01)
                    self.assertEqual(state['state'], 'installed', state)
                    self.assertIn('releases/', (public / 'index.html').read_text())
                    self.assertEqual((root / 'state' / 'previous-index.html').read_text(), 'old game')
            finally:
                for s in (local, api):
                    s.shutdown()
                    s.server_close()

class InheritedEntrypointTests(unittest.TestCase):
    def test_inherited_auth_is_accepted_by_installer_layout(self):
        import runpy
        installer = Path(__file__).resolve().parents[1] / 'scripts' / 'install-caravan-updater.py'
        layout = runpy.run_path(str(installer))['entrypoint_layout']
        handler, guard = layout('''from base import Handler as OriginalHandler
class Handler(OriginalHandler):
    def do_GET(self): pass
    def do_POST(self): pass
def main(): pass
if __name__ == "__main__": main()
''')
        self.assertEqual(handler.name, 'Handler')
        self.assertGreater(guard.lineno, handler.lineno)

    def test_only_leaf_handler_is_wrapped_and_inherited_auth_runs(self):
        class OriginalHandler(http.server.BaseHTTPRequestHandler):
            def authorized(self):
                self.checked = True
                return False
            def send_json(self, *args): pass
            def do_GET(self): self.route = 'base'
            def do_POST(self): self.route = 'base'
        class Handler(OriginalHandler):
            def do_GET(self): self.route = 'inputs'
            def do_POST(self): self.route = 'render'
        base_method = OriginalHandler.do_GET
        attach({'OriginalHandler': OriginalHandler, 'Handler': Handler}, 'Handler')
        self.assertIs(OriginalHandler.do_GET, base_method)
        h = object.__new__(Handler)
        h.path = '/v1/files'
        h.do_GET()
        self.assertEqual(h.route, 'inputs')
        h.path = '/v1/updates'
        h.do_GET()
        self.assertTrue(h.checked)
        self.assertEqual(h.route, 'inputs')

    def test_missing_auth_is_still_rejected(self):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self): pass
            def do_POST(self): pass
            def send_json(self, *args): pass
        with self.assertRaises(RuntimeError):
            attach({'Handler': Handler}, 'Handler')

class SiteTraversalTests(unittest.TestCase):
    def load(self):
        import runpy
        path = Path(__file__).resolve().parents[1] / 'scripts' / 'install-caravan-updater.py'
        return runpy.run_path(str(path))['ensure_site_traversal']

    def test_adds_only_execute_acl_to_inaccessible_parent(self):
        from types import SimpleNamespace
        check = self.load()
        # /srv accessible; /srv/mavka-web needs ACL; public already accessible.
        with patch('subprocess.run', side_effect=[SimpleNamespace(returncode=i) for i in (0, 1, 0, 0)]), patch('shutil.which', return_value='/usr/bin/setfacl'), patch('subprocess.check_call') as call:
            check()
            call.assert_called_once_with(['setfacl', '--no-mask', '-m', 'u:caravanupdate:--x', '/srv/mavka-web'])

    def test_existing_parent_permissions_are_left_unchanged(self):
        from types import SimpleNamespace
        check = self.load()
        with patch('subprocess.run', return_value=SimpleNamespace(returncode=0)), patch('subprocess.check_call') as call:
            check()
            call.assert_not_called()

    def test_mask_denial_fails_before_api_restart(self):
        from types import SimpleNamespace
        check = self.load()
        with patch('subprocess.run', return_value=SimpleNamespace(returncode=1)), patch('shutil.which', return_value='/usr/bin/setfacl'), patch('subprocess.check_call') as call:
            with self.assertRaises(SystemExit):
                check()
            self.assertEqual(call.call_count, 1)
            self.assertEqual(call.call_args.args[0][0], 'setfacl')
