/* CARAVAN v0.13-D4 — room-specific stations and animated work gestures.
 * Presentation-only model. Reuses ORIGINAL v0.12 crew idle sprites and
 * existing wagon cutaways; does not change jobs, currencies or production.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanInteriorLifeD3=api; // stable entrypoint for old saves
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const SLOTS=['center','rear','tail'];
 const INNER=Object.freeze({
  engine:{x:122,y:316,w:210,h:109},
  wagon:{padLeft:25,padTop:24,padRight:25,padBottom:37}
 });
 // The source cutaway sprites have different benches, beds, machinery, and
 // portholes. Fractions place workers beside the EXISTING painted equipment.
 // Two-seat positions remain separated even when the wagon is upgraded to L2.
 const STATIONS=Object.freeze({
  workshop:{activity:'repair',spots:[.34,.74],floor:.98,label:'Працює біля верстака'},
  salvage:{activity:'repair',spots:[.35,.74],floor:.96,label:'Сортує металобрухт'},
  cargo:{activity:'repair',spots:[.32,.74],floor:.96,label:'Перевіряє вантаж'},
  reactor:{activity:'repair',spots:[.60,.30],floor:.97,label:'Контролює реактор'},
  power:{activity:'repair',spots:[.63,.30],floor:.97,label:'Налаштовує генератор'},
  greenhouse:{activity:'care',spots:[.37,.69],floor:.95,label:'Доглядає рослини'},
  greenhouse_plus:{activity:'care',spots:[.36,.67],floor:.95,label:'Збирає врожай'},
  kitchen:{activity:'care',spots:[.62,.34],floor:.96,label:'Готує раціони'},
  quarters:{activity:'rest',spots:[.39,.75],floor:.97,label:'Відпочиває'},
  barracks:{activity:'rest',spots:[.35,.69],floor:.97,label:'Відновлює сили'},
  medic:{activity:'care',spots:[.30,.72],floor:.98,label:'Працює в медпункті'},
  arsenal:{activity:'watch',spots:[.39,.75],floor:.97,label:'Обслуговує спорядження'},
  guard:{activity:'watch',spots:[.35,.72],floor:.96,label:'Несе варту'},
  recon:{activity:'watch',spots:[.66,.30],floor:.96,label:'Спостерігає за маршрутом'}
 });
 const ACTIVITY=Object.freeze(Object.fromEntries(Object.entries(STATIONS).map(([key,val])=>[key,val.activity])));
 const ACTIONS=Object.freeze({repair:'Робота',care:'Догляд',watch:'Чергує',rest:'Відпочинок',standby:'На борту'});
 const finite=(n,d=0)=>Number.isFinite(n)?n:d;
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
 function slot(target,cars){
  const ix=SLOTS.indexOf(target);
  return ix>=0&&cars[ix]?.id?ix:-1;
 }
 function validLocation(person,cars){
  if(!person||!Array.isArray(cars)||!['working','resting','aboard','boarding','transferring'].includes(person.mode)||
     !(person.inside>=.999))return null;
  if(person.mode==='boarding'&&person.boardingState!=='aboard')return null;
  // While changing rooms the sprite remains inside a valid cutaway.
  // The halfway change represents passing through an off-screen corridor.
  if(person.mode==='transferring'&&person.transfer){
   const tr=person.transfer;
   const id=tr.progress<.5?tr.fromId:tr.toId;
   if(id==='engine')return {kind:'locomotive',index:-1,carId:null};
   const index=cars.findIndex(c=>c.id===id);
   return index>=0?{kind:'wagon',index,carId:id}:{kind:'locomotive',index:-1,carId:null};
  }
  const ix=slot(person.job?.target,cars);
  if(['working','resting'].includes(person.mode)&&ix>=0)return {kind:'wagon',index:ix,carId:cars[ix].id};
  if(person.mode==='working'&&person.job?.target==='engine')
   return {kind:'locomotive',index:-1,carId:null};
  const id=person.location?.kind==='wagon'?person.location.carId:null;
  const savedIndex=cars.findIndex(c=>c.id===id);
  if(savedIndex>=0)return {kind:'wagon',index:savedIndex,carId:id};
  return {kind:'locomotive',index:-1,carId:null};
 }
 function describe(person,i,cars){
  const loc=validLocation(person,cars);if(!loc)return null;
  const kind=loc.index>=0?cars[loc.index].kind:'engine';
  const profile=STATIONS[kind];
  let activity=person.mode==='resting'?'rest':person.mode==='working'?(profile?.activity||'repair'):'standby';
  if(person.mode==='aboard'&&loc.index>=0)activity='rest';
  if(person.mode==='transferring')activity='transfer';
  if(person.autoActivity){
   const a=person.autoActivity;
   activity=a.phase==='visit'?({rest:'rest',social:'social',dining:'care',stroll:'stroll'}[a.kind]||'standby'):'transfer';
  }
  return {
   personIndex:i,carId:loc.carId,location:loc.kind,index:loc.index,
   wagonKind:kind,activity,caption:activity==='standby'?ACTIONS.standby:
    person.autoActivity?(person.autoActivity.phase==='visit'?
     ({rest:'Самостійно відпочиває',social:'Спілкується з пасажирами',
       dining:'Відвідує кухню',stroll:'Прогулюється вагоном'}[person.autoActivity.kind]||'На борту'):
     'Іде всередині потяга · '+Math.floor((person.autoActivity.progress||0)*100)+'%'):
    person.mode==='transferring'?'Внутрішній перехід · '+Math.floor((person.transfer?.progress||0)*100)+'%':
    person.mode==='resting'?'Відпочиває у вагоні':person.mode==='working'&&profile?profile.label:ACTIONS[activity],
   role:person.role,
   progress:person.mode==='working'?clamp(finite(person.progress),0,1):0
  };
 }
 function layout(crew,cars){
  if(!Array.isArray(crew)||!Array.isArray(cars))return [];
  const entries=crew.map((person,i)=>describe(person,i,cars)).filter(Boolean);
  const count=new Map();
  for(const e of entries){
   const key=e.carId||'engine';
   e.seat=count.get(key)||0;
   count.set(key,e.seat+1);
  }
  return entries;
 }
 function slotBounds(entry){
  if(entry.location==='locomotive')return {...INNER.engine};
  const index=entry.index;
  if(!Number.isInteger(index)||index<0||index>=3)return null;
  return {
   x:407+index*261+INNER.wagon.padLeft,
   y:311+INNER.wagon.padTop,
   w:256-INNER.wagon.padLeft-INNER.wagon.padRight,
   h:163-INNER.wagon.padTop-INNER.wagon.padBottom
  };
 }
 function actor(entry){
  const rect=slotBounds(entry);
  if(!rect)return null;
  const isEngine=entry.location==='locomotive';
  const profile=STATIONS[entry.wagonKind];
  const seat=clamp(entry.seat,0,isEngine?2:1);
  const seats=isEngine?[.20,.50,.80]:(profile?.spots||[.36,.72]);
  const centerX=rect.x+rect.w*seats[seat];
  const height=isEngine?51:52;
  const width=Math.round(height*.48);
  const ground=rect.y+rect.h*(isEngine?.98:(profile?.floor||.97));
  const x=clamp(centerX-width*.5,rect.x+3,rect.x+rect.w-width-3);
  const y=clamp(ground-height,rect.y+2,rect.y+rect.h-height-2);
  const fxX=clamp(x+(seat%2===0?width+5:-5),rect.x+6,rect.x+rect.w-6);
  const fxY=clamp(y+height*.59,rect.y+7,rect.y+rect.h-7);
  return {...entry,x,y,width,height,bounds:rect,fxX,fxY};
 }
 function build(crew,cars){return layout(crew,cars).map(actor).filter(Boolean);}
 // Smooth bounded pose parameters; no new sprites and no physical displacement
 // beyond the window. Useful for automated visual/temporal regression tests.
 function pose(entry,time){
  const t=finite(time),base=t+(entry.personIndex||0)*1.31;
  const kind=entry.activity;
  const out={angle:0,shiftX:0,shiftY:0,stretchY:1,light:0,
   action:kind,flare:0,frameRate:2.5};
  if(kind==='repair'){
   const hit=Math.sin(base*5.3);
   out.angle=hit*.07;out.shiftY=-Math.abs(hit)*1.1;
   out.light=.16+.20*Math.abs(hit);out.flare=Math.max(0,hit-.48);
   out.frameRate=4.5;
  }else if(kind==='care'){
   out.angle=Math.sin(base*2.6)*.048;
   out.shiftX=Math.sin(base*2.6)*1.0;out.shiftY=Math.sin(base*2.2)*.5;
   out.light=.13+.09*Math.sin(base*2.4)**2;out.flare=Math.max(0,Math.sin(base*2.4));
   out.frameRate=2.5;
  }else if(kind==='watch'){
   out.angle=Math.sin(base*.93)*.028;
   out.shiftX=Math.sin(base*1.1)*.8;out.light=.08+.07*Math.sin(base*.7)**2;
   out.flare=.3+.35*Math.sin(base*.67)**2;out.frameRate=1.65;
  }else if(kind==='social'){
   out.angle=Math.sin(base*2.5)*.045;out.shiftX=Math.sin(base*1.8)*1.1;
   out.light=.13;out.frameRate=2.1;
  }else if(kind==='stroll'){
   out.shiftX=Math.sin(base*1.9)*2.4;out.shiftY=Math.sin(base*2.8)*.6;
   out.frameRate=3.1;
  }else if(kind==='rest'){
   out.angle=Math.sin(base*1.4)*.008;
   out.shiftY=Math.sin(base*1.6)*.45;out.stretchY=1+Math.sin(base*1.45)*.012;
   out.light=.08+.06*Math.sin(base*1.3)**2;out.frameRate=1.5;
  }else{
   out.shiftY=Math.sin(base*1.2)*.35;out.light=.055;
   out.frameRate=1.4;
  }
  return out;
 }
 return Object.freeze({SLOTS,STATIONS,ACTIVITY,ACTIONS,validLocation,describe,layout,slotBounds,build,pose});
});
