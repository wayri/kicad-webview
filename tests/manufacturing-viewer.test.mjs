import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {KiCadViewer} from '../src/kicad-viewer.mjs';
import {normalizeFiles} from '../src/manufacturing-input.mjs';
const gerber='%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,1*%\nD10*\nX100000Y100000D03*\nM02*';
const drill='M48\nMETRIC\nT1C0.8\n%\nG90\nT1\nX10.0Y10.0\nM30\n';
function fixture(){
  const context={setTransform(){},save(){},restore(){},fillRect(){},clearRect(){},drawImage(){},stroke(){},fill(){},beginPath(){},moveTo(){},lineTo(){},fillText(){},measureText(){return {width:20};},isPointInStroke(){return false;},isPointInPath(){return false;}};
  const doc={baseURI:'https://example.test/',createElement(){return Object.assign(new EventTarget(),{ownerDocument:doc,style:{},children:[],attributes:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key];},getBoundingClientRect(){return {left:0,top:0,width:640,height:400};},getContext(){return context;},remove(){this.removed=true;},focus(){},setPointerCapture(){}});}};
  return new KiCadViewer(doc.createElement('div'));
}
const originalPath=globalThis.Path2D;globalThis.Path2D=class{};test.after(()=>{globalThis.Path2D=originalPath;});
test('same Viewer loads manufacturing source, layers, measurement and rejects incompatible 3D without replacement',async()=>{
  const viewer=fixture();try{
    await viewer.loadSource(gerber,{path:'top.gbr'});assert.equal(viewer.view,'manufacturing');assert.equal(viewer.threeButton.hidden,true);assert.equal(viewer.measureButton.hidden,false);assert.deepEqual(viewer.getLayers(),['top.gbr']);
    viewer.setLayers([]);assert.equal(viewer.renderer.visibleLayers.size,0);viewer.setLayers(['top.gbr']);viewer.setMeasuring(true);assert.equal(viewer.renderer.measuring,true);viewer.fit();viewer.setTheme('dark');assert.equal(viewer.renderer.dark,true);
    const previous=viewer.renderer;await assert.rejects(viewer.loadSource(drill,{path:'drill.drl',view:'3d'}),/manufacturing view/);assert.equal(viewer.renderer,previous);await assert.rejects(viewer.setView('3d'),/manufacturing view/);
  }finally{viewer.dispose();}
});
test('local file sets overlay Gerber and drill and retain read-only project navigation',async()=>{
  const viewer=fixture();try{await viewer.loadFiles([{path:'top.gbr',source:gerber},{path:'holes.drl',source:drill},{path:'readme.txt',source:'not a drawing'}],{file:'top.gbr'});
    assert.equal(viewer.getLayers().length,2);assert.equal(viewer.getFiles().length,2);assert.match(viewer.status.textContent,/Ignored 1/);await viewer.openFile('holes.drl');assert.equal(viewer.path,'holes.drl');assert.equal(viewer.getLayers().length,2);
    await assert.rejects(viewer.openFile('unlisted.gbr'),/loaded project/);
  }finally{viewer.dispose();}
});
test('file-set bounds reject iterables, unknown sizes and oversized declarations before reading',async()=>{
  let touched=false;const infinite={*[Symbol.iterator](){touched=true;while(true)yield {};}};await assert.rejects(normalizeFiles(infinite),/256 files/);assert.equal(touched,false);
  const reader=()=>{touched=true;return new ArrayBuffer(0);};await assert.rejects(normalizeFiles([{name:'a.gbr',arrayBuffer:reader}]),/known size/);await assert.rejects(normalizeFiles([{name:'a.gbr',size:33*1024*1024,arrayBuffer:reader}]),/known size/);assert.equal(touched,false);
  await assert.rejects(normalizeFiles([{path:'../a.gbr',source:gerber}]),/safe relative/);
});
test('superseded file read and disposed viewer cannot commit late drawing bytes',async()=>{
  const viewer=fixture();let finish;try{
    const pending=viewer.loadFiles([{name:'old.gbr',size:gerber.length,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})}]);
    await viewer.loadSource(drill,{path:'new.drl'});finish(new TextEncoder().encode(gerber).buffer);assert.equal(await pending,false);assert.equal(viewer.path,'new.drl');
    const next=viewer.loadFiles([{name:'late.gbr',size:gerber.length,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})}]);viewer.dispose();finish(new TextEncoder().encode(gerber).buffer);assert.equal(await next,false);
  }finally{viewer.dispose();}
});
test('real inverter ZIP loads through public archive and hosted URL APIs; corruption preserves previous view',async()=>{
  const bytes=await readFile(new URL('../dist/manufacturing/inverter-fabrication.zip',import.meta.url));const viewer=fixture(),originalFetch=globalThis.fetch;
  try{await viewer.loadArchive(bytes);assert.equal(viewer.getLayers().length,6);assert.ok(viewer.design.bounds.w>200);const previous=viewer.renderer;let errors=0;viewer.addEventListener('error',()=>errors++);
    await assert.rejects(viewer.loadArchive(new Uint8Array([1,2,3])),/ZIP/i);assert.equal(viewer.renderer,previous);assert.equal(errors,1);
    globalThis.fetch=async()=>new Response(bytes);await viewer.load('https://example.test/board.zip');assert.equal(viewer.getLayers().length,6);
  }finally{globalThis.fetch=originalFetch;viewer.dispose();}
});
