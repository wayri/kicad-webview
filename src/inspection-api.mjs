/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const layerMemories=new WeakMap();
// Snapshot and fallback preset state belong to the current renderer/document only.
function layerMemory(viewer){
  const renderer=viewer.renderer;if(!renderer)return null;
  const design=renderer.design||viewer.design,path=viewer.path,view=viewer.view;
  let state=layerMemories.get(renderer);
  if(!state||state.design!==design||state.path!==path||state.view!==view){
    if(state&&typeof renderer.layerPreset!=='function'){renderer.layerPresetName=null;renderer.layerSnapshot=null;}
    state={design,path,view,snapshot:null,preset:null};layerMemories.set(renderer,state);
  }
  return state;
}
export function highlightSettings(mode='dim',color='accent') {
  if(!['dim','bright','isolate'].includes(mode))throw new TypeError('Choose dim, bright or isolate highlight style.');
  if(!['accent','source'].includes(color))throw new TypeError('Choose accent or source highlight color.');
  return {mode,color};
}
export function setHighlightStyle(viewer,mode,{color=viewer.highlightColor}={}) {
  viewer.assertActive();const next=highlightSettings(mode,color);viewer.highlightMode=next.mode;viewer.highlightColor=next.color;
  viewer.inspector?.refreshHighlight();viewer.updateControls();viewer.emit('highlightstylechange',{...next});return {...next};
}
export function getLayerState(viewer) {
  viewer.assertActive();const renderer=viewer.renderer,supported=['pcb','3d','manufacturing'].includes(viewer.view)&&Boolean(renderer);
  const layers=supported?(viewer.view==='3d'?renderer.getCopperLayers?.()||[]:viewer.getLayers()):[];
  const memory=layerMemory(viewer);
  const visible=viewer.view==='3d'?renderer?.getVisibleCopperLayers?.()||[]:[...(renderer?.visibleLayers||[])];
  return {layers:[...layers],preset:(typeof renderer?.layerPreset==='function'?renderer.layerPresetName:memory?.preset)||null,visible:visible.filter(layer=>layers.includes(layer)),focused:viewer.view==='pcb'?renderer?.focusedLayer||null:null,
    focusMode:renderer?.layerFocusMode||'dim',canFocus:viewer.view==='pcb'&&typeof renderer?.focusLayer==='function',canRestore:Boolean(renderer&&(renderer.layerSnapshot||memory?.snapshot))};
}
function changed(viewer){viewer.renderer?.draw?.();viewer.updateControls();const state=getLayerState(viewer);viewer.emit('layerschange',state);return state;}
function ready(viewer){viewer.assertActive();if(!['pcb','3d','manufacturing'].includes(viewer.view)||!viewer.renderer)throw new Error('Layer control requires a loaded PCB, 3D or manufacturing view.');}
function remember(viewer){const state=layerMemory(viewer);if(!state.snapshot)state.snapshot=getLayerState(viewer).visible;}
export function setLayers(viewer,layers){
  ready(viewer);const known=getLayerState(viewer).layers;
  if(!Array.isArray(layers)||layers.some(layer=>!known.includes(layer)))throw new TypeError('Choose saved PCB layer names.');
  layerMemory(viewer).preset=null;viewer.renderer.layerPresetName=null;
  if(viewer.view==='3d')viewer.renderer.setVisibleCopperLayers([...new Set(layers)]);
  else {viewer.renderer.visibleLayers=new Set(layers);if(viewer.renderer.focusedLayer&&!viewer.renderer.visibleLayers.has(viewer.renderer.focusedLayer))viewer.renderer.focusedLayer=null;}
  return changed(viewer);
}
export function setLayerPreset(viewer,preset){
  ready(viewer);if(!['all','none','front','back','copper','overview'].includes(preset))throw new TypeError('Choose all, overview, none, front, back or copper layers.');
  if(preset==='overview'&&viewer.view!=='pcb')throw new Error('Overview requires the 2D PCB view.');
  remember(viewer);if(viewer.view==='pcb'&&viewer.renderer.layerPreset)viewer.renderer.layerPreset(preset);
  else {const layers=getLayerState(viewer).layers,visible=layers.filter(layer=>preset==='all'||preset!=='none'&&(layer==='Edge.Cuts'||preset==='copper'&&/^(?:F|B|In\d+)\.Cu$/.test(layer)||preset==='front'&&layer.startsWith('F.')||preset==='back'&&layer.startsWith('B.')||preset==='overview'&&['F.Cu','B.Cu','F.SilkS','B.SilkS'].includes(layer)));
    if(viewer.view==='3d')viewer.renderer.setVisibleCopperLayers(visible);else{viewer.renderer.visibleLayers=new Set(visible);viewer.renderer.focusedLayer=null;}layerMemory(viewer).preset=preset;}
  return changed(viewer);
}
export function focusLayer(viewer,layer,{mode='dim',fit=false}={}){
  ready(viewer);if(viewer.view!=='pcb'||!viewer.renderer.focusLayer)throw new Error('Layer focus requires the 2D PCB view.');
  if(!viewer.getLayers().includes(layer)||!['dim','isolate'].includes(mode)||typeof fit!=='boolean')throw new TypeError('Choose a saved layer and dim or isolate focus mode.');
  remember(viewer);layerMemory(viewer).preset=null;viewer.renderer.layerPresetName=null;viewer.renderer.focusLayer(layer,mode);if(fit)viewer.renderer.fitLayer?.();return changed(viewer);
}
export function clearLayerFocus(viewer){ready(viewer);viewer.renderer.focusedLayer=null;viewer.renderer.layerPresetName=null;layerMemory(viewer).preset=null;return changed(viewer);}
export function restoreLayerView(viewer){
  ready(viewer);const r=viewer.renderer,memory=layerMemory(viewer),snapshot=memory.snapshot;
  memory.snapshot=null;memory.preset=null;r.layerPresetName=null;
  if(r.layerSnapshot)r.restoreLayers();else if(snapshot)return setLayers(viewer,snapshot);return changed(viewer);
}
export function fitFocusedLayer(viewer){ready(viewer);if(viewer.view!=='pcb'||!viewer.renderer.focusedLayer)return false;const fitted=Boolean(viewer.renderer.fitLayer?.());viewer.renderer.draw?.();viewer.reportCamera?.();return fitted;}
