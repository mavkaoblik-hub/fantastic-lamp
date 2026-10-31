#!/usr/bin/env python3
"""Stage the CARAVAN D7B review-art bundle, never overwriting original assets.
Usage: python tools/caravan_import_artpack_d7b.py CARAVAN_D7B_CREW_AND_WAGONS_REVIEW.zip
"""
from pathlib import Path, PurePosixPath
import hashlib
import json
import struct
import sys
import zipfile

ZIP_SHA256 = "227ecd4926e6a18150bacfb7cf5b8417dc09a9a86abc505e5afdebc4a5d865aa"
PROJECT = Path(__file__).resolve().parents[1]
DESTINATION = PROJECT / "game" / "assets" / "review_d7b"
EXPECTED_GROUPS = {
    "crew_activity_rgba": 8,
    "wagon_concept": 5,
    "room_concept": 6,
    "ui_reference": 2,
}
SOURCE_NAMES = {
    "sources/crew_sheet_previous.png",
    "sources/wagon_and_objects_atlas.png",
    "sources/interior_social_ui_atlas.png",
}
EXTRA_NAMES = {"README_UA.md", "gallery.html", "PREVIEW.jpg", "manifest.json"}

def sha(blob):
    return hashlib.sha256(blob).hexdigest()

def check_name(name):
    p = PurePosixPath(name)
    if p.is_absolute() or not name or p.as_posix() != name or ".." in p.parts:
        raise ValueError("Unsafe archive path: " + name)
    return name

def png_rgba(blob):
    if len(blob) < 33 or blob[:8] != b"\x89PNG\r\n\x1a\n" or blob[12:16] != b"IHDR":
        raise ValueError("Missing PNG signature or IHDR")
    w, h, depth, color = struct.unpack(">IIBB", blob[16:26])
    if not (1 <= w <= 2048 and 1 <= h <= 2048 and depth == 8 and color == 6):
        raise ValueError("Expected 8-bit RGBA PNG with bounded dimensions")
    return w,h

def import_pack(archive):
    archive = Path(archive)
    if not archive.is_file():
        raise ValueError("Please supply the actual D7B ZIP")
    if sha(archive.read_bytes()) != ZIP_SHA256:
        raise ValueError("Unknown ZIP checksum: different art pack")
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise ValueError("Damaged ZIP")
        all_names=set(z.namelist())
        if any(name.endswith("/") for name in all_names):
            raise ValueError("Unexpected archive directory entry")
        for name in all_names:
            check_name(name)
        manifest=json.loads(z.read("manifest.json").decode("utf-8"))
        if (manifest.get("pack_id")!="CARAVAN_D7B_CREW_AND_WAGONS_REVIEW"
            or manifest.get("status")!="REVIEW_ONLY_NOT_YET_IN_APK"
            or len(manifest.get("assets", [])) != 21):
            raise ValueError("Unexpected manifest or production readiness")
        groups={k:0 for k in EXPECTED_GROUPS}
        target_names=set(SOURCE_NAMES)|EXTRA_NAMES
        for asset in manifest["assets"]:
            name=check_name(asset["file"])
            kind=asset["kind"]
            if name in target_names or kind not in groups:
                raise ValueError("Duplicate or unknown art entry")
            groups[kind]+=1
            blob=z.read(name)
            if sha(blob)!=asset["sha256"]:
                raise ValueError("SHA256 mismatch for "+name)
            w,h=png_rgba(blob)
            if (w,h)!=(asset["width_px"],asset["height_px"]):
                raise ValueError("Unexpected dimensions for "+name)
            if kind == "crew_activity_rgba" and not asset.get("isolated_transparency"):
                raise ValueError("Missing crew alpha declaration")
            target_names.add(name)
        if groups!=EXPECTED_GROUPS or all_names!=target_names:
            raise ValueError("Unexpected number of assets or extra ZIP paths")
        for name, checksum in manifest.get("source_checksums",{}).items():
            if name not in SOURCE_NAMES or sha(z.read(name)) != checksum:
                raise ValueError("Unexpected source sheet")
        if set(manifest.get("source_checksums",{}))!=SOURCE_NAMES:
            raise ValueError("Missing source checksum")
        blobs={name:z.read(name) for name in sorted(target_names)}
    # Validate entire archive before writing any new files. Fail closed on conflict.
    for name,blob in blobs.items():
        dest=DESTINATION/name
        if dest.exists() and dest.read_bytes()!=blob:
            raise FileExistsError("Conflicting resource, refusing overwrite: "+str(dest))
    for name,blob in blobs.items():
        dest=DESTINATION/name
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(blob)
    return len(manifest["assets"]), DESTINATION

if __name__ == "__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python tools/caravan_import_artpack_d7b.py D7B.zip")
    count,path=import_pack(sys.argv[1])
    print(f"Verified and staged {count} review assets into {path}")
    print("No canonical v0.12 assets or Android app files changed.")
