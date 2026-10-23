#!/usr/bin/env python3
"""Produce faithful visual references from byte-verified approved PNG atlases.
No painting, interpolation-based sprites, or guessed semantic names.
Only generates scaled contact-sheet previews and verified source metadata.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
from PIL import Image, ImageOps, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
APPROVED = ROOT / "game/assets/approved_style_20261023"
OUT = ROOT / "game/assets/catalog/previews"
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((APPROVED / "manifest.json").read_text(encoding="utf-8"))
result = []
for item in M["atlases"]:
    parts = [APPROVED / "originals" / (item["filename"] + ".part%02d" % i)
             for i in range(item["parts"])]
    for part in parts:
        if not part.is_file():
            raise FileNotFoundError(part)
    data = b"".join(p.read_bytes() for p in parts)
    sha = hashlib.sha256(data).hexdigest()
    assert sha == item["sha256"] and len(data) == item["size_bytes"], item["filename"]
    with Image.open(BytesIO(data)) as image:
        image.load()
        assert list(image.size) == item["resolution"]
        small = ImageOps.contain(image.convert("RGB"), (1024, 768), Image.Resampling.LANCZOS)
    name = Path(item["filename"]).stem
    plain = OUT / (name + ".jpg")
    small.save(plain, quality=81, optimize=True, progressive=True, subsampling=0)
    grid = small.copy()
    draw = ImageDraw.Draw(grid)
    w, h = grid.size
    for col in range(1, 8):
        x = round(col * w / 8)
        draw.line((x, 0, x, h), fill=(245, 198, 119), width=1)
    for row in range(1, 7):
        y = round(row * h / 7)
        draw.line((0, y, w, y), fill=(245, 198, 119), width=1)
    for col in range(8):
        for row in range(7):
            draw.text((col * w // 8 + 5, row * h // 7 + 5),
                      "C%dR%d" % (col + 1, row + 1), fill=(255, 242, 199),
                      stroke_width=1, stroke_fill=(6, 12, 19))
    grid.save(OUT / (name + "_grid.jpg"), quality=81, optimize=True, progressive=True)
    result.append({"atlas": item["filename"], "sha256_original": sha,
                   "size_original": item["resolution"], "preview": plain.name,
                   "grid": name + "_grid.jpg",
                   "note": "unaltered source content, scaled preview only; not an isolated sprite"})
(OUT / "manifest.json").write_text(
    json.dumps({"format": "CARAVAN_APPROVED_ATLAS_PREVIEW_V1",
                "source_manifest": "game/assets/approved_style_20261023/manifest.json",
                "atlases": result}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8")
print("Verified originals and generated %d faithful atlas previews" % len(result))
