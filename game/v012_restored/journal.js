/* Caravan v0.12.3: progression using existing locomotive, wagons and crew. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CaravanV12Journal=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const QUESTS=Object.freeze([
  {id:'crew_first_job',name:'Перший робочий день',description:'Завершити будь-яке доручення екіпажу',goal:1,
   progress:(game,crew)=>crew.reduce((n,c)=>n+Math.max(0,Math.floor(Number(c?.done)||0)),0),reward:{supplies:8}},
  {id:'wagon_upgrade',name:'Підсилення складу',description:'Покращити будь-який вагон до L2',goal:1,
   progress:(game)=>game.cars.some(c=>c.level===2)?1:0,reward:{metal:18}},
  {id:'extra_wagon',name:'Додатковий вагон',description:'Причепити третій вагон до складу',goal:3,
   progress:(game)=>game.cars.length,reward:{fuel:12}},
  {id:'loco_upgrade',name:'Нове серце потяга',description:'Модернізувати локомотив до L2',goal:2,
   progress:(game)=>game.locoLevel,reward:{morale:8}}
 ]);
 const FIELDS=Object.freeze(['metal','supplies','fuel','morale']);
 function normalize(saved){
  const ids=new Set(QUESTS.map(q=>q.id));
  return {version:1,claimed:[...new Set((Array.isArray(saved?.claimed)?saved.claimed:[])
     .filter(x=>typeof x==='string'&&ids.has(x)))]};
 }
 function status(journal,game,crew){
  const claimed=new Set(journal.claimed);
  return QUESTS.map(q=>{
   const progress=Math.max(0,Math.min(q.goal,Number(q.progress(game,crew))||0));
   return {id:q.id,name:q.name,description:q.description,
    progress,goal:q.goal,reward:{...q.reward},
    status:claimed.has(q.id)?'claimed':progress>=q.goal?'ready':'active'};
  });
 }
 function claim(journal,game,crew,id){
  const row=status(journal,game,crew).find(x=>x.id===id);
  if(!row||row.status!=='ready')return null;
  // No item duplication or unknown resource field; grant exactly once.
  journal.claimed.push(id);
  for(const [field,gain] of Object.entries(row.reward)){
   if(!FIELDS.includes(field))throw Error('Unsupported reward type');
   const current=Math.max(0,Number(game[field])||0);
   game[field]=field==='morale'?Math.min(100,current+gain):current+gain;
  }
  return row.reward;
 }
 return Object.freeze({QUESTS,normalize,status,claim});
});
