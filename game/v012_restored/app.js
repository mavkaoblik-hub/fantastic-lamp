(()=>{'use strict';
const m=globalThis.CARAVAN_MANIFEST,$=id=>document.getElementById(id);
const KEY='caravan_v12';
const JOURNAL=globalThis.CaravanV12Journal;
const ROUTES=globalThis.CaravanV12Routes;
const PRODUCTION=globalThis.CaravanV13Production;
const TRANSIT=globalThis.CaravanCrewTransit;
const BOARDING=globalThis.CaravanBoardingD2;
const LIFE=globalThis.CaravanInteriorLifeD3;
const TRANSFER=globalThis.CaravanInternalTransfer;
 const WELLBEING=globalThis.CaravanCrewWellbeing;
 if(!WELLBEING)throw Error('crew_wellbeing.js must load before app.js');
if(!TRANSFER)throw Error('internal_transfer.js must load before app.js');
if(!LIFE)throw Error('interior_life.js must load before app.js');
if(!BOARDING)throw Error('boarding.js must load before app.js');
if(!TRANSIT)throw Error('crew_transit.js must load before app.js');
const ART=globalThis.CaravanArtBridgeV13C;
if(!ART)throw Error('art_bridge_v013c.js must load before app.js');
if(!JOURNAL||!ROUTES||!PRODUCTION)throw Error('journal.js, routes.js and production.js must load before app.js');
const defaultState=()=>({middle:'workshop',rear:'quarters',levels:{},locoLevel:1,cars:[{id:'c1',kind:'workshop',level:1},{id:'c2',kind:'quarters',level:1}],selectedCarId:'c1',nextCarId:3,crew:'mechanic',moving:false,speed:1,night:false,effects:true,metal:210,fuel:80,morale:75,condition:64,supplies:48,day:1});
let state=defaultState();
try{const old=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('caravan_v09')||localStorage.getItem('caravan_v07')||'null');if(old&&typeof old==='object')Object.assign(state,old)}catch{}
state.levels=state.levels&&typeof state.levels==='object'?state.levels:{};
if(!Array.isArray(state.cars))state.cars=[{id:'c1',kind:state.middle||'workshop',level:state.levels[state.middle]||1},{id:'c2',kind:state.rear||'quarters',level:state.levels[state.rear]||1}];
state.cars=state.cars.filter(car=>car&&typeof car.kind==='string').slice(0,3);

for(const fld of ['metal','fuel','morale','condition','supplies'])if(!Number.isFinite(state[fld]))state[fld]=defaultState()[fld];
const descriptions={reactor:'Реактор підвищує енергетичну автономність.',kitchen:'Гаряча їжа поліпшує мораль.',barracks:'Додаткові місця для відпочинку.',greenhouse_plus:'Вирощування свіжих припасів.',salvage:'Переробка брухту на метал.',arsenal:'Озброєння й захист каравану.',workshop:'Ремонт, деталі та виготовлення обладнання.',quarters:'Спальні місця, відпочинок і мораль екіпажу.',cargo:'Запаси, контейнери та стратегічний резерв.',medic:'Медичний пункт і лікування поранених.',recon:'Зв’язок, навігація та розвідка.',guard:'Оборона й охорона каравану.',greenhouse:'Вирощування їжі під штучним освітленням.',power:'Генератори й енергоживлення вагонів.'};
const roles=['mechanic','medic','guard','scout','driver','operator'];
const LOCATIONS={engine:{door:351,work:279,label:'локомотив'},center:{door:441,work:518,label:'перший вагон'},rear:{door:701,work:777,label:'другий вагон'},tail:{door:955,work:1034,label:'третій вагон'}};
const SLOT_X=[407,668,929],SLOT_W=256;
function currentCar(){return state.cars.find(car=>car.id===state.selectedCarId)||state.cars[0]}
function selectedSlot(){return state.cars.indexOf(currentCar())}
function carAtSlot(i){return state.cars[i]||null}
function levelFor(car){return car?.level===2?2:1}
function validCar(car){return car&&m.wagon[car.kind]}
state.cars=state.cars.filter(validCar).slice(0,3);
if(state.cars.length===0)state.cars=[{id:'c1',kind:'workshop',level:1}];
if(!state.cars.find(c=>c.id===state.selectedCarId))state.selectedCarId=state.cars[0].id;
state.locoLevel=Math.min(4,Math.max(1,Math.round(Number(state.locoLevel)||1)));
state.nextCarId=Math.max(3,Number(state.nextCarId)||3);

const crewNames=['Марко','Олена','Данило'],crewSymbols=['⚒','✚','◈'];
function makeCrew(){return [{role:'mechanic',x:480,dir:1,phase:0},{role:'medic',x:830,dir:-1,phase:1.2},{role:'guard',x:1025,dir:-1,phase:2.2}].map(p=>({...p,mode:'patrol',inside:0,transition:0,job:null,queue:[],progress:0,completed:0,done:0,fatigue:0,experience:0}))}
const allowedModes=new Set(['patrol','walking','entering','working','exiting','completed','aboard','boarding','transferring','resting']);
let crew=makeCrew();
if(Array.isArray(state.crewData)&&state.crewData.length===3){crew=crew.map((def,i)=>{const saved=state.crewData[i];if(!saved||!Number.isFinite(saved.x))return def;const p={...def,...saved};p.mode=allowedModes.has(p.mode)?p.mode:'patrol';p.x=Math.min(1080,Math.max(245,p.x));p.progress=Math.max(0,Math.min(1,Number(p.progress)||0));p.inside=Math.max(0,Math.min(1,Number(p.inside)||0));p.transition=Math.max(0,Math.min(1,Number(p.transition)||0));p.queue=Array.isArray(p.queue)?p.queue.filter(j=>LOCATIONS[j.target]&&(j.target!=='tail'||state.cars.length>=3)).slice(0,3):[];p.exitStartX=Number.isFinite(p.exitStartX)?p.exitStartX:p.x;p.exitInside=Number.isFinite(p.exitInside)?p.exitInside:p.inside;if(p.job&&(!LOCATIONS[p.job.target]||(p.job.target==='tail'&&state.cars.length<3)))p.job=null;if(p.mode!=='patrol'&&!p.job&&!['aboard','boarding','transferring'].includes(p.mode))p.mode='patrol';return p})}
WELLBEING.normalizeAll(crew);
 let chosenCrew=Number.isInteger(state.chosenCrew)?Math.max(0,Math.min(2,state.chosenCrew)):0;
let eventLog=Array.isArray(state.events)?state.events.slice(0,8):[];
let journal=JOURNAL.normalize(state.journal);
let production=PRODUCTION.normalize(state.production,state.cars);
state.route=ROUTES.normalize(state.route);
// D2 pending boarding is not a paid trip. Keep it only if the saved route
// remains valid and affordable; invalid pending work restores station crew.
if(state.route.active)state.boarding=null;
else if(state.boarding){
 const previous=state.boarding;
 const recovered=BOARDING.recover(previous,crew,state.cars,
   id=>ROUTES.quote(state.route,state,id).ok);
 if(!recovered){BOARDING.cancel(previous,crew);state.boarding=null;}
 else state.boarding=recovered;
}
// Migrate old free-running prototype saves without inventing a paid-for trip.
if(!state.route.active||ROUTES.pending(state.route))state.moving=false;
// D1 safety migration for legacy active trips. D2 boarding is separate
// and must not disembark early-arriving passengers.
if(!state.boarding){
 TRANSFER.normalize(crew,state.cars,Boolean(state.route.active));
 TRANSIT.synchronize(crew,state.cars,Boolean(state.route.active));
}
const ROUTE_EVENT_LABELS={cache:'Схованка біля колії · +13 металу',rations:'Покинутий склад · +9 припасів',
 breakdown:'Зношені рейки · −9 стану, +5 металу',quiet:'Тихий перехід · до +4 моралі'};
function renderRouteProgress(){
 const p=ROUTES.progress(state.route);
 const r=$('routeProgress'),eta=$('routeEta');
 if(!r||!eta)return;
 r.style.width=(p?Math.floor(p.percent):0)+'%';
 eta.textContent=p?'ДО ПРИБУТТЯ: '+Math.ceil(p.remaining/Math.max(.5,state.speed))+' с':
  state.boarding?'Посадка перед відправленням · без витрат':'Немає активного рейсу';
 if(p)$('travelState').textContent='● '+(state.moving?'У дорозі':'Пауза')+' → '+
   ROUTES.STATIONS[p.to].name+' · '+Math.floor(p.percent)+'%';
}
function renderRouteMap(){
 const s=state.route,active=ROUTES.progress(s);
 $('stationName').textContent=ROUTES.STATIONS[s.stationId].name;
 $('stationSubtitle').textContent=ROUTES.STATIONS[s.stationId].description;
 const stationThumb=$('stationArt');
 if(stationThumb){
  const next=ART.station(s.stationId);
  if(next&&stationThumb.getAttribute('src')!==next)stationThumb.src=next;
  stationThumb.hidden=!next;
 }
 $('routeCount').textContent=s.completed+' завершених рейсів · день '+state.day;
 const last=s.history[s.history.length-1];
 $('routeLastEvent').textContent=last?
  'Остання подія: '+(ROUTE_EVENT_LABELS[last.eventId]||'Прибуття'):'Подій у дорозі ще не було';
 $('routeList').innerHTML=ROUTES.available(s).map(r=>{
  const check=ROUTES.quote(s,state,r.id);
  const title=ROUTES.STATIONS[r.to];
  return '<article class="route-choice">'+ART.image(ART.station(r.to),'route-landmark-art')+
   '<div class="route-location">'+title.name+'</div>'+
   '<p>'+title.description+'</p>'+
   '<small>⛽ '+r.fuel+' палива · ▧ '+r.supplies+' припасів · '+r.duration+' с · '+r.risk+' ризик</small>'+
   '<button type="button" data-route-id="'+r.id+'" '+(check.ok&&!state.boarding?'':'disabled')+
   '>'+(active?'РЕЙС УЖЕ ТРИВАЄ':state.boarding?'ПОСАДКА ТРИВАЄ':check.ok?'ВІДПРАВИТИСЯ':'НЕМАЄ ДОСТУПУ')+'</button></article>';
 }).join('');
 $('routeActive').textContent=active?
  'У дорозі: '+ROUTES.STATIONS[active.from].name+' → '+ROUTES.STATIONS[active.to].name:
  state.boarding?'Посадка · запаси ще не списані':
  'Стоянка · можна обрати наступну станцію';
 $('boardingCancelRoute').hidden=!state.boarding;
 const unresolved=ROUTES.pending(state.route);
 $('routePause').disabled=!active||!!unresolved;
 $('routePause').textContent=unresolved?'⚠ Потрібне рішення':state.moving?'⏸ Призупинити':'▶ Продовжити';
 renderRouteIncident();
 renderRouteProgress();
}
function renderRouteIncident(){
 const node=$('routeIncident');
 if(!node)return;
 const event=ROUTES.pending(state.route);
 if(!event){node.hidden=true;node.innerHTML='';return;}
 node.hidden=false;
 node.innerHTML=ART.image(ART.incident(event.id),'incident-art')+
  '<h4>⚠ '+event.title+'</h4><p>'+event.description+'</p>'+
   '<div class="incident-options">'+event.choices.map(choice=>{
    const quote=ROUTES.choiceStatus(state,choice);
    const detail=Object.entries(choice.delta).map(([key,val])=>{
     const label={metal:'метал',fuel:'паливо',supplies:'припаси',morale:'мораль',condition:'стан'}[key];
     return (val>0?'+':'')+val+' '+label;
    }).join(' · ')||'Без зміни ресурсів';
    return '<button type="button" data-incident-option="'+choice.id+'" '+(quote.ok?'':'disabled')+
     '><strong>'+choice.name+'</strong><small>'+choice.description+'</small><em>'+detail+'</em></button>';
   }).join('')+'</div>';
}
function routeDecision(optionId){
 const result=ROUTES.choose(state.route,state,optionId);
 if(!result.ok){msg(result.reason);renderRouteMap();return false;}
 state.moving=true;
 logEvent(result.event.title+': '+result.option.name);
 setChosen();store();
 msg('Рішення прийнято. Рейс продовжено.');
 return true;
}
function cancelBoarding(){
 if(!state.boarding)return false;
 const reverted=BOARDING.cancel(state.boarding,crew);
 state.boarding=null;state.moving=false;
 armedCrew=null;
 setChosen();renderCrewPanel();store();
 msg(reverted?'Посадку скасовано · запаси не витрачено':'Посадку скасовано');
 return true;
}
function routeStart(id){
 if(state.route.active||state.boarding){msg('Посадка або рейс уже тривають');return false;}
 const check=ROUTES.quote(state.route,state,id);
 if(!check.ok){msg(check.reason);renderRouteMap();return false;}
 const boarding=BOARDING.begin(id,crew,state.cars);
 if(!boarding)return false;
 state.boarding=boarding;state.moving=false;armedCrew=null;
 logEvent('Посадка: '+ROUTES.STATIONS[check.spec.to].name);
 setChosen();renderCrewPanel();store();
 msg('Посадка перед відправленням · '+crew.length+' людини');
 return true;
}
function advanceBoarding(dt){
 if(!state.boarding||state.route.active)return;
 const quote=ROUTES.quote(state.route,state,state.boarding.routeId);
 if(!quote.ok){cancelBoarding();msg('Рейс недоступний: '+quote.reason);return;}
 const done=BOARDING.tick(state.boarding,crew,state.cars,dt);
 if(done.done){
  const depart=ROUTES.start(state.route,state,state.boarding.routeId);
  if(!depart.ok){cancelBoarding();msg(depart.reason);return;}
  state.boarding=null;TRANSIT.synchronize(crew,state.cars,true);
  state.moving=true;
  logEvent('Вирушили: '+ROUTES.STATIONS[depart.trip.from].name+' → '+ROUTES.STATIONS[depart.trip.to].name);
  setChosen();renderCrewPanel();store();
  msg('Усі на борту · паливо −'+depart.cost.fuel+', припаси −'+depart.cost.supplies);
 }else{
  markDirty();
  if(Math.floor((state.boarding.elapsed-dt)*4)!==Math.floor(state.boarding.elapsed*4))updateBoardingHud();
 }
}
function updateBoardingHud(){
 if(!state.boarding)return;
 const count=crew.filter(p=>p.boardingState==='aboard').length;
 $('crewAboard').textContent='ПОСАДКА · '+count+'/'+crew.length;
 $('boardingNotice').textContent='ПОСАДКА · '+count+'/'+crew.length+' на борту';
 $('routeActive').textContent='Посадка · '+count+'/'+crew.length+' на борту';
}
function advanceRoute(dt){
 if(!state.moving||!state.route.active)return;
 const result=ROUTES.advance(state.route,state,dt*state.speed);
 if(!result){renderRouteProgress();markDirty();return;}
 if(result.pending){
  state.moving=false;
  logEvent('⚠ '+result.event.title+' — екіпаж очікує рішення');
  setChosen();store();openSidebar('routes');
  msg('Подія у дорозі: оберіть рішення.');
  return;
 }
 state.moving=false;
 TRANSIT.synchronize(crew,state.cars,false);
 state.day=Math.min(100000,Math.max(1,Math.floor(state.day||1)+1));
 logEvent('Прибуття в «'+ROUTES.STATIONS[result.to].name+'». '+result.event.title);
 setChosen();renderRouteMap();store();
 msg('Прибуття: '+ROUTES.STATIONS[result.to].name+' · '+result.event.title);
}

function renderJournal(){
 const rows=JOURNAL.status(journal,state,crew);
 const root=$('journalList');if(!root)return;
 root.innerHTML=rows.map(q=>{
  const text=q.status==='claimed'?'НАГОРОДУ ОТРИМАНО':q.status==='ready'?'ОТРИМАТИ НАГОРОДУ':'ВИКОНУЄТЬСЯ';
  const rewards=Object.entries(q.reward).map(([key,val])=>'+'+val+' '+({metal:'металу',fuel:'палива',supplies:'припасів',morale:'моралі'}[key])).join(' / ');
  return '<article class="journal-entry '+q.status+'"><div class="journal-title">'+q.name+'</div>'+
   '<p>'+q.description+'</p><div class="journal-progress"><span style="width:'+Math.round(q.progress/q.goal*100)+'%"></span></div>'+
   '<small>'+q.progress+' / '+q.goal+' · '+rewards+'</small>'+
   '<button type="button" data-claim="'+q.id+'" '+(q.status==='ready'?'':'disabled')+'>'+text+'</button></article>';
 }).join('');
 $('journalSummary').textContent=rows.filter(q=>q.status==='claimed').length+' / '+rows.length+' нагород отримано';
}

let saveDirty=true,saveClock=0;
function store(){try{state.crewData=crew.map(p=>({role:p.role,x:p.x,dir:p.dir,phase:p.phase,mode:p.mode,inside:p.inside,
 location:p.location,boardingState:p.boardingState,transfer:p.transfer||null,transition:p.transition,job:p.job,queue:p.queue,progress:p.progress,completed:p.completed,done:p.done,fatigue:p.fatigue,experience:p.experience,exitStartX:p.exitStartX,exitInside:p.exitInside}));state.chosenCrew=chosenCrew;state.events=eventLog;state.journal=journal;state.production=production;localStorage.setItem(KEY,JSON.stringify(state));saveDirty=false}catch{}}
function markDirty(){saveDirty=true}
window.addEventListener('pagehide',store);document.addEventListener('visibilitychange',()=>{if(document.hidden)store()});
const data={};const all=[];function collect(o){if(!o||typeof o!=='object')return;if(o.src)all.push(o.src);Object.values(o).forEach(collect)}collect(m);[...new Set(all)].forEach(src=>{const im=new Image();im.src=src;data[src]=im});
const wagonBadges={
 ready:new Image(),working:new Image(),warning:new Image()
};
wagonBadges.ready.src='assets/ui_alpha/ui/ui_confirm.png';
wagonBadges.working.src='assets/ui_alpha/ui/ui_workshop.png';
wagonBadges.warning.src='assets/ui_alpha/ui/ui_warning.png';
let canvas=$('stage'),c=canvas.getContext('2d'),CW=1200,CH=605,scale=1,offX=0,offY=0;let rects=[];
const CAMERA=globalThis.CaravanV12Camera;
if(!CAMERA)throw new Error('The verified v0.12 camera module must load before app.js');
let camera=CAMERA.mode('train'),cameraTarget={...camera},cameraMode='train';
const pointers=new Map();let gesture=null,pinchStart=null,multiPointer=false;
function cameraHud(){
 const current=currentCar(),slot=selectedSlot(),carTitle=m.wagon[current.kind].title;
 const wagon=$('currentWagon');if(wagon)wagon.textContent='ВАГОН '+(slot+1)+' / '+state.cars.length+' · '+carTitle+' · L'+levelFor(current);
 const zoomValue=$('cameraZoom');if(zoomValue)zoomValue.textContent=Math.round(cameraTarget.zoom*100)+'%';
 const modeLabel=$('cameraMode');if(modeLabel)modeLabel.textContent=({wide:'УВЕСЬ ПОТЯГ',train:'ОГЛЯД ПОТЯГА',wagon:'ОБРАНИЙ ВАГОН',custom:'РУЧНИЙ МАСШТАБ'})[cameraMode]||'КАМЕРА';
 document.querySelectorAll('[data-view-mode]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.viewMode===cameraMode)));
}
function setCameraMode(which){
 const target=CAMERA.mode(which,selectedSlot());
 if(!target)return;
 cameraTarget=target;cameraMode=which;cameraHud();
}
function focusSelectedWagon(){
 cameraTarget=CAMERA.focusWagon(selectedSlot());cameraMode='wagon';cameraHud();
}
function smoothCamera(dt){
 const factor=1-Math.exp(-Math.max(0,Math.min(dt,.05))*9);
 camera=CAMERA.bound({zoom:camera.zoom+(cameraTarget.zoom-camera.zoom)*factor,
 cx:camera.cx+(cameraTarget.cx-camera.cx)*factor,
 cy:camera.cy+(cameraTarget.cy-camera.cy)*factor});
}
function manualZoom(factor,atX=600,atY=302.5){
 camera=CAMERA.zoomAt(camera,camera.zoom*factor,atX,atY);
 cameraTarget={...camera};cameraMode='custom';cameraHud();
}
function canvasLogicalPoint(e){
 const b=canvas.getBoundingClientRect();
 return {x:(e.clientX-b.left-offX)/scale,y:(e.clientY-b.top-offY)/scale};
}
// Small, nonmodal wagon management — worker and room are manipulated in-scene.
let armedCrew=null;
function wagonTarget(){return ['center','rear','tail'][selectedSlot()]||null;}
function renderQuickWagon(){
 const quick=$('wagonQuick');if(!quick||quick.hidden)return;
 const car=currentCar(),slot=selectedSlot(),target=wagonTarget();
 $('quickWagonName').textContent='ВАГОН '+(slot+1)+' · '+m.wagon[car.kind].title+' · L'+levelFor(car);
 const assigned=crew.filter(p=>p.job?.target===target);
 const transfers=crew.filter(p=>p.transfer?.target===target);
 const model=PRODUCTION.inspect(production,state.cars,crew,car.id,state.morale);
 const picture=$('quickRoomPreview'),badge=$('quickRoomState');
 if(picture){
  const src=ART.room(car.kind,m.wagon[car.kind]?.levels?.[0]?.src);
  if(src&&picture.getAttribute('src')!==src)picture.src=src;
  picture.hidden=!src;
 }
 if(model&&badge){
  const st=model.ready>=2?'full':model.ready>0?'ready':
    model.workers.length?'active':'idle';
  badge.dataset.roomState=st;
  badge.textContent=({full:'СКЛАД ПОВНИЙ',ready:'Є ГОТОВА ПАРТІЯ',
    active:'ВИРОБНИЦТВО',idle:'ПРИЗНАЧТЕ ПРАЦІВНИКА'})[st];
 }
 const liveActors=LIFE.build(crew,state.cars).filter(a=>a.carId===car.id);
 $('quickWagonStatus').textContent=(assigned.length?
  'Персонал: '+assigned.map(p=>crewNames[crew.indexOf(p)]).join(', '):
  'Вакантний вагон')+' · місця '+(PRODUCTION.assigned(state.cars,crew,slot).length+transfers.length)+'/'+PRODUCTION.capacity(car)+
  (transfers.length?' · внутрішній перехід '+transfers.map(p=>crewNames[crew.indexOf(p)]).join(', '):'');
 $('quickRoomCrewList').textContent=liveActors.length?
  liveActors.map(a=>crewNames[a.personIndex]+' · '+a.caption).join(' / '):
  'У приміщенні поки нікого немає';
 if(model){
  $('quickProductionName').textContent=model.label+' · '+model.amount+' за партію';
  $('quickProductionProgress').style.width=Math.floor(model.progress*100)+'%';
  $('quickProductionText').textContent=model.ready===2?'Склад заповнений · 2/2':
    model.ready>0?'ГОТОВО '+model.ready+'/2 · '+Math.floor(model.progress*100)+'%':
    model.remaining===null?'Призначте працівника':Math.floor(model.progress*100)+'% · '+model.remaining+' с';
  const collect=$('quickCollect');
  collect.disabled=model.ready===0;
  collect.textContent=model.ready?'ЗІБРАТИ · '+model.ready+' × '+model.amount:'Немає готових партій';
 }
 $('quickWagonCrew').innerHTML=crew.map((p,i)=>{
  const onRoute=Boolean(state.route.active),same=p.job?.target===target;
  const coming=p.transfer?.target===target;
  const duplicate=p.queue?.some(j=>j.target===target);
  const used=onRoute?TRANSFER.occupancy(crew,state.cars,target,i):
    PRODUCTION.assigned(state.cars,crew,slot).filter(worker=>worker!==i).length;
  const full=used>=PRODUCTION.capacity(car);
  const enabled=onRoute?TRANSFER.canStart(crew,state.cars,i,target).ok:
    !(same||duplicate||full||state.boarding);
  const text=coming?'У ПЕРЕХОДІ':same?(p.mode==='resting'?'ВІДПОЧИВАЄ':'ПРАЦЮЄ'):
   onRoute?'ПЕРЕВЕСТИ':duplicate?'У ЧЕРЗІ':p.job?'У ЧЕРГУ':'НАПРАВИТИ';
  return '<button type="button" data-quick-worker="'+i+'" data-state="'+
   (same?'working':coming?'transferring':'idle')+'" '+
   (enabled?'':'disabled')+' aria-label="'+crewNames[i]+' — '+text+'">'+
   crewNames[i]+'<br><small>'+text+'</small></button>';
 }).join('');
}
function showQuickWagon(){
 $('wagonQuick').hidden=false;
 renderQuickWagon();
}
function closeQuickWagon(){$('wagonQuick').hidden=true;}
function touchSceneAt(e){
 const pos=canvasLogicalPoint(e),world=CAMERA.screenToWorld(camera,pos.x,pos.y),
 x=world.x,y=world.y;
 const ci=crew.findIndex(p=>!state.route.active&&!state.boarding&&!['working','resting'].includes(p.mode)&&x>=p.x-3&&x<=p.x+43&&y>=395&&y<=496);
 if(ci>=0){
 chosenCrew=ci;
 armedCrew=ci;
 renderCrewPanel();
 msg(crewNames[ci]+' обраний. Торкніться потрібного вагона.');
 return;
}
 for(const r of rects){
  // Reuse original source-art wagon rectangles; do not infer click regions from the screen's UI boxes.
  if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
   if(r.key!=='engine'){
    state.selectedCarId=r.id;setChosen();focusSelectedWagon();
    if(armedCrew!==null){
     chosenCrew=armedCrew;armedCrew=null;
     assignCrew(wagonTarget());
    }
    showQuickWagon();
    msg('Вагон №'+(selectedSlot()+1)+': '+m.wagon[r.key].title);
   }else msg('Локомотив · рівень L'+state.locoLevel);
   return;
  }
 }
}

let bubbles=[],t=0,last=0,moveAmount=0,videoFrames=0,fps=60,frameTime=0,toastT=0,rosterRefresh=0,checkpoints=0;
function drawImg(meta,x,y,w,h,alpha=1){const im=data[meta?.src];if(im&&im.complete&&im.naturalWidth){c.globalAlpha=alpha;c.drawImage(im,x,y,w,h);c.globalAlpha=1}}
for(const key of Object.keys(m.wagon)){for(const id of ['wagon','newWagon']){const op=document.createElement('option');op.value=key;op.textContent=m.wagon[key].title;$(id).append(op)}}
for(const key of roles){const op=document.createElement('option');op.value=key;op.textContent=m.crew[key].title;$('crewRole').append(op)}
function currentLevel(){return levelFor(currentCar())}
function currentGameLabel(){return crewNames[chosenCrew]+' · '+statusText(crew[chosenCrew])}
function renderCarList(){
 $('carList').innerHTML=state.cars.map((car,i)=>`<button type="button" class="carbutton ${car.id===state.selectedCarId?'selected':''}" data-carid="${car.id}">${i+1}. ${m.wagon[car.kind].title}<br><small>L${levelFor(car)}</small></button>`).join('');
 $('carCapacity').textContent=state.cars.length+' / 3 вагонів';
 $('attachCar').disabled=Boolean(state.boarding||state.route.active)||state.cars.length>=3||state.metal<60;
 $('detachCar').disabled=Boolean(state.boarding||state.route.active)||state.cars.length<=1;
 $('tailAssignment').disabled=state.cars.length<3;
}
function setChosen(){const car=currentCar();const key=car.kind;
 const indicator=$('crewAboard');
 if(indicator){
  const count=crew.filter(p=>p.inside===1 && p.location?.kind!=='platform').length;
  const phase=TRANSIT.phase(Boolean(state.route.active),state.moving,Boolean(ROUTES.pending(state.route)));
  indicator.textContent=state.boarding?'ПОСАДКА · '+crew.filter(p=>p.boardingState==='aboard').length+'/'+crew.length:
   state.route.active?'НА БОРТУ '+count+'/'+crew.length+' · '+({
   TRAVELLING:'В ДОРОЗІ',PAUSED_MANUAL:'ПАУЗА',PAUSED_EVENT:'ПОДІЯ'
  }[phase]||'В ДОРОЗІ'):'СТАНЦІЯ · ЕКІПАЖ '+crew.length;
 }
 $('wagon').value=key;$('crewRole').value=state.crew;$('timeMode').value=state.night?'night':'sunset';$('effects').checked=state.effects;
 $('levelState').textContent='L'+levelFor(car)+(levelFor(car)===2?' · посилений':' · базовий');
 $('chosenName').textContent=m.wagon[key].title;$('chosenDesc').textContent=descriptions[key]||'';
 $('upgrade').disabled=levelFor(car)===2||state.metal<35;
 $('upgrade').textContent=levelFor(car)===2?'✓ Максимальний L2':'⬆ Поліпшити · 35 ⚙';
 $('locoLevel').textContent='L'+state.locoLevel+' / 4';
 $('locoUpgrade').disabled=state.locoLevel>=4||state.metal<80||state.fuel<12;
 $('locoUpgrade').textContent=state.locoLevel>=4?'✓ Максимальний L4':'⬆ Локомотив · 80 ⚙ / 12 ⛽';
 $('metal').textContent=Math.round(state.metal);$('fuel').textContent=Math.round(state.fuel);
 $('supplies').textContent=Math.round(state.supplies);$('morale').textContent=Math.round(state.morale);
 const p=ROUTES.progress(state.route);
 $('travel').textContent=state.boarding?'ПОСАДКА · '+crew.filter(p=>p.boardingState==='aboard').length+'/'+crew.length:
  ROUTES.pending(state.route)?'⚠ ОБРАТИ РІШЕННЯ':
  p?(state.moving?'⏸ Пауза':'▶ Продовжити'):'▶ Обрати рейс';
 $('travelState').textContent=p?'● '+(state.moving?'У дорозі':'Пауза')+' → '+ROUTES.STATIONS[p.to].name:
   state.boarding?'● Посадка перед відправленням':
   '● Станція «'+ROUTES.STATIONS[state.route.stationId].name+'»';
 $('boardingNotice').hidden=!state.boarding;
 $('boardingCancel').hidden=!state.boarding;
 if(state.boarding)updateBoardingHud();
 $('speedLabel').textContent=state.speed.toFixed(1)+'×';$('base').style.borderColor=levelFor(car)===1?'#e2a867':'#5b6066';
 renderCarList();cameraHud();renderJournal();renderRouteMap();
 if(globalThis.CaravanApprovedUI)globalThis.CaravanApprovedUI.refresh(state);
 renderQuickWagon();
 markDirty();}
function msg(s){const el=$('toast');el.textContent=s;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2050)}
function logEvent(text){eventLog.unshift(text);eventLog=eventLog.slice(0,8);markDirty()}
function statusText(p){
 if(p.mode==='transferring'&&p.transfer){
  const target=LOCATIONS[p.transfer.target]?.label||'інший вагон';
  return 'Усередині потяга → '+target+' · '+Math.floor(p.transfer.progress*100)+'%';
 }
 if(state.boarding&&p.boardingState==='approaching')return 'Посадка · іде до входу';
 if(state.boarding&&p.boardingState==='entering')return 'Посадка · заходить усередину';
 if(state.boarding&&p.boardingState==='aboard')return 'Готовий до рейсу';
 if(state.route.active && p.mode==='aboard')return 'На борту · очікує у службовій зоні';
 if(p.mode==='resting')return 'Відпочиває у вагоні · сили відновлюються';
  if(state.route.active && p.mode==='working')return 'Працює всередині · '+Math.floor(p.progress*100)+'%';
 if(p.mode==='walking')return 'Прямує до входу: '+LOCATIONS[p.job.target].label;if(p.mode==='entering')return 'Заходить усередину вагона';if(p.mode==='working')return 'Працює всередині · '+Math.floor(p.progress*100)+'%';if(p.mode==='exiting')return 'Виходить із вагона';if(p.mode==='completed')return 'Завершив завдання · '+Math.max(0,3-Math.floor(p.completed))+' с';return 'Патрулює платформу'}
