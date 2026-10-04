import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTrack, projectOnTrack } from './track.js';
import { getTrackObstacles } from './track-obstacles.js';
import {coastalGroundingLayout} from './coastal-foundations.js';
import {coastalDistrictHeight} from './venue-groundworks.js';
import {setWorldSurfaceUV} from './track-surface-materials.js';
import {erodedMountainGeometry,fjordMassifGeometry} from './terrain-landscape.js';
import {createWaterSurfaceMaterial} from './water-surface.js';

export const DESTINATION_PROFILES = Object.freeze({
  'fuji-skyline': {background:'#8daebf',fog:'#aebdc0',fogDensity:.00065,sky:'#d6e7ef',sun:'#fff1d9',sunlight:1.5,ground:'#546749',vegetation:'woodland',towers:0},
  'singapore-afterdark': {background:'#111c35',fog:'#1d3049',fogDensity:.001,sky:'#789dbc',sun:'#a5b6d2',sunlight:.75,ground:'#283c40',vegetation:'street-trees',towers:55},
  'norway-fjord': {background:'#7895a4',fog:'#9daeb2',fogDensity:.00085,sky:'#d0e2e9',sun:'#e4e5d5',sunlight:1.15,ground:'#435647',vegetation:'conifers',towers:0},
  'san-francisco-hills': {background:'#62778e',fog:'#a9aaad',fogDensity:.00075,sky:'#b8cee4',sun:'#ffcca2',sunlight:1.5,ground:'#576459',vegetation:'street-trees',towers:0},
});

export function destinationHouseLayout(track,{landmarks=[]}={}){
 const houses=[];if(track.id!=='san-francisco-hills')return houses;
 for(let i=0;i<22;i++){const p=sampleTrack(track.length*(.2+i*.015),track),side=i%2?1:-1;if(p.s/track.length>.245&&p.s/track.length<.325)continue;
  const x=p.x+p.nx*side*25,z=p.z+p.nz*side*25;if(projectOnTrack(x,z,0,track).distance<track.width/2+10||landmarks.some(site=>Math.hypot(x-site.x,z-site.z)<site.radius+10))continue;
  houses.push({i,p,side,x,z,radius:11});
 }return houses;
}

