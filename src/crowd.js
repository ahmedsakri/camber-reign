import * as THREE from 'three';
import {CHARACTER_LIMITS} from './spectator-character.js';
import {createNearSpectator, createSpectatorLibrary, SPECTATOR_ASSETS} from './realistic-spectator.js';
import {createMediumCrowd,MEDIUM_CROWD_BUDGET,FAR_CROWD_BUDGET} from './medium-spectator.js';
import {SPECTATOR_GESTURES,SPECTATOR_GESTURE_WEIGHTS,SPECTATOR_SEAT_HEIGHT} from './spectator-motion-config.js';

const TAU = Math.PI * 2;
const SHIRTS = ['#e7e4db', '#f5c444', '#9e392f', '#486e92', '#425c51', '#303d58', '#ad8171', '#826893', '#cbd2cf', '#3c3547'];
const SKIN = ['#f1c6a8', '#dca281', '#bd8260', '#966649', '#724c39', '#4e342b'];
const HAIR = ['#221e1b', '#34271f', '#674735', '#aa8050', '#c1b7a6', '#713c28'];
const TROUSERS = ['#293244', '#354a60', '#59594e', '#25252b', '#a09479'];
const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3();
const transform = new THREE.Object3D(), color = new THREE.Color();
const headQuaternion = new THREE.Quaternion(), headOffset = new THREE.Vector3(), headEuler = new THREE.Euler();
const mixPoint=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const shade=(hex,amount)=>'#'+new THREE.Color(hex).multiplyScalar(amount).getHexString();
const pick = (items, rng) => items[Math.floor(rng() * items.length)];

// Adult proportions, with the pose in metres. Hair and hats are separate from
// the skull: heads must not become the oversized balls of the former crowd.
export function spectatorProfile(x, floor, z, yaw, seated, rng = Math.random) {
 return {
  x, floor, z, yaw, seated, seatHeight:SPECTATOR_SEAT_HEIGHT, height: .91 + rng() * .17, width: .91 + rng() * .18,
  shirt: pick(SHIRTS, rng), skin: pick(SKIN, rng), hair: pick(HAIR, rng), pants: pick(TROUSERS, rng),
  phase: rng() * TAU, tempo: .72 + rng() * .53, gesture: pick(SPECTATOR_GESTURE_WEIGHTS,rng),
  cap: rng() < .20, longHair: rng() < .24, sunglasses: rng() < .24,
  shift: (rng() - .5) * .045, reaction: 0, reactionEligible:false, lookYaw: 0, previousDistance: Infinity,
  faceWidth: .94 + rng() * .13, jawWidth: .85 + rng() * .22, polo: rng() < .36,
  shoe: pick(['#c5c3ba','#23242b','#494b48','#857866'],rng),
  garment: Math.floor(rng()*3), shorts: rng()<.19, scarf: rng()<.12, build:.89+rng()*.22,
  reactionDistance:22+rng()*13, reactionSpeed:.72+rng()*.66, blinkPhase:rng()*7,
  stance:(rng()-.5)*.034, posturePhase:rng()*TAU, attentionSpan:5.8+rng()*4.2,
 };
}

// A real two-bone chain keeps upper arms and forearms a constant length while
// cheering. The previous directly animated joints stretched bodies like rubber.
export function solveSpectatorArm(shoulder, desiredHand, elbowHint, upper=.285, lower=.265) {
 const direction=desiredHand.map((v,i)=>v-shoulder[i]);
 const raw=Math.hypot(...direction),distance=Math.min(upper+lower-.003,Math.max(Math.abs(upper-lower)+.003,raw));
 const axis=raw>1e-6?direction.map(v=>v/raw):[0,-1,0];
 let pole=elbowHint.map((v,i)=>v-shoulder[i]);
 const dot=pole.reduce((sum,v,i)=>sum+v*axis[i],0);pole=pole.map((v,i)=>v-dot*axis[i]);
 let magnitude=Math.hypot(...pole);
 if(magnitude<1e-5){pole=[axis[1],-axis[0],0];magnitude=Math.hypot(...pole);if(magnitude<1e-5){pole=[1,0,0];magnitude=1;}}
 pole=pole.map(v=>v/magnitude);
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance),out=Math.sqrt(Math.max(0,upper*upper-along*along));
 return {elbow:shoulder.map((v,i)=>v+axis[i]*along+pole[i]*out),hand:shoulder.map((v,i)=>v+axis[i]*distance)};
}

