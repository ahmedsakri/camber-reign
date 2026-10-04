import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createSpectatorLibrary,createTexturedSpectator,createNearSpectator,SPECTATOR_ASSETS,REALISTIC_CROWD_BUDGET} from '../src/realistic-spectator.js';
import {spectatorProfile,spectatorPose,createCrowd} from '../src/crowd.js';
import {SPECTATOR_GESTURES} from '../src/spectator-motion-config.js';
import {spectatorClothTint} from '../src/spectator-clothing.js';

const sources=[];
// The tests exercise real GLB geometry/skinning. Image decoding is browser-only;
// a tiny texture substitute keeps this Node test independent of a canvas polyfill.
for(const asset of SPECTATOR_ASSETS){
 const bytes=await readFile(new URL(`../public/assets/crowd/${asset.id}.glb`,import.meta.url));
 const loader=new GLTFLoader();loader.register(()=>({name:'test-texture-decoder',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');sources.push(gltf.scene);
}

test('all six distinct textured CC0 rigs meet file, texture, geometry and material budgets',async()=>{
 assert.equal(SPECTATOR_ASSETS.length,6);
 for(let index=0;index<sources.length;index++){
  const file=new URL(`../public/assets/crowd/${SPECTATOR_ASSETS[index].id}.glb`,import.meta.url);
  assert.ok((await stat(file)).size<REALISTIC_CROWD_BUDGET.maxFileBytes);
  const bytes=await readFile(file);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.ok(json.images.length<=3);assert.ok(json.skins[0].joints.length>=50);
  let triangles=0,draws=0,morphs=0;
  sources[index].traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;draws+=Array.isArray(o.material)?o.material.length:1;
   assert.ok(o.isSkinnedMesh);assert.ok(o.geometry.attributes.uv);
   for(const attribute of Object.values(o.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
   if(o.morphTargetDictionary?.Blink!==undefined){morphs++;for(const name of ['Blink','Cheer'])assert.ok(o.geometry.morphAttributes.position[o.morphTargetDictionary[name]].array.some(value=>Math.abs(value)>1e-5),`${name} has actual facial displacement`);}
  });
  assert.ok(triangles<=REALISTIC_CROWD_BUDGET.maxTriangles,`${SPECTATOR_ASSETS[index].id}: ${triangles}`);assert.ok(draws<=3);assert.ok(morphs>0);
 }
});

test('near garment masks append data while preserving the original geometry, morphs, skinning and image bytes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/assets/crowd/SOURCES.json',import.meta.url),'utf8'));
 const skinProbes=JSON.parse(await readFile(new URL('./fixtures/spectator-skin-probes.json',import.meta.url),'utf8'));
 assert.equal(manifest.garmentMask.files.length,6);
 for(const [index,source] of sources.entries()){
  const asset=SPECTATOR_ASSETS[index],record=manifest.garmentMask.files.find(item=>item.file===asset.id+'.glb');
  const bytes=await readFile(new URL(`../public/assets/crowd/${asset.id}.glb`,import.meta.url));
  const jsonSize=bytes.readUInt32LE(12),binary=bytes.subarray(28+jsonSize);
  assert.equal(createHash('sha256').update(binary.subarray(0,record.preservedBinaryBytes)).digest('hex'),record.preservedBinarySha256,'all original binary geometry, morph and image bytes are unchanged');
  assert.equal(binary.length-record.preservedBinaryBytes,record.maskBytes,'only the scalar mask is appended');
  let bodyMasks=0;
  source.traverse(object=>{if(!object.isSkinnedMesh)return;
   const {position,skinIndex,skinWeight,_crowd_garment:mask}=object.geometry.attributes;
   if(object.material.name!=='Skin_and_cloth_atlas'){assert.equal(mask,undefined,'hair and eyebrows retain unmodified shared materials');return;}
   bodyMasks++;assert.equal(mask.count,position.count);assert.equal(mask.count,record.maskVertices);assert.ok(mask.array.every(value=>value===0||value===1));
   assert.equal(mask.array.filter(value=>value===1).length,record.selectedVertices);
   const probes=skinProbes.assets[asset.id];
   assert.equal(createHash('sha256').update(new Uint8Array(position.array.buffer,position.array.byteOffset,position.array.byteLength)).digest('hex'),probes.positionAccessorSha256,'skin probes remain anchored to original topology');
   for(const region of ['headNeck','hands','eyes'])for(const vertex of probes[region])assert.equal(mask.getX(vertex),0,`${asset.id}: actual ${region} vertex ${vertex} must retain its source color`);
   if(asset.id==='spectator-wine-blouse')for(const vertex of skinProbes.wineNearProtectedCloth)assert.equal(mask.getX(vertex),1,'the neckline fix must retain neighboring blouse tint');
   let protectedVertices=0;
   for(let vertex=0;vertex<position.count;vertex++){
    let protectedWeight=0;
    for(let slot=0;slot<4;slot++)if(/^(head|neck|hand_|thumb_|index_|middle_|ring_|pinky_)/.test(object.skeleton.bones[skinIndex.array[vertex*4+slot]].name))protectedWeight+=skinWeight.array[vertex*4+slot];
    if(protectedWeight>.75||position.getY(vertex)>1.36){assert.equal(mask.getX(vertex),0,'face, eyes, hairline and hand skin cannot take a fabric tint');protectedVertices++;}
   }
   assert.ok(protectedVertices>300);
  });
  assert.equal(bodyMasks,1,'exactly one existing body draw gains the mask');
 }
});

