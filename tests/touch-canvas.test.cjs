const test=require('node:test'),assert=require('node:assert/strict');
const {attach}=require('../engine/touch-canvas.js');
test('touch canvas reserves drawing gestures and restores host style and listeners on disposal',()=>{
 const listeners=new Map(),canvas={style:{touchAction:'pan-y'},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 const detach=attach({canvas,viewport:{camera:{}}});assert.equal(canvas.style.touchAction,'none');assert.equal(listeners.size,5);detach();assert.equal(canvas.style.touchAction,'pan-y');assert.equal(listeners.size,0);
});

test('touch motion follows actual pan and pinch through final release, cancel and capture loss',()=>{
 const {Camera}=require('../engine/owned-canvas.js'),camera=new Camera();
 const listeners=new Map(),captured=new Set(),draws=[];let picks=0;
 const canvas={style:{},classList:{contains:()=>false},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
   setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),getBoundingClientRect:()=>({left:0,top:0})};
 const view={canvas,viewport:{camera},touchMotion:false,requestDraw(){draws.push(this.touchMotion);},touchNetPick(){picks++;return true;},prepareMotion(){assert.fail('touch down must not prepare a motion snapshot');}};
 const detach=attach(view);
 const event=(type,id,x,y)=>listeners.get(type)({type,pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){},stopImmediatePropagation(){}});
 try{
  event('pointerdown',1,100,100);event('pointermove',1,100,100);event('pointerup',1,100,100);
  assert.equal(picks,1);assert.deepEqual(draws,[]);
  event('pointerdown',1,100,100);event('pointermove',1,120,100);
  assert.equal(camera.center.x,-5);assert.deepEqual(draws,[true]);
  event('pointerdown',2,160,100);event('pointermove',2,180,100);
  assert.equal(camera.zoom,6);assert.deepEqual(draws,[true,true]);
  event('pointerup',2,180,100);assert.equal(view.touchMotion,true);
  event('pointercancel',1,120,100);assert.deepEqual(draws,[true,true,false]);assert.equal(picks,1);
  event('pointerdown',3,120,100);event('pointermove',3,140,100);
  captured.delete(3);event('lostpointercapture',3,140,100);assert.deepEqual(draws,[true,true,false,true,false]);
  event('pointerdown',4,120,100);event('pointermove',4,140,100);
 }finally{detach();}
 assert.equal(view.touchMotion,false);assert.equal(draws.at(-1),false);assert.equal(captured.size,0);
});
