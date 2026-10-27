'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const P=require('../game/v012_restored/production.js');
const g=()=>({metal:100,fuel:60,supplies:30,morale:78,condition:65});
const cars=()=>[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}];
const workers=()=>[{role:'mechanic',mode:'working',job:{target:'center'},done:0},
 {role:'medic',mode:'patrol',job:null,done:0},
 {role:'guard',mode:'patrol',job:null,done:0}];
test('production never pays automatically and never runs with no assigned worker',()=>{
 const c=cars(),state=g(),p=P.normalize(null,c),crew=workers();
 crew[0].mode='patrol';crew[0].job=null;
 for(let i=0;i<300;i++)P.advance(p,c,crew,1,state.morale);
 assert.equal(p.rows.c1.ready,0);
 assert.equal(state.metal,100);
});
test('one assigned worker fills exactly two batches then stops',()=>{
 const c=cars(),p=P.normalize(null,c),crew=workers(),state=g();
 for(let i=0;i<240;i++)P.advance(p,c,crew,1,state.morale);
 assert.equal(p.rows.c1.ready,2);
 assert.equal(p.rows.c1.progress,0);
 assert.equal(state.metal,100);
});
test('claim is atomic, applies one resource and cannot repeat on reload',()=>{
 const c=cars(),p=P.normalize(null,c),crew=workers(),state=g();
 for(let i=0;i<200;i++)P.advance(p,c,crew,1,state.morale);
 const reward=P.collect(p,state,c[0]);
 assert.equal(reward.batches,2);
 assert.equal(reward.amount,12);
 assert.equal(state.metal,112);
 assert.equal(P.collect(p,state,c[0]),null);
 const restored=P.normalize(JSON.parse(JSON.stringify(p)),c);
 assert.equal(P.collect(restored,state,c[0]),null);
 assert.equal(restored.rows.c1.collected,1);
});
test('workers are unique and level 2 has two staffed places and enhanced output',()=>{
 const c=cars(),p=P.normalize(null,c),crew=workers(),state=g();
 crew[1].job={target:'center'};crew[1].mode='working';
 assert.equal(P.assigned(c,crew,0).length,1);
 c[0].level=2;
 assert.equal(P.assigned(c,crew,0).length,2);
 for(let i=0;i<200;i++)P.advance(p,c,crew,1,state.morale);
 const claim=P.collect(p,state,c[0]);
 assert.equal(claim.amount,24);
});
test('changing wagon kind invalidates unclaimed stock; detached cars are discarded',()=>{
 let c=cars(),p=P.normalize(null,c),crew=workers();
 for(let i=0;i<200;i++)P.advance(p,c,crew,1,80);
 assert.equal(p.rows.c1.ready,2);
 c[0].kind='greenhouse';
 p=P.normalize(p,c);
 assert.equal(p.rows.c1.ready,0);
 assert.equal(p.rows.c1.kind,'greenhouse');
 c=[c[0]];
 p=P.normalize(p,c);
 assert.equal(Object.keys(p.rows).length,1);
});
test('restoration is bounded and never accepts fabricated ready values',()=>{
 const c=cars();
 const p=P.normalize({rows:{c1:{kind:'workshop',ready:999,progress:Infinity,completed:-1,collected:NaN},
                              ghost:{kind:'salvage',ready:2}}},c);
 assert.equal(p.rows.c1.ready,2);
 assert.equal(p.rows.c1.progress,0);
 assert.equal(p.rows.c1.completed,0);
 assert.equal(p.rows.ghost,undefined);
});
test('medical production respects 100 cap and collects only once',()=>{
 const c=[{id:'c1',kind:'medic',level:1}],crew=[{role:'medic',mode:'working',job:{target:'center'}}];
 const p=P.normalize(null,c),state={...g(),condition:99};
 for(let i=0;i<150;i++)P.advance(p,c,crew,1,80);
 const r=P.collect(p,state,c[0]);
 assert.equal(r.amount,1);
 assert.equal(state.condition,100);
 assert.equal(P.collect(p,state,c[0]),null);
});
