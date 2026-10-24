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
    sequence:Math.max(completed+1,Math.floor(clamp(finite(saved.active.sequence),1,100001)))}:null;
  return {version:1,stationId:station,completed,active,history};
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
    sequence:routeState.completed+1};
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
 function advance(routeState,game,seconds){
  if(!routeState.active||!Number.isFinite(seconds)||seconds<=0)return null;
  const spec=ROUTES.find(r=>r.id===routeState.active.routeId);
  if(!spec)return null;
  const active=routeState.active;
  active.elapsed=clamp(active.elapsed+Math.min(seconds,1),0,spec.duration);
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
 return Object.freeze({STATIONS,ROUTES,normalize,available,quote,start,advance,progress});
});
