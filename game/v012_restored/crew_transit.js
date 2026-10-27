/* CARAVAN v0.13-D1 — absolute safety invariant: no exterior crew on an
 * active route, including paused/event/reloaded trips. D2 adds boarding.
 * This pure state transition does not touch economy or route resources. */
(function(root,create){
 'use strict';
 const api=create();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanCrewTransit=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const TARGETS=Object.freeze({
  engine:{x:279,kind:'locomotive'},
  center:{x:518,kind:'wagon'},
  rear:{x:777,kind:'wagon'},
  tail:{x:1034,kind:'wagon'}
 });
 const slots=['center','rear','tail'];
 function validTarget(job,cars){
  if(!job||!TARGETS[job.target])return false;
  if(job.target==='engine')return true;
  const car=cars[slots.indexOf(job.target)];
  return Boolean(car && typeof car.id==='string');
 }
 function synchronize(crew,cars,active){
  if(!Array.isArray(crew)||!Array.isArray(cars))return {changed:false,aboard:0};
  let changed=false,aboard=0;
  for(let i=0;i<crew.length;i++){
   const p=crew[i];if(!p||typeof p!=='object')continue;
   if(active){
    const assigned=validTarget(p.job,cars);
    if(!assigned && p.job){p.job=null;changed=true;}
    // In D1 convert transit/exit animations to safe interiors atomically.
    // Never issue rewards, restart journeys or duplicate job assignments.
    const mode=assigned?'working':'aboard';
    const slot=assigned?p.job.target:'engine';
    const desiredX=assigned?TARGETS[slot].x:241+(i*31);
    const location=slot==='engine'?'locomotive':'wagon';
    const carId=slot==='engine'?null:cars[slots.indexOf(slot)].id;
    const newLocation={kind:location,carId};
    if(p.mode!==mode){p.mode=mode;changed=true;}
    if(p.inside!==1){p.inside=1;changed=true;}
    if(p.x!==desiredX){p.x=desiredX;changed=true;}
    if(p.boardingState!=='aboard'){p.boardingState='aboard';changed=true;}
    if(!p.location||p.location.kind!==location||p.location.carId!==carId){
      p.location=newLocation;changed=true;
    }
    aboard++;
   }else{
    // On actual station arrival, only unassigned standby passengers return
    // to external patrol. Assigned workers continue working in their wagon.
    if(p.mode==='aboard'){
      p.mode='patrol';p.inside=0;p.x=460+(i*146);
      p.boardingState='none';p.location={kind:'platform',carId:null};
      changed=true;
    }else if(p.mode==='patrol'&&p.location?.kind!=='platform'){
      p.location={kind:'platform',carId:null};
      p.boardingState='none';changed=true;
    }
    if(p.location?.kind==='locomotive'||p.location?.kind==='wagon'||(p.inside===1&&p.mode==='working'))aboard++;
   }
  }
  return {changed,aboard};
 }
 function renderableOutside(p,active){
  return !active && p?.location?.kind==='platform';
 }
 function phase(active,moving,pending){
  if(!active)return 'DOCKED';
  if(pending)return 'PAUSED_EVENT';
  return moving?'TRAVELLING':'PAUSED_MANUAL';
 }
 return Object.freeze({TARGETS,synchronize,validTarget,renderableOutside,phase});
});
