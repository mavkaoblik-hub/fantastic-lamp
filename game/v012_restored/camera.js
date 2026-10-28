/* CARAVAN v0.12 camera: pure geometry, preserving the original painterly canvas. */
(function(root,create){
  'use strict';
  const api=create();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CaravanV12Camera=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  const WORLD=Object.freeze({width:1200,height:605});
  const WAGON=Object.freeze({width:256,height:163,centerY:392.5});
  const MAX_ZOOM=4.75;
  // The selected cutaway should occupy ~89% of the available scene height.
  const wagonScale=(WORLD.height*.89)/WAGON.height;
  const MODES=Object.freeze({wide:.78,train:1,wagon:Math.round(wagonScale*100)/100});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bound(camera,view=WORLD){
    const z=clamp(Number(camera.zoom)||1,.78,MAX_ZOOM);
    const halfX=view.width/(2*z),halfY=view.height/(2*z);
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
  function zoomAt(camera,newZoom,px,py,view=WORLD){
    const next=clamp(newZoom,.78,MAX_ZOOM),orig=screenToWorld(camera,px,py);
    return bound({zoom:next,
      cx:orig.x-(px-WORLD.width/2)/next,
      cy:orig.y-(py-WORLD.height/2)/next},view);
  }
  function pinch(startCamera,startA,startB,endA,endB,view=WORLD){
    const startDistance=Math.hypot(startA.x-startB.x,startA.y-startB.y);
    const finalDistance=Math.hypot(endA.x-endB.x,endA.y-endB.y);
    if(startDistance<12||finalDistance<12)return bound(startCamera,view);
    const startCenter={x:(startA.x+startB.x)/2,y:(startA.y+startB.y)/2};
    const endCenter={x:(endA.x+endB.x)/2,y:(endA.y+endB.y)/2};
    const anchor=screenToWorld(startCamera,startCenter.x,startCenter.y);
    const next=clamp(startCamera.zoom*finalDistance/startDistance,.78,MAX_ZOOM);
    return bound({zoom:next,
      cx:anchor.x-(endCenter.x-WORLD.width/2)/next,
      cy:anchor.y-(endCenter.y-WORLD.height/2)/next},view);
  }
  function pan(camera,dx,dy,view=WORLD){
    return bound({zoom:camera.zoom,cx:camera.cx-dx/camera.zoom,cy:camera.cy-dy/camera.zoom},view);
  }
  function focusWagon(carIndex,view=WORLD){
    if(!Number.isInteger(carIndex)||carIndex<0||carIndex>2)throw Error('Invalid wagon index');
    const wagonCenters=[535,796,1057];
    const zoom=Math.min(MAX_ZOOM,view.width*.88/WAGON.width,view.height*.82/WAGON.height);
    return bound({zoom:view===WORLD?MODES.wagon:zoom,cx:wagonCenters[carIndex],cy:WAGON.centerY},view);
  }
  function mode(which,carIndex=0,view=WORLD){
    return which==='wagon'?focusWagon(carIndex,view):
      which==='wide'||which==='train'?bound({zoom:MODES[which],cx:600,cy:view===WORLD?302.5:370},view):
      null;
  }
  return Object.freeze({WORLD,MODES,WAGON,MAX_ZOOM,bound,screenToWorld,worldToScreen,zoomAt,pinch,pan,focusWagon,mode});
});
