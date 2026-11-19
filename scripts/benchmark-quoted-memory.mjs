/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Parser-stage stress only: source is allocated before heap measurement.
import {createRequire} from 'node:module';
const diff=createRequire(import.meta.url)('../engine/design-diff.js'),mib=Number(process.argv[2]||4);
if(!Number.isInteger(mib)||mib<1||mib>8||!globalThis.gc)throw Error('Run node --expose-gc scripts/benchmark-quoted-memory.mjs with 1–8 MiB.');
const source='(kicad_pcb (embedded_files (file (data "'+'A'.repeat(mib*1024*1024)+'"))))';
Buffer.byteLength(source);globalThis.gc();const before=process.memoryUsage().heapUsed,start=performance.now(),ast=diff.parse(source),parseMs=performance.now()-start,sampled=process.memoryUsage().heapUsed;globalThis.gc();
console.log(JSON.stringify({payloadBytes:mib*1024*1024,parseMs,retainedHeapDelta:process.memoryUsage().heapUsed-before,sampledHeapDelta:sampled-before,maxRSSKiB:process.resourceUsage().maxRSS,valueLength:ast[1][1][1][1].quoted.length,scope:'One quoted parser value; existing source excluded, no rendering/GPU/phone measurement.'}));
