import test from 'node:test';import assert from 'node:assert/strict';
import {captureViewState,restoreViewState,createViewLink,parseViewLink,validateViewState} from '../src/view-state.mjs';
const camera={center:{x:12,y:34},zoom:4,flipped:true},camera3D={position:[10,20,30],target:[0,0,0],up:[0,0,1]};
const copy=value=>JSON.parse(JSON.stringify(value));
function viewer(path='board.kicad_pcb',view='pcb'){
 return {path,view,kind:view==='schematic'?'schematic':'pcb',source:'saved source '+path,calls:[],renderer:{visibleLayers:new Set(['B.Cu'])},
 assertActive(){if(this.disposed)throw Error('disposed');},getLayers:()=>['F.Cu','B.Cu'],getCamera:()=>copy(camera),getCamera3D:()=>copy(camera3D),getSelection:()=>({kind:'part',uuid:'part-a'}),
 async setView(value){this.calls.push(['view',value]);this.view=value;return true;},setCamera(value){this.calls.push(['camera',copy(value)]);},setCamera3D(value){this.calls.push(['camera3D',copy(value)]);},setLayers(value){this.calls.push(['layers',[...value]]);},setTheme(value){this.calls.push(['theme',value]);},clearSelection(){this.calls.push(['clear']);},selectNet(id){this.calls.push(['net',id]);return true;},selectObject(id,options){this.calls.push(['object',id,options]);return true;}};
}
test('source-bound 2D/3D links round-trip cameras, selection, settings and caller query',async()=>{
 const a=viewer(),b=viewer('board.kicad_pcb','3d');a.getSelection=()=>({kind:'net',id:'board#GND',netName:'GND'});
 const state=await captureViewState([a,b],{theme:'dark',layout:'split',activePane:1,linkedSelection:true});
 assert.equal(state.views[0].sha256.length,64);assert.deepEqual(state.views[0].camera,camera);assert.deepEqual(state.views[1].camera3D,camera3D);
 const link=createViewLink('https://example.test/viewer?project=demo#old-anchor',state);assert.equal(new URL(link).search,'?project=demo');assert.equal(link.includes('saved%20source'),false);assert.deepEqual(parseViewLink(link),state);assert.equal(parseViewLink('https://example.test/#ordinary'),null);
 a.calls=[];b.calls=[];await restoreViewState([a,b],state);assert.ok(a.calls.some(call=>call[0]==='net'&&call[1]==='board#GND'));assert.ok(b.calls.some(call=>call[0]==='camera3D'));assert.ok(b.calls.some(call=>call[0]==='object'&&call[1]==='part-a'));
 state.views[0].camera.center.x=999;assert.equal(camera.center.x,12);
});
test('a hash mismatch in any pane prevents camera and selection mutation in every pane',async()=>{
 const a=viewer(),b=viewer('sheet.kicad_sch','schematic'),state=await captureViewState([a,b]);b.source+=' changed';
 await assert.rejects(restoreViewState([a,b],state),/SHA-256/);assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[]);
 state.views[0].sha256='0'.repeat(64);await assert.rejects(restoreViewState([a,b],state),/SHA-256/);assert.deepEqual(a.calls,[]);
});
test('paths resolve only through the host callback and unknown layers fail before applying cameras',async()=>{
 const a=viewer(),state=await captureViewState([a]);a.path='other.kicad_pcb';
 await assert.rejects(restoreViewState([a],state),/Load the linked drawing first/);assert.deepEqual(a.calls,[]);
 let resolved;assert.equal(await restoreViewState([a],state,{openFile:async(index,path,signal)=>{resolved={index,path,signal};a.path=path;return true;}}),true);assert.equal(resolved.path,'board.kicad_pcb');assert.equal(resolved.index,0);
 a.calls=[];state.views[0].layers=['Invented.Cu'];await assert.rejects(restoreViewState([a],state),/absent saved layer/);assert.deepEqual(a.calls,[]);
});
test('invalid URL/state input is bounded, sanitized, and cannot introduce arbitrary source fetching',async()=>{
 const state=await captureViewState([viewer()]);
 const bad=[{...state,views:Array(9).fill(state.views[0])},{...state,src:'https://attacker.test/file'},{...state,views:[{...state.views[0],path:'../escape.kicad_pcb'}]},{...state,views:[{...state.views[0],path:'%2e%2e/escape'}]},{...state,views:[{...state.views[0],camera:{...camera,zoom:NaN}}]},{...state,views:[{...state.views[0],camera3D}]},JSON.parse('{"schema":"kicad-webview.views/v1","views":[],"__proto__":{"x":1}}')];
 for(const value of bad)assert.throws(()=>validateViewState(value));
 for(const value of ['javascript:alert(1)','https://user:secret@example.test/','https://example.test/#kicad-view=%xx','https://example.test/#kicad-view='+('x'.repeat(17000))])assert.throws(()=>parseViewLink(value));
 assert.throws(()=>createViewLink('file:///private.html',state));const original=copy(state);const sanitized=validateViewState(state);sanitized.views[0].camera.center.x=123;assert.deepEqual(state,original);
});
test('pre-abort and cancellation during a deferred load prevent late camera/selection application',async()=>{
 const a=viewer(),state=await captureViewState([a]),pre=new AbortController();pre.abort();await assert.rejects(restoreViewState([a],state,{signal:pre.signal}),{name:'AbortError'});assert.deepEqual(a.calls,[]);
 a.path='other.kicad_pcb';let finish;const controller=new AbortController();const pending=restoreViewState([a],state,{signal:controller.signal,openFile:()=>new Promise(resolve=>{finish=resolve;})});controller.abort();await assert.rejects(pending,{name:'AbortError'});finish(true);await Promise.resolve();await Promise.resolve();assert.deepEqual(a.calls,[]);
});
test('cancelled or superseded deferred view switches do not replay camera/selection',async()=>{
 const a=viewer(),state=await captureViewState([a]);state.views[0].view='3d';delete state.views[0].camera;delete state.views[0].layers;state.views[0].camera3D=copy(camera3D);
 let finish,entered;const gate=new Promise(resolve=>{entered=resolve;});a.setView=(view,{signal})=>new Promise((resolve,reject)=>{finish=resolve;signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});entered();});
 const controller=new AbortController(),pending=restoreViewState([a],state,{signal:controller.signal});await gate;controller.abort();await assert.rejects(pending,{name:'AbortError'});finish(true);await Promise.resolve();assert.deepEqual(a.calls,[]);
 let isCurrent=true;const gate2=new Promise(resolve=>{entered=resolve;});const stale=restoreViewState([a],state,{current:()=>isCurrent});await gate2;isCurrent=false;finish(true);assert.equal(await stale,false);assert.deepEqual(a.calls,[]);
});
test('capture rejects changed source and missing saved identities never fall back to guesses',async()=>{
 const a=viewer(),pending=captureViewState([a]);a.source+=' revision';await assert.rejects(pending,/changed/);
 const state=await captureViewState([a]);a.selectObject=()=>false;await assert.rejects(restoreViewState([a],state),/absent or ambiguous/);
});

