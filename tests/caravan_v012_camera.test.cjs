'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const C=require('../game/v012_restored/camera.js');
test('Android wagon focus fits both dimensions of the real visible viewport',()=>{
 for(const view of [{width:1200,height:330},{width:1200,height:520},{width:1200,height:760}]){
  for(let i=0;i<3;i++){
   const camera=C.focusWagon(i,view);
   assert.ok(C.WAGON.height*camera.zoom<=view.height*.83);
   assert.ok(C.WAGON.width*camera.zoom<=view.width*.89);
   const center=C.worldToScreen(camera,[535,796,1057][i],C.WAGON.centerY);
   assert.ok(center.x-C.WAGON.width*camera.zoom/2>=0);
   assert.ok(center.x+C.WAGON.width*camera.zoom/2<=1200);
  }
 }
});
test('camera modes and wagon focus preserve their original positions',()=>{
 const train=C.mode('train'),wide=C.mode('wide');
 assert.equal(train.zoom,1);
 assert.ok(wide.zoom<train.zoom);
 for(let i=0;i<3;i++){
  const car=C.focusWagon(i),world=[535,796,1057][i];
  const screen=C.worldToScreen(car,world,394);
  assert.ok(screen.x>0 && screen.x<1200,'Selected wagon stays visible even against the world edge');
  assert.ok(Math.abs(screen.y-302.5)<155);
  assert.ok(car.zoom>3.2,'A selected wagon should fill nearly all scene height');
  const wagonPixelHeight=C.WAGON.height*car.zoom;
  assert.ok(wagonPixelHeight>605*.85 && wagonPixelHeight<605*.95);
 }
});
test('pinch zoom anchors the same source-art pixel and limits drag',()=>{
 const before=C.mode('train');
 const origin=C.screenToWorld(before,515,330);
 const z=C.zoomAt(before,1.75,515,330);
 const after=C.screenToWorld(z,515,330);
 assert.ok(Math.abs(origin.x-after.x)<.001);
 assert.ok(Math.abs(origin.y-after.y)<.001);
 const moved=C.pan(z,1e6,-1e6);
 assert.ok(moved.cx>=1200/(2*moved.zoom));
 assert.ok(moved.cy<=605-605/(2*moved.zoom));
});
test('world-to-screen and screen-to-world are inverse after focus/pan',()=>{
 const current=C.pan(C.focusWagon(2),-140,25);
 const coord=C.worldToScreen(current,1057,410);
 const back=C.screenToWorld(current,coord.x,coord.y);
 assert.ok(Math.abs(back.x-1057)<.001);
 assert.ok(Math.abs(back.y-410)<.001);
});
test('camera remains finite after missing or invalid data',()=>{
 const c=C.bound({zoom:99,cx:-5000,cy:5000});
 assert.equal(c.zoom,C.MAX_ZOOM);
 assert.ok(c.cx>0&&c.cy<605);
 assert.deepEqual(C.mode('unknown'),null);
});

test('two-finger pinch zooms in/out around the original world anchor without drift',()=>{
 const base=C.mode('train');
 const a={x:495,y:290},b={x:705,y:290};
 const endA={x:395,y:290},endB={x:805,y:290};
 const before=C.screenToWorld(base,600,290);
 const enlarged=C.pinch(base,a,b,endA,endB);
 assert.ok(enlarged.zoom>1.9);
 const after=C.screenToWorld(enlarged,600,290);
 assert.ok(Math.abs(before.x-after.x)<1e-5);
 assert.ok(Math.abs(before.y-after.y)<1e-5);
 const smaller=C.pinch(enlarged,endA,endB,a,b);
 assert.ok(Math.abs(smaller.zoom-1)<1e-5);
 const translated=C.pinch(base,a,b,{x:415,y:310},{x:825,y:310});
 const anchor=C.screenToWorld(translated,620,310);
 assert.ok(Math.abs(anchor.x-before.x)<1e-5);
 assert.ok(Math.abs(anchor.y-before.y)<1e-5);
 const capped=C.pinch(base,a,b,{x:0,y:290},{x:1200,y:290});
 assert.equal(capped.zoom,C.MAX_ZOOM);
});
