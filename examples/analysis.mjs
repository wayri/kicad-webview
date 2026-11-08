/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {KiCadViewer} from '../src/kicad-viewer.mjs';
const viewer=new KiCadViewer('#drawing',{theme:'dark'}),message=document.querySelector('#message');
async function restore(){try{const response=await fetch('./analysis/inverter-illustrative.json');if(!response.ok)throw Error('Cannot load demonstration results.');await viewer.setAnalysis(await response.json());message.textContent='Choose voltage drop, current density or temperature. Probe cells, adjust opacity, and switch layers/views. All values are illustrative.';}catch(error){message.textContent=error.message;}}
try{await viewer.load('./demo/project.json',{view:'pcb'});await restore();}catch(error){message.textContent=error.message;}
document.querySelector('#clear').onclick=()=>{viewer.clearAnalysis();message.textContent='Results cleared. The saved board is unchanged.';};
document.querySelector('#restore').onclick=restore;
window.addEventListener('pagehide',()=>viewer.dispose(),{once:true});
