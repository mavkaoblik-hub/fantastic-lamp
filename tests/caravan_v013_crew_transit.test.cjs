'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../game/v012_restored/crew_transit.js');
const cars=()=>[{id:'c1',kind:'workshop'},{id:'c2',kind:'quarters'}];
const crew=()=>[
 {mode:'patrol',x:480,inside:0,job:null,done:0,progress:0},
 {mode:'walking',x:610,inside:0,job:{target:'rear'},done:2,progress:.4},
 {mode:'exiting',x:295,inside:.5,job:{target:'engine'},done:1,progress:.7}
];
test('the whole crew is aboard during active trips regardless of previous animations',()=>{
 const c=crew(),result=T.synchronize(c,cars(),true);
 assert.equal(result.aboard,3);
 assert.ok(c.every(p=>p.inside===1 && p.location.kind!=='platform'));
 assert.deepEqual(c.map(x=>x.mode),['aboard','working','working']);
 assert.equal(c[1].location.carId,'c2');
 assert.equal(c[2].location.kind,'locomotive');
 assert.equal(c[1].done,2);assert.equal(c[1].progress,.4);
 assert.equal(c[0].job,null);
});
test('paused and pending event phases always count as on-route',()=>{
 const c=crew();
 T.synchronize(c,cars(),true);
 assert.equal(T.phase(true,false,true),'PAUSED_EVENT');
 assert.equal(T.phase(true,false,false),'PAUSED_MANUAL');
 assert.equal(T.phase(true,true,false),'TRAVELLING');
 assert.ok(c.every(p=>!T.renderableOutside(p,true)));
});
test('idempotence: repeated updates do not change crew, jobs or rewards',()=>{
 const c=crew();
 const first=T.synchronize(c,cars(),true);
 const snapshot=JSON.stringify(c);
 const second=T.synchronize(c,cars(),true);
 assert.equal(first.changed,true);assert.equal(second.changed,false);
 assert.equal(JSON.stringify(c),snapshot);
});
test('arrival disembarks standby only, working employees remain assigned',()=>{
 const c=crew();T.synchronize(c,cars(),true);
 const arrived=T.synchronize(c,cars(),false);
 assert.equal(arrived.changed,true);
 assert.equal(c[0].mode,'patrol');assert.equal(c[0].location.kind,'platform');
 assert.equal(c[1].mode,'working');assert.equal(c[1].job.target,'rear');
 assert.equal(c[2].mode,'working');assert.equal(c[2].job.target,'engine');
});
test('save migration sends exterior patrol in an old active trip to a safe carriage',()=>{
 const old=crew();old[1].job={target:'tail'}; // invalid: no third wagon
 const state=JSON.parse(JSON.stringify(old));
 const result=T.synchronize(state,cars(),true);
 assert.equal(result.aboard,3);
 assert.equal(state[1].job,null);
 assert.equal(state[1].mode,'aboard');
 assert.equal(state[1].location.carId,null);
});
test('without active trip, exterior crew remain visible',()=>{
 const c=crew();const result=T.synchronize(c,cars(),false);
 assert.equal(c[0].mode,'patrol');
 assert.equal(result.aboard,0);
 assert.ok(T.renderableOutside(c[0],false));
});
