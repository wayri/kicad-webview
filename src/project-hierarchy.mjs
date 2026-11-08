/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import '../engine/design-diff.js';
import {safeRelativePath} from './source-types.mjs';

const MAX_FILES=256,MAX_FILE_BYTES=8*1024*1024,MAX_BYTES=64*1024*1024,MAX_NODES=4096,MAX_DEPTH=32,MAX_WARNINGS=128;
const atom=value=>value&&typeof value==='object'&&!Array.isArray(value)?value.quoted:value;
const kind=node=>Array.isArray(node)?atom(node[0]):null;
const forms=(node,name)=>node.filter(item=>kind(item)===name);
const first=(node,name)=>forms(node,name)[0];
const schematic=path=>/\.kicad_sch$/i.test(path);
const base=path=>path.split('/').at(-1);
const titleFor=path=>base(path).replace(/\.kicad_sch$/i,'')||base(path);
const short=(value,limit)=>String(value??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'�').slice(0,limit);

/** Saved top-level sheet links only. No network, DOM or netlist inference. */
export function buildProjectHierarchy(files,{root,entry}={}){
 if(!Array.isArray(files)||files.length>MAX_FILES)throw new TypeError('Choose at most 256 project file entries.');
 for(const [name,value]of [['root',root],['entry',entry]])if(value!==undefined&&!safeRelativePath(value))throw new TypeError('Choose a safe project-relative '+name+' path.');
 const warnings=[],warningSet=new Set();let diagnosticOverflow=false;
 const warn=message=>{message=short(message,1600);if(warningSet.has(message))return;if(warnings.length<MAX_WARNINGS-1){warningSet.add(message);warnings.push(message);}else if(!diagnosticOverflow){warnings.push('Additional hierarchy diagnostics were omitted.');diagnosticOverflow=true;}};
 const display=(value,max,label)=>{if(value.length>max)warn(label+' was shortened for display.');return value.slice(0,max);};
 const seen=new Set(),index=new Map(),encoder=new TextEncoder();let bytes=0;
 // Preflight all input before parsing any source. Non-schematic contents are ignored.
 for(const file of files){
  if(!file||typeof file!=='object'||!safeRelativePath(file.path))throw new TypeError('Project files need safe relative paths.');
  const normalized=file.path.normalize('NFC').toLowerCase();if(seen.has(normalized))throw new Error('Project paths must be unique, including Unicode/case variants.');seen.add(normalized);
  if(!schematic(file.path))continue;
  const model={path:file.path,title:display(titleFor(file.path),512,file.path+' title'),uuid:null,links:[],targets:new Set(),sheetCount:0,error:null};
  if(file.error!==undefined){if(typeof file.error!=='string')throw new TypeError('A schematic read error must be text.');model.error=short(file.error||'The schematic could not be read.',512);}
  else{
   if(typeof file.source!=='string')throw new TypeError('A schematic needs source text or an explicit read error.');
   if(file.source.length>MAX_FILE_BYTES)throw new RangeError('Schematic hierarchy sources exceed 8 MiB per file or 64 MiB per project.');
   const size=encoder.encode(file.source).length;bytes+=size;if(size>MAX_FILE_BYTES||bytes>MAX_BYTES)throw new RangeError('Schematic hierarchy sources exceed 8 MiB per file or 64 MiB per project.');model.source=file.source;
  }
  index.set(file.path,model);
 }
 const resolve=(parent,file)=>{
  if(typeof file!=='string'||!file||file.length>1000||file.startsWith('/')||/[\\\x00-\x1f\x7f%?#:]/.test(file)||/\$\{|\$\(/.test(file))return {path:null,status:'invalid'};
  const parts=parent.split('/').slice(0,-1);
  for(const part of file.split('/')){if(!part)return {path:null,status:'invalid'};if(part==='.')continue;if(part==='..'){if(!parts.length)return {path:null,status:'invalid'};parts.pop();}else parts.push(part);}
  const path=parts.join('/');if(!safeRelativePath(path)||!schematic(path))return {path:null,status:'invalid'};
  return index.has(path)?{path,status:'ok'}:{path:null,status:'missing'};
 };
 let descriptors=0,metadataTruncated=false;
 for(const model of index.values()){
  if(model.error){warn(model.path+': '+model.error);continue;}
  try{
   const ast=globalThis.KiCadDesignDiff.parse(model.source);if(kind(ast)!=='kicad_sch')throw new TypeError('Expected a saved kicad_sch document.');
   const identity=atom(first(ast,'uuid')?.[1]??first(ast,'tstamp')?.[1]);if(typeof identity==='string'&&identity.length<=128&&identity&&!/[\x00-\x1f\x7f]/.test(identity))model.uuid=identity;
   const title=atom(first(first(ast,'title_block')||[],'title')?.[1]);if(typeof title==='string'&&title)model.title=display(title,512,model.path+' title');
   for(const sheet of ast){
    if(kind(sheet)!=='sheet')continue;const ordinal=model.sheetCount++;
    const property=name=>forms(sheet,'property').filter(form=>typeof atom(form[1])==='string'&&atom(form[1]).replaceAll(' ','').toLowerCase()===name);
    const filenames=property('sheetfile'),names=property('sheetname'),rawFile=filenames.length===1?atom(filenames[0][2]):null,rawName=names.length===1?atom(names[0][2]):null;
    const ref=filenames.length===1?resolve(model.path,rawFile):{path:null,status:'invalid'};
    if(ref.path)model.targets.add(ref.path);
    if(ref.status!=='ok')warn(model.path+': '+(ref.status==='missing'?'Missing listed child schematic: ':'Invalid saved sheet reference: ')+short(rawFile||'(absent or ambiguous Sheetfile)',1000));
    if(descriptors>=MAX_NODES){metadataTruncated=true;continue;}descriptors++;
    const uuid=atom(first(sheet,'uuid')?.[1]??first(sheet,'tstamp')?.[1]);
    if(typeof uuid==='string'&&uuid.length>128)warn(model.path+': an oversized sheet UUID was omitted.');
    model.links.push({...ref,ordinal,file:typeof rawFile==='string'?short(short(display(rawFile,1000,model.path+' Sheetfile'),1000),1000):'',name:typeof rawName==='string'&&rawName?short(short(display(rawName,512,model.path+' Sheetname'),512),512):typeof rawFile==='string'&&rawFile?short(short(display(rawFile,512,model.path+' sheet label'),512),512):'Unnamed sheet',uuid:typeof uuid==='string'&&uuid&&uuid.length<=128&&!/[\x00-\x1f\x7f]/.test(uuid)?uuid:null});
   }
  }catch(error){model.error=short(error?.message||'The schematic could not be parsed.',512);model.links=[];model.targets.clear();model.sheetCount=0;warn(model.path+': '+model.error);}
  delete model.source;
 }
 const paths=[...index.keys()],incoming=new Set();for(const model of index.values())for(const target of model.targets)incoming.add(target);
 const candidates=paths.filter(path=>!incoming.has(path));let rootPath=null,rootReason='forest';
 if(root!==undefined){if(!index.has(root))throw new Error('The explicit hierarchy root is not a listed schematic.');rootPath=root;rootReason='explicit';}
 else if(entry!==undefined&&schematic(entry)&&index.has(entry)){rootPath=entry;rootReason='entry';}
 else if(entry!==undefined&&/\.kicad_pcb$/i.test(entry)){
  const stem=base(entry).replace(/\.kicad_pcb$/i,''),folder=entry.split('/').slice(0,-1).join('/'),matches=paths.filter(path=>base(path).replace(/\.kicad_sch$/i,'')===stem),sameFolder=matches.filter(path=>path.split('/').slice(0,-1).join('/')===folder);
  if(sameFolder.length===1){rootPath=sameFolder[0];rootReason='matching-entry';}else if(matches.length===1){rootPath=matches[0];rootReason='matching-entry';}
 }
 if(rootPath===null&&candidates.length===1){rootPath=candidates[0];rootReason='unique-root';}
 if(entry!==undefined&&schematic(entry)&&!index.has(entry))warn('The entry schematic is not listed; hierarchy root selection used the saved project graph.');
 const covered=new Set(),plans=[];
 const cover=start=>{const todo=[start];while(todo.length){const path=todo.pop();if(covered.has(path))continue;covered.add(path);for(const child of index.get(path).targets)if(!covered.has(child))todo.push(child);}};
 const plan=(path,role)=>{plans.push({path,role});cover(path);};
 if(rootPath!==null)plan(rootPath,'root');else for(const path of candidates)if(!covered.has(path))plan(path,'root');
 for(const path of [...candidates,...paths])if(!covered.has(path))plan(path,'unlinked');
 let instances=0,truncated=metadataTruncated;
 const mark=()=>{truncated=true;warn('Hierarchy expansion was truncated at 4096 instances, 32 levels or the bounded saved-sheet descriptor budget.');};
 const expand=(ref,id,depth,ancestors,limit,role)=>{
  if(instances>=limit){mark();return null;}instances++;
  const node={id,path:ref.path,file:ref.file,name:ref.name,uuid:ref.uuid,status:ref.status,children:[]};if(role)node.role=role;
  if(node.status!=='ok')return node;
  const model=index.get(node.path);if(model.error){node.status='error';return node;}if(ancestors.has(node.path)){node.status='cycle';warn('Recursive sheet cycle at '+node.path+'.');return node;}
  if(depth>=MAX_DEPTH&&model.sheetCount>0){node.status='truncated';mark();return node;}
  const next=new Set(ancestors);next.add(node.path);
  for(const link of model.links){
   if(instances>=limit){mark();node.status='truncated';break;}
   const child=expand(link,id+'/s'+link.ordinal,depth+1,next,limit);if(child)node.children.push(child);
  }
  if(model.links.length<model.sheetCount){mark();if(instances<limit){instances++;node.children.push({id:id+'/more',path:null,file:'',name:'Additional saved sheets omitted',uuid:null,status:'truncated',children:[]});}else node.status='truncated';}
  return node;
 };
 const roots=[];for(let i=0;i<plans.length;i++){const model=index.get(plans[i].path),node=expand({path:model.path,file:model.path,name:model.title,uuid:model.uuid,status:'ok'},'r'+i,0,new Set(),MAX_NODES-(plans.length-i-1),plans[i].role);if(node)roots.push(node);}
 if(metadataTruncated)mark();
 return {schema:'kicad-webview.hierarchy/v1',rootPath,rootReason,roots,files:paths.map(path=>{const model=index.get(path);return {path,sheetCount:model.sheetCount,...(model.error?{error:model.error}:{})};}),warnings,stats:{files:paths.length,instances,truncated}};
}
