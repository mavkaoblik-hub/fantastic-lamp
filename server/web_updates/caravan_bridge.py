"""Add only /v1/updates to an existing stdlib Shorts API; preserve all other routes."""
import http.client
import http.server
import json
import socket

SOCKET_PATH = '/run/caravan-update/control.sock'

class UnixConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET_PATH)


def attach(namespace):
    classes = {value for value in namespace.values() if isinstance(value, type)
               and issubclass(value, http.server.BaseHTTPRequestHandler)
               and value is not http.server.BaseHTTPRequestHandler
               and callable(getattr(value, 'authorized', None))
               and callable(getattr(value, 'send_json', None))}
    if len(classes) != 1:
        raise RuntimeError('Expected one authenticated Shorts HTTP handler')
    cls = classes.pop()
    for method in ('GET', 'POST'):
        original = getattr(cls, 'do_' + method)
        def wrapped(self, original=original, method=method):
            if not (self.path == '/v1/updates' or self.path.startswith('/v1/updates/')):
                return original(self)
            if not self.authorized():
                return
            body = None
            if method == 'POST':
                try:
                    size = int(self.headers.get('Content-Length', '-1'))
                    if not 1 <= size <= 256:
                        raise ValueError()
                    body = self.rfile.read(size)
                    if len(body) != size:
                        raise ValueError()
                except ValueError:
                    self.close_connection = True
                    return self.send_json(400, {'error': 'INVALID_REQUEST'})
            connection = UnixConnection('localhost', timeout=8)
            try:
                connection.request(method, self.path, body, headers={
                    'Authorization': self.headers.get('Authorization', ''),
                    'Idempotency-Key': self.headers.get('Idempotency-Key', ''),
                    'Content-Type': self.headers.get('Content-Type', 'application/json')})
                response = connection.getresponse()
                raw = response.read(16385)
                if len(raw) > 16384:
                    raise ValueError()
                data = json.loads(raw)
                return self.send_json(response.status, data)
            except (OSError, ValueError, http.client.HTTPException):
                return self.send_json(503, {'error': 'UPDATER_UNAVAILABLE'})
            finally:
                connection.close()
        setattr(cls, 'do_' + method, wrapped)
