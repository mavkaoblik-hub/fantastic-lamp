#!/usr/bin/env python3
"""Crop source-authentic reference panels from approved Caravan art atlases.

Rectangles are hand-reviewed on actual approved atlas previews (1024 x 768).
This does not remove background, reinterpret labels, generate new imagery, or
claim that rectangular cards are scene-ready alpha-isolated sprites.
"""
import hashlib
import io
import json
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "game/assets/approved_style_20261023"
CAT = ROOT / "game/assets/catalog"
OUT = CAT / "crops_v1"
PREVIEWS = CAT / "crop_contact_sheets"
OUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)

spec = json.loads((CAT / "crop_spec_v1.json").read_text(encoding="utf-8"))
manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
source = {}
for entry in manifest["atlases"]:
    path = entry["filename"]
    raw = b"".join(
        (BASE / "originals" / (path + ".part%02d" % i)).read_bytes()
        for i in range(entry["parts"]))
    if len(raw) != entry["size_bytes"]:
        raise ValueError("Length mismatch for " + path)
    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ValueError("SHA256 mismatch for " + path)
    image = Image.open(io.BytesIO(raw))
    image.load()
    if list(image.size) != entry["resolution"]:
        raise ValueError("Wrong source dimensions " + path)
    source[path] = image.convert("RGBA")

seen = set()
results = []
contact = defaultdict(list)
rw, rh = spec["reference_size"]
for item in spec["items"]:
    ident = item["id"]
    if ident in seen:
        raise ValueError("Duplicate ID " + ident)
    seen.add(ident)
    image = source[item["atlas"]]
    left, top, right, bottom = item["rect_preview"]
    if not (0 <= left < right <= rw and 0 <= top < bottom <= rh):
        raise ValueError("Invalid rectangle " + ident)
    w, h = image.size
    rect = [round(left * w / rw), round(top * h / rh),
            round(right * w / rw), round(bottom * h / rh)]
    cropped = image.crop(tuple(rect))
    folder = OUT / item["group"]
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (ident.replace(".", "_") + ".png")
    cropped.save(target, optimize=True)
    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    result = {**item, "rect_source_pixels":rect, "file":target.relative_to(ROOT).as_posix(),
              "width":cropped.width, "height":cropped.height, "sha256":sha,
              "background_removed":False, "alpha_isolated":False}
    results.append(result)
    contact[item["group"]].append((item, cropped))

for group, entries in sorted(contact.items()):
    count = len(entries)
    columns = 5 if count > 9 else min(count, 4)
    rows = (count + columns - 1) // columns
    tile_w, tile_h = 230, 170
    sheet = Image.new("RGB", (columns*tile_w, rows*tile_h+44), "#101a22")
    draw = ImageDraw.Draw(sheet)
    draw.text((15, 14), group.upper() + " | actual approved art crops | background retained",
              fill="#e8b875")
    for idx,(item,cropped) in enumerate(entries):
        col, row = idx % columns, idx // columns
        x,y = col*tile_w+8, row*tile_h+49
        frame = ImageOps.contain(cropped.convert("RGB"), (tile_w-18,tile_h-44),
                                 Image.Resampling.LANCZOS)
        sheet.paste(frame, (x+(tile_w-18-frame.width)//2,y))
        draw.text((x,row*tile_h+44+tile_h-29),item["id"],fill="#f2d19d")
    sheet.save(PREVIEWS / (group + ".jpg"),quality=82,optimize=True,progressive=True)

(OUT / "manifest.json").write_text(
    json.dumps({"format":"CARAVAN_SOURCE_CROPS_MANIFEST_V1",
                "original_source_is_immutable":True,"not_transparent_sprites":True,
                "items":results},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("PASS: %d immutable-source crops from %d approved atlases" % (len(results),len(source)))
print("Manifest:",(OUT/"manifest.json").relative_to(ROOT))
