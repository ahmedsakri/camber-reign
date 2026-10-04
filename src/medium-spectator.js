import * as THREE from 'three';
import {SPECTATOR_ASSETS} from './realistic-spectator.js';
import {SPECTATOR_GESTURES,SPECTATOR_ASSET_VERSION,SPECTATOR_SEAT_HEIGHT} from './spectator-motion-config.js';
import {spectatorClothTint} from './spectator-clothing.js';

// Shared, offline-baked human motion. Only these small palettes and the reduced
// geometry are additional downloads: body/hair materials reuse the near atlases.
export const MEDIUM_CROWD_BUDGET=Object.freeze({mobile:48,desktop:108,mobileDistance:48,desktopDistance:68,maxTriangles:2600,maxDraws:18,maxGeometryBytes:420000});
export const FAR_CROWD_BUDGET=Object.freeze({mobile:112,desktop:240,mobileDistance:76,desktopDistance:130,maxTriangles:800,maxDraws:18,maxGeometryBytes:170000});
export const CROWD_MOTION=Object.freeze({frames:24,gestures:SPECTATOR_GESTURES.length,clips:SPECTATOR_GESTURES.length*2,bones:53,matrixElements:12,duration:5.4});
const transform=new THREE.Object3D(),tint=new THREE.Color();

const reactsToCar=gesture=>gesture===0||gesture===1||gesture===2||gesture===4;
function advanceCrowdReaction(person,time){
 if(!reactsToCar(person.gesture))return;
 const start=person.crowdCheerStartedAt;
 if(Number.isFinite(start)&&(time-start)*(person.tempo||1)<CROWD_MOTION.duration)return;
 // Every cheer clip closes onto its own quiet first frame. Finish the whole
 // recovery before resting/repeating: crossfading unrelated affine bone
 // matrices can collapse a bent arm. Existing phase gives a stable response
 // threshold; no extra random choices, buffers or runtime skeletons are needed.
 const threshold=.18+THREE.MathUtils.euclideanModulo(person.phase||0,Math.PI*2)/(Math.PI*2)*.18;
 person.crowdCheerStartedAt=person.reactionEligible&&(person.reaction||0)>=threshold?time:null;
}

export function crowdMotionFrame(person,time){
 const clock=reactsToCar(person.gesture)
  ?(Number.isFinite(person.crowdCheerStartedAt)?Math.max(0,time-person.crowdCheerStartedAt)*(person.tempo||1):0)
  :time*(person.tempo||1)+(person.phase||0);
 const frame=(clock%CROWD_MOTION.duration)/CROWD_MOTION.duration*(CROWD_MOTION.frames-1);
 const clip=(person.seated?CROWD_MOTION.gestures:0)+person.gesture,first=Math.floor(frame);
 // The palettes use a unit-height person and the main chair. Stature must not
 // raise/lower the seat contact, and the paddock has a lower chair. Shoes stay
 // at the floor while the shin region accommodates this small height change.
 const seatOffset=person.seated?(person.seatHeight??SPECTATOR_SEAT_HEIGHT)/person.height-SPECTATOR_SEAT_HEIGHT:0;
 return [clip*CROWD_MOTION.frames+first,clip*CROWD_MOTION.frames+Math.min(first+1,CROWD_MOTION.frames-1),frame-first,seatOffset];
}

function materialForCrowd(source,texture,bindMatrix,bindMatrixInverse){
 const material=source.clone();material.userData={...source.userData,instancedHuman:true};
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{crowdPoseData:{value:texture},crowdBind:{value:bindMatrix},crowdBindInverse:{value:bindMatrixInverse}});
  shader.vertexShader=`attribute vec4 crowdJoints; attribute vec4 crowdWeights; attribute vec4 crowdFrames;
attribute float crowdGarment; varying float vCrowdGarment;
uniform sampler2D crowdPoseData; uniform mat4 crowdBind; uniform mat4 crowdBindInverse;
mat4 crowdBone(float joint,float row){
 float x=(joint*3.0+0.5)/159.0; float y=(row+0.5)/${CROWD_MOTION.frames*CROWD_MOTION.clips}.0;
 vec4 a=texture2D(crowdPoseData,vec2(x,y));vec4 b=texture2D(crowdPoseData,vec2(x+1.0/159.0,y));vec4 c=texture2D(crowdPoseData,vec2(x+2.0/159.0,y));
 return mat4(vec4(a.x,b.x,c.x,0.0),vec4(a.y,b.y,c.y,0.0),vec4(a.z,b.z,c.z,0.0),vec4(a.w,b.w,c.w,1.0));
}
mat4 crowdBlend(float joint){return crowdBone(joint,crowdFrames.x)*(1.0-crowdFrames.z)+crowdBone(joint,crowdFrames.y)*crowdFrames.z;}
`+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <skinbase_vertex>',`mat4 crowdSkin=crowdBindInverse*(crowdBlend(crowdJoints.x)*crowdWeights.x+crowdBlend(crowdJoints.y)*crowdWeights.y+crowdBlend(crowdJoints.z)*crowdWeights.z+crowdBlend(crowdJoints.w)*crowdWeights.w)*crowdBind;`);
  shader.vertexShader=shader.vertexShader.replace('#include <skinnormal_vertex>',`objectNormal=mat3(crowdSkin)*objectNormal;
float crowdSeatT=clamp(((crowdSkin*vec4(position,1.0)).y-0.09)/0.33,0.0,1.0);
objectNormal.y/=1.0+crowdFrames.w*6.0*crowdSeatT*(1.0-crowdSeatT)/0.33;`);
  shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`transformed=(crowdSkin*vec4(transformed,1.0)).xyz;
transformed.y+=crowdFrames.w*smoothstep(0.09,0.42,transformed.y);`);
  shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\nvCrowdGarment=crowdGarment;');
  shader.fragmentShader='varying float vCrowdGarment;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#ifdef USE_INSTANCING_COLOR
