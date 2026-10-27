'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const LIFE=require('../game/v012_restored/interior_life.js');
const cars=()=>[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}];
const crew=()=>[
 {role:'mechanic',mode:'working',inside:1,job:{target:'center'},progress:.35},
 {role:'medic',mode:'working',inside:1,job:{target:'rear'},progress:.71},
 {role:'guard',mode:'aboard',inside:1,job:null,location:{kind:'locomotive',carId:null}}
];
test('actual working members appear inside correct wagon only',()=>{
 const actors=LIFE.build(crew(),cars());
 assert.equal(actors.length,3);
 assert.equal(actors[0].carId,'c1');assert.equal(actors[0].activity,'repair');
 assert.equal(actors[1].carId,'c2');assert.equal(actors[1].activity,'rest');
 assert.equal(actors[2].location,'locomotive');assert.equal(actors[2].activity,'standby');
});
test('all actors are within safe cutaway bounds and unique room seats',()=>{
 const c=crew();
 c[2]={role:'guard',mode:'working',inside:1,job:{target:'center'}};
 const a=LIFE.build(c,cars());
 assert.equal(a[0].seat,0);
 assert.equal(a[2].seat,1);
 for(const actor of a){
  assert.ok(actor.x>=actor.bounds.x && actor.x+actor.width<=actor.bounds.x+actor.bounds.w);
  assert.ok(actor.y>=actor.bounds.y && actor.y+actor.height<=actor.bounds.y+actor.bounds.h);
 }
});
test('exterior patrol and boarding approach cannot appear in work interiors',()=>{
 const c=crew();c[0].inside=0;c[0].mode='patrol';
 c[1].mode='boarding';c[1].boardingState='approaching';c[1].inside=.7;
 assert.equal(LIFE.build(c,cars()).length,1);
});
test('standby with old job cannot occupy a second wagon or get work status',()=>{
 const c=crew();c[2].job={target:'rear'};
 const actor=LIFE.build(c,cars())[2];
 assert.equal(actor.activity,'standby');
 assert.equal(actor.carId,null);
});
test('actor descriptors do not modify workers, jobs, progress or resources',()=>{
 const c=crew(),w=cars();const before=JSON.stringify({c,w});
 LIFE.build(c,w);LIFE.build(c,w);
 assert.equal(JSON.stringify({c,w}),before);
});
test('after wagon detach, stale assignment never points to vanished car',()=>{
 const c=crew();const w=[cars()[0]];
 const a=LIFE.build(c,w);
 assert.ok(a.every(x=>x.carId===null||w.some(y=>y.id===x.carId)));
});

test('all 14 wagon styles define a unique in-art workstation and readable activity',()=>{
 const names=Object.keys(LIFE.STATIONS);
 assert.equal(names.length,14);
 for(const kind of names){
  const crew=[{role:'mechanic',mode:'working',inside:1,job:{target:'center'}}];
  const wagon=[{id:'c1',kind,level:1}];
  const actor=LIFE.build(crew,wagon)[0];
  assert.ok(actor,kind);
  assert.equal(actor.wagonKind,kind);
  assert.ok(actor.caption.length>=5);
  assert.ok(actor.x>=actor.bounds.x && actor.x+actor.width<=actor.bounds.x+actor.bounds.w);
  assert.ok(actor.y>=actor.bounds.y && actor.y+actor.height<=actor.bounds.y+actor.bounds.h);
  assert.ok(actor.fxX>=actor.bounds.x && actor.fxX<=actor.bounds.x+actor.bounds.w);
  assert.ok(actor.fxY>=actor.bounds.y && actor.fxY<=actor.bounds.y+actor.bounds.h);
 }
});
test('repair, care, watch, rest and standby have distinct deterministic animation',()=>{
 const types=[
  {activity:'repair',frameRate:4.5},{activity:'care',frameRate:2.5},
  {activity:'watch',frameRate:1.65},{activity:'rest',frameRate:1.5},
  {activity:'standby',frameRate:1.4}
 ];
 for(const {activity,frameRate} of types){
  const actor={activity,personIndex:1};
  const a=LIFE.pose(actor,1),b=LIFE.pose(actor,1),c=LIFE.pose(actor,2.1);
  assert.deepEqual(a,b);
  assert.equal(a.frameRate,frameRate);
  assert.ok(Object.values(a).filter(x=>typeof x==='number').every(Number.isFinite));
  assert.ok(Math.abs(a.angle)<=.08);
  assert.ok(Math.abs(a.shiftX)<=2 && Math.abs(a.shiftY)<=2);
  assert.ok(Math.abs(a.stretchY-1)<=.02);
  assert.notDeepEqual(a,c,activity+' must actually animate');
 }
});
test('changing wagon kind updates task description without mutating crew or coins',()=>{
 const c=crew(),wagon=cars(),before=JSON.stringify(c);
 const first=LIFE.build(c,wagon)[0];
 wagon[0].kind='greenhouse';
 const second=LIFE.build(c,wagon)[0];
 assert.equal(first.activity,'repair');
 assert.equal(second.activity,'care');
 assert.notEqual(first.caption,second.caption);
 assert.equal(JSON.stringify(c),before);
});
test('two person workstations remain separated and inside safe cutaway on level 2',()=>{
 const w=[{id:'c1',kind:'medic',level:2}];
 const c=[
  {role:'medic',mode:'working',inside:1,job:{target:'center'}},
  {role:'guard',mode:'working',inside:1,job:{target:'center'}}
 ];
 const a=LIFE.build(c,w);
 assert.equal(a.length,2);
 assert.ok(Math.abs(a[0].x-a[1].x)>40);
 assert.ok(a.every(p=>p.fxX>=p.bounds.x&&p.fxX<=p.bounds.x+p.bounds.w));
});
