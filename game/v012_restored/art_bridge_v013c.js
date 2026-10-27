/* Canonical v0.13-C art lookup.
 * The optional review pack must never overwrite the original 103 sprites.
 * If it is absent, prefer already committed original-style location scenes.
 */
(function(root,create){
 'use strict';
 const api=create();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.CaravanArtBridgeV13C=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const approvedLocations={
  signal:'signal_relay_post.png',repair:'railway_repair_site.png',
  scrapyard:'mobile_scrap_yard.png',fuel:'fuel_reserve_station.png',
  switchyard:'damaged_switchyard.png',tower:'salvage_control_tower.png',
  refuge:'refuge_checkpoint.png',power:'abandoned_power_point.png'
 };
 const stationRole=Object.freeze({
  popil:['salvage_bunker','scrapyard'],mist:['collapsed_bridge','switchyard'],
  depot:['fuel_reserve_station','fuel'],tunnel:['minefield','signal'],
  bazar:['merchant_outpost','refuge'],outpost:['radio_beacon','tower']
 });
 const incidentRole=Object.freeze({
  debris:['collapsed_bridge','switchyard'],
  stranger:['survivor_camp','refuge'],wreck:['salvage_bunker','scrapyard']
 });
 const wagonRole=Object.freeze({
  workshop:'workshop_room',salvage:'scrap_processor',cargo:'cargo_room',
  reactor:'power_generator',power:'power_generator',
  greenhouse:'greenhouse_room',greenhouse_plus:'greenhouse_room',
  kitchen:'bunks_room',quarters:'bunks_room',barracks:'defense_outpost',
  medic:'medical_room',arsenal:'ammo_storage',guard:'defense_outpost',
  recon:'navigation_table'
 });
 const reviewBase='assets/review_v013c/sprites/';
 function reviewAvailable(){return globalThis.CARAVAN_ARTPACK_V013C===true;}
 const cleanKey=x=>typeof x==='string'&&/^[a-z0-9_]+$/.test(x)?x:null;
 function locationFallback(role){return 'assets/locations/'+approvedLocations[role];}
 function station(id){
  const entry=stationRole[id];
  if(!entry)return null;
  return reviewAvailable()?reviewBase+'landmarks/256px/'+entry[0]+'.png':locationFallback(entry[1]);
 }
 function incident(id){
  const entry=incidentRole[id];if(!entry)return null;
  return reviewAvailable()?reviewBase+'landmarks/256px/'+entry[0]+'.png':locationFallback(entry[1]);
 }
 function room(kind,originalSprite){
  const role=wagonRole[kind];
  if(reviewAvailable()&&role)return reviewBase+'room_previews/256px/'+role+'.png';
  // Exact original wagon sprite, never a random duplicate or a synthetic train.
  return typeof originalSprite==='string'&&originalSprite.startsWith('assets/')?originalSprite:null;
 }
 function image(url,className){
  if(!url||!/^assets\/[a-z0-9_./-]+\.png$/.test(url))return '';
  return '<img class="'+(className||'caravan-art')+'" src="'+url+'" alt="" aria-hidden="true" loading="lazy" decoding="async">';
 }
 return Object.freeze({station,incident,room,image,reviewAvailable,stationRole,incidentRole,wagonRole,approvedLocations});
});