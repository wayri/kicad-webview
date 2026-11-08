import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnalysis,analysisColor,analysisCellAt,analysisSourceHash,formatAnalysisValue} from '../src/analysis-results.mjs';
import {KiCadViewer} from '../src/kicad-viewer.mjs';
const source='(kicad_pcb (version 20240108))';
const hash=await analysisSourceHash(source);
function result(){return {schema:'kicad-webview.analysis/v1',coordinateSystem:'kicad-mm',board:{sha256:hash},provenance:{kind:'illustrative',tool:'Example <b>tool</b>',runId:'demo',assumptions:['Not an engineering solve.']},fields:[{id:'drop',name:'Voltage drop',unit:'mV',layer:'F.Cu',range:[0,100],samples:[{x:10,y:20,width:5,height:5,value:120},{x:12,y:22,width:1,height:1,value:-2}]}]};}
test('analysis validates units, fixed scale and exact source hash without normalizing source',async()=>{
 const data=parseAnalysis(JSON.stringify(result()));assert.equal(data.fields[0].unit,'mV');assert.notEqual(await analysisSourceHash(source+'\n'),hash);
 const original=result(),copy=parseAnalysis(original);original.fields[0].samples[0].value=99;assert.equal(copy.fields[0].samples[0].value,120);assert.throws(()=>{copy.fields[0].samples[0].value=99;});
 assert.equal(analysisColor(120,[0,100]),analysisColor(100,[0,100]));assert.equal(copy.fields[0].samples[0].value,120);
 assert.equal(formatAnalysisValue(44.599999999999994),'44.6');assert.equal(formatAnalysisValue(1e-8),'1e-8');
});
test('analysis rejects malformed, nonfinite, oversized and ambiguous data',()=>{
 for(const mutate of [d=>d.coordinateSystem='pixels',d=>d.board.sha256='bad',d=>d.provenance.kind='verified',d=>d.fields[0].unit='',d=>d.fields[0].range=[1,1],d=>d.fields[0].samples[0].width=0,d=>d.fields[0].samples[0].x=Infinity,d=>d.fields[0].samples[0].value=NaN,d=>d.fields.push(d.fields[0]),d=>d.fields[0].samples=Array(10001).fill(d.fields[0].samples[0])]){const d=result();mutate(d);assert.throws(()=>parseAnalysis(d));}
 assert.throws(()=>parseAnalysis(' '.repeat(8*1024*1024+1)));
});
test('probe uses supplied cells only, with last-cell precedence and no zero-filled holes',()=>{
 const f=parseAnalysis(result()).fields[0];assert.equal(analysisCellAt(f,{x:12.5,y:22.5}).value,-2);assert.equal(analysisCellAt(f,{x:11,y:21}).value,120);assert.equal(analysisCellAt(f,{x:50,y:50}),null);
});
class Element extends EventTarget {
 constructor(tag){super();this.tag=tag;this.children=[];this.style={};this.attributes={};this.textContent='';}
 append(...nodes){for(const node of nodes){node.remove?.();this.children.push(node);node.parent=this;}}
 replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 setAttribute(key,value){this.attributes[key]=value;}
}
function fakeViewer(){
 const renderer=new EventTarget();renderer.viewport={camera:new globalThis.KiCadOwnedCanvas.Camera(400,300)};renderer.viewport.camera.center.set(10,20);renderer.viewport.camera.zoom=2;renderer.visibleLayers=new Set(['F.Cu']);
 const doc={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 return {host:{ownerDocument:doc},stage:new Element('stage'),kind:'pcb',view:'pcb',source,design:{},analysisTicket:0,analysis:null,renderer,assertActive(){if(this.disposed)throw Error('disposed');},getLayers(){return ['F.Cu'];},emit(){}};
}
const nodes=e=>[e,...e.children.flatMap(nodes)];
test('wrong-board and absent-layer results never mount; stale/disposed imports cannot commit',async()=>{
 const v=fakeViewer(),wrong=result();wrong.board.sha256='0'.repeat(64);await assert.rejects(KiCadViewer.prototype.setAnalysis.call(v,wrong),/does not match/);assert.equal(v.analysis,null);
 const layer=result();layer.fields[0].layer='B.Cu';await assert.rejects(KiCadViewer.prototype.setAnalysis.call(v,layer),/layer absent/);
 const pending=KiCadViewer.prototype.setAnalysis.call(v,result());v.source=source+' ';assert.equal(await pending,false);assert.equal(v.analysis,null);
 v.source=source;const disposing=KiCadViewer.prototype.setAnalysis.call(v,result());v.disposed=true;assert.equal(await disposing,false);
});
test('overlay follows camera flip/pan, layer visibility and 3D pause; clear removes all UI',async()=>{
 const v=fakeViewer();assert.equal(await KiCadViewer.prototype.setAnalysis.call(v,result()),true);
 const svg=v.stage.children.find(n=>n.tag==='svg'),group=svg.children[0],panel=v.stage.children.find(n=>n.tag==='section');
 assert.throws(()=>v.analysis.setField('missing'),/Choose an imported/);assert.doesNotThrow(()=>v.analysis.sync());assert.equal(group.children.length,2);
 assert.match(group.attributes.transform,/translate\(180 110\) scale\(2 2\)/);
 assert.match(nodes(panel).map(n=>n.textContent).join(' '),/ILLUSTRATIVE · NOT SOLVER RESULTS/);
 v.renderer.viewport.camera.flipped=true;v.renderer.viewport.camera.center.set(15,25);v.renderer.dispatchEvent(new Event('kicad:viewframe'));assert.match(group.attributes.transform,/translate\(230 100\) scale\(-2 2\)/);
 v.renderer.visibleLayers.clear();v.analysis.sync();assert.equal(svg.hidden,true);assert.match(nodes(panel).map(n=>n.textContent).join(' '),/F.Cu is hidden/);
 v.view='3d';v.analysis.sync();assert.equal(svg.hidden,true);assert.match(nodes(panel).map(n=>n.textContent).join(' '),/switch to PCB/);
 KiCadViewer.prototype.clearAnalysis.call(v);assert.equal(v.analysis,null);assert.equal(v.stage.children.length,0);
});
test('queued probe cannot replace a hidden-layer pause message',async()=>{
 const prior=globalThis.requestAnimationFrame,priorCancel=globalThis.cancelAnimationFrame;let callback;
 globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};globalThis.cancelAnimationFrame=()=>{};
 const v=fakeViewer();let move;const add=v.stage.addEventListener.bind(v.stage);v.stage.addEventListener=(name,fn)=>{if(name==='pointermove')move=fn;add(name,fn);};
 v.renderer.canvas={getBoundingClientRect:()=>({left:0,top:0})};
 try{await KiCadViewer.prototype.setAnalysis.call(v,result());move({target:v.renderer.canvas,clientX:202,clientY:152});assert.equal(typeof callback,'function');v.renderer.visibleLayers.clear();v.analysis.sync();callback();assert.match(nodes(v.stage).map(n=>n.textContent).join(' '),/F.Cu is hidden/);assert.doesNotMatch(nodes(v.stage).map(n=>n.textContent).join(' '),/120 mV/);v.analysis.dispose();}
 finally{globalThis.requestAnimationFrame=prior;globalThis.cancelAnimationFrame=priorCancel;}
});
