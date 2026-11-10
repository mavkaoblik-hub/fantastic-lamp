"""Bounded web-only releases; no uploaded code is executed on Oracle."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tempfile
import threading
import zipfile

TARGET = 'caravan-web'
ID = re.compile(r'^input_[a-f0-9]{32}$')
KEY = re.compile(r'^[A-Za-z0-9_-]{12,100}$')
MAX_ZIP = 64 * 1024 * 1024
MAX_EXPANDED = 192 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_FILES = 2048
ALLOWED = {'.html', '.css', '.js', '.mjs', '.json', '.png', '.jpg', '.jpeg', '.webp',
           '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.ogg',
           '.wav', '.mp4', '.webm', '.glb', '.gltf', '.bin', '.wasm', '.webmanifest', '.txt'}

class Rejected(Exception):
    pass


def write_atomic(path, value):
    temp = path.with_name('.' + path.name + '.new')
    with open(temp, 'w', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def inspect_zip(path):
    entries, seen, total = [], set(), 0
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > MAX_FILES:
            raise Rejected('PACKAGE_FILE_LIMIT')
        for item in archive.infolist():
            name = item.filename.rstrip('/') if item.is_dir() else item.filename
            parts = name.split('/')
            mode = item.external_attr >> 16
            if (not name or len(name) > 240 or '\\' in name or ':' in name
                    or any(ord(c) < 32 or ord(c) == 127 for c in name)
                    or any(p in ('', '.', '..') or p.startswith('.') for p in parts)
                    or PurePosixPath(name).is_absolute() or stat.S_ISLNK(mode)
                    or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)
                    or item.flag_bits & 1):
                raise Rejected('PACKAGE_PATH_BLOCKED')
            folded = name.casefold()
            if folded in seen:
                raise Rejected('PACKAGE_DUPLICATE_PATH')
            seen.add(folded)
            if item.is_dir():
                continue
            if Path(name).suffix.lower() not in ALLOWED or Path(name).name.lower() in ('sw.js', 'service-worker.js'):
                raise Rejected('PACKAGE_FILE_BLOCKED')
            if item.file_size > MAX_FILE or item.file_size > max(item.compress_size * 200, 1024 * 1024):
                raise Rejected('PACKAGE_SIZE_LIMIT')
            total += item.file_size
            if total > MAX_EXPANDED:
                raise Rejected('PACKAGE_SIZE_LIMIT')
            entries.append((item, name))
        manifest = next((i for i, n in entries if n == 'caravan-release.json'), None)
        if manifest is None or manifest.file_size > 4096:
            raise Rejected('MANIFEST_REQUIRED')
        try:
            data = json.loads(archive.read(manifest))
        except (ValueError, UnicodeError):
            raise Rejected('INVALID_MANIFEST') from None
        if (not isinstance(data, dict) or set(data) != {'target', 'version'} or data['target'] != TARGET
                or not isinstance(data['version'], str)
                or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', data['version'])):
            raise Rejected('INVALID_MANIFEST')
        names = {n for _, n in entries}
        if 'index.html' not in names:
            raise Rejected('INDEX_REQUIRED')
        for _, name in entries:
            for parent in PurePosixPath(name).parents:
                if str(parent) in names:
                    raise Rejected('PACKAGE_PATH_COLLISION')
        return data, entries


class Updater:
    def __init__(self, state_dir, public_dir, download):
        self.state_dir, self.public_dir = Path(state_dir), Path(public_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.public_dir.mkdir(parents=True, exist_ok=True, mode=0o755)
        self.download = download
        self.lock = threading.Lock()
        self.state_file = self.state_dir / 'state.json'
        self.package = self.state_dir / 'package.zip'
        if self.state_file.exists():
            self.state = json.loads(self.state_file.read_text())
        else:
            self.state = {'target': TARGET, 'ready': True, 'state': 'idle', 'packageId': None,
                          'version': '', 'canInstall': False, 'error': None, 'operationKey': None}
        if self.state['state'] in ('installing', 'validating'):
            self.state.update(state='failed', canInstall=False, error='INTERRUPTED')
            self.save()

    def save(self):
        write_atomic(self.state_file, self.state)

    def snapshot(self):
        return {k: self.state[k] for k in ('target', 'ready', 'state', 'packageId', 'version', 'canInstall', 'error')}

    def submit(self, package_id, action, key, token):
        if not ID.fullmatch(package_id) or action not in ('validate', 'install') or not KEY.fullmatch(key):
            raise Rejected('INVALID_REQUEST')
        with self.lock:
            seen = self.state.setdefault('requestKeys', {})
            if key in seen and self.state.get('operationKey') != key:
                raise Rejected('REQUEST_ALREADY_USED')
            if key not in seen and len(seen) >= 10000:
                raise Rejected('REQUEST_HISTORY_LIMIT')
            previous = self.state.get('operationKey')
            signature = package_id + '/' + action
            if previous == key:
                if self.state.get('signature') != signature:
                    raise Rejected('IDEMPOTENCY_CONFLICT')
                return self.snapshot()
            if self.state['state'] in ('installing', 'validating'):
                raise Rejected('UPDATE_BUSY')
            if action == 'install' and (self.state['state'] != 'validated' or self.state['packageId'] != package_id):
                raise Rejected('PACKAGE_NOT_VALIDATED')
            seen[key] = signature
            self.state.update(state='validating' if action == 'validate' else 'installing',
                              canInstall=False, error=None, packageId=package_id,
                              operationKey=key, signature=signature)
            self.save()
            result = self.snapshot()
            threading.Thread(target=self.perform, args=(action, package_id, token), daemon=True).start()
            return result

    def perform(self, action, package_id, token):
        try:
            if action == 'validate':
                temp = self.state_dir / 'download.part'
                try:
                    self.download(package_id, token, temp)
                    if not 1 <= temp.stat().st_size <= MAX_ZIP:
                        raise Rejected('PACKAGE_SIZE_LIMIT')
                    data, _ = inspect_zip(temp)
                    digest = hashlib.sha256(temp.read_bytes()).hexdigest()
                    os.replace(temp, self.package)
                finally:
                    temp.unlink(missing_ok=True)
                with self.lock:
                    self.state.update(state='validated', version=data['version'], sha256=digest, canInstall=True)
                    self.save()
            else:
                self.install()
                with self.lock:
                    self.state.update(state='installed', canInstall=False)
                    self.save()
        except Exception as exc:
            with self.lock:
                self.state.update(state='failed', canInstall=False,
                                  error=str(exc) if isinstance(exc, Rejected) else 'UPDATE_FAILED')
                self.save()

    def install(self):
        if hashlib.sha256(self.package.read_bytes()).hexdigest() != self.state.get('sha256'):
            raise Rejected('PACKAGE_CHANGED')
        data, entries = inspect_zip(self.package)
        releases = self.public_dir / 'releases'
        releases.mkdir(exist_ok=True, mode=0o755)
        # Unique immutable directories keep already-open clients on one release.
        release_id = self.state['sha256'][:24]
        release = releases / release_id
        if release.exists():
            raise Rejected('RELEASE_ALREADY_EXISTS')
        required = sum(item.file_size for item, _ in entries) * 2 + 16 * 1024 * 1024
        if min(shutil.disk_usage(self.state_dir).free, shutil.disk_usage(self.public_dir).free) < required:
            raise Rejected('DISK_SPACE_LOW')
        stage = Path(tempfile.mkdtemp(prefix='build-', dir=self.state_dir))
        try:
            with zipfile.ZipFile(self.package) as archive:
                for item, name in entries:
                    target = stage / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(item) as src, open(target, 'xb') as dst:
                        written = 0
                        while chunk := src.read(65536):
                            written += len(chunk)
                            if written > item.file_size or written > MAX_FILE:
                                raise Rejected('PACKAGE_SIZE_LIMIT')
                            dst.write(chunk)
                        if written != item.file_size:
                            raise Rejected('INVALID_PACKAGE')
                    target.chmod(0o644)
            for directory, _, _ in os.walk(stage):
                Path(directory).chmod(0o755)
            # stage/state and website may be on different mounts: copy, then activate.
            shutil.copytree(stage, release)
            for p in release.rglob('*'):
                if p.is_symlink():
                    raise Rejected('PACKAGE_PATH_BLOCKED')
            index = self.public_dir / 'index.html'
            backup = self.state_dir / 'previous-index.html'
            if index.is_symlink() or not index.is_file() or index.stat().st_size > 2 * 1024 * 1024:
                raise Rejected('INVALID_CURRENT_INDEX')
            shutil.copyfile(index, backup)
            url = '/caravan/releases/' + release_id + '/index.html'
            temp_index = self.public_dir / 'activate.html'
            temp_index.write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + url + '"><a href="' + url + '">Відкрити Караван</a>', encoding='utf-8')
            temp_index.chmod(0o644)
            os.replace(temp_index, index)
            # Keep current and previous managed builds; original files are never removed.
            current = self.state.get('activeRelease')
            self.state.update(previousRelease=current, activeRelease=release_id)
            self.save()
            keep = {release_id, current}
            for child in releases.iterdir():
                if child.name not in keep and re.fullmatch('[a-f0-9]{24}', child.name) and child.is_dir() and not child.is_symlink():
                    shutil.rmtree(child)
        except Exception:
            # If activation occurred, the new release must remain available.
            active = self.public_dir / 'index.html'
            if release.exists() and release_id not in active.read_text(errors='replace'):
                shutil.rmtree(release)
            raise
        finally:
            shutil.rmtree(stage)
