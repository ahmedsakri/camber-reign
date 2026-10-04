import * as THREE from 'three';

// An authored volcanic landform: drainage grooves bend down asymmetric slopes,
// with a shallow summit hollow. All rings share vertices and smooth normals;
// there is no separate intersecting cone or floating snow-cap mesh.
export function erodedMountainGeometry({low=false}={}) {
 const sectors=low?64:96,rings=low?16:24,positions=[80,286,-1120],uv=[80/90,-1120/90],colors=[],indices=[],tint=new THREE.Color('#dddcd0');
 colors.push(tint.r,tint.g,tint.b);
 for(let ring=1;ring<=rings;ring++)for(let sector=0;sector<sectors;sector++){
  const r=ring/rings,a=sector/sectors*Math.PI*2;
  const radius=650*r*(1+.065*Math.sin(a*3+.3)+.028*Math.cos(a*7));
  const x=80+Math.cos(a)*radius,z=-1120+Math.sin(a)*radius;
  const drainage=Math.pow(.5+.5*Math.sin(a*13+r*2.8+.6*Math.sin(a*4)),5);
  const shoulder=Math.sin(Math.PI*r),ridge=.52+.48*Math.sin(a*5-r*1.5);
  const y=-.38+310*Math.pow(1-r,1.52)-shoulder*(drainage*28+ridge*10)-16*Math.exp(-r*r/.004);
  positions.push(x,y,z);uv.push(x/90,z/90);
  const snow=THREE.MathUtils.smoothstep(y+drainage*15+5*Math.sin(a*3),194,258);
  tint.set('#889387').lerp(new THREE.Color('#efefe6'),snow).multiplyScalar(.88+.12*ridge);
  colors.push(tint.r,tint.g,tint.b);
  const current=1+(ring-1)*sectors+sector,next=1+(ring-1)*sectors+(sector+1)%sectors;
  if(ring===1)indices.push(0,next,current);
  else {const previous=current-sectors,previousNext=next-sectors;indices.push(previous,previousNext,current,previousNext,next,current);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.userData={sectors,rings,triangles:indices.length/3,center:[80,-1120],radius:711,singleSurface:true};return geometry;
}

// Continue the exact boundary vertices of the local terrain through four broad
// irregular ridges. This replaces the rectangular return to a flat ground disk.
export function appendTerrainOutskirts(vertices,indices,{nx,nz,minX,minZ,dx,dz},heightAt){
 const boundary=[];
 for(let i=0;i<nx;i++)boundary.push(i);
 for(let j=0;j<nz;j++)boundary.push(j*(nx+1)+nx);
 for(let i=nx;i>0;i--)boundary.push(nz*(nx+1)+i);
 for(let j=nz;j>0;j--)boundary.push(j*(nx+1));
 const centerX=minX+nx*dx/2,centerZ=minZ+nz*dz/2,base=boundary.map(index=>vertices[index]);
 let previous=boundary;
 for(const reach of [90,210,370,550]){
  const ring=[];
  for(const p of base){const vx=p.x-centerX,vz=p.z-centerZ,d=Math.hypot(vx,vz),x=p.x+vx/d*reach,z=p.z+vz/d*reach;
   const taper=1-THREE.MathUtils.smoothstep(reach,320,550),y=-.3+heightAt(x,z)*taper;
   ring.push(vertices.length);vertices.push({x,y,z});
  }
  for(let i=0;i<ring.length;i++){const next=(i+1)%ring.length;indices.push(previous[i],previous[next],ring[i],previous[next],ring[next],ring[i]);}
  previous=ring;
 }
 return {rings:4,boundary:boundary.length,triangles:boundary.length*8,outerReach:550};
}

// Two joined glacial valley sides, kept outside the complete road envelope.
// Broad shoulders, branching gullies and broken ridgelines replace ten isolated
// seven-sided cones. Snow belongs to the same surface instead of floating caps.
export function fjordMassifGeometry({low=false}={}) {
 const across=low?20:32,along=low?80:112,positions=[],indices=[],colors=[],uv=[];
 for(const side of [-1,1]) {
  const offset=positions.length/3;
  for(let row=0;row<=along;row++)for(let col=0;col<=across;col++){
   const v=row/along,u=col/across,z=-980+1960*v;
   const bend=22*Math.sin(z*.004+side)+12*Math.sin(z*.009);
   // Recessed feet and a wandering spine give each valley side depth from
   // the driving camera. The former spine at u=.2 rose almost immediately
   // beside the road, reading as one unbroken wall against the distant sky.
   // All recession is outward: the existing inner clearance is preserved.
   const foot=465+bend+46*(.5+.5*Math.sin(z*.008+side*1.7));
   const x=side*THREE.MathUtils.lerp(foot,1165+bend,u);
   const spine=.40+.075*Math.sin(z*.006+side)+.03*Math.sin(z*.017+side*2);
   const front=THREE.MathUtils.smoothstep(u,0,spine);
   const back=1-THREE.MathUtils.smoothstep(u,spine,1);
   const cross=u<spine?Math.pow(front,1.24):Math.pow(back,.90);
   const ends=THREE.MathUtils.smoothstep(v,0,.10)*(1-THREE.MathUtils.smoothstep(v,.9,1));
   const crest=188+42*Math.sin(z*.007+side*.8)+24*Math.sin(z*.019+side*2)+14*Math.cos(z*.033)+6*Math.sin(z*.091);
   // Drainage reaches into the visible front face, rather than concentrating
   // almost all relief on the hidden back slope. Broad channels leave solid
   // buttresses between them; fine grooves alone cannot fix a flat silhouette.
   const drainageZ=z+28*Math.sin(u*5+side)+u*38*Math.sin(z*.005);
   const gully=Math.pow(.5+.5*Math.sin(drainageZ*.032+u*7+1.2*Math.sin(z*.008)),4);
   const tributary=Math.pow(.5+.5*Math.sin(drainageZ*.067-u*7),6);
   const frontRelief=THREE.MathUtils.smoothstep(u,.035,spine*.7)*(1-THREE.MathUtils.smoothstep(u,spine,.95));
   const relief=(gully*78+tributary*29)*frontRelief+12*Math.sin(z*.027+u*21)*Math.sin(Math.PI*u);
   const strata=4*Math.sin(u*51+z*.012)+2*Math.sin(u*93-z*.026);
   const y=-1+ends*Math.max(0,crest*cross-relief+strata*Math.sin(Math.PI*u));
   positions.push(x,y,z);
   if(row<along&&col<across){const a=offset+row*(across+1)+col,b=a+1,c=a+across+1,d=c+1;
    if(side===1)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const p=geometry.attributes.position,n=geometry.attributes.normal;
 const rock=new THREE.Color('#8a9392'),meadow=new THREE.Color('#6c795f'),snow=new THREE.Color('#e4e9e8'),tint=new THREE.Color();
 let crossSlopeDistance=0;
 for(let i=0;i<p.count;i++){
  const y=p.getY(i),x=p.getX(i),z=p.getZ(i),slope=n.getY(i);
  // One continuous row parameterization follows both shallow foothills and
  // steep cliffs. Z/Y projection collapsed texture edges on equal-height
  // foothill vertices; arc distance retains 20 m repeats along each slope row.
  if(i%(across+1)===0)crossSlopeDistance=0;
  else crossSlopeDistance+=Math.hypot(x-p.getX(i-1),y-p.getY(i-1),z-p.getZ(i-1));
  uv.push(z/20,crossSlopeDistance/20);
  const strata=.88+.09*Math.sin(y*.16+x*.003+z*.012)+.03*Math.sin(y*.47-z*.022);
  const grass=(1-THREE.MathUtils.smoothstep(y,45,130))*THREE.MathUtils.smoothstep(slope,.45,.85);
  const snowCover=THREE.MathUtils.smoothstep(y+16*Math.sin(z*.035+x*.01),190,240)*THREE.MathUtils.smoothstep(slope,.32,.78);
  tint.copy(rock).lerp(meadow,grass).multiplyScalar(strata).lerp(snow,snowCover);colors.push(tint.r,tint.g,tint.b);
 }
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.userData={across,along,triangles:indices.length/3,ranges:2,roadClearance:75,singleSurfacePerRange:true,uvMetres:20,uvProjection:'cross-slope-arc'};return geometry;
}
