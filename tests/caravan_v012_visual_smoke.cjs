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
           y:offY+scale*(302.5+(420-cam.cy)*cam.zoom)};
 });
 await page.locator('#stage').click({position:tap});
 assert.equal((await page.evaluate(()=>window.__CARAVAN_QA.snapshot().state.selectedCarId)),'c2',
   'Direct click on the art of wagon two must select wagon two at the rendered camera scale');
 await page.locator('#carList [data-carid]').nth(1).click();
 const target=await page.evaluate(()=>window.__CARAVAN_QA.camera());
 assert.equal(target.mode,'wagon','tapping current wagon must focus its original artwork');
 assert.equal(target.selectedCarId,'c2');
 assert.equal(target.target.zoom,1.65);
 await page.locator('#sendCrewToCar').click();
 const job=await page.evaluate(()=>window.__CARAVAN_QA.snapshot().crew[0].job?.target);
 assert.equal(job,'rear','wagon shortcut must assign crew to selected wagon');
 await page.locator('#cameraIn').click();
 await page.locator('#cameraOut').click();
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
})().catch(err=>{console.error(err);process.exitCode=1;});
