import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {createSpectatorLibrary,createTexturedSpectator,SPECTATOR_ASSETS} from '../src/realistic-spectator.js';
import {createCrowd,spectatorProfile,spectatorPose} from '../src/crowd.js';
import {spectatorClothTint} from '../src/spectator-clothing.js';
import {CROWD_MOTION,MEDIUM_CROWD_BUDGET,FAR_CROWD_BUDGET,createMediumVariant,createMediumCrowd,crowdMotionFrame} from '../src/medium-spectator.js';
import {SPECTATOR_ASSET_VERSION} from '../src/spectator-motion-config.js';

const fixtures=[];
for(const asset of SPECTATOR_ASSETS){
 const roots=[];
 for(const suffix of ['', '-crowd','-far']){
  const bytes=await readFile(new URL(`../public/assets/crowd/${asset.id}${suffix}.glb`,import.meta.url));
  const loader=new GLTFLoader();loader.register(()=>({name:'test-images',loadTexture:()=>Promise.resolve(new THREE.Texture())}));
  roots.push((await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
 }
 const bytes=await readFile(new URL(`../public/assets/crowd/${asset.id}-motion.bin`,import.meta.url));
 fixtures.push({source:roots[0],geometry:roots[1],farGeometry:roots[2],palette:new Uint16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))});
}

test('six reduced human meshes share original images and have bounded geometry and finite animation',async()=>{
 for(const [i,fixture] of fixtures.entries()){
  const filename=new URL(`../public/assets/crowd/${SPECTATOR_ASSETS[i].id}-crowd.glb`,import.meta.url),bytes=await readFile(filename);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.ok(!json.images&&!json.textures,'no duplicate wardrobe texture downloads');
  assert.ok((await stat(filename)).size<MEDIUM_CROWD_BUDGET.maxGeometryBytes);
  const variant=createMediumVariant(fixture.source,fixture.geometry,fixture.palette);
  assert.ok(variant.meshes.reduce((n,mesh)=>n+mesh.geometry.index.count/3,0)<=MEDIUM_CROWD_BUDGET.maxTriangles);
  assert.ok(variant.meshes.length<=3);assert.ok(variant.meshes.every(mesh=>mesh.material.map),'every reduced primitive reuses its original texture');
  assert.ok(variant.meshes.every(mesh=>Object.values(mesh.geometry.attributes).every(attribute=>attribute.array.every(Number.isFinite))));
  for(const mesh of variant.meshes){
   const {position,crowdGarment}=mesh.geometry.attributes;
   assert.ok(crowdGarment.array.every(value=>value>=0&&value<=1));
   if(mesh.material.name==='Skin_and_cloth_atlas'){
    assert.ok(crowdGarment.array.some(value=>value>.5),'the fabric mask contains real garment vertices');
    for(let v=0;v<position.count;v++)if(position.getY(v)>1.45)assert.equal(crowdGarment.getX(v),0,'face and eyes retain their original skin/eye colours');
   }else assert.ok(crowdGarment.array.every(value=>value===0),'hair and eyebrows cannot be recoloured by the fabric tint');
  }
  const floats=Float32Array.from(fixture.palette,THREE.DataUtils.fromHalfFloat);assert.ok(floats.every(Number.isFinite));
  const stride=CROWD_MOTION.bones*CROWD_MOTION.matrixElements;
  for(let clip=0;clip<CROWD_MOTION.clips;clip++){
   const first=clip*CROWD_MOTION.frames*stride,last=first+(CROWD_MOTION.frames-1)*stride;
   assert.deepEqual(floats.slice(first,first+stride),floats.slice(last,last+stride),'the animation loop closes without a jump');
  }
  variant.dispose();
 }
});