function renderCrewPanel(){const html=crew.map((p,i)=>{const pct=p.mode==='working'?Math.floor(p.progress*100):0;const well=WELLBEING.describe(p,state.cars);const energy='<small class="crew-fatigue '+(well.fatigue>=65?'crew-fatigue-high':'')+'">Втома '+well.fatigue+'% · продуктивність '+well.efficiency+'%</small>';const skill='<small class="crew-growth">Рівень '+well.level+' · досвід '+well.xp+(well.next===null?' · MAX':' / '+well.next)+'</small>';const queue=p.queue.length?`<small class="queued">У черзі: ${p.queue.map(j=>LOCATIONS[j.target].label).join(' → ')}</small>`:'';return `<button type="button" class="crewitem ${i===chosenCrew?'active':''}" data-crew="${i}"><span><strong>${crewNames[i]} · ${m.crew[p.role].title}</strong><small>${statusText(p)}</small>${energy}${skill}${p.mode==='working'?`<span class="progressTrack"><span class="progressFill" style="width:${pct}%"></span></span>`:''}${queue}</span><span class="symbol">${crewSymbols[i]}</span></button>`}).join('');if($('crewList').innerHTML!==html)$('crewList').innerHTML=html;$('crewSummary').textContent=currentGameLabel()+(eventLog[0]?' • '+eventLog[0]:'');$('cancelJob').disabled=!crew[chosenCrew].job&&!crew[chosenCrew].queue.length;$('crewHome').disabled=Boolean(state.route.active||state.boarding)||(crew[chosenCrew].mode==='patrol'&&!crew[chosenCrew].queue.length);
 $('cancelJob').disabled=Boolean(state.route.active||state.boarding)||(!crew[chosenCrew].job&&!crew[chosenCrew].queue.length);
 const restSeat=state.cars.some((car,i)=>['quarters','barracks'].includes(car.kind)&&
  (TRANSFER.occupancy(crew,state.cars,['center','rear','tail'][i],chosenCrew)<PRODUCTION.capacity(car)||
   crew[chosenCrew]?.job?.target===['center','rear','tail'][i]));
 $('sendCrewRest').disabled=Boolean(state.boarding)||!restSeat||
  crew[chosenCrew]?.mode==='resting'||crew[chosenCrew]?.mode==='transferring';
}
$('crewList').onclick=e=>{const btn=e.target.closest('[data-crew]');if(!btn)return;chosenCrew=+btn.dataset.crew;markDirty();renderCrewPanel();msg('Обрано: '+crewNames[chosenCrew])};
function startExit(p){p.exitStartX=p.x;p.exitInside=p.inside;p.mode='exiting';p.transition=0;p.progress=0}
function beginJob(p,job){p.job=job.duty==='rest'?{target:job.target,duty:'rest'}:{target:job.target};p.mode='walking';p.progress=0;p.transition=0;p.inside=0;p.completed=0;p.dir=LOCATIONS[job.target].door>p.x?1:-1;markDirty()}
function assignCrew(target){
 if(state.boarding){msg('Призначення доступне після скасування посадки');return false;}
 if(state.route.active){
  if(target==='engine'){msg('Ремонт локомотива виконується після прибуття');return false;}
  const result=TRANSFER.start(crew,state.cars,chosenCrew,target);
  if(!result.ok){
   msg(({full:'Робочі місця зайняті','same-room':'Працівник уже в цьому вагоні',
     'already-transferring':'Перехід уже виконується',
     'not-onboard':'Працівник не на борту'}[result.reason]||'Переведення недоступне'));
   return false;
  }
  logEvent(crewNames[chosenCrew]+': внутрішній перехід у '+LOCATIONS[target].label);
  msg(crewNames[chosenCrew]+': перехід усередині · '+Math.ceil(result.duration)+' с');
  renderCrewPanel();renderQuickWagon();store();return true;
 }
 if(target==='tail'&&state.cars.length<3){msg('Третій вагон ще не причеплено');return false;}
 if(target==='rear'&&state.cars.length<2){msg('Другого вагона немає');return false;}
 const p=crew[chosenCrew],ix=['center','rear','tail'].indexOf(target);
 if(ix>=0){
  const car=state.cars[ix],currently=PRODUCTION.assigned(state.cars,crew,ix);
  if(!car||!PRODUCTION.RULES[car.kind])return false;
  if(p.job?.target===target||p.queue.some(j=>j.target===target))return false;
  if(currently.length>=PRODUCTION.capacity(car)){
   msg('Немає вільного робочого місця у вагоні');return false;
  }
  // Reassign through the original door animation. Remove all stale queues:
  // the worker is never counted for production in two wagons simultaneously.
  p.queue=[];
  if(p.job&&(p.mode==='entering'||p.mode==='working'||p.mode==='resting'||p.mode==='exiting')){
   if(p.mode!=='exiting')startExit(p);
   p.queue.push({target});
   msg(crewNames[chosenCrew]+': завершить вихід і перейде у '+LOCATIONS[target].label);
  }else{
   beginJob(p,{target});
   msg(crewNames[chosenCrew]+': прямує до '+LOCATIONS[target].label);
  }
 }else{
  // Engine retains its existing one-off repair task; no wagon production.
  if(!p.job)beginJob(p,{target});
  else if(p.queue.length<3)p.queue.push({target});
  else{msg('Черга переповнена');return false;}
 }
 logEvent(crewNames[chosenCrew]+': '+LOCATIONS[target].label);
 renderCrewPanel();renderQuickWagon();store();return true;
}
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>assignCrew(b.dataset.target));
$('cancelJob').onclick=()=>{if(state.route.active||state.boarding){msg('Зміну доручення дозволено після скасування посадки або прибуття');return;}const p=crew[chosenCrew];if(p.queue.length){const j=p.queue.pop();msg('Скасовано останнє доручення: '+LOCATIONS[j.target].label)}else if(p.job){if(p.inside>0||p.mode==='working'||p.mode==='entering'){startExit(p)}else{p.mode='patrol';p.job=null}msg('Поточну роботу припинено')}renderCrewPanel();store()};
$('crewHome').onclick=()=>{if(state.route.active||state.boarding){msg('Під час посадки та рейсу екіпаж прямує на борт');return;}const p=crew[chosenCrew];p.queue=[];if(p.job&&(p.mode==='entering'||p.mode==='working'||p.mode==='exiting')){startExit(p)}else{p.job=null;p.mode='patrol';p.inside=0}renderCrewPanel();store();msg(crewNames[chosenCrew]+': повертається на патруль')};
function closeSidebar(){$('sidebar').classList.remove('open');$('sidebarBackdrop').hidden=true;$('togglePanel').setAttribute('aria-expanded','false')}
function openSidebar(section){
 const compact=window.matchMedia('(max-width:1050px)').matches;
 if(compact){
  $('sidebar').classList.add('open');$('sidebarBackdrop').hidden=false;
  $('togglePanel').setAttribute('aria-expanded','true');
 }
 requestAnimationFrame(()=>{
  const box=$('sidebar');
  const target=section==='crew'?'crewpanel':section==='journal'?'journalPanel':section==='routes'?'routePanel':null;
  if(target){
   box.scrollTop+= $(target).getBoundingClientRect().top-box.getBoundingClientRect().top-64;
  }else box.scrollTop=0;
 });
}
$('sidebarBackdrop').addEventListener('click',closeSidebar);$('closeSidebar').addEventListener('click',closeSidebar);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
$('quickWagonClose').onclick=closeQuickWagon;
$('quickCollect').onclick=()=>{
 const car=currentCar();
 const reward=PRODUCTION.collect(production,state,car);
 if(!reward){msg('Готової продукції поки немає');return;}
 logEvent('Вагон «'+m.wagon[car.kind].title+'»: зібрано '+reward.amount+' '+reward.resource);
 setChosen();store();
 msg('Зібрано '+reward.amount+' '+({metal:'металу',fuel:'палива',supplies:'припасів',morale:'моралі',condition:'стану'}[reward.resource]));
};
$('quickWagonDetails').onclick=()=>{closeQuickWagon();openSidebar('modules');};
$('quickWagonCrew').addEventListener('click',e=>{
 const button=e.target.closest('[data-quick-worker]');
 if(!button||button.disabled)return;
 chosenCrew=Number(button.dataset.quickWorker);
 armedCrew=null;
 const target=wagonTarget();
 if(target)assignCrew(target);
 renderQuickWagon();
});
$('tasksOpen').onclick=()=>openSidebar('crew');
$('journalOpen').onclick=()=>{renderJournal();openSidebar('journal');};
$('routeOpen').onclick=()=>{renderRouteMap();openSidebar('routes');};
$('routeIncident').addEventListener('click',e=>{
 const button=e.target.closest('[data-incident-option]');
 if(!button||button.disabled)return;
 routeDecision(button.dataset.incidentOption);
});
$('routeList').addEventListener('click',e=>{
 const b=e.target.closest('[data-route-id]');
 if(!b||b.disabled)return;
 if(routeStart(b.dataset.routeId)&&window.matchMedia('(max-width:1050px)').matches)closeSidebar();
});
$('boardingCancel').onclick=cancelBoarding;
$('boardingCancelRoute').onclick=cancelBoarding;
$('routePause').onclick=()=>{
 if(!state.route.active||ROUTES.pending(state.route))return;
 state.moving=!state.moving;setChosen();store();
};
$('journalList').addEventListener('click',event=>{
 const button=event.target.closest('[data-claim]');
 if(!button||button.disabled)return;
 const reward=JOURNAL.claim(journal,state,crew,button.dataset.claim);
 if(!reward)return;
 setChosen();store();renderJournal();
 msg('Нагороду отримано. Ресурси зараховано лише один раз.');
});
$('wagon').onchange=e=>{if(state.route.active||state.boarding){e.target.value=currentCar().kind;msg('Зміна вагона після скасування посадки або прибуття');return;}currentCar().kind=e.target.value;production=PRODUCTION.normalize(production,state.cars);setChosen();store();msg('Тип вагона: '+m.wagon[e.target.value].title)};
$('newWagon').value='salvage';
$('carList').onclick=e=>{const b=e.target.closest('[data-carid]');if(!b)return;state.selectedCarId=b.dataset.carid;setChosen();focusSelectedWagon();msg('Обрано вагон №'+(selectedSlot()+1))};
$('attachCar').onclick=()=>{if(state.route.active||state.boarding){msg('Причеплення до посадки або після прибуття');return;}if(state.cars.length>=3||state.metal<60)return;state.metal-=60;const kind=$('newWagon').value;const id='c'+state.nextCarId++;state.cars.push({id,kind,level:1});production=PRODUCTION.normalize(production,state.cars);state.selectedCarId=id;setChosen();store();msg('Причеплено вагон: '+m.wagon[kind].title)};
$('detachCar').onclick=()=>{
 if(state.route.active||state.boarding){msg('Не можна відчеплювати вагон під час посадки чи рейсу');return;}
 if(state.cars.length<=1)return;
 const ix=selectedSlot(),car=state.cars.splice(ix,1)[0];
 state.selectedCarId=state.cars[Math.max(0,ix-1)].id;
 // Slot coordinates changed: clear unsafe crew assignments instead of silently
 // counting one employee in a different wagon after detach.
 for(const p of crew){
  p.queue=[];
  if(p.job?.target!=='engine'){p.job=null;p.mode='patrol';p.inside=0;p.progress=0;}
 }
 production=PRODUCTION.normalize(production,state.cars);
 closeQuickWagon();setChosen();renderCrewPanel();store();
 msg('Відчеплено: '+m.wagon[car.kind].title+' · призначте екіпаж повторно');
};
$('locoUpgrade').onclick=()=>{if(state.locoLevel>=4||state.metal<80||state.fuel<12)return;state.metal-=80;state.fuel-=12;state.locoLevel++;setChosen();store();msg('Новий корпус локомотива · L'+state.locoLevel)};

