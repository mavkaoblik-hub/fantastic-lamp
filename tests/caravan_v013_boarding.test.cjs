'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../game/v012_restored/boarding.js');
const cars=()=>[{id:'c1'},{id:'c2'}];
const roster=()=>[
 {mode:'patrol',x:480,inside:0,progress:0,done:0,job:null,queue:[]},
 {mode:'working',x:777,inside:1,progress:.4,done:2,job:{target:'rear'},queue:[]},
 {mode:'walking',x:1000,inside:0,progress:0,done:1,job:null,queue:[]}
];
function finish(state,crew,cars){
 let result;for(let i=0;i<500;i++){result=B.tick(state,crew,cars,.05);if(result.done)break;}
 return result;
}
test('boarding is not a paid route, walks outside only while stationary and ends with all aboard',()=>{
 const c=roster(),state=B.begin('popil_mist',c,cars());
 assert.ok(state);assert.equal(c[0].mode,'boarding');
 assert.equal(c[1].mode,'working');assert.equal(c[1].boardingState,'aboard');
 assert.equal(finish(state,c,cars()).done,true);
 assert.ok(c.every(x=>x.inside===1&&x.location.kind!=='platform'));
 assert.deepEqual(c.map(x=>x.mode),['aboard','working','aboard']);
 assert.equal(c[1].progress,.4);assert.equal(c[1].done,2);
});
test('cancel restores exact jobs, positions, progress and reward counters',()=>{
 const c=roster(),original=JSON.stringify(c),state=B.begin('popil_mist',c,cars());
 B.tick(state,c,cars(),.5);assert.equal(B.cancel(state,c),true);
 assert.equal(JSON.stringify(c),original);
});
test('saved boarding resumes without route charge or duplicate work',()=>{
 let c=roster(),state=B.begin('popil_mist',c,cars());
 for(let i=0;i<8;i++)B.tick(state,c,cars(),.1);
 const restored=B.recover(JSON.parse(JSON.stringify(state)),JSON.parse(JSON.stringify(c)),cars(),
  id=>id==='popil_mist');
 assert.ok(restored);
 assert.equal(finish(restored,c,cars()).done,true);
 assert.equal(finish(restored,c,cars()).aboard,3);
 assert.equal(c[1].done,2);
});
test('invalid pending route is refused and removed wagons cannot host passengers',()=>{
 const c=roster(),s=B.begin('popil_mist',c,cars());
 assert.equal(B.recover(s,c,cars(),()=>false),null);
 c[1].mode='boarding';c[1].job={target:'tail'};c[1].boardingState='approaching';
 assert.equal(finish(s,c,cars()).done,true);
 assert.equal(c[1].mode,'aboard');assert.equal(c[1].location.kind,'locomotive');
});
test('time step cap and timeout fallback guarantee completion',()=>{
 const c=roster(),state=B.begin('popil_mist',c,cars());
 c[2].x=1e8;
 for(let i=0;i<20;i++)B.tick(state,c,cars(),1);
 assert.equal(state.elapsed,10);
 assert.ok(c.every(p=>p.boardingState==='aboard'));
});
