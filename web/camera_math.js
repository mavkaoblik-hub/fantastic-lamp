/* Camera/world coordinate rules shared by Android and Node regression tests. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CaravanCameraMath=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  const MODES=Object.freeze({macro:0.76,operational:1,micro:1.7});
  const LIMITS=Object.freeze({min:0.62,max:2.1,worldLeft:140,worldRight:1510,pivotY:520});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bound(left,zoom,viewportWidth,opts=LIMITS){
    const visible=viewportWidth/zoom;
    const sceneWidth=opts.worldRight-opts.worldLeft;
    if(visible>=sceneWidth)return (opts.worldLeft+opts.worldRight-visible)/2;
    return clamp(left,opts.worldLeft,opts.worldRight-visible);
  }
  function fromScreen(px,py,left,zoom,viewportWidth,opts=LIMITS){
    return {x:left+px/zoom,y:opts.pivotY+(py-opts.pivotY)/zoom};
  }
  function toScreen(x,y,left,zoom,opts=LIMITS){
    return {x:(x-left)*zoom,y:opts.pivotY+(y-opts.pivotY)*zoom};
  }
  function zoomAt(left,oldZoom,newZoom,screenX,viewportWidth,opts=LIMITS){
    const z=clamp(newZoom,opts.min,opts.max);
    return {zoom:z,left:bound(left+screenX/oldZoom-screenX/z,z,viewportWidth,opts)};
  }
  function pan(left,deltaScreenX,zoom,viewportWidth,opts=LIMITS){
    return bound(left-deltaScreenX/zoom,zoom,viewportWidth,opts);
  }
  function centerAt(worldX,zoom,viewportWidth,opts=LIMITS){
    return bound(worldX-viewportWidth/(2*zoom),zoom,viewportWidth,opts);
  }
  function polygonContains(x,y,vertices){
    let inside=false;
    for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
      const a=vertices[i],b=vertices[j];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function wagonAt(x,y,modules){
    for(let i=0;i<modules.length;i++){
      const m=modules[i],a=m.x,w=m.w;
      const poly=[[a+6,356],[a+w-7,356],[a+w+9,383],[a+w+9,576],[a-8,576],[a-8,384]];
      if(polygonContains(x,y,poly))return i;
    }
    return -1;
  }
  return Object.freeze({MODES,LIMITS,bound,fromScreen,toScreen,zoomAt,pan,centerAt,polygonContains,wagonAt});
});