// Celebrations and quiet poses have distinct shoulder/elbow/wrist silhouettes at driving
// distance. Never flap every spectator in synchrony or make them jump through seats.
export function spectatorPose(person, time = 0, excitement = 0) {
 const t = time * person.tempo + person.phase, hip = person.seated ? .48 : .84;
 // A spectator has a planted weight-bearing leg and a relaxed leg. The pelvis
 // shifts a few centimetres; the chest counters it rather than bobbing vertically.
 const weightShift=person.seated?0:(person.stance||0)+Math.sin(t*.43+(person.posturePhase||0))*.018;
 const breathe = Math.sin(t * .63) * .004, lean = Math.sin(t * .44) * .012 + excitement * .018;
 const chest = hip + .33, head = hip + .74 + breathe;
 const sway = Math.sin(t * .81) * .008+weightShift;
 // Individual short celebrations have recovery pauses. A whole grandstand
 // should not hold every arm overhead for the entire time the car is nearby.
 const cycle=(time+person.phase)/(person.attentionSpan||7.2)*TAU;
 const burst=.45+.55*THREE.MathUtils.smoothstep(Math.sin(cycle),-.35,.5);
 const energy=excitement*burst;
 const arms = [];
 for (const side of [-1, 1]) {
  const shoulder = [side * .202 + sway, hip + .46 + breathe, lean];
  let elbow = [side * .245 + sway, hip + .20, person.seated?.085:.015];
  let hand = [side * (person.seated?.14:.205) + sway, hip + (person.seated?.07:-.075), person.seated ? .30 : .045];
  const active = energy > .001;
  const restElbow=[...elbow],restHand=[...hand];
  if (person.role === 'marshal') {
   // Staff watch the driving line; only the radio operator raises one hand.
   if(person.gesture===3&&side<0){elbow=[-.26+sway,hip+.38,.10];hand=[-.16+sway,hip+.69,.095];}
  } else if (person.gesture === 0 && active) { // An asymmetric wave, wrist above head.
   if (side > 0) {
    elbow = [.33 + sway, hip + .77, .08];
    hand = [.25 + Math.sin(t * 3.3) * .13, hip + 1.02, .12];
   }
  } else if (person.gesture === 1 && active) { // Clapping in front of the chest.
   elbow = [side * .27, hip + .36, .16];
   hand = [side * (.025 + (Math.sin(t * 7.8) * .5 + .5) * .095), hip + .48, .30];
  } else if (person.gesture === 2 && active) { // One fist raised; a bent arm, not a V stick.
   elbow = [side * .28, hip + (side < 0 ? .54 : .23), .03];
   hand = [side * .24, hip + (side < 0 ? .86 + Math.sin(t * 2.7) * .045 : .10), .13];
  } else if (person.gesture === 3) { // Filming, phone held between two hands.
   elbow = [side * .25, hip + .27, .10];
   hand = [side * .075, hip + .58 + breathe, .32];
  } else if (person.gesture === 4 && active) { // Both hands high, independently offset.
   elbow = [side * .32, hip + .66 + Math.sin(t + side) * .025, .025];
   hand = [side * .36, hip + .98 + Math.sin(t * 2.1 + side) * .045, .10];
  } else if(person.gesture===6){ // Quiet folded hands at the lap or waist.
   elbow=[side*.27+sway,hip+.24,.09];
   hand=[side*.035+sway,hip+(person.seated?.075:.06)+(side<0?.014:0),person.seated?.30:.20];
  } else if(person.gesture===7&&side>0){ // A restrained palm-up conversation gesture.
   elbow=[.275+sway,hip+.22,.12];
   hand=[.235+sway,hip+.37+Math.sin(t*1.1)*.015,.33];
  }
  const blend=person.role==='marshal'||person.gesture===3||person.gesture>=6?1:Math.min(1,Math.max(0,energy*1.45));
  const eased=blend*blend*(3-2*blend);
  elbow=mixPoint(restElbow,elbow,eased);hand=mixPoint(restHand,hand,eased);
  shoulder[0]*=person.width;elbow[0]*=person.width;hand[0]*=person.width;
  const solved=solveSpectatorArm(shoulder,hand,elbow);elbow=solved.elbow;hand=solved.hand;
  arms.push({side, shoulder, elbow, hand});
 }
 return {hip, chest, head, lean, sway, breathe, arms, weightShift, energy,
  headYaw:(person.lookYaw||0)+Math.sin(t*.37)*(person.gesture===7?.14:.035), headPitch:-excitement*.035+Math.sin(t*.53)*.025,
  headRoll:Math.sin(t*.42)*.020-weightShift*.35, torsoTilt:.025+energy*.035,
  torsoYaw:(person.lookYaw||0)*.16, torsoRoll:-weightShift*.32,
  blink:1-.94*Math.max(0,1-Math.abs(((time+(person.blinkPhase||0))%5.7)-.095)/.095),
  mouth:(person.role==='marshal'||person.gesture===5||person.gesture===6?0:Math.max(0,energy-.24))*(person.gesture===0||person.gesture===2||person.gesture===4?1:.24),
 };
}