test('the actual half-float GPU skinning data keeps every gesture seated or standing with intact human bounds',()=>{
 const bone=new THREE.Matrix4(),point=new THREE.Vector3(),weighted=new THREE.Vector3(),input=new THREE.Vector3();
 for(const fixture of fixtures){
  const floats=Float32Array.from(fixture.palette,THREE.DataUtils.fromHalfFloat);
  for(const geometry of [fixture.geometry,fixture.farGeometry])for(let row=0;row<CROWD_MOTION.frames*CROWD_MOTION.clips;row+=3){
   const bounds=new THREE.Box3();geometry.traverse(object=>{if(!object.isSkinnedMesh)return;
    const attributes=object.geometry.attributes;
    for(let index=0;index<attributes.position.count;index+=7){
     input.fromBufferAttribute(attributes.position,index).applyMatrix4(object.bindMatrix);weighted.set(0,0,0);
     for(let influence=0;influence<4;influence++){
      const joint=attributes.skinIndex.array[index*4+influence],weight=attributes.skinWeight.array[index*4+influence];
      const offset=(row*CROWD_MOTION.bones+joint)*CROWD_MOTION.matrixElements;bone.set(...floats.subarray(offset,offset+12),0,0,0,1);point.copy(input).applyMatrix4(bone);weighted.addScaledVector(point,weight);
     }
     weighted.applyMatrix4(object.bindMatrixInverse);bounds.expandByPoint(weighted);
    }
   });
   const size=bounds.getSize(new THREE.Vector3());assert.ok(size.y>1&&size.y<2.3);assert.ok(size.x<1.5&&size.z<1.3);assert.ok(bounds.min.y>-.13);
  }
 }
});

test('far humans retain continuous source geometry and share one compact palette with the middle tier',async()=>{
 for(const [index,fixture] of fixtures.entries()){
  const filename=new URL(`../public/assets/crowd/${SPECTATOR_ASSETS[index].id}-far.glb`,import.meta.url),bytes=await readFile(filename);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));assert.ok(!json.images&&!json.textures);assert.ok(bytes.length<FAR_CROWD_BUDGET.maxGeometryBytes);
  const medium=createMediumVariant(fixture.source,fixture.geometry,fixture.palette),far=createMediumVariant(fixture.source,fixture.farGeometry,fixture.palette,{capacity:FAR_CROWD_BUDGET.mobile,tier:'far',sharedTexture:medium.texture});
  assert.equal(far.texture,medium.texture);assert.equal(far.texture.image.width,53*3);assert.equal(far.texture.image.height,24*16);
  const triangles=far.meshes.reduce((n,mesh)=>n+mesh.geometry.index.count/3,0);assert.ok(triangles>650&&triangles<=FAR_CROWD_BUDGET.maxTriangles);
  assert.ok(far.meshes.length<=3&&far.meshes.every(mesh=>mesh.geometry.attributes.uv&&mesh.material.map));
  let releases=0;medium.texture.addEventListener('dispose',()=>releases++);far.dispose();assert.equal(releases,0,'a far representation must not release the shared motion texture');medium.dispose();assert.equal(releases,1);
 }
});

test('every wardrobe uses the same eight fabric tints across near, middle and far without extra draws or images',()=>{
 for(const fixture of fixtures){
  const near=createTexturedSpectator(fixture.source),middle=createMediumVariant(fixture.source,fixture.geometry,fixture.palette,{capacity:1});
  const far=createMediumVariant(fixture.source,fixture.farGeometry,fixture.palette,{capacity:1,tier:'far',sharedTexture:middle.texture});
  let body;near.mesh.traverse(object=>{if(object.isSkinnedMesh&&object.geometry.attributes._crowd_garment)body=object;});assert.ok(body);
  const shader={uniforms:{},vertexShader:'#include <color_vertex>',fragmentShader:'#include <color_fragment>'};body.material.onBeforeCompile(shader);
  for(let tintIndex=0;tintIndex<8;tintIndex++){
   const person={...spectatorProfile(0,0,0,0,false,()=>.5),phase:(tintIndex+.25)/11.37,gesture:5};
   near.update(person,spectatorPose(person,1,.5));middle.update([person],1);far.update([person],1);
   const expected=spectatorClothTint(person.phase).toArray();assert.deepEqual(shader.uniforms.spectatorClothTint.value.toArray(),expected);
   for(const variant of [middle,far])for(const mesh of variant.meshes){const actual=new THREE.Color();mesh.getColorAt(0,actual);assert.ok(actual.toArray().every((value,channel)=>Math.abs(value-expected[channel])<3e-8));}
  }
  assert.equal(near.drawCalls,3);assert.equal(middle.meshes.length,3);assert.equal(far.meshes.length,3);assert.equal(middle.texture,far.texture);
  far.dispose();middle.dispose();near.dispose();
 }
});

