import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeFiles,localSource} from '../src/manufacturing-input.mjs';
import {KiCadViewer} from '../src/kicad-viewer.mjs';
const encode=s=>new TextEncoder().encode(s);
test('native local board handles read only the chosen board and keep project navigation lazy',async()=>{
 const calls=[],make=(path,source)=>({path,size:encode(source).length,async arrayBuffer(){calls.push(path);return encode(source).buffer;}});
 const files=await normalizeFiles([make('a.kicad_pcb','(kicad_pcb)'),make('b.kicad_pcb','(kicad_pcb (version 1))')],{lazyBoards:true});
 assert.deepEqual(calls,[]);let captured;
 const viewer={showSource(source,options){captured={source,...options};return true;}};
 const op={signal:new AbortController().signal,check(){}};
 await KiCadViewer.prototype.showFileSet.call(viewer,files,{},op);assert.deepEqual(calls,['a.kicad_pcb']);assert.equal(captured.source,'(kicad_pcb)');assert.equal(captured.project.files[1].source,undefined);
 await KiCadViewer.prototype.showFileSet.call(viewer,captured.project.files,{file:'b.kicad_pcb'},op);assert.deepEqual(calls,['a.kicad_pcb','b.kicad_pcb']);assert.equal(captured.path,'b.kicad_pcb');
});
test('caller supplied source strings preserve Unicode without byte-buffer duplication',async()=>{
 const source='(kicad_pcb (property "name" "水😀"))',files=await normalizeFiles([{path:'a.kicad_pcb',source}]);assert.equal(files[0].source,source);assert.equal(files[0].bytes,undefined);assert.equal(await localSource(files[0]),source);
});
test('lazy board reads retain aggregate bounds, changed-size and cancellation guards',async()=>{
 const file={path:'a.kicad_pcb',size:2,arrayBuffer:async()=>new Uint8Array([1]).buffer};
 const [normalized]=await normalizeFiles([file],{lazyBoards:true});await assert.rejects(localSource(normalized),/size changed/);
 const controller=new AbortController();let finish;const pending=localSource({...file,arrayBuffer:()=>new Promise(resolve=>finish=resolve)},{signal:controller.signal});controller.abort();finish(new Uint8Array(2).buffer);await assert.rejects(pending,{name:'AbortError'});
 let reads=0;await assert.rejects(normalizeFiles(Array.from({length:5},(_,i)=>({path:i+'.kicad_pcb',size:32*1024*1024,arrayBuffer(){reads++;}})),{lazyBoards:true}),/byte limit/);assert.equal(reads,0);
});