diffuseColor.rgb*=mix(vec3(1.0),vColor.rgb,clamp(vCrowdGarment,0.0,1.0));
#endif`);
 };
 material.customProgramCacheKey=()=> 'camber-instanced-human-v5';
 return material;
}

export function createMediumVariant(source,geometrySource,palette,{capacity=MEDIUM_CROWD_BUDGET.mobile,tier='medium',sharedTexture}={}){
 const expected=CROWD_MOTION.frames*CROWD_MOTION.clips*CROWD_MOTION.bones*CROWD_MOTION.matrixElements;
 if(palette.length!==expected)throw new Error('Invalid crowd motion palette');
 const texture=sharedTexture||new THREE.DataTexture(palette,CROWD_MOTION.bones*3,CROWD_MOTION.frames*CROWD_MOTION.clips,THREE.RGBAFormat,THREE.HalfFloatType);
 texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 const materialKey=name=>name.replace(/\.\d{3}$/,'');
 const sourceMaterials=new Map();source.traverse(object=>{if(object.isMesh)for(const material of [object.material].flat())sourceMaterials.set(materialKey(material.name),material);});
 const meshes=[];let disposed=false;
 geometrySource.updateMatrixWorld(true);
 try{geometrySource.traverse(object=>{
  if(!object.isSkinnedMesh)return;
  const original=sourceMaterials.get(materialKey(object.material.name));
  if(!original)throw new Error(`Missing original crowd material: ${object.material.name}`);
  const geometry=object.geometry.clone();geometry.setAttribute('crowdJoints',geometry.attributes.skinIndex);geometry.setAttribute('crowdWeights',geometry.attributes.skinWeight);
  geometry.setAttribute('crowdGarment',geometry.attributes._crowd_garment||new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count),1));geometry.deleteAttribute('_crowd_garment');
  geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');
  geometry.setAttribute('crowdFrames',new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage));
  const material=materialForCrowd(original,texture,object.bindMatrix.clone(),object.bindMatrixInverse.clone());
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name=`race-spectators-textured-${tier}`;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);meshes.push(mesh);
 });}catch(error){for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}if(!sharedTexture)texture.dispose();throw error;}
 return {meshes,texture,capacity,
  update(people,time){
   if(disposed)return;
   // Both distance tiers carry this clock through a LOD handoff. Their shader,
   // palette and two-frame interpolation remain identical and unchanged.
   for(let i=0;i<Math.min(people.length,capacity);i++)advanceCrowdReaction(people[i],time);
   for(const mesh of meshes){mesh.count=Math.min(people.length,capacity);const frames=mesh.geometry.attributes.crowdFrames;
    for(let i=0;i<mesh.count;i++){
     const person=people[i];transform.position.set(person.x,person.floor,person.z);transform.rotation.set(0,person.yaw,0);transform.scale.set(person.height*person.width,person.height,person.height);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
     frames.setXYZW(i,...crowdMotionFrame(person,time));
     mesh.setColorAt(i,spectatorClothTint(person.phase,tint));
    }
    mesh.instanceMatrix.needsUpdate=true;frames.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   }
  },
  dispose(){if(disposed)return;disposed=true;for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}if(!sharedTexture)texture.dispose();},
 };
}

/** Fixed capacity, no per-person Object3D, skeleton, texture or network request.
 * Every visible medium person is rendered once in three wardrobe batches. */