/** Original mesh scenery, including load-bearing viaduct piers and real ramps. */
export function createMountainVenue(scene, track, {low=false,landmarks=[],surfaces,groundHeight,waterMaterial}={}) {
  if (!track.elevationProfile) return;
  const group=new THREE.Group();group.name=`destination-${track.id}`;scene.add(group);
  const concrete=new THREE.MeshStandardMaterial({color:'#8f9690',roughness:.85,map:surfaces?.concreteColor||null,normalMap:surfaces?.concreteNormal||null,normalScale:new THREE.Vector2(.18,.18)});
  const stone=new THREE.MeshStandardMaterial({color:'#596967',roughness:1});
  const mesh=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  for(let s=0;s<track.length;s+=24){const p=sampleTrack(s,track);if(p.y<2)continue;
    for(const side of [-1,1]){
      const x=p.x+p.nx*side*(track.width/2-2),z=p.z+p.nz*side*(track.width/2-2);
      // A support must not sit in the lower road under a bridge crossing.
      const lower=projectOnTrack(x,z,0,track,0);
      if(lower.y<p.y-2&&lower.distance<track.width/2+2)continue;
      mesh(new THREE.CylinderGeometry(.9,1.3,p.y-.5,8),concrete,x,(p.y-.5)/2,z);
    }
    const beam=mesh(new THREE.BoxGeometry(track.width+2,.9,2.4),concrete,p.x,p.y-.6,p.z);beam.rotation.y=Math.atan2(p.tx,p.tz);
  }
  // Raised road follows hillside embankments except at the authored bridge
  // sectors. Keep a conservative footprint clear of every other road segment.
  const hills = track.id==='fuji-skyline'?[[.16,.32],[.61,.85]]:track.id==='norway-fjord'?[[.16,.25],[.50,.68]]:track.id==='san-francisco-hills'?[]:[];
  const bankPositions=[];
  for(const [from,to] of hills)for(let d=track.length*from;d<track.length*to;d+=9){
    const a=sampleTrack(d,track),b=sampleTrack(d+9,track);
    for(const side of [-1,1]){
      const points=[a,b].flatMap(p=>[track.width/2+1,track.width/2+18].map((offset,index)=>({x:p.x+p.nx*side*offset,y:index?-.1:p.y-.18,z:p.z+p.nz*side*offset})));
      if(points.some((p,i)=>i%2&&projectOnTrack(p.x,p.z,0,track).distance<track.width/2+10))continue;
      for(const index of [0,1,2,2,1,3]){const p=points[index];bankPositions.push(p.x,p.y,p.z);}
    }
  }
  if(bankPositions.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(bankPositions,3));g.computeVertexNormals();setWorldSurfaceUV(g,90);const bank=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:track.id==='san-francisco-hills'?'#a3a699':'#9aab89',roughness:1,map:surfaces?.terrainColor||null,side:THREE.DoubleSide}));bank.receiveShadow=true;group.add(bank);}
  // One eroded surface joins the summit, snow line and foothills. The old close
  // cone produced a blank triangular wall against the photographic background.
  if(track.id==='fuji-skyline') {
  const mountain=mesh(erodedMountainGeometry({low}),new THREE.MeshStandardMaterial({color:'white',vertexColors:true,map:surfaces?.terrainColor||null,roughness:1}),0,0,0);
  mountain.name='eroded-volcanic-landform';
  // Roadside trees are supplied by the grounded shared scan tiers in world.
  }
  const steel=new THREE.MeshStandardMaterial({color:'#34455b',metalness:.72,roughness:.33});
  const gold=new THREE.MeshStandardMaterial({color:'#fff71e',metalness:.3,roughness:.35});
  const windowMat=new THREE.MeshStandardMaterial({color:'#19334b',metalness:.65,roughness:.2,emissive:'#265a86',emissiveIntensity:.3});
  const red=new THREE.MeshStandardMaterial({color:'#a54837',metalness:.45,roughness:.48});
  if(track.id==='singapore-afterdark'){
    // Original staggered glass towers and a curved lantern-crown establish a
    // marina silhouette, with setbacks, angled fins and a supported sky lens.
    for(const [i,x] of [-70,0,70].entries()) {
      const height=[112,129,118][i],base=new THREE.CylinderGeometry(15,21,height,6,1,false);base.scale(1,1,1.14);base.rotateY(Math.PI/6);
      const tower=mesh(base,windowMat,x,height/2,-360);tower.rotation.z=(i-1)*-.025;
      for(let y=12;y<height;y+=12){const ratio=1-y/height*.28;const ledge=mesh(new THREE.CylinderGeometry(21*ratio,21*ratio,.55,6),steel,x,y,-360);ledge.scale.z=1.14;ledge.rotation.y=Math.PI/6;}
      for(const side of [-1,1]){const fin=mesh(new THREE.BoxGeometry(.8,height,2),steel,x+side*14,height/2,-378);fin.rotation.z=(i-1)*-.025;}
      mesh(new THREE.BoxGeometry(4,133-height,6),steel,x,(133+height)/2,-360);
    }
    const lens=new THREE.Shape();lens.moveTo(-108,0);lens.bezierCurveTo(-50,-34,55,-34,108,0);lens.bezierCurveTo(56,22,-57,22,-108,0);
    const lensGeo=new THREE.ExtrudeGeometry(lens,{depth:3.2,bevelEnabled:true,bevelThickness:.65,bevelSize:.8,bevelSegments:1,curveSegments:low?10:18});lensGeo.rotateX(-Math.PI/2);mesh(lensGeo,steel,0,131,-360);
    const crown=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;crown.push(new THREE.Vector3(Math.cos(a)*100,135+Math.sin(a)*.5,-360+Math.sin(a)*24));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crown),low?48:72,.55,5,false),gold,0,0,0);
    for(let i=0;i<9;i++)mesh(new THREE.BoxGeometry(3.5,2.2,3.5),windowMat,-80+i*20,135,-360);
  }
  if(track.id==='norway-fjord'){
    const ranges=fjordMassifGeometry({low});
    // Geometry carries continuous cross-slope surface-distance UVs. Retain
    // these through batching so flat foothills do not collapse the rock map.
    const massif=mesh(ranges,new THREE.MeshStandardMaterial({color:'white',vertexColors:true,map:surfaces?.rockColor||null,normalMap:surfaces?.rockNormal||null,normalScale:new THREE.Vector2(.65,.65),roughness:1}),0,0,0);
    massif.name='glacial-valley-ranges';
    group.userData.glacialRanges={...ranges.userData};
    const lake=new THREE.Mesh(new THREE.CircleGeometry(95,48),waterMaterial||createWaterSurfaceMaterial({environment:'parkland'}).material);lake.rotation.x=-Math.PI/2;lake.position.set(25,.05,25);group.add(lake);
  }
  if(track.id==='san-francisco-hills'){
    const houseMaterials=['#d2b29b','#c4c9bc','#b8a7c4','#899fa9'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.9}));
    group.userData.houseFoundations=[];
    // Bay houses sit on submerged shoreline shelves and concrete footings.
    // Compact bay houses use distinct roof silhouettes and tall narrow windows.
    for(const {i,p,side,x,z}of destinationHouseLayout(track,{landmarks})){
      const support=coastalGroundingLayout(track,[{x,z,radius:6.6}],{padding:3,margin:1.5})[0];
      // Continuous district terrain replaces the former isolated circular shelf.
      const houseGround=Math.max(0,groundHeight?groundHeight(x,z):coastalDistrictHeight(track,x,z));
      group.userData.houseFoundations.push({...support,top:houseGround,width:12,depth:14});
      const house=new THREE.Group();house.position.set(x,houseGround,z);house.rotation.y=Math.atan2(-p.nx*side,-p.nz*side);group.add(house);
      const footing=new THREE.Mesh(new THREE.BoxGeometry(12,houseGround+2.8,14),concrete);footing.position.y=-1.6-houseGround/2;house.add(footing);
      const coping=new THREE.Mesh(new THREE.BoxGeometry(12,.2,14),concrete);coping.position.y=-.1;house.add(coping);
      const wall=new THREE.Mesh(new THREE.BoxGeometry(8,10+(i%3)*2,10),houseMaterials[i%4]);wall.position.y=(10+(i%3)*2)/2;house.add(wall);
      const roof=new THREE.Mesh(new THREE.ConeGeometry(7,4,4),steel);roof.position.y=12+(i%3)*2;roof.rotation.y=Math.PI/4;house.add(roof);
      const detail=(w,h,d,x,y,z,mat=concrete,flat=false)=>{const m=new THREE.Mesh(flat?new THREE.PlaneGeometry(w,h):new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);house.add(m);return m;};
      for(const dx of [-2,2])for(const y of [3,7]){
        // Actual projecting bay, glazing, casings and sill: the nearby homes
        // should read as lived-in architecture from the driving camera.
        detail(1.70,2.35,.46,dx,y,5.15,houseMaterials[i%4]);
        detail(1.3,2,.07,dx,y,5.415,windowMat,low);
        for(const side of [-1,1])detail(.13,2.24,.16,dx+side*.74,y,5.45,concrete,low);
        detail(1.77,.14,.55,dx,y-1.13,5.50,concrete,low);detail(1.7,.16,.4,dx,y+1.16,5.50,concrete,low);
        detail(1.3,.055,.08,dx,y,5.48,concrete,low);detail(.055,2,.08,dx,y,5.48,concrete,low);
      }
      detail(1.36,2.6,.10,0,1.43,5.06,windowMat,low);detail(2.5,.18,1.35,0,2.9,5.43,steel);
      for(const x of [-1.1,1.1])detail(.10,2.85,.10,x,1.42,5.93,steel);
      // Readable windows on every approach: side pairs and rear bedrooms use
      // shallow glazing/sills instead of leaving three completely blank walls.
      // The phone version is 918 extra triangles across all 17 houses, including
      // the chimneys, and all parts remain inside the existing 12-by-14 lot.
      const facadeWindow=(x,y,z,yaw,width=1.35,paired=false)=>{
        const pane=detail(width,1.85,.075,x,y,z,windowMat,low);pane.rotation.y=yaw;
        const sill=detail(width+.25,.13,.28,x+Math.sin(yaw)*.035,y-.98,z+Math.cos(yaw)*.035,concrete,low);sill.rotation.y=yaw;
        if(paired){const mullion=detail(.075,1.85,.08,x+Math.sin(yaw)*.015,y,z+Math.cos(yaw)*.015,concrete,low);mullion.rotation.y=yaw;}
      };
      for(const side of [-1,1])for(const y of [3,7])facadeWindow(side*4.19,y,0,side*Math.PI/2,2.4,true);
      for(const dx of [-2,2])for(const y of [3,7])facadeWindow(dx,y,-5.19,Math.PI);
      const chimneyX=i%2?2.05:-2.05,wallHeight=10+(i%3)*2;
      detail(.65,2.35,.7,chimneyX,wallHeight+2.28,-1.9,houseMaterials[i%4]);
      const chimneyCap=detail(.89,low?.94:.16,low?.16:.94,chimneyX,wallHeight+3.49,-1.9,steel,low);
      if(low)chimneyCap.rotation.x=-Math.PI/2;
      for(let y=3.95;y<10+(i%3)*2;y+=3.3)detail(8.35,.16,10.3,0,y,0);
      detail(8.6,.22,10.65,0,10+(i%3)*2,0);
    }
  }
  // Elevated runs use different bridge architecture, not a panorama swap.
  if(track.id==='san-francisco-hills'||track.id==='norway-fjord')for(const fraction of [.26,.31]){
    const p=sampleTrack(track.length*fraction,track),bridge=new THREE.Group();bridge.position.set(p.x,p.y,p.z);bridge.rotation.y=Math.atan2(p.tx,p.tz);group.add(bridge);
    const mat=track.id==='san-francisco-hills'?red:steel;
    for(const side of [-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.7,16,.7),mat);leg.position.set(side*(track.width/2+1.3),8,0);bridge.add(leg);}
    const cross=new THREE.Mesh(new THREE.BoxGeometry(track.width+3.4,.9,.7),mat);cross.position.y=15.5;bridge.add(cross);
  }
  if(track.id==='san-francisco-hills'||track.id==='norway-fjord'){
    const cableMat=new THREE.MeshStandardMaterial({color:track.id==='san-francisco-hills'?'#a54837':'#78909b',metalness:.7,roughness:.4});
    for(const side of [-1,1]){
      const curve=[];
      for(let i=0;i<=24;i++){const t=i/24,p=sampleTrack(track.length*(.26+.05*t),track),height=15-10*Math.sin(Math.PI*t);curve.push(new THREE.Vector3(p.x+p.nx*side*(track.width/2+1.3),p.y+height,p.z+p.nz*side*(track.width/2+1.3)));
        if(i%2===0){const rod=mesh(new THREE.CylinderGeometry(.055,.055,height,5),cableMat,curve[i].x,p.y+height/2,curve[i].z);rod.castShadow=false;}}
      const cable=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve),48,.11,6,false),cableMat);group.add(cable);
    }
  }
  const galleryLight=new THREE.MeshBasicMaterial({color:'#b5d8da'});
  // Open-sided galleries remain safely outside the full driveable width.
  if(['singapore-afterdark','norway-fjord'].includes(track.id))for(let i=0;i<7;i++){
    const p=sampleTrack(track.length*.79+i*5,track),frame=new THREE.Group();frame.position.set(p.x,p.y,p.z);frame.rotation.y=Math.atan2(p.tx,p.tz);group.add(frame);
    for(const side of [-1,1]){const wall=new THREE.Mesh(new THREE.BoxGeometry(.8,7,4.7),track.id==='norway-fjord'?stone:concrete);wall.position.set(side*(track.width/2+1.5),3.5,0);frame.add(wall);}
    const roof=new THREE.Mesh(new THREE.BoxGeometry(track.width+4,1,4.9),concrete);roof.position.y=7;frame.add(roof);
    const light=new THREE.Mesh(new THREE.BoxGeometry(track.width*.7,.05,.15),galleryLight);light.position.y=6.45;frame.add(light);
  }
  for(const obstacle of getTrackObstacles(track)){
    const o=mesh(obstacle.type==='rock'?new THREE.IcosahedronGeometry(obstacle.radius,1):new THREE.CylinderGeometry(obstacle.radius*.86,obstacle.radius,obstacle.height,6),obstacle.type==='rock'?stone:gold,obstacle.x,obstacle.y+obstacle.height/2,obstacle.z);
    if(obstacle.type==='rock')o.scale.y=obstacle.height/(2*obstacle.radius);
    if(obstacle.type!=='rock'){const band=new THREE.Mesh(new THREE.CylinderGeometry(obstacle.radius*.95,obstacle.radius*.95,.24,6),steel);band.position.y=.15;o.add(band);}
  }
  const rampMat=new THREE.MeshStandardMaterial({color:'#323c48',metalness:.35,roughness:.58,side:THREE.DoubleSide});
  const rampPaint={barrel:new THREE.MeshBasicMaterial({color:'#9246ff'}),straight:new THREE.MeshBasicMaterial({color:'#fff71e'})};
  for(const ramp of track.ramps||[]){
    const a=sampleTrack(ramp.s,track),b=sampleTrack(ramp.s+ramp.length,track);
    const pos=[];for(const end of [a,b])for(const side of [-1,1])pos.push(end.x+end.nx*(ramp.lane+side*ramp.width/2),end.y+(end===a?.035:ramp.height),end.z+end.nz*(ramp.lane+side*ramp.width/2));
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();
    const surface=new THREE.Mesh(geo,rampMat);surface.name=`launch-ramp-${ramp.id}`;group.add(surface);
    // The launch surface is a solid wedge down to the existing road. Its
    // sidewall and underside stay inside the original ramp footprint.
    const wedge=[...pos];for(const end of [a,b])for(const side of [-1,1])wedge.push(end.x+end.nx*(ramp.lane+side*ramp.width/2),end.y+.012,end.z+end.nz*(ramp.lane+side*ramp.width/2));
    const support=new THREE.BufferGeometry();support.setAttribute('position',new THREE.Float32BufferAttribute(wedge,3));support.setIndex([0,4,2,2,4,6,1,3,5,3,7,5,2,6,3,3,6,7,0,1,4,1,5,4,4,5,6,5,7,6]);support.computeVertexNormals();
    const body=new THREE.Mesh(support,rampMat);body.name=`launch-ramp-foundation-${ramp.id}`;group.add(body);
    for(let i=0;i<5;i++){const f=(i+.4)/5,p=sampleTrack(ramp.s+ramp.length*f,track);
      const stripe=mesh(new THREE.BoxGeometry(ramp.width*.85,.045,.36),rampPaint[ramp.type]||rampPaint.straight,p.x+p.nx*ramp.lane,p.y+ramp.height*f+.065,p.z+p.nz*ramp.lane);
      stripe.rotation.set(-Math.atan2(ramp.height,ramp.length),Math.atan2(p.tx,p.tz),0,'YXZ');
    }
  }
  // Static authored scenery is batched by material/attributes. A detailed
  // bridge or streetscape therefore doesn't cost one draw call per window.
  group.updateMatrixWorld(true);
  const batches=new Map(),old=[];
  const centerX=track.samples.reduce((sum,p)=>sum+p.x,0)/track.samples.length;
  const centerZ=track.samples.reduce((sum,p)=>sum+p.z,0)/track.samples.length;
  group.traverse(item=>{if(!item.isMesh||Array.isArray(item.material))return;
    const bounds=new THREE.Box3().setFromObject(item),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    const distantLandmark=Math.max(size.x,size.y,size.z)>90||item.material===concrete||item.material===red;
    const key=item.material.uuid+':'+Object.keys(item.geometry.attributes).sort().join(',');
    const geometry=item.geometry.index?item.geometry.toNonIndexed():item.geometry.clone();geometry.applyMatrix4(item.matrixWorld);if(surfaces&&item.material===concrete)setWorldSurfaceUV(geometry,3);
    if(!batches.has(key))batches.set(key,{material:item.material,items:[],triangles:0,distantLandmark:false});
    const batch=batches.get(key);batch.items.push({geometry,sector:`${center.x>=centerX?1:0}:${center.z>=centerZ?1:0}`});
    batch.triangles+=geometry.attributes.position.count/3;batch.distantLandmark||=distantLandmark;old.push(item);
  });
  for(const item of old){item.removeFromParent();item.geometry.dispose();}
  // Large foliage benefits from local rejection. Tiny architectural parts cost
  // less as one material draw than as dozens of sectors. Keep the established
  // 20-draw phone ceiling; spend spare draws only on groups above 1,000 triangles.
  const renderBatches=[],maxBatches=low?20:28;let plannedBatches=batches.size;
  for(const batch of [...batches.values()].sort((a,b)=>b.triangles-a.triangles)){
    const sectors=new Map();for(const item of batch.items){if(!sectors.has(item.sector))sectors.set(item.sector,[]);sectors.get(item.sector).push(item.geometry);}
    if(!batch.distantLandmark&&batch.triangles>1000&&sectors.size>1&&plannedBatches+sectors.size-1<=maxBatches){
      plannedBatches+=sectors.size-1;for(const geometries of sectors.values())renderBatches.push({...batch,geometries});
    }else renderBatches.push({...batch,geometries:batch.items.map(item=>item.geometry)});
  }
  let drawBatches=0;
  for(const {material,geometries,distantLandmark} of renderBatches){
    const combined=mergeGeometries(geometries,false);
    // Preserve transformed parts if a future attribute mismatch prevents merging.
    const outputs=combined?[combined]:geometries;
    if(combined)for(const geometry of geometries)geometry.dispose();
    for(const geometry of outputs){const batch=new THREE.Mesh(geometry,material);batch.receiveShadow=true;batch.castShadow=false;if(!distantLandmark)batch.userData.distanceDetail={distance:500};group.add(batch);drawBatches++;}
  }
  group.userData.sourceMeshes=old.length;group.userData.drawBatches=drawBatches;
  return group;

}
