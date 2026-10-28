'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const W=require('../game/v012_restored/crew_wellbeing.js');
const P=require('../game/v012_restored/production.js');
const T=require('../game/v012_restored/internal_transfer.js');
const cars=()=>[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}];
const worker=()=>({role:'mechanic',mode:'working',inside:1,job:{target:'center'},
 location:{kind:'wagon',carId:'c1'},fatigue:0,queue:[],progress:0});
test('old saves and invalid fatigue normalize without resetting other fields',()=>{
 const c=[{mode:'aboard',done:4},{fatigue:NaN},{fatigue:250},{fatigue:-50}];
 assert.equal(W.normalizeAll(c),true);
 assert.deepEqual(c.map(p=>p.fatigue),[0,0,100,0]);assert.equal(c[0].done,4);
 assert.equal(W.normalizeAll(c),false);assert.equal(W.efficiency({fatigue:100}),.55);
});
test('working tires, quarters recover, onboard standby recovers',()=>{
 const c=cars(),p=worker();
 for(let i=0;i<180;i++)W.advance([p],c,1);
 assert.ok(p.fatigue>25&&p.fatigue<26);
 p.job={target:'rear'};p.location={kind:'wagon',carId:'c2'};
 assert.equal(W.inRestWagon(p,c),true);
 for(let i=0;i<80;i++)W.advance([p],c,1);
 assert.equal(p.fatigue,0);
 p.mode='aboard';p.job=null;p.fatigue=12;
 for(let i=0;i<25;i++)W.advance([p],c,1);
 assert.ok(p.fatigue<12);assert.equal(p.inside,1);
});
test('fatigue slows production but cannot grant rewards without collection',()=>{
 const c=cars(),rested=[worker()],tired=[{...worker(),fatigue:100}];
 const fast=P.normalize(null,c),slow=P.normalize(null,c);
 for(let i=0;i<25;i++){P.advance(fast,c,rested,1,75);P.advance(slow,c,tired,1,75);}
 assert.ok(fast.rows.c1.progress>slow.rows.c1.progress);
 const g={metal:10,fuel:20,supplies:30,morale:80,condition:75};
 assert.equal(P.collect(slow,g,c[0]),null);
 for(let i=0;i<150;i++)P.advance(slow,c,tired,1,75);
 assert.ok(P.collect(slow,g,c[0]).amount>0);
 assert.equal(P.collect(slow,g,c[0]),null);
});
test('D5 transfer preserves fatigue and never puts personnel on platform',()=>{
 const c=cars(),p=worker();p.fatigue=54;
 const crew=[p,{role:'medic',mode:'aboard',inside:1,job:null,
  location:{kind:'locomotive',carId:null},fatigue:0,queue:[]}];
 assert.equal(T.start(crew,c,0,'rear').ok,true);
 for(let i=0;i<3;i++){T.advance(crew,c,.5);W.advance(crew,c,.5);}
 assert.equal(p.fatigue,54);assert.equal(p.mode,'transferring');
 assert.notEqual(p.location.kind,'platform');
 const restored=JSON.parse(JSON.stringify(crew));
 assert.equal(W.normalizeAll(restored),false);assert.equal(restored[0].fatigue,54);
 for(let i=0;i<12;i++)T.advance(restored,c,.5);
 assert.equal(restored[0].job.target,'rear');
 W.advance(restored,c,1);assert.ok(restored[0].fatigue<54);
});
test('simulation steps bounded at 1 second and fatigue stays within 0..100',()=>{
 const p=worker(),c=cars();p.fatigue=99.9;W.advance([p],c,10000);
 assert.ok(p.fatigue<=100);p.mode='aboard';p.fatigue=.01;
 W.advance([p],c,10000);assert.equal(p.fatigue,0);
 assert.equal(W.advance([p],c,-1),false);
});
