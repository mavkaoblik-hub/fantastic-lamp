'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const C=require('../game/v012_restored/camera.js');
test('camera modes and wagon focus preserve their original positions',()=>{
 const train=C.mode('train'),wide=C.mode('wide');
 assert.equal(train.zoom,1);
 assert.ok(wide.zoom<train.zoom);
 for(let i=0;i<3;i++){
  const car=C.focusWagon(i),world=[535,796,1057][i];
  const screen=C.worldToScreen(car,world,394);
  assert.ok(screen.x>0 && screen.x<1200,'Selected wagon stays visible even against the world edge');
  assert.ok(Math.abs(screen.y-302.5)<155);
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
 assert.equal(c.zoom,2.15);
 assert.ok(c.cx>0&&c.cy<605);
 assert.deepEqual(C.mode('unknown'),null);
});
