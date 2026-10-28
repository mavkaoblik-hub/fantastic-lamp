/* CARAVAN v0.13-D6A — fatigue and recovery, no economy mutations. */
(function(root,factory){
'use strict';const api=factory();
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.CaravanCrewWellbeing=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
'use strict';
const SLOTS=['center','rear','tail'],REST=new Set(['quarters','barracks']);
const LEVELS=[0,4,12,24,40],MAX_XP=1000000;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function normalize(p){
 if(!p||typeof p!=='object')return false;
 const v=clamp(Number.isFinite(p.fatigue)?p.fatigue:0,0,100);
 const xp=clamp(Number.isFinite(p.experience)?Math.floor(p.experience):0,0,MAX_XP);
 const changed=p.fatigue!==v||p.experience!==xp;
 p.fatigue=v;p.experience=xp;return changed;
}
function normalizeAll(crew){let changed=false;if(!Array.isArray(crew))return false;
 for(const p of crew)if(normalize(p))changed=true;return changed;}
function inRestWagon(p,cars){
 if(!['working','resting'].includes(p?.mode)||!Array.isArray(cars))return false;
 const i=SLOTS.indexOf(p.job?.target);
 return i>=0&&REST.has(cars[i]?.kind);
}
function efficiency(p){return 1-.45*clamp(Number.isFinite(p?.fatigue)?p.fatigue:0,0,100)/100;}
function growth(p){
 const xp=clamp(Number.isFinite(p?.experience)?Math.floor(p.experience):0,0,MAX_XP);
 let level=1;for(let i=1;i<LEVELS.length;i++)if(xp>=LEVELS[i])level=i+1;
 return {level,xp,next:level<5?LEVELS[level]:null,bonus:1+.03*(level-1)};
}
function addExperience(crew,indices){
 const promotions=[];
 if(!Array.isArray(crew)||!Array.isArray(indices))return promotions;
 for(const i of new Set(indices)){
  if(!Number.isInteger(i)||i<0||i>=crew.length||!crew[i])continue;
  const p=crew[i];normalize(p);
  const old=growth(p).level;p.experience=Math.min(MAX_XP,p.experience+1);
  const next=growth(p).level;
  if(next>old)promotions.push({index:i,level:next});
 }
 return promotions;
}
function advance(crew,cars,dt){
 if(!Array.isArray(crew)||!Number.isFinite(dt)||dt<=0)return false;
 const step=Math.min(1,dt);let changed=false;
 for(const p of crew){
  if(!p)continue;if(normalize(p))changed=true;
  const rate=p.mode==='resting'?(inRestWagon(p,cars)?-.65:0):
   p.mode==='working'?(inRestWagon(p,cars)?-.34:.14):
   (p.mode==='aboard'||p.mode==='patrol'?-.11:0);
  if(!rate)continue;
  const next=clamp(p.fatigue+rate*step,0,100);
  if(next!==p.fatigue){p.fatigue=next;changed=true;}
 }
 return changed;
}
function describe(p,cars){return {fatigue:Math.round(clamp(Number.isFinite(p?.fatigue)?p.fatigue:0,0,100)),
 efficiency:Math.round(efficiency(p)*100),resting:inRestWagon(p,cars)||p?.mode==='aboard',...growth(p)};}
return Object.freeze({normalize,normalizeAll,inRestWagon,efficiency,growth,addExperience,advance,describe});
});