test('the actual exposed wine neckline keeps its skin color in both distance meshes with all non-mask bytes preserved',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/assets/crowd/SOURCES.json',import.meta.url),'utf8'));
 const exclusions=JSON.parse(await readFile(new URL('../scripts/spectator-skin-exclusions.json',import.meta.url),'utf8'));
 const skinProbes=JSON.parse(await readFile(new URL('./fixtures/spectator-skin-probes.json',import.meta.url),'utf8'));
 const headNeck=new Set(skinProbes.assets['spectator-wine-blouse'].headNeck),fixture=fixtures[SPECTATOR_ASSETS.findIndex(asset=>asset.id==='spectator-wine-blouse')];
 for(const [suffix,geometry,count] of [['-crowd',fixture.geometry,12],['-far',fixture.farGeometry,7]]){
  const filename='spectator-wine-blouse'+suffix+'.glb',record=manifest.garmentMask.distanceNecklineCorrections.find(item=>item.file===filename);
  assert.equal(record.changedVertices,count);
  const bytes=await readFile(new URL('../public/assets/crowd/'+filename,import.meta.url)),restored=Buffer.from(bytes);
  for(const value of record.originalMaskValues){assert.equal(bytes.readFloatLE(value.byteOffset),0);Buffer.from(value.originalHex,'hex').copy(restored,value.byteOffset);}
  assert.equal(createHash('sha256').update(restored).digest('hex'),record.sourceSha256,'restoring only the named mask scalars reproduces every original GLB byte');
  let body;geometry.traverse(object=>{if(object.geometry?.attributes._crowd_garment)body=object;});assert.ok(body);
  for(const probe of exclusions.files[filename].sourceUvProbes){
   assert.ok(probe.nearTriangleVertexIndices.every(vertex=>headNeck.has(vertex)),'each reduced skin probe maps to the original head/neck surface');
   assert.ok(probe.uvDistance<.001&&probe.otherComponentUvDistance>.012&&probe.restPositionToTriangleCentroidMetres<.05);
   const actual=new THREE.Vector3().fromBufferAttribute(body.geometry.attributes.position,probe.vertexIndex);
   assert.ok(actual.distanceTo(new THREE.Vector3(...probe.position))<1e-7,'this is the measured exposed skin vertex, not merely a bone-name test');
   assert.equal(body.geometry.attributes._crowd_garment.getX(probe.vertexIndex),0);
  }
 }
});

test('instanced motion is independent per person and stays in the correct seated gesture clip',()=>{
 const person={...spectatorProfile(0,0,0,0,true,()=>.5),gesture:4,crowdCheerStartedAt:0};
 const first=(CROWD_MOTION.gestures+person.gesture)*CROWD_MOTION.frames,last=first+CROWD_MOTION.frames;
 for(const time of [0,.1,2,2000]){const frame=crowdMotionFrame(person,time);assert.ok(frame[0]>=first&&frame[1]<last&&frame[2]>=0&&frame[2]<=1);}
 assert.notDeepEqual(crowdMotionFrame(person,2),crowdMotionFrame({...person,phase:.2,tempo:.8},2));
 const fixture=fixtures[0],variant=createMediumVariant(fixture.source,fixture.geometry,fixture.palette,{capacity:3});
 variant.update(Array.from({length:9},(_,i)=>({...person,x:i})),2);assert.ok(variant.meshes.every(mesh=>mesh.count===3),'capacity cannot grow');
 const tracked=[variant.texture,...variant.meshes.flatMap(mesh=>[mesh.geometry,mesh.material])],counts=new Map(tracked.map(item=>[item,0]));for(const item of tracked)item.addEventListener('dispose',()=>counts.set(item,counts.get(item)+1));
 variant.dispose();variant.dispose();assert.ok([...counts.values()].every(count=>count===1));
});

