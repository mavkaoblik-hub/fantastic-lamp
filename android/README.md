# CARAVAN D7A Android build

The Android wrapper packages `game/v012_restored/`, using the checksum-verified
103 approved sprites. The automatic and manual APK workflows restore that same
source; `web/` remains an older separate prototype.

The main acceptance workflow is
[original D7A Android](../.github/workflows/caravan-v012-original-android.yml).
It checks browser gameplay/save persistence, four touch viewport sizes, compiles
with Android SDK 35 / Java 17 / Gradle 8.9, and verifies APK identity and signing.
The downloadable artifact is `CARAVAN-D7A-install-alongside-APK`.

First launch automatically enrolls a device and remembers its account without a form. INTERNET permission
supports optional resource summaries. Without `CARAVAN_SERVER_URL` the game stays
offline. TLS validation, mixed-content protection and the native endpoint/path
allowlist remain enabled; no arbitrary navigation or file access is allowed.

See [endpoint and authorization setup](../docs/CARAVAN_SERVER_SYNC_2026-11-03.md).
Keep the existing applicationId, appassets origin and compatible signing key when
updating an installed APK; do not uninstall or clear data to bypass a signature
conflict, because local progress is stored in WebView DOM storage.

The preview package `ua.mavka.caravan.autotest.syncpreview` installs beside older
`ua.mavka.caravan.autotest` builds signed with another debug key. Its visible name
is «Караван: Вхід (тест)». Old app data is not transferred, modified or removed.
Debug signatures generated on separate CI runners are not stable. Updating an
existing installation still requires its original private key. See
[installation conflict](../docs/CARAVAN_ANDROID_INSTALL_CONFLICT_2026-11-03.md).
The Android 35 emulator regression installs an incompatible fixture, checks the
expected upgrade rejection, then installs/launches preview while preserving the
fixture package and its private data sentinel.

No physical-device execution is implied by a successful build or browser touch
test. For device diagnostics: `adb logcat -d -s AndroidRuntime:E CARAVAN_BOOT:E CARAVAN_JS:D`.
