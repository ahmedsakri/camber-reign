import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createSpectatorCharacter} from './spectator-character.js';
import {SPECTATOR_ASSET_VERSION,SPECTATOR_SEAT_HEIGHT} from './spectator-motion-config.js';
import {spectatorClothTint} from './spectator-clothing.js';

// Individually fitted CC0 MakeHuman meshes, not a palette swap of one person.
// Geometry and atlases are shared by the bounded near pool. Bones and one
// fabric material/uniform per slot are owned independently of the library.
export const SPECTATOR_ASSETS = Object.freeze([
 {id:'spectator-blue-shirt',shirt:'#537ba9',skin:'#d8a284',hair:'#352922',pants:'#35445b',longHair:false,garment:1,shorts:false,seatHipOffset:.09},
 {id:'spectator-light-tee',shirt:'#c6c3b7',skin:'#794c32',hair:'#211b18',pants:'#344254',longHair:false,garment:0,shorts:false,seatHipOffset:.105},
 {id:'spectator-striped-shirt',shirt:'#853d40',skin:'#be8a69',hair:'#231e1b',pants:'#3f4859',longHair:false,garment:2,shorts:false,seatHipOffset:.10},
 {id:'spectator-olive-jacket',shirt:'#62695e',skin:'#754c36',hair:'#241b16',pants:'#40516c',longHair:true,garment:1,shorts:false,seatHipOffset:.115},
 {id:'spectator-wine-blouse',shirt:'#884c53',skin:'#dcac8d',hair:'#726156',pants:'#555b56',longHair:true,garment:2,shorts:false,skirt:true,seatHipOffset:.11},
 {id:'spectator-sport',shirt:'#497493',skin:'#bb896b',hair:'#261d1a',pants:'#242832',longHair:true,garment:0,shorts:false,seatHipOffset:.10},
]);
export const REALISTIC_CROWD_BUDGET = Object.freeze({variants:6,maxTriangles:14500,maxDraws:4,maxFileBytes:2300000,parallelLoads:2});

