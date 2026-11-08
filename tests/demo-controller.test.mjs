import test from 'node:test';import assert from 'node:assert/strict';
import {DemoController} from '../src/demo-controller.mjs';
class Node extends EventTarget{
 constructor(doc,tag='div'){super();this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.attributes={};this.focusCount=0;}
 getAttribute(name){return this.attributes[name]??null;}setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}
 focus(options){this.focusCount++;this.focusOptions=options;this.ownerDocument.activeElement=this;}
}
function fixture(){
 const doc=new EventTarget();doc.hidden=false;doc.defaultView=new EventTarget();const root=new Node(doc),surfaces=[],calls=[];
 const renderer={handler:null,setDemoInputHandler(fn){this.handler=fn;},createDemoSurface(id,options){
  calls.push({id,options});const context={draws:[],clearRect(...args){this.draws.push(['clear',...args]);},drawImage(...args){this.draws.push(['image',...args]);},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},putImageData(image){this.image=image;}};
  const surface={id,options,updates:0,disposed:0,canvas:options.kind==='display'?{width:options.width,height:options.height,getContext:()=>context}:undefined,
   update(){this.updates++;},setLED(state){this.led={...state};},setValue(value){this.value=value;},getFace(){return {center:[1,2,3],normal:[0,0,1],right:[1,0,0],up:[0,1,0],width:12,height:6};},dispose(){this.disposed++;}};
  surfaces.push(surface);return surface;
 }};
 const viewer=Object.assign(new EventTarget(),{root,host:{ownerDocument:doc},source:'exact saved board',path:'board.kicad_pcb',view:'3d',renderer,disposed:false,assertActive(){if(this.disposed)throw Error('disposed');}});
 return {viewer,root,doc,renderer,surfaces,calls,demo:new DemoController(viewer)};
}
const anchor={uuid:'saved-component'};
function key(root,code,options={}){const event=new Event(options.type||'keydown',{cancelable:true});for(const [name,value]of Object.entries({code,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,...options}))if(name!=='type'&&name!=='path')Object.defineProperty(event,name,{value});Object.defineProperty(event,'composedPath',{value:()=>options.path||[root]});root.dispatchEvent(event);return event;}

test('LED updates validate atomically, bind to the source, and expose copied face/state data',()=>{
 const f=fixture(),{demo}=f;demo.addLED('status',{anchor,color:'#00ff44'});assert.equal(f.calls[0].options.kind,'led');assert.equal(demo.getState('status').on,false);
 demo.setLED('status',{on:true,brightness:.4});assert.deepEqual(f.surfaces[0].led,{on:true,brightness:.4,color:'#00ff44'});
 assert.throws(()=>demo.setLED('status',{brightness:2}),/brightness/);assert.equal(demo.getState('status').brightness,.4);
 const copy=demo.getState('status');copy.on=false;assert.equal(demo.getState('status').on,true);const face=demo.getFace('status');face.center[0]=999;assert.equal(demo.getFace('status').center[0],1);
 assert.equal(f.root.focusCount,0);assert.equal(demo.focus(),true);assert.deepEqual(f.root.focusOptions,{preventScroll:true});
 assert.throws(()=>demo.addLED('status',{anchor}),/unique/);assert.throws(()=>demo.addLED('invalid',{anchor:{reference:'\n'}}),/anchor/);assert.throws(()=>demo.addLED('missing',{}),/anchor/);demo.dispose();assert.equal(f.surfaces[0].disposed,1);
});

