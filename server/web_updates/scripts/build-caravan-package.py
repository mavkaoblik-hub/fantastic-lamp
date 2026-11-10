#!/usr/bin/env python3
"""Build a web release ZIP without service-worker/offline caching."""
import argparse
import json
from pathlib import Path
import re
import sys
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from caravan_updater import ALLOWED, inspect_zip, MAX_ZIP

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('version')
parser.add_argument('output', type=Path)
args = parser.parse_args()
if not args.source.is_dir() or not (args.source / 'index.html').is_file() or args.output.exists():
    parser.error('Source with index.html required; output must not already exist')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', args.version):
    parser.error('Invalid version')
source = args.source.resolve()
if args.output.resolve().is_relative_to(source):
    parser.error('Output must be outside source')
try:
    with zipfile.ZipFile(args.output, 'x', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('caravan-release.json', json.dumps({'target': 'caravan-web', 'version': args.version}))
        for path in sorted(source.rglob('*')):
            if path.is_symlink():
                raise ValueError('Symlinks not supported')
            if not path.is_file():
                continue
            name = path.relative_to(source).as_posix()
            if any(p.startswith('.') for p in path.relative_to(source).parts):
                continue
            if path.suffix.lower() == '.md':
                continue
            if path.name in ('caravan-release.json', 'sw.js', 'service-worker.js'):
                continue
            if path.suffix.lower() not in ALLOWED:
                raise ValueError('Unsupported web file: ' + name)
            raw = path.read_bytes()
            if path.suffix.lower() == '.html':
                text = raw.decode('utf-8')
                # Remove only standalone inline scripts that register an offline worker.
                def remove_worker(match):
                    return '' if re.search(r'navigator\.serviceWorker\.register\s*\(', match.group(), re.I) else match.group()
                text = re.sub(r'<script\b[^>]*>.*?</script\s*>', remove_worker, text, flags=re.S | re.I)
                raw = text.encode('utf-8')
            archive.writestr(name, raw)
    if args.output.stat().st_size > MAX_ZIP:
        raise ValueError('ZIP exceeds 64 MiB')
    inspect_zip(args.output)
except Exception:
    args.output.unlink(missing_ok=True)
    raise
print(args.output)
