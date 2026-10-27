/* CARAVAN v0.13-D3 — visual interior life, read-only presentation model.
   Reuses original v0.12 character animations. No production/reward mutations. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanInteriorLifeD3=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const SLOTS=['center','rear','tail'];
 const INNER={engine:{x:122,y:316,w:210,h:109},wagon:{padLeft:25,padTop:24,padRight:25,padBottom:37}};
 const ACTIVITY={
  workshop:'repair',salvage:'repair',cargo:'repair',reactor:'repair',power:'repair',
  greenhouse:'care',greenhouse_plus:'care',kitchen:'care',medic:'care',
  quarters:'rest',barracks:'rest',arsenal:'watch',guard:'watch',
  recon:'watch'
 };
 const ACTIONS={repair:'Робота',care:'Догляд',watch:'Чергує',rest:'Відпочинок',standby:'На борту'};
 function slot(target,cars){
  const ix=SLOTS.indexOf(target);
  return ix>=0&&cars[ix]?.id?ix:-1;
 }
 function validLocation(person,cars){
  if(!person||!['working','aboard','boarding'].includes(person.mode)||
      !(person.inside>=.999))return null;
  // Boarding is visible only after reaching the compartment.
  if(person.mode==='boarding'&&person.boardingState!=='aboard')return null;
  const ix=slot(person.job?.target,cars);
  if(person.mode==='working'&&ix>=0)return {kind:'wagon',index:ix,carId:cars[ix].id};
  // Engine jobs and standby passengers stay in the locomotive.
  if(person.mode==='working'&&person.job?.target==='engine')
   return {kind:'locomotive',index:-1,carId:null};
  const savedId=person.location?.kind==='wagon'?person.location.carId:null;
  const savedIndex=cars.findIndex(c=>c.id===savedId);
  if(savedIndex>=0)return {kind:'wagon',index:savedIndex,carId:savedId};
  return {kind:'locomotive',index:-1,carId:null};
 }
 function describe(person,i,cars){
  const loc=validLocation(person,cars);if(!loc)return null;
  const kind=loc.index>=0?cars[loc.index].kind:'engine';
  let action=person.mode==='working'?(kind==='engine'?'repair':(ACTIVITY[kind]||'repair')):'standby';
  if(person.mode==='aboard'&&loc.index>=0)action='rest';
  return {personIndex:i,carId:loc.carId,location:loc.kind,
    activity:action,caption:ACTIONS[action],role:person.role,
    progress:person.mode==='working'?Math.max(0,Math.min(1,Number(person.progress)||0)):0};
 }
 function layout(crew,cars){
  const entries=crew.map((person,i)=>describe(person,i,cars)).filter(Boolean);
  // Shared room placement: room seat 0 / 1, engine seat 0 / 1 / 2.
  const count=new Map();
  for(const e of entries){
   const key=e.carId||'engine';
   const seat=count.get(key)||0;
   e.seat=seat;count.set(key,seat+1);
  }
  return entries;
 }
 function bounds(entry){
  // Wagon cutouts match already-rendered source v0.12 wagons at
  // x=407,668,929; y=311; w=256; h=163. Leave metal frame untouched.
  if(entry.location==='locomotive')return {...INNER.engine};
  const x=407+entry.personSlot*261;
  return {x:x+INNER.wagon.padLeft,y:311+INNER.wagon.padTop,
    w:256-INNER.wagon.padLeft-INNER.wagon.padRight,
    h:163-INNER.wagon.padTop-INNER.wagon.padBottom};
 }
 function slotBounds(entry){
  const index=entry.location==='locomotive'?-1:entry.index;
  if(index<0)return {...INNER.engine};
  return {
   x:407+index*261+INNER.wagon.padLeft,
   y:311+INNER.wagon.padTop,
   w:256-INNER.wagon.padLeft-INNER.wagon.padRight,
   h:163-INNER.wagon.padTop-INNER.wagon.padBottom
  };
 }
 function actor(entry){
  const rect=slotBounds(entry);
  const count=entry.location==='locomotive'?3:2;
  const seat=Math.min(entry.seat,count-1);
  const gap=rect.w/(count+1);
  const x=rect.x+gap*(seat+1);
  const height=entry.location==='locomotive'?53:56;
  const width=Math.round(height*.48);
  const ground=rect.y+rect.h-3;
  return {...entry,x:x-width/2,y:ground-height,width,height,
    bounds:rect};
 }
 function build(crew,cars){
  const entries=layout(crew,cars);
  return entries.map((e)=>actor({...e,index:e.carId?cars.findIndex(c=>c.id===e.carId):-1}));
 }
 return Object.freeze({SLOTS,ACTIVITY,ACTIONS,validLocation,describe,layout,slotBounds,build});
});
