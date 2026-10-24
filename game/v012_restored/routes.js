/* CARAVAN V0.12 route system: pure, saved travel transactions; no art changes. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanV12Routes=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const STATIONS=Object.freeze({
  popil:{name:'Попіл',description:'Стара майстерня і перевалочний пункт'},
  mist:{name:'Іржавий міст',description:'Пошкоджена переправа над сухим руслом'},
  depot:{name:'Забуте депо',description:'Порожні ремонтні бокси та склади'},
  tunnel:{name:'Чорний тунель',description:'Небезпечний прохід під гірським хребтом'},
  bazar:{name:'Мідний базар',description:'Невелике торговельне поселення'},
  outpost:{name:'Північний пост',description:'Прикордонна платформа й сигнальна вежа'}
 });
 const ROUTES=Object.freeze([
  {id:'popil_mist',from:'popil',to:'mist',duration:24,fuel:8,supplies:5,risk:'Помірний'},
  {id:'popil_depot',from:'popil',to:'depot',duration:30,fuel:11,supplies:7,risk:'Низький'},
  {id:'mist_depot',from:'mist',to:'depot',duration:23,fuel:9,supplies:6,risk:'Помірний'},
  {id:'mist_tunnel',from:'mist',to:'tunnel',duration:34,fuel:13,supplies:9,risk:'Високий'},
  {id:'depot_bazar',from:'depot',to:'bazar',duration:28,fuel:10,supplies:7,risk:'Низький'},
  {id:'depot_popil',from:'depot',to:'popil',duration:26,fuel:9,supplies:6,risk:'Помірний'},
  {id:'tunnel_outpost',from:'tunnel',to:'outpost',duration:28,fuel:12,supplies:8,risk:'Помірний'},
  {id:'tunnel_depot',from:'tunnel',to:'depot',duration:31,fuel:11,supplies:8,risk:'Помірний'},
  {id:'bazar_outpost',from:'bazar',to:'outpost',duration:30,fuel:11,supplies:7,risk:'Помірний'},
  {id:'bazar_popil',from:'bazar',to:'popil',duration:32,fuel:12,supplies:7,risk:'Низький'},
  {id:'outpost_mist',from:'outpost',to:'mist',duration:31,fuel:11,supplies:8,risk:'Помірний'},
  {id:'outpost_popil',from:'outpost',to:'popil',duration:36,fuel:14,supplies:9,risk:'Високий'}
 ]);
 const INCIDENTS=Object.freeze({
  debris:{id:'debris',title:'Завал на колії',description:'Попереду уламки старого мосту. Екіпаж очікує наказу.',choices:[
   {id:'clear',name:'Розчистити шлях',description:'Витратити 8 металу, укріпити колію.',delta:{metal:-8,condition:3}},
   {id:'detour',name:'Зробити обхід',description:'Витратити 4 палива та 2 припаси.',delta:{fuel:-4,supplies:-2}},
   {id:'risk',name:'Ризикнути',description:'Їхати повільно без додаткових витрат, але пошкодити ходову.',delta:{condition:-12,morale:-3}}
  ]},
  stranger:{id:'stranger',title:'Мандрівники біля колії',description:'На зупинці помічено групу виснажених людей.',choices:[
   {id:'help',name:'Поділитися припасами',description:'Витратити 4 припаси, підвищити мораль.',delta:{supplies:-4,morale:8}},
   {id:'trade',name:'Обміняти припаси',description:'Витратити 3 припаси, отримати 6 металу.',delta:{supplies:-3,metal:6}},
   {id:'pass',name:'Проїхати повз',description:'Не витрачати ресурси, але екіпаж засмутиться.',delta:{morale:-3}}
  ]},
  wreck:{id:'wreck',title:'Покинутий броневагон',description:'Серед уламків видно придатні деталі. Огляд ризикований.',choices:[
   {id:'salvage',name:'Забрати деталі',description:'Отримати 14 металу, ризик пошкодження потяга.',delta:{metal:14,condition:-6}},
   {id:'guard',name:'Оглянути обережно',description:'Витратити 2 припаси, знайти 5 металу.',delta:{supplies:-2,metal:5}},
   {id:'ignore',name:'Не зупинятися',description:'Продовжити рейс без наслідків.',delta:{}}
  ]}
 });
 const decisionFields=Object.freeze(['metal','fuel','supplies','condition','morale']);
 const eventFor=(trip)=>{
  const ids=Object.keys(INCIDENTS),destination=Object.keys(STATIONS).indexOf(trip.to);
  return INCIDENTS[ids[(trip.sequence*5+destination*3)%ids.length]];
 };
 const finite=(v,d=0)=>Number.isFinite(v)?v:d;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function normalize(raw){
  const saved=raw&&typeof raw==='object'?raw:{};
  const station=Object.prototype.hasOwnProperty.call(STATIONS,saved.stationId)?saved.stationId:'popil';
  const completed=Math.floor(clamp(finite(saved.completed),0,100000));
  const history=Array.isArray(saved.history)?saved.history.filter(e=>e&&typeof e==='object'&&
    typeof e.from==='string'&&typeof e.to==='string'&&STATIONS[e.from]&&STATIONS[e.to])
    .slice(-12).map(e=>({from:e.from,to:e.to,sequence:Math.floor(clamp(finite(e.sequence),0,100000)),eventId:String(e.eventId||'')})):[];
  const ref=saved.active&&ROUTES.find(r=>r.id===saved.active.routeId&&r.from===station);
  const active=ref?{routeId:ref.id,from:ref.from,to:ref.to,
    elapsed:clamp(finite(saved.active.elapsed),0,ref.duration-.0001),
    sequence:Math.max(completed+1,Math.floor(clamp(finite(saved.active.sequence),1,100001))),
    eventResolved:saved.active.eventResolved===true,
    pendingEventId:null}:null;
  if(active && !active.eventResolved &&
     saved.active.pendingEventId===eventFor(active).id)
    active.pendingEventId=saved.active.pendingEventId;
  const decisions=Array.isArray(saved.decisions)?saved.decisions.filter(e=>
    e&&typeof e==='object'&&Number.isInteger(e.sequence)&&
    typeof e.id==='string'&&INCIDENTS[e.id]&&typeof e.optionId==='string'&&
    INCIDENTS[e.id].choices.some(x=>x.id===e.optionId)
  ).slice(-12).map(e=>({sequence:e.sequence,id:e.id,optionId:e.optionId})):[];
  return {version:2,stationId:station,completed,active,history,decisions};
 }
 function available(routeState){return ROUTES.filter(r=>r.from===routeState.stationId);}
 function quote(routeState,game,routeId){
  const spec=ROUTES.find(r=>r.id===routeId&&r.from===routeState.stationId);
  if(!spec)return {ok:false,reason:'Цей напрям недоступний із поточної станції.'};
  if(routeState.active)return {ok:false,reason:'Спочатку завершіть розпочатий рейс.'};
  if(!game||finite(game.fuel)<spec.fuel||finite(game.supplies)<spec.supplies)
    return {ok:false,reason:'Недостатньо палива або припасів для рейсу.'};
  if(finite(game.condition,100)<10)return {ok:false,reason:'Потрібно відремонтувати потяг перед рейсом.'};
  return {ok:true,spec};
 }
 function start(routeState,game,routeId){
  const check=quote(routeState,game,routeId);if(!check.ok)return check;
  const spec=check.spec;
  game.fuel-=spec.fuel;
  game.supplies-=spec.supplies;
  routeState.active={routeId:spec.id,from:spec.from,to:spec.to,elapsed:0,
    sequence:routeState.completed+1,eventResolved:false,pendingEventId:null};
  return {ok:true,trip:{...routeState.active},cost:{fuel:spec.fuel,supplies:spec.supplies}};
 }
 function arrivalEvent(trip,game){
  const destinations=Object.keys(STATIONS),idx=destinations.indexOf(trip.to);
  // Seeded from persisted travel sequence and destination; refresh cannot reroll.
  const roll=(trip.sequence*7+idx*3)%4;
  let event;
  if(roll===0){event={id:'cache',title:'Схованка біля колії',
    description:'Екіпаж знайшов частину старого вантажу.',delta:{metal:13}};}
  else if(roll===1){event={id:'rations',title:'Покинутий склад',
    description:'На платформі знайшли вцілілі припаси.',delta:{supplies:9}};}
  else if(roll===2){event={id:'breakdown',title:'Зношені рейки',
    description:'Під час проходу пошкоджено ходову частину.',delta:{condition:-9,metal:5}};}
  else{event={id:'quiet',title:'Тихий перехід',
    description:'Небезпечну ділянку пройдено без втрат.',delta:{morale:4}};}
  for(const [key,value] of Object.entries(event.delta)){
   const previous=finite(game[key]);
   game[key]=['condition','morale'].includes(key)?
     clamp(previous+value,0,100):Math.max(0,previous+value);
  }
  return event;
 }
 function pending(routeState){
  if(!routeState.active||!routeState.active.pendingEventId)return null;
  const ev=eventFor(routeState.active);
  return ev.id===routeState.active.pendingEventId?ev:null;
 }
 function choiceStatus(game,option){
  for(const [field,delta] of Object.entries(option.delta)){
   if(!decisionFields.includes(field))return {ok:false,reason:'Невідомий тип ресурсу.'};
   if(delta<0 && ['metal','fuel','supplies'].includes(field) && finite(game[field]) < -delta)
     return {ok:false,reason:'Недостатньо ресурсів для рішення.'};
  }
  return {ok:true};
 }
 function choose(routeState,game,optionId){
  const event=pending(routeState);
  if(!event)return {ok:false,reason:'Немає події, яка очікує рішення.'};
  const option=event.choices.find(o=>o.id===optionId);
  if(!option)return {ok:false,reason:'Недоступне рішення.'};
  const check=choiceStatus(game,option);
  if(!check.ok)return check;
  for(const [field,delta] of Object.entries(option.delta)){
   const value=finite(game[field])+delta;
   game[field]=['morale','condition'].includes(field)?clamp(value,0,100):Math.max(0,value);
  }
  const sequence=routeState.active.sequence;
  routeState.active.eventResolved=true;
  routeState.active.pendingEventId=null;
  if(!Array.isArray(routeState.decisions))routeState.decisions=[];
  routeState.decisions.push({id:event.id,optionId:option.id,sequence});
  routeState.decisions=routeState.decisions.slice(-12);
  return {ok:true,event:{id:event.id,title:event.title},option:{id:option.id,name:option.name},
   delta:{...option.delta}};
 }
 function advance(routeState,game,seconds){
  if(!routeState.active||!Number.isFinite(seconds)||seconds<=0)return null;
  const spec=ROUTES.find(r=>r.id===routeState.active.routeId);
  if(!spec)return null;
  const active=routeState.active;
  if(active.pendingEventId)return {pending:true,event:pending(routeState),sequence:active.sequence};
  const updated=clamp(active.elapsed+Math.min(seconds,1),0,spec.duration);
  if(!active.eventResolved && updated>=spec.duration/2){
   active.elapsed=spec.duration/2;
   const event=eventFor(active);
   active.pendingEventId=event.id;
   return {pending:true,event,sequence:active.sequence};
  }
  active.elapsed=updated;
  if(active.elapsed+1e-9<spec.duration)return null;
  const trip={...active};
  routeState.active=null;
  routeState.stationId=spec.to;
  routeState.completed=Math.max(routeState.completed,trip.sequence);
  const event=arrivalEvent(trip,game);
  routeState.history.push({from:trip.from,to:trip.to,sequence:trip.sequence,eventId:event.id});
  routeState.history=routeState.history.slice(-12);
  return {arrived:true,from:trip.from,to:trip.to,event,sequence:trip.sequence};
 }
 function progress(routeState){
  const active=routeState.active;if(!active)return null;
  const spec=ROUTES.find(r=>r.id===active.routeId);
  return spec?{from:spec.from,to:spec.to,percent:clamp(active.elapsed/spec.duration*100,0,100),
     remaining:Math.max(0,spec.duration-active.elapsed),duration:spec.duration}:null;
 }
 return Object.freeze({STATIONS,ROUTES,INCIDENTS,normalize,available,quote,start,advance,
   progress,pending,choose,choiceStatus});
});