$('crewRole').onchange=e=>{state.crew=e.target.value;crew[0].role=state.crew;renderCrewPanel();setChosen()};
$('timeMode').onchange=e=>{state.night=e.target.value==='night';setChosen()};$('effects').onchange=e=>{state.effects=e.target.checked;setChosen()};
$('travel').onclick=()=>{
 if(state.boarding){msg('Посадка триває · скористайтеся кнопкою скасування');return;}
 if(!state.route.active||ROUTES.pending(state.route)){
  renderRouteMap();openSidebar('routes');return;
 }
 state.moving=!state.moving;setChosen();store();
};$('slower').onclick=()=>{state.speed=Math.max(.5,Math.round((state.speed-.25)*4)/4);setChosen()};$('faster').onclick=()=>{state.speed=Math.min(3,Math.round((state.speed+.25)*4)/4);setChosen()};
$('newCrew').onclick=()=>{chosenCrew=(chosenCrew+1)%3;renderCrewPanel();markDirty();msg('Обрано: '+crewNames[chosenCrew])};
$('upgrade').onclick=()=>{const car=currentCar();if(levelFor(car)===2)return;if(state.metal<35){msg('Недостатньо металу');return}state.metal-=35;car.level=2;setChosen();store();msg('Вагон №'+(selectedSlot()+1)+' посилено до L2!')};
$('base').onclick=()=>{currentCar().level=1;setChosen();store()};
$('reset').onclick=()=>{armedCrew=null;closeQuickWagon();state=defaultState();crew=makeCrew();chosenCrew=0;eventLog=[];journal=JOURNAL.normalize(null);production=PRODUCTION.normalize(null,state.cars);state.route=ROUTES.normalize(null);setChosen();renderCrewPanel();store();msg('Тестовий прогрес скинуто')};
$('fit').onclick=()=>setCameraMode('wide');
$('cameraOut').onclick=()=>manualZoom(1/1.2);
$('cameraIn').onclick=()=>manualZoom(1.2);
document.querySelectorAll('[data-view-mode]').forEach(btn=>{
 btn.onclick=()=>setCameraMode(btn.dataset.viewMode);
});
$('sendCrewToCar').onclick=()=>{
 const ix=selectedSlot(),target=['center','rear','tail'][ix];
 assignCrew(target);
 openSidebar('crew');
};

