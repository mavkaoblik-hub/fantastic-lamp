# Caravan web updates through Shorts Studio

This adds a server handler for the existing `/updates` panel. Target: `caravan-web`.
The current Shorts API is extended, not replaced. Its `authorized()` check protects every update command.
The installer discovers the active Python entrypoint under `/opt/shorts-studio`, checks its AST before changes, backs it up and adds one bridge hook before its main entrypoint. Unsupported structure is rejected before mutation.

## Install on the existing Oracle VM

From the existing fantastic-lamp checkout:

```sh
git -C /home/ubuntu/caravan-source pull --ff-only
sudo python3 /home/ubuntu/caravan-source/server/web_updates/scripts/install-caravan-updater.py
```

Success is `CARAVAN_UPDATER_CONNECTED`. The installer probes `/v1/overview` and `/v1/updates` using credentials from the running process, without printing them. On a failed API probe it restores the prior API source and restarts it.

It creates a separate `caravanupdate` system account, a private Unix socket and a bounded systemd service. Only `/srv/mavka-web/public/caravan` is writable by this account in the site tree. The entire initial game snapshot is backed up once to `/var/backups/caravan-web-initial`. The initial game's top-level files stay in place.

The API is restarted once. Renderer services, login application, website homepage, SSH/VNC, Cloudflare tunnel, registration and player databases are not modified.

## Upload and install

Open Shorts Studio `/updates`, then refresh status. Upload a release ZIP, refresh after validation, press Install and refresh again. No recurring browser polling is added.

A release ZIP contains `index.html` at its root and `caravan-release.json`:

```json
{"target":"caravan-web","version":"2026.11.10-1"}
```

Only web extensions are permitted. ZIP paths, links, encrypted entries, duplicate paths, expansion ratios, file count and sizes are checked on Oracle. Python/shell files are rejected. Uploaded code is never executed on the VM.

Limits: 64 MiB compressed, 192 MiB expanded, 32 MiB/file, 2048 entries. The existing incoming-file service may enforce lower limits. Packages without the release manifest are rejected and leave the live game untouched.

## Build a package

```sh
python3 server/web_updates/scripts/build-caravan-package.py game/v012_restored 2026.11.10-1 /tmp/CARAVAN_WEB_2026.11.10-1.zip
```

An explicitly specified web source directory is packaged; Android native files are not included. The builder excludes known offline workers and removes standalone inline worker registration scripts. It validates the final archive.

## Deployment and failure handling

Validation downloads the already-uploaded package through the existing authenticated loopback file API. A validated archive is pinned by SHA-256, rechecked before install, and extracted into a new immutable release directory. No symlinks are used (the existing site's file gate rejects them).

Only after the complete release is present does an atomic index replacement point `/caravan/index.html` to `/caravan/releases/<digest>/index.html`. Browser relative resource paths continue to resolve within that release. This remains behind the existing website login gate.

The previous entrypoint is saved privately. The current and previous managed release are retained; older managed releases are removed on successful updates, without touching original files. Initial backup + two expanded releases + one staged release + ZIP can temporarily use several hundred MiB. Free disk space is checked before extraction. Interrupted operations become failed after restart. Users with an older tab may need to reload after multiple updates because only two managed releases are retained.

This release has no rollback button or uploaded-package preview. The saved previous entrypoint provides operator recovery. The installer's API rollback restores only the API script; it retains the dedicated updater service and game backup for diagnostics.

## Verification

`python3 -m unittest discover -s server/web_updates/tests -v`

Local tests cover archive attacks, package mutation, backups and activation, repeated commands, install failure, retention and authenticated route delegation. Live VM installation and browser upload/install must still be verified by the operator. Existing API source is outside this repository and can differ; the installer fails closed when the discovered structure is unsupported.
