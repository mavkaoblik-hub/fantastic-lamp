/* CARAVAN v0.13-B: production inside existing cutaway wagons.
   No new currencies, no automatic payout, and no duplicate legacy work reward. */
(function(root,create){
 'use strict';
 const api=create();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanV13Production=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const RULES=Object.freeze({
  workshop:{resource:'metal',amount:6,seconds:38,role:'mechanic',label:'Деталі'},
  salvage:{resource:'metal',amount:9,seconds:37,role:'mechanic',label:'Металобрухт'},
  cargo:{resource:'metal',amount:5,seconds:48,role:'guard',label:'Корисні вантажі'},
  reactor:{resource:'fuel',amount:6,seconds:44,role:'operator',label:'Паливо'},
  power:{resource:'fuel',amount:5,seconds:40,role:'mechanic',label:'Запас енергії'},
  greenhouse:{resource:'supplies',amount:7,seconds:39,role:'medic',label:'Їжа'},
  greenhouse_plus:{resource:'supplies',amount:10,seconds:34,role:'medic',label:'Свіжі припаси'},
  kitchen:{resource:'supplies',amount:6,seconds:30,role:'medic',label:'Раціони'},
  quarters:{resource:'morale',amount:5,seconds:43,role:'medic',label:'Відпочинок'},
  barracks:{resource:'morale',amount:5,seconds:42,role:'guard',label:'Відновлення сил'},
  medic:{resource:'condition',amount:4,seconds:42,role:'medic',label:'Медичне спорядження'},
  arsenal:{resource:'condition',amount:4,seconds:49,role:'guard',label:'Захист'},
  guard:{resource:'condition',amount:5,seconds:51,role:'guard',label:'Безпека'},
  recon:{resource:'metal',amount:5,seconds:49,role:'scout',label:'Знахідки'}
 });
 const FIELDS=Object.freeze(['metal','fuel','supplies','morale','condition']);
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const number=(v,defaultValue=0)=>Number.isFinite(v)?v:defaultValue;
 const targetForSlot=index=>['center','rear','tail'][index]||null;
 const capacity=car=>car?.level===2?2:1;
 function normalize(raw,cars){
  const items=raw&&typeof raw==='object'&&raw.rows&&typeof raw.rows==='object'?raw.rows:{};
  const rows={};
  for(const car of cars){
   if(!car||!RULES[car.kind]||typeof car.id!=='string')continue;
   const old=items[car.id]&&items[car.id].kind===car.kind?items[car.id]:{};
   const ready=clamp(Math.floor(number(old.ready)),0,2);
   rows[car.id]={kind:car.kind,progress:ready===2?0:clamp(number(old.progress),0,.999999),
     ready,completed:clamp(Math.floor(number(old.completed)),0,1e8),
     collected:clamp(Math.floor(number(old.collected)),0,1e8)};
  }
  return {version:1,rows};
 }
 function assigned(cars,crew,index){
  const target=targetForSlot(index);
  return crew.map((p,i)=>({p,i})).filter(x=>x.p?.job?.target===target)
    .map(x=>x.i).slice(0,capacity(cars[index]));
 }
 function activeWorkers(cars,crew,index){
  return assigned(cars,crew,index).filter(i=>crew[i]?.mode==='working');
 }
 function speed(car,workers,crew,morale){
  const rule=RULES[car.kind];
  if(!rule||workers.length===0)return 0;
  const specialization=workers.reduce((sum,i)=>{
   const base=crew[i].role===rule.role?1.2:.85;
   const xp=clamp(Math.floor(number(crew[i].experience)),0,1e6);
   const rank=xp>=40?5:xp>=24?4:xp>=12?3:xp>=4?2:1;
   return sum+base*(1-.45*clamp(number(crew[i].fatigue),0,100)/100)*(1+.03*(rank-1));
  },0);
  const mood=clamp(number(morale,75),0,100);
  return specialization*(car.level===2?1.2:1)*clamp(.65+mood/200,.65,1.15);
 }
 function advance(production,cars,crew,dt,morale){
  if(!Number.isFinite(dt)||dt<=0)return [];
  const delta=Math.min(dt,1),completed=[];
  for(let index=0;index<cars.length;index++){
   const car=cars[index],row=production.rows[car.id],rule=RULES[car.kind];
   if(!row||row.kind!==car.kind||!rule||row.ready>=2)continue;
   const workers=activeWorkers(cars,crew,index);
   const factor=speed(car,workers,crew,morale);
   if(factor===0)continue;
   row.progress+=delta*factor/rule.seconds;
   if(row.progress>=1){
    row.ready=Math.min(2,row.ready+1);
    row.completed++;
    row.progress=row.ready===2?0:Math.max(0,row.progress-1);
    completed.push({carId:car.id,index,crewIndices:workers.slice(),ready:row.ready});
   }
  }
  return completed;
 }
 function inspect(production,cars,crew,id,morale){
  const index=cars.findIndex(c=>c.id===id);
  if(index<0)return null;
  const car=cars[index],rule=RULES[car.kind],row=production.rows[id];
  if(!row||!rule)return null;
  const assignedIds=assigned(cars,crew,index),workers=activeWorkers(cars,crew,index);
  const rate=speed(car,workers,crew,morale),seconds=rate?Math.ceil(rule.seconds*(1-row.progress)/rate):null;
  return {carId:id,index,role:rule.role,resource:rule.resource,label:rule.label,
   amount:rule.amount*(car.level===2?2:1),capacity:capacity(car),
   assigned:assignedIds,workers,ready:row.ready,progress:row.progress,
   remaining:row.ready===2?0:seconds,completed:row.completed,collected:row.collected};
 }
 function collect(production,game,car){
  const row=production.rows[car?.id],rule=RULES[car?.kind];
  if(!row||!rule||row.kind!==car.kind||row.ready<1)return null;
  if(!FIELDS.includes(rule.resource))throw Error('Unexpected economy field');
  const qty=row.ready*rule.amount*(car.level===2?2:1);
  const old=clamp(number(game[rule.resource]),0,rule.resource==='morale'||rule.resource==='condition'?100:1e9);
  const next=rule.resource==='morale'||rule.resource==='condition'?Math.min(100,old+qty):old+qty;
  row.ready=0;row.collected++;
  game[rule.resource]=next;
  return {resource:rule.resource,amount:next-old,requested:qty,batches:Math.min(2,Math.round(qty/(rule.amount*(car.level===2?2:1))))};
 }
 return Object.freeze({RULES,normalize,assigned,activeWorkers,capacity,advance,inspect,collect});
});