$('togglePanel').onclick=()=>{if($('sidebar').classList.contains('open'))closeSidebar();else openSidebar('modules')};
function fit(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(Math.max(200,r.width)*dpr);canvas.height=Math.round(Math.max(160,r.height)*dpr);const W=canvas.width/dpr,H=canvas.height/dpr,cinematic=W/H>2.6;scale=cinematic?W/CW:Math.min(W/CW,H/CH);offX=(W-CW*scale)/2;offY=cinematic?H*.51-345*scale:(H-CH*scale)/2;c.setTransform(dpr,0,0,dpr,0,0)}window.addEventListener('resize',fit);
canvas.style.touchAction='none';
canvas.addEventListener('pointerdown',e=>{
 e.preventDefault();
 canvas.setPointerCapture(e.pointerId);
 const pos=canvasLogicalPoint(e);
 pointers.set(e.pointerId,pos);
 if(pointers.size===1){
  gesture={pointerId:e.pointerId,start:pos,last:pos,moved:false};
  multiPointer=false;
 }else{
  multiPointer=true;gesture=null;
  if(pointers.size===2){
   pinchStart={camera:{...camera},fingers:[...pointers.values()].map(p=>({...p}))};
  }else pinchStart=null;
 }
});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 const prev=pointers.get(e.pointerId),now=canvasLogicalPoint(e);
 pointers.set(e.pointerId,now);
 if(pointers.size===2){
  // Fixed gesture anchor avoids zoom drift when fingers move in separate Android events.
  if(pinchStart){
   const current=[...pointers.values()];
   camera=CAMERA.pinch(pinchStart.camera,
     pinchStart.fingers[0],pinchStart.fingers[1],current[0],current[1]);
   cameraTarget={...camera};cameraMode='custom';cameraHud();
  }
  multiPointer=true;return;
 }
 if(pointers.size!==1||!gesture)return;
 if(Math.hypot(now.x-gesture.start.x,now.y-gesture.start.y)>8)gesture.moved=true;
 if(gesture.moved){
  camera=CAMERA.pan(camera,now.x-prev.x,now.y-prev.y);
  cameraTarget={...camera};cameraMode='custom';cameraHud();
 }
 gesture.last=now;
});
function finishPointer(e,cancelled){
 if(!pointers.has(e.pointerId))return;
 const single=pointers.size===1,dragged=!!gesture?.moved;
 pointers.delete(e.pointerId);
 if(single&&!multiPointer&&!dragged&&!cancelled)touchSceneAt(e);
 if(pointers.size===1){
  const p=[...pointers.entries()][0];
  gesture={pointerId:p[0],start:p[1],last:p[1],moved:true};
  pinchStart=null;
 }else if(!pointers.size){gesture=null;pinchStart=null;multiPointer=false;}
}
canvas.addEventListener('pointerup',e=>finishPointer(e,false));
canvas.addEventListener('pointercancel',e=>finishPointer(e,true));
canvas.addEventListener('lostpointercapture',e=>finishPointer(e,true));
canvas.addEventListener('wheel',e=>{
 e.preventDefault();
 const p=canvasLogicalPoint(e);
 manualZoom(e.deltaY<0?1.12:1/1.12,p.x,p.y);
},{passive:false});
function circle(x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()}
function applyReward(p,i){let reward='';const target=p.job?.target;
 const car=target==='center'?carAtSlot(0):target==='rear'?carAtSlot(1):target==='tail'?carAtSlot(2):null;
 const mul=car?.level===2?1.5:1;
 if(target==='engine'||p.role==='mechanic'||p.role==='driver'){state.condition=Math.min(100,state.condition+Math.round(12*mul));reward='Стан потяга +'+Math.round(12*mul)}
 else if(car?.kind==='greenhouse_plus'||car?.kind==='greenhouse'||car?.kind==='kitchen'){state.supplies+=Math.round(9*mul);reward='Припаси +'+Math.round(9*mul)}
 else if(car?.kind==='reactor'||car?.kind==='power'){state.fuel+=Math.round(7*mul);reward='Паливо +'+Math.round(7*mul)}
 else if(car?.kind==='salvage'||car?.kind==='cargo'){state.metal+=Math.round(10*mul);reward='Метал +'+Math.round(10*mul)}
 else if(p.role==='medic'||car?.kind==='medic'||car?.kind==='barracks'||car?.kind==='quarters'){state.morale=Math.min(100,state.morale+Math.round(10*mul));reward='Мораль +'+Math.round(10*mul)}
 else {state.metal+=Math.round(6*mul);reward='Метал +'+Math.round(6*mul)}
 p.done++;logEvent(crewNames[i]+': '+reward);setChosen();msg(crewNames[i]+': '+reward);store();}
