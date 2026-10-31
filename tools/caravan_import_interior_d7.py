#!/usr/bin/env python3
"""Import the approved D7 REVIEW interior prop pack (not production assets).
Usage: python tools/caravan_import_interior_d7.py CARAVAN_INTERIOR_LIFE_ART_D7_REVIEW.zip
No existing differing files are overwritten; Android and source assets untouched.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zipfile

ZIP_SHA256 = "dce741e3845907e4cff3f46f639c47852dcfdb9328c7571ef44ff00402734566"
SPRITES = {
 "sprites/interior_sleep_bunk.png": "ef36743c67b66889560c96327b9018ecf90f340ad0c822d99118e45adf6051a5",
 "sprites/interior_social_booth.png": "ae337fb26352a235886d0e04a4116752a80c73586824e12df58f66d778381925",
 "sprites/interior_canteen_table.png": "c1f9e71f684c96723b167b6ae7a1b35e09ff66b1029b9c5a7d069e4f9f07f07f",
 "sprites/interior_connector_passage.png": "3b6adec19698b27f5e0a1ce6819ca671c1c601c91c6cc07b71bac623bb67b49e",
 "sprites/interior_radio_desk.png": "08c8cd0a1a35774bb74b94c1285f58f734536fecdb3d506110744d3ba4b1b278",
 "sprites/interior_storage_lockers.png": "56afd138b2cd7b0f766d3f846c835c4840d912b4d0840c2ec99844f950742be9",
}
EXTRA = {"manifest.json", "PREVIEW.jpg", "README_UA.md", "sources/a_clean_isolated_asset_sheet_spritesheet_style_i.png"}
EXPECTED = set(SPRITES) | EXTRA
PNG_SIGNATURE = bytes.fromhex("89504e470d0a1a0a")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def png_dimensions_and_type(data):
    if len(data) < 33 or not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise ValueError("Invalid PNG")
    width,height,depth,color = struct.unpack(">IIBB",data[16:26])
    if min(width,height) < 1 or width>2048 or height>2048 or depth!=8 or color!=6:
        raise ValueError("Expected 8-bit RGBA PNG with valid dimensions")
    return width,height

def main(archive):
    archive=Path(archive)
    raw=archive.read_bytes()
    if sha(raw) != ZIP_SHA256:
        raise ValueError("Unknown archive checksum — source pack is not the reviewed version")
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None or set(z.namelist()) != EXPECTED:
            raise ValueError("Unexpected or damaged archive entries")
        blobs={name:z.read(name) for name in sorted(EXPECTED)}
    manifest=json.loads(blobs["manifest.json"].decode("utf-8"))
    if len(manifest.get("sprites",[]))!=6 or manifest.get("status")!="REVIEW_ONLY_NOT_INTEGRATED":
        raise ValueError("Manifest does not match reviewed sprite pack")
    for name,digest in SPRITES.items():
        if sha(blobs[name])!=digest:
            raise ValueError("Sprite checksum mismatch: "+name)
        png_dimensions_and_type(blobs[name])
    base=Path(__file__).resolve().parents[1]/"game"/"assets"/"review_interior_d7"
    for name,body in blobs.items():
        out=base/name
        if out.exists() and sha(out.read_bytes())!=sha(body):
            raise ValueError("Refusing to overwrite different existing file: "+str(out))
    for name,body in blobs.items():
        out=base/name
        out.parent.mkdir(parents=True,exist_ok=True)
        if not out.exists():
            out.write_bytes(body)
    print("Imported 6 REVIEW PNG/RGBA sprites to",base)
    print("Not connected to web game or Android bundle. Review visually first.")

if __name__=="__main__":
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python tools/caravan_import_interior_d7.py <pack.zip>")
    main(sys.argv[1])
