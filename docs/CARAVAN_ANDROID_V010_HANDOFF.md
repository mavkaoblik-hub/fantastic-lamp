# КАРАВАН — Android test v0.10 (22.10.2026)

На базі браузерної v0.9 створено **Android Studio / Gradle проєкт** для подальшого встановлення на Android. Повний архів передано користувачу в розмові під назвою `КАРАВАН_ANDROID_v0.10_ПРОЄКТ_ДЛЯ_APK.zip`.

## Склад
- `android/app/src/main/assets/game`: 87 PNG/JPG файлів, JavaScript, CSS, HTML, локальний manifest.
- `android/app/src/main/java/ua/mavka/caravan/MainActivity.java`: fullscreen WebView, горизонтальна орієнтація, внутрішня HTTPS-подібна адреса `appassets.androidplatform.net`, завантаження ресурсів лише з пакета без INTERNET permission.
- `android/app/build.gradle`: Android Gradle Plugin 8.7.3, compileSdk/targetSdk 35, minSdk 24, Java 17.
- `.github/workflows/build-caravan-apk.yml`: CI для створення debug APK.
- `QA_CHECKLIST.md`: тестовий план на фізичному Android.

## Стан перевірки
PASS: перевірка 87 з 87 графічних файлів, цілісність ZIP, XML AndroidManifest, `node --check`, Chromium 844×390 — завантаження 87 ресурсів, бокове меню відкривається, JS-помилок немає, без overflow по екрану.
**НЕ перевірено:** Gradle/SDK build та встановлення APK: в контейнері немає Android SDK, Gradle і зовнішнього інтернету.

## Критично
Це тестова **нативна Android-обгортка HTML5-сцени**, а не Godot APK. Наразі основним джерелом є ZIP з поточної розмови. GitHub містить лише цей опис та CI-файл (поки не завантажено весь `android/` із ZIP). CI запустити **після** завантаження проєкту у репозиторій. Не повідомляти, що APK готовий, доки не існує успішного GitHub Actions артефакту.

## Наступний крок
1. Розпакувати ZIP у репозиторій (зберегти шлях `android/`), або відкрити `android/` у Android Studio.
2. GitHub Actions > Build CARAVAN Android test APK > Run workflow; завантажити artifact `CARAVAN-v0.10-debug-APK`.
3. Встановити debug APK на Android і пройти QA_CHECKLIST.md.
4. Виправити Android-специфічні баги та перейти до повноцінного рендерингу через Godot після оцінки мобільної версії.
