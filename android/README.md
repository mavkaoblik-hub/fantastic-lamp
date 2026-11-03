# CARAVAN D7A Android build

The Android wrapper packages `game/v012_restored/`, using the checksum-verified
103 approved sprites. The automatic and manual APK workflows restore that same
source; `web/` remains an older separate prototype.

The main acceptance workflow is
[original D7A Android](../.github/workflows/caravan-v012-original-android.yml).
It checks browser gameplay/save persistence, four touch viewport sizes, compiles
with Android SDK 35 / Java 17 / Gradle 8.9, and verifies APK identity and signing.
The downloadable artifact is `CARAVAN-original-v012-Android-APK`.

First launch offers registration, code login and offline play. INTERNET permission
supports optional resource summaries. Without `CARAVAN_SERVER_URL` the game stays
offline. TLS validation, mixed-content protection and the native endpoint/path
allowlist remain enabled; no arbitrary navigation or file access is allowed.

See [endpoint and authorization setup](../docs/CARAVAN_SERVER_SYNC_2026-11-03.md).
Keep the existing applicationId, appassets origin and compatible signing key when
updating an installed APK; do not uninstall or clear data to bypass a signature
conflict, because local progress is stored in WebView DOM storage.

No physical-device execution is implied by a successful build or browser touch
test. For device diagnostics: `adb logcat -d -s AndroidRuntime:E CARAVAN_BOOT:E CARAVAN_JS:D`.
