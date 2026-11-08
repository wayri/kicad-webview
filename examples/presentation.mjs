/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {Viewer} from '../src/index.mjs';
const viewer=new Viewer('#viewer',{theme:'dark'}),status=document.querySelector('#status');
const buttons=[...document.querySelectorAll('button')];let spinning=false,frame=0,last=0,preferred='presentation';
function stop(){spinning=false;cancelAnimationFrame(frame);frame=0;last=0;document.querySelector('#orbit').textContent='Start turntable';document.querySelector('#orbit').setAttribute('aria-pressed','false');}
function tick(now){frame=0;if(!spinning||document.hidden)return;if(last){viewer.rotate3D('right',Math.min(1.5,(now-last)*.008));}last=now;frame=requestAnimationFrame(tick);}
function quality(value){stop();preferred=value;const actual=viewer.setRenderQuality(value);for(const name of ['standard','presentation'])document.querySelector('#'+name).setAttribute('aria-pressed',String(name===(actual==='presentation'?'presentation':'standard')));status.textContent=actual==='presentation'?'Presentation · studio stage, 24-sample occlusion and enhanced shadows. Drag to orbit; click to inspect.':'Standard · responsive everyday rendering. Enhanced effects may depend on your graphics device.';}
document.querySelector('#standard').onclick=()=>quality('balanced');document.querySelector('#presentation').onclick=()=>quality('presentation');
document.querySelector('#orbit').onclick=()=>{if(spinning)return stop();spinning=true;last=0;document.querySelector('#orbit').textContent='Pause turntable';document.querySelector('#orbit').setAttribute('aria-pressed','true');frame=requestAnimationFrame(tick);};
for(const [id,camera]of [['top','top'],['iso','isometric']])document.querySelector('#'+id).onclick=()=>{stop();viewer.setCamera3D(camera);};
viewer.root.addEventListener('pointerdown',stop,{capture:true});viewer.root.addEventListener('wheel',stop,{capture:true,passive:true});viewer.root.addEventListener('keydown',stop,{capture:true});
viewer.addEventListener('viewchange',()=>{stop();const enabled=viewer.view==='3d';for(const button of buttons)button.disabled=!enabled;if(enabled)quality(preferred);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',()=>{stop();viewer.dispose();},{once:true});
try{await viewer.load('./demo/project.json',{view:'3d'});for(const button of buttons)button.disabled=false;viewer.fit();}catch(error){status.textContent=error.message;stop();}
