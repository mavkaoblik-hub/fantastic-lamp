'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const S=require('../web/caravan_systems.js');
test('three workers and bounded job queues',()=>{
 const m=S.initial();
 assert.equal(m.workers.length,3);
 assert.equal(S.assign(m,'marko',0).ok,true);
 for(let i=0;i<3;i++)assert.equal(S.assign(m,'marko',1).ok,true);
 assert.equal(S.assign(m,'marko',2).ok,false);
 assert.equal(m.workers[0].queue.length,3);
});
test('job rewards are triggered once on completion',()=>{
 const m=S.initial();
 S.assign(m,'olena',0);
 let prizes=[];
 for(let i=0;i<72;i++)prizes=prizes.concat(S.tick(m,.25));
 assert.equal(prizes.length,1);
 assert.equal(prizes[0].gains.scrap,8);
 assert.equal(m.workers[1].job,null);
});
test('recall and queue cancellation are safe',()=>{
 const m=S.initial();S.assign(m,'danylo',0);S.assign(m,'danylo',1);
 S.cancel(m,'danylo');
 assert.deepEqual(m.workers[2].queue,[]);
 S.recall(m,'danylo');assert.equal(m.workers[2].job,null);
});
test('quests have idempotent rewards and persistent state',()=>{
 const m=S.initial(),game={explored:true,stage:1,level:[1,2,1],scrap:0,fuel:0,food:0};
 S.syncQuests(m,game);assert.equal(m.ready.length,3);
 S.grant(game,m,S.claim(m,'first_salvage'));
 assert.equal(game.scrap,12);
 assert.equal(S.claim(m,'first_salvage'),null);
 const restored=S.normalize(JSON.parse(JSON.stringify(m)));
 assert.equal(S.questState(restored,'first_salvage'),'claimed');
});
test('malformed historic saves cannot create arbitrary jobs',()=>{
 const m=S.normalize({workers:[{id:'marko',job:99,queue:[15,1,-1,0,2,1]}]});
 assert.equal(m.workers[0].job,null);
 assert.deepEqual(m.workers[0].queue,[1,0,2]);
 assert.deepEqual(S.tick(m,-100),[]);
});
