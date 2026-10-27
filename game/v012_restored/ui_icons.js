/* Canonical UI icon wiring for authentic Caravan v0.12 renderer.
 * One semantic ID per role. No second quest icon and no invented currency.
 * Graphical source: SHA-verified approved painterly atlas crops.
 */
(function(root){
 'use strict';
 const prefix='assets/ui_alpha/';
 const icons=Object.freeze({
   'ui.tasks_open':'ui/ui_tasks_open.png',
   'ui.map':'ui/ui_map.png',
   'ui.crew':'ui/ui_crew.png',
   'ui.inventory':'ui/ui_inventory.png',
   'ui.upgrade':'ui/ui_upgrade.png',
   'ui.workshop':'ui/ui_workshop.png',
   'ui.movement':'ui/ui_movement.png',
   'ui.stop':'ui/ui_stop.png',
   'ui.confirm':'ui/ui_confirm.png',
   'ui.cancel':'ui/ui_cancel.png',
   'ui.information':'ui/ui_information.png',
   'ui.warning':'ui/ui_warning.png',
   'resource.metal':'resource/resource_metal.png',
   'resource.fuel':'resource/resource_fuel.png',
   'resource.food':'resource/resource_food.png',
   'status.morale':'status/status_morale.png'
 });
 const roles=Object.freeze({
   journalOpen:'ui.tasks_open',
   routeOpen:'ui.map',
   tasksOpen:'ui.crew',
   newCrew:'ui.crew',
   upgrade:'ui.upgrade',
   locoUpgrade:'ui.upgrade',
   attachCar:'ui.confirm',
   detachCar:'ui.cancel',
   sendCrewToCar:'ui.crew',
   reset:'ui.warning',
   travel:'ui.movement'
 });
 const resourceIds=Object.freeze({
   metal:'resource.metal',fuel:'resource.fuel',
   supplies:'resource.food',morale:'status.morale'
 });
 function install(el,id,className){
   if(!el||!icons[id])return;
   let icon=el.querySelector('img[data-caravan-icon]');
   if(icon && icon.dataset.caravanIcon===id)return;
   if(icon)icon.remove();
   icon=document.createElement('img');
   icon.className=className;icon.dataset.caravanIcon=id;
   icon.alt='';icon.setAttribute('aria-hidden','true');
   icon.decoding='async';
   icon.src=prefix+icons[id];
   el.prepend(icon);
 }
 function refresh(state){
   for(const [elementId,role] of Object.entries(roles)){
     const el=document.getElementById(elementId);
     const id=elementId==='travel' && state?.moving?'ui.stop':role;
     install(el,id,'caravan-ui-icon');
   }
   for(const [elementId,role] of Object.entries(resourceIds)){
     const label=document.getElementById(elementId)?.parentElement;
     install(label,role,'caravan-resource-icon');
   }
 }
 function sources(){return Object.entries(icons).map(([id,path])=>({id,path:prefix+path}));}
 root.CaravanApprovedUI=Object.freeze({refresh,sources});
})(globalThis);
