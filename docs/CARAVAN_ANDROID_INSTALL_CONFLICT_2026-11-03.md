# Конфлікт встановлення APK і безпечна тестова копія

У попередній D7A-збірці `6aedf3b3` та новій збірці `772ecfac` однаковий package
`ua.mavka.caravan.autotest`, але різні сертифікати. GitHub runners створювали
тимчасові debug keys незалежно на кожній збірці. Збільшення versionCode не
робить підписи сумісними; успішний `apksigner verify` перевіряє валідність,
а не можливість оновлення раніше встановленого застосунку.

- [Попередня збірка](https://github.com/mavkaoblik-hub/fantastic-lamp/actions/runs/41601358270):
  SHA256 сертифіката `deffd3980204da92c9499d64db6f71247ce13eb68b803c10f8a1537e646db56e`.
- [Нова збірка](https://github.com/mavkaoblik-hub/fantastic-lamp/actions/runs/41607041357):
  SHA256 сертифіката `3367b7a384f6d641ba45a3f83757dccc92bf789703efcd113e8d9775f02d09fd`.
- [Правила Android щодо підпису оновлень](https://developer.android.com/studio/publish/app-signing).

## Що встановлювати зараз

Artifact `CARAVAN-D7A-install-alongside-APK` містить `app-preview.apk`.
Він має окремий applicationId `ua.mavka.caravan.autotest.syncpreview` і назву
**«Караван: Вхід (тест)»**. Його можна встановити поруч зі старою грою, зберігши
стару інсталяцію та її локальні дані. У preview буде власний прогрес і власний
автоматичний акаунт; автоматичного перенесення gameplay зі старого пакета немає.

Не видаляйте стару гру й не очищайте її дані заради встановлення тестової версії.
Основний package та його appassets origin залишилися незмінними. Окремий artifact
`CARAVAN-D7A-upgrade-requires-original-key-APK` призначений лише для розробки/
оновлень із сумісним підписом; він не обходить Android signature verification.

Це безпечний спосіб встановити поточний preview, а не відновлення втраченого
приватного ключа. Для постійних оновлень потрібен збережений signing keystore:
усі наступні APK одного package треба підписувати ним. CI debug key не варто
вважати постійним. Сертифікат із готового APK не дозволяє відновити private key.

## Регресійна перевірка

Android 35 emulator job створює одноразовий fixture key, встановлює ним підписаний
основний package і записує sentinel у його приватні файли. Перевіряє очікуваний
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` при заміні іншим підписом; потім встановлює
preview, перевіряє наявність обох packages та незмінність sentinel, запускає
нову гру і очікує `CARAVAN_BOOT: Game scene ready`. Приватний fixture key не
публікується. Зберігаються журнали та screenshot запуску. Результат на фізичному
пристрої користувача не заявляється до його перевірки.
