/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import '../src/kicad-viewer.mjs';
/** UI demonstration data only: intentionally no electrical/thermal model. */
export function buildAnalysisDemo(root,output) {
 const source=fs.readFileSync(root+'/fixtures/inverter/3PD+IB.kicad_pcb','utf8');
 const design=globalThis.KiCadPCBRenderer.build(globalThis.KiCadDesignDiff.parse(source),'3PD+IB.kicad_pcb');
 const b=globalThis.KiCadOwnedCanvas.bounds(design.primitives.filter(p=>p.layer==='Edge.Cuts'));
 const cells=[];
 for(let y=0;y<12;y++)for(let x=0;x<12;x++)cells.push({x:b.x+b.w*(.1+x*.8/12),y:b.y+b.h*(.1+y*.8/12),width:b.w*.8/12,height:b.h*.8/12,value:Math.round(100*(x+y)/22)});
 const data={schema:'kicad-webview.analysis/v1',coordinateSystem:'kicad-mm',board:{sha256:createHash('sha256').update(source,'utf8').digest('hex'),path:'3PD+IB.kicad_pcb'},provenance:{kind:'illustrative',tool:'KiCad WebView UI demonstration generator',runId:'inverter-illustrative-v1',assumptions:['These values are illustrative display data, not PI or thermal solver results.','A rectangular sampling patch is positioned using the saved board outline bounds; cells are not clipped to copper or the board shape.','Cell values are an arbitrary deterministic gradient. No materials, loads, current paths or boundary conditions were evaluated.','Do not use these values for engineering decisions.']},fields:[{id:'voltage-drop',name:'Voltage drop · illustrative',unit:'mV',layer:'F.Cu',range:[0,100],samples:cells},{id:'current-density',name:'Current density · illustrative',unit:'A/mm²',layer:'F.Cu',range:[0,10],samples:cells.map(c=>({...c,value:c.value/10}))},{id:'temperature',name:'Temperature · illustrative',unit:'°C',range:[20,80],samples:cells.map(c=>({...c,value:20+c.value*.6}))}]};
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(output+'/inverter-illustrative.json',JSON.stringify(data)+'\n');
}
