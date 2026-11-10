/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewerChrome} from '../src/viewer-chrome.mjs';

class Element extends EventTarget {
  constructor(doc, tag) { super(); this.ownerDocument=doc; this.tag=tag; this.children=[]; this.attributes={}; this.style={setProperty(){}}; this.replacements=0; }
  append(...nodes) { for (const node of nodes) { node.remove?.(); node.parentNode=this; this.children.push(node); } }
  replaceChildren(...nodes) { this.replacements++; for (const node of this.children) node.parentNode=null; this.children=[]; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children=this.parentNode.children.filter(node=>node!==this); this.parentNode=null; }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  getAttribute(key) { return this.attributes[key]??null; }
  removeAttribute(key) { delete this.attributes[key]; }
}
function fixture() {
  const doc={createElement(tag){return new Element(doc,tag);}};
  const viewer={host:new Element(doc,'div'),root:new Element(doc,'div'),stage:new Element(doc,'div'),surface:new Element(doc,'div'),status:new Element(doc,'div'),
    project:{}, files:[{path:'board.kicad_pcb'},{path:'sheet.kicad_sch'},{path:'part.glb'}], path:'board.kicad_pcb',kind:'pcb',view:'pcb',theme:'light',design:{primitives:[]},renderer:{},
    inspector:{toggle(){},isOpen(){return false;}},getFiles(){return this.files.map(file=>({...file}));},
    getLayerState(){return {layers:['F.Cu','B.Cu'],visible:['F.Cu'],focused:null,canFocus:true,canRestore:false};},getHighlightStyle(){return {mode:'dim',color:'accent'};}};
  return {viewer,chrome:createViewerChrome(viewer)};
}

test('unchanged layer updates retain file options and theme icon independently',()=>{
  const a=fixture(), b=fixture(); a.chrome.update(); b.chrome.update();
  const options=[...a.chrome.fileSelect.children], icon=a.chrome.themeButton.children[0];
  const fileReplacements=a.chrome.fileSelect.replacements, iconReplacements=a.chrome.themeButton.replacements;
  for(let i=0;i<100;i++) a.chrome.update();
  assert.equal(a.chrome.fileSelect.replacements,fileReplacements); assert.equal(a.chrome.themeButton.replacements,iconReplacements);
  assert.deepEqual(a.chrome.fileSelect.children,options); assert.equal(a.chrome.themeButton.children[0],icon);
  assert.deepEqual(options.map(option=>option.value),['board.kicad_pcb','sheet.kicad_sch']);
  assert.equal(a.chrome.fileSelect.getAttribute('aria-label'),'Project drawing');
  assert.equal(a.chrome.themeButton.getAttribute('aria-label'),'Switch to dark theme');
  a.viewer.theme='dark'; a.chrome.update();
  assert.notEqual(a.chrome.themeButton.children[0],icon); assert.equal(a.chrome.themeButton.getAttribute('aria-label'),'Switch to light theme');
  assert.equal(b.chrome.themeButton.getAttribute('aria-label'),'Switch to dark theme');
  assert.notEqual(b.chrome.fileSelect.children[0],options[0]);
  a.chrome.dispose(); b.chrome.dispose();
});

test('project replacement and file-list mutations rebuild options; selection changes do not',()=>{
  const {viewer,chrome}=fixture(); chrome.update(); const first=chrome.fileSelect.children[0];
  viewer.path='sheet.kicad_sch'; chrome.update(); assert.equal(chrome.fileSelect.value,viewer.path); assert.equal(chrome.fileSelect.children[0],first);
  viewer.project={}; chrome.update(); assert.notEqual(chrome.fileSelect.children[0],first);
  const next=chrome.fileSelect.children[0]; viewer.files[0].path='replacement.kicad_pcb'; chrome.update();
  assert.notEqual(chrome.fileSelect.children[0],next); assert.equal(chrome.fileSelect.children[0].textContent,'replacement.kicad_pcb');
  chrome.dispose();
});