// Profiled surfaces retain a jaw, cheekbones and forehead instead of a ball.
// The same normalized head shape supports a cheaper distant silhouette.
export function spectatorHeadGeometry(detail = 14, rows = 9) {
 const g=new THREE.SphereGeometry(1,detail,rows),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const jaw= y<-.25 ? 1-(Math.min(1,(-y-.25)/.65)*.23) : 1;
  x*=jaw*(y>.42?.975:1.015);
  if(z>0){z*=.91;z+=.045*Math.exp(-Math.pow((y+.08)*4,2))*Math.min(1,Math.abs(x)*2.4);}
  if(y<-.60)z+=.05*(1-Math.abs(x));
  p.setXYZ(i,x,y,z);
 }
 g.computeVertexNormals();return g;
}
function sweptHairGeometry(detail) {
 const positions=[],indices=[];const rings=detail<=10?4:6;
 for(let r=0;r<=rings;r++)for(let i=0;i<=detail;i++){
  const phi=i/detail*TAU,front=Math.sin(phi),endY=-.20+Math.max(0,front)*.64-Math.max(0,-front)*.28;
  const theta=Math.acos(endY)*r/rings,y=Math.cos(theta),jaw=y<-.25?1-((-y-.25)/.65)*.23:1;
  let x=-Math.cos(phi)*Math.sin(theta)*jaw,z=Math.sin(phi)*Math.sin(theta);
  if(z>0)z*=.92;
  positions.push(x,y,z);
  if(r<rings&&i<detail){const v=r*(detail+1)+i;indices.push(v,v+detail+1,v+1,v+1,v+detail+1,v+detail+2);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function taperedLimbGeometry(detail, compact = false) {
 if(compact)return new THREE.LatheGeometry([new THREE.Vector2(.63,-.5),new THREE.Vector2(1,-.20),new THREE.Vector2(.86,.10),new THREE.Vector2(.56,.5)],detail);
 return new THREE.LatheGeometry([
  new THREE.Vector2(.63,-.50),new THREE.Vector2(.94,-.40),new THREE.Vector2(1,-.23),
  new THREE.Vector2(.86,.06),new THREE.Vector2(.63,.37),new THREE.Vector2(.56,.50),
 ],detail);
}

// Original seamless woven cotton, denim and skin micro-surfaces. Neutral maps
// multiply each person's authored colour rather than replacing skin diversity.
// Kept tiny and shared across the entire crowd; no per-person image requests.
export function spectatorSurfacePixels(kind='cotton',size=128) {
 const dimension=Math.max(16,Math.min(128,Number.isFinite(size)?Math.floor(size):128));
 const rgba=new Uint8Array(dimension*dimension*4),height=new Uint8Array(rgba.length);
 const hash=(x,y)=>{let v=Math.imul(x+37,374761393)^Math.imul(y+53,668265263);v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;};
 for(let y=0;y<dimension;y++)for(let x=0;x<dimension;x++) {
  const u=x/dimension,v=y/dimension,grain=hash(x,y)-.5;
  let value,relief;
  if(kind==='skin') {
   const pore=hash(Math.floor(x/2),Math.floor(y/2))>.94?-4:0;
   value=249+grain*4+pore;relief=128+grain*16+pore*2;
  }else{
   const twill=kind==='denim'?Math.sin((x+y)*Math.PI/3):Math.cos(x*Math.PI)*Math.sin(y*Math.PI);
   const thread=Math.sin(u*TAU*16)*Math.sin(v*TAU*16);
   const fold=Math.sin(u*TAU*2+Math.sin(v*TAU)*.5)*Math.cos(v*TAU);
   value=kind==='denim'?225+twill*9+grain*8+fold*5:238+thread*5+grain*5+fold*4;
   relief=128+twill*23+thread*13+grain*12;
  }
  const offset=(y*dimension+x)*4;
  for(let channel=0;channel<3;channel++){rgba[offset+channel]=Math.round(value);height[offset+channel]=Math.round(relief);}
  rgba[offset+3]=height[offset+3]=255;
 }
 return {size:dimension,rgba,height};
}

function spectatorSurfaceTexture(pixels,size,isColor) {
 let texture;
 // Canvas is used in the browser. DataTexture keeps headless geometry checks
 // independent of a DOM and remains a safe fallback if a 2D context is absent.
 try {
  const canvas=globalThis.document?.createElement?.('canvas');
  if(canvas){canvas.width=canvas.height=size;const ctx=canvas.getContext?.('2d');if(ctx?.createImageData){const image=ctx.createImageData(size,size);image.data.set(pixels);ctx.putImageData(image,0,0);texture=new THREE.CanvasTexture(canvas);}}
 }catch{/* A graphics fallback must not prevent the race from loading. */}
 if(!texture){texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);texture.needsUpdate=true;}
 texture.colorSpace=isColor?THREE.SRGBColorSpace:THREE.NoColorSpace;
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
 texture.anisotropy=2;return texture;
}

function tailoredTorsoGeometry(low) {
 const geometry=new THREE.LatheGeometry([
  new THREE.Vector2(.163,0),new THREE.Vector2(.171,.04),new THREE.Vector2(.155,.18),
  new THREE.Vector2(.158,.27),new THREE.Vector2(.185,.39),new THREE.Vector2(.207,.465),
  new THREE.Vector2(.192,.513),new THREE.Vector2(.142,.553),new THREE.Vector2(.064,.582),
 ],low?8:14),positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),angle=Math.atan2(z,x);
  const hem=Math.exp(-Math.pow((y-.04)*25,2)),waist=Math.exp(-Math.pow((y-.22)*12,2));
  const fold=(Math.sin(y*39+angle*4)*.0022+Math.cos(angle*7+y*9)*.0015)*(hem+waist*.6+.25);
  const chest=y>.28&&z>0?Math.sin(Math.min(1,(y-.28)/.30)*Math.PI)*.008:0;
  positions.setXYZ(i,x+Math.cos(angle)*fold,y,z+Math.sin(angle)*fold+chest);
 }
 geometry.computeVertexNormals();return geometry;
}

