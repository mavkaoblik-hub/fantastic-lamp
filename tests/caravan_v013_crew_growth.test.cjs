'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../game/v012_restored/crew_wellbeing.js');
const P=require('../game/v012_restored/production.js');
const T=require('../game/v012_restored/internal_transfer.js');
const B=require('../game/v012_restored/boarding.js');
const C=require('../game/v012_restored/crew_transit.js');
const I=require('../game/v012_restored/interior_life.js');
const cars=()=>[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}];
const person=(target='center',mode='working')=>({role:'mechanic',mode,inside:1,
 job:{target},location:{kind:'wagon',carId:target==='center'?'c1':'c2'},
 x:520,fatigue:60,experience:0,queue:[],progress:0,done:0,boardingState:'aboard'});
test('XP is bounded and each unique earned batch can advance one rank',()=>{
 const p=person(),crew=[p];
 assert.deepEqual(W.growth(p),{level:1,xp:0,next:4,bonus:1});
 for(let i=0;i<4;i++)W.addExperience(crew,[0]);
 assert.deepEqual(W.growth(p),{level:2,xp:4,next:12,bonus:1.03});
 p.experience=39;assert.equal(W.growth(p).level,4);
 assert.deepEqual(W.addExperience(crew,[0,0]),[{index:0,level:5}]);
 assert.deepEqual(W.growth(p),{level:5,xp:40,next:null,bonus:1.12});
 p.experience=Infinity;assert.equal(W.normalize(p),true);assert.equal(p.experience,0);
});
test('trained workers fill faster, but collecting rewards never changes XP',()=>{
 const c=cars(),rookie=person(),trained=person();
 rookie.fatigue=0;trained.fatigue=0;trained.experience=40;
 const a=P.normalize(null,c),b=P.normalize(null,c),game={metal:10,fuel:0,supplies:0,morale:80,condition:60};
 for(let i=0;i<45;i++){P.advance(a,c,[rookie],1,80);P.advance(b,c,[trained],1,80);}
 assert.ok(b.rows.c1.ready>a.rows.c1.ready||b.rows.c1.progress>a.rows.c1.progress);
 const previous=trained.experience;
 P.collect(b,game,c[0]);P.collect(b,game,c[0]);
 assert.equal(trained.experience,previous);
});
test('explicit resting occupies a seat, restores energy and cannot produce',()=>{
 const c=cars(),crew=[person('rear','resting')],p=crew[0];
 p.job.duty='rest';p.experience=6;
 assert.equal(C.synchronize(crew,c,true).aboard,1);
 assert.equal(p.mode,'resting');
 const production=P.normalize(null,c),previous=p.fatigue;
 for(let i=0;i<25;i++){W.advance(crew,c,1);P.advance(production,c,crew,1,75);}
 assert.equal(production.rows.c2.progress,0);
 assert.ok(p.fatigue<previous);assert.equal(p.experience,6);
 const visuals=I.build(crew,c);
 assert.equal(visuals[0].activity,'rest');assert.equal(visuals[0].carId,'c2');
});
test('D5 transfer to rest has reserved seats and restores duty after reload',()=>{
 const c=cars(),crew=[person(),person('rear','resting')];crew[1].job.duty='rest';
 assert.equal(T.occupancy(crew,c,'rear'),1);
 assert.equal(T.start(crew,c,0,'rear',{duty:'rest'}).reason,'full');
 c[1].level=2;
 assert.equal(T.start(crew,c,0,'rear',{duty:'rest'}).ok,true);
 assert.equal(T.occupancy(crew,c,'center'),0);assert.equal(T.occupancy(crew,c,'rear'),2);
 const restored=JSON.parse(JSON.stringify(crew));
 assert.equal(T.normalize(restored,c,true),false);
 for(let i=0;i<15;i++){T.advance(restored,c,.5);C.synchronize(restored,c,true);}
 assert.equal(restored[0].mode,'resting');assert.equal(restored[0].job.duty,'rest');
 assert.equal(restored[0].location.carId,'c2');assert.equal(restored[0].inside,1);
});
test('boarding preserves valid rest duty and recovers invalid duty to safe standby',()=>{
 const c=cars(),crew=[person('rear','resting')];crew[0].job.duty='rest';
 const boarding=B.begin('testing',crew,c);
 assert.ok(boarding);assert.equal(crew[0].mode,'resting');
 assert.equal(B.tick(boarding,crew,c,.1).done,true);
 assert.equal(C.synchronize(crew,c,true).aboard,1);
 assert.equal(crew[0].mode,'resting');
 c[1].kind='workshop';C.synchronize(crew,c,true);
 assert.equal(crew[0].mode,'aboard');assert.equal(crew[0].job,null);
 assert.equal(crew[0].location.kind,'locomotive');
});
test('resting worker returns to work without double occupancy or external routing',()=>{
 const c=cars(),crew=[person('rear','resting')],p=crew[0];p.job.duty='rest';
 assert.equal(T.start(crew,c,0,'center').ok,true);
 assert.equal(T.occupancy(crew,c,'rear'),0);
 assert.equal(T.occupancy(crew,c,'center'),1);
 for(let i=0;i<15;i++)T.advance(crew,c,.5);
 assert.equal(p.mode,'working');assert.equal(p.job.target,'center');
 assert.equal(p.job.duty,undefined);assert.equal(p.location.kind,'wagon');
});
