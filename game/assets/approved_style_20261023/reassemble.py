"""Restore byte-identical approved Caravan atlas PNGs from versioned Git chunks.

Usage: python3 game/assets/approved_style_20261023/reassemble.py
The PNGs will be written to approved_style_20261023/restored/.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
result = root / "restored"
result.mkdir(parents=True, exist_ok=True)
for entry in manifest["atlases"]:
    chunks = [root / "originals" / f"{entry['filename']}.part{i:02}" for i in range(entry["parts"])]
    for f in chunks:
        if not f.is_file():
            raise FileNotFoundError(f)
    payload = b"".join(f.read_bytes() for f in chunks)
    if len(payload) != entry["size_bytes"]:
        raise ValueError(f"Wrong size for {entry['filename']}")
    digest = hashlib.sha256(payload).hexdigest()
    if digest != entry["sha256"]:
        raise ValueError(f"Checksum mismatch for {entry['filename']}: {digest}")
    path = result / entry["filename"]
    path.write_bytes(payload)
    print(f"PASS {entry['filename']} ({len(payload)} bytes, SHA256 {digest})")