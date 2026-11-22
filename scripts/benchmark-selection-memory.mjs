/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url);
const THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
const source=path.resolve(process.argv[2]||fileURLToPath(new URL('../engine/spike/selectionAppearance.mjs',import.meta.url)));
const count=Number(process.argv[3]||2048),cycles=Number(process.argv[4]||8);
if(!Number.isInteger(count)||count<1||count>32768||!Number.isInteger(cycles)||cycles<1||cycles>100)throw Error('Use 1..32768 occurrences and 1..100 cycles.');
if(typeof global.gc!=='function')throw Error('Run with --expose-gc in separate baseline/candidate processes.');
const {createSelectionAppearance}=await import(pathToFileURL(source));
const geometry=new THREE.BoxGeometry(),sources=[new THREE.MeshStandardMaterial({color:0x428751}),new THREE.MeshStandardMaterial({color:0xc5aa6c})];
let clones=0,disposals=0;for(const source of sources){const clone=source.clone.bind(source);source.clone=()=>{clones++;const material=clone();material.addEventListener('dispose',()=>disposals++);return material;};}
const meshes=Array.from({length:count},(_,i)=>{const mesh=new THREE.Mesh(geometry,sources);mesh.userData.record={type:'Component',ref:'U'+i};return mesh;});
const appearance=createSelectionAppearance(THREE,()=>meshes);global.gc();const before=process.memoryUsage().heapUsed;let sampledPeak=before;const started=performance.now();
for(let cycle=0;cycle<cycles;cycle++){
 for(let selected=0;selected<4;selected++){
  appearance.update(record=>record?.ref==='U'+selected,true,null,{mode:'isolate',color:'source'});
  sampledPeak=Math.max(sampledPeak,process.memoryUsage().heapUsed);
 }
 appearance.restore();sampledPeak=Math.max(sampledPeak,process.memoryUsage().heapUsed);
}
const elapsedMs=performance.now()-started;appearance.dispose();global.gc();const retained=process.memoryUsage().heapUsed;
console.log(JSON.stringify({sourceSHA256:createHash('sha256').update(readFileSync(source)).digest('hex'),occurrences:count,sourceMaterials:sources.length,cycles,clones,disposals,heapBeforeBytes:before,sampledPeakHeapBytes:sampledPeak,retainedHeapAfterClearBytes:retained,additionalRetainedBytes:retained-before,elapsedMs,rssHighWaterKiB:process.resourceUsage().maxRSS,scope:'Isolated CPU scene/material selection stress; no WebGL, process-wide GPU or physical-phone claim'},null,2));
geometry.dispose();sources.forEach(material=>material.dispose());
