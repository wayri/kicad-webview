/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const snapshots=new WeakMap();
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
  const visible=viewer.view==='3d'?renderer?.getVisibleCopperLayers?.()||[]:[...(renderer?.visibleLayers||[])];
  return {layers:[...layers],visible:visible.filter(layer=>layers.includes(layer)),focused:viewer.view==='pcb'?renderer?.focusedLayer||null:null,
    focusMode:renderer?.layerFocusMode||'dim',canFocus:viewer.view==='pcb'&&typeof renderer?.focusLayer==='function',canRestore:Boolean(renderer&&(renderer.layerSnapshot||snapshots.has(renderer)))};
}
function changed(viewer){viewer.renderer?.draw?.();viewer.updateControls();const state=getLayerState(viewer);viewer.emit('layerschange',state);return state;}
function ready(viewer){viewer.assertActive();if(!['pcb','3d','manufacturing'].includes(viewer.view)||!viewer.renderer)throw new Error('Layer control requires a loaded PCB, 3D or manufacturing view.');}
function remember(viewer){const r=viewer.renderer;if(!snapshots.has(r))snapshots.set(r,getLayerState(viewer).visible);}
export function setLayers(viewer,layers){
  ready(viewer);const known=getLayerState(viewer).layers;
  if(!Array.isArray(layers)||layers.some(layer=>!known.includes(layer)))throw new TypeError('Choose saved PCB layer names.');
  if(viewer.view==='3d')viewer.renderer.setVisibleCopperLayers([...new Set(layers)]);
  else {viewer.renderer.visibleLayers=new Set(layers);if(viewer.renderer.focusedLayer&&!viewer.renderer.visibleLayers.has(viewer.renderer.focusedLayer))viewer.renderer.focusedLayer=null;}
  return changed(viewer);
}
export function setLayerPreset(viewer,preset){
  ready(viewer);if(!['all','none','front','back','copper'].includes(preset))throw new TypeError('Choose all, none, front, back or copper layers.');
  remember(viewer);if(viewer.view==='pcb'&&viewer.renderer.layerPreset)viewer.renderer.layerPreset(preset);
  else {const layers=getLayerState(viewer).layers;return setLayers(viewer,layers.filter(layer=>preset==='all'||preset!=='none'&&(layer==='Edge.Cuts'||preset==='copper'&&/^(?:F|B|In\d+)\.Cu$/.test(layer)||preset==='front'&&layer.startsWith('F.')||preset==='back'&&layer.startsWith('B.'))));}
  return changed(viewer);
}
export function focusLayer(viewer,layer,{mode='dim',fit=false}={}){
  ready(viewer);if(viewer.view!=='pcb'||!viewer.renderer.focusLayer)throw new Error('Layer focus requires the 2D PCB view.');
  if(!viewer.getLayers().includes(layer)||!['dim','isolate'].includes(mode)||typeof fit!=='boolean')throw new TypeError('Choose a saved layer and dim or isolate focus mode.');
  remember(viewer);viewer.renderer.focusLayer(layer,mode);if(fit)viewer.renderer.fitLayer?.();return changed(viewer);
}
export function clearLayerFocus(viewer){ready(viewer);viewer.renderer.focusedLayer=null;return changed(viewer);}
export function restoreLayerView(viewer){
  ready(viewer);const r=viewer.renderer,snapshot=snapshots.get(r);
  if(r.layerSnapshot)r.restoreLayers();else if(snapshot){snapshots.delete(r);return setLayers(viewer,snapshot);}snapshots.delete(r);return changed(viewer);
}
export function fitFocusedLayer(viewer){ready(viewer);if(viewer.view!=='pcb'||!viewer.renderer.focusedLayer)return false;const fitted=Boolean(viewer.renderer.fitLayer?.());viewer.renderer.draw?.();viewer.reportCamera?.();return fitted;}
