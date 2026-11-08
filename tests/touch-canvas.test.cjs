const test=require('node:test'),assert=require('node:assert/strict');
const {attach}=require('../engine/touch-canvas.js');
test('touch canvas reserves drawing gestures and restores host style and listeners on disposal',()=>{
 const listeners=new Map(),canvas={style:{touchAction:'pan-y'},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 const detach=attach({canvas,viewport:{camera:{}}});assert.equal(canvas.style.touchAction,'none');assert.equal(listeners.size,4);detach();assert.equal(canvas.style.touchAction,'pan-y');assert.equal(listeners.size,0);
});
