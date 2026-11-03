'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,endpoint,resources}=require('../game/v012_restored/server_sync.js');
const code='cv1_'+'a'.repeat(43);
function harness(handler){
 let time=0,summary={metal:210.9,fuel:80,supplies:48,morale:75},states=[],calls=[];
 const map=new Map([['caravan_v12','unchanged save']]);
 const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 const client=create({url:'https://api.example',storage,now:()=>time,getResources:()=>summary,
  onStatus:s=>states.push(s),fetch:async(url,options)=>{
   calls.push({url,...options});
   return handler(url,options,calls);
  }});
 return {client,map,calls,states,advance:n=>time+=n,setSummary:v=>summary=v};
}
const ok=(value,status=200,retry='0')=>({ok:status<400,status,headers:{get:()=>retry},json:async()=>value});
test('only explicit HTTPS origin and permitted integer resource summary',()=>{
 for(const u of ['http://api.example','https://x/path','https://user:secret@x','https://x?code=x','https://x#x','https://appassets.androidplatform.net'])assert.throws(()=>endpoint(u));
 assert.equal(endpoint('https://api.example/'),'https://api.example');
 assert.deepEqual(resources({metal:1.9,fuel:0,supplies:1,morale:99}),{metal:1,fuel:0,supplies:1});
 assert.throws(()=>resources({metal:NaN,fuel:0,supplies:1}));
});
test('automatic registration, bearer identity and fresh summaries never overwrite saves',async()=>{
 const h=harness(async(url,o)=>ok(url.endsWith('/players')?{access_code:code}:{revision:7}));
 await h.client.sync();assert.equal(h.calls.length,3);
 assert.equal(JSON.parse(h.map.get('caravan_sync_v1:https://api.example')).code,code);
 assert.match(JSON.parse(h.calls[0].body).registration_key,/^cr1_[A-Za-z0-9_-]{43}$/);
 const put=h.calls.at(-1);
 assert.equal(put.headers.Authorization,'Bearer '+code);
 assert.equal(put.credentials,'omit');assert.equal(put.redirect,'error');
 assert.deepEqual(JSON.parse(put.body),{resources:{metal:210,fuel:80,supplies:48},revision:7});
 await h.client.sync();assert.equal(h.calls.length,3);
 h.advance(60000);h.setSummary({metal:0,fuel:1,supplies:2});await h.client.sync();
 assert.equal(JSON.parse(h.calls.at(-1).body).resources.metal,0,'reset publishes current values, not an old queue');
 assert.equal(h.map.get('caravan_v12'),'unchanged save');
});
test('429 respects Retry-After and 401 stops automatic retries',async()=>{
 let response=ok({revision:1});
 const h=harness(async(url)=>url.endsWith('/players')?ok({access_code:code}):response);
 await h.client.connect('Captain');response=ok({},429,'180');await h.client.sync();
 const n=h.calls.length;h.advance(60000);await h.client.sync();assert.equal(h.calls.length,n);
 h.advance(120000);response=ok({},401);await h.client.sync();assert.equal(h.states.at(-1),'unauthorized');
 h.advance(3600000);await h.client.sync();assert.equal(h.calls.length,n+1);
});
test('lost response and conflicts recover via profile revision without automatic registration',async()=>{
 let revision=0,lost=true;
 const h=harness(async(url,o)=>{
  if(url.endsWith('/players'))return ok({access_code:code});
  if(o.method==='GET')return ok({revision});
  assert.equal(JSON.parse(o.body).revision,revision);revision++;
  if(lost){lost=false;throw Error('network')}
  return ok({revision});
 });
 await h.client.connect('Captain');await h.client.sync();assert.equal(h.states.at(-1),'offline');
 h.advance(60000);await h.client.sync();assert.equal(h.states.at(-1),'synced');
 assert.equal(h.calls.filter(c=>c.url.endsWith('/players')).length,1);
});
test('disconnect during profile lookup prevents a later upload and survives reload',async()=>{
 let release;
 const h=harness(async(url)=>url.endsWith('/players')?ok({access_code:code}):new Promise(r=>release=r));
 await h.client.connect('Captain');const pending=h.client.sync();h.client.disconnect();
 release(ok({revision:0}));await pending;
 assert.equal(h.calls.length,2);assert.equal(h.states.at(-1),'disabled');
 assert.equal(JSON.parse(h.map.get('caravan_sync_v1:https://api.example')).enabled,false);
});
test('failed durable storage cannot create an orphan account',async()=>{
 let calls=0;
 const c=create({url:'https://api.example',storage:{getItem(){},setItem(){throw Error('quota')}},
  getResources:()=>({}),fetch:async()=>{calls++}});
 await c.connect('Captain');assert.equal(calls,0);
});
test('revision conflict waits before reading a fresh profile and retrying',async()=>{
 let revision=1,conflict=true;
 const h=harness(async(url,o)=>{
  if(url.endsWith('/players'))return ok({access_code:code});
  if(o.method==='GET')return ok({revision});
  if(conflict){conflict=false;revision=2;return ok({},409)}
  assert.equal(JSON.parse(o.body).revision,2);return ok({revision:3});
 });
 await h.client.connect('Captain');await h.client.sync();assert.equal(h.states.at(-1),'conflict');
 const count=h.calls.length;await h.client.sync();assert.equal(h.calls.length,count);
 h.advance(60000);await h.client.sync();assert.equal(h.states.at(-1),'synced');
});
test('lost registration response reuses durable enrollment key instead of creating another account',async()=>{
 let lost=true;
 const h=harness(async(url,o)=>{
  if(url.endsWith('/players')){
   const pending=JSON.parse(h.map.get('caravan_sync_v1:https://api.example'));
   assert.equal(JSON.parse(o.body).registration_key,pending.registrationKey);
   if(lost){lost=false;throw Error('lost registration response')}
   return ok({access_code:code});
  }
  return ok({revision:0});
 });
 await h.client.sync();const first=JSON.parse(h.calls[0].body);
 assert.equal(h.states.at(-1),'offline');h.advance(60000);await h.client.sync();
 assert.deepEqual(JSON.parse(h.calls[1].body),first);
 assert.equal(h.states.at(-1),'synced');
});
test('explicit offline choice persists even before the first account exists',async()=>{
 const h=harness(async()=>{throw Error('must not call')});h.client.disconnect();await h.client.sync();
 assert.equal(h.calls.length,0);
 const c=create({url:'https://api.example',storage:{getItem:k=>h.map.get(k),setItem:(k,v)=>h.map.set(k,v)},
  getResources:()=>({}),fetch:async()=>assert.fail('opt-out must survive reload')});
 await c.sync();
});
