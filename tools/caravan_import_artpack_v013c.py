#!/usr/bin/env python3
"""Stage verified Caravan v0.13-C review sprites without overwriting v0.12 art.

Usage:
  python tools/caravan_import_artpack_v013c.py CARAVAN_v013C_36_SPRITES_PACK.zip
Writes only to game/assets/review_v013c/; does NOT alter APK or production art.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_GROUPS = {"ui_variants": 12, "landmarks": 12, "room_previews": 12}
EXPECTED_PIXEL_SIZES = {"ui_variants": (128, 256), "landmarks": (256, 512),
                        "room_previews": (256, 512)}

def stage(archive: Path, destination: Path) -> int:
    if not archive.is_file():
        raise ValueError("Provide the actual ZIP archive exported from the art pass")
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None, "The art archive is corrupt"
        manifest = json.loads(z.read("manifest.json"))
        assert manifest.get("format") == "CARAVAN_ART_PACK_V013C_REVIEW_V1"
        assets = manifest["assets"]
        assert len(assets) == 72, "Exactly 36 concepts x two render sizes required"
        groups = {g: set() for g in EXPECTED_GROUPS}
        names = set()
        for item in assets:
            cat, role = item["id"].split(".", 1)
            assert cat in groups and item["category"] == cat and role
            assert item.get("runtime_status") == "NOT_IN_GAME"
            assert item["variant_px"] in EXPECTED_PIXEL_SIZES[cat]
            path = item["path"]
            allowed = f"sprites/{cat}/{item['variant_px']}px/{role}.png"
            assert path == allowed, f"Unsafe or inconsistent path: {path}"
            blob = z.read(path)
            assert hashlib.sha256(blob).hexdigest() == item["sha256"]
            assert blob.startswith(b"\x89PNG\r\n\x1a\n"), f"Not PNG: {path}"
            groups[cat].add(role)
            names.add(path)
        assert len(names) == 72
        assert {k:len(v) for k,v in groups.items()} == EXPECTED_GROUPS
        destination.mkdir(parents=True, exist_ok=True)
        # Fail closed: never replace existing art, whether original or staged.
        for path in sorted(names):
            target = destination/path
            blob = z.read(path)
            if target.exists():
                assert target.read_bytes() == blob, f"Conflicting sprite: {target}"
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob)
        for meta in ["manifest.json", "README_UA.md", "gallery.html", "PREVIEW.jpg"]:
            blob=z.read(meta)
            target=destination/meta
            if target.exists():
                assert target.read_bytes() == blob, f"Conflicting review metadata: {meta}"
            else:
                target.write_bytes(blob)
    print(f"PASS: 36 roles, 72 PNGs staged in {destination}")
    print("Review-only: source wagon art, currency icon IDs and Android build remain unchanged")
    return 0

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("archive",type=Path)
    p.add_argument("--dest",type=Path,default=ROOT/"game/assets/review_v013c")
    args=p.parse_args()
    raise SystemExit(stage(args.archive,args.dest))
