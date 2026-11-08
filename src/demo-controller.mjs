/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Scripted presentation only. Native design contents remain unchanged.
const owners=new WeakMap(),MAX_CONTROLS=64,MAX_PIXELS=4*1024*1024;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const identifier=value=>{if(typeof value!=='string'||!value||value.length>128||/[\x00-\x1f\x7f]/.test(value))throw new TypeError('Choose a demo control ID of 1 to 128 characters.');return value;};
const finite=(value,min,max,label)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new TypeError('Choose a finite '+label+' from '+min+' to '+max+'.');return value;};
function color(value){if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw new TypeError('Use a six-digit hex demo color.');return value.toLowerCase();}
function callback(value,label){if(value!==undefined&&typeof value!=='function')throw new TypeError(label+' must be a function.');return value;}
function placement(options){
 if(!options||typeof options!=='object')throw new TypeError('Choose a source-bound anchor or a selected 3D face.');
 const result={...options};
 if(options.anchor){
  const anchor=options.anchor;if(typeof anchor!=='object')throw new TypeError('Choose a saved component anchor.');
  const out={};for(const key of ['uuid','reference','pinNumber'])if(anchor[key]!==undefined){if(typeof anchor[key]!=='string'||!anchor[key]||anchor[key].length>500||/[\x00-\x1f\x7f]/.test(anchor[key]))throw new TypeError('Choose a bounded saved anchor identity.');out[key]=anchor[key];}
  if(anchor.face!==undefined){if(!['top','bottom','front','back','left','right'].includes(anchor.face))throw new TypeError('Choose a named component face.');out.face=anchor.face;}
  if(!out.uuid&&!out.reference)throw new TypeError('An anchor needs a saved UUID or reference.');result.anchor=out;
 }
 if(!result.anchor&&!result.face)throw new TypeError('Choose a source-bound anchor or a selected 3D face.');
 return result;
}
function editablePath(event){return (event.composedPath?.()||[event.target]).some(node=>{
 const tag=String(node?.tagName||'').toLowerCase(),role=node?.getAttribute?.('role');
 return ['input','textarea','select','button','a'].includes(tag)||node?.isContentEditable||node?.getAttribute?.('contenteditable')==='true'||['textbox','searchbox','combobox','button','link','slider','spinbutton'].includes(role);
});}
function inside(node,root){for(let current=node;current;current=current.parentNode||current.getRootNode?.().host)if(current===root)return true;return false;}
const rgba=value=>{const hex=color(value);return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255];};

