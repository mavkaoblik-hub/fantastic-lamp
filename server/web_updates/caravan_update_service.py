"""Local Unix socket only; accepts commands from the existing authenticated API."""
import http.server
import json
import os
from pathlib import Path
import pwd
import re
import socket
import socketserver
import struct
import urllib.request
from caravan_updater import Updater, Rejected, MAX_ZIP, TARGET

API_ORIGIN = 'http://127.0.0.1:7310'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def download(package_id, token, path):
    req = urllib.request.Request(API_ORIGIN + '/v1/files/' + package_id + '/content',
                                 headers={'Authorization': token})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=30) as response, open(path, 'xb') as dst:
        length = response.headers.get('Content-Length')
        if length is None or not length.isdecimal() or not 1 <= int(length) <= MAX_ZIP:
            raise Rejected('INVALID_PACKAGE_SIZE')
        size = 0
        while chunk := response.read(65536):
            size += len(chunk)
            if size > int(length):
                raise Rejected('PACKAGE_SIZE_LIMIT')
            dst.write(chunk)
        if size != int(length):
            raise Rejected('PACKAGE_TRUNCATED')

class Handler(http.server.BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(8)

    def log_message(self, *args):
        pass

    def reply(self, status, data):
        raw = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def allowed(self):
        _, uid, _ = struct.unpack('3i', self.connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        return uid in (0, pwd.getpwnam('shortsstudio').pw_uid)

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, {'error': 'FORBIDDEN'})
        if self.path != '/v1/updates':
            return self.reply(404, {'error': 'NOT_FOUND'})
        with self.server.updater.lock:
            self.reply(200, self.server.updater.snapshot())

    def do_POST(self):
        if not self.allowed():
            return self.reply(403, {'error': 'FORBIDDEN'})
        match = re.fullmatch(r'/v1/updates/(input_[a-f0-9]{32})/(validate|install)', self.path)
        try:
            if not match or self.headers.get('Content-Type') != 'application/json':
                raise Rejected('INVALID_REQUEST')
            size = int(self.headers.get('Content-Length', '-1'))
            if not 1 <= size <= 256:
                raise Rejected('INVALID_REQUEST')
            data = json.loads(self.rfile.read(size))
            if data != {'target': TARGET}:
                raise Rejected('INVALID_TARGET')
            token = self.headers.get('Authorization', '')
            if not token.startswith('Bearer ') or not 32 <= len(token[7:]) <= 512:
                raise Rejected('INVALID_AUTHORIZATION')
            result = self.server.updater.submit(*match.groups(), self.headers.get('Idempotency-Key', ''), token)
            self.reply(202, result)
        except (Rejected, ValueError, TypeError):
            self.reply(409, {'error': 'UPDATE_CONFLICT'})

class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

if __name__ == '__main__':
    path = '/run/caravan-update/control.sock'
    Path(path).unlink(missing_ok=True)
    server = Server(path, Handler)
    os.chmod(path, 0o660)
    server.updater = Updater('/var/lib/caravan-update', '/srv/mavka-web/public/caravan', download)
    server.serve_forever()
