import test from 'node:test';
import assert from 'node:assert/strict';
import { KiCadViewer } from '../src/kicad-viewer.mjs';

const board = '(kicad_pcb (version 20240108) (generator pcbnew) (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (gr_rect (start 0 0) (end 10 10) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "edge")))';
class Element extends EventTarget {
  constructor(doc) { super(); this.ownerDocument=doc; this.style={}; this.children=[]; this.attributes={}; this.textContent=''; }
  append(...nodes) { for(const node of nodes){node.remove?.();node.parentNode=this;this.children.push(node);} }
  replaceChildren(...nodes) { for(const node of this.children)node.parentNode=null;this.children=[];this.append(...nodes); }
  setAttribute(name,value){this.attributes[name]=String(value);} getAttribute(name){return this.attributes[name]??null;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
  focus(){}
}
const originalMount=globalThis.KiCadOwnedCanvas.mount, originalFetch=globalThis.fetch;
function surface(){return Object.assign(new EventTarget(),{
  setDocument(design){this.design=design;this.visibleLayers=new Set(design.layers||[]);},
  setNetNames(){},setNetHighlight(){},draw(){},zoom_to_board(){},dispose(){this.disposed=true;},
});}
globalThis.KiCadOwnedCanvas.mount=()=>surface();
function fixture(){const doc={baseURI:'https://example.test/',createElement(){return new Element(doc);}};const viewer=new KiCadViewer(new Element(doc));const errors=[],ready=[],select=[];for(const [name,list]of [['error',errors],['ready',ready],['select',select]])viewer.addEventListener(name,event=>list.push(event.detail));return {viewer,errors,ready,select};}
function pick(renderer){renderer.dispatchEvent(new CustomEvent('kicad:select',{detail:{item:{uuid:'edge',kind:'gr_rect'}}}));}
test.after(()=>{globalThis.KiCadOwnedCanvas.mount=originalMount;globalThis.fetch=originalFetch;delete globalThis.SpikeBoard3D;});

test('failed and caller-cancelled replacements preserve current renderer selection; stale renderers stay silent',async()=>{
 const {viewer,select,errors}=fixture();
 try{
  await viewer.loadSource(board,{path:'current.kicad_pcb'});const current=viewer.renderer;pick(current);assert.equal(select.length,1);
  globalThis.fetch=async()=>new Response('',{status:404});await assert.rejects(viewer.load('missing.kicad_pcb'),/404/);
  assert.equal(viewer.renderer,current);assert.equal(current.disposed,undefined);pick(current);assert.equal(select.length,2);
  let entered;globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>{entered=true;signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});
  const controller=new AbortController(),pending=viewer.load('cancelled.kicad_pcb',{signal:controller.signal});assert.equal(entered,true);controller.abort();await assert.rejects(pending,{name:'AbortError'});
  assert.equal(viewer.renderer,current);assert.equal(viewer.path,'current.kicad_pcb');pick(current);assert.equal(select.length,3);assert.equal(errors.length,2);
  await viewer.loadSource(board,{path:'replacement.kicad_pcb'});assert.equal(current.disposed,true);pick(current);assert.equal(select.length,3);pick(viewer.renderer);assert.equal(select.length,4);
  const replacement=viewer.renderer;viewer.dispose();pick(replacement);assert.equal(select.length,4);
 }finally{viewer.dispose();globalThis.fetch=originalFetch;}
});

test('invalid source, nested URL/file-set render failures and direct view failures emit exactly once',async()=>{
 const {viewer,errors,ready}=fixture();const mount=globalThis.KiCadOwnedCanvas.mount;
 try{
  await viewer.loadSource(board);const current=viewer.renderer;
  await assert.rejects(viewer.loadSource('(not_a_design)'),/Expected/);assert.equal(errors.length,1);assert.equal(viewer.renderer,current);
  globalThis.KiCadOwnedCanvas.mount=()=>{throw new Error('renderer unavailable');};globalThis.fetch=async()=>new Response(board);
  await assert.rejects(viewer.load('board.kicad_pcb'),/renderer unavailable/);assert.equal(errors.length,2);assert.equal(viewer.renderer,current);
  await assert.rejects(viewer.loadFiles([{path:'board.kicad_pcb',source:board}]),/renderer unavailable/);assert.equal(errors.length,3);assert.equal(viewer.renderer,current);
  await assert.rejects(viewer.setView('pcb'),/renderer unavailable/);assert.equal(errors.length,4);assert.equal(viewer.renderer,current);
  await assert.rejects(viewer.setView('schematic'),/Use schematic/);assert.equal(errors.length,5);assert.equal(ready.length,1);
 }finally{globalThis.KiCadOwnedCanvas.mount=mount;globalThis.fetch=originalFetch;viewer.dispose();}
});

