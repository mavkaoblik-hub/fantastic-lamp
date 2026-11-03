"""Bounded player snapshots, not full saves or a gameplay event log."""
from contextlib import contextmanager
import hashlib
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
import unicodedata


RESOURCES = ("metal", "fuel", "supplies")
SORTS = ("total",) + RESOURCES
MAX_PLAYERS = 10_000
MAX_DB_BYTES = 64 * 1024 * 1024
MAX_RESOURCE = 1_000_000_000
UPDATE_SECONDS = 60
CACHE_SECONDS = 30
APPLICATION_ID = 0x43415256


class Rejected(ValueError):
    def __init__(self, code, status=400, retry_after=None):
        super().__init__(code)
        self.code, self.status, self.retry_after = code, status, retry_after


def nickname(value):
    if not isinstance(value, str):
        raise Rejected("invalid_nickname")
    value = unicodedata.normalize("NFKC", value).strip()
    try:
        encoded_length = len(value.encode("utf-8"))
    except UnicodeError:
        raise Rejected("invalid_nickname") from None
    if (not 3 <= len(value) <= 24 or encoded_length > 96
            or any(not (unicodedata.category(c)[0] in "LN" or c in " _-") for c in value)):
        raise Rejected("invalid_nickname")
    return value


def code_hash(code):
    if not isinstance(code, str) or not re.fullmatch(r"cv1_[A-Za-z0-9_-]{43}", code):
        raise Rejected("invalid_access_code", 401)
    return hashlib.sha256(code.encode("ascii")).hexdigest()


def snapshot(value):
    if not isinstance(value, dict) or set(value) != set(RESOURCES):
        raise Rejected("invalid_resources")
    if any(type(value[k]) is not int or not 0 <= value[k] <= MAX_RESOURCE for k in RESOURCES):
        raise Rejected("invalid_resources")
    return tuple(value[k] for k in RESOURCES)


def public(row):
    return {"player_id": row["id"], "nickname": row["nickname"],
            "resources": {k: row[k] for k in RESOURCES},
            "revision": row["revision"], "updated_at": row["updated_at"]}


