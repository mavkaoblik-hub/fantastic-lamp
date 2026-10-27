'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARAVAN_CHROME_BIN,
     args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:576},deviceScaleFactor:1});
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
 await page.screenshot({path:'caravan-v012-visual/original_reference_1280x576.png'});
 await page.locator('#tasksOpen').click();
 await page.locator('#fit').click();
 const wide=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(wide.mode,'wide','fit button must zoom out to show entire original train');
 assert.ok(wide.target.zoom<1,'wide mode must be a zoom out');
 await page.locator('[data-view-mode="train"]').click();
 const train=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(train.mode,'train');
 await page.waitForTimeout(900);
 // A tap on the actual illustrated second wagon must resolve to its original world-space ID.
 const tap=await page.evaluate(()=>{
   const element=document.getElementById('stage'),box=element.getBoundingClientRect();
   const W=box.width,H=box.height,cinematic=W/H>2.6;
   const scale=cinematic?W/1200:Math.min(W/1200,H/605);
   const offX=(W-1200*scale)/2,offY=cinematic?H*.51-345*scale:(H-605*scale)/2;
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
 assert.equal(await page.locator('#quickRoomPreview').isVisible(),true,'Art is visible in compact workroom card');
 assert.equal(await page.locator('#quickWagonCrew [data-quick-worker]').count(),3,
   'Player can assign three existing crew from the wagon card');
 await page.screenshot({path:'caravan-v012-visual/v013_wagon_quick_action_card.png'});

 await page.locator('#carList [data-carid]').nth(1).click();
 const target=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(target.mode,'wagon','tapping current wagon must focus its original artwork');
 assert.equal(target.selectedCarId,'c2');
 assert.ok(target.target.zoom>3.2,'Selected wagon must occupy almost the whole scene height');
 await page.locator('#quickWagonCrew [data-quick-worker="0"]').click();
 const job=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].job?.target);
 assert.equal(job,'rear','wagon shortcut must assign crew to selected wagon');
 // A long-term worker is not paid by the old one-off reward system.
 // Real production yields ready batches in the wagon and only pays on collection.
 await page.evaluate(()=>window.__CARAVAN_QA.advance(100));
 const pending=await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'));
 assert.ok(pending.ready>=1 && pending.ready<=2,'Working specialist must produce stock within the two-batch warehouse cap');
 const beforeCollect=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.morale);
 await page.locator('#quickCollect').click();
 const afterCollect=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.morale);
 assert.ok(afterCollect>=beforeCollect,'Only collect button may grant goods');
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'))).ready,0);
 assert.equal(await page.locator('#quickCollect').isDisabled(),true,'Second click cannot award stock');
 await page.locator('#quickWagonClose').click();
 assert.equal(await page.locator('#wagonQuick').isVisible(),false,
   'Wagon context must close without opening the full constructor');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(200);
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.productionInspect('c2'))).ready,0,
   'Claim-once state must persist across reload');

 await page.locator('#cameraIn').click();
 await page.locator('#cameraOut').click();
 // Inject true two-finger touch input (not mouse wheel emulation).
 await page.locator('[data-view-mode="train"]').click();
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
 await page.locator('[data-view-mode="wagon"]').click();
 await page.waitForTimeout(700);
 await page.screenshot({path:'caravan-v012-visual/wagon_near_full_scene_1280x576.png'});
 // Verify a genuine wagon-level achievement, one claim, and durable save.
 await page.locator('#journalOpen').click();
 assert.equal(await page.locator('#journalList .journal-entry').count(),4);
 await page.locator('#journalList [data-claim="wagon_upgrade"]').isDisabled();
 const metalBefore=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.metal);
 await page.locator('#upgrade').click();
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
 await page.locator('#locoUpgrade').click();
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
 assert.equal(cabin.outside,0,'No character may patrol outside while train moves');
 assert.ok(cabin.crew.every(x=>x.inside===1));
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
 assert.deepEqual(errors,[],'No JS or static resource loading failures');
 console.log(JSON.stringify({result:'PASS',...score,imageRefs:imgs.length},null,2));
 await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