test('cancellation raised by a camera callback prevents the later selection replay',async()=>{const a=viewer(),state=await captureViewState([a]),controller=new AbortController();a.setCamera=value=>{a.calls.push(['camera',value]);controller.abort();};await assert.rejects(restoreViewState([a],state,{signal:controller.signal}),{name:'AbortError'});assert.equal(a.calls.some(call=>call[0]==='clear'||call[0]==='object'||call[0]==='net'),false);});

test('same-source renderer replacement invalidates capture and pending restore snapshots',async()=>{const a=viewer(),pending=captureViewState([a]);a.renderer={visibleLayers:new Set(['F.Cu'])};await assert.rejects(pending,/changed/);const state=await captureViewState([a]);const restore=restoreViewState([a],state);a.renderer={visibleLayers:new Set(['B.Cu'])};assert.equal(await restore,false);assert.deepEqual(a.calls,[]);});

test('an external same-source reload supersedes a pending own view transition',async()=>{const a=viewer(),state=await captureViewState([a]);state.views[0].view='3d';delete state.views[0].camera;delete state.views[0].layers;state.views[0].camera3D=copy(camera3D);a.generation=0;let finish,entered;const gate=new Promise(resolve=>{entered=resolve;});a.setView=()=>{a.generation++;entered();return new Promise(resolve=>{finish=resolve;});};const pending=restoreViewState([a],state);await gate;a.generation++;a.renderer={visibleLayers:new Set()};a.view='3d';finish(true);assert.equal(await pending,false);assert.deepEqual(a.calls,[]);});