function finishJob(p,i){
 applyReward(p,i);
 if(state.route.active){
  // Engine repairs remain one-shot. Completing them must NEVER restart the
  // same work inside an active trip or produce repeated rewards.
  p.job=null;p.queue=[];p.mode='aboard';p.inside=1;p.progress=0;
  p.boardingState='aboard';p.location={kind:'locomotive',carId:null};
 }else{startExit(p);p.progress=1;}
 markDirty();
}
function nextOrPatrol(p){p.job=null;p.inside=0;p.completed=0;p.progress=0;p.transition=0;if(p.queue.length){const next=p.queue.shift();beginJob(p,next)}else{p.mode='patrol';p.dir=p.x>=850?-1:1}markDirty()}
function update(dt){
 t+=dt;advanceBoarding(dt);advanceRoute(dt);
 const moved=TRANSFER.advance(crew,state.cars,dt);
 if(moved.changed){
  markDirty();
  if(moved.finished.length){
   for(const index of moved.finished)
    logEvent(crewNames[index]+': внутрішній перехід завершено');
   renderCrewPanel();store();
  }
 }
 const onboard=state.boarding?{changed:false}:
  TRANSIT.synchronize(crew,state.cars,Boolean(state.route.active));
 if(onboard.changed)markDirty();
 moveAmount+=dt*(state.moving?state.speed:0);const speed=state.moving?state.speed:0;
 for(let i=0;i<crew.length;i++){const p=crew[i];p.phase=p.phase||i*.85;
 if(p.mode==='walking'&&p.job){const delta=LOCATIONS[p.job.target].door-p.x,step=(p.role==='guard'?108:94)*dt;if(Math.abs(delta)<=step){p.x=LOCATIONS[p.job.target].door;p.mode='entering';p.transition=0;p.inside=0}else{p.dir=delta>0?1:-1;p.x+=p.dir*step}markDirty()}
 else if(p.mode==='entering'&&p.job){p.transition=Math.min(1,p.transition+dt/1.35);const easing=p.transition*p.transition*(3-2*p.transition),loc=LOCATIONS[p.job.target];p.x=loc.door+(loc.work-loc.door)*easing;p.inside=easing;if(p.transition>=1){p.mode='working';p.inside=1;p.progress=0}markDirty()}
 else if(p.mode==='working'&&p.job){
  if(p.job.target!=='engine'){
   // Permanent wagon assignment: no legacy applyReward and no forced exit.
   const ix=['center','rear','tail'].indexOf(p.job.target);
   const car=state.cars[ix],row=car&&production.rows[car.id];
   p.progress=row?.progress||0;
  }else{
   p.progress=Math.min(1,p.progress+dt/(p.role==='mechanic'?8:p.role==='medic'?7:6));
   if(p.progress>=1)finishJob(p,i);
  }
  markDirty();
 }
 else if(p.mode==='exiting'&&p.job){p.transition=Math.min(1,p.transition+dt/1.2);const easing=p.transition*p.transition*(3-2*p.transition),loc=LOCATIONS[p.job.target];p.x=p.exitStartX+(loc.door-p.exitStartX)*easing;p.inside=p.exitInside*(1-easing);if(p.transition>=1){p.mode='completed';p.completed=0;p.inside=0}markDirty()}
 else if(p.mode==='completed'){p.completed+=dt;if(p.completed>=2.8)nextOrPatrol(p);markDirty()}
 else if(p.mode==='aboard'){
  // Passenger is inside the locomotive. No exterior patrol or rewards.
  p.inside=1;
 }
 else if(p.mode==='transferring'){
  // Moved by internal_transfer.js; no exterior walking, no production.
  p.inside=1;
 }
 else if(p.mode==='boarding'){
  // The pure boarding controller already advanced this animation.
 }
 else{p.x+=p.dir*(p.role==='guard'?23:17);if(p.x<245){p.x=245;p.dir=1}if(p.x>1100){p.x=1100;p.dir=-1}markDirty()}}
 // Guard even against a legacy animation that completed mid-frame.
 const checked=state.boarding?{changed:false}:
   TRANSIT.synchronize(crew,state.cars,Boolean(state.route.active));
 if(checked.changed)markDirty();
 // Advance once per frame; production ONLY accumulates claimable batches.
 // Original repair tasks remain available for the locomotive, not wagons.
 const batches=PRODUCTION.advance(production,state.cars,crew,dt,state.morale);
 if(batches.length){
  for(const batch of batches){
   for(const ix of batch.crewIndices)crew[ix].done=(crew[ix].done||0)+1;
   logEvent('Готова партія · '+m.wagon[state.cars[batch.index].kind].title);
  }
  markDirty();store();
 }
 if(WELLBEING.advance(crew,state.cars,dt))markDirty();
 if(state.effects){const target=state.moving?13*state.speed:2.3;if(Math.random()<target*dt){bubbles.push({x:193+Math.random()*11,y:289,r:7+Math.random()*3,life:0,vx:20+speed*65+Math.random()*13,vy:26+Math.random()*11,opacity:.23+Math.random()*.15})}for(const p of bubbles){p.life+=dt;p.x+=dt*p.vx;p.y-=dt*p.vy;p.r+=dt*13}bubbles=bubbles.filter(p=>p.life<3.4)}else bubbles=[];
 rosterRefresh+=dt;if(rosterRefresh>.35){renderCrewPanel();renderQuickWagon();rosterRefresh=0}saveClock+=dt;if(saveClock>1.2){if(saveDirty)store();saveClock=0}}
