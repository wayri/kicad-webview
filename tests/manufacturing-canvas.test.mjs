import test from 'node:test';
import assert from 'node:assert/strict';
import {fitCamera,screenToWorld,zoomCamera,mountManufacturing} from '../src/manufacturing-canvas.mjs';
test('CAM camera fits mm bounds and zoom keeps the cursor world point fixed',()=>{
  const c=fitCamera({x:-20,y:-40,w:100,h:50},800,400);
  assert.deepEqual(screenToWorld(c,800,400,400,200),{x:30,y:-15});
  const at=screenToWorld(c,800,400,90,75),zoomed=zoomCamera(c,800,400,90,75,2);
  const after=screenToWorld(zoomed,800,400,90,75);
  assert.ok(Math.abs(at.x-after.x)<1e-12&&Math.abs(at.y-after.y)<1e-12);
});
test('CAM measurement completes after pointer preview; clear polarity stays on layer buffer; disposal removes listeners',()=>{
  const original=globalThis.Path2D;globalThis.Path2D=class{constructor(path){this.path=path;}};
  const operations=[];
  const context=()=>({setTransform(){},save(){},restore(){},fillRect(){},clearRect(){},drawImage(){},stroke(path){if(path)operations.push(['stroke',this.globalCompositeOperation,path.path]);},fill(path){operations.push(['fill',this.globalCompositeOperation,path.path]);},beginPath(){},moveTo(){},lineTo(){},fillText(){},measureText(){return {width:20};},isPointInStroke(){return false;},isPointInPath(){return false;}});
  const canvases=[],doc={createElement(){const canvas=Object.assign(new EventTarget(),{style:{},setAttribute(){},focus(){},setPointerCapture(){},remove(){this.removed=true;},getBoundingClientRect(){return {left:0,top:0,width:400,height:300};},getContext(){return this.context;},context:context()});canvases.push(canvas);return canvas;}};
  const host={ownerDocument:doc,append(){},getBoundingClientRect(){return {width:400,height:300};}};
  let viewer;
  try{viewer=mountManufacturing(host);viewer.setDocument({format:'gerber',layers:['copper'],bounds:{x:0,y:0,w:10,h:10},camLayers:[{id:'copper',operations:[{id:'dark',path:'M0 0H10V10H0Z',polarity:'dark'},{id:'clear',path:'M4 4H6V6H4Z',polarity:'clear'}]}]});
    assert.ok(operations.some(item=>item[1]==='destination-out'&&item[2].includes('M4')));
    assert.equal(canvases[0].context.globalCompositeOperation,'source-over');
    const events=[];viewer.addEventListener('measure',event=>events.push(event.detail));viewer.setMeasuring(true);
    const fire=(name,x,y)=>canvases[0].dispatchEvent(Object.assign(new Event(name),{clientX:x,clientY:y,button:0,pointerId:1}));
    fire('pointerdown',200,150);fire('pointerup',200,150);fire('pointermove',226.4,150);fire('pointerdown',226.4,150);fire('pointerup',226.4,150);
    assert.equal(events.length,1);assert.ok(Math.abs(events[0].distance-1)<1e-12);assert.equal(events[0].unit,'mm');
    viewer.dispose();fire('pointerdown',200,150);fire('pointerup',200,150);assert.equal(events.length,1);assert.equal(canvases[0].removed,true);
  }finally{viewer?.dispose();globalThis.Path2D=original;}
});
