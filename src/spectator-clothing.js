import * as THREE from 'three';

// These are fabric multipliers, not skin or whole-character colors. A stable
// phase maps one spectator to the same wardrobe shade at every detail tier.
const CLOTH_TINTS=Object.freeze(['#ffffff','#9aadb5','#a1b5a1','#b39ea9','#87989e','#b6af9c','#a3b3b0','#999ead']);
export function spectatorClothTint(phase,target=new THREE.Color()){
 const index=THREE.MathUtils.euclideanModulo(Math.floor((Number.isFinite(phase)?phase:0)*11.37),CLOTH_TINTS.length);
 return target.set(CLOTH_TINTS[index]);
}