export function createMediumCrowd({low=false,library,enabled=typeof window!=='undefined',loadPalette}={}){
 const variants=new Map(),farVariants=new Map(),controllers=new Set();let disposed=false,scene=null,revision=0,active=0,farActive=0;
 const limit=low?MEDIUM_CROWD_BUDGET.mobile:MEDIUM_CROWD_BUDGET.desktop;
 const farLimit=low?FAR_CROWD_BUDGET.mobile:FAR_CROWD_BUDGET.desktop;
 const load=loadPalette||(async(index,signal)=>{const response=await fetch(`/assets/crowd/${SPECTATOR_ASSETS[index].id}-motion.bin?v=${SPECTATOR_ASSET_VERSION}`,{signal});if(!response.ok)throw new Error('Crowd motion download failed');return new Uint16Array(await response.arrayBuffer());});
 async function prepare(){
  if(!enabled||!library?.getMedium)return;
  // Sequential variants also keep allocation/decoding off the initial race frame.
  for(let index=0;index<SPECTATOR_ASSETS.length&&!disposed;index++){
   const controller=new AbortController();controllers.add(controller);let timer,onAbort;
   try{
    const [source,geometrySource]=await Promise.all([library.get(index),library.getMedium(index)]);
    if(!source||!geometrySource||disposed)continue;
    const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(new Error('Crowd motion cancelled'));controller.signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>controller.abort(),12000);timer.unref?.();});
    const palette=await Promise.race([load(index,controller.signal),cancelled]);
    if(disposed)break;
    const variant=createMediumVariant(source,geometrySource,palette,{capacity:limit});variants.set(index,variant);if(scene)for(const mesh of variant.meshes)scene.add(mesh);revision++;
    if(library.getFar){
     const farGeometry=await library.getFar(index);if(disposed)break;
     if(farGeometry){const far=createMediumVariant(source,farGeometry,palette,{capacity:farLimit,tier:'far',sharedTexture:variant.texture});farVariants.set(index,far);if(scene)for(const mesh of far.meshes)scene.add(mesh);revision++;}
    }
   }catch{/* Keep the existing distant representation when any asset is missing. */}
   finally{clearTimeout(timer);if(onAbort)controller.signal.removeEventListener('abort',onAbort);controllers.delete(controller);}
  }
 }
 let ready=Promise.resolve(),started=false;
 return {get ready(){return ready;},get revision(){return revision;},get active(){return active;},get farActive(){return farActive;},get drawCalls(){return [...variants.values(),...farVariants.values()].reduce((n,v)=>n+v.meshes.filter(mesh=>mesh.count>0).length,0);},
  get mediumDrawCalls(){return [...variants.values()].reduce((n,v)=>n+v.meshes.filter(mesh=>mesh.count>0).length,0);},get farDrawCalls(){return [...farVariants.values()].reduce((n,v)=>n+v.meshes.filter(mesh=>mesh.count>0).length,0);},
  hasFar:index=>farVariants.has(index),
  render(target){scene=target;for(const variant of variants.values())for(const mesh of variant.meshes)scene.add(mesh);if(!started){started=true;ready=prepare();}},
  select(people){return people.filter(person=>!person.authoredCharacter&&person.role!=='marshal'&&person.inRange&&variants.has(person.lookVariant)&&person.viewDistance<(low?MEDIUM_CROWD_BUDGET.mobileDistance:MEDIUM_CROWD_BUDGET.desktopDistance)).sort((a,b)=>(a.viewDistance-(a.mediumCharacter?2:0))-(b.viewDistance-(b.mediumCharacter?2:0))).slice(0,limit);},
  selectFar(people){return people.filter(person=>!person.authoredCharacter&&!person.mediumCharacter&&person.role!=='marshal'&&person.inRange&&farVariants.has(person.lookVariant)&&person.viewDistance<(low?FAR_CROWD_BUDGET.mobileDistance:FAR_CROWD_BUDGET.desktopDistance)).sort((a,b)=>(a.viewDistance-(a.farCharacter?2:0))-(b.viewDistance-(b.farCharacter?2:0))).slice(0,farLimit);},
  update(people,time,farPeople=[]){active=people.length;farActive=farPeople.length;for(const [index,variant] of variants)variant.update(people.filter(person=>person.lookVariant===index),time);for(const [index,variant] of farVariants)variant.update(farPeople.filter(person=>person.lookVariant===index),time);},
  dispose(){if(disposed)return;disposed=true;for(const controller of controllers)controller.abort();for(const variant of farVariants.values())variant.dispose();for(const variant of variants.values())variant.dispose();variants.clear();farVariants.clear();active=farActive=0;},
 };
}
