#!/usr/bin/env python3
"""Caravan v0.12 approved crop -> honest, inspected alpha RGBA icon candidates.

Original approved atlases/crops remain byte-for-byte untouched. The output is
reviewable art for the painterly v0.12 HUD, not an alternate visual style.
"""
import argparse, hashlib, io, json
from collections import defaultdict
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"game/assets/catalog/crops_v1/manifest.json"
SELECTED = (
    "ui.tasks_open","ui.map","ui.crew","ui.inventory","ui.upgrade",
    "ui.workshop","ui.movement","ui.stop","ui.confirm","ui.cancel",
    "ui.information","ui.warning",
    "resource.metal","resource.fuel","resource.food","status.morale"
)
# Original crops include label strips. Exclude them explicitly from the
# segmentation area rather than turning them into small, illegible icons.
ROI={
 "ui.tasks_open":(15,6,204,119),
 "ui.map":(16,6,207,121),
 "ui.crew":(12,6,210,123),
 "ui.inventory":(13,6,210,121),
 "ui.upgrade":(18,6,204,122),
 "ui.workshop":(12,6,210,123),
 "ui.movement":(15,6,207,120),
 "ui.stop":(15,6,207,121),
 "ui.confirm":(15,6,208,120),
 "ui.cancel":(15,6,208,121),
 "ui.information":(15,6,207,121),
 "ui.warning":(15,6,207,121),
 "resource.metal":(9,7,134,137),
 "resource.fuel":(10,7,137,143),
 "resource.food":(8,5,132,147),
 "status.morale":(12,7,138,139),
}
def extract(image, semantic_id):
    im=np.asarray(image.convert("RGB"))
    height,width=im.shape[:2]
    left,top,right,bottom=ROI[semantic_id]
    left=max(1,min(width-3,left));right=max(left+3,min(width-1,right))
    top=max(1,min(height-3,top));bottom=max(top+3,min(height-1,bottom))
    # A conservative foreground estimate from the central art. Source label
    # is strictly outside ROI and cannot bleed into the exported icon.
    bgr=cv2.cvtColor(im,cv2.COLOR_RGB2BGR)
    mask=np.full((height,width),cv2.GC_BGD,dtype=np.uint8)
    mask[top:bottom,left:right]=cv2.GC_PR_FGD
    # Light/brass and rich art areas are strong foreground seeds, avoiding
    # forcing a rectangular centre to show as a filled background.
    hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV)
    bright=(hsv[:,:,2]>85)&(hsv[:,:,1]>52)
    yy,xx=np.ogrid[:height,:width]
    core=(xx>left+8)&(xx<right-8)&(yy>top+5)&(yy<bottom-5)
    mask[core&bright]=cv2.GC_FGD
    if (mask==cv2.GC_FGD).sum()<30:
        mask[int(top+.38*(bottom-top)):int(top+.58*(bottom-top)),
             int(left+.38*(right-left)):int(left+.58*(right-left))]=cv2.GC_FGD
    bg=np.zeros((1,65),np.float64)
    fg=np.zeros((1,65),np.float64)
    cv2.grabCut(bgr,mask,None,bg,fg,5,cv2.GC_INIT_WITH_MASK)
    alpha=np.where(np.logical_or(mask==cv2.GC_FGD,mask==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    # Remove tiny floating background artifacts.
    n,labels,stats,_=cv2.connectedComponentsWithStats(alpha,8)
    regions=sorted([(int(stats[i,cv2.CC_STAT_AREA]),i) for i in range(1,n)],reverse=True)
    keep={x[1] for x in regions[:3] if x[0]>=max(45,regions[0][0]*.09)} if regions else set()
    alpha=np.where(np.isin(labels,list(keep)),255,0).astype(np.uint8)
    alpha=cv2.GaussianBlur(alpha,(3,3),.62)
    alpha[:top,:]=0;alpha[bottom:,:]=0
    alpha[:,:left]=0;alpha[:,right:]=0
    rgba=np.dstack((im,alpha))
    bbox=Image.fromarray(alpha).getbbox()
    if bbox is None:raise ValueError(f"No foreground detected: {semantic_id}")
    isolated=Image.fromarray(rgba,"RGBA").crop(bbox)
    if min(isolated.size)<12:raise ValueError(f"Unreasonable foreground size: {semantic_id}: {isolated.size}")
    # Multipoint downscaling is higher quality than stretching a crop; allow
    # transparent padding to preserve original painted aspect ratio.
    result=Image.new("RGBA",(128,128),(0,0,0,0))
    isolated.thumbnail((112,112),Image.Resampling.LANCZOS)
    result.alpha_composite(isolated,((128-isolated.width)//2,(128-isolated.height)//2))
    # A few short golden base lines belong to the source atlas's card border,
    # not to the actual icon. They appear as anomalously wide late rows.
    trim_lines={"ui.stop":93,"ui.confirm":97,"ui.cancel":91,
                "ui.information":94,"ui.warning":94}
    if semantic_id in trim_lines:
        pixels=np.array(result)
        pixels[trim_lines[semantic_id]:,:,3]=0
        result=Image.fromarray(pixels,"RGBA")
    return result, bbox
def run(target:Path):
    source=json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id={item["id"]:item for item in source["items"]}
    target.mkdir(parents=True,exist_ok=True)
    report={"format":"CARAVAN_APPROVED_ALPHA_ICONS_V1","source":str(MANIFEST.relative_to(ROOT)),
            "not_reinvented":True,"requires_art_direction_review":True,
            "output":"RGBA 128x128","items":[]}
    for sid in SELECTED:
        item=by_id[sid]
        path=ROOT/item["file"]
        blob=path.read_bytes()
        assert hashlib.sha256(blob).hexdigest()==item["sha256"],f"Crop source altered {sid}"
        with Image.open(io.BytesIO(blob)) as im:
            im.load()
            rgba,bbox=extract(im,sid)
        sub=target/item["group"];sub.mkdir(parents=True,exist_ok=True)
        out=sub/(path.stem+".png")
        rgba.save(out,optimize=True)
        pixels=np.asarray(rgba)[:,:,3]
        count=int(np.count_nonzero(pixels>20))
        assert 1800<count<128*128*.83,f"Suspicious foreground occupancy {sid}: {count}"
        assert np.any(pixels==0),f"Not genuinely transparent {sid}"
        report["items"].append({"id":sid,"path":str(out.relative_to(target)),
                 "source_sha256":item["sha256"],"sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
                 "bbox_source":list(bbox),"foreground_pixels":count,
                 "transparent_pixels":int(np.count_nonzero(pixels==0)),"width":128,"height":128})
    # Simple neutral QA proof sheet; final accept/reject by inspection, not
    # merely successful hash/compression. Checkerboard shows actual alpha.
    sheet=Image.new("RGB",(4*210,4*220),(22,26,28))
    draw=ImageDraw.Draw(sheet)
    for idx,item in enumerate(report["items"]):
        col,row=idx%4,idx//4;x=col*210+18;y=row*220+12
        for cy in range(8):
            for cx in range(8):
                fill=(55,61,65) if (cx+cy)%2 else (95,101,105)
                draw.rectangle((x+cx*16,y+cy*16,x+(cx+1)*16-1,y+(cy+1)*16-1),fill=fill)
        with Image.open(target/item["path"]) as im:sheet.paste(im,(x,y),im)
        draw.text((x,y+144),item["id"],fill=(238,219,184))
    sheet.save(target/"CONTACT_SHEET.png")
    (target/"manifest.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"PASS: {len(report['items'])} derived RGBA icons from checksum-locked approved source crops; human QA still required")
if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",default="build/caravan_alpha_v1")
    opt=parser.parse_args()
    run(Path(opt.out).resolve())
