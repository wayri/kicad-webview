/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {resolveSource,fetchText} from './source-loader.mjs';
import {readZip} from './archive/zip.mjs';
import {safeRelativePath} from './source-types.mjs';
import {buildProjectHierarchy} from './project-hierarchy.mjs';
const MAX_FILE=8*1024*1024,MAX_TOTAL=64*1024*1024,schematic=path=>typeof path==='string'&&/\.kicad_sch$/i.test(path);
const size=text=>new TextEncoder().encode(text).byteLength;
async function localSchematics(input,signal){
 if(!input||!Number.isSafeInteger(input.length)||input.length<1||input.length>256)throw new Error('Choose between 1 and 256 project files.');
 const files=[];let total=0;
 for(const file of Array.from(input)){
  signal?.throwIfAborted();const path=file?.path||file?.webkitRelativePath||file?.name;
  if(!safeRelativePath(path))throw new TypeError('Project files need safe relative names.');
  if(!schematic(path))continue;let source;
  if(typeof file.source==='string'){if(file.source.length>MAX_FILE)throw new Error('Schematic exceeds 8 MiB.');source=file.source;}
  else {
   let bytes=file.bytes;
   if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
   if(!(bytes instanceof Uint8Array)){
    if(typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<0||file.size>MAX_FILE)throw new TypeError('A schematic needs bounded source text, bytes or a browser File.');
    bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)throw new Error('File size changed while reading.');
   }
   if(bytes.byteLength>MAX_FILE)throw new Error('Schematic exceeds 8 MiB.');source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  signal?.throwIfAborted();const count=size(source);total+=count;if(count>MAX_FILE||total>MAX_TOTAL)throw new Error('Hierarchy exceeds 8 MiB per schematic or 64 MiB total.');files.push({path,source});
 }
 return files;
}
/** Load only listed schematic URLs. Sheetfile text never authorizes a fetch. */
export async function loadProjectHierarchy(input,options={}){
 const {signal,root,credentials='omit'}=options;signal?.throwIfAborted();let files,entry=options.entry;
 if(input instanceof Uint8Array||input instanceof ArrayBuffer)files=await localSchematics(await readZip(input,{signal}),signal);
 else if(input&&typeof input==='object'&&Number.isSafeInteger(input.length))files=await localSchematics(input,signal);
 else {
  const resolved=await resolveSource(input,{...options,metadataOnly:true,file:options.file||root,baseURL:options.baseURL??globalThis.document?.baseURI});
  signal?.throwIfAborted();entry??=resolved.project?.entry||resolved.path;
  if(resolved.archive)files=await localSchematics(await readZip(resolved.archive,{signal}),signal);
  else {
   const listed=resolved.project?.files||[{path:resolved.path}],schematics=listed.filter(file=>schematic(file.path));files=[];let total=0;
   if(schematics.length>256)throw new Error('Hierarchy exceeds 256 schematic files.');
   for(const file of schematics){
    signal?.throwIfAborted();let source;
    try{source=file.path===resolved.path&&typeof resolved.source==='string'?resolved.source:await fetchText(file.url,{signal,credentials,limit:MAX_FILE});}
    catch(error){signal?.throwIfAborted();if(error?.name==='AbortError')throw error;files.push({path:file.path,error:String(error.message||error).slice(0,512)});continue;}
    signal?.throwIfAborted();const count=size(source);total+=count;if(count>MAX_FILE||total>MAX_TOTAL)throw new Error('Hierarchy exceeds 8 MiB per schematic or 64 MiB total.');files.push({path:file.path,source});
   }
  }
 }
 signal?.throwIfAborted();return buildProjectHierarchy(files,{root,entry});
}
