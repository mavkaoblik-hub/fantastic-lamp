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
  let failed=false;
  await context.route(remote+'/**',async route=>{
   if(failed)return route.abort('failed');
   const r=await route.fetch({url:api+new URL(route.request().url()).pathname});
   await route.fulfill({response:r});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(game+'/');
  await page.waitForFunction(()=>document.getElementById('syncAuth').open);
  assert.equal(await page.locator('#syncRegister').isEnabled(),true);
  await page.screenshot({path:path.join(temporary,'entry-first-launch.png')});
  const before=await page.evaluate(()=>{__CARAVAN_SAVE();return __CARAVAN_RESOURCE_SUMMARY()});
  await page.locator('#syncNickname').fill('BrowserCaptain');
  await page.locator('#syncRegister').click();
  await page.waitForFunction(()=>document.getElementById('syncStatus').textContent==='Зведення надіслано');
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),true,'New registrant can save the recovery code before continuing');
  assert.match(await page.locator('#syncCode').inputValue(),/^cv1_[A-Za-z0-9_-]{43}$/);
  await page.screenshot({path:path.join(temporary,'entry-registration.png')});
  await page.locator('#syncContinue').click();
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  const board=await (await fetch(api+'/v1/leaderboard')).json();
  assert.equal(board.players[0].nickname,'BrowserCaptain');
  assert.deepEqual(board.players[0].resources,before);
  assert.equal(board.verification,'client_reported');
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent==='Зведення надіслано');
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),false,'Stored identity authenticates at startup');
  // Offline startup keeps resources, crew and existing game save usable.
  failed=true;await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent.includes('Немає зв’язку'));
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('caravan_v12')).metal),before.metal);
  await page.evaluate(()=>__CARAVAN_QA.advance(1));
  failed=false;
  // Remove identity only and log in again; no duplicate registration or save reset.
  const code=await page.evaluate(()=>JSON.parse(localStorage.getItem('caravan_sync_v1:https://api.caravan.test')).code);
  await page.evaluate(()=>localStorage.removeItem('caravan_sync_v1:https://api.caravan.test'));
  await page.reload();await page.waitForFunction(()=>document.getElementById('syncAuth').open);
  await page.locator('#syncShowLogin').click();
  await page.locator('#syncCode').fill(code);await page.locator('#syncConnect').click();
  await page.waitForFunction(()=>!document.getElementById('syncAuth').open);
  await page.waitForFunction(()=>document.getElementById('syncLinkStatus').textContent==='Зведення надіслано');
  assert.equal((await (await fetch(api+'/v1/leaderboard')).json()).player_count,1);
  // Rejected startup credentials must reopen login, while preserving the local game.
  await page.evaluate(()=>localStorage.setItem('caravan_sync_v1:https://api.caravan.test',JSON.stringify({code:'cv1_'+'z'.repeat(43),enabled:true})));
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('syncStatus').textContent.includes('Код не прийнято'));
  assert.equal(await page.locator('#syncAuth').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#syncLogin').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>__CARAVAN_RESOURCE_SUMMARY()),before);
  assert.deepEqual(errors,[]);
  console.log('PASS: first registration, startup bearer authentication, real API snapshot/leaderboard, reload, offline save preservation and code login. Evidence: '+temporary);
 }finally{
  if(browser)await browser.close();
  server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve)});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