test('displays consume exact RGBA/monochrome bytes, support native canvas drawing, and bound allocations',()=>{
 const f=fixture(),{demo}=f;demo.addDisplay('screen',{anchor,mode:'oled',width:9,height:2});const surface=f.surfaces[0],context=surface.canvas.getContext('2d');
 assert.equal(demo.setPixels('screen',new Uint8Array([128,128,0,0]),{format:'mono1',foreground:'#112233',background:'#010203'}),true);
 assert.deepEqual([...context.image.data.slice(0,4)],[17,34,51,255]);assert.deepEqual([...context.image.data.slice(4,8)],[1,2,3,255]);assert.deepEqual([...context.image.data.slice(32,36)],[17,34,51,255]);assert.deepEqual([...context.image.data.slice(36,40)],[1,2,3,255]);
 assert.throws(()=>demo.setPixels('screen',new Uint8Array(1),{format:'rgba'}),/byte length/);assert.equal(surface.updates,1);
 assert.equal(demo.drawDisplay('screen',(ctx,canvas)=>{assert.equal(ctx,context);assert.equal(canvas.width,9);ctx.clearRect(0,0,9,2);}),true);demo.writeImage('screen',{authoredImage:true});assert.equal(context.draws.at(-1)[0],'image');
 demo.addDisplay('rgba',{anchor,mode:'lcd',width:2,height:1});const bytes=new Uint8Array([255,1,2,3,4,5,6,7,8,255]).subarray(1,9);demo.setPixels('rgba',bytes,{format:'rgba'});assert.deepEqual([...f.surfaces[1].canvas.getContext('2d').image.data],[1,2,3,4,5,6,7,8]);
 assert.throws(()=>demo.addDisplay('big',{anchor,width:1025,height:1}),/dimensions/);demo.dispose();
 const budget=fixture();for(let i=0;i<4;i++)budget.demo.addDisplay('d'+i,{anchor,width:1024,height:1024});assert.throws(()=>budget.demo.addDisplay('overflow',{anchor,width:1,height:1}),/four million/);budget.demo.dispose();
});

test('draw callback failures report once and asynchronous drawing rejection is consumed',async()=>{
 const {demo,surfaces}=fixture();demo.addDisplay('d',{anchor,width:2,height:1});const errors=[];demo.addEventListener('error',e=>errors.push(e.detail));
 assert.equal(demo.drawDisplay('d',()=>{throw Error('paint failed');}),false);assert.equal(errors.length,1);assert.equal(surfaces[0].updates,0);
 assert.equal(demo.drawDisplay('d',()=>Promise.reject(Error('async paint'))),false);await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,2);assert.match(errors[1].error.message,/synchronous/);demo.dispose();
});

test('display touch UV and button press/release callbacks produce one input per transition',()=>{
 const f=fixture(),events=[],callbacks=[];f.demo.addDisplay('touch',{anchor,width:4,height:4,onPress:e=>callbacks.push(e),onRelease:e=>callbacks.push(e)});f.demo.addEventListener('input',e=>events.push(e.detail));
 f.renderer.handler({id:'touch',type:'press',uv:{x:.2,y:.7},originalEvent:{pointerId:2}});f.renderer.handler({id:'touch',type:'press',uv:{x:.2,y:.7},originalEvent:{pointerId:2}});
 f.renderer.handler({id:'touch',type:'release',uv:{x:.25,y:.75},originalEvent:{pointerId:2}});assert.equal(events.length,2);assert.equal(callbacks.length,2);assert.deepEqual(callbacks[0].uv,{x:.2,y:.7});assert.equal(events[1].source,'pointer');f.demo.dispose();
});

test('knobs clamp, quantize and avoid callback feedback; direct errors do not change state',()=>{
 const f=fixture(),values=[];f.demo.addKnob('level',{anchor,min:0,max:10,step:2,value:3,onChange:e=>{values.push(e.value);f.demo.setKnob('level',e.value);}});assert.equal(f.demo.getState('level').value,4);
 f.demo.setKnob('level',99);f.demo.change('level',-2);assert.deepEqual(values,[10,6]);assert.equal(f.surfaces[0].value,6);
 assert.throws(()=>f.demo.setKnob('level',NaN));assert.equal(f.demo.getState('level').value,6);assert.throws(()=>f.demo.addKnob('bad',{anchor,min:3,max:2}),/maximum/);f.demo.dispose();
});

