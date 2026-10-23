/* CARAVAN v0.2: gameplay panels attached to the main, saved travelling scene. */
(function(){
 'use strict';
 const S=window.CaravanSystems;
 if(!S)throw new Error('Load caravan_systems.js first');
 const native=location.hostname==='appassets.androidplatform.net';
 const ART=native?'assets/catalog/':'../game/assets/catalog/crops_v1/';
 let support=state.support?S.normalize(state.support):S.initial();
 state.support=support;
 let view=null,person='marko',last=performance.now(),uiTime=0,saveTime=0;
 const panel=document.getElementById('systems-panel');
 const body=document.getElementById('systems-content');
 const title=document.getElementById('systems-title');
 function pic(group,filename){
  return ART+group+'/'+group+'_'+filename+'.png';
 }
 function inform(message){if(typeof notice==='function')notice(message);}
 function topHUD(){
  const water=document.getElementById('water'),morale=document.getElementById('morale');
  if(water)water.textContent=Math.floor(support.water);
  if(morale)morale.textContent=Math.floor(support.morale)+'%';
  const capacity=document.getElementById('crew-capacity');
  if(capacity)capacity.textContent=' / '+support.capacity;
  document.querySelectorAll('[data-art]').forEach(box=>{
   const element=box.querySelector('img');
   if(element&&!element.getAttribute('src'))element.src=ART+box.dataset.art;
  });
 }
 function show(which){
  if(which===view){hide();return;}
  view=which;
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden','false');
  document.querySelectorAll('.systems-dock button').forEach(b=>{
   b.setAttribute('aria-expanded',String(b.dataset.view===which));
  });
  closePanel();
  render();
 }
 function hide(){
  view=null;panel.classList.add('hidden');panel.setAttribute('aria-hidden','true');
  document.querySelectorAll('.systems-dock button').forEach(b=>b.setAttribute('aria-expanded','false'));
 }
 function crewPanel(){
  title.textContent='ЕКІПАЖ / ДОРУЧЕННЯ';
  let html='<p class="system-note">Три фахівці із шести членів екіпажу. Доручення приносять ресурси, доки гра відкрита.</p><div class="crew-picker">';
  for(const w of support.workers){
   html+='<button type="button" class="crew-entry'+(person===w.id?' selected':'')+'" data-action="choose" data-person="'+w.id+'">'+w.name+'<small>'+w.specialty+'</small></button>';
  }
  html+='</div>';
  const w=support.workers.find(x=>x.id===person);
  const label=w.job===null?'На патрулі':S.JOBS[w.job].name;
  html+='<div class="work-status"><strong>'+w.name+'</strong><span>'+label+'</span></div>';
  if(w.job!==null){
   const percent=Math.floor(w.progress/S.JOBS[w.job].seconds*100);
   html+='<div class="work-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>';
  }
  html+='<p class="system-note">У черзі: '+(w.queue.length?w.queue.map(i=>S.JOBS[i].name).join(' → '):'немає')+'. Завершено: '+w.completed+'</p>';
  html+='<div class="job-list">';
  for(let i=0;i<S.JOBS.length;i++){
   const j=S.JOBS[i],reward=Object.entries(j.reward).map(([key,val])=>'+'+val+' '+({scrap:'металу',fuel:'палива',water:'води',morale:'моралі'}[key]||key)).join(' / ');
   html+='<button class="job-option" type="button" data-action="assign" data-job="'+i+'"><strong>'+j.name+'</strong><small>'+j.seconds+' с · '+reward+'</small></button>';
  }
  html+='</div><div class="crew-commands"><button type="button" data-action="cancel">СКАСУВАТИ ОСТАННЄ</button><button type="button" data-action="recall">ПОВЕРНУТИ НА ПАТРУЛЬ</button></div>';
  return html;
 }
 function questsPanel(){
  title.textContent='БОРТОВИЙ ЖУРНАЛ';
  S.syncQuests(support,state);
  let html='<p class="system-note">Винагорода за завдання видається один раз і зберігається після виходу з гри.</p>';
  const images=['scrap_collection','caravan_assembly','repair'];
  S.QUESTS.forEach((q,i)=>{
   const status=S.questState(support,q.id);
   const label=status==='claimed'?'ОТРИМАНО':status==='ready'?'ЗАБРАТИ НАГОРОДУ':'В ПРОЦЕСІ';
   const reward=Object.entries(q.reward).map(([k,v])=>'+'+v+' '+({scrap:'металу',fuel:'палива',water:'води'}[k]||k)).join(' / ');
   html+='<div class="quest-card"><img alt="" loading="lazy" src="'+pic('task',images[i])+'"><div><strong>'+q.name+'</strong><small>'+reward+'</small><button type="button" data-action="claim" data-quest="'+q.id+'"'+(status==='ready'?'':' disabled')+'>'+label+'</button></div></div>';
  });
  return html;
 }
 function inventoryPanel(){
  title.textContent='СКЛАД КАРАВАНУ';
  const items=[['metal','МЕТАЛ',state.scrap],['fuel','ПАЛИВО',state.fuel],['food','ЇЖА',state.food],['water','ВОДА',support.water]];
  let html='<p class="system-note">Фактичні запаси без додаткової вигаданої валюти.</p><div class="supply-list">';
  for(const [key,name,count] of items){
   html+='<div class="supply-item"><img class="art-icon" alt="" loading="lazy" src="'+pic('resource',key)+'"><div><small>'+name+'</small><strong>'+Math.floor(count)+'</strong></div></div>';
  }
  html+='</div><p class="system-note">Повний інвентар предметів і система крафту — наступний етап.</p>';
  return html;
 }
 function render(){
  topHUD();
  if(!view)return;
  body.innerHTML=view==='crew'?crewPanel():view==='quests'?questsPanel():inventoryPanel();
 }
 document.querySelectorAll('.systems-dock button').forEach(b=>{b.onclick=()=>show(b.dataset.view);});
 document.getElementById('systems-close').onclick=hide;
 body.addEventListener('click',event=>{
  const b=event.target.closest('button[data-action]');
  if(!b||b.disabled)return;
  let message='';
  if(b.dataset.action==='choose')person=b.dataset.person;
  if(b.dataset.action==='assign'){
   const result=S.assign(support,person,Number(b.dataset.job));
   message=result.ok?(result.queued?'Доручення додано до черги.':'Доручення розпочато.'):result.reason;
  }
  if(b.dataset.action==='cancel')S.cancel(support,person);
  if(b.dataset.action==='recall')S.recall(support,person);
  if(b.dataset.action==='claim'){
   const prize=S.claim(support,b.dataset.quest);
   if(prize){S.grant(state,support,prize);message='Нагороду за завдання отримано.';}
  }
  persist();updateHUD();render();
  if(message)inform(message);
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();last=performance.now();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 function frame(now){
  const dt=Math.min(0.25,Math.max(0,(now-last)/1000));last=now;
  if(!document.hidden){
   const results=S.tick(support,dt);
   if(results.length){
    for(const result of results){
     S.grant(state,support,result.gains);
     inform(result.name+': завершено — '+S.JOBS[result.job].name);
    }
    updateHUD();persist();
   }
   S.syncQuests(support,state);
   if(now-uiTime>850){render();uiTime=now;}
   if(support.workers.some(w=>w.job!==null)&&now-saveTime>5000){persist();saveTime=now;}
  }
  requestAnimationFrame(frame);
 }
 topHUD();requestAnimationFrame(frame);
 window.CaravanGameplayQA=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify({support,state})),open:show});
})();
