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
  return ['cap','wall'].map(surface=>configureCopperDepth(new THREE.MeshStandardMaterial({...parameters,...copperDepthPolicy(role,surface)}),role,surface));
}

/** Fragment-written logarithmic depth bypasses fixed-function polygon offset.
 * Apply the same small role ordering in that depth domain, never on walls. */
export function configureCopperDepth(material,role,surface='all'){
 const policy=copperDepthPolicy(role,surface);if(!policy.polygonOffset)return material;
 const inherited=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){
  inherited?.call(this,shader,renderer);this.polygonOffset=!renderer?.capabilities?.logarithmicDepthBuffer;
  const chunk='#include <logdepthbuf_fragment>';
  if(!shader.fragmentShader.includes(chunk))throw Error('Unsupported copper depth shader.');
  shader.fragmentShader=shader.fragmentShader.replace(chunk,chunk+'\n#ifdef USE_LOGDEPTHBUF\n gl_FragDepth = clamp(gl_FragDepth + '+(policy.polygonOffsetUnits*4/16777215).toPrecision(12)+', 0.0, 1.0);\n#endif');
 };
 material.customProgramCacheKey=()=>key+'|copper-log-depth-v1:'+role+':'+surface;
 return material;
}