test('car-triggered cheers finish their original recovery and retain the same pose across distance tiers',()=>{
 const fixture=fixtures[0],middle=createMediumVariant(fixture.source,fixture.geometry,fixture.palette,{capacity:2});
 const far=createMediumVariant(fixture.source,fixture.farGeometry,fixture.palette,{capacity:2,tier:'far',sharedTexture:middle.texture});
 const person={...spectatorProfile(0,0,0,0,true,()=>.5),gesture:0,tempo:1,reaction:0,reactionEligible:true};
 const frame=variant=>Array.from(variant.meshes[0].geometry.attributes.crowdFrames.array.slice(0,4));
 middle.update([person],0);const quiet=frame(middle);middle.update([person],3);assert.deepEqual(frame(middle),quiet,'an absent car cannot start cheering');
 person.reaction=1;middle.update([person],4);assert.equal(person.crowdCheerStartedAt,4);assert.deepEqual(frame(middle),quiet,'a reaction starts at the same quiet seam');
 middle.update([person],4.8);assert.notDeepEqual(frame(middle),quiet,'the passing car produces actual animated frames');
 for(const time of [5,5.3,6,7,8.2,9.2]){
  person.reaction=0;middle.update([person],time);const current=frame(middle);far.update([person],time);
  assert.deepEqual(frame(far),current,'middle and far cannot pop to different poses at their boundary');
  const first=CROWD_MOTION.gestures*CROWD_MOTION.frames;
  assert.ok(current[0]>=first&&current[1]<first+CROWD_MOTION.frames,'only adjacent keys within the original gesture are used');
  assert.equal(person.crowdCheerStartedAt,4,'decay must never cut off a partly raised arm');
 }
 middle.update([person],9.5);assert.equal(person.crowdCheerStartedAt,null);assert.deepEqual(frame(middle),quiet,'full recovery returns to the exact original seam');
 person.reaction=1;middle.update([person],10);middle.update([person],15.5);assert.equal(person.crowdCheerStartedAt,15.5,'a nearby moving car can trigger a new complete cycle');
 const before=frame(middle);middle.dispose();middle.update([person],20);assert.deepEqual(frame(middle),before,'disposed variants cannot update their buffers');far.dispose();
});

test('quiet activities keep their own timing and cheer responses use deterministic individual thresholds',()=>{
 const fixture=fixtures[0],variant=createMediumVariant(fixture.source,fixture.geometry,fixture.palette,{capacity:2});
 for(const gesture of [3,5,6,7]){
  const person={...spectatorProfile(0,0,0,0,false,()=>.5),gesture,reaction:0};
  variant.update([person],1.7);const quiet=crowdMotionFrame(person,1.7);
  person.reaction=1;variant.update([person],1.7);assert.deepEqual(crowdMotionFrame(person,1.7),quiet,'filming, watching, folded hands and conversation remain independent of cheering');
  assert.notDeepEqual(crowdMotionFrame(person,2.7),quiet,'ordinary idle activities still move');
  assert.equal(person.crowdCheerStartedAt,undefined);
 }
 const fast={...spectatorProfile(0,0,0,0,false,()=>.5),gesture:2,phase:0,reaction:.22,reactionEligible:true};
 const slower={...fast,phase:Math.PI};variant.update([fast,slower],1);
 assert.equal(fast.crowdCheerStartedAt,1);assert.equal(slower.crowdCheerStartedAt,null,'the existing individual phase prevents every spectator responding together');
 slower.reaction=1;variant.update([fast,slower],1.3);assert.equal(slower.crowdCheerStartedAt,1.3);
 assert.notDeepEqual(crowdMotionFrame(fast,1.5),crowdMotionFrame(slower,1.5));variant.dispose();
});

