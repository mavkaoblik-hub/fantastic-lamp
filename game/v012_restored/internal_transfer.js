/* CARAVAN v0.13-D5: safe internal transfers between moving wagons.
 * No exterior walking, no work performed in two rooms, no economy mutations.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanInternalTransfer=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const SLOTS=['center','rear','tail'];
 const validCarId=(id,cars)=>id==='engine'||cars.some(c=>c?.id===id);
 const dest=(target,cars)=>{
  const i=SLOTS.indexOf(target);
  return i>=0&&cars[i]?.id?{carId:cars[i].id,target,index:i}:null;
 };
 const idForJob=(job,cars)=>job?.target==='engine'?'engine':
  (dest(job?.target,cars)?.carId||'engine');
 const indexForId=(id,cars)=>id==='engine'?-1:cars.findIndex(c=>c.id===id);
 const positionId=(transfer)=>transfer.progress<.5?transfer.fromId:transfer.toId;
 function location(id){return id==='engine'?{kind:'locomotive',carId:null}:{kind:'wagon',carId:id};}
 const cap=car=>car?.level===2?2:1;
 function occupancy(crew,cars,target,exclude=-1){
  const info=dest(target,cars);if(!info)return null;
  return crew.reduce((n,p,i)=>{
   if(i===exclude)return n;
   const occupies=(p?.job?.target===target&&p.mode==='working')||
    (p?.transfer?.target===target);
   return n+(occupies?1:0);
  },0);
 }
 function canStart(crew,cars,personIndex,target){
  if(!Array.isArray(crew)||!Array.isArray(cars)||!Number.isInteger(personIndex)||personIndex<0||personIndex>=crew.length)
   return {ok:false,reason:'invalid-person'};
  const info=dest(target,cars),person=crew[personIndex];
  if(!info)return {ok:false,reason:'invalid-wagon'};
  if(person?.transfer||person?.mode==='transferring')return {ok:false,reason:'already-transferring'};
  if(!['working','aboard'].includes(person?.mode)||person.inside<.999)
   return {ok:false,reason:'not-onboard'};
  const fromId=idForJob(person.job,cars);
  if(fromId===info.carId)return {ok:false,reason:'same-room'};
  if(occupancy(crew,cars,target,personIndex)>=cap(cars[info.index]))
   return {ok:false,reason:'full'};
  return {ok:true,toId:info.carId,fromId,index:info.index,target};
 }
 function start(crew,cars,personIndex,target){
  const check=canStart(crew,cars,personIndex,target);
  if(!check.ok)return check;
  const person=crew[personIndex];
  const fromIndex=indexForId(check.fromId,cars);
  const duration=Math.min(7,Math.max(2.2,2.5+Math.abs(check.index-fromIndex)*.9));
  person.transfer={version:1,fromId:check.fromId,toId:check.toId,
   target:check.target,progress:0,duration};
  // Removing source job now prevents all income until the destination is reached.
  person.job=null;person.queue=[];
  person.mode='transferring';person.inside=1;person.boardingState='aboard';
  person.location=location(check.fromId);
  return {ok:true,duration,fromId:check.fromId,toId:check.toId};
 }
 function normalize(crew,cars,active){
  let changed=false;
  for(const person of crew){
   const t=person?.transfer;
   if(!t)continue;
   const target=dest(t.target,cars);
   if(!active||t.version!==1||!target||target.carId!==t.toId||
      !validCarId(t.fromId,cars)||person.mode!=='transferring'){
    person.transfer=null;
    person.job=null;person.queue=[];
    person.mode='aboard';person.inside=1;person.boardingState='aboard';
    person.location=location('engine');
    changed=true;continue;
   }
   if(!Number.isFinite(t.progress)||t.progress<0||t.progress>=1){t.progress=0;changed=true;}
   if(!Number.isFinite(t.duration)||t.duration<1||t.duration>10){t.duration=3;changed=true;}
   if(person.job){person.job=null;changed=true;}
   if(person.inside!==1){person.inside=1;changed=true;}
   const where=location(positionId(t));
   if(person.location?.kind!==where.kind||person.location?.carId!==where.carId){
    person.location=where;changed=true;
   }
  }
  return changed;
 }
 function advance(crew,cars,dt){
  let changed=false;const finished=[];
  const step=Math.min(1,Math.max(0,Number.isFinite(dt)?dt:0));
  if(!step)return {changed,finished};
  for(let i=0;i<crew.length;i++){
   const person=crew[i],t=person?.transfer;
   if(!t||person.mode!=='transferring')continue;
   t.progress=Math.min(1,t.progress+step/t.duration);
   person.location=location(positionId(t));
   person.inside=1;
   if(t.progress>=1){
    const destination=dest(t.target,cars);
    const occupied=destination?occupancy(crew,cars,t.target,i):null;
    if(destination&&destination.carId===t.toId&&occupied<cap(cars[destination.index])){
     person.job={target:t.target};
     person.mode='working';person.location=location(t.toId);
    }else{
     // Corrupted save / destination removed: safe standby, no rewards.
     person.job=null;person.mode='aboard';person.location=location('engine');
    }
    person.transfer=null;person.progress=0;
    finished.push(i);
   }
   changed=true;
  }
  return {changed,finished};
 }
 return Object.freeze({SLOTS,dest,location,positionId,occupancy,canStart,start,normalize,advance});
});