test('keyboard actions are viewer-scoped and ignore editable/toolbar/modifier/composition input',()=>{
 const f=fixture();f.demo.addLED('led',{anchor});f.demo.bindKey('KeyL',{id:'led',action:'toggle'});
 for(const tag of ['input','textarea','select','button','a'])assert.equal(key(f.root,'KeyL',{path:[new Node(f.doc,tag),f.root]}).defaultPrevented,false);
 const editable=new Node(f.doc);editable.isContentEditable=true;assert.equal(key(f.root,'KeyL',{path:[editable,f.root]}).defaultPrevented,false);
 assert.equal(key(f.root,'KeyL',{ctrlKey:true}).defaultPrevented,false);assert.equal(key(f.root,'KeyL',{isComposing:true}).defaultPrevented,false);assert.equal(f.demo.getState('led').on,false);
 assert.equal(key(f.root,'KeyL').defaultPrevented,true);assert.equal(f.demo.getState('led').on,true);key(f.root,'KeyL',{repeat:true});assert.equal(f.demo.getState('led').on,true);key(f.root,'KeyL',{type:'keyup'});
 assert.equal(key(f.root,'Unbound').defaultPrevented,false);f.demo.dispose();
});

test('multiple keys and pointer holds keep a momentary button pressed until all inputs release',()=>{
 const f=fixture(),calls=[];f.demo.addButton('start',{anchor,onPress:e=>calls.push(e.type),onRelease:e=>calls.push(e.type)});f.demo.bindKey('Space',{id:'start',action:'press'});f.demo.bindKey('Enter',{id:'start',action:'press'});
 key(f.root,'Space');key(f.root,'Enter');key(f.root,'Space',{type:'keyup'});assert.equal(f.demo.getState('start').pressed,true);
 f.renderer.handler({id:'start',type:'press',originalEvent:{pointerId:1}});key(f.root,'Enter',{type:'keyup'});assert.equal(f.demo.getState('start').pressed,true);
 f.renderer.handler({id:'start',type:'release',originalEvent:{pointerId:1}});assert.equal(f.demo.getState('start').pressed,false);assert.deepEqual(calls,['press','release']);
 key(f.root,'Space');f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(f.demo.getState('start').pressed,false);assert.deepEqual(calls,['press','release','press','release']);f.demo.dispose();
});

test('scene replacement fails closed, disposes textures/listeners and allows explicit new controller ownership',()=>{
 const f=fixture();f.demo.addLED('led',{anchor});f.demo.bindKey('KeyL',{id:'led',action:'toggle'});f.viewer.generation=1;f.viewer.dispatchEvent(new Event('ready'));assert.equal(f.demo.active,true);
 const renderer={...f.renderer,handler:null};f.viewer.renderer=renderer;f.viewer.dispatchEvent(new Event('ready'));assert.equal(f.demo.suspended,true);assert.equal(f.surfaces[0].disposed,1);assert.equal(f.renderer.handler,null);assert.throws(()=>f.demo.setLED('led',true),/suspended/);assert.equal(f.root.getAttribute('tabindex'),null);
 const newer=new DemoController(f.viewer),handler=renderer.handler;f.demo.dispose();assert.equal(renderer.handler,handler);newer.dispose();assert.equal(renderer.handler,null);
});

test('viewer disposal auto-disposes its controller and removes key handling',()=>{
 const f=fixture();f.root.setAttribute('tabindex','0');f.demo.addButton('b',{anchor});f.demo.bindKey('Space',{id:'b',action:'press'});f.viewer.disposed=true;f.viewer.dispatchEvent(new Event('dispose'));
 assert.equal(f.demo.disposed,true);assert.equal(f.surfaces[0].disposed,1);assert.equal(key(f.root,'Space').defaultPrevented,false);assert.equal(f.renderer.handler,null);
});

