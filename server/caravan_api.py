"""One worker, bounded bodies, on-demand snapshots; no background gameplay loop."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.cors import CORSMiddleware

from .caravan_store import CACHE_SECONDS, MAX_DB_BYTES, MAX_PLAYERS, Rejected, Store


class RateLimit:
    """No persisted IPs; bounded memory even for many distinct callers."""
    def __init__(self, clock=time.monotonic):
        self.clock, self.entries, self.lock, self.sweep = clock, {}, threading.Lock(), 0

    def check(self, key, maximum, seconds):
        with self.lock:
            now = self.clock()
            if now >= self.sweep:
                self.entries = {k: v for k, v in self.entries.items() if v[0] > now}
                self.sweep = now + 60
            expires, count = self.entries.get(key, (now + seconds, 0))
            if expires <= now:
                expires, count = now + seconds, 0
            if key not in self.entries and len(self.entries) >= 2048:
                raise Rejected("request_capacity_reached", 429, 60)
            if count >= maximum:
                raise Rejected("request_rate_limit", 429, max(1, int(expires - now) + 1))
            self.entries[key] = (expires, count + 1)


async def body(request):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise Rejected("json_required", 415)
    chunks, size = [], 0
    try:
        async with asyncio.timeout(5):
            async for chunk in request.stream():
                size += len(chunk)
                if size > 2048:
                    raise Rejected("body_too_large", 413)
                chunks.append(chunk)
    except TimeoutError:
        raise Rejected("body_timeout", 408) from None
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise Rejected("duplicate_json_key")
            result[key] = value
        return result
    def invalid_constant(value):
        raise Rejected("invalid_json")
    try:
        value = json.loads(b"".join(chunks), object_pairs_hook=pairs,
                           parse_constant=invalid_constant)
    except (ValueError, UnicodeError, RecursionError):
        raise Rejected("invalid_json") from None
    if not isinstance(value, dict):
        raise Rejected("json_object_required")
    return value


def access_code(request):
    values = request.headers.getlist("authorization")
    if len(values) != 1 or not values[0].startswith("Bearer "):
        raise Rejected("invalid_access_code", 401)
    return values[0][7:]


def create_app(store=None, limiter=None, *, allowed_origins=None, allowed_hosts=None):
    store = store or Store(Path(os.environ.get("CARAVAN_DATA_DIR", Path(__file__).parent / "data")) / "players.db")
    limiter = limiter or RateLimit()

    @asynccontextmanager
    async def lifespan(app):
        await run_in_threadpool(store.initialize)
        yield

    app = FastAPI(title="Caravan Lite", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    # Explicit origins only: never reflect arbitrary origins or accept null/file origins.
    origins = allowed_origins if allowed_origins is not None else [
        s.strip() for s in os.environ.get("CARAVAN_ALLOWED_ORIGINS", "").split(",") if s.strip()]
    hosts = allowed_hosts if allowed_hosts is not None else [
        s.strip() for s in os.environ.get("CARAVAN_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if s.strip()]
    def valid_origin(value):
        try:
            parsed = urlsplit(value)
            return (parsed.scheme == "https" and bool(parsed.hostname) and parsed.port != 0
                    and not parsed.username and not parsed.password
                    and not parsed.path and not parsed.query and not parsed.fragment and "*" not in value)
        except ValueError:
            return False
    if any(not valid_origin(s) for s in origins):
        raise ValueError("Allowed origins must be explicit HTTPS origins without a trailing slash")
    if not hosts or any("*" in s or "/" in s for s in hosts):
        raise ValueError("Allowed hosts must be explicit hostnames")
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
    app.state.store = store

    @app.exception_handler(Rejected)
    async def rejected(request, error):
        headers = {"Cache-Control": "no-store"}
        if error.retry_after is not None:
            headers["Retry-After"] = str(error.retry_after)
        return JSONResponse({"error": error.code}, error.status, headers=headers)

    @app.exception_handler(sqlite3.Error)
    async def storage_error(request, error):
        # Never send SQLite paths, query values or traces to clients.
        return JSONResponse({"error": "storage_unavailable"}, 503, headers={"Cache-Control": "no-store"})

    @app.middleware("http")
    async def local_requests(request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin != str(request.base_url).rstrip("/") and origin not in origins:
                return JSONResponse({"error": "origin_forbidden"}, 403)
        try:
            limiter.check(("requests", request.client.host if request.client else "local"), 120, 60)
            result = await call_next(request)
        except Rejected as error:
            result = await rejected(request, error)
        result.headers.setdefault("Cache-Control", "no-store")
        result.headers["X-Content-Type-Options"] = "nosniff"
        result.headers["Referrer-Policy"] = "no-referrer"
        result.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
        return result

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "caravan-lite", "max_players": MAX_PLAYERS,
                "max_database_bytes": MAX_DB_BYTES}

    @app.post("/v1/players", status_code=201)
    async def register(request: Request):
        limiter.check(("registration", request.client.host if request.client else "local"), 5, 3600)
        value = await body(request)
        if set(value) != {"nickname"}:
            raise Rejected("invalid_registration")
        return await run_in_threadpool(store.register, value["nickname"])

    @app.get("/v1/me")
    async def profile(request: Request):
        return await run_in_threadpool(store.profile, access_code(request))

    @app.put("/v1/resources")
    async def update(request: Request):
        code = access_code(request)
        value = await body(request)
        if set(value) != {"resources", "revision"}:
            raise Rejected("invalid_snapshot")
        return await run_in_threadpool(store.update, code, value["resources"], value["revision"])

    @app.get("/v1/leaderboard")
    async def leaderboard(request: Request):
        params = request.query_params
        if set(params) - {"sort", "limit"} or len(params) != len(params.multi_items()):
            raise Rejected("invalid_leaderboard_query")
        raw_limit = params.get("limit", "50")
        if not raw_limit.isascii() or not raw_limit.isdecimal() or len(raw_limit) > 3:
            raise Rejected("invalid_leaderboard_query")
        value = await run_in_threadpool(store.leaderboard, params.get("sort", "total"), int(raw_limit))
        content = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        tag = '"' + hashlib.sha256(content).hexdigest() + '"'
        headers = {"ETag": tag, "Cache-Control": f"public, max-age={CACHE_SECONDS}"}
        if request.headers.get("if-none-match") == tag:
            return Response(status_code=304, headers=headers)
        return Response(content, media_type="application/json", headers=headers)

    @app.get("/")
    def home():
        return FileResponse(Path(__file__).parent / "leaderboard.html")

    @app.get("/leaderboard.js")
    def script():
        return FileResponse(Path(__file__).parent / "leaderboard.js", media_type="text/javascript")

    app.add_middleware(CORSMiddleware, allow_origins=origins,
                       allow_methods=["GET", "POST", "PUT"],
                       allow_headers=["Authorization", "Content-Type"],
                       expose_headers=["Retry-After"], allow_credentials=False, max_age=600)
    return app
