/* CARAVAN crew scene V1: visual phases share actual saved job timers. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.CaravanCrewMotion=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
 'use strict';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const between=(a,b,t)=>a+(b-a)*smooth(t);
 function createDirector(){
   const tracks=new Map();
   function pose(worker,index,modules,jobs,now){
     const home=1125+index*40;
     const id=worker&&worker.id?worker.id:'worker'+index;
     let t=tracks.get(id);
     if(!t){t={lastJob:null,lastCompleted:worker.completed||0,returnStart:null,returnFrom:home,travelFrom:home};tracks.set(id,t);}
     const job=Number.isInteger(worker.job)&&worker.job>=0&&worker.job<modules.length&&jobs[worker.job]?worker.job:null;
     if(job!==null){
       if(t.lastJob!==job){
         t.travelFrom=t.lastJob!==null ? modules[t.lastJob].x+modules[t.lastJob].w-27 : home;
       }
       t.lastJob=job;t.lastCompleted=worker.completed||0;t.returnStart=null;
       const m=modules[job],door=m.x+m.w-27;
       const elapsed=clamp(Number(worker.progress)||0,0,jobs[job].seconds);
       const duration=jobs[job].seconds;
       const walk=Math.min(3.3,duration*.2),enter=.8,leave=1.6;
       const base={id,index,job,door,x:door,y:541,alpha:1,scale:.86,progress:elapsed/duration};
       if(elapsed<walk){
         return {...base,phase:'walking',x:between(t.travelFrom,door,elapsed/walk),y:541+Math.sin(now*10+index)*1.5};
       }
       if(elapsed<walk+enter){
         const a=smooth((elapsed-walk)/enter);
         return {...base,phase:'entering',x:door-7*a,y:541-43*a,alpha:1-.17*a,scale:.86-.12*a};
       }
       if(elapsed<duration-leave){
         return {...base,phase:'working',x:door-38,y:493+Math.sin(now*3+index)*1.5,alpha:.9,scale:.71};
       }
       const a=smooth((elapsed-(duration-leave))/leave);
       return {...base,phase:'exiting',x:door-38+43*a,y:493+48*a,alpha:.85+.15*a,scale:.71+.15*a};
     }
     if(t.lastJob!==null){
       const last=modules[t.lastJob];
       t.returnFrom=last?last.x+last.w-27:home;
       t.lastJob=null;t.returnStart=now;
       t.lastCompleted=worker.completed||0;
     }
     if(t.returnStart!==null){
       const seconds=now-t.returnStart;
       if(seconds<3.4)return {id,index,job:null,phase:'returning',
          x:between(t.returnFrom,home,seconds/3.4),y:541+Math.sin(now*9+index)*2,
          alpha:1,scale:.86,progress:0};
       t.returnStart=null;
     }
     return {id,index,job:null,phase:'patrol',
       x:home+Math.sin(now*.65+index*2)*17,y:541+Math.sin(now*2+index)*2,
       alpha:1,scale:.86,progress:0};
   }
   function pick(poses,x,y){
     for(let i=poses.length-1;i>=0;i--){
       const p=poses[i];
       if(p && p.alpha>.25 && Math.abs(x-p.x)<=22 && Math.abs(y-(p.y+16))<=34)return p;
     }
     return null;
   }
   return Object.freeze({pose,pick});
 }
 return Object.freeze({createDirector});
});