test('pre-aborted source calls reject once without parsing, replacing or announcing readiness',async()=>{
 const {viewer,errors,ready}=fixture();await viewer.loadSource(board,{path:'current.kicad_pcb'});const current=viewer.renderer;
 const controller=new AbortController();controller.abort();
 await assert.rejects(viewer.loadSource('(invalid)',{path:'aborted.kicad_pcb',signal:controller.signal}),{name:'AbortError'});
 assert.equal(errors.length,1);assert.equal(ready.length,1);assert.equal(viewer.path,'current.kicad_pcb');assert.equal(viewer.source,board);assert.equal(viewer.renderer,current);viewer.dispose();
});

test('cancelling deferred 3D source loading preserves the complete current drawing and never mounts late',async()=>{
 const {viewer,errors,ready,select}=fixture();await viewer.loadSource(board,{path:'current.kicad_pcb'});const current=viewer.renderer,design=viewer.design;
 let finish,mounts=0;globalThis.SpikeBoard3D={then(resolve){finish=resolve;}};
 try{
  const controller=new AbortController(),pending=viewer.loadSource(board.replace('10 10','20 20'),{path:'replacement.kicad_pcb',view:'3d',signal:controller.signal});
  await Promise.resolve();assert.equal(typeof finish,'function');assert.equal(viewer.renderer,current);assert.equal(viewer.path,'current.kicad_pcb');
  controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(errors.length,1);assert.equal(ready.length,1);assert.equal(viewer.source,board);assert.equal(viewer.design,design);assert.equal(viewer.view,'pcb');pick(current);assert.equal(select.length,1);
  finish({mountBoard3D(){mounts++;return surface();}});await Promise.resolve();await Promise.resolve();assert.equal(mounts,0);assert.equal(viewer.renderer,current);
 }finally{delete globalThis.SpikeBoard3D;viewer.dispose();}
});

test('nested 3D runtime failure reports once while a superseded deferred operation reports nothing',async()=>{
 const {viewer,errors,ready}=fixture();await viewer.loadSource(board,{path:'current.kicad_pcb'});const current=viewer.renderer;
 try{
  globalThis.SpikeBoard3D={then(resolve,reject){reject(new Error('3D runtime unavailable'));}};globalThis.fetch=async()=>new Response(board);
  await assert.rejects(viewer.load('board.kicad_pcb',{view:'3d'}),/3D runtime unavailable/);assert.equal(errors.length,1);assert.equal(viewer.renderer,current);
  await assert.rejects(viewer.setView('3d'),/3D runtime unavailable/);assert.equal(errors.length,2);
  let rejectOld;globalThis.SpikeBoard3D={then(resolve,reject){rejectOld=reject;}};const pending=viewer.loadSource(board,{view:'3d'});await Promise.resolve();
  await viewer.loadSource(board,{path:'winner.kicad_pcb'});assert.equal(await pending,false);rejectOld(new Error('stale runtime error'));await Promise.resolve();await Promise.resolve();
  assert.equal(errors.length,2);assert.equal(ready.length,2);assert.equal(viewer.path,'winner.kicad_pcb');
 }finally{globalThis.fetch=originalFetch;delete globalThis.SpikeBoard3D;viewer.dispose();}
});

test('named 3D camera presets call the mounted renderer without replacing selection or source',async()=>{
 const {viewer}=fixture();await viewer.loadSource(board);assert.throws(()=>viewer.setCamera3D('top'),/3D view/);
 let preset;globalThis.SpikeBoard3D={mountBoard3D(){return {setView(value){preset=value;return true;},setSelection(){},dispose(){}};}};
 await viewer.setView('3d');const renderer=viewer.renderer;assert.equal(viewer.setCamera3D('bottom'),true);assert.equal(preset,'bottom');assert.equal(viewer.renderer,renderer);assert.equal(viewer.source,board);assert.throws(()=>viewer.setCamera3D('arbitrary'),/preset/);viewer.dispose();delete globalThis.SpikeBoard3D;
});