test('every near, middle, far and motion request uses one coherent crowd release cache key',async t=>{
 const requests=[];
 const library=createSpectatorLibrary({enabled:true,load:async request=>{
  requests.push(request);const url=new URL(request,'https://crowd.test');
  const index=SPECTATOR_ASSETS.findIndex(asset=>url.pathname.includes(asset.id));assert.ok(index>=0);
  return {scene:cloneSkeleton(url.pathname.endsWith('-crowd.glb')?fixtures[index].geometry:url.pathname.endsWith('-far.glb')?fixtures[index].farGeometry:fixtures[index].source)};
 }});
 // Exercise the default palette fetch, rather than bypassing its URL with the
 // injected loadPalette used by animation-only tests.
 t.mock.method(globalThis,'fetch',async request=>{
  requests.push(request);const url=new URL(request,'https://crowd.test');
  const index=SPECTATOR_ASSETS.findIndex(asset=>url.pathname===`/assets/crowd/${asset.id}-motion.bin`);assert.ok(index>=0);
  return new Response(fixtures[index].palette.buffer.slice(0));
 });
 const crowd=createMediumCrowd({enabled:true,library});
 t.after(()=>{crowd.dispose();library.dispose();});
 crowd.render(new THREE.Scene());await crowd.ready;
 assert.ok(SPECTATOR_ASSETS.every((_,index)=>crowd.hasFar(index)),'all variants must finish without a swallowed load failure');
 const expected=SPECTATOR_ASSETS.flatMap(asset=>['.glb','-crowd.glb','-far.glb','-motion.bin'].map(suffix=>`/assets/crowd/${asset.id}${suffix}?v=${SPECTATOR_ASSET_VERSION}`));
 assert.deepEqual([...requests].sort(),expected.sort(),'every versioned file is requested exactly once');
 assert.match(SPECTATOR_ASSET_VERSION,/^[a-z0-9-]+$/);
 for(const request of requests)assert.deepEqual([...new URL(request,'https://crowd.test').searchParams],[['v',SPECTATOR_ASSET_VERSION]]);
});

test('near, textured middle and distant people are exclusive; pause, reduced motion and disposal remain bounded',async()=>{
 const library=createSpectatorLibrary({enabled:true,load:async url=>{const index=SPECTATOR_ASSETS.findIndex(asset=>url.includes(asset.id));return {scene:cloneSkeleton(url.includes('-crowd')?fixtures[index].geometry:url.includes('-far')?fixtures[index].farGeometry:fixtures[index].source)};}});
 const crowd=createCrowd({low:true,spectatorLibrary:library,mediumOptions:{enabled:true,loadPalette:async index=>fixtures[index].palette}}),scene=new THREE.Scene();
 const people=Array.from({length:90},(_,i)=>Object.assign(crowd.add((i%15)*.6,0,Math.floor(i/15)*.9,0,i%2===0,()=>.5),{gesture:0}));
 crowd.render(scene);await new Promise(resolve=>setTimeout(resolve,40));crowd.update(.1,{x:0,z:0,speed:20});
 const info=scene.userData.crowd;assert.equal(info.activeCharacters,6);assert.equal(info.mediumCharacters,48);assert.equal(info.farCharacters,36);assert.ok(info.mediumDrawCalls<=18);assert.ok(info.farDrawCalls<=18);assert.ok(info.drawCalls<=70);
 const heads=scene.children.find(mesh=>mesh.name==='race-spectators-heads');assert.equal(heads.count,0,'loaded crowds must not revert to disconnected primitive heads');assert.equal(info.activeCharacters+info.mediumCharacters+info.farCharacters,90);
 const meshes=scene.children.filter(mesh=>mesh.name==='race-spectators-textured-medium'||mesh.name==='race-spectators-textured-far');
 assert.ok(people.filter(person=>person.mediumCharacter||person.farCharacter).every(person=>person.crowdCheerStartedAt===.1),'the first visible reaction must reach both tiers in the same update');
 crowd.update(.2,{x:0,z:0,speed:20});
 const snapshots=()=>({frames:meshes.map(mesh=>Array.from(mesh.geometry.attributes.crowdFrames.array)),clocks:people.map(person=>person.crowdCheerStartedAt),reactions:people.map(person=>person.reaction)});
 const initial=snapshots();crowd.update(.3,{x:0,z:0,speed:20},{paused:true});assert.deepEqual(snapshots(),initial);
 crowd.update(.5,{x:0,z:0,speed:20},{reducedMotion:true});assert.deepEqual(snapshots(),initial);
 crowd.update(.7,{x:1000,z:0,speed:20});assert.equal(info.mediumCharacters,0);assert.equal(info.farCharacters,0);assert.ok(meshes.every(mesh=>mesh.count===0));
 crowd.dispose();crowd.dispose();assert.equal(scene.children.length,0);
});

