/* CARAVAN v0.13-D6C — deterministic onboard needs, social and rest breaks.
 * Pure simulation; no outside walking, no collection, no new currencies.
 * Job is suspended during breaks. Home work is restored only if a seat exists.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanCrewAutonomy=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const SLOTS=['center','rear','tail'];
 const REST=new Set(['quarters','barracks']);
 const DINING=new Set(['kitchen']);
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const num=(x,d=0)=>Number.isFinite(x)?x:d;
 const loc=id=>id==='engine'?{kind:'locomotive',carId:null}:{kind:'wagon',carId:id};
 const valid=(id,cars)=>id==='engine'||cars.some(c=>c.id===id);
 const targetId=(job,cars)=>{
  const i=SLOTS.indexOf(job?.target);
  return i<0?'engine':cars[i]?.id||'engine';
 };
 const roomId=p=>p?.location?.kind==='wagon'?p.location.carId:'engine';
 const capacity=car=>car?.level===2?2:1;
 function normalize(crew,cars,active){
  if(!Array.isArray(crew)||!Array.isArray(cars))return false;
  let changed=false;
  for(const p of crew){
   if(!p)continue;
   const lonely=clamp(num(p.loneliness,20),0,100);
   const cooldown=clamp(num(p.autoCooldown),0,300);
   if(p.loneliness!==lonely){p.loneliness=lonely;changed=true;}
   if(p.autoCooldown!==cooldown){p.autoCooldown=cooldown;changed=true;}
   const a=p.autoActivity;
   if(!a)continue;
   if(a.version!==1||!['rest','social','dining','stroll'].includes(a.kind)||
     !['travel','visit','return'].includes(a.phase)||!valid(a.fromId,cars)||
     !valid(a.toId,cars)||!valid(a.homeId,cars)){
     p.autoActivity=null;p.job=null;p.mode='aboard';
     p.inside=1;p.location=loc('engine');changed=true;continue;
   }
   a.progress=clamp(num(a.progress),0,1);
   a.remaining=clamp(num(a.remaining),0,60);
   a.duration=clamp(num(a.duration,3),1,10);
   if(!active){
     finish(p,crew,cars);changed=true;
   }else{
     p.job=null;p.mode='aboard';p.inside=1;
     p.boardingState='aboard';
     p.location=loc(phaseId(a));changed=true;
   }
  }
  return changed;
 }
 function phaseId(a){
  if(a.phase==='visit')return a.toId;
  if(a.phase==='travel')return a.progress<.5?a.fromId:a.toId;
  return a.progress<.5?a.toId:a.homeId;
 }
 function occupancy(crew,cars,target,exclude=-1){
  return crew.reduce((n,p,i)=>{
   if(i===exclude)return n;
   const serving=p?.job?.target===target&&['working','resting'].includes(p.mode);
   const booked=p?.transfer?.target===target||
    (p?.autoActivity?.kind==='rest'&&p.autoActivity.toId===targetId({target},cars));
   return n+(serving||booked?1:0);
  },0);
 }
 function choose(crew,cars,i){
  const p=crew[i],from=roomId(p);
  if(p.fatigue>=43){
   for(let k=0;k<cars.length;k++){
    if(!REST.has(cars[k].kind))continue;
    const target=SLOTS[k];
    if(occupancy(crew,cars,target,i)<capacity(cars[k]))
     return {kind:'rest',toId:cars[k].id};
   }
  }
  if(p.loneliness>=54){
   const partner=crew.find((other,j)=>j!==i&&other&&
    !other.autoActivity&&['working','resting','aboard'].includes(other.mode)&&
    roomId(other)!==from);
   if(partner)return {kind:'social',toId:roomId(partner)};
   const diner=cars.find(c=>DINING.has(c.kind));
   if(diner)return {kind:'dining',toId:diner.id};
  }
  // Gentle on-board stroll is a fallback for loneliness, not a forced job break.
  if(p.loneliness>=65){
   const other=cars.find(c=>c.id!==from);
   return {kind:'stroll',toId:other?.id||'engine'};
  }
  return null;
 }
 function start(crew,cars,i,purpose){
  const p=crew[i];
  if(!p||p.autoActivity||p.transfer||!['working','aboard'].includes(p.mode)||p.inside<.999)return false;
  const toId=purpose.toId,fromId=roomId(p);
  if(!valid(toId,cars))return false;
  const homeJob=p.job?{...p.job}:null,homeId=targetId(homeJob,cars);
  const a={version:1,kind:purpose.kind,phase:toId===fromId?'visit':'travel',
   fromId,toId,homeId,homeJob,progress:0,duration:3.5,remaining:
    purpose.kind==='rest'?18:purpose.kind==='social'?12:purpose.kind==='dining'?10:8};
  p.autoActivity=a;p.job=null;p.mode='aboard';p.inside=1;
  p.boardingState='aboard';p.location=loc(fromId);
  return true;
 }
 function finish(p,crew,cars){
  const a=p.autoActivity;if(!a)return;
  const job=a.homeJob;
  const index=SLOTS.indexOf(job?.target);
  const car=index>=0?cars[index]:null;
  const occupied=index>=0?crew.reduce((n,other)=>{
   if(other===p)return n;
   return n+((other?.job?.target===job.target&&['working','resting'].includes(other.mode))||
    other?.transfer?.target===job.target?1:0);
  },0):0;
  const validHome=index>=0&&car?.id===a.homeId&&occupied<capacity(car);
  p.autoActivity=null;p.autoCooldown=28;p.inside=1;p.boardingState='aboard';
  if(validHome){p.job=job;p.mode=job.duty==='rest'?'resting':'working';p.location=loc(car.id);}
  else{p.job=null;p.mode='aboard';p.location=loc('engine');}
 }
 function advance(crew,cars,dt,{active=false,moving=false,boarding=false}={}){
  if(!Array.isArray(crew)||!Array.isArray(cars)||!Number.isFinite(dt)||dt<=0)return {changed:false,events:[]};
  const step=Math.min(1,dt),events=[];
  let changed=normalize(crew,cars,true);
  for(let i=0;i<crew.length;i++){
   const p=crew[i];if(!p)continue;
   if(p.autoActivity&&!active){
    finish(p,crew,cars);changed=true;continue;
   }
   if(!p.autoActivity){
    if(!active||boarding)continue;
    p.autoCooldown=Math.max(0,num(p.autoCooldown)-step);
    if(moving&&['working','aboard'].includes(p.mode)&&!p.transfer){
     p.loneliness=clamp(num(p.loneliness,20)+(p.mode==='working'?.22:.10)*step,0,100);
     changed=true;
     if(p.autoCooldown<=0){
      const purpose=choose(crew,cars,i);
      if(purpose&&start(crew,cars,i,purpose)){
       events.push({index:i,type:'start',kind:purpose.kind});changed=true;
      }
     }
    }
    continue;
   }
   const a=p.autoActivity;
   if(a.phase==='travel'||a.phase==='return'){
    a.progress=clamp(a.progress+step/a.duration,0,1);
    p.location=loc(phaseId(a));p.inside=1;p.mode='aboard';p.job=null;
    if(a.progress>=1){
     if(a.phase==='travel'){a.phase='visit';a.progress=0;p.location=loc(a.toId);}
     else{finish(p,crew,cars);events.push({index:i,type:'finish',kind:a.kind});}
    }
   }else{
    a.remaining=Math.max(0,a.remaining-step);
    if(a.kind==='rest')p.fatigue=clamp(num(p.fatigue)-.7*step,0,100);
    if(a.kind==='social')p.loneliness=clamp(num(p.loneliness)-1.2*step,0,100);
    if(a.kind==='dining')p.loneliness=clamp(num(p.loneliness)-.85*step,0,100);
    if(a.kind==='stroll')p.loneliness=clamp(num(p.loneliness)-.4*step,0,100);
    if(a.remaining<=0){
     a.phase='return';a.progress=0;
     a.duration=a.homeId===a.toId?1:3.5;
    }
   }
   changed=true;
  }
  return {changed,events};
 }
 return Object.freeze({normalize,choose,start,advance,occupancy,phaseId,finish});
});
