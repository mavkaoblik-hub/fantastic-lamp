'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const A=require('../game/v012_restored/crew_autonomy.js');
const T=require('../game/v012_restored/internal_transfer.js');
const W=require('../game/v012_restored/crew_wellbeing.js');
const P=require('../game/v012_restored/production.js');
const C=require('../game/v012_restored/crew_transit.js');
const L=require('../game/v012_restored/interior_life.js');
const cars=()=>[{id:'c1',kind:'workshop',level:1},
 {id:'c2',kind:'quarters',level:1},{id:'c3',kind:'kitchen',level:1}];
const worker=(target='center')=>({
 role:'mechanic',mode:'working',job:{target},
 inside:1,boardingState:'aboard',
 location:{kind:'wagon',carId:target==='center'?'c1':'c2'},
 fatigue:0,loneliness:20,autoCooldown:0,experience:3,queue:[],progress:0,done:0,x:518
});
const tick=(crew,cars,n,opts={active:true,moving:true})=>{
 let events=[];
 for(let i=0;i<n;i++){const a=A.advance(crew,cars,1,opts);events.push(...a.events);
 C.synchronize(crew,cars,opts.active);}
 return events;
};
test('autonomy does not start at station, during boarding, or when no need',()=>{
 const c=cars(),p=worker(),crew=[p];
 tick(crew,c,15,{active:false,moving:false});
 assert.equal(p.autoActivity,null||undefined);
 assert.equal(p.job.target,'center');
 tick(crew,c,10,{active:true,moving:false,boarding:true});
 assert.equal(p.autoActivity,null||undefined);
 tick(crew,c,20);
 assert.equal(p.autoActivity,null||undefined);
 assert.equal(p.mode,'working');
});
test('tired worker temporarily leaves work, reserves berth, returns without wages',()=>{
 const c=cars(),p=worker(),crew=[p];
 p.fatigue=57;p.loneliness=3;const oldXP=p.experience;
 const g={metal:9,fuel:20,supplies:10,morale:80,condition:60};
 const production=P.normalize(null,c);
 const events=tick(crew,c,1);
 assert.equal(events[0].kind,'rest');
 assert.equal(p.autoActivity.kind,'rest');
 assert.equal(p.job,null);
 assert.equal(T.occupancy(crew,c,'rear'),1);
 assert.equal(P.activeWorkers(c,crew,0).length,0);
 const previous=p.fatigue;
 for(let k=0;k<10;k++){
  tick(crew,c,1);W.advance(crew,c,1);
  P.advance(production,c,crew,1,70);
 }
 assert.ok(p.fatigue<previous,'Rest actually reduces fatigue');
 assert.equal(p.inside,1);assert.notEqual(p.location.kind,'platform');
 assert.equal(g.metal,9);assert.equal(p.experience,oldXP);
 tick(crew,c,30);
 assert.equal(p.autoActivity,null);
 assert.equal(p.job.target,'center');
 assert.equal(p.mode,'working');
 assert.equal(p.inside,1);
 assert.equal(p.location.carId,'c1');
 assert.equal(p.autoCooldown>0,true);
});
test('loneliness causes social visits; no artificial work or extra reward',()=>{
 const c=cars(),p=worker(),partner=worker('rear');partner.mode='resting';partner.job.duty='rest';
 const crew=[p,partner];p.loneliness=80;p.fatigue=0;
 tick(crew,c,1);
 assert.equal(p.autoActivity.kind,'social');
 assert.equal(p.autoActivity.toId,'c2');
 tick(crew,c,5);
 assert.equal(p.location.carId,'c2');
 assert.equal(L.describe(p,0,c).activity,'social');
 const startLonely=p.loneliness;
 tick(crew,c,6);
 assert.ok(p.loneliness<startLonely);
 assert.equal(p.job,null);
 assert.equal(p.inside,1);
 tick(crew,c,20);
 assert.equal(p.job.target,'center');
 assert.equal(p.autoActivity,null);
 assert.equal(partner.mode,'resting');
});
test('kitchen is a dining destination when no partner is available',()=>{
 const c=cars(),p=worker(),crew=[p];p.loneliness=78;
 tick(crew,c,1);
 assert.equal(p.autoActivity.kind,'dining');
 assert.equal(p.autoActivity.toId,'c3');
 tick(crew,c,7);
 assert.equal(p.location.carId,'c3');
 assert.equal(L.describe(p,0,c).activity,'care');
 tick(crew,c,25);
 assert.equal(p.mode,'working');
 assert.equal(p.job.target,'center');
});
test('save/load resumes mid-visit and pause never exposes outside crew',()=>{
 const c=cars(),p=worker(),crew=[p];p.loneliness=80;
 tick(crew,c,3);
 const resumed=JSON.parse(JSON.stringify(crew));
 assert.equal(A.normalize(resumed,c,true),true);
 for(let i=0;i<10;i++){
  tick(resumed,c,1,{active:true,moving:false});
  assert.equal(resumed[0].inside,1);
  assert.notEqual(resumed[0].location.kind,'platform');
 }
 tick(resumed,c,25);
 assert.equal(resumed[0].job.target,'center');
 assert.equal(resumed[0].autoActivity,null);
});
test('corrupt saved destination returns safe standby without ghost production',()=>{
 const c=cars(),p=worker(),crew=[p];
 p.loneliness=80;tick(crew,c,1);
 p.autoActivity.toId='missing';
 assert.equal(A.normalize(crew,c,true),true);
 assert.equal(p.autoActivity,null);
 assert.equal(p.job,null);assert.equal(p.mode,'aboard');
 assert.equal(p.location.kind,'locomotive');
 assert.equal(P.activeWorkers(c,crew,0).length,0);
});
test('work assignments cannot collide on home return; employee remains aboard',()=>{
 const c=cars(),p=worker(),crew=[p];
 p.fatigue=55;tick(crew,c,1);
 const newWorker=worker();newWorker.fatigue=0;
 crew.push(newWorker);
 tick(crew,c,30);
 assert.equal(p.autoActivity,null);
 assert.equal(p.job,null,'When home workstation is full, do not duplicate active worker');
 assert.equal(p.mode,'aboard');assert.equal(p.inside,1);
 assert.equal(newWorker.job.target,'center');
});
test('rest berth is shared with manual D5 transfers and fully capacity-bounded',()=>{
 const c=cars(),p=worker(),idle=worker();idle.job=null;idle.mode='aboard';
 idle.location={kind:'locomotive',carId:null};const crew=[p,idle];
 p.fatigue=50;tick(crew,c,1);
 assert.equal(T.start(crew,c,1,'rear',{duty:'rest'}).reason,'full');
 c[1].level=2;
 assert.equal(T.start(crew,c,1,'rear',{duty:'rest'}).ok,true);
 assert.equal(T.occupancy(crew,c,'rear'),2);
});