test('a stale reaction cannot restart a far cheer after a stationary car leaves or a spectator re-enters the visible range',async()=>{
 const library=createSpectatorLibrary({enabled:true,load:async url=>{const index=SPECTATOR_ASSETS.findIndex(asset=>url.includes(asset.id));return {scene:cloneSkeleton(url.includes('-crowd')?fixtures[index].geometry:url.includes('-far')?fixtures[index].farGeometry:fixtures[index].source)};}});
 const crowd=createCrowd({spectatorLibrary:library,mediumOptions:{enabled:true,loadPalette:async index=>fixtures[index].palette}}),scene=new THREE.Scene();
 const people=Array.from({length:18},()=>Object.assign(crowd.add(0,0,0,0,false,()=>.5),{gesture:0}));crowd.render(scene);await new Promise(resolve=>setTimeout(resolve,40));
 crowd.update(.1,{x:0,z:0,speed:20});const person=people.find(value=>value.mediumCharacter);assert.ok(person);assert.equal(person.crowdCheerStartedAt,.1);assert.ok(person.reaction>.27);
 // This is still within the desktop far tier, but outside the old110m pose
 // update limit. Its stored response remains high; eligibility must be fresh.
 for(let tick=2;tick<=80;tick++)crowd.update(tick*.1,{x:120,z:0,speed:0});
 assert.equal(person.farCharacter,true);assert.equal(person.reactionEligible,false);assert.equal(person.crowdCheerStartedAt,null);
 crowd.update(8.1,{x:500,z:0,speed:0});assert.equal(person.inRange,false);
 crowd.update(8.2,{x:120,z:0,speed:0});assert.equal(person.farCharacter,true);assert.equal(person.crowdCheerStartedAt,null,'reselected people cannot restart from stale response');
 crowd.dispose();
});

test('a failed or late medium request never hides the fallback or revives disposed geometry',async()=>{
 const scene=new THREE.Scene();const failed=createMediumCrowd({enabled:true,library:{get:async()=>fixtures[0].source,getMedium:async()=>null}});failed.render(scene);await failed.ready;assert.equal(failed.select([{inRange:true,viewDistance:2,lookVariant:0}]).length,0);failed.dispose();
 let finish;const late=createMediumCrowd({enabled:true,library:{get:async()=>fixtures[0].source,getMedium:async()=>fixtures[0].geometry},loadPalette:()=>new Promise(resolve=>finish=resolve)});late.render(scene);await new Promise(resolve=>setImmediate(resolve));late.dispose();finish(fixtures[0].palette);await late.ready;assert.equal(scene.children.length,0);
});

test('dense crowds obey the far-person cap without exposing primitive bodies after assets are ready',async()=>{
 const library=createSpectatorLibrary({enabled:true,load:async url=>{const index=SPECTATOR_ASSETS.findIndex(asset=>url.includes(asset.id));return {scene:cloneSkeleton(url.includes('-crowd')?fixtures[index].geometry:url.includes('-far')?fixtures[index].farGeometry:fixtures[index].source)};}});
 const crowd=createCrowd({low:true,spectatorLibrary:library,mediumOptions:{enabled:true,loadPalette:async index=>fixtures[index].palette}}),scene=new THREE.Scene();
 for(let i=0;i<300;i++)crowd.add((i%30)*.5,0,Math.floor(i/30)*.8,0,i%2===0,()=>.5);
 crowd.render(scene);await new Promise(resolve=>setTimeout(resolve,40));crowd.update(.1,{x:0,z:0,speed:20});
 const info=scene.userData.crowd;assert.equal(info.activeCharacters,6);assert.equal(info.mediumCharacters,48);assert.equal(info.farCharacters,112);assert.equal(info.visiblePeople,166);assert.equal(info.suppressedPeople,134);
 assert.ok(scene.children.filter(mesh=>mesh.isInstancedMesh&&!mesh.name.includes('textured')).every(mesh=>mesh.count===0));
 const far=scene.children.filter(mesh=>mesh.name==='race-spectators-textured-far');const triangles=far.reduce((n,mesh)=>n+mesh.count*mesh.geometry.index.count/3,0);assert.ok(triangles<=FAR_CROWD_BUDGET.mobile*FAR_CROWD_BUDGET.maxTriangles);
 crowd.dispose();assert.equal(scene.children.length,0);
});

