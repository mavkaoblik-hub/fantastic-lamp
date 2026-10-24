#!/usr/bin/env python3
"""Restore authentic Caravan v0.12 art, never synthesize replacement sprites."""
import hashlib, json, re, sys, zipfile
from pathlib import Path, PurePosixPath
from collections import Counter

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"game"/"v012_asset_packs"
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/"build"/"caravan_v012"
OUT.mkdir(parents=True,exist_ok=True)
MANIFEST=json.loads((BASE/"packs_manifest.json").read_text(encoding="utf-8"))
assert len(MANIFEST)==11, f"Expected 11 original archives, got {len(MANIFEST)}"
seen=set()
for part in MANIFEST:
    path=ROOT/part["repo_path"]
    assert path.is_file(),f"Missing source ZIP {path}"
    raw=path.read_bytes()
    actual=hashlib.sha256(raw).hexdigest()
    assert actual==part["sha256"],f"Original ZIP SHA256 mismatch: {path}"
    assert len(raw)==part["size"],f"Original ZIP byte length mismatch: {path}"
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None,f"Corrupt ZIP {path}"
        for info in z.infolist():
            if info.is_dir():continue
            name=info.filename.replace("\\","/")
            p=PurePosixPath(name)
            assert not p.is_absolute() and ".." not in p.parts,f"Unsafe ZIP path: {name}"
            assert not re.match(r"^[A-Za-z]:",name),f"Drive letter ZIP path: {name}"
            # A duplicate is only acceptable if it has identical actual bytes.
            target=OUT.joinpath(*p.parts)
            assert str(target.resolve()).startswith(str(OUT)+"/"),f"Unsafe target {name}"
            data=z.read(info)
            if name in seen:
                assert target.read_bytes()==data,f"Conflicting original resource: {name}"
                continue
            seen.add(name)
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
# The restored code is the same committed files as old v0.12, not rewritten code.
for file in ["index.html","app.js","style.css"]:
    source=ROOT/"game"/"v012_restored"/file
    assert source.is_file(),f"Missing original source: {file}"
    (OUT/file).write_bytes(source.read_bytes())
images=sorted(p for p in (OUT/"assets").rglob("*") if p.is_file() and p.suffix.lower() in (".png",".jpg",".jpeg"))
assert len(images)==103,f"Expected 103 ORIGINAL train/crew/background images, found {len(images)}"
index=(OUT/"index.html").read_text(encoding="utf-8")
refs=set(re.findall(r"assets/[A-Za-z0-9_/.+-]+\.(?:png|jpg|jpeg)",index,re.I))
missing=sorted(r for r in refs if not (OUT/r).is_file())
assert not missing,f"Broken original image references: {missing}"
for essential in ["assets/train/locomotive_L1.png","assets/train/locomotive_L4.png",
                  "assets/wagons/reactor.png","assets/crew/mechanic_walk_00.png",
                  "assets/backdrop.jpg"]:
    assert (OUT/essential).is_file(),f"Missing original game art: {essential}"
assert "CARAVAN_MANIFEST" in index
report={"format":"CARAVAN_V012_ORIGINAL_SOURCE_VALIDATION_V1",
        "source_branch":"caravan-v012-android-migration",
        "source_archives":[{"name":e["name"],"sha256":e["sha256"],"bytes":e["size"]} for e in MANIFEST],
        "original_art_count":len(images),"unique_image_references_in_html":len(refs),
        "verified_image_references":len(refs),"unresolved_images":missing,
        "original_render_source":["game/v012_restored/index.html","game/v012_restored/app.js","game/v012_restored/style.css"],
        "warning":"v0.12 is reference game source; later v0.4 mechanics are NOT yet migrated to it"}
(OUT/"RESTORE_REPORT.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"PASS: 11 SHA256-authenticated packs, {len(images)} original sprites, {len(refs)} valid references.")
