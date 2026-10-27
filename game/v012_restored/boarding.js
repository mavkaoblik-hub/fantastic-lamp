/* CARAVAN v0.13-D2 — boarding before paid departure.
 * Pure, deterministic update. No economy access; route debit remains inside
 * ROUTES.start() after every passenger has reached an interior compartment.
 */
(function(root,create){
 'use strict';
 const api=create();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanBoardingD2=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const DOORS=Object.freeze({
  engine:{door:351,work:279},
  center:{door:441,work:518},
  rear:{door:701,work:777},
  tail:{door:955,work:1034}
 });
 const SLOTS=['center','rear','tail'];
 const clone=v=>JSON.parse(JSON.stringify(v));
 function validJob(person,cars){
  const target=person?.job?.target;
  if(!Object.prototype.hasOwnProperty.call(DOORS,target))return null;
  if(target==='engine')return target;
  return cars[SLOTS.indexOf(target)]?.id?target:null;
 }
 function placement(target,cars,i){
  const carIndex=SLOTS.indexOf(target);
  return {x:target==='engine'?241+31*i:DOORS[target].work,
   location:{kind:target==='engine'?'locomotive':'wagon',
    carId:carIndex>=0?cars[carIndex].id:null}};
 }
 function preparePerson(person,cars,i){
  // An exiting/completed employee has already finished the previous job.
  // Never reactivate a completed engine repair and award it a second time
  // simply because the train departs during the exit animation.
  if(person.mode==='exiting'||person.mode==='completed'){
   const next=Array.isArray(person.queue)?person.queue.find(q=>validJob({job:q},cars)):null;
   person.job=next?{target:next.target}:null;
   person.queue=[];
  }
  const target=validJob(person,cars)||'engine';
  const assigned=Boolean(validJob(person,cars));
  person.boardingTarget=target;
  if(person.mode==='working'&&person.inside>=.999&&assigned){
   const p=placement(target,cars,i);
   person.x=p.x;person.inside=1;person.boardingState='aboard';
   person.location=p.location;
   return;
  }
  person.mode='boarding';
  person.boardingState='approaching';
  person.transition=0;
  person.inside=0;
  person.location={kind:'platform',carId:null};
  person.dir=DOORS[target].door>=person.x?1:-1;
 }
 function begin(routeId,crew,cars){
  if(typeof routeId!=='string'||!routeId||!Array.isArray(crew)||!Array.isArray(cars))return null;
  const originalCrew=clone(crew);
  for(let i=0;i<crew.length;i++)preparePerson(crew[i],cars,i);
  return {version:2,routeId,elapsed:0,originalCrew};
 }
 function tick(boarding,crew,cars,seconds){
  if(!boarding||!Array.isArray(crew)||!Array.isArray(cars))return {done:false,aboard:0};
  const dt=Math.max(0,Math.min(Number.isFinite(seconds)?seconds:0,1));
  boarding.elapsed=Math.min(10,Math.max(0,Number(boarding.elapsed)||0)+dt);
  let aboard=0;
  for(let i=0;i<crew.length;i++){
   const p=crew[i];
   if(!p||p.boardingState==='aboard'){aboard++;continue;}
   const target=validJob(p,cars)||'engine';
   const door=DOORS[target],end=placement(target,cars,i);
   // An invalid job in an old save must never place the person in a removed car.
   p.boardingTarget=target;
   if(p.boardingState!=='entering'){
    const delta=door.door-p.x,step=195*dt;
    if(Math.abs(delta)>step){
     p.dir=delta>0?1:-1;p.x+=p.dir*step;
     p.mode='boarding';p.inside=0;p.boardingState='approaching';
     continue;
    }
    p.x=door.door;p.transition=0;p.boardingState='entering';
   }
   p.transition=Math.min(1,(Number(p.transition)||0)+dt/1.1);
   const t=p.transition*p.transition*(3-2*p.transition);
   p.x=door.door+(end.x-door.door)*t;
   p.inside=t;p.mode='boarding';
   if(p.transition>=1){
    p.mode=validJob(p,cars)?'working':'aboard';
    p.x=end.x;p.inside=1;p.boardingState='aboard';
    p.location=end.location;
    aboard++;
   }
  }
  if(boarding.elapsed>=10 && aboard<crew.length){
   // Safety fallback for a corrupted route to the door (not a hidden payment).
   for(let i=0;i<crew.length;i++){
    const p=crew[i];if(p.boardingState==='aboard')continue;
    const target=validJob(p,cars)||'engine',end=placement(target,cars,i);
    p.mode=validJob(p,cars)?'working':'aboard';
    p.x=end.x;p.inside=1;p.boardingState='aboard';p.location=end.location;
    p.transition=1;aboard++;
   }
  }
  return {done:aboard===crew.length,aboard,total:crew.length};
 }
 function cancel(boarding,crew){
  if(!boarding||!Array.isArray(boarding.originalCrew)||
    boarding.originalCrew.length!==crew.length)return false;
  const source=clone(boarding.originalCrew);
  for(let i=0;i<crew.length;i++){
   for(const k of Object.keys(crew[i]))delete crew[i][k];
   Object.assign(crew[i],source[i]);
  }
  return true;
 }
 function recover(raw,crew,cars,allowRoute){
  if(!raw||raw.version!==2||typeof raw.routeId!=='string'||
     !Array.isArray(raw.originalCrew)||raw.originalCrew.length!==crew.length||
     !Array.isArray(cars)||typeof allowRoute!=='function'||
     !allowRoute(raw.routeId))return null;
  for(let i=0;i<crew.length;i++){
   if(!crew[i]||typeof crew[i].x!=='number'||!Number.isFinite(crew[i].x)||
      !['boarding','working','aboard'].includes(crew[i].mode))return null;
  }
  return {version:2,routeId:raw.routeId,
    elapsed:Math.max(0,Math.min(10,Number(raw.elapsed)||0)),
    originalCrew:clone(raw.originalCrew)};
 }
 return Object.freeze({DOORS,begin,tick,cancel,recover,validJob});
});