function renderCharacter(p,i){const isWalking=p.mode==='walking'||p.mode==='patrol'||p.mode==='entering'||p.mode==='exiting'||(p.mode==='boarding'&&p.boardingState==='approaching');const frames=m.crew[p.role]?.[isWalking?'walk':'idle'];if(!frames?.length)return;const idx=Math.floor((t+p.phase)*(isWalking?9:3))%frames.length,im=frames[idx];const cx=p.x,inside=p.inside||0;const factor=1-.26*inside,h=91*factor,w=43*factor,by=492-inside*50,bounce=isWalking?Math.abs(Math.sin((t+p.phase)*9))*2:Math.sin(t*3+i)*.3;
 c.fillStyle=`rgba(0,0,0,${(0.48-.2*inside).toFixed(3)})`;c.beginPath();c.ellipse(cx+17,by,22*factor,5,0,0,6.283);c.fill();
 c.save();if(p.dir<0){c.translate(cx+w,0);c.scale(-1,1);drawImg(im,0,by-h-bounce,w,h)}else drawImg(im,cx,by-h-bounce,w,h);c.restore();
 if(i===chosenCrew){c.strokeStyle='#ffd391';c.lineWidth=2;c.setLineDash([4,3]);c.strokeRect(cx-3,by-h-4,w+6,h+8);c.setLineDash([])}
 if(p.mode==='working'){const jx=cx+14,jy=by-h-9;c.fillStyle='rgba(10,18,26,.85)';c.fillRect(jx-27,jy-12,62,12);c.fillStyle='#eec286';c.fillRect(jx-25,jy-10,58*p.progress,7);if(state.effects){for(let q=0;q<4;q++){const px=jx+Math.sin(t*13+q*2.2)*13,py=by-h*.47+Math.cos(t*11+q)*9;circle(px,py,1.4+q*.3,'rgba(255,188,79,.82)')}}}
 else if(p.mode==='boarding'){c.fillStyle='#ffdfad';c.font='bold 11px system-ui';c.fillText('ПОСАДКА',cx-3,by-h-9)}
 else if(p.mode==='walking'){c.fillStyle='#ffdfad';c.font='bold 15px system-ui';c.fillText('➜',cx+8,by-h-9)}
 else if(p.mode==='entering'||p.mode==='exiting'){c.fillStyle='#ffd69a';c.font='bold 11px system-ui';c.fillText(p.mode==='entering'?'ВХІД':'ВИХІД',cx,by-h-9)}
 else if(p.mode==='completed'){c.fillStyle='#a8e8b6';c.font='bold 17px system-ui';c.fillText('✓',cx+12,by-h-9)}
}
// D3 crew lives inside the existing approved v0.12 cutaway sprites.
// This is presentation only; workers, production and saved state are untouched.
// D4: individual motion and work cues follow the painted equipment for each
// cutaway kind. Keep the original character artwork and clip to the room.
function drawInteriorLife(){
 const actors=LIFE.build(crew,state.cars);
 for(const actor of actors){
  const person=crew[actor.personIndex];
  const frames=m.crew[person.role]?.idle;
  if(!frames?.length)continue;
  const motion=LIFE.pose(actor,t);
  const sprite=frames[Math.floor((t+(person.phase||0))*motion.frameRate)%frames.length];
  const bounds=actor.bounds;
  c.save();
  // Crossing between cars is shown as an in-room fade: never on the tracks.
  if(actor.activity==='transfer'){
   const progress=Math.max(0,Math.min(1,crew[actor.personIndex].transfer?.progress||0));
   c.globalAlpha=.38+.48*Math.abs(progress-.5);
  }
  c.beginPath();c.rect(bounds.x,bounds.y,bounds.w,bounds.h);c.clip();
  // Existing amber lamps and scene highlights remain visible. A gentle
  // localized glow signals interaction without introducing new UI icons.
  if(state.effects){
   const r=Math.max(20,actor.height*.88);
   const glow=c.createRadialGradient(actor.fxX,actor.fxY,1,actor.fxX,actor.fxY,r);
   const alpha=Math.max(0,Math.min(.36,motion.light));
   const warm=actor.activity==='repair'?'232,162,84':
     actor.activity==='care'?'140,204,141':
     actor.activity==='watch'?'125,186,177':'240,182,113';
   glow.addColorStop(0,'rgba('+warm+','+alpha.toFixed(3)+')');
   glow.addColorStop(1,'rgba('+warm+',0)');
   c.fillStyle=glow;c.fillRect(bounds.x,bounds.y,bounds.w,bounds.h);
  }
  c.fillStyle='rgba(2,9,13,.34)';
  c.beginPath();c.ellipse(actor.x+actor.width*.5,actor.y+actor.height-1,actor.width*.62,3,0,0,6.283);c.fill();
  // Rotate around the feet, not the head: the figure appears to lean to a
  // bench or watch a panel and cannot jump out of the cutout.
  c.save();
  const footX=actor.x+actor.width*.5,footY=actor.y+actor.height;
  c.translate(footX,footY);
  c.rotate(motion.angle);
  c.scale(1,motion.stretchY);
  drawImg(sprite,-actor.width*.5+motion.shiftX,
    -actor.height+motion.shiftY,actor.width,actor.height);
  c.restore();
  // Detail cues timed to actual activity. They are atmosphere only, not
  // collectible resource counters or alternate quest/currency icons.
  if(state.effects){
   const f=motion.flare;
   if(actor.activity==='repair'&&f>.05){
    for(let n=0;n<3;n++){
     const x=actor.fxX+Math.sin(t*7+n*2)*4;
     const y=actor.fxY+Math.cos(t*11+n*2)*4;
     circle(x,y,(.9+n*.27)*f+.3,'rgba(255,198,106,.82)');
    }
   }else if(actor.activity==='care'&&f>.1){
    c.strokeStyle='rgba(169,220,167,'+(.2+f*.34).toFixed(2)+')';
    c.lineWidth=1.1;c.beginPath();
    c.moveTo(actor.fxX-3,actor.fxY+5);
    c.quadraticCurveTo(actor.fxX+Math.sin(t*2)*3,actor.fxY-4,actor.fxX+3,actor.fxY-8);
    c.stroke();
   }else if(actor.activity==='watch'){
    const angle=Math.sin(t*.85+actor.personIndex)*.55;
    c.strokeStyle='rgba(157,210,195,'+(.15+f*.25).toFixed(2)+')';
    c.lineWidth=.9;c.beginPath();c.moveTo(actor.fxX,actor.fxY);
    c.lineTo(actor.fxX+Math.cos(angle)*13,actor.fxY-8+Math.sin(angle)*4);c.stroke();
   }else if(actor.activity==='rest'){
    // Slow rise-and-fall in the shoulder line suggests breathing.
    c.strokeStyle='rgba(252,218,168,.13)';c.lineWidth=.7;
    c.beginPath();c.moveTo(actor.x+4,actor.y+10+motion.shiftY);
    c.lineTo(actor.x+actor.width-4,actor.y+10+motion.shiftY);c.stroke();
   }
  }
  if(cameraMode==='wagon'&&state.selectedCarId===actor.carId){
   c.font='bold 9px system-ui';c.fillStyle='#f1ddb4';
   c.fillText(crewNames[actor.personIndex],actor.x-6,actor.y-3);
  }
  c.restore();
 }
 return actors;
}
function paint(){const logicalScale=scale;c.setTransform(canvas.width/(canvas.clientWidth||1),0,0,canvas.height/(canvas.clientHeight||1),0,0);c.fillStyle='#07131a';c.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);c.translate(offX,offY);c.scale(logicalScale,logicalScale);c.save();c.beginPath();c.rect(0,0,CW,CH);c.clip();
 c.translate(CW/2,CH/2);c.scale(camera.zoom,camera.zoom);c.translate(-camera.cx,-camera.cy);
 const bg=data[m.background.src];if(bg?.complete&&bg.naturalWidth){const bx=-62+Math.min(36,moveAmount*1.7);c.drawImage(bg,bx,-8,1320,506)}
 if(state.night){c.fillStyle='rgba(3,11,30,.38)';c.fillRect(0,0,CW,605)}
 const mist=c.createLinearGradient(0,338,0,575);mist.addColorStop(0,'rgba(20,26,28,0)');mist.addColorStop(1,'rgba(9,14,17,.94)');c.fillStyle=mist;c.fillRect(0,338,CW,240);
 if(state.effects)for(let i=0;i<7;i++){const px=(i*210+moveAmount*(15+i*1.4))%1650-200;c.fillStyle='rgba(196,190,175,.035)';c.beginPath();c.ellipse(px,408+(i%3)*23,145,19,0,0,Math.PI*2);c.fill()}
 c.fillStyle='#11151b';c.fillRect(0,480,CW,125);const trackmove=(moveAmount*90)%89;for(let i=-2;i<19;i++){const px=i*89+trackmove;c.fillStyle=i%2?'#3c3431':'#312b28';c.fillRect(px,482,46,13)}
 c.fillStyle='#bb9871';c.fillRect(0,469,CW,5);c.fillRect(0,496,CW,5);c.fillStyle='#3f4145';c.fillRect(0,474,CW,9);c.fillRect(0,501,CW,5);
 const sh=state.moving?Math.sin(t*18*state.speed)*.75:0;
 const body=m.train.variants[state.locoLevel-1];
 const wagons=[{id:'engine',key:'engine',meta:body,x:30,y:277+sh,w:371,h:199}];
 state.cars.forEach((car,i)=>{
   wagons.push({id:car.id,key:car.kind,meta:m.wagon[car.kind].levels[levelFor(car)-1],car,
     x:SLOT_X[i],y:311+(i%2?sh:-sh),w:SLOT_W,h:163});
 });
 rects=wagons.map(x=>({id:x.id,key:x.key,x:x.x,y:x.y,w:x.w,h:x.h}));
 for(const w of wagons){drawImg(w.meta,w.x,w.y,w.w,w.h);
   if(w.car?.level===2){
     c.strokeStyle='rgba(244,180,91,.55)';c.lineWidth=3;c.strokeRect(w.x+7,w.y+15,w.w-14,w.h-24);
     c.fillStyle='rgba(225,138,50,.45)';for(let q=0;q<5;q++)c.fillRect(w.x+12+q*43,w.y+w.h-25,20,4);
   }
   if(w.id===state.selectedCarId){c.strokeStyle='rgba(255,204,137,.8)';c.lineWidth=2;c.setLineDash([8,7]);c.strokeRect(w.x+6,w.y+3,w.w-12,w.h-7);c.setLineDash([])}
 }
 // D3: show living crew inside wagon cutaways, not hovering over platforms.
 drawInteriorLife();
 // Small fixed-screen-size approved icons show READY / WORKING without
 // replacing the original sprites or creating another quest/currency icon.
 // World-space anchors remain correct after one- or two-finger zoom.
 for(const w of wagons){
  if(!w.car)continue;
  const info=PRODUCTION.inspect(production,state.cars,crew,w.id,state.morale);
  if(!info)continue;
  const marker=info.ready>0?wagonBadges.ready:
    info.workers.length?wagonBadges.working:null;
  if(marker?.complete&&marker.naturalWidth){
   const unit=24/camera.zoom,space=5/camera.zoom;
   c.drawImage(marker,w.x+w.w-unit-space,w.y-unit-space,unit,unit);
  }
 }
 if(state.condition<30&&wagonBadges.warning.complete&&wagonBadges.warning.naturalWidth){
   const unit=26/camera.zoom;
   c.drawImage(wagonBadges.warning,335,280-unit,unit,unit);
 }
 // Modular engine protection overlays rendered independently.
 if(state.locoLevel>=2)drawImg(m.attachments.plow_L2,20,413,78,64,.95);
 if(state.locoLevel>=3)drawImg(m.attachments.headlamp_L3,43,358,41,39,.92);
 c.strokeStyle='#9b8567';c.lineWidth=4;for(const x of [404,...state.cars.slice(1).map((_,i)=>SLOT_X[i+1]-6)]){c.beginPath();c.moveTo(x-4,441);c.lineTo(x+10,442);c.stroke()}
 for(const p of bubbles){const a=Math.max(0,p.opacity*(1-p.life/3.4));c.fillStyle=`rgba(158,153,150,${a})`;c.beginPath();c.ellipse(p.x,p.y,p.r*1.15,p.r*.64,-.3,0,6.283);c.fill()}
 // visible thresholds connecting platform to the interior of each wagon
 for(const loc of Object.values(LOCATIONS)){const x=loc.door+8;c.fillStyle='rgba(240,170,83,.45)';c.fillRect(x,449,3,27);c.fillStyle='rgba(0,0,0,.2)';c.fillRect(x+3,452,20,19)}
 // source assets already show cutaway rooms; entering members are rendered smaller and raised into those rooms
 for(let i=0;i<crew.length;i++){
  const person=crew[i];
  // Additional rendering guard: active route means NO platform figures,
  // even if an external save or future interaction creates a transient mode.
  if(state.route.active && (person.inside<.99 || !['working','aboard'].includes(person.mode)))continue;
  // D3 interior occupants were already drawn in their assigned room.
  // Remaining visible characters are station patrol or approaching doors.
  if(LIFE.validLocation(person,state.cars))continue;
  renderCharacter(person,i);
 }
 if(state.effects&&state.cars.some(car=>car.kind==='workshop')&&Math.sin(t*7)>.84){for(let i=0;i<7;i++)circle(569+Math.sin(i*3+t*2)*i*3,370+Math.cos(i+t*3)*i*3,1.5,'rgba(255,177,67,.85)')}
 c.fillStyle='rgba(8,17,25,.85)';c.fillRect(18,83,258,48);c.fillStyle='#eed7b8';c.font='12px system-ui';c.fillText('Стан потяга: '+Math.round(state.condition)+'%',29,103);c.fillText('Припаси: '+Math.round(state.supplies)+'   •   екіпаж на роботі: '+crew.filter(p=>p.mode==='working').length,29,122);c.fillStyle='#474d4e';c.fillRect(151,94,80,7);c.fillStyle='#dfad6d';c.fillRect(151,94,80*state.condition/100,7);
 if(state.night){const lg=c.createRadialGradient(115,394,18,115,394,225);lg.addColorStop(0,'rgba(255,189,96,.10)');lg.addColorStop(1,'rgba(255,189,96,0)');c.fillStyle=lg;c.fillRect(0,280,400,310)}
 c.fillStyle='rgba(9,17,25,.78)';c.fillRect(16,15,455,56);c.fillStyle='#f6d5a5';c.font='bold 15px system-ui';c.fillText('КАРАВАН · РОЗВИТОК ПОТЯГА 0.12',28,38);c.font='12px system-ui';c.fillStyle='#e0c5a7';c.fillText('Причеплення вагонів · рівні локомотива · завдання',28,58);
 c.restore()}
