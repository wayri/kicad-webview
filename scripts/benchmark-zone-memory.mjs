/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Isolated reader/drawing benchmark. No GPU or whole-browser memory claim.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url),file=process.argv[2],mode=process.argv[3]||'lazy';
if(!file||!['eager','lazy','cycle'].includes(mode)||!globalThis.gc)throw Error('Use node --expose-gc scripts/benchmark-zone-memory.mjs BOARD eager|lazy|cycle');
const {parse}=require('../engine/design-diff.js'),renderer=require('../engine/pcb-renderer.js');
const sample=()=>{globalThis.gc();return process.memoryUsage().heapUsed;};
const initialHeap=sample(),source=fs.readFileSync(file,'utf8'),start=performance.now(),ast=parse(source);
globalThis.benchmarkRetained={source,ast};const parsedHeap=sample();
const design=renderer.build(ast,path.basename(file),{deferZonePoints:mode!=='eager'});
globalThis.benchmarkRetained.design=design;const drawingHeap=sample();
const directStats=design.zonePointStats?.()||null;
let materializedHeap=null,releasedHeap=null;
if(mode==='cycle'){
 for(const primitive of design.primitives)if(primitive.kind==='zone'||primitive.kind==='zone-outline')void primitive.points;
 materializedHeap=sample();design.releaseZonePoints();releasedHeap=sample();
}
const result={mode,sourceBytes:Buffer.byteLength(source),sha256:createHash('sha256').update(source).digest('hex'),primitives:design.primitives.length,
 initialHeap,parsedHeap,drawingHeap,materializedHeap,releasedHeap,zonePoints:directStats,finalZonePoints:design.zonePointStats?.()||null,
 elapsedMs:performance.now()-start,maxRSSKiB:process.resourceUsage().maxRSS,
 scope:'Saved board parser and drawing only; forced-GC heap samples exclude GPU/browser allocations and can miss transient peaks.'};
console.log(JSON.stringify(result));
