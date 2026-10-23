'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../web/camera_math.js');
const W=1280;
test('zoom modes have ordered scales and macro fits the whole train',()=>{
  assert.ok(M.MODES.macro<M.MODES.operational&&M.MODES.operational<M.MODES.micro);
  const left=M.centerAt(825,M.MODES.macro,W);
  assert.ok(M.toScreen(300,520,left,M.MODES.macro).x>0);
  assert.ok(M.toScreen(1450,520,left,M.MODES.macro).x<W);
});
test('pinch anchor is stable in world coordinates',()=>{
  const old=M.fromScreen(620,493,165,1,W);
  const z=M.zoomAt(165,1,1.5,620,W);
  const changed=M.fromScreen(620,493,z.left,z.zoom,W);
  assert.ok(Math.abs(old.x-changed.x)<0.001);
  assert.ok(Math.abs(old.y-changed.y)>0);
});
test('pan is bounded, macro recenters instead of showing void',()=>{
  const a=M.pan(165,999999,1.7,W);
  const b=M.pan(165,-999999,1.7,W);
  assert.equal(a,M.LIMITS.worldLeft);
  assert.equal(b,M.LIMITS.worldRight-W/1.7);
  const center=M.bound(12345,0.76,W);
  assert.ok(center<0);
});
test('screen/world projection round trip including zoom',()=>{
  const left=165,z=1.7,position={x:777,y:468};
  const pixel=M.toScreen(position.x,position.y,left,z);
  const world=M.fromScreen(pixel.x,pixel.y,left,z,W);
  assert.ok(Math.abs(world.x-position.x)<0.001);
  assert.ok(Math.abs(world.y-position.y)<0.001);
});
test('clicking polygon wagon works at actual shape not oversized bounding square',()=>{
  const m=[{x:300,w:248},{x:553,w:263},{x:823,w:266}];
  assert.equal(M.wagonAt(430,460,m),0);
  assert.equal(M.wagonAt(750,445,m),1);
  assert.equal(M.wagonAt(930,460,m),2);
  assert.equal(M.wagonAt(150,320,m),-1);
  assert.equal(M.wagonAt(295,360,m),-1);
});
