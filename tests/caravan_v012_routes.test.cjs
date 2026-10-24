'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../game/v012_restored/routes.js');
const initial=()=>({fuel:80,supplies:48,condition:64,metal:210,morale:75});
test('initial map has exactly two valid destinations and no duplicate route IDs',()=>{
 const s=R.normalize(null);
 assert.equal(s.stationId,'popil');
 assert.equal(R.available(s).length,2);
 assert.equal(new Set(R.ROUTES.map(r=>r.id)).size,R.ROUTES.length);
});
test('start charges fuel and supplies exactly once, even on duplicate clicks',()=>{
 const s=R.normalize(null),g=initial();
 assert.equal(R.start(s,g,'popil_mist').ok,true);
 assert.equal(g.fuel,72);assert.equal(g.supplies,43);
 assert.equal(R.start(s,g,'popil_mist').ok,false);
 assert.equal(g.fuel,72);assert.equal(g.supplies,43);
 assert.equal(R.start(s,g,'popil_depot').ok,false);
});
test('insufficient resources or invalid route cannot alter state',()=>{
 const s=R.normalize(null),g={...initial(),fuel:3};
 assert.equal(R.start(s,g,'popil_mist').ok,false);
 assert.equal(s.active,null);assert.equal(g.fuel,3);
 assert.equal(R.start(s,g,'mist_depot').ok,false);
 g.fuel=100;g.condition=0;
 assert.equal(R.start(s,g,'popil_mist').ok,false);
});
test('arrival is atomic and event rewards cannot be repeated',()=>{
 const s=R.normalize(null),g=initial();
 R.start(s,g,'popil_mist');
 let result=null;
 for(let i=0;i<100;i++)result=R.advance(s,g,.25)||result;
 assert.ok(result?.arrived);
 assert.equal(s.stationId,'mist');assert.equal(s.completed,1);assert.equal(s.active,null);
 const saved=JSON.parse(JSON.stringify({s,g}));
 const after=R.advance(s,g,200);
 assert.equal(after,null);
 assert.deepEqual(JSON.parse(JSON.stringify({s,g})),saved);
 assert.equal(s.history.length,1);
});
test('saved mid-trip resumes from elapsed without double resource charge',()=>{
 const s=R.normalize(null),g=initial();
 R.start(s,g,'popil_depot');
 for(let i=0;i<40;i++)R.advance(s,g,.25);
 const n=R.normalize(JSON.parse(JSON.stringify(s)));
 assert.ok(n.active.elapsed>=9.9);
 assert.equal(g.fuel,69);
 for(let i=0;i<100;i++)R.advance(n,g,.25);
 assert.equal(n.stationId,'depot');assert.equal(n.completed,1);
 assert.equal(g.fuel,69);
});
test('station options and seeded arrival events persist across reloads',()=>{
 const g=initial(),s=R.normalize(null);
 R.start(s,g,'popil_mist');
 const snapshot=JSON.parse(JSON.stringify(s));
 const restored=R.normalize(snapshot);
 assert.equal(restored.active.sequence,1);
 for(let n=0;n<24*4;n++)R.advance(restored,g,.25);
 assert.equal(restored.stationId,'mist');
 assert.equal(R.available(restored).every(x=>x.from==='mist'),true);
});