function tick(ms){if(!last)last=ms;const dt=Math.min(.04,(ms-last)/1000);last=ms;update(dt);smoothCamera(dt);paint();videoFrames++;frameTime+=dt;if(frameTime>1){fps=Math.round(videoFrames/frameTime);videoFrames=0;frameTime=0;$('fpsLabel').textContent=fps+' fps'}requestAnimationFrame(tick)}
// Deterministic QA helpers for the shipped test scene; not a gameplay cheat UI.
globalThis.__CARAVAN_SAVE=store;globalThis.__CARAVAN_QA={snapshot:()=>({state:structuredClone(state),crew:structuredClone(crew),events:[...eventLog]}),advance:(seconds)=>{for(let n=0;n<seconds*30;n++)update(1/30);paint()},assign:(crewIndex,target)=>{chosenCrew=crewIndex;assignCrew(target)},assets:()=>({total:Object.keys(data).length,loaded:Object.values(data).filter(i=>i.complete&&i.naturalWidth).length})};
globalThis.__CARAVAN_QA.camera=()=>({camera:{...camera},target:{...cameraTarget},mode:cameraMode,selectedCarId:state.selectedCarId});
globalThis.__CARAVAN_QA.journal=()=>JOURNAL.status(journal,state,crew);
globalThis.__CARAVAN_QA.routes=()=>({route:structuredClone(state.route),choices:ROUTES.available(state.route),
 resources:{fuel:state.fuel,supplies:state.supplies,condition:state.condition}});
