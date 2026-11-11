#!/usr/bin/env bash
# Disposable emulator only. Never uninstall or clear an existing user's app.
set -euo pipefail
OLD=ua.mavka.caravan.autotest
PREVIEW=$OLD.syncpreview
DEBUG_APK=build/install/debug/app-debug.apk
PREVIEW_APK=build/install/preview/app-preview.apk
OUT=build/install/evidence
mkdir -p "$OUT"
SIGNER="$ANDROID_HOME/build-tools/35.0.0/apksigner"
if [ ! -x "$SIGNER" ]; then
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" 'build-tools;35.0.0'
fi
# This job tests installation and local startup, not a production server account.
adb shell svc wifi disable
adb shell svc data disable

# Reproduce the reported mismatch with a disposable fixture key, never published.
keytool -genkeypair -keystore "$OUT/fixture.p12" -storetype PKCS12 \
  -storepass fixture-only -keypass fixture-only -alias fixture -keyalg RSA \
  -keysize 2048 -validity 2 -dname 'CN=Disposable install regression fixture'
"$SIGNER" sign --ks "$OUT/fixture.p12" --ks-pass pass:fixture-only \
  --key-pass pass:fixture-only --ks-key-alias fixture \
  --out "$OUT/existing-fixture.apk" "$DEBUG_APK"
adb install "$OUT/existing-fixture.apk"
adb shell run-as "$OLD" mkdir -p files
printf 'keep-existing-data' | adb shell run-as "$OLD" tee files/install-sentinel >/dev/null

if adb install -r "$DEBUG_APK" > "$OUT/conflicting-upgrade.txt" 2>&1; then
  echo 'Expected mismatched signature to reject upgrade' >&2
  exit 1
fi
grep -F 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' "$OUT/conflicting-upgrade.txt"
adb install "$PREVIEW_APK" | tee "$OUT/preview-install.txt"
adb shell pm path "$OLD" | grep -F 'package:'
adb shell pm path "$PREVIEW" | grep -F 'package:'
test "$(adb shell run-as "$OLD" cat files/install-sentinel | tr -d '\r')" = keep-existing-data

adb logcat -c
adb shell am start -W -n "$PREVIEW/ua.mavka.caravan.MainActivity" | tee "$OUT/launch.txt"
for attempt in $(seq 1 30); do
  adb logcat -d -s CARAVAN_BOOT:I CARAVAN_JS:E AndroidRuntime:E > "$OUT/boot.txt"
  if grep -F 'Game scene ready' "$OUT/boot.txt"; then break; fi
  sleep 1
done
grep -F 'Game scene ready' "$OUT/boot.txt"
if grep -E 'FATAL EXCEPTION|Missing game asset|Native startup failure|ERROR ' "$OUT/boot.txt"; then exit 1; fi
adb exec-out screencap -p > "$OUT/preview-startup.png"
echo 'PASS: conflict reproduced, preview installs beside existing app, existing app data preserved, game boots.'
