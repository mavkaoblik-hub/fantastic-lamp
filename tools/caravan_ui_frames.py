#!/usr/bin/env python3
"""Generate 8 reusable, genuinely alpha UI border textures.

A decorative UI frame is not a train/wagon sprite. Preserve artist-approved
original locomotive and historical atlas files unchanged. Deterministic output.
"""
from PIL import Image,ImageDraw
from pathlib import Path
from hashlib import sha256
import argparse,json,random
FRAMES=[
 ('hud_resource_slot',(177,126,72)),
 ('sidebar_frame',(146,115,73)),
 ('journal_card',(177,119,68)),
 ('route_card',(151,119,75)),
 ('incident_frame',(199,96,54)),
 ('wagon_context_frame',(174,127,77)),
 ('progress_track',(162,131,77)),
 ('status_warning_overlay',(194,77,52))
]
def generate(target):
 target.mkdir(parents=True,exist_ok=True)
 rows=[]
 for name,color in FRAMES:
  width,height=480,240
  rnd=random.Random(name)
  image=Image.new('RGBA',(width,height),(0,0,0,0))
  pixels=image.load()
  for y in range(height):
   for x in range(width):
    d=min(x,y,width-1-x,height-1-y)
    if d>35 or x<3 or y<3 or x>width-4 or y>height-4:continue
    n=rnd.randrange(-15,16);k=.74+d/150
    red=max(0,min(255,int((46+n)*k)))
    green=max(0,min(255,int((52+n*.65)*k)))
    blue=max(0,min(255,int((53+n*.35)*k)))
    if d<7:red,green,blue=int(color[0]*.42),int(color[1]*.43),int(color[2]*.45)
    pixels[x,y]=(red,green,blue,243)
  draw=ImageDraw.Draw(image)
  for inset,rgba in [
    (3,(48,35,27,220)),(5,(*color,255)),(9,(240,182,100,140)),
    (12,(18,25,28,180)),(29,(42,48,49,255)),
    (32,(*color,185)),(35,(20,30,32,160))]:
   draw.rounded_rectangle((inset,inset,width-1-inset,height-1-inset),
     radius=max(1,17-inset//2),outline=rgba,width=2 if inset in (5,32) else 1)
  for x,y in [(16,16),(width-17,16),(16,height-17),(width-17,height-17)]:
   draw.ellipse((x-6,y-6,x+6,y+6),fill=(13,18,23,255),outline=(*color,255),width=2)
   draw.line((x-3,y+2,x+3,y-2),fill=(182,173,144,255),width=2)
  for i in range(50):
   x=rnd.randint(15,width-15);y=rnd.randint(15,height-15)
   if min(x,y,width-1-x,height-1-y)>28:continue
   draw.line((x,y,x+rnd.randint(1,6),y-rnd.randint(0,2)),
             fill=(122,99,75,rnd.randint(40,110)),width=1)
  out=target/(name+'.png')
  image.save(out,optimize=True)
  assert image.mode=='RGBA' and image.getpixel((width//2,height//2))[3]==0
  rows.append({'id':'frame.'+name,'path':out.name,'sha256':sha256(out.read_bytes()).hexdigest(),
               'nine_slice_source':[36,36,36,36],
               'width':width,'height':height,'status':'design_candidate'})
 (target/'manifest.json').write_text(json.dumps({'format':'CARAVAN_UI_FRAMES_V1','items':rows,
  'no_existing_art_replaced':True,'approval_state':'pending_visual_review'},indent=2)+'\n')
 print('PASS: 8 transparent source-independent dieselpunk UI border designs')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--out',default='build/caravan_ui_frames')
 generate(Path(p.parse_args().out))
