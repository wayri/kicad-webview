/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Isolated real-source preparation. No WebGL, textures or browser-process claim.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const [profile,file]=process.argv.slice(2),require=createRequire(import.meta.url),diff=require('../engine/design-diff.js');
if(!['shared','separate'].includes(profile)||!file||!globalThis.gc)throw Error('Use node --expose-gc --max-old-space-size=768 scripts/benchmark-project-memory.mjs shared|separate board.kicad_pcb');
const stat=fs.statSync(file);if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Choose a PCB up to64MiB for this bounded benchmark.');
const esbuild=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'esbuild')):require('esbuild');
const result=await esbuild.build({entryPoints:[fileURLToPath(new URL('../engine/spike-source/boardParser.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const {parseKicadBoard}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const source=fs.readFileSync(file,'utf8'),sha256=createHash('sha256').update(source).digest('hex'),files=[{path:'board.kicad_pcb',content:source}];
globalThis.gc();const before=process.memoryUsage(),start=performance.now(),snapshot=diff.prepareProject(files,{forConnectivity:profile==='shared'}),preparedMs=performance.now()-start;
const board=parseKicadBoard(source,profile==='shared'?diff.preparedFile(snapshot,'board.kicad_pcb',source):undefined),sample=process.memoryUsage(),totalMs=performance.now()-start;globalThis.gc();
const retained=process.memoryUsage();console.log(JSON.stringify({profile,sourceBytes:stat.size,sha256,counts:{parts:board.components.length,pads:board.pads.length,tracks:board.tracks.length,zones:board.zones.length,layers:board.layers.length},preparedMs,totalMs,heapBefore:before.heapUsed,sampledHeap:sample.heapUsed,retainedHeap:retained.heapUsed,retainedHeapDelta:retained.heapUsed-before.heapUsed,processRSSHighWaterKiB:process.resourceUsage().maxRSS,scope:'Prepared source plus parsed3D board only. Separate profile retains comparison metadata and retokenizes; shared profile uses compact preparation and validated AST. No WebGL/GPU/browser/physical-phone measurement.'}));
