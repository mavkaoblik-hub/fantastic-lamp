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
