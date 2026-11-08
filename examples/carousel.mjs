/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {KiCadViewer,ViewerCarousel} from '../src/index.mjs';
const viewer=new KiCadViewer('#viewer',{theme:'dark'}),message=document.querySelector('#message');
const manifest=new URL('./demo/project.json',location.href).href;
let carousel;
const projectSlides=[
 {label:'The complete inverter · layout',input:manifest,view:'pcb',clearSelection:true},
 {label:'The main schematic',input:manifest,options:{file:'3PD+IB.kicad_sch'},view:'schematic',clearSelection:true},
 {label:'Gate-driver sheet · saved project source',input:manifest,options:{file:'HBD21094.kicad_sch'},view:'schematic',clearSelection:true},
 {label:'Board assembly · live 3D',input:manifest,view:'3d',camera3D:'isometric',clearSelection:true},
 {label:'Phase A · copper and connected parts',view:'3d',camera3D:'top',net:'/Pa'},
];
const boardSlides=[
 {label:'Assembly · isometric',input:manifest,view:'3d',camera3D:'isometric',clearSelection:true},
 {label:'Phase A net · highlighted copper',view:'3d',camera3D:'top',net:'/Pa'},
 {label:'Follow the same net to the back',view:'3d',camera3D:'bottom',net:'/Pa'},
 {label:'Board profile · front',view:'3d',camera3D:'front',clearSelection:true},
 {label:'Return to the assembly',view:'3d',camera3D:'isometric',clearSelection:true},
];
function choose(which){carousel?.dispose();message.textContent='';for(const name of ['project','board'])document.querySelector('#'+name+'-tour').setAttribute('aria-pressed',String(name===which));carousel=new ViewerCarousel('#controls',{viewer,slides:which==='project'?projectSlides:boardSlides,interval:6000});carousel.addEventListener('error',e=>message.textContent=e.detail.error.message);carousel.show(0).catch(()=>{});}
document.querySelector('#project-tour').onclick=()=>choose('project');document.querySelector('#board-tour').onclick=()=>choose('board');choose('board');
window.addEventListener('pagehide',()=>{carousel?.dispose();viewer.dispose();},{once:true});