test('remove releases momentary state, unbinds its keys and releases the display pixel budget',()=>{
 const f=fixture(),releases=[];f.demo.addButton('button',{anchor,onRelease:e=>releases.push(e.cancelled)});f.demo.bindKey('Space',{id:'button',action:'press'});key(f.root,'Space');f.demo.remove('button');assert.deepEqual(releases,[true]);assert.equal(f.demo.bindings.size,0);assert.throws(()=>f.demo.getState('button'));
 f.demo.addDisplay('screen',{anchor,width:1024,height:1024});assert.equal(f.demo.pixels,1048576);f.demo.remove('screen');assert.equal(f.demo.pixels,0);f.demo.dispose();
});

test('callback errors are contained once per invocation and controls have explicit count limits',()=>{
 const f=fixture(),errors=[];f.demo.addEventListener('error',e=>errors.push(e.detail));f.demo.addButton('b',{anchor,onPress(){throw Error('host callback');}});f.renderer.handler({id:'b',type:'press'});assert.equal(errors.length,1);assert.equal(errors[0].phase,'callback');assert.equal(f.demo.getState('b').pressed,true);f.demo.release('b',{source:'pointer'});
 for(let i=1;i<64;i++)f.demo.addLED('l'+i,{anchor});assert.throws(()=>f.demo.addLED('limit',{anchor}),/64/);assert.throws(()=>f.demo.bindKey('Space',{id:'b',action:'press',repeat:'yes'}),/boolean/);f.demo.dispose();
});


test('named anchor faces and curved component frames retain actual geometry semantics',()=>{
 const f=fixture();f.demo.addLED('led',{anchor:{uuid:'led-body',face:'front'}});assert.equal(f.calls[0].options.anchor.face,'front');
 f.surfaces[0].getFace=()=>({shape:'component',center:[1,2,3],normal:null,width:2,height:3});assert.deepEqual(f.demo.getFace('led'),{shape:'component',center:[1,2,3],normal:null,width:2,height:3});
 assert.throws(()=>f.demo.addLED('bad',{anchor:{uuid:'led-body',face:'guess'}}),/named component face/);f.demo.dispose();
});
test('asynchronous control callback rejection is consumed once only while the bound scene is active',async()=>{
 const f=fixture(),errors=[];f.demo.addEventListener('error',e=>errors.push(e.detail));f.demo.addButton('button',{anchor,onPress:()=>Promise.reject(Error('async host failed'))});
 f.demo.press('button');await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,1);assert.match(errors[0].error.message,/async host failed/);
 f.demo.release('button');let fail;f.demo.records.get('button').options.onPress=()=>new Promise((resolve,reject)=>{fail=reject;});f.demo.press('button');f.demo.dispose();fail(Error('late host failure'));await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,1);
});
test('knob pointer press and release are input phases, not invalid button operations',()=>{
 const f=fixture(),inputs=[],errors=[];f.demo.addKnob('k',{anchor,min:0,max:10,step:1,value:3});f.demo.addEventListener('input',e=>inputs.push(e.detail));f.demo.addEventListener('error',e=>errors.push(e.detail));
 f.renderer.handler({id:'k',type:'press'});f.renderer.handler({id:'k',type:'change',value:7});f.renderer.handler({id:'k',type:'release'});assert.deepEqual(inputs.map(e=>e.type),['press','change','release']);assert.equal(f.demo.getState('k').value,7);assert.equal(errors.length,0);f.demo.dispose();
});

test('a release callback may remove or replace itself without disposing its successor',()=>{
 const f=fixture();f.demo.addButton('b',{anchor,onRelease:()=>{f.demo.remove('b');f.demo.addButton('b',{anchor});}});f.demo.press('b');f.demo.remove('b');assert.equal(f.surfaces[0].disposed,1);assert.equal(f.surfaces[1].disposed,0);assert.equal(f.demo.getState('b').kind,'button');f.demo.dispose();assert.equal(f.surfaces[1].disposed,1);
});

