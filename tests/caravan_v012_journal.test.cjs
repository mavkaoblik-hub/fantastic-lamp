'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const J=require('../game/v012_restored/journal.js');
function game(){return {cars:[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}],locoLevel:1,metal:30,supplies:12,fuel:30,morale:98};}
const emptyCrew=()=>[{done:0},{done:0},{done:0}];
test('new and historic save normalizes without losing valid claims',()=>{
 const j=J.normalize({claimed:['crew_first_job','invalid','crew_first_job','loco_upgrade']});
 assert.deepEqual(j.claimed,['crew_first_job','loco_upgrade']);
 assert.deepEqual(J.normalize(null),{version:1,claimed:[]});
});
test('progress derives from actual old v0.12 counters, no duplicated gameplay model',()=>{
 const g=game(),crew=emptyCrew(),j=J.normalize();
 assert.ok(J.status(j,g,crew).every(x=>x.status==='active'));
 crew[2].done=1;g.cars[0].level=2;g.cars.push({id:'c3',kind:'salvage',level:1});g.locoLevel=2;
 assert.ok(J.status(j,g,crew).every(x=>x.status==='ready'));
});
test('each reward can be claimed once and survives serialization',()=>{
 const g=game(),c=emptyCrew(),j=J.normalize();
 c[0].done=1;
 assert.equal(J.claim(j,g,c,'crew_first_job').supplies,8);
 assert.equal(g.supplies,20);
 assert.equal(J.claim(j,g,c,'crew_first_job'),null);
 const roundtrip=J.normalize(JSON.parse(JSON.stringify(j)));
 assert.equal(J.status(roundtrip,g,c)[0].status,'claimed');
});
test('reward fields are capped where necessary; invalid or early claims denied',()=>{
 const g=game(),c=emptyCrew(),j=J.normalize();
 assert.equal(J.claim(j,g,c,'loco_upgrade'),null);
 g.locoLevel=2;
 assert.equal(J.claim(j,g,c,'loco_upgrade').morale,8);
 assert.equal(g.morale,100);
 assert.equal(J.claim(j,g,c,'unknown'),null);
 assert.equal(j.claimed.length,1);
});
