"""Real SQLite and in-process HTTP; no existing game save or VM service is used."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import json
import os
import shlex
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen

from fastapi.testclient import TestClient

from server.backup import backup
from server.caravan_api import RateLimit, create_app
from server.caravan_store import MAX_DB_BYTES, Rejected, Store


class CaravanTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.now = 1_790_000_000
        self.tick = 0
        self.store = Store(self.root / "players.db", clock=lambda: self.now, monotonic=lambda: self.tick)
        self.client = TestClient(create_app(self.store), base_url="http://localhost")
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def register(self, name="Капітан"):
        response = self.client.post("/v1/players", json={"nickname": name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_configured_webview_origin_preflight_registration_and_snapshot(self):
        origin = "https://appassets.androidplatform.net"
        with TestClient(create_app(self.store, allowed_origins=[origin]), base_url="http://localhost") as client:
            preflight = client.options("/v1/resources", headers={"Origin": origin,
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "authorization,content-type"})
            self.assertEqual(preflight.status_code, 200)
            self.assertEqual(preflight.headers["access-control-allow-origin"], origin)
            self.assertNotIn("access-control-allow-credentials", preflight.headers)
            registration = client.post("/v1/players", json={"nickname": "AndroidCaptain"}, headers={"Origin": origin})
            self.assertEqual(registration.status_code, 201)
            headers = {**self.headers(registration.json()), "Origin": origin}
            self.assertEqual(client.get("/v1/me", headers=headers).status_code, 200)
            result = client.put("/v1/resources", headers=headers,
                json={"revision": 0, "resources": {"metal": 210, "fuel": 80, "supplies": 48}})
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.headers["access-control-allow-origin"], origin)
            for rejected_origin in ("null", "https://evil.example", origin + ".evil.example"):
                result = client.post("/v1/players", json={"nickname": "Blocked"}, headers={"Origin": rejected_origin})
                self.assertEqual(result.status_code, 403)
                self.assertNotIn("access-control-allow-origin", result.headers)

    def test_cors_exposes_retry_and_applies_to_auth_errors(self):
        origin = "https://game.example"
        with TestClient(create_app(self.store, allowed_origins=[origin]), base_url="http://localhost") as client:
            result = client.get("/v1/me", headers={"Origin": origin})
            self.assertEqual(result.status_code, 401)
            self.assertEqual(result.headers["access-control-allow-origin"], origin)
            self.assertIn("Retry-After", result.headers["access-control-expose-headers"])

    def test_public_host_is_explicit_and_wildcard_configuration_is_rejected(self):
        with TestClient(create_app(self.store, allowed_hosts=["api.example"]), base_url="https://api.example") as client:
            self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(client.get("/health", headers={"Host": "evil.example"}).status_code, 400)
        for origin in ("*", "null", "http://game.example", "https://game.example/path", "https://user:pass@game.example"):
            with self.assertRaises(ValueError):
                create_app(self.store, allowed_origins=[origin])


    def headers(self, player):
        return {"Authorization": "Bearer " + player["access_code"]}

    def update(self, player, revision, metal=100):
        return self.client.put("/v1/resources", headers=self.headers(player),
            json={"revision": revision, "resources": {"metal": metal, "fuel": 20, "supplies": 30}})

    def test_registration_login_and_resources_do_not_expose_or_store_plain_code(self):
        player = self.register()
        self.assertEqual(self.client.get("/v1/me", headers=self.headers(player)).json()["nickname"], "Капітан")
        self.assertEqual(self.client.get("/v1/me").status_code, 401)
        self.assertEqual(self.client.get("/v1/me", params={"access_code": player["access_code"]}).status_code, 401)
        result = self.update(player, 0)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["revision"], 1)
        self.assertNotIn("access_code", result.json())
        self.assertNotIn(player["access_code"].encode(), self.store.path.read_bytes())
        self.assertEqual(self.client.get("/v1/me", headers={"Authorization": "Bearer cv1_" + "z"*43}).status_code, 401)

    def test_duplicate_unicode_nicknames_and_markup_are_rejected(self):
        self.register()
        self.assertEqual(self.client.post("/v1/players", json={"nickname": "капітан"}).status_code, 409)
        for name in ("ab", "<script>alert(1)</script>", "cap\nname"):
            self.assertEqual(self.client.post("/v1/players", json={"nickname": name}).status_code, 400)

    def test_snapshot_retry_does_not_increment_or_append_records(self):
        player = self.register()
        first = self.update(player, 0).json()
        retry = self.update(player, 0)
        self.assertEqual(retry.status_code, 200)
        self.assertFalse(retry.json()["changed"])
        self.assertEqual(retry.json()["revision"], first["revision"])
        self.assertEqual(self.update(player, 0, metal=200).status_code, 409)
        blocked = self.update(player, 1, metal=200)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.headers["retry-after"], "60")
        self.now += 60
        self.assertEqual(self.update(player, 1, metal=200).status_code, 200)
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM players").fetchone()[0], 1)
            self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                             {"players", "registration_quota"})

    def test_snapshot_bounds_extra_fields_booleans_and_floats_are_rejected(self):
        player = self.register()
        for amount in (-1, True, 1.5, 1_000_000_001):
            response = self.client.put("/v1/resources", headers=self.headers(player),
                json={"revision": 0, "resources": {"metal": amount, "fuel": 0, "supplies": 0}})
            self.assertEqual(response.status_code, 400)
        response = self.client.put("/v1/resources", headers=self.headers(player),
            json={"revision": 0, "resources": {"metal": 0, "fuel": 0, "supplies": 0, "full_save": {}}})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/v1/me", headers=self.headers(player)).json()["revision"], 0)

    def test_leaderboard_cached_bounded_and_private_fields_absent(self):
        a, b = self.register("Перший"), self.register("Другий")
        self.update(a, 0, metal=300)
        self.update(b, 0, metal=500)
        with patch.object(self.store, "connection", wraps=self.store.connection) as connect:
            first = self.client.get("/v1/leaderboard?limit=1")
            second = self.client.get("/v1/leaderboard?limit=1", headers={"If-None-Match": first.headers["etag"]})
            self.assertEqual(connect.call_count, 1)
        self.assertEqual(first.json()["players"][0]["nickname"], "Другий")
        self.assertEqual(len(first.json()["players"]), 1)
        self.assertEqual(first.json()["verification"], "client_reported")
        self.assertEqual(second.status_code, 304)
        for secret in (a["access_code"], b["access_code"], "code_hash", "player_id", "revision"):
            self.assertNotIn(secret, first.text)
        self.tick += 31
        self.assertEqual(self.client.get("/v1/leaderboard").status_code, 200)
        for query in ("limit=101", "limit=0", "sort=nickname", "sort=metal&sort=fuel", "extra=x"):
            self.assertEqual(self.client.get("/v1/leaderboard?" + query).status_code, 400)

    def test_caller_cannot_change_other_players_record(self):
        a, b = self.register("Альфа"), self.register("Браво")
        self.update(a, 0, metal=500)
        self.assertEqual(self.client.get("/v1/me", headers=self.headers(b)).json()["resources"]["metal"], 0)
        result = self.client.put("/v1/resources", headers=self.headers(b),
            json={"player_id": a["player_id"], "revision": 0,
                  "resources": {"metal": 0, "fuel": 0, "supplies": 0}})
        self.assertEqual(result.status_code, 400)

    def test_concurrent_updates_with_one_revision_cannot_overwrite_each_other(self):
        player = self.register()
        def attempt(amount):
            try:
                self.store.update(player["access_code"], {"metal": amount, "fuel": 0, "supplies": 0}, 0)
                return 200
            except Rejected as error:
                return error.status
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(attempt, (100, 200))), [200, 409])
        self.assertEqual(self.store.profile(player["access_code"])["revision"], 1)

    def test_bad_json_large_body_cross_origin_and_wrong_host_are_rejected(self):
        for raw, expected in (('{"nickname":"abc","nickname":"def"}', 400), ("[]", 400),
                              ('{"nickname":NaN}', 400), (" " * 2049, 413)):
            response = self.client.post("/v1/players", content=raw, headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, expected)
        self.assertEqual(self.client.post("/v1/players", json={"nickname": "Captain"},
            headers={"Origin": "https://unrelated.test"}).status_code, 403)
        self.assertEqual(self.client.get("/health", headers={"Host": "unrelated.test"}).status_code, 400)

    def test_registration_rate_limit_and_capacity_are_bounded(self):
        for index in range(5):
            self.register("Captain_" + str(index))
        response = self.client.post("/v1/players", json={"nickname": "Captain_6"})
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry-after", response.headers)
        self.store.max_players = 5
        with self.assertRaisesRegex(Rejected, "capacity"):
            self.store.register("Captain_7")

    def test_existing_unrelated_database_is_not_reinitialized(self):
        path = self.root / "unrelated.db"
        with closing(sqlite3.connect(path)) as db, db:
            db.execute("CREATE TABLE untouched (value TEXT)")
            db.execute("INSERT INTO untouched VALUES ('keep')")
        with self.assertRaises(RuntimeError):
            Store(path).initialize()
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute("SELECT value FROM untouched").fetchone()[0], "keep")

    def test_one_previous_backup_replaces_old_backup_and_contains_consistent_data(self):
        self.register("Captain_1")
        self.assertTrue(backup(self.root))
        self.register("Captain_2")
        self.assertTrue(backup(self.root))
        self.assertEqual(sorted(p.name for p in self.root.glob("*.db")), ["players.db", "players.previous.db"])
        with closing(sqlite3.connect(self.root / "players.previous.db")) as db:
            self.assertEqual(db.execute("PRAGMA quick_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM players").fetchone()[0], 2)
        self.assertEqual(list(self.root.glob(".players-backup-*")), [])

    def test_thousand_profiles_fit_small_file_and_use_ranking_index(self):
        for index in range(1000):
            self.now = 1_790_000_000 + (index // 50) * 86400
            self.store.register("Player_" + str(index))
        self.assertLess(self.store.path.stat().st_size, 2 * 1024 * 1024)
        with self.store.connection() as db:
            self.assertLessEqual(db.execute("PRAGMA max_page_count").fetchone()[0] *
                                 db.execute("PRAGMA page_size").fetchone()[0], MAX_DB_BYTES)
            plan = str([tuple(r) for r in db.execute(
                "EXPLAIN QUERY PLAN SELECT id,nickname,total FROM players ORDER BY total DESC,id ASC LIMIT 100")])
            self.assertIn("leaders_total", plan)
            self.assertNotIn("TEMP B-TREE", plan)
        self.assertEqual(len(self.store.leaderboard()["players"]), 50)

    def test_rate_limiter_does_not_keep_unbounded_address_history(self):
        limiter = RateLimit(clock=lambda: self.tick)
        for index in range(2048):
            limiter.check(str(index), 1, 60)
        with self.assertRaises(Rejected):
            limiter.check("one-too-many", 1, 60)
        self.tick = 61
        limiter.check("new", 1, 60)
        self.assertEqual(len(limiter.entries), 1)

    def test_front_page_uses_only_manual_refresh_script(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        script = self.client.get("/leaderboard.js").text
        self.assertNotIn("setInterval", script)
        self.assertNotIn("setTimeout", script)
        self.assertNotIn("innerHTML", script)
        self.assertIn("textContent", script)
        self.assertIn("frame-ancestors 'none'", response.headers["content-security-policy"])


class LiveServerTest(unittest.TestCase):
    def test_service_command_starts_real_loopback_server_with_temporary_data(self):
        repo = Path(__file__).resolve().parent.parent
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            unit = (repo / "server/caravan-lite.service").read_text()
            command = shlex.split(next(line.split("=", 1)[1] for line in unit.splitlines()
                                       if line.startswith("ExecStart=")))
            command[0] = sys.executable
            command[command.index("--port") + 1] = str(port)
            with (root / "log").open("w+", encoding="utf-8") as log:
                process = subprocess.Popen(command, cwd=repo,
                    env={**os.environ, "CARAVAN_DATA_DIR": str(root / "data")},
                    stdout=log, stderr=subprocess.STDOUT,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                try:
                    base = "http://127.0.0.1:" + str(port)
                    deadline = time.monotonic() + 12
                    while True:
                        try:
                            with urlopen(base + "/health", timeout=.5) as response:
                                self.assertEqual(json.load(response)["service"], "caravan-lite")
                            break
                        except OSError:
                            if process.poll() is not None or time.monotonic() >= deadline:
                                log.seek(0)
                                self.fail("Live server did not start: " + log.read())
                            time.sleep(.1)
                    request = Request(base + "/v1/players", data=b'{"nickname":"LiveCaptain"}',
                                      headers={"Content-Type": "application/json"})
                    with urlopen(request, timeout=2) as response:
                        player = json.load(response)
                    request = Request(base + "/v1/resources", method="PUT",
                        data=b'{"revision":0,"resources":{"metal":210,"fuel":80,"supplies":48}}',
                        headers={"Content-Type": "application/json", "Authorization": "Bearer " + player["access_code"]})
                    with urlopen(request, timeout=2) as response:
                        self.assertEqual(json.load(response)["revision"], 1)
                    with urlopen(base + "/v1/leaderboard", timeout=2) as response:
                        self.assertEqual(json.load(response)["players"][0]["total"], 338)
                finally:
                    if process.poll() is None:
                        process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
