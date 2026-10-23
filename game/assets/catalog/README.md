# CARAVAN: Approved artwork crop set V1

This folder is generated from the **four original user-approved PNG atlases**, verified byte-for-byte against the manifest in game/assets/approved_style_20261023/manifest.json.

- crop_spec_v1.json defines unique semantic IDs and exact rectangles in the 1024x768 reference coordinate system.
- crops_v1/ contains individual **PNG rectangular source crops**. They keep the dark atlas background and may include labels, frames, and nearby details.
- crop_contact_sheets/ contains visual review boards, grouped by category.
- crops_v1/manifest.json records source atlas, coordinates in original pixels, size, SHA-256, and status for every item.

**These are reusable illustrated inventory / UI thumbnails, not alpha-isolated moving game sprites.** Source alpha is not claimed or faked. Wagons must be separately matted to clean RGBA before scene placement. Do not silently replace an existing ID with new art.

No graphic is synthesized. No source atlas modified. If a rectangle is inaccurate, correct the source rectangle in crop_spec_v1.json and rerun the GitHub workflow, rather than creating a second icon.

Approved visual identity: detailed cinematic post-apocalyptic dieselpunk (rust, bolts, brass, amber lamps, blue-black shadows).

Canonical rule: one currency = one semantic ID; one action (such as opening tasks) = one semantic ID in all game screens. Frontend integration is separate and should only use validated thumbnails.