globalThis.__CARAVAN_QA.routeStart=(id)=>routeStart(id);
globalThis.__CARAVAN_QA.cancelBoarding=()=>cancelBoarding();
globalThis.__CARAVAN_QA.boarding=()=>({
 pending:state.boarding?{routeId:state.boarding.routeId,elapsed:state.boarding.elapsed}:null,
 aboard:crew.filter(p=>p.boardingState==='aboard').length,
 crew:crew.map(p=>({mode:p.mode,inside:p.inside,boardingState:p.boardingState}))
});
globalThis.__CARAVAN_QA.routeDecision=(id)=>routeDecision(id);
globalThis.__CARAVAN_QA.production=()=>structuredClone(production);
 globalThis.__CARAVAN_QA.wellbeing=()=>crew.map(p=>WELLBEING.describe(p,state.cars));
globalThis.__CARAVAN_QA.productionInspect=(id)=>PRODUCTION.inspect(production,state.cars,crew,id,state.morale);
globalThis.__CARAVAN_QA.interiorMotionAt=(seconds)=>LIFE.build(crew,state.cars).map(a=>({
 index:a.personIndex,carId:a.carId,wagonKind:a.wagonKind,activity:a.activity,
 caption:a.caption,fxX:a.fxX,fxY:a.fxY,pose:LIFE.pose(a,seconds)
}));
globalThis.__CARAVAN_QA.interiorLife=()=>LIFE.build(crew,state.cars).map(a=>({
 index:a.personIndex,carId:a.carId,location:a.location,
 activity:a.activity,seat:a.seat,bounds:a.bounds,
 x:a.x,y:a.y,width:a.width,height:a.height
}));
globalThis.__CARAVAN_QA.wagonBadgeState=()=>state.cars.map(car=>{
 const i=PRODUCTION.inspect(production,state.cars,crew,car.id,state.morale);
 return {id:car.id,role:i.ready>0?'ready':i.workers.length?'working':'none'};
});
globalThis.__CARAVAN_QA.quickSelect=(carId)=>{
 if(!state.cars.some(c=>c.id===carId))return false;
 state.selectedCarId=carId;setChosen();showQuickWagon();return true;
};
globalThis.__CARAVAN_QA.internalTransfers=()=>({
 states:crew.map((p,i)=>({i,mode:p.mode,target:p.job?.target||null,transfer:p.transfer||null,
  inside:p.inside,location:p.location})),
 occupancy:state.cars.map((car,i)=>({id:car.id,target:['center','rear','tail'][i],
  occupied:TRANSFER.occupancy(crew,state.cars,['center','rear','tail'][i]),
  capacity:PRODUCTION.capacity(car)}))
});
globalThis.__CARAVAN_QA.transit=()=>({
 phase:TRANSIT.phase(Boolean(state.route.active),state.moving,Boolean(ROUTES.pending(state.route))),
 aboard:crew.filter(p=>p.inside===1&&p.location?.kind!=='platform').length,
 outside:crew.filter(p=>p.location?.kind==='platform'||(p.inside<1&&state.route.active)).length,
 crew:crew.map(p=>({mode:p.mode,location:p.location,inside:p.inside,target:p.job?.target||null}))
});
globalThis.__CARAVAN_QA.quick=()=>({visible:!$('wagonQuick').hidden,
 selectedCarId:state.selectedCarId,armedCrew,buttons:[...$('quickWagonCrew').querySelectorAll('[data-quick-worker]')].length});
fit();setChosen();renderCrewPanel();cameraHud();requestAnimationFrame(tick);
})();