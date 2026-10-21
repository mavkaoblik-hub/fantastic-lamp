/* CARAVAN // interactive vertical slice. No external JS dependencies. */
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('scene'), c=canvas.getContext('2d',{alpha:false});
const TAU=Math.PI*2;const PI=Math.PI;const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const saveKey='caravan_last_road_slice_01';
let state={scrap:145,fuel:81,food:62,crew:6,level:[1,1,1],stage:0,explored:false,travelling:false,distance:0};
try{const old=JSON.parse(localStorage.getItem(saveKey)||'null');if(old && Array.isArray(old.level)) state={...state,...old,travelling:false};}catch{}
function persist(){try{localStorage.setItem(saveKey,JSON.stringify(state));}catch{}}
const modules=[
 {name:'СКЛАД ПОСТАЧАННЯ',desc:'Сортування запасів, інструментів і матеріалів. Покращення підвищує ефективність пошуку ресурсів.',x:300,w:248,cost:45,benefit:'+10 металу за розвідку',accent:'#9ba892'},
 {name:'ЖИТЛОВИЙ ВАГОН',desc:'Місце відпочинку та відновлення екіпажу. Покращення допомагає зберігати припаси в далеких рейсах.',x:553,w:263,cost:55,benefit:'−2 припаси за рейс',accent:'#c99a72'},
 {name:'МАЙСТЕРНЯ',desc:'Механіки ремонтують броню, генератори та важливі системи потяга. Покращення знижує витрату палива.',x:823,w:266,cost:65,benefit:'−3 паливо за рейс',accent:'#d19a55'},
];
const locations=[['СТАНЦІЯ «ПОПІЛ»','РОЗБИТІ КОЛІЇ','СУХИЙ ВІТЕР / 8°C'],['КІСТЯНИЙ МІСТ','ІРЖАВІ ЗЕМЛІ','ПИЛОВА БУРЯ / 6°C'],['ПОКИНУТИЙ ДЕПО','МЕРТВИЙ РЕГІОН','ТУМАН / 3°C'],['МІДНИЙ ПЕРЕВАЛ','СТАРІ МЕХАНІЗМИ','ЯСНО / 12°C'],['ОСТАННІЙ СИГНАЛ','ЗЕМЛІ ПОЗА МАПОЮ','ХОЛОД / −2°C']];
const noise=(n)=>{let x=Math.sin(n*127.1+12.37)*43758.5453;return x-Math.floor(x)};
let width=0,height=0,scale=1,viewW=1280,cam=165,time=0,last=performance.now(),distanceScroll=0,trail=[],fx=[],chosen=-1,drag=null,muted=true,travelTimer=0,lastStation=0;
function resize(){width=window.innerWidth;height=window.innerHeight;let d=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*d);canvas.height=Math.round(height*d);canvas.style.width=width+'px';canvas.style.height=height+'px';scale=height/720;viewW=width/scale;c.setTransform(d*scale,0,0,d*scale,0,0);cam=clamp(cam,-110,Math.max(800,1700-viewW));}window.addEventListener('resize',resize);resize();
function styleText(text,x,y,size=15,color='#ddd5c5',font='600',align='left'){c.textAlign=align;c.font=`${font} ${size}px system-ui`;c.fillStyle=color;c.fillText(text,x,y);c.textAlign='left';}
function rr(x,y,w,h,r,fill,stroke=null,lw=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.stroke();}}
function line(x1,y1,x2,y2,col,lw=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=col;c.lineWidth=lw;c.stroke();}
function poly(points,fill,stroke=null,lw=1){c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function grad(x,y,x2,y2,stops){let g=c.createLinearGradient(x,y,x2,y2);for(const [t,col] of stops)g.addColorStop(t,col);return g;}
function ellipse(x,y,rx,ry,col){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=col;c.fill();}
function glow(x,y,r,col='#e3a45b'){c.save();c.globalCompositeOperation='screen';let g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,col+'99');g.addColorStop(.24,col+'38');g.addColorStop(1,col+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
function sky(){let g=grad(0,0,0,660,[[0,'#101e34'],[.39,'#395168'],[.65,'#b16f61'],[.89,'#d0936b'],[1,'#3e4849']]);c.fillStyle=g;c.fillRect(0,0,viewW,720);
 glow(viewW*.73,228,320,'#ee895b');ellipse(viewW*.73,247,77,77,'#e9ad78');
 c.save();c.globalAlpha=.26;for(let i=0;i<27;i++){let x=noise(i*17.1)*viewW, y=92+noise(i*38)*250, w=80+noise(i*43)*270;c.fillStyle=i%2?'#273b59':'#e2a48b';ellipse(x+Math.sin(time*.018+i)*9,y,w,8+noise(i*23)*22,c.fillStyle);}c.restore();
 // layered mountains move slower on travel
 for(let layer=0;layer<3;layer++){let baseY=355+layer*48,off=(cam*(.07+layer*.1)+distanceScroll*(.13+layer*.14))%470;let pts=[[-200,baseY]];for(let i=-2;i<30;i++){let x=i*110-off,peak=baseY-(noise(i*4.3+layer*39)*115/(layer+1)+16);pts.push([x,peak],[x+60,baseY-14]);}pts.push([viewW+300,720],[-200,720]);poly(pts,['#4b5969','#354353','#2a3744'][layer]);}
 c.save();c.globalAlpha=.76;
 for(let i=-2;i<49;i++){let x=i*65-(cam*.23+distanceScroll*.21)%65;let h=34+noise(i+23)*110,depth=noise(i*7.3+22);c.fillStyle=depth>.45?'#2b3a49':'#263341';c.fillRect(x,449-h,36+depth*29,h); if(depth>.5){for(let k=0;k<4;k++)c.fillRect(x+7+k*10,449-h-8,4,12)}if(i%6===0){line(x,449-h,x+10,449-h-22,'#263341',3);line(x+9,449-h-21,x+44,449-h-21,'#263341',3);}}
 c.restore();
}
function brokenStation(){c.save();c.translate(-(cam*.5+distanceScroll*.46)%940,0);for(let b=-1;b<4;b++){let ox=b*940+60;
 // large ruined walls / platform
 poly([[ox,430],[ox+32,260],[ox+94,261],[ox+119,403],[ox+320,411],[ox+333,275],[ox+399,267],[ox+419,433]],'#343b40','#26343c',2);
 poly([[ox+20,266],[ox+97,264],[ox+89,236],[ox+65,227],[ox+45,253]],'#5a544e');
 for(let j=0;j<3;j++){let x=ox+49+j*132;rr(x,310,61,117,18,'#202e37','#5a5551',6);rr(x+8,316,45,111,15,'#1a2c36','#35454a',2);}
 for(let j=0;j<6;j++)rr(ox+23+j*70,281,47,7,1,'#716357');
 for(let j=0;j<3;j++){let x=ox+48+j*114;line(x,265,x,442,'#64615b',6);line(x+4,275,x+7,435,'#202d35',2);}
 // iron canopy
 poly([[ox-100,278],[ox+380,235],[ox+442,249],[ox-100,302]],'#1d3038','#686153',5);
 for(let j=0;j<12;j++)line(ox-90+j*45,278-j*4,ox-70+j*45,293-j*4,'#826c54',3);
 // station clock
 ellipse(ox+232,246,39,42,'#6b5e50');ellipse(ox+232,246,34,37,'#d0b995');ellipse(ox+232,246,30,33,'#5f6765');line(ox+232,246,ox+230,222,'#d9ccae',2);line(ox+232,246,ox+246,256,'#d9ccae',3);
 // hanging banner
 poly([[ox+121,270],[ox+160,269],[ox+156,332],[ox+140,322],[ox+123,334]],'#6b3e35');
 // hanging lanterns
 for(let j=0;j<3;j++){let lx=ox+40+j*132;line(lx,286,lx,346,'#182632',2);glow(lx,352,29);rr(lx-6,344,12,18,2,'#f9c379','#534638',2)}
}c.restore();}
function foreground(){let off=(distanceScroll*.95)%97;
 c.fillStyle=grad(0,589,0,720,[[0,'#2b3031'],[.1,'#363432'],[.55,'#1c242b'],[1,'#101923']]);c.fillRect(0,585,viewW,145);
 for(let i=-2;i<Math.ceil(viewW/97)+3;i++){let x=i*97-off;poly([[x,597],[x+48,597],[x+35,683],[x-9,683]],'#443b32','#5b5548',1);line(x-25,610,x+44,610,'#615747',3);}
 for(const y of [603,658]){line(0,y,viewW,y,'#1a2229',15);line(0,y-5,viewW,y-5,'#8a8173',3);line(0,y+4,viewW,y+4,'#51463d',2);}
 for(let i=0;i<40;i++){let x=noise(i*23)*viewW,y=676+noise(i*12)*44;ellipse(x,y,1+noise(i*9)*4,1,'#5b5141');}
 for(let i=0;i<22;i++){let x=i*113-(distanceScroll*.63)%113;for(let h=0;h<4;h++){let bend=noise(i*9+h*9);line(x,yFromPlant(h,bend),x+Math.sin(time*.5+i)*2.5,696+h*3,'#77735d',1);}}
 function yFromPlant(h,b){return 690-(h*5+b*13)}
}
function wheel(x,y,r,rot){glow(x,y,26,'#e1a95f');ellipse(x,y,r+5,r+5,'#111922');ellipse(x,y,r,r,'#3c4246');ellipse(x,y,r-5,r-5,'#171f27');c.save();c.translate(x,y);c.rotate(rot);for(let j=0;j<8;j++){let a=j*TAU/8;line(Math.cos(a)*5,Math.sin(a)*5,Math.cos(a)*(r-8),Math.sin(a)*(r-8),'#716e65',3);}c.restore();ellipse(x,y,6,6,'#a18f70');ellipse(x,y,3,3,'#d7aa72');}
function armor(x,y,w,h){rr(x,y,w,h,7,grad(x,y,x,y+h,[[0,'#5e5b55'],[.1,'#39434a'],[.66,'#273238'],[1,'#1c242b']]),'#777163',3);
 c.save();c.globalAlpha=.24;for(let k=0;k<w/24;k++){let n=noise(k*13+x);line(x+k*24,y+5,x+k*24+7,y+h-5,n>.6?'#b18b66':'#182930',n>.6?1.5:1)}c.restore();
 for(let xx=x+10;xx<x+w-7;xx+=35)for(const yy of [y+12,y+h-10]){ellipse(xx,yy,2,2,'#b49f83');}}
function chassis(x,w){rr(x-7,551,w+16,29,3,grad(0,549,0,581,[[0,'#716d5d'],[.3,'#34373a'],[1,'#1b1d22']]),'#9d8466',2);line(x,563,x+w,563,'#b29b78',2);line(x,576,x+w,576,'#171c25',7);
 for(const k of [x+43,x+w-46])wheel(k,590,25,distanceScroll*.028);for(let xx=x+8;xx<x+w;xx+=33)ellipse(xx,558,2.3,2.3,'#b18f65');}
function platformDetails(x,y,w){for(let xx=x+5;xx<x+w-7;xx+=24){line(xx,y+2,xx,y-12,'#64727a',2);line(xx,y-13,xx+17,y-13,'#798080',2);}line(x,y+4,x+w,y+4,'#8e8b78',3);}
function cargo(x,y){rr(x,y,51,33,1,'#655640','#a28e66',1);for(let j=0;j<3;j++)line(x+4+j*15,y,x+4+j*15,y+33,'#9c8661',2);line(x,y+19,x+51,y+19,'#b2986a',2);}
function crewFigure(x,y,s=1,pose=0){c.save();c.translate(x,y);c.scale(s,s);let w=Math.sin(time*2+pose),walk=Math.sin(time*2.4+pose)*3;
 ellipse(0,0,6,7,'#9d8c75');rr(-7,7,14,18,3,'#696c5b','#393e40',1);rr(-7,8,14,8,2,'#7b6e5c');poly([[-6,10],[-11,13+w*2],[-10,24+w*2],[-7,24],[-3,14]],'#696f65');poly([[6,10],[10,12-w*2],[11,23-w*2],[8,23],[3,15]],'#676858');line(-3,26,-4+walk,37,'#383a3c',5);line(4,26,4-walk,37,'#383a3c',5);rr(-7,-8,14,4,2,'#42474a');rr(-5,-7,10,4,1,'#756a54');c.restore();}
function roof(x,y,w){poly([[x-8,y+10],[x+9,y-1],[x+w-8,y-1],[x+w+9,y+10]],'#3b4446','#857867',2);rr(x-8,y+10,w+16,10,1,'#434543','#9c8870',2);for(let xx=x+12;xx<x+w;xx+=34){rr(xx,y+15,19,8,1,'#252e36','#887762',1);}}
function boltPanels(x,y,w,h){for(let xx=x+16;xx<x+w-8;xx+=41){line(xx,y+4,xx,y+h-3,'#826d5970',2);ellipse(xx+3,y+10,1.8,1.8,'#ae9c7d');ellipse(xx+3,y+h-8,1.8,1.8,'#ae9c7d');}}
function wagon(i){let m=modules[i],x=m.x,y=389,w=m.w,h=165;chassis(x,w);glow(x+w/2,472,140,'#b26b3b');rr(x+5,y+4,w-10,h-6,5,'#2b3539','#716c5b',3);
 // cutaway interior warm back light
 rr(x+15,y+19,w-30,h-42,2,grad(x,y,x,y+h,[[0,'#655344'],[.55,'#725840'],[1,'#3f3834']]),'#b58b5c',2);
 for(let k=0;k<8;k++)line(x+19,y+28+k*15,x+w-19,y+28+k*15,'#342d2d80',1);
 if(i===0){for(let j=0;j<3;j++){cargo(x+20+j*65,y+79);cargo(x+29+j*61,y+42);}rr(x+177,y+66,38,55,2,'#2b3537','#978467',2);for(let j=0;j<5;j++)line(x+181,y+74+j*8,x+210,y+74+j*8,'#948c70',2);crewFigure(x+208,y+65,.66,1);}
 if(i===1){ // bunks, warmth, table
  for(let k=0;k<2;k++){rr(x+24,y+34+k*42,71,33,3,'#47352d','#a17b60',3);rr(x+29,y+39+k*42,27,13,4,'#cec0a1');rr(x+61,y+40+k*42,31,17,2,'#73594e');}
  rr(x+117,y+91,102,7,2,'#987d58','#bc9c6b',1);line(x+135,y+99,x+129,y+128,'#493a34',7);line(x+200,y+99,x+207,y+128,'#493a34',7);rr(x+146,y+71,26,18,2,'#8b7758');crewFigure(x+192,y+72,.73,4);crewFigure(x+111,y+64,.63,2);glow(x+116,y+49,50,'#ffc886');
 }
 if(i===2){rr(x+33,y+72,87,35,3,'#3c4542','#a88b69',3);for(let k=0;k<4;k++)rr(x+45+k*17,y+75,9,30,3,'#69706a','#b09b70',1);rr(x+135,y+29,85,87,4,'#29383b','#977c59',3);
 for(let k=0;k<4;k++)line(x+144,y+38+k*17,x+209,y+38+k*17,'#a78c66',3);crewFigure(x+123,y+65,.74,1);crewFigure(x+230,y+72,.72,3);
 if(Math.floor(time*2)%3===1){let sx=x+110+Math.sin(time*14)*6,sy=y+107;glow(sx,sy,35,'#ffbd60');for(let n=0;n<8;n++){let a=n*TAU/8+time*2;line(sx,sy,sx+Math.cos(a)*(7+noise(n)*15),sy+Math.sin(a)*(7+noise(n)*11),'#f7c06e',2);}}}
 // beams
 line(x+14,y+18,x+14,y+h-12,'#99927b',5);line(x+w-14,y+18,x+w-14,y+h-12,'#99927b',5);for(let xx=x+27;xx<x+w-12;xx+=47)line(xx,y+17,xx,y+23,'#e5b576',3);
 // upper armor row and cross beams
 armor(x+3,y-20,w-6,34);roof(x,y-28,w);boltPanels(x,y+17,w,h-25);
 for(let xx=x+24;xx<x+w-15;xx+=48){glow(xx,y+35,27,'#ffa34e');ellipse(xx,y+26,3,4,'#e5b26c');}
 // door frame and hatch
 rr(x+w-39,y+42,23,89,1,'#303a3e','#ac8b6a',3);line(x+w-35,y+76,x+w-22,y+76,'#8b7d63',2);
 // colored emblem
 rr(x+16,y-8,38,16,2,i===0?'#616b5a':i===1?'#704d47':'#8a6044');styleText(['▣','✦','⚙'][i],x+35,y+5,13,'#e8d8b5','700','center');
 // a few rooftop objects
 cargo(x+65,y-43);rr(x+w-59,y-49,36,18,3,'#4e534b','#8e816b',2);platformDetails(x,y-33,w);
 // interaction highlight
 if(chosen===i){c.strokeStyle='#e6b978';c.lineWidth=3;c.setLineDash([8,5]);c.strokeRect(x-7,y-56,w+15,h+84);c.setLineDash([]);glow(x+w/2,y+62,155,'#d6a55f');}
}
function locomotive(){let x=1101,y=355,w=346;chassis(x,w-19);glow(x+178,y+153,210,'#cb7b46');
 // drivetrain and plates
 armor(x+17,y+65,270,127);rr(x+35,y+39,195,114,26,grad(0,y,0,y+160,[[0,'#51595a'],[.3,'#3e4445'],[1,'#1b2933']]),'#a18f72',5);
 for(let j=0;j<4;j++)rr(x+70+j*41,y+50,20,91,5,'#4b514e','#756f60',2);
 for(let j=0;j<8;j++)line(x+27+j*32,y+162,x+30+j*32,y+187,'#756754',6);
 // smokestack
 rr(x+128,y-40,40,93,7,'#272e30','#998573',5);rr(x+120,y-49,57,16,5,'#454647','#ab9071',3);
 // steam tank and dome
 rr(x+57,y+14,200,68,24,grad(0,y,0,y+103,[[0,'#77705e'],[.25,'#303c41'],[.85,'#272c31'],[1,'#121c26']]),'#8d806b',4);rr(x+239,y-13,37,47,10,'#454b4a','#908671',4);
 for(let k=0;k<6;k++)line(x+64+k*26,y+19,x+64+k*26,y+75,'#948777',2);
 // operator cab
 armor(x+12,y-10,65,84);rr(x+23,y+2,41,36,2,'#af8d62','#d9b786',3);rr(x+27,y+7,33,23,2,'#302f2d');glow(x+46,y+17,35,'#d7924d');
 roof(x-1,y-28,92);
 // nose and headlamp
 poly([[x+278,y+49],[x+313,y+52],[x+340,y+116],[x+327,y+189],[x+278,y+184]],'#393d3e','#a29277',5);
 ellipse(x+307,y+103,34,38,'#292f34');ellipse(x+307,y+103,25,27,'#c69654');ellipse(x+307,y+103,21,22,'#f2c27c');ellipse(x+307,y+103,13,13,'#fff0b5');glow(x+308,y+103,155,'#fac178');
 poly([[x+326,y+170],[x+353,y+213],[x+333,y+223],[x+308,y+184],[x+280,y+219],[x+261,y+206],[x+286,y+169]],'#323941','#9c8167',3);
 for(let j=0;j<4;j++)line(x+270+j*19,y+188,x+291+j*14,y+222,'#9a8069',3);
 // pistons + rods
 line(x+70,y+183,x+242,y+191,'#baa889',8);line(x+64,y+178,x+230,y+177,'#555554',6);for(const xx of [x+65,x+122,x+179,x+236])ellipse(xx,y+191,6,6,'#c5a479');
 // piping
 c.beginPath();c.moveTo(x+42,y+71);c.bezierCurveTo(x+100,y+115,x+178,y+110,x+262,y+94);c.strokeStyle='#a38c68';c.lineWidth=5;c.stroke();
 // lookout
 platformDetails(x+192,y-18,88);crewFigure(x+248,y-63,.9,2);
 // flag
 line(x+204,y-2,x+204,y-105,'#86806f',3);let flap=Math.sin(time*2)*9;poly([[x+204,y-100],[x+260+flap,y-95],[x+246+flap,y-67],[x+204,y-74]],'#784439','#b77d5b',2);
 styleText('✦',x+226+flap*.5,y-77,18,'#e8bc8d','700','center');
 // windows & warning marking
 for(let i=0;i<6;i++){rr(x+31+i*37,y+139,19,12,1,i%2?'#ad8053':'#6b685d','#aa916e',1);}
}
function signals(){ // signal mast foreground
 c.save();c.translate(-(cam*.9+distanceScroll*.85)%1120,0);for(let i=-1;i<4;i++){let x=190+i*1120;line(x,376,x,602,'#1d292e',11);line(x,376,x,602,'#857463',3);rr(x-14,392,29,69,5,'#182832','#aa9172',2);for(const [j,col] of [[0,'#b85d53'],[1,'#8b7046'],[2,'#719f77']]){ellipse(x,407+j*20,6,6,col);if(j===1)glow(x,427,32,'#d9a465');}line(x-49,387,x+35,387,'#6c6661',4);line(x+35,387,x+52,398,'#6c6661',3);}
 c.restore();}
function airFx(dt){if(!state.travelling&&Math.random()<.14){trail.push({x:1101+140+Math.random()*35,y:300+Math.random()*10,r:5+Math.random()*9,life:1.2});}if(state.travelling&&Math.random()<.65){trail.push({x:1220+Math.random()*25,y:300,r:6+Math.random()*8,life:1.5});}trail=trail.filter(p=>p.life>0);for(const p of trail){p.x+=dt*(state.travelling?-25:-17);p.y-=dt*30;p.r+=dt*11;p.life-=dt*.6;}
 for(let i=0;i<18;i++){let x=noise(i*21+5)*viewW,y=(noise(i*13+2)*720+(time*(state.travelling?58:19))*(i%2?1:-1))%720;ellipse(x,y,noise(i*10)*1.1+.3,.8,'#e2aa7759');}}
function draw(){let dpr=canvas.width/width;c.setTransform(dpr*scale,0,0,dpr*scale,0,0);
 sky();brokenStation();
 // dimensional fog between landscape and train
 c.fillStyle=grad(0,385,0,650,[[0,'#ddd0a500'],[.5,'#b7a68c10'],[1,'#080f1600']]);c.fillRect(0,385,viewW,265);
 foreground();
 c.save();c.translate(-cam+Math.sin(time*2.3)*(state.travelling?2.6:.35),0);
 // shadow under train
 ellipse(875,608,615,25,'#070e15ab');
 for(let i=0;i<3;i++)wagon(i);
 locomotive();
 // rail joints under wheels
 for(let i=0;i<3;i++)line(modules[i].x+modules[i].w,566,modules[i].x+modules[i].w+15,567,'#8f806f',8);
 // character on platform
 crewFigure(1105,573,.8,3);
 c.save();for(const p of trail){c.globalAlpha=clamp(p.life*.28,0,.34);ellipse(p.x,p.y,p.r,p.r*.77,'#cfd0c6');}c.restore();
 c.restore();signals();airFx(.016);
 // light grading
 c.fillStyle=grad(0,0,0,720,[[0,'#0c172111'],[.5,'#f5aa5b00'],[1,'#070e1633']]);c.fillRect(0,0,viewW,720);
}
function updateHUD(){for(const k of ['scrap','fuel','food','crew'])$(k).textContent=Math.floor(state[k]);$('place').textContent=locations[state.stage%locations.length][0];$('chapter').textContent=`РОЗДІЛ ${String(state.stage+1).padStart(2,'0')} / ${locations[state.stage%locations.length][1]}`;$('conditions').textContent=`17:48 • ${locations[state.stage%locations.length][2]} • ЗОНА РИЗИКУ`;
 $('go').disabled=state.travelling||state.fuel<10||state.food<5;$('go').innerHTML=state.travelling?`➤ <span>У ДОРОЗІ ${Math.round(state.distance*100)}%</span>`:'➤ <span>В ДОРОГУ</span>';
 $('scavenge').disabled=state.travelling||state.explored;
 $('scavenge').innerHTML=state.explored?'✓ <span>ДОСЛІДЖЕНО</span>':'⌕ <span>ДОСЛІДИТИ</span>';
 $('mission').textContent=state.travelling?'Подолати небезпечну ділянку колії':state.explored?'Вирушити до наступної станції':'Знайти припаси й підготувати караван';
 if(chosen>=0){let m=modules[chosen],level=state.level[chosen],cost=m.cost+(level-1)*25;$('panel-name').textContent=m.name;$('panel-description').textContent=m.desc;$('panel-stats').innerHTML=`<div class="module-stat"><span>РІВЕНЬ МОДУЛЯ</span><strong>${level} / 5</strong></div><div class="module-stat"><span>БОНУС</span><strong>${m.benefit}</strong></div><div class="module-stat"><span>ЦІНА НАСТУПНОГО РІВНЯ</span><strong>${level>=5?'МАКС.':cost+' металу'}</strong></div>`;$('upgrade').disabled=level>=5||state.scrap<cost;$('upgrade').textContent=level>=5?'МАКСИМАЛЬНИЙ РІВЕНЬ':`ПОКРАЩИТИ · ${cost} МЕТАЛУ`;}
}
function notice(s){let div=document.createElement('div');div.className='alert';div.textContent=s;$('alerts').appendChild(div);setTimeout(()=>{div.style.opacity='0';setTimeout(()=>div.remove(),400)},3800);}
let audio=null;function beep(f=440,d=.08){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();let o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(f*.65,audio.currentTime+d);g.gain.setValueAtTime(.075,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{}}
function select(i){chosen=i;$('panel').classList.remove('hidden');updateHUD();beep(520);}
function closePanel(){chosen=-1;$('panel').classList.add('hidden');}
function salvage(){if(state.travelling||state.explored)return;let gain=32+state.level[0]*10,fu=9+((state.stage*7)%12),food=6+(state.stage%3)*5;state.scrap+=gain;state.fuel=clamp(state.fuel+fu,0,250);state.food+=food;state.explored=true;persist();updateHUD();notice(`Розвідка завершена: +${gain} металу, +${fu} палива, +${food} припасів`);beep(620,.19);}
function go(){if(state.travelling)return;if(state.fuel<10||state.food<5){notice('Недостатньо ресурсів для рейсу. Дослідіть станцію.');return;}state.travelling=true;state.distance=0;closePanel();updateHUD();notice('Караван вирушає. Тримайтеся ближче до потяга.');beep(210,.28);}
function endTrip(){state.travelling=false;state.fuel=Math.max(0,state.fuel-Math.max(7,17-state.level[2]*3));state.food=Math.max(0,state.food-Math.max(3,8-state.level[1]*2));state.stage++;state.explored=false;state.distance=0;persist();updateHUD();notice('Нову станцію відкрито. Розвідайте місцевість.');beep(690,.25);}
function frame(now){let dt=Math.min((now-last)/1000,.05);last=now;time+=dt;if(state.travelling){distanceScroll+=dt*180;state.distance+=dt/17;if(state.distance>=1)endTrip();if(Math.floor(time*8)%2===0)updateHUD();}else{distanceScroll+=dt*.75;}draw();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
$('start').onclick=()=>{$('intro').classList.add('hidden');notice('Ласкаво просимо до каравану. Торкніться будь-якого вагона.');};
$('how').onclick=$('help').onclick=()=>{$('modal').classList.remove('hidden');};
$('close-modal').onclick=$('modal-ok').onclick=()=>{$('modal').classList.add('hidden');};
$('close-panel').onclick=closePanel;
$('upgrade').onclick=()=>{if(chosen<0)return;let i=chosen,m=modules[i],lvl=state.level[i],cost=m.cost+(lvl-1)*25;if(lvl>=5||state.scrap<cost)return;state.scrap-=cost;state.level[i]++;persist();updateHUD();notice(`${m.name}: рівень ${state.level[i]}!`);beep(760,.25);};
$('scavenge').onclick=salvage;$('go').onclick=go;
$('sound').onclick=()=>{muted=!muted;$('sound').textContent=muted?'♫':'♪';beep();};
$('cam-left').onclick=()=>{cam=clamp(cam-180,-110,Math.max(800,1700-viewW));};$('cam-right').onclick=()=>{cam=clamp(cam+180,-110,Math.max(800,1700-viewW));};$('cam-reset').onclick=()=>{cam=165;};
// Pointer gestures do not require any framework and work offline on Android Chrome.
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,startX:e.clientX,startedCam:cam,moved:false};});
canvas.addEventListener('pointermove',e=>{if(!drag)return;let dx=e.clientX-drag.x;if(Math.abs(e.clientX-drag.startX)>8)drag.moved=true;cam=clamp(cam-dx/scale,-110,Math.max(800,1700-viewW));drag.x=e.clientX;});
canvas.addEventListener('pointerup',e=>{if(!drag)return;if(!drag.moved){let x=e.clientX/scale+cam,y=e.clientY/scale;let index=modules.findIndex(m=>x>=m.x-4&&x<=m.x+m.w+5&&y>=321&&y<=580);if(index>=0)select(index);else if(x>=1101&&x<=1446&&y>=302&&y<=580){notice('Локомотив «Мандрівник»: серце каравану. Підготований до рейсу.');beep(380);}else closePanel();}drag=null;});
canvas.addEventListener('pointercancel',()=>drag=null);
window.addEventListener('keydown',e=>{if(e.key==='ArrowRight')cam=clamp(cam+80,-110,Math.max(800,1700-viewW));if(e.key==='ArrowLeft')cam=clamp(cam-80,-110,Math.max(800,1700-viewW));if(e.code==='Space'){e.preventDefault();go();}if(e.key==='Escape'){closePanel();$('modal').classList.add('hidden');}});
updateHUD();