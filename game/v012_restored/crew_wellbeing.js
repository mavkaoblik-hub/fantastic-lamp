/* CARAVAN v0.13-D6A — fatigue and recovery, no economy mutations. */
(function(root,factory){
'use strict';const api=factory();
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.CaravanCrewWellbeing=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
'use strict';
const SLOTS=['center','rear','tail'],REST=new Set(['quarters','barracks']);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function normalize(p){
 if(!p||typeof p!=='object')return false;
 const v=clamp(Number.isFinite(p.fatigue)?p.fatigue:0,0,100);
 if(p.fatigue===v)return false;p.fatigue=v;return true;
}
function normalizeAll(crew){let changed=false;if(!Array.isArray(crew))return false;
 for(const p of crew)if(normalize(p))changed=true;return changed;}
function inRestWagon(p,cars){
 if(p?.mode!=='working'||!Array.isArray(cars))return false;
 const i=SLOTS.indexOf(p.job?.target);
 return i>=0&&REST.has(cars[i]?.kind);
}
function efficiency(p){return 1-.45*clamp(Number.isFinite(p?.fatigue)?p.fatigue:0,0,100)/100;}
function advance(crew,cars,dt){
 if(!Array.isArray(crew)||!Number.isFinite(dt)||dt<=0)return false;
 const step=Math.min(1,dt);let changed=false;
 for(const p of crew){
  if(!p)continue;if(normalize(p))changed=true;
  const rate=p.mode==='working'?(inRestWagon(p,cars)?-.34:.14):
   (p.mode==='aboard'||p.mode==='patrol'?-.11:0);
  if(!rate)continue;
  const next=clamp(p.fatigue+rate*step,0,100);
  if(next!==p.fatigue){p.fatigue=next;changed=true;}
 }
 return changed;
}
function describe(p,cars){return {fatigue:Math.round(clamp(Number.isFinite(p?.fatigue)?p.fatigue:0,0,100)),
 efficiency:Math.round(efficiency(p)*100),resting:inRestWagon(p,cars)||p?.mode==='aboard'};}
return Object.freeze({normalize,normalizeAll,inRestWagon,efficiency,advance,describe});
});
