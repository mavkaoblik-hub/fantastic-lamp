/* Resource summaries only. This module never reads or writes a gameplay save. */
(function(root){
 'use strict';
 const FIELDS=['metal','fuel','supplies'];
 function endpoint(value){
  if(!value)return '';
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname==='appassets.androidplatform.net')throw Error('invalid_endpoint');
  return u.origin;
 }
 function resources(value){
  const result={};
  for(const k of FIELDS){
   if(!Number.isFinite(value[k])||value[k]<0||value[k]>1e9)throw Error('invalid_resources');
   result[k]=Math.floor(value[k]);
  }
  return result;
 }
 function create({url,storage,fetch:request,getResources,onStatus=()=>{},now=Date.now}){
  url=endpoint(url);
  const key='caravan_sync_v1:'+url;
  let identity=null,busy=false,next=0,connectNext=0,failures=0,blocked=false,generation=0;
  try{identity=JSON.parse(storage.getItem(key)||'null')}catch{}
  if(!identity||!/^cv1_[A-Za-z0-9_-]{43}$/.test(identity.code))identity=null;
  function status(s){onStatus(s);return s}
  function persist(value){storage.setItem(key,JSON.stringify(value));identity=value}
  async function api(path,method='GET',data,code){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const headers={};if(data)headers['Content-Type']='application/json';if(code)headers.Authorization='Bearer '+code;
    const response=await request(url+path,{method,headers,body:data?JSON.stringify(data):undefined,
     signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.ok){const e=Error('api_error');e.status=response.status;e.retry=Number(response.headers.get('Retry-After'))||0;throw e}
    return await response.json();
   }finally{clearTimeout(timer)}
  }
  function error(e){
   failures++;next=now()+Math.max(60000,Math.min(3600000,60000*2**Math.min(failures-1,6)),(e.retry||0)*1000);
   if(e.status===401){blocked=true;return status('unauthorized')}
   return status(e.status===400?'invalid_input':e.status===429?'rate_limited':e.status===409?'conflict':'offline');
  }
  async function connect(nickname,code){
   if(!url||busy||now()<connectNext)return;
   if(code&&!/^cv1_[A-Za-z0-9_-]{43}$/.test(code)){status('invalid_code');return}
   busy=true;const current=generation;status('connecting');
   try{
    // Confirm durable identity storage BEFORE creating a server account.
    storage.setItem(key,JSON.stringify(identity||{code:'cv1_'+'x'.repeat(43),enabled:false}));
    const player=code?await api('/v1/me','GET',undefined,code):await api('/v1/players','POST',{nickname});
    if(current!==generation)return;
    const access=code||player.access_code;
    if(!/^cv1_[A-Za-z0-9_-]{43}$/.test(access))throw Error('invalid_response');
    persist({code:access,enabled:true});blocked=false;failures=0;next=0;status('connected');
    return access;
   }catch(e){if(current===generation){error(e);if(!code&&e.status===409)status('nickname_taken');if(e.status===429)connectNext=next}}
   finally{busy=false}
  }
  async function sync(){
   if(!url||!identity?.enabled||blocked||busy||now()<next)return;
   busy=true;const current=generation;status('connecting');
   try{
    const code=identity.code;
    // Always read revision first: reloads, lost responses and another device are safe.
    const player=await api('/v1/me','GET',undefined,code);
    if(current!==generation)return;
    if(!Number.isSafeInteger(player.revision)||player.revision<0)throw Error('invalid_response');
    const summary=resources(getResources());
    await api('/v1/resources','PUT',{resources:summary,revision:player.revision},code);
    if(current!==generation)return;
    failures=0;next=now()+60000;status('synced');
   }catch(e){if(current===generation)error(e)}finally{busy=false}
  }
  function disconnect(){
   // Keep the code for recovery, but do not resume uploads after a reload.
   generation++;blocked=true;
   if(identity){identity={...identity,enabled:false};persist(identity)}
   status('disabled');
  }
  status(!url?'unconfigured':identity?.enabled?'waiting':'disabled');
  return {connect,sync,disconnect,hasIdentity:()=>Boolean(identity?.enabled)};
 }
 const exported={endpoint,resources,create};
 if(typeof module==='object'&&module.exports)module.exports=exported;
 else root.CaravanServerSync=exported;
})(globalThis);