const compileClothMaterial=material=>{
 const shader={uniforms:{},vertexShader:'#include <color_vertex>',fragmentShader:'#include <color_fragment>'};
 material.onBeforeCompile(shader);return shader;
};
const bodyOf=character=>{let body;character.mesh.traverse(object=>{if(object.isSkinnedMesh&&object.geometry.attributes._crowd_garment)body=object;});return body;};

test('near slots own independent fabric uniforms and materials while the library owns shared atlases and geometry',async()=>{
 const independent=cloneSkeleton(sources[0]);independent.traverse(object=>{if(!object.isMesh)return;object.geometry=object.geometry.clone();object.material=object.material.clone();if(object.material.map)object.material.map=object.material.map.clone();});
 const library=createSpectatorLibrary({enabled:true,load:async()=>({scene:independent})}),source=await library.get(0);
 const first=createTexturedSpectator(source),second=createTexturedSpectator(source),firstBody=bodyOf(first),secondBody=bodyOf(second);
 let sourceBody;source.traverse(object=>{if(object.isSkinnedMesh&&object.geometry.attributes._crowd_garment)sourceBody=object;});
 assert.equal(firstBody.geometry,sourceBody.geometry);assert.equal(secondBody.geometry,sourceBody.geometry);
 assert.equal(firstBody.material.map,sourceBody.material.map);assert.equal(secondBody.material.map,sourceBody.material.map);
 assert.notEqual(firstBody.material,sourceBody.material);assert.notEqual(firstBody.material,secondBody.material);
 const profile=phase=>({...spectatorProfile(0,0,0,0,false,()=>.5),phase});
 const a=profile(.1),b=profile(.3);first.update(a,spectatorPose(a,1,.5));second.update(b,spectatorPose(b,1,.5));
 const firstShader=compileClothMaterial(firstBody.material),secondShader=compileClothMaterial(secondBody.material);
 assert.match(firstShader.vertexShader,/attribute float _crowd_garment/);assert.match(firstShader.fragmentShader,/mix\(vec3\(1.0\),spectatorClothTint/);
 const firstUniform=firstShader.uniforms.spectatorClothTint,secondUniform=secondShader.uniforms.spectatorClothTint;
 assert.notEqual(firstUniform,secondUniform);assert.ok(firstUniform.value.equals(spectatorClothTint(a.phase)));assert.ok(secondUniform.value.equals(spectatorClothTint(b.phase)));
 const oldSecond=secondUniform.value.clone(),sourceColor=sourceBody.material.color.clone();
 const reassigned=profile(.6);first.update(reassigned,spectatorPose(reassigned,1,.5));assert.ok(firstUniform.value.equals(spectatorClothTint(reassigned.phase)));assert.ok(secondUniform.value.equals(oldSecond));assert.ok(sourceBody.material.color.equals(sourceColor));
 const owned=[firstBody.material,secondBody.material],shared=new Set();source.traverse(object=>{if(object.isMesh){shared.add(object.geometry);shared.add(object.material);if(object.material.map)shared.add(object.material.map);}});
 const counts=new Map([...owned,...shared].map(resource=>[resource,0]));for(const resource of counts.keys())resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
 first.dispose();first.dispose();assert.equal(counts.get(owned[0]),1);assert.equal(counts.get(owned[1]),0);assert.ok([...shared].every(resource=>counts.get(resource)===0));
 second.dispose();library.dispose();library.dispose();assert.ok([...counts.values()].every(count=>count===1),'owned materials and shared resources each release exactly once');
});

test('late near readiness applies the latest pooled person tint without changing paused pose or visibility',async()=>{
 const original={...spectatorProfile(2,0,3,.2,true,()=>.5),phase:.1},replacement={...original,phase:.6,x:7};let finish;
 const character=createNearSpectator(original,{library:{get:()=>new Promise(resolve=>finish=resolve)}});character.mesh.visible=false;
 character.update(original,spectatorPose(original,1,.2));character.update(replacement,spectatorPose(replacement,1,.2));finish(sources[0]);assert.equal(await character.ready,true);
 const body=bodyOf(character),shader=compileClothMaterial(body.material);assert.ok(shader.uniforms.spectatorClothTint.value.equals(spectatorClothTint(replacement.phase)));assert.equal(character.mesh.visible,false);
 assert.equal(character.mesh.getObjectByName('textured-spectator').position.x,replacement.x);character.dispose();
});

test('actual imported bones and vertices remain finite and human-sized through every seated/standing gesture',()=>{
 for(const source of sources){
  const character=createTexturedSpectator(source),v=new THREE.Vector3();
  const p={...spectatorProfile(0,0,0,0,false,()=>.5),height:1,width:1};
  for(const seated of [false,true])for(let gesture=0;gesture<SPECTATOR_GESTURES.length;gesture++)for(const time of [.1,1.7]){
   Object.assign(p,{seated,gesture});character.update(p,spectatorPose(p,time,.95));
   const bounds=new THREE.Box3();character.mesh.traverse(o=>{if(!o.isSkinnedMesh)return;
    for(let i=0;i<o.geometry.attributes.position.count;i+=5){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);assert.ok(v.toArray().every(Number.isFinite));bounds.expandByPoint(v);}
   });
   const size=bounds.getSize(new THREE.Vector3());assert.ok(size.y<2.25&&size.y>(seated?.85:1.25),JSON.stringify(size));assert.ok(size.x<2.05&&size.z<1.5,JSON.stringify(size));assert.ok(bounds.min.y>-.13,`feet below ground ${bounds.min.y}`);
  }
  character.dispose();character.dispose();
 }
});