function spectatorShoeGeometry(low) {
 const geometry=new THREE.SphereGeometry(1,low?8:12,low?5:8),positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
  positions.setXYZ(i,x*(z<-.15?.83:1),Math.max(-.60,y)*(z>.25?.72:1),z);
 }
 geometry.computeVertexNormals();return geometry;
}

/** A shared, articulated crowd. Ten distant instanced draws plus a fixed near-mesh pool;
 * a capped foreground group animates at 30/60 Hz, the rest at 15/24 Hz.
 * Per-spectator motion stops when paused or when reduced motion is requested. */
export function createCrowd({low = false, reducedMotion = false, spectatorLibrary,mediumOptions} = {}) {
 const people = [], batches = new Map(), characters = [];
 const library=spectatorLibrary||createSpectatorLibrary();
 const medium=createMediumCrowd({low,library,...mediumOptions});
 let scene, lastTime = 0, motionTime = 0, previousTick = -Infinity, previousForegroundTick=-Infinity, disposed = false;
 const detail = low ? 6 : 8;
 const sphere = new THREE.SphereGeometry(1, 6, low ? 3 : 4);
 const limb = taperedLimbGeometry(detail,low);
 const torso = tailoredTorsoGeometry(low);
 const geometries = {
  torso,skin:sphere,limbs:limb,trousers:taperedLimbGeometry(low?6:8,true),shoes:spectatorShoeGeometry(low),
  hair:sweptHairGeometry(low?10:16),hairBack:sphere.clone(),details:new THREE.BoxGeometry(1,1,1),
  heads:spectatorHeadGeometry(low?10:18,low?7:12),collars:new THREE.TorusGeometry(1,.11,3,low?8:12),
 };
 const textures=[];
 const surface=(kind,roughness,bumpScale)=>{
  const pixels=spectatorSurfacePixels(kind,low?64:128);
  const map=spectatorSurfaceTexture(pixels.rgba,pixels.size,true),bumpMap=spectatorSurfaceTexture(pixels.height,pixels.size,false);
  textures.push(map,bumpMap);map.repeat.set(kind==='skin'?1:2,kind==='skin'?1:2);bumpMap.repeat.copy(map.repeat);
  return new THREE.MeshStandardMaterial({color:'white',roughness,metalness:0,map,bumpMap,bumpScale});
 };
 const material=new THREE.MeshStandardMaterial({color:'white',roughness:.84,metalness:0});
 const skinMaterial=surface('skin',.74,.0007),shirtMaterial=surface('cotton',.96,.0022),trouserMaterial=surface('denim',.95,.0028);
 const hairMaterial=new THREE.MeshStandardMaterial({color:'white',roughness:.78,metalness:0});
 for (const [name,geometry] of Object.entries(geometries))batches.set(name,{geometry,entries:[],mesh:null});

 function element(person, kind, position, scale, tint, rotation = [0,0,0], segmentEnd = null) {
  const batch = batches.get(kind);
  const entry = {index: batch.entries.length, kind, person, position, scale, tint, rotation, segmentEnd};
  batch.entries.push(entry); person.parts.push(entry); return entry;
 }
 function write(entry) {
  if(entry.drawIndex===-1)return;
  const p = entry.person, [px,py,pz] = entry.position, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  transform.position.set(p.x + (c * px + s * pz) * p.height, p.floor + py * p.height, p.z + (-s * px + c * pz) * p.height);
  transform.rotation.set(...entry.rotation); transform.rotation.y += p.yaw;
  if (entry.segmentEnd) {
   const [ex,ey,ez] = entry.segmentEnd;
   a.set(...entry.position); b.set(ex,ey,ez); delta.subVectors(b,a);
   const mid = a.add(b).multiplyScalar(.5);
   transform.position.set(p.x+(c*mid.x+s*mid.z)*p.height,p.floor+mid.y*p.height,p.z+(-s*mid.x+c*mid.z)*p.height);
   delta.set(c*delta.x+s*delta.z,delta.y,-s*delta.x+c*delta.z).normalize();
   transform.quaternion.setFromUnitVectors(up,delta);
   transform.scale.set(entry.scale[0]*p.height, a.distanceTo(b)*2*p.height, entry.scale[2]*p.height);
  } else transform.scale.set(entry.scale[0]*p.height,entry.scale[1]*p.height,entry.scale[2]*p.height);
  transform.updateMatrix(); batches.get(entry.kind).mesh.setMatrixAt(entry.drawIndex??entry.index,transform.matrix);
 }
 function compose(person, time, excitement, initial = false) {
  const pose = spectatorPose(person,time,excitement), parts = [];
  const part = (kind,pos,scale,tint,rot,end) => {
   if (initial) return element(person,kind,pos,scale,tint,rot,end);
   const entry=person.parts[parts.length]; Object.assign(entry,{position:pos,scale,segmentEnd:end,rotation:rot||[0,0,0]});parts.push(entry);write(entry);return entry;
  };
  const segment = (kind,from,to,radius,tint) => part(kind,from,[radius,1,radius],tint,[0,0,0],to);
  const hip=pose.hip,w=person.width*(person.build||1),skinShadow=person.skinShadow||(person.skinShadow=shade(person.skin,.77));
  const shirtShadow=person.shirtShadow||(person.shirtShadow=shade(person.shirt,.70));
  const shirtLight=person.shirtLight||(person.shirtLight=shade(person.shirt,1.08));
  part('torso',[pose.sway,hip-.022,pose.lean],[w,1,.68],person.shirt,[pose.torsoTilt,0,-pose.sway*.3]);
  part('skin',[0,hip-.02,0],[.160*w,.08,.105],person.pants);
  segment('limbs',[pose.sway,hip+.53,pose.lean],[pose.sway,hip+.625,pose.lean],.049,person.skin);
  part('collars',[pose.sway,hip+.556,pose.lean+.015],[.065,.045,.065],shirtShadow,[Math.PI/2+pose.torsoTilt,0,0]);
  // Head and every feature share one transform, so a subtle glance does not
  // leave eyes, hair or a nose floating on the original forward-facing axis.
  headEuler.set(pose.headPitch,pose.headYaw,pose.headRoll);headQuaternion.setFromEuler(headEuler);
  const face=(kind,offset,scale,tint)=>{
   headOffset.set(...offset).applyQuaternion(headQuaternion);
   const entry=part(kind,[pose.sway+headOffset.x,pose.head+headOffset.y,pose.lean+headOffset.z],scale,tint,[pose.headPitch,pose.headYaw,pose.headRoll]);
   if(kind==='skin')entry.faceDetail=true;
   return entry;
  };
  const hw=person.faceWidth;
  face('heads',[0,0,0],[.096*hw,.139,.100+.007*(person.jawWidth||1)],person.skin);
  // A narrow nasal bridge and rounded tip, smaller ears and a recessed ear
  // bowl read as anatomy rather than the old spherical nose and side knobs.
  face('skin',[0,-.006,.101],[.010,.026,.011],person.skin);
  face('skin',[0,-.027,.112],[.015,.010,.014],person.skin);
  for(const side of [-1,1]){
   face('skin',[side*.096*hw,-.008,-.003],[.012,.026,.016],person.skin);
   face('skin',[side*.100*hw,-.007,.008],[.005,.013,.006],skinShadow);
   face('skin',[side*.009,-.032,.116],[.003,.0025,.003],skinShadow);
  }
  face('hair',[0,.005,-.003],[.099*hw,.143,.108],person.hair);
  if(person.longHair)face('hairBack',[0,-.072,-.075],[.104*hw,.16,.045],person.hair);
  if(person.cap){
   face('hairBack',[0,.091,-.008],[.103*hw,.068,.116],person.shirt);
   face('hairBack',[0,.064,.104],[.098*hw,.009,.080],person.shirt);
  }
  for(const side of [-1,1]){
   const ex=side*.035*hw;
   if(person.sunglasses){
    face('skin',[ex,.021,.092],[.025,.015,.010],'#292c31');
    face('skin',[side*.003,.023,.096],[.010,.0025,.003],'#49484a');
   }else{
    face('skin',[ex,.021,.090],[.016,.0050*pose.blink,.0045],'#cbbba8');
    face('skin',[ex+Math.sin(pose.headYaw)*.002,.021,.094],[.005,.0045*pose.blink,.0028],'#42382e');
    face('skin',[ex,.0247,.092],[.017,.0021,.005],skinShadow);
    face('skin',[ex,.040+pose.mouth*.014,.086],[.019,.0026,.004],person.hair);
   }
  }
  // A curved mouth opens only for vocal cheering; quieter poses retain a
  // small smile. Teeth are a restrained strip inside the opening.
  const open=pose.mouth;
  face('skin',[0,-.057,.086],[.022,.0025+open*.016,.008],'#55342f');
  face('skin',[0,-.054-open*.001,.091],[.016,.0002+open*.0025,.0017],'#cfc2aa');
  face('skin',[0,-.062-open*.015,.086],[.019,.0025,.004],skinShadow);
  for(const side of [-1,1])face('skin',[side*.022,-.054,.083],[.003,.002,.003],skinShadow);
  for(const {side,shoulder,elbow,hand} of pose.arms){
   segment('limbs',shoulder,elbow,.051*w,person.skin);
   segment('limbs',shoulder,mixPoint(shoulder,elbow,person.garment===1?.98:.56),.068*w,person.shirt);
   part('skin',elbow,[.036*w,.037,.034],person.skin);
   segment('limbs',elbow,hand,.041*w,person.garment===1?person.shirt:person.skin);
   const cuffStart=person.garment===1?mixPoint(elbow,hand,.83):mixPoint(shoulder,elbow,.50);
   const cuffEnd=person.garment===1?mixPoint(elbow,hand,.93):mixPoint(shoulder,elbow,.58);
   segment('limbs',cuffStart,cuffEnd,(person.garment===1?.042:.069)*w,shirtShadow).nearDetail=true;
   part('skin',hand,[.033,.042,.022],person.skin,[0,person.gesture===1?side*.7:0,side*.12]);
   part('skin',[hand[0]-side*.027,hand[1]-.015,hand[2]+.011],[.011,.023,.011],person.skin,[0,0,side*.25]);
   // Fingers read in nearby waves, then leave the draw entirely at face LOD.
   if(person.gesture===0||person.gesture===4)for(let finger=0;finger<4;finger++){
    const detail=part('skin',[hand[0]+(finger-1.5)*.013,hand[1]+.035,hand[2]],[.006,.023-Math.abs(finger-1.5)*.003,.006],person.skin,[0,0,(finger-1.5)*-.06]);
    detail.faceDetail=true;
   }
   const knee=person.seated?[side*.12,.435,.31]:[side*(.115+person.shift),.44,.01+side*.028];
   const ankle=person.seated?[side*.12,.095,.36]:[side*.13,.085,.02+side*.028];
   segment('trousers',[side*.105,hip-.02,0],knee,.083*w,person.pants);
   part('skin',knee,[.054*w,.055,.055],person.shorts?person.skin:person.pants);
   segment('trousers',knee,ankle,.059*w,person.shorts?person.skin:person.pants);
   part('shoes',[ankle[0],.051,ankle[2]+.060],[.061,.049,.113],person.shoe);
   part('details',[ankle[0],.026,ankle[2]+.063],[.112,.021,.185],'#d3cdc1');
   for(let lace=0;lace<3;lace++)part('details',[ankle[0],.084-lace*.004,ankle[2]+.033+lace*.016],[.050,.004,.005],'#d4d0c8',[0,0,side*.04]).nearDetail=true;
  }
  if(person.gesture===3){
   if(person.role==='marshal'){const hand=pose.arms[0].hand;part('details',[hand[0],hand[1]+.015,hand[2]+.018],[.05,.125,.035],'#1f252b');part('details',[hand[0]-.016,hand[1]+.115,hand[2]+.018],[.007,.08,.007],'#1f252b');}
   else part('details',[0,hip+.60+pose.breathe,.337],[.083,.133,.014],'#1f252b',[-.08,0,0]);
  }
  // Restrained plackets, seams and emblems complement the shared fabric maps.
  // Microgeometry is omitted from distant draws rather than merely hidden.
  if(person.garment===1){
   part('details',[pose.sway,hip+.31,pose.lean+.112],[.011,.42,.006],shirtShadow,[pose.torsoTilt,0,0]);
   for(const side of [-1,1])part('details',[pose.sway+side*.095,hip+.23,pose.lean+.108],[.060,.010,.005],shirtShadow,[pose.torsoTilt,0,side*.18]);
  }
  if(person.garment===2)for(const stripe of [.22,.27,.32])part('skin',[pose.sway,hip+stripe,pose.lean+.112],[.152*w,.009,.009],shirtLight,[pose.torsoTilt,0,0]);
  if(person.scarf){part('collars',[pose.sway,hip+.557,pose.lean],[.077,.062,.072],person.pants,[Math.PI/2,0,0]);part('details',[pose.sway+.056,hip+.45,pose.lean+.125],[.052,.20,.011],person.pants,[pose.torsoTilt,0,-.09]);}
  if(person.polo)part('details',[pose.sway,hip+.471,pose.lean+.108],[.012,.083,.004],shirtShadow,[pose.torsoTilt,0,0]);
  part('skin',[pose.sway,hip+.032,pose.lean+.103],[.130*w,.003,.006],shirtShadow);
  part('skin',[pose.sway-.068*w,hip+.148,pose.lean+.110],[.064*w,.002,.004],shirtLight,[0,0,-.13]);
  part('details',[.080*w+pose.sway,hip+.417,pose.lean+.111],[.014,.020,.004],shirtLight);
  for(const side of [-1,1])part('details',[pose.sway+side*.146*w,hip+.21,pose.lean+.063],[.003,.245,.004],shirtShadow,[pose.torsoTilt,side*.2,-side*.025]).nearDetail=true;

 }
 return {
  add(x,floor,z,yaw,seated,rng=Math.random,{role='spectator',palette,gesture,seatHeight=SPECTATOR_SEAT_HEIGHT}={}){
   if(scene)throw new Error('Add spectators before rendering the crowd');
   const person=spectatorProfile(x,floor,z,yaw,seated,rng);
   person.lookVariant=people.length%SPECTATOR_ASSETS.length;
   // The distant palette echoes the textured foreground wardrobes, reducing
   // colour popping at the bounded near-mesh transition.
   Object.assign(person,SPECTATOR_ASSETS[person.lookVariant]);
   person.seatHeight=Number.isFinite(seatHeight)?THREE.MathUtils.clamp(seatHeight,.3,.6):SPECTATOR_SEAT_HEIGHT;
   person.cap=false;person.sunglasses=false;person.scarf=false;
   if(Array.isArray(palette)&&palette.length&&palette.every(value=>/^#[a-f0-9]{6}$/i.test(value)))person.shirt=pick(palette,rng);
   if(Number.isInteger(gesture)&&gesture>=0&&gesture<SPECTATOR_GESTURES.length)person.gesture=gesture;
   if(role==='marshal'){person.role='marshal';person.shirt='#e97938';person.garment=2;person.pants='#233844';person.shorts=false;person.scarf=false;person.cap=true;person.gesture=rng()>.55?3:1;person.shirtLight='#e3e6cf';}
   person.parts=[];people.push(person);
   compose(person,person.phase,Math.sin(person.phase)>.45?.3:0,true);return person;
  },
  render(target){
   if(scene)return;scene=target;
   for(const [name,batch] of batches){
    if(!batch.entries.length)continue;
    const appearance=name==='heads'||name==='skin'?skinMaterial:name==='torso'?shirtMaterial:name==='trousers'?trouserMaterial:name==='hair'?hairMaterial:material;
    const mesh=new THREE.InstancedMesh(batch.geometry,appearance,batch.entries.length);
    mesh.name=`race-spectators-${name}`;mesh.castShadow=false;mesh.receiveShadow=false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.mesh=mesh;
    for(const entry of batch.entries){write(entry);mesh.setColorAt(entry.index,color.set(entry.tint));}
    mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.4;scene.add(mesh);
   }
   scene.userData.spectatorCount=people.length;
   scene.userData.crowd={people:people.length,baseDrawCalls:[...batches.values()].filter(b=>b.mesh).length,drawCalls:[...batches.values()].filter(b=>b.mesh).length,animated:!reducedMotion,maxUpdateHz:low?30:60,
    backgroundUpdateHz:low?15:24,foregroundLimit:low?10:20,foregroundAnimated:0,sharedTextures:textures.length,characterLimit:low?CHARACTER_LIMITS.mobile:CHARACTER_LIMITS.desktop,activeCharacters:0};
   // Fixed near slots share six textured CC0 assets, decoded two at a time.
   // Each has an immediate original fallback; no request can block race start.
   for(const person of people.filter(person=>person.role!=='marshal').slice(0,low?CHARACTER_LIMITS.mobile:CHARACTER_LIMITS.desktop)){
    const character=createNearSpectator(person,{low,library,index:person.lookVariant});character.template=person;character.person=null;character.mesh.visible=false;characters.push(character);scene.add(character.mesh);
   }
   medium.render(scene);
   scene.userData.crowd.mediumLimit=low?MEDIUM_CROWD_BUDGET.mobile:MEDIUM_CROWD_BUDGET.desktop;
   scene.userData.crowd.farLimit=low?FAR_CROWD_BUDGET.mobile:FAR_CROWD_BUDGET.desktop;
  },
  update(time,car,{paused=false,reducedMotion:reduce=reducedMotion}={}){
   if(!scene||disposed)return;
   const dt=Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
   if(paused)return;
   motionTime+=reduce?0:dt;
   const fullTick=motionTime-previousTick>=1/(low?15:24);
   const foregroundTick=motionTime-previousForegroundTick>=1/(low?30:60)-1e-6;
   if(!fullTick&&!foregroundTick&&!reduce)return;
   if(fullTick)previousTick=motionTime;
   if(foregroundTick)previousForegroundTick=motionTime;
   let changed=false,faceLodChanged=false,visiblePeople=0;
   const foreground=[];
   for(const person of people){
    person.viewDistance=car?Math.hypot(person.x-car.x,person.z-car.z):0;
    // Refresh eligibility even when distant/suppressed poses are skipped. A
    // stale reaction must not restart cheers after the moving car has left.
    person.reactionEligible=Boolean(car&&Math.abs(car.speed||0)>3&&person.viewDistance<(person.reactionDistance||34));
    const near=person.viewDistance<(low?18:26);
    if(person.viewDistance<(low?CHARACTER_LIMITS.mobileDistance:CHARACTER_LIMITS.desktopDistance))foreground.push(person);
    const inRange=person.viewDistance<(low?76:130);
    if(inRange)visiblePeople++;
    if(person.nearFace!==near||person.inRange!==inRange){person.nearFace=near;person.inRange=inRange;faceLodChanged=true;}
   }
   const wardrobeSlots=new Map();for(const character of characters)wardrobeSlots.set(character.template.lookVariant,(wardrobeSlots.get(character.template.lookVariant)||0)+1);
   const desiredCharacters=people.filter(person=>person.role!=='marshal'&&person.inRange&&person.viewDistance<(low?CHARACTER_LIMITS.mobileDistance:CHARACTER_LIMITS.desktopDistance)+(person.authoredCharacter?2:0))
    .sort((left,right)=>(left.viewDistance-(left.authoredCharacter?2:0))-(right.viewDistance-(right.authoredCharacter?2:0)))
    .filter(person=>{const available=wardrobeSlots.get(person.lookVariant)||0;if(!available)return false;wardrobeSlots.set(person.lookVariant,available-1);return true;}).slice(0,characters.length);
   const desiredSet=new Set(desiredCharacters);
   for(const character of characters)if(character.person&&!desiredSet.has(character.person)){
    character.person.authoredCharacter=false;character.person=null;character.mesh.visible=false;faceLodChanged=true;
   }
   for(const person of desiredCharacters)if(!person.authoredCharacter){
    const wardrobeCost=item=>Number(item.template.lookVariant!==person.lookVariant)*20+Math.abs(item.template.garment-person.garment)*2+Number(item.template.longHair!==person.longHair);
    const character=characters.filter(item=>!item.person).sort((a,b)=>wardrobeCost(a)-wardrobeCost(b))[0];if(!character)break;
    character.person=person;person.authoredCharacter=true;character.mesh.visible=true;
    character.update(person,spectatorPose(person,motionTime,person.reaction||0));faceLodChanged=true;
   }
   const mediumPeople=medium.select(people),mediumSet=new Set(mediumPeople);
   for(const person of people){const selected=mediumSet.has(person);if(Boolean(person.mediumCharacter)!==selected){person.mediumCharacter=selected;faceLodChanged=true;}}
   const farPeople=medium.selectFar(people),farSet=new Set(farPeople);let suppressedPeople=0;
   for(const person of people){
    const selected=farSet.has(person);
    // Once its coherent distant asset is ready, a spectator never falls back
    // to disconnected primitive anatomy just because the near pool is full.
    const suppressed=person.role!=='marshal'&&person.inRange&&medium.hasFar(person.lookVariant)&&!person.authoredCharacter&&!person.mediumCharacter&&!selected;
    if(Boolean(person.farCharacter)!==selected||Boolean(person.crowdSuppressed)!==suppressed){person.farCharacter=selected;person.crowdSuppressed=suppressed;faceLodChanged=true;}
    if(suppressed)suppressedPeople++;
   }
   const foregroundSet=new Set(foreground.sort((left,right)=>left.viewDistance-right.viewDistance).slice(0,low?10:20));
   if(faceLodChanged){
    // Distant spectators leave every draw, not just the facial detail batch.
    // Otherwise a global stand batch still rasterizes the entire venue's
    // bodies on a phone even when their CPU animation has stopped. Source
    // indices remain stable, so approaching spectators restore without rebuild.
    for(const batch of batches.values()){
     if(!batch.mesh)continue;let visible=0;
     for(const entry of batch.entries){
      entry.drawIndex=entry.person.authoredCharacter||entry.person.mediumCharacter||entry.person.farCharacter||entry.person.crowdSuppressed||!entry.person.inRange||((entry.faceDetail||entry.nearDetail)&&!entry.person.nearFace)?-1:visible++;
      if(entry.drawIndex>=0){write(entry);batch.mesh.setColorAt(entry.drawIndex,color.set(entry.tint));}
     }
     if(batch.mesh){batch.mesh.count=visible;batch.mesh.instanceColor.needsUpdate=true;}
    }
    changed=true;
   }
   for(const person of people){
    if(reduce||!person.inRange||person.crowdSuppressed)continue;
    const distance=person.viewDistance;
    if(distance>(low?76:110))continue;
    if(foregroundSet.has(person)?!foregroundTick:!fullTick)continue;
    const elapsed=Math.min(.12,Math.max(0,motionTime-(person.lastPoseTime||0)));person.lastPoseTime=motionTime;
    // Each spectator reacts at a different time as the car approaches their
    // own seat. Reactions ease away instead of snapping when the car passes.
    const nearby=person.reactionEligible;
    if(car){const target=Math.atan2(car.x-person.x,car.z-person.z)-person.yaw;
     const angle=Math.atan2(Math.sin(target),Math.cos(target));
     person.lookYaw+=(Math.max(-.43,Math.min(.43,angle))*.62-person.lookYaw)*(1-Math.exp(-elapsed*2.5));
    }
    const response=1-Math.exp(-elapsed*(nearby?4.8:.85)*(person.reactionSpeed||1));
    person.reaction+=(Number(nearby)-person.reaction)*response;
    const spontaneous=Math.sin(motionTime*.19+person.phase)> .72?.16:0;
    const excitement=spontaneous+person.reaction*.84;
    if(person.authoredCharacter)characters.find(item=>item.person===person)?.update(person,spectatorPose(person,motionTime,excitement));
    else if(!person.mediumCharacter&&!person.farCharacter)compose(person,motionTime,excitement);changed=true;
   }
   // Submit the freshly updated reactions, including the first approach tick.
   if(fullTick||faceLodChanged||reduce)medium.update(mediumPeople,motionTime,farPeople);
   scene.userData.crowd.activeCharacters=desiredCharacters.length;scene.userData.crowd.drawCalls=scene.userData.crowd.baseDrawCalls+medium.drawCalls+characters.filter(item=>item.person).reduce((sum,item)=>sum+item.drawCalls,0);
   scene.userData.crowd.mediumCharacters=medium.active;scene.userData.crowd.mediumDrawCalls=medium.mediumDrawCalls;
   scene.userData.crowd.farCharacters=medium.farActive;scene.userData.crowd.farDrawCalls=medium.farDrawCalls;scene.userData.crowd.suppressedPeople=suppressedPeople;
   scene.userData.crowd.texturedCharacters=characters.filter(item=>item.person&&item.kind==='textured').length;
   scene.userData.crowd.assetLoading=library.status;
   scene.userData.crowd.foregroundAnimated=reduce?0:foregroundSet.size;
   scene.userData.crowd.visiblePeople=visiblePeople-suppressedPeople;
   if(changed)for(const batch of batches.values())if(batch.mesh)batch.mesh.instanceMatrix.needsUpdate=true;
  },
  get count(){return people.length;},
  dispose(){if(disposed)return;disposed=true;for(const character of characters)character.dispose();medium.dispose();library.dispose();for(const batch of batches.values()){batch.mesh?.removeFromParent();batch.geometry.dispose();}
   for(const texture of textures)texture.dispose();for(const appearance of [material,skinMaterial,shirtMaterial,trouserMaterial,hairMaterial])appearance.dispose();},
 };
}
