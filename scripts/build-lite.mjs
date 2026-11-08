/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {distributionNotice} from './license-notice.mjs';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const deps=process.env.KICAD_WEB_BUILD_DEPS?path.resolve(process.env.KICAD_WEB_BUILD_DEPS):path.join(root,'node_modules');
const esbuild=require(path.join(deps,'esbuild'));
if(esbuild.version!=='0.25.12')throw new Error('Use pinned esbuild 0.25.12.');
if(JSON.parse(readFileSync(path.join(deps,'three/package.json'),'utf8')).version!=='0.171.0')throw new Error('Use pinned Three.js 0.171.0.');
const output=path.join(root,'dist/lite');
for(const directory of [output,path.join(output,'chunks')])if(existsSync(directory)&&lstatSync(directory).isSymbolicLink())throw Error('Lite build directories must not be symlinks.');
mkdirSync(output,{recursive:true});
const previousPath=path.join(output,'manifest.json');
const previous=existsSync(previousPath)?JSON.parse(readFileSync(previousPath,'utf8')):null;
if(previous&&previous.schema!=='kicad-webview.lite/v1')throw Error('Unrecognized prior lite manifest; refusing to replace it.');
const owners=['boardParser','numericRange','layerPalette','trackGeometry','viewportScenePolicy'];
const alias=Object.fromEntries(owners.map(name=>['@spike/'+name,path.join(root,'engine/spike-source',name+'.ts')]));
const result=await esbuild.build({
  absWorkingDir:root,entryPoints:{'kicad-webview-lite':path.join(root,'src/index-lite.mjs')},outdir:output,
  bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',metafile:true,
  chunkNames:'chunks/[name]-[hash]',nodePaths:[deps],alias,
  banner: { js: distributionNotice(root) },
  plugins:[{name:'lazy-owned-three-runtime',setup(build){
    build.onLoad({filter:/[\\/]src[\\/]three-runtime\.mjs$/},()=>({
      contents:"export function loadThree(){return import('../engine/spike/board3d.js');}",loader:'js',resolveDir:path.join(root,'src'),
    }));
  }}],
});
const slash=input=>input.split(path.sep).join('/');
const outputs=new Map(Object.entries(result.metafile.outputs));
const entry=[...outputs].find(([,info])=>info.entryPoint==='src/index-lite.mjs')?.[0];
if(!entry)throw Error('Lite entry was not emitted.');
const keyFor=target=>{
  const resolved=path.resolve(root,target);if(!resolved.startsWith(output+path.sep))throw Error('Import escaped the self-hosted lite directory: '+target);
  const key=slash(path.relative(root,resolved));if(!outputs.has(key))throw Error('Import does not identify an emitted runtime module: '+key);return key;
};
for(const [,info]of outputs)for(const edge of info.imports){if(edge.external)throw Error('Lite runtime contains an external import: '+edge.path);keyFor(edge.path);}
const closure=start=>{const found=new Set();function visit(key){if(found.has(key))return;found.add(key);for(const edge of outputs.get(key).imports)if(edge.kind==='import-statement')visit(keyFor(edge.path));}visit(start);return found;};
const initial=closure(entry);
const initialInputs=[...initial].flatMap(key=>Object.keys(outputs.get(key).inputs));
if(initialInputs.some(input=>/(?:^|\/)three\/(?:src|build|examples)|src\/analysis-(?:results|layer)\.mjs|src\/project-viewer\.mjs/.test(input)))throw Error('Optional feature leaked into the initial lite graph.');
const fileStats=[...outputs].map(([key,info])=>{const bytes=readFileSync(path.resolve(root,key));return {path:slash(path.relative(output,path.resolve(root,key))),rawBytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length,sha256:createHash('sha256').update(bytes).digest('hex'),imports:info.imports.map(edge=>({path:slash(path.relative(output,path.resolve(root,edge.path))),kind:edge.kind}))};});
const paths=keys=>[...keys].map(key=>slash(path.relative(output,path.resolve(root,key)))).sort();
const total=keys=>{const names=new Set(paths(keys));return fileStats.filter(file=>names.has(file.path)).reduce((sum,file)=>({rawBytes:sum.rawBytes+file.rawBytes,gzipBytes:sum.gzipBytes+file.gzipBytes}),{rawBytes:0,gzipBytes:0});};
const optionalFor=input=>{const key=[...outputs].find(([,info])=>info.entryPoint===input)?.[0];if(!key)throw Error('Missing optional entry: '+input);const keys=closure(key);for(const initialKey of initial)keys.delete(initialKey);return keys;};
const three=optionalFor('src/three-runtime.mjs');
const threeRuntime=[...outputs].find(([,info])=>info.entryPoint==='src/three-runtime.mjs')?.[0];
for(const edge of outputs.get(threeRuntime).imports)if(edge.kind==='dynamic-import'){for(const key of closure(keyFor(edge.path)))if(!initial.has(key))three.add(key);}
const analysis=new Set([...optionalFor('src/analysis-results.mjs'),...optionalFor('src/analysis-layer.mjs')]);
const manifest={schema:'kicad-webview.lite/v1',entry:'kicad-webview-lite.js',initial:{files:paths(initial),...total(initial)},optional:{three:{files:paths(three),...total(three)},analysis:{files:paths(analysis),...total(analysis)}},files:fileStats};
// Remove only exact, unchanged files recorded by the previous owned build.
// Unknown files and modified outputs remain untouched; never recurse or follow links.
const emitted=new Set(fileStats.map(file=>file.path)),removed=[];
for(const old of previous?.files||[]){
 if(typeof old.path!=='string'||! /^(?:kicad-webview-lite\.js|chunks\/[A-Za-z0-9_.-]+\.js)$/.test(old.path)||emitted.has(old.path))continue;
 const target=path.resolve(output,old.path);if(!target.startsWith(output+path.sep))throw Error('Prior generated output escaped lite directory.');
 if(!existsSync(target))continue;const info=lstatSync(target);if(!info.isFile()||info.isSymbolicLink())continue;
 const bytes=readFileSync(target),hash=createHash('sha256').update(bytes).digest('hex');
 const unchanged=old.sha256?hash===old.sha256:bytes.length===old.rawBytes&&gzipSync(bytes,{level:9}).length===old.gzipBytes;
 if(!unchanged){console.warn('Preserved modified prior output: '+old.path);continue;}
 unlinkSync(target);removed.push(old.path);
}
writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({entry:manifest.entry,initial:manifest.initial,optional:manifest.optional,removedStaleGeneratedFiles:removed},null,2));