test('palms ease through gesture activation while weight shifts keep feet planted',()=>{
 const character=createTexturedSpectator(sources[0]);
 const person={...spectatorProfile(0,0,0,0,false,()=>.5),height:1,width:1};
 const orientation=name=>character.mesh.getObjectByName(name).getWorldQuaternion(new THREE.Quaternion());
 for(let gesture=0;gesture<SPECTATOR_GESTURES.length;gesture++){
  person.gesture=gesture;character.update(person,spectatorPose(person,1,.249));const before=orientation('hand_l');
  character.update(person,spectatorPose(person,1,.251));assert.ok(before.angleTo(orientation('hand_l'))<.03,'a wrist must not flip when a celebration starts');
 }
 person.gesture=0;character.update(person,spectatorPose(person,.1,.8));const foot=character.mesh.getObjectByName('foot_l').getWorldPosition(new THREE.Vector3());
 character.update(person,spectatorPose(person,3.7,.8));assert.ok(foot.distanceTo(character.mesh.getObjectByName('foot_l').getWorldPosition(new THREE.Vector3()))<.015,'pelvis shifts should not slide the planted foot');
 character.dispose();
});

test('actual shoe soles stay on the row floor and seated pelvises follow chair height at both body scales',()=>{
 const point=new THREE.Vector3();
 for(const [index,source] of sources.entries()){
  const character=createTexturedSpectator(source),asset=SPECTATOR_ASSETS[index],shoes=[];
  character.mesh.traverse(object=>{
   if(!object.isSkinnedMesh)return;
   const {position,skinIndex,skinWeight}=object.geometry.attributes;
   for(let vertex=0;vertex<position.count;vertex++){
    let footWeight=0;
    for(let slot=0;slot<4;slot++)if(/^(foot|ball)_[lr]$/.test(object.skeleton.bones[skinIndex.array[vertex*4+slot]].name))footWeight+=skinWeight.array[vertex*4+slot];
    if(footWeight>.75)shoes.push({object,vertex});
   }
  });
  assert.ok(shoes.length>20,'measure the actual weighted shoe mesh');
  for(const height of [.91,1.08])for(const seated of [false,true])for(const seatHeight of [.39,.455])for(const gesture of [0,3,5,7])for(const time of [.1,3.7]){
   const person={...spectatorProfile(7,2.3,-4,.7,seated,()=>.5),...asset,height,width:1,seatHeight,gesture};
   character.update(person,spectatorPose(person,time,.8));
   let sole=Infinity;
   for(const {object,vertex} of shoes){object.getVertexPosition(vertex,point).applyMatrix4(object.matrixWorld);sole=Math.min(sole,point.y-person.floor);}
   assert.ok(sole>-.008&&sole<.018,`${asset.id}: ${seated?'seated':'standing'} sole ${sole} must contact its row`);
   if(seated){
    const hip=character.mesh.getObjectByName('pelvis').getWorldPosition(point).y;
    assert.ok(Math.abs(hip-person.floor-seatHeight-asset.seatHipOffset*height)<.00001,'human stature must not move the pelvis away from the fixed chair top');
   }
  }
  character.dispose();
 }
});