class Store:
    def __init__(self, path, *, clock=time.time, monotonic=time.monotonic,
                 max_players=MAX_PLAYERS):
        self.path = Path(path)
        self.clock, self.monotonic, self.max_players = clock, monotonic, max_players
        self.cache = {}
        self.cache_lock = threading.Lock()

    @contextmanager
    def connection(self, *, write=False):
        db = sqlite3.connect(self.path, timeout=2)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA busy_timeout=2000")
            db.execute("PRAGMA cache_size=-1024")
            size = db.execute("PRAGMA page_size").fetchone()[0]
            db.execute(f"PRAGMA max_page_count={MAX_DB_BYTES // size}")
            if write:
                db.execute("BEGIN IMMEDIATE")
            yield db
            if write:
                db.commit()
        except BaseException:
            if write:
                db.rollback()
            raise
        finally:
            db.close()

    def initialize(self):
        if self.path.is_symlink() or self.path.parent.is_symlink():
            raise RuntimeError("Unsafe database path")
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with self.connection() as db:
            app_id = db.execute("PRAGMA application_id").fetchone()[0]
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            if (tables and app_id != APPLICATION_ID) or version not in (0, 1):
                raise RuntimeError("Existing database is not a supported Caravan database")
            if db.execute("PRAGMA page_count").fetchone()[0] * db.execute("PRAGMA page_size").fetchone()[0] > MAX_DB_BYTES:
                raise RuntimeError("Existing database exceeds the Caravan size limit")
            db.execute("PRAGMA journal_mode=DELETE")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS players (
                    id TEXT PRIMARY KEY, nickname TEXT NOT NULL,
                    nickname_key TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL UNIQUE,
                    metal INTEGER NOT NULL DEFAULT 0, fuel INTEGER NOT NULL DEFAULT 0,
                    supplies INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
                    revision INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                    last_write INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS registration_quota (
                    slot INTEGER PRIMARY KEY CHECK(slot=1), day INTEGER NOT NULL, count INTEGER NOT NULL
                );
            """)
            for key in SORTS:  # Fixed identifiers only.
                db.execute(f"CREATE INDEX IF NOT EXISTS leaders_{key} ON players({key} DESC, id ASC)")
            db.execute(f"PRAGMA application_id={APPLICATION_ID}")
            db.execute("PRAGMA user_version=1")
        self.path.chmod(0o600)

    def register(self, value):
        name = nickname(value)
        now = int(self.clock())
        code = "cv1_" + secrets.token_urlsafe(32)
        player_id = secrets.token_hex(16)
        with self.connection(write=True) as db:
            if db.execute("SELECT 1 FROM players WHERE nickname_key=?", (name.casefold(),)).fetchone():
                raise Rejected("nickname_taken", 409)
            if db.execute("SELECT COUNT(*) FROM players").fetchone()[0] >= self.max_players:
                raise Rejected("registration_capacity_reached", 503)
            day = now // 86400
            quota = db.execute("SELECT day,count FROM registration_quota WHERE slot=1").fetchone()
            count = quota["count"] if quota and quota["day"] == day else 0
            if count >= 100:
                raise Rejected("registration_daily_limit", 429, (day + 1) * 86400 - now)
            db.execute("INSERT OR REPLACE INTO registration_quota VALUES (1,?,?)", (day, count + 1))
            db.execute("""INSERT INTO players
                (id,nickname,nickname_key,code_hash,created_at,updated_at)
                VALUES (?,?,?,?,?,?)""", (player_id, name, name.casefold(), code_hash(code), now, now))
            row = db.execute("SELECT * FROM players WHERE id=?", (player_id,)).fetchone()
            return {**public(row), "access_code": code}

    def _player(self, db, code):
        row = db.execute("SELECT * FROM players WHERE code_hash=?", (code_hash(code),)).fetchone()
        if row is None:
            raise Rejected("invalid_access_code", 401)
        return row

    def profile(self, code):
        with self.connection() as db:
            return public(self._player(db, code))

    def update(self, code, resources, revision):
        values = snapshot(resources)
        if type(revision) is not int or not 0 <= revision < 2**53:
            raise Rejected("invalid_revision")
        now = int(self.clock())
        with self.connection(write=True) as db:
            row = self._player(db, code)
            same = tuple(row[k] for k in RESOURCES) == values
            # A lost HTTP response can be retried without another write or increment.
            if same and revision in (row["revision"], row["revision"] - 1):
                return {**public(row), "changed": False}
            if revision != row["revision"]:
                raise Rejected("revision_conflict", 409)
            if row["revision"] and now - row["last_write"] < UPDATE_SECONDS:
                raise Rejected("update_too_frequent", 429, max(1, UPDATE_SECONDS - (now - row["last_write"])))
            db.execute("""UPDATE players SET metal=?,fuel=?,supplies=?,total=?,
                revision=revision+1,updated_at=?,last_write=? WHERE id=?""",
                (*values, sum(values), now, now, row["id"]))
            return {**public(db.execute("SELECT * FROM players WHERE id=?", (row["id"],)).fetchone()),
                    "changed": True}

    def leaderboard(self, sort="total", limit=50):
        if sort not in SORTS or type(limit) is not int or not 1 <= limit <= 100:
            raise Rejected("invalid_leaderboard_query")
        with self.cache_lock:
            now = self.monotonic()
            cached = self.cache.get(sort)
            if cached is None or now >= cached[0]:
                with self.connection() as db:
                    # No access codes, hashes, timestamps or profile revisions are selected.
                    rows = db.execute(f"""SELECT id,nickname,metal,fuel,supplies,total
                        FROM players ORDER BY {sort} DESC,id ASC LIMIT 100""").fetchall()
                    count = db.execute("SELECT COUNT(*) FROM players").fetchone()[0]
                items = [{"rank": index, "nickname": row["nickname"],
                          "resources": {k: row[k] for k in RESOURCES}, "total": row["total"]}
                         for index, row in enumerate(rows, 1)]
                cached = (now + CACHE_SECONDS, items, count, int(self.clock()))
                self.cache[sort] = cached
            return {"sort": sort, "players": cached[1][:limit], "player_count": cached[2],
                    "generated_at": cached[3], "cache_seconds": CACHE_SECONDS,
                    "verification": "client_reported"}
