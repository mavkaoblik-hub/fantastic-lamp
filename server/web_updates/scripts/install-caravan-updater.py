#!/usr/bin/env python3
"""Manual Oracle installation. Never resets or replaces the running Shorts API."""
import ast
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import time


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def entrypoint_layout(source):
    tree = ast.parse(source)
    handlers = [n for n in tree.body if isinstance(n, ast.ClassDef)
                and {'do_GET', 'do_POST'} <=
                    {f.name for f in n.body if isinstance(f, ast.FunctionDef)}]
    mains = [n for n in tree.body if isinstance(n, ast.If)
             and ast.dump(n.test) == ast.dump(ast.parse('__name__ == "__main__"', mode='eval').body)]
    if len(handlers) != 1 or len(mains) != 1:
        raise SystemExit('Unsupported running API structure; no changes made')
    return handlers[0], mains[0]


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run with sudo on Oracle')
    root = Path(__file__).resolve().parents[1]
    pid = int(run('systemctl', 'show', 'shorts-studio-oracle-api.service', '-p', 'MainPID', '--value'))
    if pid <= 1:
        raise SystemExit('Existing Shorts API must be running')
    args = Path(f'/proc/{pid}/cmdline').read_bytes().split(b'\0')
    candidates = [Path(os.fsdecode(arg)) for arg in args if arg.endswith(b'.py')]
    if len(candidates) != 1:
        raise SystemExit('Cannot identify running API script; no changes made')
    api = candidates[0]
    if not api.is_absolute() or api.is_symlink() or not api.is_relative_to('/opt/shorts-studio'):
        raise SystemExit('Unexpected API path; no changes made')
    source = api.read_text()
    handler, main_guard = entrypoint_layout(source)
    uid = pwd.getpwnam('shortsstudio').pw_uid
    dest = Path('/srv/mavka-web/public/caravan')
    if dest.is_symlink() or not (dest / 'index.html').is_file():
        raise SystemExit('Existing game index required; no changes made')
    if any(p.is_symlink() for p in dest.rglob('*')):
        raise SystemExit('Symlinks in game folder; no changes made')
    # Keep a whole initial snapshot before granting the installer its dedicated folder.
    backup = Path('/var/backups/caravan-web-initial')
    if not backup.exists():
        shutil.copytree(dest, backup)
    try:
        account = pwd.getpwnam('caravanupdate')
    except KeyError:
        subprocess.check_call(['useradd', '--system', '--home-dir', '/var/lib/caravan-update',
                               '--shell', '/usr/sbin/nologin', 'caravanupdate'])
        account = pwd.getpwnam('caravanupdate')
    for path in [dest, *dest.rglob('*')]:
        os.chown(path, account.pw_uid, account.pw_gid)
        os.chmod(path, 0o755 if path.is_dir() else 0o644)
    target = Path('/opt/caravan-update')
    target.mkdir(mode=0o755, exist_ok=True)
    for name in ['caravan_updater.py', 'caravan_update_service.py']:
        shutil.copyfile(root / name, target / name)
        (target / name).chmod(0o644)
    shutil.copyfile(root / 'caravan_bridge.py', api.parent / 'caravan_bridge.py')
    (api.parent / 'caravan_bridge.py').chmod(0o644)
    marker = '# CARAVAN_UPDATE_BRIDGE_V1'
    new_source = source
    if marker not in source:
        lines = source.splitlines(keepends=True)
        lines.insert(main_guard.lineno - 1, marker + '\nfrom caravan_bridge import attach as _caravan_attach\n_caravan_attach(globals(), ' + repr(handler.name) + ')\n\n')
        new_source = ''.join(lines)
        compile(new_source, str(api), 'exec')
        shutil.copy2(api, api.with_name(api.name + '.before-caravan'))
    unit = Path('/etc/systemd/system/caravan-update.service')
    shutil.copyfile(root / 'caravan-update.service', unit)
    subprocess.check_call(['systemctl', 'daemon-reload'])
    subprocess.check_call(['systemctl', 'enable', '--now', 'caravan-update.service'])
    try:
        api.write_text(new_source)
        subprocess.check_call(['systemctl', 'restart', 'shorts-studio-oracle-api.service'])
        time.sleep(2)
        if run('systemctl', 'is-active', 'shorts-studio-oracle-api.service') != 'active':
            raise RuntimeError('API restart failed')
        # Probe with the actual process environment, without printing credentials.
        probe_pid = int(run('systemctl', 'show', 'shorts-studio-oracle-api.service', '-p', 'MainPID', '--value'))
        env = dict(part.split(b'=', 1) for part in Path(f'/proc/{probe_pid}/environ').read_bytes().split(b'\0') if b'=' in part)
        token = env.get(b'SHORTS_API_KEY')
        if not token:
            raise RuntimeError('SHORTS_API_KEY unavailable')
        import urllib.request, json
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for route in ['/v1/overview', '/v1/updates']:
            request = urllib.request.Request('http://127.0.0.1:7310' + route, headers={'Authorization': 'Bearer ' + token.decode()})
            with opener.open(request, timeout=8) as response:
                data = json.load(response)
            if route.endswith('updates') and (data.get('ready') is not True or data.get('target') != 'caravan-web'):
                raise RuntimeError('Updater probe failed')
    except Exception:
        api.write_text(source)
        subprocess.call(['systemctl', 'restart', 'shorts-studio-oracle-api.service'])
        raise SystemExit('Installation failed; previous API source restored. No credentials printed.') from None
    print('CARAVAN_UPDATER_CONNECTED')
    print('Open Shorts Studio /updates and refresh status.')

if __name__ == '__main__':
    main()