test('asset library deduplicates loads, caps decodes and disposes late responses without reviving a race',async()=>{
 const pending=[],loaded=[];let active=0,max=0;
 const library=createSpectatorLibrary({enabled:true,load:url=>new Promise(resolve=>{active++;max=Math.max(max,active);pending.push(()=>{active--;const scene=new THREE.Group();const geometry=new THREE.BoxGeometry();const material=new THREE.MeshStandardMaterial();scene.add(new THREE.Mesh(geometry,material));let disposed=0;geometry.addEventListener('dispose',()=>disposed++);loaded.push(()=>disposed);resolve({scene});});})});
 const requests=Array.from({length:6},(_,i)=>library.get(i));assert.equal(library.get(0),requests[0]);await new Promise(resolve=>setImmediate(resolve));assert.equal(pending.length,2);assert.equal(max,2);
 pending.shift()();await new Promise(resolve=>setImmediate(resolve));assert.equal(library.status.loaded,1);assert.equal(pending.length,2);
 library.dispose();library.dispose();for(const resolve of pending.splice(0))resolve();await Promise.all(requests);
 assert.ok(loaded.every(count=>count()===1));assert.equal(library.status.disposed,true);
});

test('fallback keeps working on failure and late readiness preserves the last pose and pause',async()=>{
 const p=spectatorProfile(4,0,2,.2,true,()=>.5);p.gesture=3;const pose=spectatorPose(p,1,.8);
 const failed=createNearSpectator(p,{library:{get:()=>Promise.resolve(null)}});failed.update(p,pose);assert.equal(await failed.ready,false);assert.equal(failed.kind,'fallback');failed.dispose();
 let finish;const character=createNearSpectator(p,{library:{get:()=>new Promise(resolve=>finish=resolve)}});character.update(p,pose);character.mesh.visible=false;finish(sources[0]);assert.equal(await character.ready,true);assert.equal(character.kind,'textured');assert.equal(character.mesh.visible,false);
 const imported=character.mesh.getObjectByName('textured-spectator');assert.equal(imported.position.x,p.x);assert.equal(imported.position.z,p.z);const matrices=[];imported.traverse(o=>{if(o.isBone)matrices.push(o.matrixWorld.toArray());});await Promise.resolve();const after=[];imported.traverse(o=>{if(o.isBone)after.push(o.matrixWorld.toArray());});assert.deepEqual(matrices,after);character.dispose();
});

test('stalled downloads time out, release both slots and settle when the race is disposed',async()=>{
 const signals=[];const library=createSpectatorLibrary({enabled:true,timeoutMs:8,load:(_url,{signal})=>{signals.push(signal);return new Promise(()=>{});}});
 const first=library.get(0),second=library.get(1),queued=library.get(2);
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(await first,null);assert.equal(await second,null);assert.ok(signals.length===3,'timed-out slots must let the next asset start');assert.ok(signals[0].aborted&&signals[1].aborted);
 library.dispose();assert.equal(await queued,null);assert.equal(library.status.active,0);assert.equal(library.status.requested,0);assert.ok(signals.every(signal=>signal.aborted));
});

test('real asset pool remains bounded with near/far culling, pause, reduced motion and repeated teardown',async()=>{
 const library=createSpectatorLibrary({enabled:true,load:async url=>({scene:cloneSkeleton(sources[SPECTATOR_ASSETS.findIndex(asset=>url.includes(asset.id))])})});
 const crowd=createCrowd({low:true,spectatorLibrary:library}),scene=new THREE.Scene();
 for(let i=0;i<40;i++)crowd.add(i%8,0,Math.floor(i/8),0,i%3===0,()=>.5);
 crowd.render(scene);crowd.update(.1,{x:0,z:0,speed:25});await new Promise(resolve=>setTimeout(resolve,30));crowd.update(.2,{x:0,z:0,speed:25});
 assert.equal(scene.userData.crowd.characterLimit,6);assert.equal(scene.userData.crowd.activeCharacters,6);assert.equal(scene.userData.crowd.texturedCharacters,6);assert.equal(scene.children.filter(o=>o.name==='near-spectator').length,6);assert.ok(scene.userData.crowd.drawCalls<=34);
 crowd.update(.4,{x:1000,z:1000,speed:25});assert.equal(scene.userData.crowd.activeCharacters,0);assert.ok(scene.children.filter(o=>o.isInstancedMesh).every(o=>o.count===0));
 crowd.update(.6,{x:0,z:0,speed:25},{reducedMotion:true});const counts=scene.userData.crowd.activeCharacters;crowd.update(.8,{x:1000,z:1000,speed:25},{paused:true});assert.equal(scene.userData.crowd.activeCharacters,counts);
 crowd.dispose();crowd.dispose();assert.equal(scene.children.length,0);
});
