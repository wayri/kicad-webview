/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {demoClaimsKey} from './demo-controller.mjs';
const directions=['left','right','up','down','clockwise','counterclockwise'];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);if(n<1e-8)throw new TypeError('Choose a nondegenerate camera.');return a.map(x=>x/n);};
const turn=(v,axis,a)=>{const c=Math.cos(a),s=Math.sin(a),dot=v.reduce((n,x,i)=>n+x*axis[i],0),normal=cross(axis,v);return v.map((x,i)=>x*c+normal[i]*s+axis[i]*dot*(1-c));};
/** Relative camera movement keeps the inspection target and distance intact. */
export function rotatedCamera3D(state,direction,degrees=15){
 if(!directions.includes(direction)||typeof degrees!=='number'||!Number.isFinite(degrees)||degrees<=0||degrees>90)throw new TypeError('Choose a rotation direction and angle from 0 to 90 degrees.');
 for(const name of ['position','target','up'])if(!Array.isArray(state?.[name])||state[name].length!==3||!state[name].every(Number.isFinite))throw new TypeError('Choose a finite 3D camera.');
 let offset=state.position.map((n,i)=>n-state.target[i]),up=unit(state.up);const view=unit(offset),dot=up.reduce((n,x,i)=>n+x*view[i],0);up=unit(up.map((x,i)=>x-dot*view[i]));const right=unit(cross(up,view));let axis,a=degrees*Math.PI/180;
 if(direction==='left'||direction==='right'){axis=up;if(direction==='right')a=-a;offset=turn(offset,axis,a);}
 else if(direction==='up'||direction==='down'){axis=right;if(direction==='up')a=-a;offset=turn(offset,axis,a);up=turn(up,axis,a);}
 else {if(direction==='counterclockwise')a=-a;up=turn(up,view,a);}
 return {position:offset.map((n,i)=>n+state.target[i]),target:[...state.target],up};
}
const editable=event=>(event.composedPath?.()||[event.target]).some(n=>n?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(n?.tagName||'')||['slider','combobox','textbox','spinbutton','button','menuitem'].includes(n?.getAttribute?.('role')));
export function cameraShortcut(event){
 if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||editable(event))return null;
 const presets={Digit0:'isometric',Numpad0:'isometric',Digit1:'top',Numpad1:'top',Digit2:'bottom',Numpad2:'bottom',Digit3:'front',Numpad3:'front',Digit4:'back',Numpad4:'back',Digit5:'left',Numpad5:'left',Digit6:'right',Numpad6:'right'};
 if(event.shiftKey){const rotations={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyQ:'counterclockwise',KeyE:'clockwise'};if(rotations[event.code])return {type:'rotate',value:rotations[event.code]};if(event.code==='Equal')return {type:'zoom',value:1.2};return null;}
 if(presets[event.code])return {type:'view',value:presets[event.code]};if(event.code==='KeyF')return {type:'fit'};
 if(['Equal','NumpadAdd'].includes(event.code))return {type:'zoom',value:1.2};if(['Minus','NumpadSubtract'].includes(event.code))return {type:'zoom',value:1/1.2};return null;
}
export const NAVIGATION_STYLE=`
.viewer-navigation{position:absolute;right:8px;bottom:8px;z-index:3;display:grid;gap:3px;width:156px;max-width:calc(100% - 16px);max-height:calc(100% - 64px);overflow:auto;overscroll-behavior:contain;padding:5px;border:1px solid var(--viewer-border);border-radius:9px;background:var(--viewer-bar);color:var(--viewer-ink);box-shadow:var(--viewer-shadow)}
.viewer-navigation-row{display:flex;gap:2px;min-width:0}.viewer-navigation button{display:inline-flex;align-items:center;justify-content:center;flex:1;min-width:0;min-height:29px;border:0;border-radius:5px;padding:4px 2px;background:transparent;color:var(--viewer-ink);font:600 11px/1.2 system-ui;cursor:pointer}.viewer-navigation button:hover{background:var(--viewer-hover);color:var(--viewer-accent)}.viewer-navigation button:focus-visible{outline:2px solid var(--viewer-accent);outline-offset:-2px}.viewer-navigation-row:not(:first-child) button{font-size:17px}.viewer-navigation[hidden]{display:none!important}@media(pointer:coarse){.viewer-navigation button{min-height:36px}}
@container (max-width:540px){.viewer-navigation{width:196px}.viewer-navigation button{min-height:40px;min-width:40px}}
@media(pointer:coarse){.viewer-navigation{width:208px}.viewer-navigation button{min-width:44px;min-height:44px}}
`;
export function createViewerNavigation(viewer,onError){
 const doc=viewer.host.ownerDocument,panel=doc.createElement('div');panel.className='viewer-navigation';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','3D view and rotation');
 const rows=[['Top','Top view (1)',{type:'view',value:'top'}],['Bottom','Bottom view (2)',{type:'view',value:'bottom'}],['Iso','Isometric view (0)',{type:'view',value:'isometric'}],
 ['←','Rotate view left (Shift + Left)',{type:'rotate',value:'left'}],['↑','Tilt view up (Shift + Up)',{type:'rotate',value:'up'}],['↓','Tilt view down (Shift + Down)',{type:'rotate',value:'down'}],['→','Rotate view right (Shift + Right)',{type:'rotate',value:'right'}],
 ['↶','Roll counterclockwise (Shift + Q)',{type:'rotate',value:'counterclockwise'}],['↷','Roll clockwise (Shift + E)',{type:'rotate',value:'clockwise'}],['−','Zoom out (−)',{type:'zoom',value:1/1.2}],['+','Zoom in (+)',{type:'zoom',value:1.2}]];
 const apply=action=>{if(viewer.disposed||viewer.view!=='3d'||!viewer.renderer)return false;if(action.type==='view')return viewer.setCamera3D(action.value);if(action.type==='rotate')return viewer.rotate3D(action.value);if(action.type==='fit')return viewer.fit();if(action.type==='zoom')return viewer.renderer.zoom?.(action.value);};
 const Observer=doc.defaultView?.ResizeObserver||globalThis.ResizeObserver;
 let observedRenderer=null;
 const layout=()=>{const rect=viewer.stage.getBoundingClientRect?.(),tools=viewer.renderer?.host?.shadowRoot?.querySelector?.('.bar')?.getBoundingClientRect?.();if(rect&&tools)panel.style.maxHeight=Math.max(32,rect.height-Math.max(0,tools.bottom-rect.top)-16)+'px';};
 const observer=Observer?new Observer(layout):null;
 const buttons=[];let row;
 for(const [i,[text,label,action]]of rows.entries()){if(i===0||i===3||i===7){row=doc.createElement('div');row.className='viewer-navigation-row';panel.append(row);}const button=doc.createElement('button');button.type='button';button.textContent=text;button.title=label;button.setAttribute('aria-label',label);button.onclick=()=>{try{apply(action);}catch(error){onError(error);}};buttons.push(button);row.append(button);}
 const keydown=event=>{if(viewer.view!=='3d'||!viewer.renderer||demoClaimsKey(viewer,event))return;const action=cameraShortcut(event);if(!action)return;try{apply(action);event.preventDefault();event.stopPropagation();}catch(error){onError(error);}};
 const pointerdown=event=>{if(viewer.view==='3d'&&(event.composedPath?.()||[]).some(node=>node?.tagName==='CANVAS'))viewer.root.focus?.({preventScroll:true});};
 const priorTab=viewer.root.getAttribute?.('tabindex')??null;if(priorTab===null)viewer.root.setAttribute('tabindex','0');viewer.root.addEventListener?.('keydown',keydown);viewer.root.addEventListener?.('pointerdown',pointerdown);
 return {panel,update(){panel.hidden=viewer.view!=='3d'||!viewer.renderer;if(panel.parentNode!==viewer.stage)viewer.stage.append(panel);if(observedRenderer!==viewer.renderer){observer?.disconnect();observedRenderer=viewer.renderer;observer?.observe(viewer.stage);const tools=viewer.renderer?.host?.shadowRoot?.querySelector?.('.bar');if(tools)observer?.observe(tools);}layout();},dispose(){observer?.disconnect();viewer.root.removeEventListener?.('keydown',keydown);viewer.root.removeEventListener?.('pointerdown',pointerdown);for(const button of buttons)button.onclick=null;if(priorTab===null&&viewer.root.getAttribute?.('tabindex')==='0')viewer.root.removeAttribute?.('tabindex');panel.remove();}};
}
