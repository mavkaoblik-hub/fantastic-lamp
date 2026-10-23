/* CARAVAN systems v0.2. Portable offline rules for jobs and quests. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  if(root)root.CaravanSystems=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const ROLES=[{id:'marko',name:'Марко',specialty:'Механік'},
  {id:'olena',name:'Олена',specialty:'Медик'},
  {id:'danylo',name:'Данило',specialty:'Охоронець'}];
 const JOBS=[
  {name:'Склад постачання',seconds:18,reward:{scrap:8}},
  {name:'Житловий вагон',seconds:22,reward:{water:4,morale:2}},
  {name:'Майстерня',seconds:25,reward:{scrap:5,fuel:2}}];
 const QUESTS=[
  {id:'first_salvage',name:'Знайти припаси на станції',reward:{scrap:12}},
  {id:'first_trip',name:'Дістатися наступної станції',reward:{water:14}},
  {id:'first_upgrade',name:'Покращити один вагон',reward:{fuel:10}}];
 const cap=(n,min,max)=>Math.min(max,Math.max(min,Number.isFinite(n)?n:min));
 function normalize(raw){
  const x=raw&&typeof raw==='object'?raw:{};
  const prev=Array.isArray(x.workers)?x.workers:[];
  const workers=ROLES.map(r=>{
   const p=prev.find(w=>w&&w.id===r.id)||{};
   const job=Number.isInteger(p.job)&&p.job>=0&&p.job<3?p.job:null;
   return {id:r.id,name:r.name,specialty:r.specialty,job,
    progress:job===null?0:cap(p.progress,0,JOBS[job].seconds-0.01),
    queue:Array.isArray(p.queue)?p.queue.filter(j=>Number.isInteger(j)&&j>=0&&j<3).slice(0,3):[],
    completed:Math.floor(cap(p.completed,0,1000000))};
  });
  const allowed=QUESTS.map(q=>q.id);
  return {version:1,water:Math.floor(cap(x.water,0,250)),morale:Math.floor(cap(x.morale,0,100)),
   capacity:8,workers,
   ready:[...new Set(Array.isArray(x.ready)?x.ready.filter(i=>allowed.includes(i)):[])],
   claimed:[...new Set(Array.isArray(x.claimed)?x.claimed.filter(i=>allowed.includes(i)):[])]};
 }
 function initial(){return normalize({water:72,morale:75});}
 function find(s,id){return s.workers.find(w=>w.id===id);}
 function assign(s,id,job){
  const w=find(s,id);
  if(!w||!Number.isInteger(job)||job<0||job>=JOBS.length)
   return {ok:false,reason:'Невідоме доручення або персонаж.'};
  if(w.job===null){w.job=job;w.progress=0;return {ok:true,queued:false};}
  if(w.queue.length>=3)return {ok:false,reason:'Максимум три доручення у черзі.'};
  w.queue.push(job);return {ok:true,queued:true};
 }
 function cancel(s,id){
  const w=find(s,id);if(!w)return false;
  if(w.queue.length)w.queue.pop();else{w.job=null;w.progress=0;}
  return true;
 }
 function recall(s,id){
  const w=find(s,id);if(!w)return false;
  w.job=null;w.queue=[];w.progress=0;return true;
 }
 function tick(s,delta){
  if(!Number.isFinite(delta)||delta<=0)return [];
  delta=Math.min(delta,0.25);
  const rewards=[];
  s.workers.forEach(w=>{
   if(w.job===null)return;
   w.progress+=delta;
   if(w.progress>=JOBS[w.job].seconds){
    rewards.push({name:w.name,job:w.job,gains:{...JOBS[w.job].reward}});
    w.completed++;
    w.job=w.queue.length?w.queue.shift():null;
    w.progress=0;
   }
  });
  return rewards;
 }
 function syncQuests(s,game){
  const done=[];
  if(game.explored)done.push('first_salvage');
  if(game.stage>=1)done.push('first_trip');
  if(Array.isArray(game.level)&&game.level.some(x=>x>=2))done.push('first_upgrade');
  done.forEach(id=>{if(!s.ready.includes(id)&&!s.claimed.includes(id))s.ready.push(id);});
 }
 function claim(s,id){
  const q=QUESTS.find(x=>x.id===id);
  if(!q||!s.ready.includes(id)||s.claimed.includes(id))return null;
  s.ready=s.ready.filter(x=>x!==id);s.claimed.push(id);
  return {...q.reward};
 }
 function grant(game,s,gains){
  Object.keys(gains).forEach(k=>{
   const v=Math.max(0,Math.floor(Number(gains[k])||0));
   if(k==='water')s.water=Math.min(250,s.water+v);
   else if(k==='morale')s.morale=Math.min(100,s.morale+v);
   else if(['scrap','fuel','food'].includes(k))game[k]=Math.min(1000000,Math.max(0,game[k]||0)+v);
  });
 }
 function questState(s,id){
  return s.claimed.includes(id)?'claimed':s.ready.includes(id)?'ready':'active';
 }
 return Object.freeze({ROLES,JOBS,QUESTS,initial,normalize,assign,cancel,recall,tick,syncQuests,claim,grant,questState});
});