test('origin-clean or GPU upload failures report one error and preserve the controller',()=>{
 const f=fixture(),errors=[];f.demo.addDisplay('d',{anchor,width:1,height:1});f.demo.addEventListener('error',e=>errors.push(e.detail));f.surfaces[0].update=()=>{throw new DOMException('Canvas is not origin clean','SecurityError');};
 assert.equal(f.demo.drawDisplay('d',()=>{}),false);assert.equal(errors.length,1);assert.equal(errors[0].phase,'upload');assert.equal(errors[0].error.name,'SecurityError');
 assert.equal(f.demo.setPixels('d',new Uint8Array([1])),false);assert.equal(errors.length,2);assert.equal(errors[1].phase,'upload');assert.equal(f.demo.active,true);f.demo.dispose();
});

test('pointer cancellation without an original pointer event releases pointer holds but preserves keys',()=>{
 const f=fixture(),releases=[];f.demo.addButton('b',{anchor,onRelease:e=>releases.push(e.cancelled)});f.demo.bindKey('Space',{id:'b',action:'press'});
 key(f.root,'Space');f.renderer.handler({id:'b',type:'press',originalEvent:{pointerId:1}});f.renderer.handler({id:'b',type:'release',cancelled:true});assert.equal(f.demo.getState('b').pressed,true);key(f.root,'Space',{type:'keyup'});assert.equal(f.demo.getState('b').pressed,false);
 f.renderer.handler({id:'b',type:'press',originalEvent:{pointerId:2}});f.renderer.handler({id:'b',type:'release',cancelled:true});assert.equal(f.demo.getState('b').pressed,false);assert.equal(releases.at(-1),true);f.demo.dispose();
});

test('window blur releases held keyboard input while the document stays visible and removes its listener',()=>{
 const f=fixture(),releases=[];f.demo.addButton('b',{anchor,onRelease:event=>releases.push(event)});f.demo.bindKey('Space',{id:'b',action:'press'});
 let windowCancels=0;const cancel=f.demo._cancelHeld.bind(f.demo);f.demo._cancelHeld=reason=>{if(reason==='window')windowCancels++;return cancel(reason);};
 key(f.root,'Space');assert.equal(f.demo.getState('b').pressed,true);assert.equal(f.demo.held.size,1);assert.equal(f.doc.hidden,false);
 f.doc.defaultView.dispatchEvent(new Event('blur'));assert.equal(f.demo.getState('b').pressed,false);assert.equal(f.demo.held.size,0);assert.equal(releases.length,1);assert.equal(releases[0].cancelled,true);assert.equal(releases[0].reason,'window');assert.equal(windowCancels,1);
 f.demo.dispose();f.doc.defaultView.dispatchEvent(new Event('blur'));assert.equal(windowCancels,1);
});

test('full-color TFT defaults to 320 by 240 and preserves independent RGBA channels',()=>{
 const f=fixture();f.demo.addDisplay('tft',{anchor,mode:'tft'});assert.equal(f.demo.getState('tft').mode,'tft');assert.equal(f.surfaces[0].canvas.width,320);assert.equal(f.surfaces[0].canvas.height,240);
 const rgba=new Uint8Array(320*240*4);rgba.set([255,0,0,255,0,255,0,255,0,0,255,255,19,87,213,128]);assert.equal(f.demo.setPixels('tft',rgba,{format:'rgba'}),true);assert.deepEqual([...f.surfaces[0].canvas.getContext('2d').image.data.slice(0,16)],[255,0,0,255,0,255,0,255,0,0,255,255,19,87,213,128]);
 let size;assert.equal(f.demo.drawDisplay('tft',(ctx,canvas)=>{size=[canvas.width,canvas.height];ctx.fillStyle='#ff00cc';}),true);assert.deepEqual(size,[320,240]);assert.equal(f.demo.pixels,320*240);f.demo.remove('tft');assert.equal(f.demo.pixels,0);f.demo.dispose();
});
