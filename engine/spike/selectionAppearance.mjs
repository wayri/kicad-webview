/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Reversible selection display. Geometry, visibility and source materials are retained. */
export function createSelectionAppearance(THREE, objects) {
  const saved=new Map();
  const list=value=>Array.isArray(value)?value:[value];
  function restore(){for(const [object,state]of saved){object.material=state.material;if(object.isInstancedMesh){if(object.instanceColor!==state.instanceColor)object.dispose?.();object.instanceColor=state.instanceColor;}for(const material of state.owned)material.dispose();}saved.clear();}
  function capture(object){
    if(saved.has(object))return saved.get(object);
    const state={material:object.material,instanceColor:object.instanceColor,owned:[]};saved.set(object,state);return state;
  }
  function dimMaterial(source,state){
    const material=source.clone(),originalCompile=source.onBeforeCompile;
    material.onBeforeCompile=(shader,renderer)=>{originalCompile?.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))) * 0.60;\n#include <opaque_fragment>');};
    material.customProgramCacheKey=()=>source.customProgramCacheKey()+':selection-grey';state.owned.push(material);return material;
  }
  function update(matches,enabled,accentMatches=null){
    if(!enabled){restore();return;}
    for(const object of objects()){
      if(!object.material)continue;
      const state=capture(object),records=object.userData.records;
      if(object.isInstancedMesh&&records){
        if(!state.white){state.white=list(state.material).map(source=>{const material=source.clone();material.color?.setHex(0xffffff);state.owned.push(material);return material;});object.instanceColor=state.instanceColor?.clone()||null;}
        object.material=Array.isArray(state.material)?state.white:state.white[0];
        const base=list(state.material)[0].color||new THREE.Color(0xffffff),color=new THREE.Color();
        for(let index=0;index<records.length;index++){
          if(state.instanceColor)color.fromArray(state.instanceColor.array,index*3).multiply(base);else color.copy(base);
          if(accentMatches?.(records[index]))color.setHex(0x63e6ee);
          else if(!matches(records[index])){const grey=(color.r*.2126+color.g*.7152+color.b*.0722)*.60;color.setRGB(grey,grey,grey);}
          object.setColorAt(index,color);
        }
        if(object.instanceColor)object.instanceColor.needsUpdate=true;
      }else if(accentMatches?.(object.userData.record)){
        if(!state.accent)state.accent=list(state.material).map(source=>{const material=source.clone();material.color?.setHex(0x63e6ee);material.emissive?.setHex(0x12565c);material.metalness=0;material.roughness=.55;state.owned.push(material);return material;});
        object.material=Array.isArray(state.material)?state.accent:state.accent[0];
      }else if(matches(object.userData.record))object.material=state.material;
      else {if(!state.dim)state.dim=list(state.material).map(source=>dimMaterial(source,state));object.material=Array.isArray(state.material)?state.dim:state.dim[0];}
    }
  }
  return {update,restore,dispose:restore};
}
