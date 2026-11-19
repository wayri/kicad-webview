/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePadOutline,padSourceDetails,padCopperAbsent} from '../engine/spike/padGeometry.mjs';
import {smoothPadOutline} from '../engine/spike/copperGeometry.mjs';
import {padSourceIdentity} from '../engine/spike/padIdentity.mjs';
const q=quoted=>({quoted}),area=loop=>loop.slice(1).reduce((sum,p,i)=>sum+loop[i][0]*p[1]-p[0]*loop[i][1],0)/2;
const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function jumper(side=1,id='saved-custom'){
 return ['pad',q('1'),'smd','custom',['uuid',q(id)],['size',1,.5],['options',['anchor','rect']],['primitives',
  ['gr_circle',['center',0,.25],['end',.5,.25],['width',0],['fill','yes']],
  ['gr_circle',['center',0,-.25],['end',.5,-.25],['width',0],['fill','yes']],
  ['gr_poly',['pts',['xy',side*.5,.75],['xy',0,.75],['xy',0,-.75],['xy',side*.5,-.75]],['width',0],['fill','yes']]]];
}
function prepared(side){const raw=jumper(side),details=padSourceDetails(['kicad_pcb',['footprint',q('Jumper'),raw]]).get('saved-custom');return {shape:'custom',width:1,height:.5,...details};}
function contains(loop,x,y){let inside=false;for(let i=0,j=loop.length-2;i<loop.length-1;j=i++)if((loop[i][1]>y)!==(loop[j][1]>y)&&x<(loop[j][0]-loop[i][0])*(y-loop[i][1])/(loop[j][1]-loop[i][1])+loop[i][0])inside=!inside;return inside;}

test('IRCA saved circle/side-polygon/anchor union keeps rounded asymmetric copper and mirrored pads distinct',()=>{
 const right=prepared(1),left=prepared(-1),a=smoothPadOutline(right),b=smoothPadOutline(left);
 assert.ok(a&&b);assert.notDeepEqual(right.customPrimitives,left.customPrimitives);
 for(const geometry of [a,b]){assert.ok(area(geometry.outline)>0);assert.deepEqual(geometry.outline[0],geometry.outline.at(-1));assert.ok(geometry.outline.length<=69);assert.ok(geometry.tessellation.error<=.0025);near(area(geometry.outline),1+Math.PI/8,.001);}
 for(const point of a.outline)assert.ok(b.outline.some(other=>Math.hypot(other[0]+point[0],other[1]-point[1])<1e-9));
 assert.equal(contains(a.outline,.49,.74),true);assert.equal(contains(a.outline,-.49,.74),false);assert.equal(contains(b.outline,-.49,.74),true);
 const rotated=point=>[-point[1]+17,point[0]+23];near(area(a.outline.map(rotated)),area(a.outline));
 assert.equal(a.shape,'custom');assert.equal(a.drill,null);
});

test('custom union rejects changed topology, unsupported primitives and stroked substitutes',()=>{
 const valid=prepared(1);assert.ok(nativePadOutline(valid));
 for(const change of [{customAnchor:'circle'},{width:2},{customPrimitives:valid.customPrimitives.slice(0,2)},{customPrimitives:[...valid.customPrimitives,{shape:'line'}]}])assert.equal(nativePadOutline({...valid,...change}),null);
 const bowtie=structuredClone(valid);[bowtie.customPrimitives[2].points[1],bowtie.customPrimitives[2].points[2]]=[bowtie.customPrimitives[2].points[2],bowtie.customPrimitives[2].points[1]];assert.equal(nativePadOutline(bowtie),null);
 const raw=jumper();raw.at(-1)[1].find(item=>Array.isArray(item)&&item[0]==='width')[1]=.1;
 const metadata=padSourceDetails(['kicad_pcb',['footprint','Jumper',raw]]).get('saved-custom');assert.equal(nativePadOutline({shape:'custom',width:1,height:.5,...metadata}),null);
});

test('saved annular drill containment remains strict, including custom pad tangency',()=>{
 const valid=prepared(1);assert.ok(nativePadOutline({...valid,drill:.2,drillShape:'circle'}));
 assert.equal(nativePadOutline({...valid,drill:1,drillShape:'circle'}),null);
 assert.equal(nativePadOutline({shape:'circle',width:1,height:1,drill:1,drillShape:'circle'}),null);
 assert.equal(nativePadOutline({shape:'rect',width:1,height:1,drill:.2,drillShape:'circle',drillOffset:[.5,0]}),null);
});

test('Marble J10 four saved legacy pad6 occurrences retain drill metadata and valid oval annuli',()=>{
 const saved=[['0912984c-b7cb-473e-8bf6-832c3d93582a',1.7,1.35,1.2,.7],['ac00846f-3592-46d1-a0d3-583a2913fde1',1.7,1.35,1.2,.7],['43de8a02-0091-4493-8d6c-b7694d4f771b',1.5,1.1,1.05,.65],['dc42f28a-ba75-4fd6-a78e-639554250312',1.5,1.1,1.05,.65]];
 const raw=saved.map(([id,w,h,dw,dh])=>['pad',q('6'),'thru_hole','oval',['size',w,h],['drill','oval',dw,dh],['tstamp',q(id)]]),details=padSourceDetails(['kicad_pcb',['module','J10',...raw]]);
 assert.equal(details.size,4);
 for(const [id,width,height]of saved){const metadata=details.get(id);assert.equal(metadata.uuid,id);assert.equal(metadata.drillShape,'oval');const result=smoothPadOutline({shape:'oval',width,height,...metadata});assert.ok(result);assert.ok(area(result.drill)<0);assert.ok(result.drill.every(([x,y])=>contains(result.outline,x,y)));}
});

test('missing pad IDs use source occurrences across footprint/module and duplicate saved IDs remain excluded',()=>{
 const pad=()=>['pad',q('6'),'thru_hole','oval',['drill','oval',1,.5]],a=pad(),b=pad(),c=pad();
 const ast=['kicad_pcb',['footprint','first',a,b],['module','second',c]],details=padSourceDetails(ast);
 assert.deepEqual([...details.keys()],['display-pad:0:0','display-pad:0:1','display-pad:1:0']);
 assert.equal(padSourceIdentity(a,'generated REF',0,0),padSourceIdentity(a,'other reference',0,0));
 a.push(['tstamp',q('same')]);b.push(['tstamp',q('same')]);assert.equal(padSourceDetails(ast).has('same'),false);assert.equal(padSourceDetails(ast).has('display-pad:1:0'),true);
 assert.equal(padSourceIdentity(['pad','1','smd','rect',['uuid',q('uuid')],['tstamp',q('old')]],'',0,0),'uuid');
});


test('NPTH drill-only pads keep their holes without reporting fictitious missing copper annuli',()=>{
 const pad={padType:'np_thru_hole',shape:'circle',width:.5,height:.5,drill:1.3,drillShape:'circle'};
 assert.equal(padCopperAbsent(pad),true);assert.equal(padCopperAbsent({...pad,padType:'thru_hole'}),false);assert.equal(padCopperAbsent({...pad,drill:.2}),false);assert.equal(padCopperAbsent({...pad,drillOffset:[1,0]}),false);
 assert.equal(padCopperAbsent({...pad,width:1.3,height:1.3}),true);assert.equal(nativePadOutline(pad),null,'there is correctly no copper annulus');
});
