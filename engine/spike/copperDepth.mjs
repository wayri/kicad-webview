/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Depth precedence affects display only; cap slope bias must never reach extruded walls. */
export function copperDepthPolicy(role,surface='all') {
  const rank = {zone:1,track:-1,pad:-2,via:-3}[role];
  if (typeof rank !== 'number') throw Error('Unknown copper surface role.');
  if(!['all','cap','wall'].includes(surface))throw Error('Unknown copper surface kind.');
  return {polygonOffset:surface!=='wall',polygonOffsetFactor:surface==='cap'?rank/2:0,polygonOffsetUnits:surface==='wall'?0:rank*2};
}

/** Three.js ExtrudeGeometry assigns material 0 to lids and 1 to side walls. */
export function copperCapMaterials(THREE,role,parameters){
  return ['cap','wall'].map(surface=>new THREE.MeshStandardMaterial({...parameters,...copperDepthPolicy(role,surface)}));
}
