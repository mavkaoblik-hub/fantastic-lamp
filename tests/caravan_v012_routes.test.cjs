'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../game/v012_restored/routes.js');
const initial=()=>({fuel:80,supplies:48,condition:64,metal:210,morale:75});
function drive(s,g){
 let incident;
 for(let i=0;i<200;i++){
  const res=R.advance(s,g,.25);
  if(res?.pending){incident=res;break;}
 }
 assert.ok(incident?.event);
 return incident;
}
function arrive(s,g){
 let result=null;
 for(let i=0;i<300;i++){
  const res=R.advance(s,g,.25);
  if(res?.pending)throw Error('Unresolved event blocked trip');
  if(res?.arrived){result=res;break;}
 }
 assert.ok(result?.arrived);
 return result;
}
test('map has connected stations and unique IDs',()=>{
 const s=R.normalize(null);
 assert.equal(s.stationId,'popil');
 assert.equal(R.available(s).length,2);
 assert.equal(new Set(R.ROUTES.map(r=>r.id)).size,R.ROUTES.length);
});
test('departure charges exactly once and cannot be duplicated',()=>{
 const s=R.normalize(null),g=initial();
 assert.equal(R.start(s,g,'popil_mist').ok,true);
 assert.equal(g.fuel,72);assert.equal(g.supplies,43);
 assert.equal(R.start(s,g,'popil_mist').ok,false);
 assert.equal(g.fuel,72);assert.equal(g.supplies,43);
 assert.equal(R.start(s,g,'popil_depot').ok,false);
});
test('invalid route or insufficient resources are rejected',()=>{
 const s=R.normalize(null),g={...initial(),fuel:3};
 assert.equal(R.start(s,g,'popil_mist').ok,false);
 assert.equal(s.active,null);
 g.fuel=100;g.condition=0;
 assert.equal(R.start(s,g,'popil_mist').ok,false);
});
test('midroute incident pauses time and survives serialization',()=>{
 const s=R.normalize(null),g=initial();R.start(s,g,'popil_mist');
 const incident=drive(s,g);
 assert.equal(s.active.elapsed,12);
 assert.equal(R.pending(s).id,incident.event.id);
 assert.equal(R.advance(s,g,20).pending,true);
 const restored=R.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(R.pending(restored)?.id,incident.event.id);
 assert.equal(restored.active.elapsed,12);
});
test('a decision modifies resources once, remains unavailable after resolution',()=>{
 const s=R.normalize(null),g=initial();R.start(s,g,'popil_mist');const incident=drive(s,g);
 const opt=incident.event.choices[0];
 const startGame=JSON.parse(JSON.stringify(g));
 const picked=R.choose(s,g,opt.id);
 assert.equal(picked.ok,true);
 assert.equal(R.pending(s),null);
 assert.equal(s.decisions.length,1);
 assert.equal(s.active.eventResolved,true);
 for(const [k,v] of Object.entries(opt.delta)){
  const bound=['condition','morale'].includes(k)?Math.max(0,Math.min(100,startGame[k]+v)):startGame[k]+v;
  assert.equal(g[k],bound);
 }
 const resourceState=JSON.stringify(g);
 assert.equal(R.choose(s,g,opt.id).ok,false);
 assert.equal(JSON.stringify(g),resourceState);
 assert.equal(R.normalize(JSON.parse(JSON.stringify(s))).decisions.length,1);
});
test('unaffordable option cannot consume resources or close encounter',()=>{
 const s=R.normalize(null),g={...initial(),metal:0,fuel:0,supplies:0};
 // Directly form a valid active journey from a saved game for a low-stock encounter.
 s.active={routeId:'popil_mist',from:'popil',to:'mist',elapsed:12,sequence:1,
  eventResolved:false,pendingEventId:null};
 const pending=R.advance(s,g,.25);assert.ok(pending?.pending);
 const expensive=pending.event.choices.find(c=>Object.entries(c.delta)
  .some(([k,v])=>['metal','fuel','supplies'].includes(k)&&v<0));
 if(expensive){
  const before=JSON.stringify(g);
  assert.equal(R.choose(s,g,expensive.id).ok,false);
  assert.equal(JSON.stringify(g),before);
  assert.ok(R.pending(s));
 }
 const free=pending.event.choices.find(c=>Object.entries(c.delta)
  .every(([k,v])=>!['metal','fuel','supplies'].includes(k)||v>=0));
 assert.ok(free);
 assert.equal(R.choose(s,g,free.id).ok,true);
});
test('arrival after a decision is atomic and its event is not repeatable',()=>{
 const s=R.normalize(null),g=initial();R.start(s,g,'popil_mist');
 const pending=drive(s,g);
 assert.equal(R.choose(s,g,pending.event.choices[2].id).ok,true);
 const result=arrive(s,g);
 assert.equal(result.to,'mist');
 assert.equal(s.stationId,'mist');
 assert.equal(s.completed,1);assert.equal(s.history.length,1);assert.equal(s.decisions.length,1);
 const saved=JSON.stringify({s,g});
 assert.equal(R.advance(s,g,100),null);
 assert.equal(JSON.stringify({s,g}),saved);
});
test('saved unfinished trip resumes without another fuel debit',()=>{
 const s=R.normalize(null),g=initial();R.start(s,g,'popil_depot');
 for(let i=0;i<30;i++)R.advance(s,g,.25);
 const restored=R.normalize(JSON.parse(JSON.stringify(s)));
 assert.ok(restored.active?.elapsed>7);
 assert.equal(g.fuel,69);
 const inc=drive(restored,g);
 const fallback=inc.event.choices.find(o=>Object.entries(o.delta)
 .every(([k,v])=>!['metal','fuel','supplies'].includes(k)||v>=0));
 assert.equal(R.choose(restored,g,fallback.id).ok,true);
 arrive(restored,g);
 assert.equal(restored.stationId,'depot');assert.equal(g.fuel,69);
 assert.equal(R.available(restored).every(r=>r.from==='depot'),true);
});
test('saved v1 active trips migrate safely to midpoint decision',()=>{
 const s=R.normalize({version:1,stationId:'popil',completed:0,
 active:{routeId:'popil_mist',from:'popil',to:'mist',elapsed:18,sequence:1}});
 assert.equal(s.active.eventResolved,false);
 assert.equal(R.advance(s,initial(),.25).pending,true);
 assert.equal(s.active.elapsed,12);
});