function releaseSource(root) {
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(object=>{if(!object.isMesh)return;geometries.add(object.geometry);
  for(const material of [object.material].flat()){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
 });
 for(const geometry of geometries)geometry.dispose();
 for(const material of materials)material.dispose();
 for(const texture of textures){texture.dispose();texture.source?.data?.close?.();}
}

/** A race owns one library. At most two files decode concurrently and a failed
 * download leaves the authored fallback intact. Late responses are disposed. */
export function createSpectatorLibrary({load,enabled=typeof window!=='undefined',timeoutMs=20000}={}) {
 const loader=load||(async(url,{signal})=>{
  const response=await fetch(url,{signal});if(!response.ok)throw new Error('Spectator download failed');
  return new GLTFLoader().parseAsync(await response.arrayBuffer(),'/assets/crowd/');
 });
 const requests=new Map(),sources=new Set(),queue=[],activeJobs=new Set();
 let active=0,disposed=false;
 const pump=()=>{
  if(disposed)return;
  while(active<REALISTIC_CROWD_BUDGET.parallelLoads&&queue.length){
   const job=queue.shift(),controller=new AbortController();active++;activeJobs.add(job);
   const finish=root=>{
    if(job.done){if(root)releaseSource(root);return;}
    job.done=true;clearTimeout(job.timer);activeJobs.delete(job);active--;
    if(root&&!disposed){sources.add(root);job.resolve(root);}else{if(root)releaseSource(root);job.resolve(null);}
    pump();
   };
   job.cancel=()=>{controller.abort();finish(null);};
   job.timer=setTimeout(job.cancel,Math.max(1,timeoutMs));job.timer.unref?.();
   Promise.resolve().then(()=>loader(`/assets/crowd/${SPECTATOR_ASSETS[job.index].id}${job.tier==='medium'?'-crowd':job.tier==='far'?'-far':''}.glb?v=${SPECTATOR_ASSET_VERSION}`,{signal:controller.signal})).then(result=>{
    const root=result.scene||result;
    if(disposed||job.done){finish(root);return;}
    root.traverse(object=>{if(!object.isMesh)return;object.castShadow=false;object.receiveShadow=true;object.frustumCulled=false;
     for(const material of [object.material].flat()){
      // Opaque skin/clothes avoid blended-face sorting holes. Hair uses depth-
      // writing alpha cutouts so rear cards cannot paint over the eyes.
      if(material.transparent){material.transparent=false;material.alphaTest=.36;material.depthWrite=true;material.side=THREE.DoubleSide;}
      if(material.map)material.map.anisotropy=2;
      material.roughness=Math.max(.65,material.roughness||.83);
     }
    });
    finish(root);
   }).catch(()=>finish(null));
  }
 };
 function request(index,tier='near'){
   if(!enabled||disposed)return Promise.resolve(null);
   index=((index%SPECTATOR_ASSETS.length)+SPECTATOR_ASSETS.length)%SPECTATOR_ASSETS.length;
   const key=`${index}:${tier}`;
   if(!requests.has(key))requests.set(key,new Promise(resolve=>{queue.push({index,tier,resolve});pump();}));
   return requests.get(key);
 }
 return {
  get:index=>request(index),getMedium:index=>request(index,'medium'),getFar:index=>request(index,'far'),
  dispose(){if(disposed)return;disposed=true;for(const job of queue.splice(0))job.resolve(null);for(const job of [...activeJobs])job.cancel();for(const root of sources)releaseSource(root);sources.clear();requests.clear();},
  get status(){return {requested:requests.size,loaded:sources.size,active,queued:queue.length,disposed};},
 };
}

const Y=new THREE.Vector3(0,1,0);
const sourceSoleLifts=new WeakMap();
// Solve against the imported person's actual upper/lower bone lengths. No limb
// scaling: even an enthusiastic wave cannot stretch an arm to its target.
function jointBetween(start,target,hint,upper,lower) {
 const direction=target.clone().sub(start),raw=direction.length();
 const distance=THREE.MathUtils.clamp(raw,Math.abs(upper-lower)+.002,upper+lower-.002);
 direction.normalize();if(raw<1e-6)direction.copy(Y).negate();
 const pole=hint.clone().sub(start).addScaledVector(direction,-hint.clone().sub(start).dot(direction));
 if(pole.lengthSq()<1e-6)pole.set(direction.y,-direction.x,.1);pole.normalize();
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 return {joint:start.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along))),end:start.clone().addScaledVector(direction,distance)};
}

