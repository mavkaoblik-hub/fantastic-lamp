# CARAVAN – automatic Android build

The official Android wrapper lives in `android/`. There is **no manual DEX/APK fabrication**.

Workflow: [Automatic APK](../.github/workflows/build-caravan-automatic.yml).

On every push changing `web/**`, `android/**`, or `game/assets/painterly_v021/**`, Actions bundles the checked-in web game and painterly images into Android assets, compiles with Android SDK 35 and Gradle 8.9, verifies the APK signature, and publishes `CARAVAN-auto-Android-debug-APK` under the successful run's Artifacts.

**Important build provenance**: the `web/` directory currently represents the earlier vertical-slice v0.1, not the complete v0.12 gameplay still held in chat archives. The automated installer is intended as a stable *pipeline/launch test*. Do not market this APK as the fully upgraded game. Copy the upgraded gameplay source into the repository in a future commit; the same workflow will then build it automatically without manual ZIP transfers.

Source game assets are read from the Caravan repository. No Mavka Mobile files are modified. All bundled content is offline, and the manifest intentionally requests no Internet permission. Distinct package ID `ua.mavka.caravan.autotest` avoids conflict with older experimental installs.

For startup crash diagnostics use: `adb logcat -d -s AndroidRuntime:E CARAVAN_BOOT:E CARAVAN_JS:D`.
