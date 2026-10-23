'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const M=require('../web/crew_motion.js');
const jobs=[{seconds:18},{seconds:22},{seconds:25}];
const modules=[{x:300,w:248},{x:553,w:263},{x:823,w:266}];
function person(job,progress=0,completed=0){return {id:'marko',job,progress,completed};}
test('idle crew patrol rather than duplicated static character',()=>{
 const director=M.createDirector();
 const p=director.pose(person(null),0,modules,jobs,0);
 assert.equal(p.phase,'patrol');assert.equal(p.job,null);
});
test('worker follows door, enters, works, exits, returns to patrol',()=>{
 const d=M.createDirector();
 const walking=d.pose(person(1,1),0,modules,jobs,1);
 assert.equal(walking.phase,'walking');
 const door=modules[1].x+modules[1].w-27;
 assert.ok(walking.x<1125 && walking.x>door);
 const entrance=d.pose(person(1,3.6),0,modules,jobs,4.5);
 assert.equal(entrance.phase,'entering');
 const work=d.pose(person(1,8),0,modules,jobs,8);
 assert.equal(work.phase,'working');
 const exit=d.pose(person(1,21),0,modules,jobs,21);
 assert.equal(exit.phase,'exiting');
 const returning=d.pose(person(null,0,1),0,modules,jobs,22);
 assert.equal(returning.phase,'returning');
 const patrol=d.pose(person(null,0,1),0,modules,jobs,28);
 assert.equal(patrol.phase,'patrol');
});
test('job transition uses previous wagon door as starting point',()=>{
 const d=M.createDirector();
 d.pose(person(0,12),0,modules,jobs,12);
 const next=d.pose(person(2,0,1),0,modules,jobs,20);
 assert.equal(next.phase,'walking');
 assert.equal(next.x,modules[0].x+modules[0].w-27);
});
test('tap picks visible actor by world coordinates only',()=>{
 const d=M.createDirector(),p=d.pose(person(2,12),0,modules,jobs,12);
 assert.equal(d.pick([p],p.x,p.y+16)?.id,'marko');
 assert.equal(d.pick([p],p.x+60,p.y+16),null);
});
