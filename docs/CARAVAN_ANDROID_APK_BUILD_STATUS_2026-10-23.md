# Android APK: status as of 2026-10-23

## Verified existing source archive

- File: `CARAVAN_ANDROID_SOURCE_v013.zip` (provided as a conversation artifact, **not currently committed to GitHub**)
- SHA-256: `6b13d83537351435bf2ce841d87669ecf99ec16c9ae77403891d837326cb57a9`
- ZIP: 128 entries, CRC check passed.
- Game manifest references 103 unique graphics and all 103 are present in the archive.
- Android Java entry point, manifest, Gradle 8.9 / AGP 8.7.3, WebView game assets are included.
- Build is **unverified**; no APK has been produced or installed as of this report.

## GitHub status

The workflow `.github/workflows/build-caravan-v013-from-zip.yml` is present and triggers on committing `CARAVAN_ANDROID_SOURCE_v013.zip` into the root of `main`.

**Actual blocker:** the workflow ZIP input does not exist in the repository. The connected GitHub write actions currently available in this session do not accept a local binary file/attachment as a GitHub upload; the offline execution environment does not contain Android SDK/Gradle and cannot download them. Do not claim a complete APK exists.

## One required step to build

Upload **the exact** ZIP file to repo root at https://github.com/mavkaoblik-hub/fantastic-lamp/upload/main and commit. Do not extract it. The push then triggers GitHub Actions and, if the build succeeds, uploads `CARAVAN-v013-alpha-debug-APK` (contains `app-debug.apk`). Check logs and artifact in https://github.com/mavkaoblik-hub/fantastic-lamp/actions/workflows/build-caravan-v013-from-zip.yml .

Do not declare success until a successful workflow run with a nonempty APK artifact is observed. Physical Android installation remains a separate test.
