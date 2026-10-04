import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {erodedMountainGeometry} from '../src/terrain-landscape.js';
import {getTrack,projectOnTrack} from '../src/track.js';
import {createMountainVenue} from '../src/mountain-venue.js';

test('the eroded Fuji landform has one connected finite surface, drainage relief and a remote safe footprint',()=>{
 const track=getTrack('fuji-skyline');
 for(const low of [true,false]){
  const g=erodedMountainGeometry({low}),p=g.attributes.position,n=g.attributes.normal,{sectors,rings}=g.userData;
  assert.equal(p.count,1+sectors*rings);assert.equal(g.index.count/3,sectors*(2*rings-1));assert.ok(g.index.count/3<=(low?2000:4600));
  for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
  for(let i=0;i<p.count;i++){assert.ok(projectOnTrack(p.getX(i),p.getZ(i),undefined,track).distance>130);assert.ok(n.getY(i)>0);assert.ok(p.getY(i)<311);}
  const mid=1+(rings/2-1)*sectors,heights=Array.from({length:sectors},(_,j)=>p.getY(mid+j));assert.ok(Math.max(...heights)-Math.min(...heights)>20,'actual drainage relief breaks rotational cone symmetry');
  for(let i=1+(rings-1)*sectors;i<p.count;i++)assert.ok(Math.abs(p.getY(i)+.38)<1e-5,'the foot of the mountain is buried in the ground');
  const scene=new THREE.Scene(),group=createMountainVenue(scene,track,{low});let triangles=0;group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  assert.ok(group.userData.drawBatches<=(low?20:28));assert.ok(triangles<=(low?16000:32000));
 }
});

test('Norwegian glacial ranges leave every road segment clear and stay within mobile budgets',async()=>{
 const {fjordMassifGeometry}=await import('../src/terrain-landscape.js'),track=getTrack('norway-fjord');
 for(const low of [true,false]){
  const g=fjordMassifGeometry({low}),p=g.attributes.position,n=g.attributes.normal,index=g.index;
  assert.ok(index.count/3<=(low?6500:14500));
  for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite));
  let minHeight=Infinity,maxHeight=-Infinity;
  for(let i=0;i<p.count;i++){
   assert.ok(projectOnTrack(p.getX(i),p.getZ(i),undefined,track).distance>75,'mountains remain outside the full road and recovery envelope');
   assert.ok(n.getY(i)>0,'all visible faces point outward/upward');
   minHeight=Math.min(minHeight,p.getY(i));maxHeight=Math.max(maxHeight,p.getY(i));
  }
  assert.ok(minHeight<0&&maxHeight>200&&maxHeight<280,'buried foundations and bounded relief');
  const verticesPerRange=p.count/2;
  for(let i=0;i<index.count;i+=3){
   const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
   assert.ok(ids.every(v=>v<verticesPerRange)||ids.every(v=>v>=verticesPerRange),'no triangles bridge across the driveable valley');
   const x=ids.reduce((s,v)=>s+p.getX(v),0)/3,z=ids.reduce((s,v)=>s+p.getZ(v),0)/3;
   assert.ok(projectOnTrack(x,z,undefined,track).distance>75);
  }
  const group=createMountainVenue(new THREE.Scene(),track,{low});let triangles=0;
  group.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  assert.ok(group.userData.drawBatches<=20);assert.ok(triangles<(low?16000:32000));
 }
});

test('shallow fjord foothills retain noncollapsed rock coordinates in the actual material batch',()=>{
 const track=getTrack('norway-fjord'),rockColor=new THREE.Texture();
 for(const low of [true,false]){
  const group=createMountainVenue(new THREE.Scene(),track,{low,surfaces:{rockColor}});
  const batches=[];group.traverse(object=>{if(object.isMesh&&object.material.map===rockColor)batches.push(object);});
  assert.equal(batches.length,1,'the full range must keep one existing rock-material draw');
  const geometry=batches[0].geometry,p=geometry.attributes.position,uv=geometry.attributes.uv;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  assert.equal(uv.count,p.count);
  for(let i=0;i<p.count;i+=3){
   a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);
   const surfaceArea=b.cross(c).length();
   const textureArea=Math.abs((uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getY(i+1)-uv.getY(i))*(uv.getX(i+2)-uv.getX(i)));
   const density=textureArea*20*20/surfaceArea;
   // Previous Z/Y mapping had zero-area triangles reaching over 33 m high.
   // Check the shipped geometry after venue batching, not only authoring UVs.
   assert.ok(Number.isFinite(density)&&density>.20&&density<1.001,`triangle ${i/3} has collapsed or excessively stretched rock coordinates: ${density}`);
  }
 }
 rockColor.dispose();
});
