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
 await page.locator('#carList [data-carid]').nth(1).click();
 const target=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(target.mode,'wagon','tapping current wagon must focus its original artwork');
 assert.equal(target.selectedCarId,'c2');
 assert.ok(target.target.zoom>3.2,'Selected wagon must occupy almost the whole scene height');
 await page.locator('#sendCrewToCar').click();
 const job=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].job?.target);
 assert.equal(job,'rear','wagon shortcut must assign crew to selected wagon');
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
 await page.screenshot({path:'caravan-v012-visual/after_interactions.png'});
 await page.setViewportSize({width:844,height:390});
 await page.waitForTimeout(500);
 const size=await page.evaluate(()=>({rect:document.getElementById('stage').getBoundingClientRect(),camera:window.__CARAVAN_QA.camera()}));
 assert.ok(size.rect.width>500&&size.rect.height>140,'Landscape Android-sized view must retain usable train canvas');
 await page.screenshot({path:'caravan-v012-visual/android_844x390.png'});
 assert.deepEqual(errors,[],'No JS or static resource loading failures');
 console.log(JSON.stringify({result:'PASS',...score,imageRefs:imgs.length},null,2));
 await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
