/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';import assert from 'node:assert/strict';
import * as api from '../src/inspection-api.mjs';
function viewer(view='pcb'){
 const r={visibleLayers:new Set(['F.Cu','Edge.Cuts']),activeLayer:'F.Cu',draw(){},focusLayer(layer,mode){this.layerSnapshot??=new Set(this.visibleLayers);this.focusedLayer=layer;this.layerFocusMode=mode;this.visibleLayers.add(layer);},restoreLayers(){this.visibleLayers=new Set(this.layerSnapshot);this.layerSnapshot=null;this.focusedLayer=null;},fitLayer(){this.fitted=true;return true;}};
 const v={view,renderer:r,highlightMode:'dim',highlightColor:'accent',events:[],assertActive(){if(this.disposed)throw Error('disposed');},getLayers(){return ['F.Cu','In1.Cu','B.Cu','Edge.Cuts'];},updateControls(){},emit(name,data){this.events.push([name,data]);},inspector:{refreshHighlight(){this.calls=(this.calls||0)+1;}}};return v;
}
test('highlight styles are independent, copied and validated before mutation',()=>{
 const a=viewer(),b=viewer();const next=api.setHighlightStyle(a,'bright',{color:'source'});next.mode='bad';assert.equal(a.highlightMode,'bright');assert.equal(a.highlightColor,'source');assert.equal(b.highlightMode,'dim');assert.equal(a.inspector.calls,1);
 assert.throws(()=>api.setHighlightStyle(a,'bad'),/style/);assert.throws(()=>api.setHighlightStyle(a,'isolate',{color:'bad'}),/color/);assert.equal(a.highlightMode,'bright');assert.equal(a.inspector.calls,1);a.disposed=true;assert.throws(()=>api.setHighlightStyle(a,'dim'),/disposed/);
});
test('layer focus and presets restore the actual pre-focus visibility without changing saved layer data',()=>{
 const v=viewer(),layers=v.getLayers();api.focusLayer(v,'B.Cu',{mode:'isolate',fit:true});assert.equal(v.renderer.focusedLayer,'B.Cu');assert.equal(v.renderer.layerFocusMode,'isolate');assert.equal(v.renderer.fitted,true);assert.ok(api.getLayerState(v).canRestore);
 api.clearLayerFocus(v);assert.equal(v.renderer.focusedLayer,null);assert.ok(v.renderer.visibleLayers.has('B.Cu'));api.restoreLayerView(v);assert.deepEqual([...v.renderer.visibleLayers],['F.Cu','Edge.Cuts']);assert.equal(api.getLayerState(v).canRestore,false);assert.deepEqual(v.getLayers(),layers);
 for(const [preset,expected]of [['copper',['F.Cu','In1.Cu','B.Cu','Edge.Cuts']],['none',[]],['back',['B.Cu','Edge.Cuts']]]){api.setLayerPreset(v,preset);assert.deepEqual(api.getLayerState(v).visible,expected);}api.restoreLayerView(v);assert.deepEqual(api.getLayerState(v).visible,['F.Cu','Edge.Cuts']);
});
test('invalid layer operations leave selection and visibility intact; hiding focus clears focus',()=>{
 const v=viewer(),original=[...v.renderer.visibleLayers];assert.throws(()=>api.focusLayer(v,'F.Cu',{mode:'bad'}),/saved layer/);assert.throws(()=>api.setLayers(v,['Invented']),/saved.*layer/);assert.throws(()=>api.setLayerPreset(v,'bad'),/Choose/);assert.deepEqual([...v.renderer.visibleLayers],original);assert.equal(v.renderer.layerSnapshot,undefined);
 api.focusLayer(v,'B.Cu');api.setLayers(v,['F.Cu']);assert.equal(v.renderer.focusedLayer,null);assert.deepEqual(api.getLayerState(v).visible,['F.Cu']);
});
test('3D layer visibility forwards validated copper only and retains an independently restorable snapshot',()=>{
 const v=viewer('3d');let visible=['F.Cu','B.Cu'];v.renderer={getCopperLayers:()=>['F.Cu','In1.Cu','B.Cu'],getVisibleCopperLayers:()=>visible,setVisibleCopperLayers:names=>{visible=names;}};
 assert.throws(()=>api.setLayers(v,['Edge.Cuts']),/saved.*layer/);assert.deepEqual(visible,['F.Cu','B.Cu']);api.setLayerPreset(v,'none');assert.deepEqual(visible,[]);api.restoreLayerView(v);assert.deepEqual(visible,['F.Cu','B.Cu']);assert.throws(()=>api.focusLayer(v,'F.Cu'),/2D/);assert.equal(api.getLayerState(v).canFocus,false);
});


test('Overview selection is explicit, emits one state, and resets on manual edits, focus, restore and document replacement',()=>{
 const v=viewer(),outer=['F.Cu','B.Cu','F.SilkS','B.SilkS','Edge.Cuts'];v.renderer.design={};v.getLayers=()=>[...outer,'In1.Cu','F.Fab','B.CrtYd'];const original=[...v.renderer.visibleLayers];
 api.setLayerPreset(v,'all');api.setLayerPreset(v,'overview');assert.equal(api.getLayerState(v).preset,'overview');assert.deepEqual(api.getLayerState(v).visible,outer);assert.equal(v.events.filter(e=>e[0]==='layerschange').length,2);
 api.setLayers(v,outer);assert.equal(api.getLayerState(v).preset,null);assert.equal(api.getLayerState(v).canRestore,true);api.restoreLayerView(v);assert.deepEqual(api.getLayerState(v).visible,original);assert.equal(api.getLayerState(v).preset,null);
 api.setLayerPreset(v,'overview');api.focusLayer(v,'F.Cu');assert.equal(api.getLayerState(v).preset,null);api.restoreLayerView(v);
 api.setLayerPreset(v,'overview');v.renderer.design={};v.renderer.visibleLayers=new Set(['B.Cu']);assert.equal(api.getLayerState(v).preset,null);assert.equal(api.getLayerState(v).canRestore,false);api.restoreLayerView(v);assert.deepEqual(api.getLayerState(v).visible,['B.Cu']);
 v.getLayers=()=>outer;api.setLayerPreset(v,'all');const all=api.getLayerState(v).visible;api.setLayerPreset(v,'overview');assert.deepEqual(api.getLayerState(v).visible,all);assert.equal(api.getLayerState(v).preset,'overview');
 for(const kind of ['3d','manufacturing']){v.view=kind;assert.throws(()=>api.setLayerPreset(v,'overview'),/2D PCB/);}
});


test('a renderer owns its new-document preset and snapshot before the host next reads layer state',()=>{
 const v=viewer();v.renderer.design={};v.renderer.layerPresetName=null;v.renderer.layerPreset=()=>{};api.getLayerState(v);
 // The native canvas resets itself on setDocument and may then receive an explicit preset.
 v.renderer.design={};v.renderer.layerPresetName='overview';v.renderer.layerSnapshot=new Set(['B.Cu']);v.renderer.visibleLayers=new Set(['F.Cu','B.Cu']);
 const state=api.getLayerState(v);assert.equal(state.preset,'overview');assert.equal(state.canRestore,true);api.restoreLayerView(v);assert.deepEqual(api.getLayerState(v).visible,['B.Cu']);assert.equal(api.getLayerState(v).preset,null);
});