/** Source-bound controls and graphics driven exclusively by caller-provided functions. */
export class DemoController extends EventTarget {
 constructor(viewer){
  super();
  if(!viewer||typeof viewer.addEventListener!=='function'||!viewer.root?.addEventListener)throw new TypeError('Choose an existing KiCadViewer.');
  viewer.assertActive?.();
  const previous=owners.get(viewer);if(previous){previous._check();if(owners.get(viewer))throw new Error('This viewer already has an active demo controller.');}
  if(viewer.disposed||viewer.view!=='3d'||typeof viewer.source!=='string'||!viewer.source||typeof viewer.renderer?.createDemoSurface!=='function'||typeof viewer.renderer?.setDemoInputHandler!=='function')throw new Error('Load a supported 3D board before creating demo controls.');
  this.viewer=viewer;this.renderer=viewer.renderer;this.source=viewer.source;this.path=viewer.path;this.root=viewer.root;this.doc=viewer.host?.ownerDocument||viewer.root.ownerDocument;
  this.records=new Map();this.bindings=new Map();this.held=new Map();this.listeners=[];this.pixels=0;this.disposed=false;this.suspended=false;
  this.originalTabIndex=this.root.getAttribute?.('tabindex');this.ownsTabIndex=this.originalTabIndex===null||this.originalTabIndex===undefined;
  if(this.ownsTabIndex)this.root.setAttribute?.('tabindex','0');
  const listen=(target,type,handler,options)=>{target?.addEventListener?.(type,handler,options);this.listeners.push(()=>target?.removeEventListener?.(type,handler,options));};
  listen(viewer,'ready',()=>this._check());listen(viewer,'viewchange',()=>this._check());listen(viewer,'dispose',()=>this.dispose());
  listen(this.root,'keydown',event=>this._keyDown(event));listen(this.root,'keyup',event=>this._keyUp(event));
  listen(this.root,'focusout',event=>{if(!inside(event.relatedTarget,this.root))this._cancelHeld('focus');});
  listen(this.root,'pointerdown',event=>{if(this.active&&String(event.composedPath?.()[0]?.tagName||event.target?.tagName||'').toLowerCase()==='canvas')this.root.focus?.({preventScroll:true});},{capture:true});
  listen(this.doc,'visibilitychange',()=>{if(this.doc.hidden)this._cancelHeld('hidden');});
  listen(this.doc?.defaultView,'blur',()=>this._cancelHeld('window'));
  try{this.renderer.setDemoInputHandler(event=>this._input(event));owners.set(viewer,this);}catch(error){this._teardown();throw error;}
 }
 get active(){return !this.disposed&&!this.suspended&&!this.viewer.disposed&&this.viewer.view==='3d'&&this.viewer.source===this.source&&this.viewer.path===this.path&&this.viewer.renderer===this.renderer;}
 _check(){if(!this.disposed&&!this.suspended&&!this.active)this.suspend('The bound 3D scene changed. Recreate demo controls explicitly.');return this.active;}
 assertActive(){if(!this._check())throw new Error(this.disposed?'Demo controller has been disposed.':'Demo controller is suspended; recreate it for the current 3D scene.');}
 _emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 _error(id,phase,error){this._emit('error',{id,phase,error});}
 _invoke(fn,detail){if(!fn)return;try{const result=fn(detail);if(result&&typeof result.then==='function')Promise.resolve(result).catch(error=>{if(this._check())this._error(detail.id,'callback',error);});}catch(error){this._error(detail.id,'callback',error);}}
 _record(id,kind){this.assertActive();const record=this.records.get(identifier(id));if(!record||kind&&record.kind!==kind)throw new Error('Choose an existing '+(kind||'demo')+' control.');return record;}
 _add(id,kind,options,state){
  this.assertActive();identifier(id);if(this.records.has(id))throw new Error('Demo control IDs must be unique.');if(this.records.size>=MAX_CONTROLS)throw new RangeError('A demo supports at most 64 controls.');
  const placed=placement(options),surface=this.renderer.createDemoSurface(id,{...placed,...state,kind});
  if(!surface||typeof surface.dispose!=='function')throw new Error('The 3D renderer could not create this demo surface.');
  const record={id,kind,options:placed,state:{...state},surface,pressed:false,pressSources:new Set()};
  if(!this.active){surface.dispose();throw new Error('The bound 3D scene changed while creating a control.');}
  this.records.set(id,record);return record;
 }
 addLED(id,options={}){
  const state={on:options.on??false,brightness:options.brightness??1,color:color(options.color??'#65ff84')};if(typeof state.on!=='boolean')throw new TypeError('LED on must be boolean.');finite(state.brightness,0,1,'LED brightness');
  this._add(id,'led',options,state);return id;
 }
 setLED(id,patch){
  const record=this._record(id,'led');if(typeof patch==='boolean')patch={on:patch};if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['on','brightness','color'].includes(key)))throw new TypeError('Choose LED on, brightness and/or color.');
  const state={...record.state};if(own(patch,'on')){if(typeof patch.on!=='boolean')throw new TypeError('LED on must be boolean.');state.on=patch.on;}if(own(patch,'brightness'))state.brightness=finite(patch.brightness,0,1,'LED brightness');if(own(patch,'color'))state.color=color(patch.color);
  record.surface.setLED?.({...state});record.state=state;return this.getState(id);
 }
 addDisplay(id,options={}){
  const mode=options.mode??'oled';if(!['matrix','oled','lcd','tft'].includes(mode))throw new TypeError('Choose matrix, oled, lcd or tft display mode.');
  const colorDisplay=mode==='lcd'||mode==='tft',width=options.width??(mode==='matrix'?16:colorDisplay?320:128),height=options.height??(mode==='matrix'?8:colorDisplay?240:64);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)throw new RangeError('Display dimensions must be integers from 1 to 1024.');
  if(this.pixels+width*height>MAX_PIXELS)throw new RangeError('Demo display canvases are limited to four million pixels.');
  callback(options.onPress,'onPress');callback(options.onRelease,'onRelease');
  const record=this._add(id,'display',options,{mode,width,height});
  try{const canvas=record.surface.canvas;if(!canvas||canvas.width!==width||canvas.height!==height||!canvas.getContext?.('2d'))throw new Error('A display needs a matching 2D canvas surface.');this.pixels+=width*height;}
  catch(error){this.records.delete(id);record.surface.dispose();throw error;}return id;
 }
 drawDisplay(id,draw){
  const record=this._record(id,'display');if(typeof draw!=='function')throw new TypeError('Provide a synchronous canvas drawing function.');
  const canvas=record.surface.canvas;
  try{const result=draw(canvas.getContext('2d'),canvas);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});throw new TypeError('Display drawing callbacks must be synchronous.');}}
  catch(error){this._error(id,'draw',error);return false;}
  if(!this.active||this.records.get(id)!==record)return false;try{record.surface.update?.();return true;}catch(error){this._error(id,'upload',error);return false;}
 }
 writeImage(id,image){return this.drawDisplay(id,(context,canvas)=>{context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);});}
 setPixels(id,pixels,{format,foreground,background}={}){
  const record=this._record(id,'display'),{width,height,mode}=record.state;
  if(!(pixels instanceof Uint8Array)&&!(pixels instanceof Uint8ClampedArray))throw new TypeError('Display pixels must be Uint8Array or Uint8ClampedArray.');
  format??=pixels.length===width*height*4?'rgba':'mono';if(!['rgba','mono','mono1'].includes(format))throw new TypeError('Choose rgba, mono or mono1 pixels.');
  const stride=Math.ceil(width/8),expected=format==='rgba'?width*height*4:format==='mono1'?stride*height:width*height;if(pixels.length!==expected)throw new RangeError('Pixel byte length does not match this display and format.');
  const context=record.surface.canvas.getContext('2d'),image=context.createImageData(width,height);
  if(format==='rgba')image.data.set(pixels);else{
   const on=rgba(foreground??(mode==='matrix'?'#65ff84':'#e6ffff')),off=rgba(background??'#000000');
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const lit=format==='mono1'?(pixels[y*stride+(x>>3)]&(128>>(x&7))):pixels[y*width+x];image.data.set(lit?on:off,(y*width+x)*4);}
  }
  context.putImageData(image,0,0);if(!this.active||this.records.get(id)!==record)return false;try{record.surface.update?.();return true;}catch(error){this._error(id,'upload',error);return false;}
 }
 addButton(id,options={}){callback(options.onPress,'onPress');callback(options.onRelease,'onRelease');this._add(id,'button',options,{pressed:false});return id;}
 addKnob(id,options={}){
  const min=finite(options.min??0,-1e6,1e6,'knob minimum'),max=finite(options.max??100,-1e6,1e6,'knob maximum'),step=finite(options.step??1,1e-6,2e6,'knob step');if(max<=min||step>max-min)throw new RangeError('A knob needs maximum above minimum and a step within its range.');
  callback(options.onChange,'onChange');const value=this._knobValue({min,max,step},options.value??min);this._add(id,'knob',options,{min,max,step,value});return id;
 }
 _knobValue(state,value){finite(value,-1e9,1e9,'knob value');const bounded=Math.max(state.min,Math.min(state.max,value));return Math.max(state.min,Math.min(state.max,state.min+Math.round((bounded-state.min)/state.step)*state.step));}
 setKnob(id,value,{source='script'}={}){
  const record=this._record(id,'knob'),next=this._knobValue(record.state,value);if(next===record.state.value)return false;record.surface.setValue?.(next);record.state.value=next;
  const detail={id,type:'change',value:next,source};this._invoke(record.options.onChange,detail);this._emit('input',detail);return true;
 }
 change(id,delta,{source='script'}={}){const record=this._record(id,'knob');finite(delta,-1e6,1e6,'knob delta');return this.setKnob(id,record.state.value+delta*record.state.step,{source});}
 press(id,detail={}){
  const record=this._record(id);if(!['button','display'].includes(record.kind))throw new Error('Press a button or display control.');
  const token=this._pressToken(detail);record.pressSources.add(token);if(record.pressed)return false;
  record.surface.setValue?.(1);record.pressed=true;record.state.pressed=true;const input={...detail,id,type:'press',source:detail.source||'script'};this._invoke(record.options.onPress,input);this._emit('input',input);return true;
 }
 _pressToken(detail){return detail.source==='keyboard'?'key:'+detail.code:detail.source==='pointer'?'pointer:'+(detail.originalEvent?.pointerId??'primary'):'script';}
 _releaseRecord(record,detail={},force=false){
  if(force)record.pressSources.clear();else if(detail.cancelled&&detail.source==='pointer'&&detail.originalEvent?.pointerId===undefined){for(const token of record.pressSources)if(token.startsWith('pointer:'))record.pressSources.delete(token);}else record.pressSources.delete(this._pressToken(detail));if(record.pressSources.size)return false;
  if(!record.pressed)return false;record.pressed=false;record.state.pressed=false;if(this.active)record.surface.setValue?.(0);
  const input={...detail,id:record.id,type:'release',source:detail.source||'script'};this._invoke(record.options.onRelease,input);this._emit('input',input);return true;
 }
 release(id,detail={}){const record=this._record(id);return this._releaseRecord(record,detail);}
 toggle(id,{source='script'}={}){const record=this._record(id);if(record.kind==='led'){const state=this.setLED(id,{on:!record.state.on});this._emit('input',{id,type:'change',value:state.on,source});return state.on;}if(record.kind==='button'||record.kind==='display')return record.pressed?this.release(id,{source}):this.press(id,{source});throw new Error('Toggle an LED or button control.');}
 _input(event){
  if(!this._check()||!event||typeof event.id!=='string')return;const record=this.records.get(event.id);if(!record)return;
  const detail={source:'pointer',...(event.uv?{uv:{...event.uv}}:{}),...(event.originalEvent?{originalEvent:event.originalEvent}:{})};
  try{if(record.kind==='knob'&&['press','release'].includes(event.type)){this._emit('input',{...detail,id:event.id,type:event.type,value:record.state.value,cancelled:Boolean(event.cancelled)});return;}if(event.type==='press')this.press(event.id,detail);else if(event.type==='release')this.release(event.id,{...detail,cancelled:Boolean(event.cancelled)});else if(event.type==='change'&&record.kind==='knob'){if(event.value!==undefined)this.setKnob(event.id,event.value,detail);else if(event.delta!==undefined)this.change(event.id,event.delta,detail);}}
  catch(error){this._error(event.id,'input',error);}
 }
 focus(){this.assertActive();if(typeof this.root.focus!=='function')return false;this.root.focus({preventScroll:true});return true;}
 getFace(id){
  const record=this._record(id),face=record.surface.getFace?.()||record.surface.face;
  if(!face)throw new Error('The demo surface does not expose its actual face frame.');
  const vector=value=>{const out=Array.isArray(value)?[...value]:[value?.x,value?.y,value?.z];if(out.length!==3||!out.every(n=>typeof n==='number'&&Number.isFinite(n)))throw new Error('Invalid demo surface face frame.');return out;};
  const out={center:vector(face.center),normal:face.normal===null?null:vector(face.normal),width:finite(face.width,Number.MIN_VALUE,1e7,'face width'),height:finite(face.height,Number.MIN_VALUE,1e7,'face height')};
  if(face.shape!==undefined){if(!['component','face'].includes(face.shape))throw new Error('Invalid demo surface shape.');out.shape=face.shape;}
  for(const key of ['up','right'])if(face[key])out[key]=vector(face[key]);return out;
 }
 getState(id){const record=this._record(id);return {id:record.id,kind:record.kind,...record.state};}
 bindKey(code,options={}){
  this.assertActive();if(typeof code!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(code))throw new TypeError('Use a KeyboardEvent.code such as KeyL, Space or ArrowUp.');
  if(!options||typeof options!=='object')throw new TypeError('Choose a key action or callbacks.');
  for(const key of ['repeat','preventDefault','ctrlKey','metaKey','altKey','shiftKey'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw new TypeError('Key flags must be boolean.');
  if(options.id!==undefined){const record=this._record(options.id);if(!['press','toggle','increment','decrement'].includes(options.action))throw new TypeError('Choose press, toggle, increment or decrement.');if(options.action==='press'&&!['button','display'].includes(record.kind)||['increment','decrement'].includes(options.action)&&record.kind!=='knob'||options.action==='toggle'&&!['led','button','display'].includes(record.kind))throw new TypeError('Key action does not match this demo control.');}
  else if(!callback(options.onDown,'onDown')&&!callback(options.onUp,'onUp'))throw new TypeError('Provide a control ID/action or onDown/onUp callbacks.');
  callback(options.onDown,'onDown');callback(options.onUp,'onUp');if(!this.bindings.has(code)&&this.bindings.size>=128)throw new RangeError('A demo supports at most 128 key bindings.');
  this.unbindKey(code);this.bindings.set(code,{...options});return ()=>this.unbindKey(code);
 }
 unbindKey(code){if(this.held.has(code))this._keyRelease(code,{cancelled:true,source:'keyboard'});return this.bindings.delete(code);}
 _keyDown(event){
  if(event.defaultPrevented||!this._check()||event.isComposing||editablePath(event))return;const binding=this.bindings.get(event.code);if(!binding||['ctrlKey','metaKey','altKey','shiftKey'].some(key=>Boolean(event[key])!==Boolean(binding[key])))return;
  if(this.held.has(event.code)&&!binding.repeat||event.repeat&&!binding.repeat)return;
  if(binding.preventDefault!==false)event.preventDefault?.();const first=!this.held.has(event.code);this.held.set(event.code,binding);
  const detail={source:'keyboard',code:event.code,originalEvent:event};
  try{if(binding.id!==undefined){if(binding.action==='press')this.press(binding.id,detail);else if(binding.action==='toggle'){if(first)this.toggle(binding.id,detail);}else this.change(binding.id,binding.action==='increment'?1:-1,detail);}this._invoke(binding.onDown,{...detail,id:binding.id});}
  catch(error){this._error(binding.id,'keyboard',error);}
 }
 _keyRelease(code,detail){
  const binding=this.held.get(code);if(!binding)return false;this.held.delete(code);
  try{if(binding.id!==undefined&&binding.action==='press'){const record=this.records.get(binding.id);if(record)this._releaseRecord(record,{...detail,code});}this._invoke(binding.onUp,{...detail,id:binding.id,code});}
  catch(error){this._error(binding.id,'keyboard',error);}return true;
 }
 _keyUp(event){if(!this.held.has(event.code))return;const binding=this.held.get(event.code);if(binding.preventDefault!==false)event.preventDefault?.();this._keyRelease(event.code,{source:'keyboard',code:event.code,originalEvent:event});}
 _cancelHeld(reason){for(const code of [...this.held.keys()])this._keyRelease(code,{source:'keyboard',cancelled:true,reason});for(const record of this.records.values())if(record.pressed){try{this._releaseRecord(record,{source:'pointer',cancelled:true,reason},true);}catch(error){this._error(record.id,'release',error);}}}
 remove(id){const record=this._record(id);for(const [code,binding]of this.bindings)if(binding.id===id)this.unbindKey(code);this._releaseRecord(record,{cancelled:true,reason:'removed'},true);if(this.records.get(id)!==record)return true;this.records.delete(id);if(record.kind==='display')this.pixels-=record.state.width*record.state.height;record.surface.dispose();return true;}
 _teardown(){
  this._cancelHeld('scene');for(const stop of this.listeners)stop();this.listeners=[];this.bindings.clear();this.held.clear();
  const renderer=this.renderer;this.renderer=null;try{renderer?.setDemoInputHandler?.(null);}catch(error){this._error(undefined,'dispose',error);}
  for(const record of this.records.values())try{record.surface.dispose();}catch(error){this._error(record.id,'dispose',error);}this.records.clear();this.pixels=0;
  if(this.ownsTabIndex){if(this.root.getAttribute?.('tabindex')==='0')this.root.removeAttribute?.('tabindex');this.ownsTabIndex=false;}
  if(owners.get(this.viewer)===this)owners.delete(this.viewer);
 }
 suspend(reason='The bound 3D scene changed.') {if(this.disposed||this.suspended)return;this.suspended=true;this._teardown();this._emit('suspend',{reason});}
 dispose(){if(this.disposed)return;this.disposed=true;this._teardown();}
}

/** Internal camera-shortcut arbitration: explicit host demo bindings win. */
export function demoClaimsKey(viewer,event){const demo=owners.get(viewer),binding=demo?.active&&demo.bindings.get(event.code);return Boolean(binding&&!event.isComposing&&!editablePath(event)&&['ctrlKey','metaKey','altKey','shiftKey'].every(key=>Boolean(event[key])===Boolean(binding[key])));}
