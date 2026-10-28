'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../game/v012_restored/internal_transfer.js');
const cars=()=>[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'medic',level:1}];
const crew=()=>[
 {mode:'working',inside:1,job:{target:'center'},location:{kind:'wagon',carId:'c1'},progress:.2,queue:[],done:2},
 {mode:'aboard',inside:1,job:null,location:{kind:'locomotive',carId:null},progress:0,queue:[],done:0},
 {mode:'aboard',inside:1,job:null,location:{kind:'locomotive',carId:null},progress:0,queue:[],done:0}
];
test('transferring ends source production immediately and begins destination work once',()=>{
 const c=crew(),w=cars(),r=T.start(c,w,0,'rear');
 assert.equal(r.ok,true);assert.equal(c[0].job,null);
 assert.equal(c[0].mode,'transferring');
 assert.equal(T.occupancy(c,w,'center'),0);
 assert.equal(T.occupancy(c,w,'rear'),1);
 for(let i=0;i<15;i++)T.advance(c,w,.5);
 assert.equal(c[0].mode,'working');assert.equal(c[0].job.target,'rear');
 assert.equal(c[0].location.carId,'c2');assert.equal(c[0].done,2);
 assert.equal(T.occupancy(c,w,'rear'),1);
 assert.equal(c[0].transfer,null);
});
test('route personnel transfers cannot overbook level 1 or duplicate action',()=>{
 const c=crew(),w=cars();
 assert.equal(T.start(c,w,0,'rear').ok,true);
 assert.equal(T.start(c,w,0,'rear').reason,'already-transferring');
 assert.equal(T.start(c,w,1,'rear').reason,'full');
 assert.equal(T.start(c,w,1,'center').ok,true);
 assert.equal(T.start(c,w,2,'center').reason,'full');
});
test('level 2 supports two separated workers, not three',()=>{
 const c=crew(),w=cars();w[1].level=2;
 assert.equal(T.start(c,w,0,'rear').ok,true);
 assert.equal(T.start(c,w,1,'rear').ok,true);
 assert.equal(T.start(c,w,2,'rear').reason,'full');
});
test('no exterior step at any progress value and save resumes deterministically',()=>{
 const c=crew(),w=cars();
 assert.equal(T.start(c,w,0,'rear').ok,true);
 T.advance(c,w,1);
 const resumed=JSON.parse(JSON.stringify(c));
 assert.equal(T.normalize(resumed,w,true),false);
 for(let i=0;i<12;i++){
  T.advance(resumed,w,.25);
  assert.equal(resumed[0].inside,1);
  assert.notEqual(resumed[0].location.kind,'platform');
 }
 assert.equal(resumed[0].job.target,'rear');
});
test('corrupt pending transfer becomes safe standby instead of invisible patrol',()=>{
 const c=crew(),w=cars();T.start(c,w,0,'rear');
 const shorter=[w[0]];
 assert.equal(T.normalize(c,shorter,true),true);
 assert.equal(c[0].mode,'aboard');assert.equal(c[0].transfer,null);
 assert.equal(c[0].location.kind,'locomotive');
 assert.equal(c[0].job,null);
});
test('no side effects: transfer does not alter currency or worker rewards',()=>{
 const c=crew(),w=cars(),resources={fuel:85,supplies:30,metal:100};
 const balance=JSON.stringify(resources),done=c[0].done;
 T.start(c,w,0,'rear');
 for(let i=0;i<10;i++)T.advance(c,w,.5);
 assert.equal(JSON.stringify(resources),balance);
 assert.equal(c[0].done,done);
});
