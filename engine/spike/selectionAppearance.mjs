/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Validate a complete style before any display state changes. */
export function selectionStyle(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Selection style must be an object.');
  const {mode='dim',color='accent'}=value;
  if(!['dim','bright','isolate'].includes(mode))throw new TypeError('Choose dim, bright or isolate selection mode.');
  if(!['accent','source'].includes(color))throw new TypeError('Choose accent or source selection color.');
  return {mode,color};
}

/** Reversible selection display. Source geometry, visibility and materials are retained. */
export function createSelectionAppearance(THREE, objects) {
  const saved=new Map();let currentStyle='';
  const list=value=>Array.isArray(value)?value:[value];
  function restore(){for(const [object,state]of saved){object.material=state.material;if(object.isInstancedMesh){if(object.instanceColor!==state.instanceColor)object.dispose?.();object.instanceColor=state.instanceColor;object.customDepthMaterial=state.depth;object.customDistanceMaterial=state.distance;}for(const material of state.owned)material.dispose();}saved.clear();currentStyle='';}
  function capture(object){
    if(saved.has(object))return saved.get(object);
    const state={material:object.material,instanceColor:object.instanceColor,depth:object.customDepthMaterial,distance:object.customDistanceMaterial,owned:[]};saved.set(object,state);return state;
  }
  function own(source,state){const material=source.clone();state.owned.push(material);return material;}
  function dimMaterial(source,state){
    const material=own(source,state),originalCompile=source.onBeforeCompile;
    material.onBeforeCompile=(shader,renderer)=>{originalCompile?.call(material,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))) * 0.60;\n#include <opaque_fragment>');};
    material.customProgramCacheKey=()=>source.customProgramCacheKey()+':selection-grey';return material;
  }
  function accentMaterials(state){
    if(!state.accent)state.accent=list(state.material).map(source=>{const material=own(source,state);material.color?.setHex(0x63e6ee);material.emissive?.setHex(0x12565c);material.metalness=0;material.roughness=.55;return material;});
    return Array.isArray(state.material)?state.accent:state.accent[0];
  }
  // Only the owned instance-color buffer carries selection flags. No shared
  // geometry attributes or instance matrices are changed. Negative encoded
  // colors retain every source color channel, including zero-valued channels.
  function instanceMaterial(source,state,created=false){
    const originalCompile=source.onBeforeCompile,originalKey=source.customProgramCacheKey(),material=created?source:own(source,state);if(created)state.owned.push(material);
    material.onBeforeCompile=(shader,renderer)=>{
      originalCompile?.call(material,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vSelectionStyle;').replace('#include <begin_vertex>',`#include <begin_vertex>
vSelectionStyle = 0.0;
#ifdef USE_INSTANCING_COLOR
  if (instanceColor.r < -1.0e25) { vSelectionStyle = 3.0; }
  else if (instanceColor.r < -1.0e15) { vSelectionStyle = 2.0; }
  else if (instanceColor.r < 0.0) { vSelectionStyle = 1.0; }
#endif`);
      // Three's color chunk precedes begin_vertex, so decode the color at the
      // chunk itself, while the flag above is also available to shadow shaders.
      shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#ifdef USE_INSTANCING_COLOR
vec3 selectionDecodedColor = instanceColor.r < -1.0e15 ? vec3(1.0) : instanceColor.r < 0.0 ? -instanceColor - vec3(1.0) : instanceColor;
#endif
`+THREE.ShaderChunk.color_vertex.replace(/\binstanceColor\b/g,'selectionDecodedColor'));
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSelectionStyle;').replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (vSelectionStyle > 2.5) discard;').replace('#include <color_fragment>','#include <color_fragment>\nif (vSelectionStyle > 1.5 && vSelectionStyle < 2.5) diffuseColor.rgb = vec3(0.1247718, 0.7912979, 0.8549926);').replace('#include <opaque_fragment>','if (vSelectionStyle > 0.5 && vSelectionStyle < 1.5) outgoingLight = vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))) * 0.60;\n#include <opaque_fragment>');
    };
    material.customProgramCacheKey=()=>originalKey+':selection-instances-v1';return material;
  }
  function update(matches,enabled,accentMatches=null,options={}){
    const style=selectionStyle(options),key=style.mode+':'+style.color;
    if(!enabled){restore();return;}
    if(currentStyle&&currentStyle!==key)restore();currentStyle=key;
    const legacy=style.mode==='dim'&&style.color==='accent';
    for(const object of objects()){
      if(!object.material)continue;
      const state=capture(object),records=object.userData.records;
      if(object.isInstancedMesh&&records){
        if(!legacy){
          if(!state.instances){
            state.instances=list(state.material).map(source=>instanceMaterial(source,state));
            object.instanceColor=state.instanceColor?.clone()||null;
            if(style.mode==='isolate'){
              object.customDepthMaterial=instanceMaterial(state.depth||new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),state,!state.depth);
              object.customDistanceMaterial=instanceMaterial(state.distance||new THREE.MeshDistanceMaterial(),state,!state.distance);
            }
          }
          object.material=Array.isArray(state.material)?state.instances:state.instances[0];
          const color=new THREE.Color();
          for(let index=0;index<records.length;index++){
            if(state.instanceColor)color.fromArray(state.instanceColor.array,index*3);else color.setHex(0xffffff);
            const record=records[index],matched=matches(record);
            if(!matched&&style.mode==='isolate')color.setRGB(-1e30,-1e30,-1e30);
            else if(style.color==='accent'&&accentMatches?.(record))color.setRGB(-1e20,-1e20,-1e20);
            else if(!matched&&style.mode==='dim')color.setRGB(-color.r-1,-color.g-1,-color.b-1);
            object.setColorAt(index,color);
          }
        }else{
          if(!state.white){state.white=list(state.material).map(source=>{const material=own(source,state);material.color?.setHex(0xffffff);return material;});object.instanceColor=state.instanceColor?.clone()||null;}
          object.material=Array.isArray(state.material)?state.white:state.white[0];
          const base=list(state.material)[0].color||new THREE.Color(0xffffff),color=new THREE.Color();
          for(let index=0;index<records.length;index++){
            if(state.instanceColor)color.fromArray(state.instanceColor.array,index*3).multiply(base);else color.copy(base);
            if(accentMatches?.(records[index]))color.setHex(0x63e6ee);
            else if(!matches(records[index])){const grey=(color.r*.2126+color.g*.7152+color.b*.0722)*.60;color.setRGB(grey,grey,grey);}
            object.setColorAt(index,color);
          }
        }
        if(object.instanceColor)object.instanceColor.needsUpdate=true;
      }else if(style.mode==='isolate'&&object.userData.record&&object.userData.record.type!=='Board'&&!matches(object.userData.record)){
        if(!state.hidden)state.hidden=list(state.material).map(source=>{const material=own(source,state);material.visible=false;return material;});
        object.material=Array.isArray(state.material)?state.hidden:state.hidden[0];
      }else if(style.color==='accent'&&accentMatches?.(object.userData.record))object.material=accentMaterials(state);
      else if(matches(object.userData.record)||style.mode!=='dim')object.material=state.material;
      else {if(!state.dim)state.dim=list(state.material).map(source=>dimMaterial(source,state));object.material=Array.isArray(state.material)?state.dim:state.dim[0];}
    }
  }
  function isVisible(object,index){
    const colors=object.isInstancedMesh&&object.instanceColor;
    if(colors&&Number.isInteger(index)&&colors.array[index*3]<-1e25)return false;
    return list(object.material).some(material=>material&&material.visible!==false);
  }
  return {update,restore,dispose:restore,isVisible};
}
