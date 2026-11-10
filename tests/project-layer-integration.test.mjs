/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {AdvancedKiCadViewer} from '../src/project-viewer.mjs';
const board='(kicad_pcb (version 20240108) (generator pcbnew) (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (gr_rect (start 0 0) (end 40 40) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "outline")))';
const schematic='(kicad_sch (version 20250114) (generator eeschema) (uuid "sheet") (paper "A4") (lib_symbols) (wire (pts (xy 10 10) (xy 20 10)) (stroke (width 0) (type default)) (uuid "wire")))';
const files=[{path:'power.kicad_pcb',source:board},{path:'power.kicad_sch',source:schematic}];
class Element extends EventTarget{
  constructor(doc,tag){super();this.ownerDocument=doc;this.tag=tag;this.children=[];this.style={};this.attributes={};this.textContent='';}
  append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children.forEach(node=>node.parent=null);this.children=[];this.append(...nodes);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}
  setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
}
function fixture(){const doc={baseURI:'https://example.test/',createElement(tag){return new Element(doc,tag);}};return new AdvancedKiCadViewer(new Element(doc,'div'));}
function descendants(node){return node.children.flatMap(child=>[child,...descendants(child)]);}
function control(project,label){return descendants(project.list).find(node=>node.getAttribute('aria-label')===label);}
function statuses(project){return descendants(project.list).filter(node=>node.tag==='small').map(node=>node.textContent);}
const mount=globalThis.KiCadOwnedCanvas.mount;
globalThis.KiCadOwnedCanvas.mount=(host,options)=>Object.assign(new EventTarget(),{
  options,setDocument(design,path){this.design=design;this.path=path;this.visibleLayers=new Set(design.layers||[]);},
  focusLayer(layer,mode){this.focusedLayer=layer;this.layerFocusMode=mode;this.visibleLayers.add(layer);},
  setNetHighlight(){},setNetNames(){},draw(){},zoom_to_board(){},dispose(){this.disposed=true;}
});
test.after(()=>{globalThis.KiCadOwnedCanvas.mount=mount;});
test('Layers navigator reads active pane state, searches saved layers and changes only that pane',async()=>{
  const project=fixture();
  try{
    await project.loadFiles(files);await project.openFile('power.kicad_pcb',{pane:1});project.setActivePane(0);project.setTab('layers');
    assert.equal(project.tabButtons.layers.getAttribute('aria-selected'),'true');assert.equal(project.search.getAttribute('aria-label'),'Search project layers');
    const [first,second]=project.viewers,peerVisible=second.getLayerState().visible;
    const hide=control(project,'Show F.Cu');assert.equal(hide.checked,true);hide.checked=false;hide.onchange();
    assert.equal(control(project,'Show F.Cu').checked,false);assert.ok(statuses(project).includes('Hidden'));assert.deepEqual(second.getLayerState().visible,peerVisible);
    project.search.value='b.cu';project.search.oninput();assert.ok(control(project,'Show B.Cu'));assert.equal(control(project,'Show F.Cu'),undefined);assert.match(project.count.textContent,/1 layers/);
    const filteredHide=control(project,'Show B.Cu');filteredHide.checked=false;filteredHide.onchange();assert.deepEqual(first.getLayerState().visible,['Edge.Cuts']);
    project.setActivePane(1);assert.equal(control(project,'Show B.Cu').checked,true);project.search.value='';project.search.oninput();assert.equal(control(project,'Show F.Cu').checked,true);
    first.setLayers(['F.Cu']);assert.equal(control(project,'Show B.Cu').checked,true);assert.equal(control(project,'Show F.Cu').checked,true);
    project.setActivePane(0);assert.equal(control(project,'Show F.Cu').checked,true);assert.equal(control(project,'Show B.Cu').checked,false);
  }finally{project.dispose();}
});
test('active layer events refresh only the Layers tab and release detached handlers and subscriptions',async()=>{
  const project=fixture();await project.loadFiles(files);project.setTab('layers');const child=project.viewers[0],input=control(project,'Show F.Cu'),open=control(project,'Open layer controls');
  child.setLayers(['B.Cu']);assert.equal(input.onchange,null);assert.equal(open.onclick,null);assert.equal(control(project,'Show B.Cu').checked,true);
  project.setTab('parts');const original=project.renderList;let refreshes=0;project.renderList=function(){refreshes++;return original.call(this);};
  child.setLayers(['F.Cu']);assert.equal(refreshes,0);
  project.setTab('layers');const activeRefreshes=refreshes;project.viewers[1].emit('layerschange',{});assert.equal(refreshes,activeRefreshes);child.setLayers(['B.Cu']);assert.equal(refreshes,activeRefreshes+1);
  const lastInput=control(project,'Show B.Cu'),lastOpen=control(project,'Open layer controls');project.dispose();assert.equal(lastInput.onchange,null);assert.equal(lastOpen.onclick,null);
  const afterDispose=refreshes;child.emit('layerschange',{});assert.equal(refreshes,afterDispose);assert.equal(project.listeners.length,0);
});
test('layer focus and full child controls stay available while saved cross-selection remains linked',async()=>{
  const project=fixture();
  try{
    await project.loadFiles(files);project.setTab('layers');const [first,second]=project.viewers;
    control(project,'Focus B.Cu').onclick();assert.equal(first.getLayerState().focused,'B.Cu');assert.equal(control(project,'Focus B.Cu').getAttribute('aria-pressed'),'true');assert.ok(statuses(project).includes('Visible · Focused'));
    first.chrome.layersMenu.open=false;control(project,'Open layer controls').onclick();assert.equal(first.chrome.layersMenu.open,true);assert.equal(Boolean(second.chrome.layersMenu.open),false);
    first.getParts=()=>[{id:'board-part',uuid:'fp',schematicUuid:'symbol'}];second.getParts=()=>[{id:'sheet-part',uuid:'symbol'}];let linked=0;
    second.selectPart=(id,options)=>{linked++;assert.equal(id,'sheet-part');assert.equal(options.locate,false);second.emit('select',{item:{uuid:'symbol'}});return true;};
    first.emit('select',{item:{uuid:'fp'}});assert.equal(linked,1);assert.equal(project.tab,'layers');assert.equal(first.getLayerState().focused,'B.Cu');assert.ok(control(project,'Show F.Cu'));
    project.setActivePane(1);assert.equal(control(project,'Open layer controls').disabled,true);assert.equal(descendants(project.list).some(node=>node.getAttribute('aria-label')?.startsWith('Focus ')),false);assert.match(project.list.children.at(-1).textContent,/PCB and manufacturing/);
  }finally{project.dispose();}
});
test('unloaded, 3D and manufacturing layer navigation obeys child capabilities without adding 2D focus',async()=>{
  const project=fixture();
  try{
    project.setTab('layers');assert.equal(control(project,'Open layer controls').disabled,true);assert.equal(control(project,'Show F.Cu'),undefined);
    await project.loadFiles(files);const child=project.viewers[0],renderer=child.renderer;
    try{
      let visible=['F.Cu'];child.view='3d';child.renderer={getCopperLayers:()=>['F.Cu','In1.Cu','B.Cu'],getVisibleCopperLayers:()=>[...visible],setVisibleCopperLayers(names){visible=[...names];},draw(){}};
      child.updateControls();project.renderList();assert.ok(control(project,'Show In1.Cu'));assert.equal(control(project,'Show Edge.Cuts'),undefined);assert.equal(control(project,'Focus F.Cu'),undefined);
      const toggle=control(project,'Show In1.Cu');toggle.checked=true;toggle.onchange();assert.deepEqual(visible,['F.Cu','In1.Cu']);assert.deepEqual(child.renderer.getVisibleCopperLayers(),visible);
      child.view='manufacturing';child.renderer={visibleLayers:new Set(['top.gbr']),draw(){}};const layers=child.getLayers;child.getLayers=()=>['top.gbr','bottom.gbr'];
      try{child.updateControls();project.renderList();assert.ok(control(project,'Show top.gbr'));assert.equal(control(project,'Focus top.gbr'),undefined);const bottom=control(project,'Show bottom.gbr');bottom.checked=true;bottom.onchange();assert.deepEqual(child.getLayerState().visible,['top.gbr','bottom.gbr']);}
      finally{child.getLayers=layers;}
    }finally{child.view='pcb';child.renderer=renderer;}
  }finally{project.dispose();}
});