test('a successful own view transition updates its expected mounted identity',async()=>{const a=viewer(),state=await captureViewState([a]);state.views[0].view='3d';delete state.views[0].camera;delete state.views[0].layers;state.views[0].camera3D=copy(camera3D);a.generation=0;a.setView=async view=>{a.generation++;a.renderer={visibleLayers:new Set()};a.view=view;return true;};assert.equal(await restoreViewState([a],state),true);assert.ok(a.calls.some(call=>call[0]==='camera3D'));});

test('an abort raised by the final selection callback rejects instead of reporting success',async()=>{const a=viewer(),state=await captureViewState([a]),controller=new AbortController();a.selectObject=()=>{controller.abort();return true;};await assert.rejects(restoreViewState([a],state,{signal:controller.signal}),{name:'AbortError'});});

test('peer same-source reloads during another pane file resolution invalidate restoration',async()=>{const a=viewer(),b=viewer('second.kicad_pcb'),state=await captureViewState([a,b]);a.path='other.kicad_pcb';a.generation=0;b.generation=0;let finish;const pending=restoreViewState([a,b],state,{openFile:()=>new Promise(resolve=>{finish=()=>{a.path='board.kicad_pcb';a.generation++;a.renderer={visibleLayers:new Set()};resolve(true);};})});b.generation++;b.renderer={visibleLayers:new Set(['F.Cu'])};finish();assert.equal(await pending,false);assert.deepEqual(a.calls,[]);assert.deepEqual(b.calls,[]);});

test('legitimate own file loads update only their pane baseline and may change source',async()=>{const a=viewer(),b=viewer('second.kicad_pcb'),state=await captureViewState([a,b]);a.path='other.kicad_pcb';a.source='other source';a.generation=7;assert.equal(await restoreViewState([a,b],state,{openFile:async(index,path)=>{assert.equal(index,0);a.path=path;a.source='saved source '+path;a.generation++;a.renderer={visibleLayers:new Set()};return true;}}),true);assert.ok(a.calls.some(call=>call[0]==='camera'));assert.ok(b.calls.some(call=>call[0]==='camera'));});

test('host resolution must produce the requested listed path',async()=>{const a=viewer(),state=await captureViewState([a]);a.path='other.kicad_pcb';await assert.rejects(restoreViewState([a],state,{openFile:async()=>true}),/did not open/);assert.deepEqual(a.calls,[]);});

test('a host callback cannot replace a native target with a non-native placeholder source',async()=>{const a=viewer();a.source='manufacturing';const state=await captureViewState([a]);a.path='other.kicad_pcb';await assert.rejects(restoreViewState([a],state,{openFile:async(index,path)=>{a.path=path;a.kind='manufacturing';return true;}}),/native KiCad/);assert.deepEqual(a.calls,[]);});

test('synchronous host abort still consumes an underlying rejected load promise',async()=>{const a=viewer(),state=await captureViewState([a]),controller=new AbortController(),unhandled=[];a.path='other.kicad_pcb';const onUnhandled=error=>unhandled.push(error);process.on('unhandledRejection',onUnhandled);try{await assert.rejects(restoreViewState([a],state,{signal:controller.signal,openFile:()=>{controller.abort();return Promise.reject(new Error('underlying loader rejection'));}}),{name:'AbortError'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);assert.deepEqual(a.calls,[]);}finally{process.removeListener('unhandledRejection',onUnhandled);}});
