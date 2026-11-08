import test from 'node:test';import assert from 'node:assert/strict';
import {KiCadViewer} from '../src/kicad-viewer.mjs';import {EMBED_API_VERSION} from '../src/api-version.mjs';
test('public camera snapshots are copied, validate atomically, and emit changes once',()=>{
 const renderer=new EventTarget();renderer.viewport={camera:new globalThis.KiCadOwnedCanvas.Camera(400,300)};renderer.draw=()=>renderer.dispatchEvent(new Event('kicad:viewframe'));
 const viewer={renderer,view:'pcb',path:'board',assertActive(){if(this.disposed)throw Error('disposed');},events:[],emit(type,detail){this.events.push({type,detail});}};
 for(const name of ['getCamera','setCamera','bindCamera','reportCamera'])viewer[name]=KiCadViewer.prototype[name];
 viewer.bindCamera();const original=viewer.getCamera();original.center.x=999;assert.equal(viewer.getCamera().center.x,0);
 const state={center:{x:12,y:-3},zoom:10,flipped:true};viewer.setCamera(state);assert.deepEqual(viewer.getCamera(),state);assert.equal(viewer.events.length,1);
 renderer.draw();assert.equal(viewer.events.length,1);viewer.events[0].detail.camera.center.x=999;assert.equal(viewer.getCamera().center.x,12);
 for(const bad of [{...state,zoom:Infinity},{...state,center:{x:NaN,y:0}},{...state,flipped:'yes'},{...state,zoom:10001}])assert.throws(()=>viewer.setCamera(bad));assert.deepEqual(viewer.getCamera(),state);
 viewer.view='3d';assert.equal(viewer.getCamera(),null);assert.throws(()=>viewer.setCamera(state),/2D/);viewer.stopCamera();assert.equal(EMBED_API_VERSION,'1.0-beta');
});
