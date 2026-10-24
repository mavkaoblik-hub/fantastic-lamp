# CARAVAN — Restoration of the approved v0.12 video visual baseline

Restoration source: branch `caravan-v012-android-migration`, not newer geometric `web/game.js`.

Recovered without re-rendering:
- 11 exact Git blobs (ZIP archive files) in `game/v012_asset_packs/`, SHA-256 list in `packs_manifest.json`;
- Original `index.html`, `app.js` and `style.css` in `game/v012_restored/`;
- Original `CARAVAN_MANIFEST` with 14 wagon types and 4 locomotive levels;
- `tools/caravan_restore_v012.py` validates all 11 originals, extracts the source sprite packages and verifies 103 original graphical assets and HTML references.

To restore locally: `python tools/caravan_restore_v012.py build/caravan_v012`, then open through a simple localhost static web server. The original app is not connected to an external CDN; it is packaged inside the APK.

`CARAVAN v0.12 - Restore original approved train` GitHub workflow verifies the original browser scene at 1280×576 and produces its **own reference APK**. This is separate from the active v0.4 source and does not silently overwrite that code or original art. v0.4 gameplay features still need selective migration into this authentic scene, after acceptance.

Hard visual gate: train faces left, actual illustrated dieselpunk locomotive and wagons from archived original 103 images, cutaway interiors, crew image frames, warm lighting and industrial atmosphere. Never substitute geometric Canvas wagon renderer or unrelated pictures.
