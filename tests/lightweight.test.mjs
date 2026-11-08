import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url)),directory=path.join(root,'dist/lite');
const available=fs.existsSync(path.join(directory,'manifest.json'));

test('lite artifact graph keeps optional features out of the initial relative module closure',t=>{
 if(!available){t.skip('Run scripts/build-lite.mjs to verify the lite distribution.');return;}
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),map=new Map(manifest.files.map(file=>[file.path,file]));
 const closure=new Set();function visit(name){if(closure.has(name))return;closure.add(name);const file=map.get(name);assert.ok(file,'Every runtime import is emitted in the same lite directory');for(const edge of file.imports){assert.ok(!edge.path.startsWith('../')&&!path.isAbsolute(edge.path),'Imports remain relative/self-hosted');assert.ok(map.has(edge.path));if(edge.kind==='import-statement')visit(edge.path);}}
 visit(manifest.entry);assert.deepEqual([...closure].sort(),[...manifest.initial.files].sort());
 for(const feature of ['three','analysis'])for(const name of manifest.optional[feature].files)assert.equal(closure.has(name),false,'Optional feature is not statically reachable');
 assert.ok(manifest.optional.three.files.some(name=>/board3d-/.test(name)));assert.ok(manifest.optional.analysis.files.some(name=>/analysis-layer-/.test(name)));
 const measured={rawBytes:0,gzipBytes:0};for(const name of closure){const data=fs.readFileSync(path.join(directory,name));measured.rawBytes+=data.length;measured.gzipBytes+=gzipSync(data,{level:9}).length;}assert.equal(measured.rawBytes,manifest.initial.rawBytes);assert.equal(measured.gzipBytes,manifest.initial.gzipBytes);
 // A smoke bound, not a comparative performance benchmark or fragile exact byte golden.
 assert.ok(manifest.initial.rawBytes<350000,'Initial graph remains substantially smaller than all-in-one distribution');
 const allInOne=path.join(root,'dist/kicad-webview.min.js');if(fs.existsSync(allInOne))assert.ok(measured.rawBytes<fs.statSync(allInOne).size/2);
});

test('isolated lite runtime loads analysis and Three only through explicit feature requests',t=>{
 if(!available){t.skip('Run scripts/build-lite.mjs to verify the lite distribution.');return;}
 const script=String.raw`
 import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {pathToFileURL} from 'node:url';import {webcrypto,createHash} from 'node:crypto';
 const directory=process.argv[1],manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),cache=new Map(),loaded=[];
 const context=vm.createContext({EventTarget,Event,CustomEvent,URL,TextEncoder,TextDecoder,AbortController,DOMException,crypto:webcrypto,setTimeout,clearTimeout,console,atob,btoa});
 const resolve=(specifier,parent)=>{assert.ok(specifier.startsWith('./')||specifier.startsWith('../'));const result=path.resolve(path.dirname(parent),specifier);assert.ok(result.startsWith(directory+path.sep));return result;};
 function get(file){if(cache.has(file))return cache.get(file);loaded.push(path.relative(directory,file).split(path.sep).join('/'));const module=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;},importModuleDynamically:async(specifier,parent)=>{const child=get(resolve(specifier,parent.identifier));if(child.status==='unlinked')await child.link(link);if(child.status==='linked')await child.evaluate();return child;}});cache.set(file,module);return module;}
 const link=(specifier,parent)=>get(resolve(specifier,parent.identifier));
 const entry=get(path.join(directory,manifest.entry));await entry.link(link);await entry.evaluate();
 assert.deepEqual([...loaded].sort(),[...manifest.initial.files].sort());assert.equal(typeof entry.namespace.KiCadViewer,'function');assert.equal(entry.namespace.parseAnalysis,undefined);assert.equal(entry.namespace.AdvancedKiCadViewer,undefined);assert.equal(context.SpikeBoard3D,undefined);
 class Element extends EventTarget{constructor(){super();this.style={};this.children=[];this.attributes={};this.textContent='';}append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}replaceChildren(...nodes){this.children.forEach(node=>node.parent=null);this.children=[];this.append(...nodes);}remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}setAttribute(key,value){this.attributes[key]=value;}}
 const doc={createElement:()=>new Element(),createElementNS:()=>new Element()},source='(kicad_pcb (version 20240108))';
 const fake=()=>({assertActive(){if(this.disposed)throw Error('disposed');},kind:'pcb',view:'pcb',analysisTicket:0,source,design:{},getLayers:()=>['F.Cu'],host:{ownerDocument:doc},stage:new Element(),renderer:Object.assign(new EventTarget(),{visibleLayers:new Set(['F.Cu']),viewport:{camera:{width:400,height:300,zoom:2,world_to_screen:()=>({x:0,y:0})}}}),emit(){}});
 const input={schema:'kicad-webview.analysis/v1',coordinateSystem:'kicad-mm',board:{sha256:createHash('sha256').update(source).digest('hex')},provenance:{kind:'illustrative',tool:'test',runId:'test',assumptions:[]},fields:[{id:'v',name:'Voltage drop',unit:'mV',range:[0,10],samples:[{x:0,y:0,width:1,height:1,value:2}]}]};
 const stale=fake(),pending=entry.namespace.KiCadViewer.prototype.setAnalysis.call(stale,input);stale.source+=' ';assert.equal(await pending,false);assert.equal(stale.analysis,undefined);assert.ok(!loaded.some(file=>/analysis-layer-/.test(file)));
 const viewer=fake();assert.equal(await entry.namespace.KiCadViewer.prototype.setAnalysis.call(viewer,input),true);assert.ok(viewer.analysis);assert.ok(loaded.some(file=>/analysis-layer-/.test(file)));assert.ok(!loaded.some(file=>/board3d-/.test(file)));viewer.analysis.dispose();
 const runtimePath=manifest.optional.three.files.find(file=>/three-runtime-/.test(file));const runtime=get(path.join(directory,runtimePath));await runtime.link(link);await runtime.evaluate();const engine=await runtime.namespace.loadThree();assert.equal(typeof engine.mountBoard3D,'function');assert.ok(loaded.some(file=>/board3d-/.test(file)));
 console.log(JSON.stringify({initial:manifest.initial.files,loadedAnalysis:loaded.filter(file=>/analysis-/.test(file)),loadedThree:loaded.filter(file=>/board3d-|three-runtime-/.test(file))}));
 `;
 const output=execFileSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script,directory],{encoding:'utf8',maxBuffer:512*1024});
 const evidence=JSON.parse(output.trim());assert.equal(evidence.loadedAnalysis.length,2);assert.equal(evidence.loadedThree.length,2);
});
