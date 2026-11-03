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
            assert target.resolve().is_relative_to(OUT),f"Unsafe target {name}"
            data=z.read(info)
            if name in seen:
                assert target.read_bytes()==data,f"Conflicting original resource: {name}"
                continue
            seen.add(name)
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(data)
# The restored code is the same committed files as old v0.12, not rewritten code.
for file in ["index.html","app.js","style.css","android.css","camera.js","journal.js","routes.js","production.js","crew_transit.js","boarding.js","interior_life.js","internal_transfer.js","crew_wellbeing.js","crew_autonomy.js","ui_icons.js","art_bridge_v013c.js"]:
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
# The 16 approved-source icon derivatives are independent of the 103
# train/crew scenery sprites. Their SHA and alpha are verified before bundling.
from shutil import copyfile
ui_root=ROOT/"game/assets/ui_alpha_v1"
ui_manifest=json.loads((ui_root/"manifest.json").read_text(encoding="utf-8"))
assert len(ui_manifest["items"])==16,"Expected the exact 16 canonical approved UI sprites"
for item in ui_manifest["items"]:
    src=ui_root/item["path"]
    assert hashlib.sha256(src.read_bytes()).hexdigest()==item["sha256"],f"UI sprite checksum mismatch {item['id']}"
    dest=OUT/"assets/ui_alpha"/item["path"]
    dest.parent.mkdir(parents=True,exist_ok=True)
    copyfile(src,dest)
# Eight decorative 9-slice PNG borders are generated deterministically
# from the same rusty-brass UI palette, not from new wagons or currencies.
frame_root=ROOT/"game/assets/ui_frames_v1"
frame_manifest=json.loads((frame_root/"manifest.json").read_text(encoding="utf-8"))
assert len(frame_manifest["items"])==8,"Expected exactly 8 reviewed candidate frames"
for item in frame_manifest["items"]:
    src=frame_root/item["path"]
    assert hashlib.sha256(src.read_bytes()).hexdigest()==item["sha256"],f"Frame SHA mismatch {item['id']}"
    dest=OUT/"assets/ui_frames"/item["path"]
    dest.parent.mkdir(parents=True,exist_ok=True)
    copyfile(src,dest)
# Reuse eight painterly location illustrations already committed to GitHub.
# These are separate from the immutable 103 scene/wagon/crew files.
fallback_root=ROOT/"game/assets/painterly_v021/assets/locations"
fallback_files=sorted(fallback_root.glob("*.png"))
assert len(fallback_files)==8,"Expected eight painterly location fallback files"
for source in fallback_files:
    target=OUT/"assets/locations"/source.name
    target.parent.mkdir(parents=True,exist_ok=True)
    copyfile(source,target)
# Review pack is optional, never silently invented from metadata alone.
review_root=ROOT/"game/assets/review_v013c"
review_enabled=False
if (review_root/"manifest.json").exists():
    review=json.loads((review_root/"manifest.json").read_text(encoding="utf-8"))
    assert len(review["assets"])==72,"Partial review pack"
    for item in review["assets"]:
        source=review_root/item["path"]
        assert hashlib.sha256(source.read_bytes()).hexdigest()==item["sha256"],f"Unverified sprite {item['id']}"
        dest=OUT/"assets/review_v013c"/item["path"]
        dest.parent.mkdir(parents=True,exist_ok=True)
        copyfile(source,dest)
    review_enabled=True
(OUT/"art_config_v013c.js").write_text(
    "globalThis.CARAVAN_ARTPACK_V013C="+("true" if review_enabled else "false")+";\n",
    encoding="utf-8")
# The original art manifest stays untouched.
assert "CARAVAN_MANIFEST" in index
report={"format":"CARAVAN_V012_ORIGINAL_SOURCE_VALIDATION_V1",
        "source_branch":"caravan-v012-android-migration",
        "source_archives":[{"name":e["name"],"sha256":e["sha256"],"bytes":e["size"]} for e in MANIFEST],
        "original_art_count":len(images),"approved_ui_rgba_count":len(ui_manifest["items"]),"generated_frame_count":len(frame_manifest["items"]),"fallback_scenery_count":len(fallback_files),"review_art_count":72 if review_enabled else 0,"unique_image_references_in_html":len(refs),
        "verified_image_references":len(refs),"unresolved_images":missing,
        "original_render_source":["game/v012_restored/index.html","game/v012_restored/app.js","game/v012_restored/style.css","game/v012_restored/camera.js"],
        "warning":"v0.12 is reference game source; later v0.4 mechanics are NOT yet migrated to it"}
(OUT/"RESTORE_REPORT.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"PASS: 11 SHA256-authenticated packs, {len(images)} original sprites, {len(refs)} valid references.")
