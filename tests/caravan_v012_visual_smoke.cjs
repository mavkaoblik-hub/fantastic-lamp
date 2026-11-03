'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARAVAN_CHROME_BIN,
     args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 async function cameraControl(selector){
  if(await page.locator('#controlsPanel').isHidden())await page.locator('#controlsOpen').click();
  await page.locator(selector).click();
  await page.locator('#controlsClose').click();
 }
 const errors=[];
 page.on('pageerror',e=>errors.push('Page error: '+e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1800);
 const score=await page.evaluate(()=>{
   const pics=[...document.images];
   return {source:document.querySelector('title')?.textContent,images:picCount(),
     manifest:Object.keys(window.CARAVAN_MANIFEST?.wagon||{}).length,
     canvas:document.getElementById('stage')?.width||0,
     styles:!!document.styleSheets.length};
   function picCount(){return pics.filter(x=>x.complete&&x.naturalWidth>0).length}
 });
 assert.equal(score.manifest,14,'14 wagon kinds in original v0.12');
  assert.equal(await page.locator('#sendCrewRest').count(),1,
   'D6B rest action must be available in the crew panel');
  const initialGrowth=await page.evaluate(()=>window.__CARAVAN_QA.wellbeing());
  assert.equal(initialGrowth.length,3);
  assert.ok(initialGrowth.every(p=>p.level>=1&&p.level<=5&&p.fatigue>=0&&p.fatigue<=100));
 assert.ok(score.canvas>500,'Native original canvas must render');
 assert.ok(score.styles,'Original CSS must load');
 const approved=await page.evaluate(()=>window.CaravanApprovedUI.sources());
 assert.equal(approved.length,16,'Exactly 16 canonical approved alpha icons should be available');
 const assetState=await page.evaluate(async()=>{
  const src=window.CaravanApprovedUI.sources();
  return await Promise.all(src.map(item=>new Promise(done=>{
    const icon=new Image();icon.onload=()=>done({id:item.id,ok:true,loaded:icon.naturalWidth});
    icon.onerror=()=>done({id:item.id,ok:false});icon.src=item.path;
  })));
 });
 assert.ok(assetState.every(i=>i.ok&&i.loaded===128),'Every isolated UI PNG must load in the real offline scene');
 const buttonsWithIcons=await page.locator('.caravan-ui-icon').count();
 const countersWithIcons=await page.locator('.caravan-resource-icon').count();
 assert.ok(buttonsWithIcons>=9,'HUD should reuse original approved icon assets instead of placeholder symbols');
 assert.equal(countersWithIcons,4,'Metal, fuel, supplies and morale must use approved art');
 const frames=await page.evaluate(async()=>{
  const urls=[
   'hud_resource_slot','sidebar_frame','journal_card','route_card',
   'incident_frame','wagon_context_frame','progress_track','status_warning_overlay'
  ].map(name=>'assets/ui_frames/'+name+'.png');
  return await Promise.all(urls.map(url=>new Promise(resolve=>{
   const im=new Image();im.onload=()=>resolve({url,ok:im.naturalWidth===480});
   im.onerror=()=>resolve({url,ok:false});im.src=url;
  })));
 });
 assert.equal(frames.length,8);
 assert.ok(frames.every(i=>i.ok),'All eight source-derived frame PNGs must load');
 const border=await page.evaluate(()=>getComputedStyle(document.querySelector('.sidebar')).borderImageSource);
 assert.ok(border.includes('sidebar_frame.png'),'Sprite texture must be used in the active interface, not only copied');


 const imgs=await page.evaluate(()=>Object.values(window.CARAVAN_MANIFEST.wagon).flatMap(x=>x.levels.map(y=>y.src))
   .concat(window.CARAVAN_MANIFEST.train?.variants?.map(x=>x.src)||[]));
 assert.ok(imgs.length>=20,'Original wagon/locomotive sprite manifest incomplete');
 const validated=await page.evaluate(async()=>{
  const wagon=window.CARAVAN_MANIFEST.wagon;
  const all=[...new Set(Object.values(wagon).flatMap(v=>v.levels.map(a=>a.src)))];
  return (await Promise.all(all.map(url=>new Promise(resolve=>{
   const im=new Image();im.onload=()=>resolve({url,ok:true});im.onerror=()=>resolve({url,ok:false});im.src=url;
  })))).filter(x=>!x.ok);
 });
 assert.deepEqual(validated,[],'No broken original wagon sprites');
 fs.mkdirSync('caravan-v012-visual',{recursive:true});
 await page.screenshot({path:'caravan-v012-visual/original_reference_844x390.png'});
 await page.locator('#tasksOpen').click();
 assert.equal(await page.locator('#sidebar').isVisible(),true);
 await page.locator('#closeSidebar').click();
 await page.locator('#fit').click();
 const wide=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(wide.mode,'wide','fit button must zoom out to show entire original train');
 assert.ok(wide.target.zoom<1,'wide mode must be a zoom out');
 await cameraControl('[data-view-mode="train"]');
 const train=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(train.mode,'train');
 await page.waitForTimeout(900);
 // A tap on the actual illustrated second wagon must resolve to its original world-space ID.
 const tap=await page.evaluate(()=>{
   const element=document.getElementById('stage'),box=element.getBoundingClientRect();
   const {scale,offX,offY}=window.__CARAVAN_QA.projection();
   const cam=window.__CARAVAN_QA.camera().camera;
   return {x:offX+scale*(600+(795-cam.cx)*cam.zoom),
           y:offY+scale*(302.5+(360-cam.cy)*cam.zoom)};
 });
 const stageBox=await page.locator('#stage').boundingBox();
 assert.ok(stageBox && tap.x>0 && tap.y>0 && tap.x<stageBox.width && tap.y<stageBox.height,
  'Calculated wagon tap must be physically inside the original game canvas');
 await page.mouse.click(stageBox.x+tap.x,stageBox.y+tap.y);
 await page.waitForTimeout(300);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.selectedCarId)),'c2',
   'Direct click on the art of wagon two must select wagon two at the rendered camera scale');
 assert.equal(await page.locator('#wagonQuick').isVisible(),true,
   'Art tap should open a small contextual wagon card instead of requiring constructor panel');
 await page.waitForFunction(()=>document.getElementById('quickRoomPreview').naturalWidth>0);
 assert.equal(await page.locator('#quickRoomPreview').isVisible(),false,'Android shows the actual wagon beside the card without a duplicate thumbnail');
 assert.equal(await page.locator('#quickWagonCrew [data-quick-worker]').count(),3,
   'Player can assign three existing crew from the wagon card');
 await page.screenshot({path:'caravan-v012-visual/v013_wagon_quick_action_card.png'});

 await page.locator('#togglePanel').click();
 await page.locator('#carList [data-carid]').nth(1).click();
 await page.locator('#closeSidebar').click();
 const target=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(target.mode,'wagon','tapping current wagon must focus its original artwork');
 assert.equal(target.selectedCarId,'c2');
 const view=await page.evaluate(()=>__CARAVAN_QA.projection().view);
 assert.ok(target.target.zoom*163<=view.height*.83,'Focused wagon fits the Android scene height');
 await page.evaluate(()=>__CARAVAN_QA.quickSelect('c2'));
 await page.locator('#quickWagonCrew [data-quick-worker="0"]').click();
 const job=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].job?.target);
 assert.equal(job,'rear','wagon shortcut must assign crew to selected wagon');
 // A long-term worker is not paid by the old one-off reward system.
 // Real production yields ready batches in the wagon and only pays on collection.
 await page.evaluate(()=>window.__CARAVAN_QA.advance(100));
 const interiorStation=await page.evaluate(()=>window.__CARAVAN_QA.interiorLife());
 assert.ok(interiorStation.some(x=>x.carId==='c2'&&x.activity==='rest'),
   'The assigned worker must appear within the actual residence cutaway');
 assert.ok(interiorStation.every(x=>x.x>=x.bounds.x&&x.x+x.width<=x.bounds.x+x.bounds.w),
   'Living crew must stay inside compartment bounds');
 const workPose=await page.evaluate(()=>({
  before:window.__CARAVAN_QA.interiorMotionAt(1.2),
  after:window.__CARAVAN_QA.interiorMotionAt(2.1)
 }));
 assert.equal(workPose.before.length,workPose.after.length);
 assert.ok(workPose.before.some((a,i)=>a.carId==='c2'&&a.wagonKind==='quarters'&&
   JSON.stringify(a.pose)!==JSON.stringify(workPose.after[i].pose)),
   'Residential crew should breathe and shift naturally between frames');
 assert.ok(workPose.before.every(p=>p.fxX>=0&&p.fxY>=0),
   'Equipment effect anchors must remain within positive scene coordinates');
 assert.ok(await page.locator('#quickRoomCrewList').innerText().then(t=>t.includes('Марко')),
   'The contextual panel must show actual crew activity');
 await page.locator('#stage').screenshot({path:'caravan-v012-visual/v013d3_living_room.png'});
 await page.evaluate(()=>window.__CARAVAN_QA.advance(.9));
 await page.locator('#stage').screenshot({path:'caravan-v012-visual/v013d4_workstation_motions.png'});
 const pending=await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'));
 assert.ok(pending.ready>=1 && pending.ready<=2,'Working specialist must produce stock within the two-batch warehouse cap');
 const beforeCollect=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.morale);
 await page.locator('#quickCollect').click();
 const afterCollect=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.morale);
 assert.ok(afterCollect>=beforeCollect,'Only collect button may grant goods');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'))).ready,0);
 const collectedBeforeReload=await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2').collected);
 assert.equal(await page.locator('#quickCollect').isDisabled(),true,'Second click cannot award stock');
 await page.locator('#quickWagonClose').click();
 assert.equal(await page.locator('#wagonQuick').isVisible(),false,
   'Wagon context must close without opening the full constructor');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(200);
 const claimedAfterReload=await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'));
 assert.equal(claimedAfterReload.collected,collectedBeforeReload,
   'Reload cannot duplicate the earlier claim transaction');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.morale)),afterCollect,
   'Newly produced stock may be ready, but cannot auto-credit resources');

 await cameraControl('#cameraIn');
 await cameraControl('#cameraOut');
 // Inject true two-finger touch input (not mouse wheel emulation).
 await cameraControl('[data-view-mode="train"]');
 await page.waitForTimeout(850);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const scene=await page.locator('#stage').boundingBox();
 const mid={x:scene.x+scene.width*.56,y:scene.y+scene.height*.52};
 async function pinchGesture(startSpan,endSpan){
  const points=(span)=>[
   {x:Math.round(mid.x-span/2),y:Math.round(mid.y),id:11},
   {x:Math.round(mid.x+span/2),y:Math.round(mid.y),id:12}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(startSpan)});
  for(let step=1;step<=6;step++){
   const span=startSpan+(endSpan-startSpan)*step/6;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(span)});
   await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(80);
 }
 await pinchGesture(110,270);
 const pinchIn=await page.evaluate(()=>window.__CARAVAN_QA.camera().camera.zoom);
 assert.ok(pinchIn>1.8,'Two fingers moving apart must zoom in inside Android-like touch emulation: '+pinchIn);
 await pinchGesture(270,110);
 const pinchOut=await page.evaluate(()=>window.__CARAVAN_QA.camera().camera.zoom);
 assert.ok(pinchOut<pinchIn-.5,'Two fingers moving together must zoom out: '+pinchOut);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await cameraControl('[data-view-mode="wagon"]');
 await page.waitForTimeout(700);
 await page.screenshot({path:'caravan-v012-visual/wagon_near_full_scene_844x390.png'});
 // Verify a genuine wagon-level achievement, one claim, and durable save.
 await page.locator('#journalOpen').click();
 assert.equal(await page.locator('#journalList .journal-entry').count(),4);
 await page.locator('#journalList [data-claim="wagon_upgrade"]').isDisabled();
 const metalBefore=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.metal);
 await page.locator('#closeSidebar').click();
 await page.locator('#togglePanel').click();
 await page.locator('#upgrade').click();
 await page.locator('#closeSidebar').click();
 await page.locator('#journalOpen').click();
 const claimButton=page.locator('#journalList [data-claim="wagon_upgrade"]');
 assert.equal(await claimButton.isEnabled(),true,'One L2 upgrade should enable quest reward');
 await claimButton.click();
 const afterClaim=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(afterClaim.metal,metalBefore-35+18,'Reward must add exactly one resource grant');
 assert.equal(await claimButton.isDisabled(),true,'Reward can no longer be claimed');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(900);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.journal().find(q=>q.id==='wagon_upgrade').status)),'claimed',
  'Claim state must survive full browser restart');
 await page.locator('#togglePanel').click();
 await page.locator('#locoUpgrade').click();
 await page.locator('#closeSidebar').click();
 await page.waitForTimeout(400);
 // Plan a physical route using the real original v0.12 scene, then arrive exactly once.
 await page.locator('#routeOpen').click();
 assert.equal(await page.locator('#routeList .route-choice').count(),2);
 assert.equal(await page.locator('#routeList .route-landmark-art').count(),2);
 await page.waitForFunction(()=>document.getElementById('stationArt').naturalWidth>0);
 const depart=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 await page.locator('[data-route-id="popil_mist"]').click();
 const pendingBoard=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.ok(pendingBoard.boarding,'Crew must board BEFORE departure');
 assert.equal(pendingBoard.route.active,null,'Route cannot start before boarding');
 assert.equal(pendingBoard.fuel,depart.fuel,'Boarding cannot debit fuel');
 assert.equal(pendingBoard.supplies,depart.supplies,'Boarding cannot debit supplies');
 assert.equal(await page.locator('#boardingCancel').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.__CARAVAN_QA.routeStart('popil_mist')),false,
  'Starting another route during boarding cannot create a second transaction');
 await page.locator('#boardingCancel').click();
 const cancelled=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(cancelled.boarding,null);
 assert.equal(cancelled.route.active,null,'Cancel restores the station without starting a trip');
 assert.equal(cancelled.fuel,depart.fuel,'Cancel must refund by never charging fuel');
 assert.equal(cancelled.supplies,depart.supplies);
 await page.locator('#routeOpen').click();
 await page.locator('[data-route-id="popil_mist"]').click();
 assert.ok((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.boarding)));
 await page.evaluate(()=>window.__CARAVAN_QA.advance(1));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(250);
 const midBoard=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.ok(midBoard.boarding,'Boarding must survive page reload');
 assert.equal(midBoard.route.active,null);
 assert.equal(midBoard.fuel,depart.fuel);
 assert.equal(midBoard.supplies,depart.supplies);
 await page.locator('#stage').screenshot({path:'caravan-v012-visual/v013d2_boarding.png'});
 await page.evaluate(()=>window.__CARAVAN_QA.advance(9));
 const started=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(started.boarding,null,'Boarding must finish after all aboard');
 assert.equal(started.fuel,depart.fuel-8,'Fuel charged at departure exactly once');
 assert.equal(started.supplies,depart.supplies-5,'Supplies charged at departure exactly once');
 assert.equal(started.route.active.routeId,'popil_mist');
 const cabin=await page.evaluate(()=>window.__CARAVAN_QA.transit());
 assert.equal(cabin.phase,'TRAVELLING');
 assert.equal(cabin.aboard,3,'All three workers must be inside during motion');
 const living=await page.evaluate(()=>window.__CARAVAN_QA.interiorLife());
 assert.equal(living.length,3,'All crew should be represented in train interiors during travel');
 assert.ok(living.every(p=>p.location==='wagon'||p.location==='locomotive'),
   'Crew visuals must not float over outside tracks');
 assert.ok(living.every(p=>p.x>=p.bounds.x&&p.y>=p.bounds.y&&
   p.x+p.width<=p.bounds.x+p.bounds.w&&p.y+p.height<=p.bounds.y+p.bounds.h),
   'Interior sprites must be clipped and placed inside room openings');
 assert.equal(cabin.outside,0,'No character may patrol outside while train moves');
 assert.ok(cabin.crew.every(x=>x.inside===1));
 // D5: transfer the mechanic from occupied residence c2 to empty workshop c1,
 // without exiting on the tracks or awarding resources in both wagons.
 assert.equal(await page.evaluate(()=>window.__CARAVAN_QA.quickSelect('c1')),true);
 const firstTransferButton=page.locator('#quickWagonCrew [data-quick-worker="0"]');
 assert.equal(await firstTransferButton.isEnabled(),true,
   'Moving train must offer safe internal reassignment to empty workrooms');
 await firstTransferButton.click();
 let movingTransfer=await page.evaluate(()=>window.__CARAVAN_QA.internalTransfers());
 assert.equal(movingTransfer.states[0].mode,'transferring');
 assert.equal(movingTransfer.states[0].target,null,'Source workstation stops work immediately');
 assert.equal(movingTransfer.states[0].transfer.target,'center');
 assert.equal(movingTransfer.occupancy[0].occupied,1,'Destination seat reserved');
 assert.equal(movingTransfer.occupancy[1].occupied,0,'Source seat freed');
 assert.equal(await page.locator('#quickWagonCrew [data-quick-worker="1"]').isDisabled(),true,
   'Second worker cannot overbook same level 1 wagon');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.transit())).outside,0);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.moving)),true,
   'Internal reassignment begins while train is actually moving');
 // Freeze route time for deterministic transfer/reload testing; the transfer
 // itself remains valid during manual pause because the route stays active.
 await page.locator('#travel').click();
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.moving)),false);
 const beforeTransferRewards=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].done);
 await page.evaluate(()=>window.__CARAVAN_QA.advance(1));
 assert.ok((await page.evaluate(()=>window.__CARAVAN_QA.internalTransfers().states[0].transfer.progress))>0);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(250);
 movingTransfer=await page.evaluate(()=>window.__CARAVAN_QA.internalTransfers());
 assert.equal(movingTransfer.states[0].mode,'transferring','Moving employee must survive reload');
 assert.equal(movingTransfer.states[0].inside,1);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.transit())).outside,0);
 await page.evaluate(()=>window.__CARAVAN_QA.advance(5));
 const finishedTransfer=await page.evaluate(()=>window.__CARAVAN_QA.internalTransfers());
 assert.equal(finishedTransfer.states[0].mode,'working');
 assert.equal(finishedTransfer.states[0].target,'center');
 assert.equal(finishedTransfer.states[0].transfer,null);
 assert.equal(finishedTransfer.states[0].location.carId,'c1');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].done)),
  beforeTransferRewards,'Changing rooms must not grant extra rewards');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.transit())).outside,0);
 await page.locator('#travel').click();
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.moving)),true,
  'The same active trip resumes without any additional route debit');
 await page.locator('#stage').screenshot({path:'caravan-v012-visual/v013d5_internal_wagon_transfer.png'});
 await page.locator('#stage').screenshot({path:'caravan-v012-visual/v013d1_train_all_aboard.png'});
 assert.equal(await page.locator('#travel').innerText(),'⏸ Пауза');
 await page.locator('#travel').click();
 const paused=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(paused.moving,false);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.transit())).aboard,3,
   'Manual pause must keep every character aboard');
 const parkedProgress=paused.route.active.elapsed;
 await page.evaluate(()=>window.__CARAVAN_QA.advance(3));
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.route.active.elapsed)),parkedProgress);
 // Simulate legacy save made while an exterior character was erroneously
 // patrolling during the existing trip. D1 must rehouse them on the train.
 await page.evaluate(()=>{
  const key='caravan_v12',saved=JSON.parse(localStorage.getItem(key));
  saved.crewData[2].mode='patrol';saved.crewData[2].inside=0;
  saved.crewData[2].location={kind:'platform',carId:null};
  localStorage.setItem(key,JSON.stringify(saved));
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(400);
 const savedJourney=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(savedJourney.route.active.routeId,'popil_mist','Mid-trip route persists');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.transit())).outside,0,'Reload must normalize exterior crew');
 assert.equal(savedJourney.fuel,depart.fuel-8,'Reload never charges twice');
 await page.locator('#travel').click();
 await page.evaluate(()=>window.__CARAVAN_QA.advance(14));
 const interrupted=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.ok(interrupted.route.active.pendingEventId,'Expected a mid-route incident');
 assert.equal(interrupted.moving,false,'Train must pause awaiting a choice');
 const eventCrew=await page.evaluate(()=>window.__CARAVAN_QA.transit());
 assert.equal(eventCrew.phase,'PAUSED_EVENT');
 assert.equal(eventCrew.outside,0,'Encounter cannot disembark crew');
 assert.equal(eventCrew.aboard,3);
 const savedIncidentResources={fuel:interrupted.fuel,supplies:interrupted.supplies};
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(350);
 assert.ok((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.route.active.pendingEventId)),
  'Incident must survive restart');
 await page.locator('#routeOpen').click();
 assert.equal(await page.locator('#routeIncident').isVisible(),true,'Decision panel must be visible');
 await page.waitForFunction(()=>document.querySelector('#routeIncident .incident-art')?.naturalWidth>0);
 assert.equal(await page.locator('#routeList [data-route-id="popil_mist"]').count(),1);
 const choices=page.locator('#routeIncident [data-incident-option]:not([disabled])');
 assert.ok(await choices.count()>=1,'Player always has a feasible decision');
 await choices.last().click();
 const resolved=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(resolved.route.active.pendingEventId,null);
 assert.equal(resolved.route.active.eventResolved,true);
 assert.equal(resolved.route.decisions.length,1);
 assert.equal(resolved.moving,true,'Selecting a decision resumes the journey');
 assert.ok(resolved.fuel<=savedIncidentResources.fuel+20);
 await page.evaluate(()=>window.__CARAVAN_QA.advance(27));
 const arrived=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state);
 assert.equal(arrived.route.decisions.length,1,'Decision can only be applied once');
 assert.equal(arrived.route.active,null);
 assert.equal(arrived.route.stationId,'mist');
 assert.equal(arrived.route.completed,1);
 assert.equal(arrived.route.history.length,1);
 const snapshotArrival=JSON.stringify(arrived.route);
 await page.evaluate(()=>window.__CARAVAN_QA.advance(30));
 assert.equal(JSON.stringify((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state)).route),snapshotArrival,
  'Arrival event cannot be collected again by advancing time');
 await page.locator('#closeSidebar').evaluate(el=>el.click());
 await page.locator('#routeOpen').click();
 assert.equal(await page.locator('#stationName').innerText(),'Іржавий міст');
 assert.equal(await page.locator('#routeList .route-choice').count(),2);
 await page.screenshot({path:'caravan-v012-visual/original_routes_arrival.png'});
 await page.screenshot({path:'caravan-v012-visual/after_interactions.png'});
 await page.setViewportSize({width:844,height:390});
 await page.waitForTimeout(500);
 const menuBox=await page.locator('#togglePanel').boundingBox();
 assert.ok(menuBox && menuBox.x+menuBox.width<=844,'Sidebar opener must not be cropped by resource HUD on phone');


 const size=await page.evaluate(()=>({rect:document.getElementById('stage').getBoundingClientRect(),camera:window.__CARAVAN_QA.camera()}));
 assert.ok(size.rect.width>500&&size.rect.height>140,'Landscape Android-sized view must retain usable train canvas');
 await page.screenshot({path:'caravan-v012-visual/android_844x390.png'});
 // D6B isolated real-browser QA without altering prior routes/transfers.
  const restPage=await browser.newPage({viewport:{width:844,height:390}});
  restPage.on('pageerror',e=>errors.push('Rest-page error: '+e.message));
  await restPage.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
  await restPage.waitForFunction(()=>typeof window.__CARAVAN_QA?.rest==='function');
  assert.equal(await restPage.evaluate(()=>window.__CARAVAN_QA.rest(0)),true,
   'Station mechanic must reserve a sleeping berth');
  await restPage.evaluate(()=>window.__CARAVAN_QA.advance(8));
  const resting=await restPage.evaluate(()=>({
   person:window.__CARAVAN_QA.snapshot().crew[0],
   production:window.__CARAVAN_QA.production().rows.c2,
   indicator:window.__CARAVAN_QA.wellbeing()[0]
  }));
  assert.equal(resting.person.mode,'resting','Rest begins after existing door animation');
  assert.equal(resting.person.job.duty,'rest');
  assert.equal(resting.person.inside,1);
  assert.equal(resting.production.progress,0,'Resting cannot generate resource batches');
  assert.equal(resting.indicator.level,1);
  await restPage.screenshot({path:'caravan-v012-visual/v013d6b_crew_rest.png'});
  await restPage.evaluate(()=>window.__CARAVAN_SAVE());
  await restPage.reload({waitUntil:'domcontentloaded'});
  await restPage.waitForFunction(()=>typeof window.__CARAVAN_QA?.rest==='function');
  const savedRest=await restPage.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0]);
  assert.equal(savedRest.mode,'resting','Rest survives WebView reload');
  assert.equal(savedRest.job.duty,'rest');
  assert.equal(savedRest.inside,1);
  await restPage.close();
  // D6C: verify real scene width and on-route self-directed needs.
  const autoPage=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  autoPage.on('pageerror',e=>errors.push('D6C-page: '+e.message));
  await autoPage.goto('http://127.0.0.1:8787/',{waitUntil:'domcontentloaded'});
  await autoPage.waitForFunction(()=>typeof window.__CARAVAN_QA?.autonomy==='function');
  const compactScene=await autoPage.evaluate(()=>({
   width:document.querySelector('.scene').getBoundingClientRect().width,
   available:window.innerWidth,
   sidebarHidden:getComputedStyle(document.querySelector('#sidebar')).display==='none'
  }));
  assert.ok(compactScene.width>=compactScene.available-16,
   'Default scene should use all available desktop width, with no persistent 314px sidebar');
  assert.equal(compactScene.sidebarHidden,true);
  await autoPage.locator('#togglePanel').click();
  assert.equal(await autoPage.locator('#sidebar').isVisible(),true,
   'Modules remain accessible using the overlay drawer');
  await autoPage.locator('#closeSidebar').click();
  await autoPage.evaluate(()=>{
   window.__CARAVAN_QA.assign(0,'center');
   window.__CARAVAN_QA.advance(8);
   window.__CARAVAN_SAVE();
  });
  // pagehide saves in-memory state. Inject fixtures on the next page load,
  // BEFORE the application reads localStorage (not before pagehide).
  await autoPage.addInitScript(()=>{
   if(sessionStorage.getItem('__d6c_fixture_used')==='1')return;
   const raw=localStorage.getItem('caravan_v12');
   if(!raw)return;
   const save=JSON.parse(raw);
   if(!Array.isArray(save.crewData)||!save.crewData[0])return;
   save.crewData[0].fatigue=70;
   save.crewData[0].loneliness=78;
   save.crewData[0].autoCooldown=0;
   localStorage.setItem('caravan_v12',JSON.stringify(save));
   sessionStorage.setItem('__d6c_fixture_used','1');
  });
  await autoPage.reload({waitUntil:'domcontentloaded'});
  await autoPage.waitForFunction(()=>typeof window.__CARAVAN_QA?.routeStart==='function');
  assert.equal(await autoPage.evaluate(()=>window.__CARAVAN_QA.routeStart('popil_mist')),true);
  await autoPage.evaluate(()=>window.__CARAVAN_QA.advance(8));
  const autonomous=await autoPage.evaluate(()=>({
   route:window.__CARAVAN_QA.snapshot().state.route.active,
   needs:window.__CARAVAN_QA.autonomy()[0],
   transit:window.__CARAVAN_QA.transit()
  }));
  assert.ok(autonomous.route,'Autonomous break starts only on the active train route');
  assert.equal(autonomous.needs.break?.kind,'rest',
   'Exhausted worker must take a safe self-directed onboard break');
  assert.equal(autonomous.needs.job,null,'Production assignment suspended during a break');
  assert.equal(autonomous.transit.outside,0,'No exterior crew after spontaneous travel');
  await autoPage.locator('#stage').screenshot({path:'caravan-v012-visual/v013d6c_autonomous_crew.png'});
  await autoPage.evaluate(()=>window.__CARAVAN_SAVE());
  await autoPage.reload({waitUntil:'domcontentloaded'});
  await autoPage.waitForFunction(()=>typeof window.__CARAVAN_QA?.autonomy==='function');
  assert.ok((await autoPage.evaluate(()=>window.__CARAVAN_QA.autonomy()[0].break)),
   'Autonomous break should recover from persisted save without duplicating jobs');
  await autoPage.close();
  assert.deepEqual(errors,[],'No JS or static resource loading failures');
 console.log(JSON.stringify({result:'PASS',...score,imageRefs:imgs.length},null,2));
 await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
