# CARAVAN Android — repaired launch v0.14-alpha2

## Why v0.13 crashed
The APK handed off on 23 October 2026 was manufactured without the official Android build toolchain. The `classes.dex`, AndroidManifest binary and resources table were assembled by a custom Python script; a successful ZIP or APK signature check **does not validate Android runtime compatibility**. The user's Xiaomi/MIUI handset reported a crash immediately after launch. Without device logcat the precise exception remains unknown.

## Fix / source of truth
Use the **real Java Android source** from `CARAVAN_ANDROID_FIX_v014.zip`, built with Android Gradle Plugin 8.7.3, Gradle 8.9, Java 17 and SDK 35 through GitHub Actions, rather than repackaging a manually created DEX.

The ZIP contains the complete game assets as well as `android/app/src/main/java/ua/mavka/caravan/MainActivity.java` and build configuration. Important details:
- ID `ua.mavka.caravan.alpha` allows installation next to failed `com.android.caravan.offline`; the manifest uses **fully qualified** `ua.mavka.caravan.MainActivity`.
- Native startup error fallback with `CARAVAN_BOOT` Logcat marker.
- WebView game assets served through `appassets.androidplatform.net`, JS + DOM storage enabled, offline, landscape, without Internet permission.
- Assets: 102 PNG images + other game files, not the later v0.21 images.

## Build
1. Upload `CARAVAN_ANDROID_FIX_v014.zip` to the **root of this repository**. Do not rename or extract.
2. The workflow `.github/workflows/build-caravan-v014.yml` will compile with the official Android SDK and attach `CARAVAN-v014-Android-debug-APK`.
3. Download the artifact's `app-debug.apk` and install on the handset.
4. The workflow checks the actual APK app ID, launcher Activity, v1/v2 signature via SDK apksigner, APK zip integrity, and SHA256.
5. If installation/launch still fails, capture `adb logcat -d -s AndroidRuntime:E CARAVAN_BOOT:E CARAVAN_JS:D`; do not attach unrelated personal logs.

**Status:** source archive assembled and Java syntax typechecked using temporary Android API stubs. No Android SDK/emulator is available in this chat's execution container; **no compiled or real-device-tested v0.14 APK is being claimed**. The previous experimental v0.13 APK should not be reused.

## Read-only comparator
The working repository `arudichik-source/Mavka-Android` was inspected read-only to confirm its conventional GitHub Actions Android build principle (.NET 10 Android). **No commits, branches, files, or settings were changed there.** The Caravan game keeps Java/WebView and uses its own standard Gradle workflow.
