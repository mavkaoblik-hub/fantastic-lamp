/* CARAVAN v0.12 camera: pure geometry, preserving the original painterly canvas. */
(function(root,create){
  'use strict';
  const api=create();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CaravanV12Camera=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  const WORLD=Object.freeze({width:1200,height:605});
  const MODES=Object.freeze({wide:.78,train:1,wagon:1.65});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bound(camera){
    const z=clamp(Number(camera.zoom)||1,.78,2.15);
    const halfX=WORLD.width/(2*z),halfY=WORLD.height/(2*z);
    return {
      zoom:z,
      cx:halfX>=WORLD.width/2?WORLD.width/2:clamp(Number(camera.cx)||WORLD.width/2,halfX,WORLD.width-halfX),
      cy:halfY>=WORLD.height/2?WORLD.height/2:clamp(Number(camera.cy)||WORLD.height/2,halfY,WORLD.height-halfY)
    };
  }
  function screenToWorld(camera,px,py){
    return {x:camera.cx+(px-WORLD.width/2)/camera.zoom,
            y:camera.cy+(py-WORLD.height/2)/camera.zoom};
  }
  function worldToScreen(camera,x,y){
    return {x:WORLD.width/2+(x-camera.cx)*camera.zoom,
            y:WORLD.height/2+(y-camera.cy)*camera.zoom};
  }
  function zoomAt(camera,newZoom,px,py){
    const next=clamp(newZoom,.78,2.15),orig=screenToWorld(camera,px,py);
    return bound({zoom:next,
      cx:orig.x-(px-WORLD.width/2)/next,
      cy:orig.y-(py-WORLD.height/2)/next});
  }
  function pan(camera,dx,dy){
    return bound({zoom:camera.zoom,cx:camera.cx-dx/camera.zoom,cy:camera.cy-dy/camera.zoom});
  }
  function focusWagon(carIndex){
    if(!Number.isInteger(carIndex)||carIndex<0||carIndex>2)throw Error('Invalid wagon index');
    const wagonCenters=[535,796,1057];
    return bound({zoom:MODES.wagon,cx:wagonCenters[carIndex],cy:394});
  }
  function mode(which,carIndex=0){
    return which==='wagon'?focusWagon(carIndex):
      which==='wide'||which==='train'?bound({zoom:MODES[which],cx:600,cy:302.5}):
      null;
  }
  return Object.freeze({WORLD,MODES,bound,screenToWorld,worldToScreen,zoomAt,pan,focusWagon,mode});
});