export function createTexturedSpectator(source) {
 const mesh=new THREE.Group();mesh.name='textured-spectator';
 const model=cloneSkeleton(source);mesh.add(model);mesh.updateMatrixWorld(true);
 const bones=new Map(),rest=new Map(),skinned=[];
 model.traverse(object=>{
  if(object.isBone){bones.set(object.name,object);rest.set(object.name,{position:object.position.clone(),quaternion:object.quaternion.clone(),worldPosition:object.getWorldPosition(new THREE.Vector3()),worldQuaternion:object.getWorldQuaternion(new THREE.Quaternion())});}
  if(object.isSkinnedMesh){object.frustumCulled=false;skinned.push(object);}
 });
 const required=['pelvis','spine_02','spine_03','head','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'];
 if(required.some(name=>!bones.has(name)))throw new Error('Spectator rig is incomplete');
 const clothTint={value:new THREE.Color('white')},clothMaterials=new Map();
 // SkeletonUtils shares source geometry/materials. Clone only the masked body
 // material; each pool slot must recolor without changing another spectator,
 // and the library must remain the sole owner of atlas textures and geometry.
 for(const skin of skinned){
  if(!skin.geometry.attributes._crowd_garment)continue;
  const tintMaterial=sourceMaterial=>{
   if(clothMaterials.has(sourceMaterial))return clothMaterials.get(sourceMaterial);
   const material=sourceMaterial.clone();
   material.onBeforeCompile=shader=>{
    shader.uniforms.spectatorClothTint=clothTint;
    shader.vertexShader='attribute float _crowd_garment; varying float vSpectatorGarment;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvSpectatorGarment=_crowd_garment;');
    shader.fragmentShader='uniform vec3 spectatorClothTint; varying float vSpectatorGarment;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.0),spectatorClothTint,clamp(vSpectatorGarment,0.0,1.0));');
   };
   material.customProgramCacheKey=()=> 'camber-near-fabric-v1';
   clothMaterials.set(sourceMaterial,material);return material;
  };
  skin.material=Array.isArray(skin.material)?skin.material.map(tintMaterial):tintMaterial(skin.material);
 }
 let draws=0;model.traverse(o=>{if(o.isMesh)draws+=Array.isArray(o.material)?o.material.length:1;});
 const phone=new THREE.Mesh(new THREE.BoxGeometry(.073,.137,.012),new THREE.MeshStandardMaterial({color:'#18212b',roughness:.39,metalness:.2}));
 phone.name='spectator-phone';mesh.add(phone);phone.visible=false;
 const worldPosition=name=>bones.get(name).getWorldPosition(new THREE.Vector3());
 function aim(name,child,target) {
  const bone=bones.get(name),reference=rest.get(name),direction=target.clone().sub(worldPosition(name)).normalize();
  const bindDirection=rest.get(child).worldPosition.clone().sub(reference.worldPosition).normalize();
  const world=new THREE.Quaternion().setFromUnitVectors(bindDirection,direction).multiply(reference.worldQuaternion);
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(world));bone.updateMatrixWorld(true);
 }
 function setWorldOrientation(name,quaternion) {
  const bone=bones.get(name);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion));bone.updateMatrixWorld(true);
 }
 const pelvisHeight=rest.get('pelvis').worldPosition.y;
 // Calibrate against the actual shoe mesh, not a shared ankle height. The six
 // fitted humans have different inseams and shoe soles. Keeping their pelvis
 // at a shared .84m made the shorter rig's feet float more than 10cm.
 let soleLift=sourceSoleLifts.get(source);
 if(!soleLift){
  const soles={l:Infinity,r:Infinity},point=new THREE.Vector3();
  for(const skin of skinned){
   const {position,skinIndex,skinWeight}=skin.geometry.attributes;
   const footSide=skin.skeleton.bones.map(bone=>/^(foot|ball)_l$/.test(bone.name)?1:/^(foot|ball)_r$/.test(bone.name)?-1:0);
   for(let index=0;index<position.count;index++){
    let left=0,right=0;
    for(let slot=0;slot<4;slot++){
     const side=footSide[skinIndex.array[index*4+slot]],weight=skinWeight.array[index*4+slot];
     if(side===1)left+=weight;else if(side===-1)right+=weight;
    }
    if(left<=.75&&right<=.75)continue;
    point.fromBufferAttribute(position,index).applyMatrix4(skin.matrixWorld);
    if(left>.75)soles.l=Math.min(soles.l,point.y);
    if(right>.75)soles.r=Math.min(soles.r,point.y);
   }
  }
  soleLift=Object.fromEntries(['l','r'].map(side=>[side,Number.isFinite(soles[side])?.004-soles[side]:0]));
  sourceSoleLifts.set(source,soleLift);
 }
 const handFrames=new Map();
 for(const suffix of ['l','r']){
  const hand=rest.get(`hand_${suffix}`).worldPosition;
  const finger=rest.get(`middle_01_${suffix}`).worldPosition.clone().sub(hand).normalize();
  const across=rest.get(`index_01_${suffix}`).worldPosition.clone().sub(rest.get(`pinky_01_${suffix}`).worldPosition).normalize();
  const normal=new THREE.Vector3().crossVectors(across,finger).normalize();
  if(normal.z<0)normal.negate();
  handFrames.set(suffix,{finger,normal});
 }
 function orientHand(suffix,side,gesture,amount){
  const frame=handFrames.get(suffix),raised=gesture===4||(gesture===0&&side>0)||(gesture===2&&side<0);
  const finger=new THREE.Vector3(raised?side*.09:0,raised||gesture===3||gesture===1?1:-1,gesture===1?.22:.06).normalize();
  const normal=new THREE.Vector3(gesture===1?-side:0,0,gesture===1?.08:1);
  if(gesture===6){finger.set(-side,.1,.15).normalize();normal.set(0,.65,1);}
  if(gesture===7&&side>0){finger.set(.35,.10,.8).normalize();normal.set(0,1,-.08);}
  const orientation=(direction,palm)=>{
   palm.addScaledVector(direction,-palm.dot(direction)).normalize();
   const rotation=new THREE.Quaternion().setFromUnitVectors(frame.finger,direction);
   const turned=frame.normal.clone().applyQuaternion(rotation);turned.addScaledVector(direction,-turned.dot(direction)).normalize();
   const twist=Math.atan2(new THREE.Vector3().crossVectors(turned,palm).dot(direction),turned.dot(palm));
   return rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(direction,twist)).multiply(rest.get(`hand_${suffix}`).worldQuaternion);
  };
  const relaxed=orientation(new THREE.Vector3(0,-1,.06).normalize(),new THREE.Vector3(0,0,1));
  setWorldOrientation(`hand_${suffix}`,relaxed.slerp(orientation(finger,normal),gesture===3||gesture>=6?1:amount));
 }
 let disposed=false;
 return {
  mesh,kind:'textured',get drawCalls(){return draws+Number(phone.visible);},
  update(person,pose){
   if(disposed)return;
   spectatorClothTint(person.phase,clothTint.value);
   // Work in the character's local metre coordinate system. The final placement
   // is applied after retargeting, avoiding camera/world-dependent poses.
   mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.setScalar(1);
   for(const [name,bone] of bones){bone.position.copy(rest.get(name).position);bone.quaternion.copy(rest.get(name).quaternion);}
   mesh.updateMatrixWorld(true);
   const hip=person.seated?(person.seatHeight??SPECTATOR_SEAT_HEIGHT)/person.height+(person.seatHipOffset??.10):pelvisHeight+Math.max(soleLift.l,soleLift.r)-.022;
   const upperBodyOffset=hip-pose.hip;
   const pelvis=bones.get('pelvis'),pelvisDelta=new THREE.Vector3(pose.sway,hip-pelvisHeight,pose.lean);
   pelvisDelta.applyQuaternion(pelvis.parent.getWorldQuaternion(new THREE.Quaternion()).invert());pelvis.position.add(pelvisDelta);pelvis.updateMatrixWorld(true);
   for(const name of ['spine_02','spine_03']){bones.get(name).rotateX(pose.torsoTilt*.35);bones.get(name).rotateY((pose.torsoYaw||0)*.5);bones.get(name).rotateZ((pose.torsoRoll||0)*.5);}
   bones.get('neck_01')?.rotateY(pose.headYaw*.2);
   const head=bones.get('head');head.rotateY(pose.headYaw);head.rotateX(pose.headPitch);head.rotateZ(pose.headRoll);
   mesh.updateMatrixWorld(true);
   for(const arm of pose.arms){
    const suffix=arm.side>0?'l':'r',upper=`upperarm_${suffix}`,lower=`lowerarm_${suffix}`,hand=`hand_${suffix}`;
    const shoulder=worldPosition(upper);
    const upperLength=rest.get(upper).worldPosition.distanceTo(rest.get(lower).worldPosition),lowerLength=rest.get(lower).worldPosition.distanceTo(rest.get(hand).worldPosition);
    const target=new THREE.Vector3(...arm.hand);target.y+=upperBodyOffset-.025;
    const hint=new THREE.Vector3(...arm.elbow);hint.y+=upperBodyOffset;
    const solved=jointBetween(shoulder,target,hint,upperLength,lowerLength);
    aim(upper,lower,solved.joint);aim(lower,hand,solved.end);
    // Fingertips curl around a phone or into a cheering fist, while waves and
    // claps retain the imported human hand silhouette.
    const amount=THREE.MathUtils.smoothstep(pose.energy??1,.10,.65);
    orientHand(suffix,arm.side,person.gesture,amount);
    const raised=person.gesture===4||(person.gesture===0&&arm.side>0);
    const targetCurl=person.gesture===2&&arm.side<0?.80:person.gesture===1?.10:raised?.035:.26;
    const curl=person.gesture===3?.55:THREE.MathUtils.lerp(.26,targetCurl,amount);
    for(const finger of ['index','middle','ring','pinky'])for(const part of ['01','02','03'])bones.get(`${finger}_${part}_${suffix}`)?.rotateX(curl);
    bones.get(`thumb_02_${suffix}`)?.rotateX(curl*.55);
   }
   for(const suffix of ['l','r']){
    const side=suffix==='l'?1:-1,upper=`thigh_${suffix}`,lower=`calf_${suffix}`,foot=`foot_${suffix}`;
    const start=worldPosition(upper),target=rest.get(foot).worldPosition.clone();
    target.y+=soleLift[suffix];
    if(person.seated){target.x=side*(person.skirt?.105:.14);target.z=.37;}else {target.x+=side*.012;target.z+=side*.032;}
    const hint=new THREE.Vector3(side*(person.skirt?.12:.16),.43,person.seated?.43:.06);
    const solved=jointBetween(start,target,hint,rest.get(upper).worldPosition.distanceTo(rest.get(lower).worldPosition),rest.get(lower).worldPosition.distanceTo(rest.get(foot).worldPosition));
    aim(upper,lower,solved.joint);aim(lower,foot,solved.end);setWorldOrientation(foot,rest.get(foot).worldQuaternion);
   }
   phone.visible=person.gesture===3&&person.role!=='marshal';
   if(phone.visible){const left=worldPosition('hand_l'),right=worldPosition('hand_r');phone.position.copy(left.add(right).multiplyScalar(.5));phone.position.y+=.027;phone.position.z+=.024;phone.rotation.set(-.08,0,0);}
   for(const skin of skinned){if(!skin.morphTargetDictionary)continue;
    const blink=skin.morphTargetDictionary.Blink,cheer=skin.morphTargetDictionary.Cheer;
    if(blink!==undefined)skin.morphTargetInfluences[blink]=THREE.MathUtils.clamp(1-pose.blink,0,.9);
    if(cheer!==undefined)skin.morphTargetInfluences[cheer]=THREE.MathUtils.clamp(pose.mouth*.36,0,.34);
   }
   mesh.position.set(person.x,person.floor,person.z);mesh.rotation.set(0,person.yaw,0);mesh.scale.set(person.height*person.width,person.height,person.height);
   mesh.updateMatrixWorld(true);for(const skin of skinned)skin.skeleton.update();
  },
  dispose(){if(disposed)return;disposed=true;phone.geometry.dispose();phone.material.dispose();for(const material of clothMaterials.values())material.dispose();for(const skin of skinned)skin.skeleton.dispose();mesh.removeFromParent();},
 };
}

/** Immediate original fallback; async replacement keeps the current pose,
 * visibility and placement even when completion happens while racing is paused. */
export function createNearSpectator(person,{low=false,library,index=0}={}) {
 const mesh=new THREE.Group();mesh.name='near-spectator';
 let current=createSpectatorCharacter(person,{low}),disposed=false,lastPerson=person,lastPose=null;
 mesh.add(current.mesh);
 const ready=(library?.get(index)||Promise.resolve(null)).then(source=>{
  if(!source||disposed)return false;
  let next;
  try{next=createTexturedSpectator(source);if(lastPose)next.update(lastPerson,lastPose);}catch{next?.dispose();return false;}
  if(disposed){next.dispose();return false;}
  current.dispose();current=next;mesh.add(current.mesh);return true;
 }).catch(()=>false);
 return {mesh,ready,get kind(){return current.kind||'fallback';},get drawCalls(){return current.drawCalls||1;},
  update(profile,pose){lastPerson=profile;lastPose=pose;current.update(profile,pose);},
  dispose(){if(disposed)return;disposed=true;current.dispose();mesh.removeFromParent();},
 };
}