test('baked middle/far shoe vertices remain grounded at both stature and chair heights',()=>{
 const bone=new THREE.Matrix4(),point=new THREE.Vector3(),weighted=new THREE.Vector3(),input=new THREE.Vector3(),placement=new THREE.Matrix4();
 for(const [index,fixture] of fixtures.entries())for(const [tier,geometry] of [['medium',fixture.geometry],['far',fixture.farGeometry]]){
  const variant=createMediumVariant(fixture.source,geometry,fixture.palette,{capacity:1,tier}),floats=Float32Array.from(fixture.palette,THREE.DataUtils.fromHalfFloat);
  let skeleton;geometry.traverse(object=>{if(object.isSkinnedMesh)skeleton=object.skeleton;});
  const shoeVertices=variant.meshes.map(mesh=>{
   const {position,crowdJoints,crowdWeights}=mesh.geometry.attributes,vertices=[];
   for(let vertex=0;vertex<position.count;vertex++){
    let weight=0;
    for(let slot=0;slot<4;slot++)if(/^(foot|ball)_[lr]$/.test(skeleton.bones[crowdJoints.array[vertex*4+slot]].name))weight+=crowdWeights.array[vertex*4+slot];
    if(weight>.75)vertices.push(vertex);
   }
   return vertices;
  });
  assert.ok(shoeVertices.flat().length>8,'the low-detail mesh retains actual shoe support vertices');
  for(const height of [.91,1.08])for(const seated of [false,true])for(const seatHeight of [.39,.455])for(const gesture of [0,5])for(const playing of (gesture===0?[false,true]:[false]))for(const time of [.1,2.7]){
   const person={...spectatorProfile(3,2.3,-8,.7,seated,()=>.5),...SPECTATOR_ASSETS[index],height,width:1,seatHeight,gesture,reaction:playing?1:0,crowdCheerStartedAt:playing?0:null};
   variant.update([person],time);let sole=Infinity;
   for(const [part,mesh] of variant.meshes.entries()){
    const {position,crowdJoints,crowdWeights,crowdFrames}=mesh.geometry.attributes,frames=crowdFrames.array;mesh.getMatrixAt(0,placement);
    for(const vertex of shoeVertices[part]){
     input.fromBufferAttribute(position,vertex);weighted.set(0,0,0);
     for(let influence=0;influence<4;influence++)for(let endpoint=0;endpoint<2;endpoint++){
      const joint=crowdJoints.array[vertex*4+influence],weight=crowdWeights.array[vertex*4+influence]*(endpoint?frames[2]:1-frames[2]);
      const offset=(frames[endpoint]*CROWD_MOTION.bones+joint)*CROWD_MOTION.matrixElements;bone.set(...floats.subarray(offset,offset+12),0,0,0,1);
      point.copy(input).applyMatrix4(bone);weighted.addScaledVector(point,weight);
     }
     weighted.y+=frames[3]*THREE.MathUtils.smoothstep(weighted.y,.09,.42);
     weighted.applyMatrix4(placement);sole=Math.min(sole,weighted.y-person.floor);
    }
   }
   // The 770-triangle far mesh shares the middle palette; decimation can move
   // its shoe edge by up to 18mm. Keep that bounded without adding a second
   // motion texture, while requiring tighter contact for the middle mesh.
   const tolerance=tier==='far'?.025:.008;
   assert.ok(Math.abs(sole)<tolerance,`${SPECTATOR_ASSETS[index].id} ${tier} ${seated?'seated':'standing'} sole ${sole} must contact the floor`);
  }
  variant.dispose();
 }
});
