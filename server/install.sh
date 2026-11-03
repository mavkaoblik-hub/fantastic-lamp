#!/usr/bin/env bash
# Installs only Caravan; no MAVKA, firewall, proxy, or existing game data changes.
set -euo pipefail
fail() { echo "$*" >&2; exit 1; }
REPO=/home/ubuntu/caravan-source
UNIT=caravan-lite.service
DEST="/etc/systemd/system/$UNIT"
[[ "$(id -un)" == ubuntu ]] || fail "Запускайте від ubuntu, без sudo перед командою."
[[ "$(cd -- "$(dirname -- "$BASH_SOURCE")/.." && pwd)" == "$REPO" ]] ||
  fail "Репозиторій має бути в /home/ubuntu/caravan-source."
cd "$REPO"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' ||
  fail "Потрібен Python 3.11 або новіший."
for tool in git python3 sudo systemctl systemd-analyze cmp install flock curl; do
  command -v "$tool" >/dev/null || fail "Не знайдено: $tool"
done
exec 9> "$(git rev-parse --git-path caravan-install.lock)"
flock -n 9 || fail "Встановлення вже виконується."
sudo -n true || fail "Немає sudo без пароля. Службу не змінено."
if [[ -e "$DEST" || -L "$DEST" ]]; then
  [[ ! -L "$DEST" ]] && cmp -s server/caravan-lite.service "$DEST" ||
    fail "Наявна служба має інші налаштування. Її не змінено."
fi
fragment="$(systemctl show "$UNIT" --property=FragmentPath --value)"
[[ -z "$fragment" || "$fragment" == "$DEST" ]] || fail "Служба вже визначена в іншому місці."
[[ -z "$(systemctl show "$UNIT" --property=DropInPaths --value)" ]] ||
  fail "Знайдено додаткові налаштування служби. Їх потрібно перевірити."
if ! systemctl is-active --quiet "$UNIT"; then
  python3 - <<'PY'
import socket
with socket.socket() as s:
    s.settimeout(.5)
    if s.connect_ex(("127.0.0.1", 8770)) == 0:
        raise SystemExit("Порт 8770 зайнятий. Нічого не зупинено.")
PY
fi
umask 077
[[ ! -L .server-venv ]] || fail "Середовище є посиланням. Його не змінено."
if [[ ! -f .server-venv/pyvenv.cfg || ! -x .server-venv/bin/python ]]; then
  [[ ! -e .server-venv ]] || fail "Наявне середовище пошкоджене. Його не змінено."
  python3 -m venv .server-venv || fail "Не вдалося створити середовище. Перевірте python3-venv."
fi
.server-venv/bin/python -c 'import pathlib,sys; sys.exit(0 if pathlib.Path(sys.prefix).resolve()==pathlib.Path(sys.argv[1]).resolve() and sys.prefix!=sys.base_prefix else 1)' "$REPO/.server-venv" ||
  fail "Середовище не ізольоване."
.server-venv/bin/python -m server.backup
.server-venv/bin/python -m pip install --disable-pip-version-check -r server/requirements.txt
.server-venv/bin/python -m py_compile server/caravan_store.py server/caravan_api.py
systemd-analyze verify server/caravan-lite.service
sudo -n install -m 644 server/caravan-lite.service "$DEST"
sudo -n systemctl daemon-reload
sudo -n systemctl enable "$UNIT"
sudo -n systemctl restart "$UNIT"
for attempt in {1..15}; do
  if curl --noproxy '*' --silent --fail --max-time 2 http://127.0.0.1:8770/health |
    python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("status")=="ok" and d.get("service")=="caravan-lite" else 1)' 2>/dev/null; then
    echo "Караван запущений. Автозапуск увімкнено."
    echo "Таблиця лідерів на VM: http://127.0.0.1:8770/"
    echo "Ігровий клієнт і зовнішній HTTPS-доступ ще потрібно підключити окремо."
    exit 0
  fi
  sleep 1
done
fail "Перевірка /health не пройдена. Стан: systemctl status $UNIT --no-pager"
