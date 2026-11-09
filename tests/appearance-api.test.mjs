/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {KiCadViewer} from '../src/kicad-viewer.mjs';

test('constructor rejects invalid appearance before DOM mutation', () => {
  let mutations=0;
  const host={append(){mutations++;},ownerDocument:{createElement(){mutations++;}}};
  assert.throws(()=>new KiCadViewer(host,{appearance:'bad'}),/appearance/);
  assert.equal(mutations,0);
});

test('appearance forwards actual mode independently of selection and camera', () => {
  const selection={net:'GND'},camera={position:[1,2,3]},calls=[];
  const viewer={disposed:false,assertActive:KiCadViewer.prototype.assertActive,view:'3d',modelOptions:{appearance:'realistic'},selection,camera,
    renderer:{setAppearance(value){calls.push(value);return 'layers';},getAppearance(){return 'layers';}}};
  assert.equal(KiCadViewer.prototype.setAppearance.call(viewer,'translucent'),'layers');
  assert.equal(viewer.modelOptions.appearance,'layers');assert.equal(KiCadViewer.prototype.getAppearance.call(viewer),'layers');
  assert.equal(viewer.selection,selection);assert.equal(viewer.camera,camera);
  assert.throws(()=>KiCadViewer.prototype.setAppearance.call(viewer,'bad'),/Choose/);
  viewer.view='pcb';assert.throws(()=>KiCadViewer.prototype.setAppearance.call(viewer,'layers'),/3D/);
  assert.equal(KiCadViewer.prototype.getAppearance.call(viewer),null);assert.deepEqual(calls,['translucent']);
  viewer.disposed=true;assert.throws(()=>KiCadViewer.prototype.setAppearance.call(viewer,'layers'),/disposed/);
  assert.throws(()=>KiCadViewer.prototype.getAppearance.call(viewer),/disposed/);
});

test('render statistics are copied and unavailable outside a loaded 3D view',()=>{
  const stats={appearance:'translucent',drawCalls:3,modelUpdates:{requestCount:4,flushCount:2,pending:false,cpuMilliseconds:5}};
  const viewer={disposed:false,assertActive:KiCadViewer.prototype.assertActive,view:'3d',renderer:{getRenderStats:()=>stats}};
  const copy=KiCadViewer.prototype.getRenderStats.call(viewer);copy.modelUpdates.requestCount=99;
  assert.equal(stats.modelUpdates.requestCount,4);
  viewer.view='pcb';assert.equal(KiCadViewer.prototype.getRenderStats.call(viewer),null);
  viewer.disposed=true;assert.throws(()=>KiCadViewer.prototype.getRenderStats.call(viewer),/disposed/);
});
