/* Real FastAPI + SQLite over loopback. HTTPS browser origins are locally routed;
   this does not test a deployed server, DNS or a public TLS certificate. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright-core');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const temporary=fs.mkdtempSync(path.resolve('build/sync-browser-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const api='http://127.0.0.1:'+port,game='https://game.caravan.test',remote='https://api.caravan.test';
 const server=spawn(process.env.CARAVAN_PYTHON||'python3',['-m','uvicorn','server.caravan_api:create_app','--factory','--host','127.0.0.1','--port',String(port),'--no-access-log'],{
  windowsHide:true,env:{...process.env,CARAVAN_DATA_DIR:temporary,CARAVAN_ALLOWED_ORIGINS:game},stdio:['ignore','ignore','pipe']});
 let logs='',browser;
 server.stderr.on('data',b=>logs+=b);
 try{
  for(let i=0;;i++){
   try{if((await fetch(api+'/health')).ok)break}catch{}
   if(i>=60)throw Error('API startup failed: '+logs);await delay(100);
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CARAVAN_CHROME_BIN,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  await context.route(game+'/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/sync_config.json')return route.fulfill({json:{endpoint:remote}});
   const file=path.resolve('build/caravan_v012','.'+(pathname==='/'?'/index.html':pathname));
   const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
   if(!file.startsWith(path.resolve('build/caravan_v012')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing test asset'});
   return route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  let failed=false,loseRegistrationReply=true,createdProfile;const registrations=[];
  await context.route(remote+'/**',async route=>{
   if(failed)return route.abort('failed');
   const r=await route.fetch({url:api+new URL(route.request().url()).pathname});
   if(route.request().method()==='POST'){
    registrations.push(JSON.parse(route.request().postData()));
    createdProfile=await r.json();
    if(loseRegistrationReply){loseRegistrationReply=false;return route.abort('failed')}
   }
   await route.fulfill({response:r});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(game+'/');
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent.includes('Немає зв’язку'));
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),false,'No registration prompt blocks first play');
  const before=await page.evaluate(()=>{__CARAVAN_SAVE();return __CARAVAN_RESOURCE_SUMMARY()});
  assert.equal(typeof createdProfile.player_id,'string','First request reached real API despite lost reply');
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent==='Зведення надіслано');
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),false);
  assert.equal(registrations.length,2);
  assert.deepEqual(registrations[0],registrations[1],'Reload retries the same durable enrollment');
  await page.screenshot({path:path.join(temporary,'entry-automatic-account.png')});
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  const board=await (await fetch(api+'/v1/leaderboard')).json();
  assert.equal(board.player_count,1);
  assert.match(board.players[0].nickname,/^Караван-[a-f0-9]{12}$/);
  assert.deepEqual(board.players[0].resources,before);
  assert.equal(board.verification,'client_reported');
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent==='Зведення надіслано');
  assert.equal(registrations.length,2,'Subsequent startup authenticates without creating another account');
  // Offline startup keeps resources, crew and existing game save usable.
  failed=true;await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent.includes('Немає зв’язку'));
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('caravan_v12')).metal),before.metal);
  await page.evaluate(()=>__CARAVAN_QA.advance(1));
  failed=false;
  // Rejected credentials leave gameplay accessible and never create another account.
  await page.evaluate(()=>localStorage.setItem('caravan_sync_v1:https://api.caravan.test',JSON.stringify({code:'cv1_'+'z'.repeat(43),enabled:true})));
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('Код не прийнято'));
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),false);
  assert.equal(registrations.length,2);
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  assert.deepEqual(errors,[]);
  console.log('PASS: automatic first registration, lost enrollment reply without duplicate account, remembered login, real API snapshots, offline saves and nonblocking 401. Evidence: '+temporary);
 }finally{
  if(browser)await browser.close();
  server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve)});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
