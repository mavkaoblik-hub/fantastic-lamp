# CARAVAN v0.12 automated Android APK

On updates to `web/`, `android/` or `game/v012_asset_packs/`, GitHub Actions verifies the original 11 ZIP sprite packs with SHA256, unpacks 103 painterly PNG/JPG images and the v0.12 game, compiles an offline APK with Android SDK 35 / Java 17 / Gradle 8.9, checks signature and uploads `CARAVAN-v012-Android-debug-APK`.

APK is an alpha test, not production ready. Never substitute primitive SVG mockups for approved sprites. Debug signing key is ephemeral on GitHub runners; replacing installed debug APK may require uninstall, which can delete local save. Do not change the Mavka Mobile repository.
