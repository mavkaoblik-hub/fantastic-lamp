'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const out=process.env.CARAVAN_QA_OUTPUT||'caravan-android-visual';
fs.mkdirSync(out,{recursive:true});
const sizes=[{width:640,height:360},{width:844,height:390},{width:915,height:412},{width:960,height:480}];
async function worldPoint(page,x,y){
 return page.evaluate(({x,y})=>{
  const q=__CARAVAN_QA,p=q.projection(),c=q.camera().camera,b=document.querySelector('#stage').getBoundingClientRect();
  return {x:b.x+p.offX+p.scale*(600+(x-c.cx)*c.zoom),y:b.y+p.offY+p.scale*(302.5+(y-c.cy)*c.zoom)};
 },{x,y});
}
async function tapWorld(page,x,y){const p=await worldPoint(page,x,y);await page.touchscreen.tap(p.x,p.y);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARAVAN_CHROME_BIN});
 const errors=[],report=[];
 try{
  for(const viewport of sizes){
   const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
   await page.goto('http://127.0.0.1:8787/',{waitUntil:'load'});
   await page.waitForFunction(()=>__CARAVAN_QA.assets().loaded===103);
   const layout=await page.evaluate(()=>{
    const rect=el=>el.getBoundingClientRect().toJSON();
    return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,canvas:rect(document.querySelector('#stage')),
     buttons:[...document.querySelectorAll('.playbar button,#togglePanel')].map(el=>({id:el.id,...rect(el)})),
     navScroll:document.querySelector('.playbar').scrollWidth,navWidth:document.querySelector('.playbar').clientWidth};
   });
   assert.equal(layout.scroll,viewport.width,'No horizontal page overflow');
   assert.ok(layout.navScroll<=layout.navWidth,'Every primary action fits without scrolling');
   assert.ok(layout.canvas.height>=viewport.height*.7,'At least 70% height remains for the scene');
   for(const b of layout.buttons){assert.ok(b.width>=48&&b.height>=48,'48px touch target: '+b.id);assert.ok(b.x>=0&&b.y>=0&&b.right<=viewport.width+.1&&b.bottom<=viewport.height+.1,'Button within viewport: '+b.id);}
   await page.screenshot({path:path.join(out,`${viewport.width}-overview.png`)});
   await tapWorld(page,796,350);
   assert.equal(await page.locator('#wagonQuick').isVisible(),true);
   assert.equal((await page.evaluate(()=>__CARAVAN_QA.quick())).selectedCarId,'c2');
   const scene=await page.locator('#stage').boundingBox(),card=await page.locator('#wagonQuick').boundingBox();
   assert.ok(scene.x+scene.width<=card.x+.5,'Context card never covers the scene');
   // The actual original wagon art, not just its camera center, must fit.
   const tl=await worldPoint(page,668,311),br=await worldPoint(page,924,474);
   assert.ok(tl.y>=scene.y&&br.y<=scene.y+scene.height,'Wagon roof and wheels fit');
   assert.ok(tl.x>=scene.x&&br.x<=scene.x+scene.width,'Wagon width fits');
   await page.screenshot({path:path.join(out,`${viewport.width}-wagon.png`)});
   // The live roster refreshes every 350ms; a held touch must retain its button.
   const worker=await page.locator('[data-quick-worker="0"]').boundingBox();
   const hold=await context.newCDPSession(page);
   await hold.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:worker.x+worker.width/2,y:worker.y+worker.height/2}]});
   await page.waitForTimeout(500);
   await hold.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.evaluate(()=>__CARAVAN_QA.snapshot().crew[0].job?.target),'rear','Roster refresh cannot swallow held touch');
   assert.equal(await page.evaluate(()=>CaravanAndroid.back()),true);
   assert.equal(await page.locator('#wagonQuick').isVisible(),false);
   assert.equal(await page.evaluate(()=>CaravanAndroid.back()),false,'Exit is offered only without an open UI');
   for(const [id,section] of [['tasksOpen','crew'],['routeOpen','routes'],['journalOpen','journal'],['togglePanel','modules']]){
    await page.locator('#'+id).tap();
    assert.equal(await page.locator('#sidebar').getAttribute('data-section'),section);
    const visible=await page.locator('#sidebar .sidebar-section').evaluateAll(xs=>xs.filter(x=>x.getBoundingClientRect().height>0).map(x=>x.dataset.section));
    assert.ok(visible.length&&visible.every(x=>x===section),'Only requested panel is shown');
    assert.equal(await page.evaluate(()=>CaravanAndroid.back()),true);
   }
   await page.locator('#controlsOpen').tap();
   assert.equal(await page.locator('#cameraIn').isVisible(),true);
   await page.locator('[data-view-mode="train"]').tap();
   await page.locator('#controlsClose').tap();
   await page.waitForTimeout(250);
   const cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
   const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:1,radiusY:1}))});
   const box=await page.locator('#stage').boundingBox(),cx=box.width*.55,cy=box.y+box.height*.48;
   const before=await page.evaluate(()=>({camera:__CARAVAN_QA.camera(),quick:__CARAVAN_QA.quick(),crew:__CARAVAN_QA.snapshot().crew.map(p=>p.job)}));
   await touch('touchStart',[[1,cx-45,cy],[2,cx+45,cy]]);
   await touch('touchMove',[[1,cx-110,cy],[2,cx+110,cy]]);
   await touch('touchEnd',[[1,cx-110,cy]]);
   await touch('touchMove',[[2,cx+120,cy+2]]);
   await touch('touchEnd',[]);
   const after=await page.evaluate(()=>({camera:__CARAVAN_QA.camera(),quick:__CARAVAN_QA.quick(),crew:__CARAVAN_QA.snapshot().crew.map(p=>p.job)}));
   assert.ok(after.camera.camera.zoom>before.camera.camera.zoom*1.6,'Pinch changes zoom');
   assert.equal(after.quick.visible,false,'Lifting the last pinch finger never taps a wagon');
   assert.equal(after.quick.selectedCarId,before.quick.selectedCarId);
   assert.deepEqual(after.crew,before.crew,'Pinch cannot assign a person');
   // Third-finger interruption must resume pinch from the remaining pair.
   await touch('touchStart',[[1,cx-40,cy],[2,cx+40,cy]]);
   await touch('touchStart',[[1,cx-40,cy],[2,cx+40,cy],[3,cx,cy+35]]);
   await touch('touchEnd',[[3,cx,cy+35]]);
   const z=await page.evaluate(()=>__CARAVAN_QA.camera().camera.zoom);
   await touch('touchMove',[[1,cx-28,cy],[2,cx+28,cy]]);
   await touch('touchEnd',[]);
   const resumed=await page.evaluate(()=>__CARAVAN_QA.camera().camera.zoom);
   assert.ok(resumed<z-.1,'Pinch resumes after third finger: '+z+' -> '+resumed);
   const panStart=await page.evaluate(()=>__CARAVAN_QA.camera().camera.cx);
   await touch('touchStart',[[1,cx,cy]]);await touch('touchMove',[[1,cx+60,cy]]);await touch('touchEnd',[]);
   assert.notEqual(await page.evaluate(()=>__CARAVAN_QA.camera().camera.cx),panStart,'One finger pans');
   assert.equal(await page.locator('#wagonQuick').isVisible(),false,'Drag never selects');
   await touch('touchStart',[[1,cx,cy]]);await touch('touchCancel',[]);
   assert.equal(await page.locator('#wagonQuick').isVisible(),false,'Cancelled gesture never selects');
   // Pick a person explicitly, then pinch without dispatching the assignment.
   await page.locator('#tasksOpen').tap();await page.locator('#pickCrewWagon').tap();
   assert.equal(await page.locator('#assignmentHint').isVisible(),true);
   await touch('touchStart',[[1,cx-35,cy],[2,cx+35,cy]]);await touch('touchMove',[[1,cx-50,cy],[2,cx+50,cy]]);await touch('touchEnd',[]);
   assert.equal((await page.evaluate(()=>__CARAVAN_QA.quick())).armedCrew,0);
   assert.equal(await page.evaluate(()=>CaravanAndroid.back()),true);
   await page.locator('#fit').tap();await page.waitForTimeout(500);
   // CSS-pixel slop should tolerate a 4px finger jitter at every scene scale.
   const tap=await worldPoint(page,535,350);
   await touch('touchStart',[[1,tap.x,tap.y]]);await touch('touchMove',[[1,tap.x+4,tap.y+1]]);await touch('touchEnd',[]);
   assert.equal((await page.evaluate(()=>__CARAVAN_QA.quick())).selectedCarId,'c1');
   assert.equal(await page.locator('#wagonQuick').isVisible(),true);
   // Native safe insets shrink the viewport; CSS safe padding also remains usable.
   await page.evaluate(()=>{CaravanAndroid.back();document.body.style.padding='0px 24px 12px 32px'});
   await page.waitForTimeout(100);
   const safe=await page.locator('#togglePanel').boundingBox();
   assert.ok(safe.x+safe.width<=viewport.width-24,'Header respects safe right edge');
   assert.equal(await page.evaluate(()=>document.querySelector('.playbar').scrollWidth<=document.querySelector('.playbar').clientWidth),true);
   report.push({viewport,canvasHeight:layout.canvas.height,actions:layout.buttons.length,status:'PASS'});
   await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
