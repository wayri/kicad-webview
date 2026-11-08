/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {KiCadViewer,EMBED_API_VERSION} from '../src/index-lite.mjs';
const viewer=new KiCadViewer('#board',{theme:'dark'}),status=document.querySelector('#status');
const fail=error=>{status.textContent=error.message;};
try{await viewer.load('./demo/project.json',{view:'pcb'});status.textContent='API '+EMBED_API_VERSION+' · PCB ready. Optional 3D and analysis load only when requested.';}catch(error){fail(error);}
document.querySelector('#analysis').onclick=async()=>{try{await viewer.setView('pcb');const response=await fetch('./analysis/inverter-illustrative.json');if(!response.ok)throw Error('Results unavailable.');await viewer.setAnalysis(await response.json());status.textContent='Illustrative display data only · not PI or thermal solver results.';}catch(error){fail(error);}};
document.querySelector('#three').onclick=async()=>{try{await viewer.setView('3d');status.textContent='3D renderer loaded on request; missing models may use disclosed approximate stand-ins.';}catch(error){fail(error);}};
window.addEventListener('pagehide',()=>viewer.dispose(),{once:true});
