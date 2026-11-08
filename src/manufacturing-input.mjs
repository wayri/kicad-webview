/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { parseManufacturing } from './manufacturing/index.mjs';
import { safeRelativePath } from './source-types.mjs';

export async function normalizeFiles(input, { signal } = {}) {
  if(!input||!Number.isSafeInteger(input.length)||input.length<1||input.length>256)throw new Error('Choose between 1 and 256 files using an array or FileList.');
  const result=[],seen=new Set();let total=0;
  for(let index=0;index<input.length;index++){const file=input[index];signal?.throwIfAborted();const path=file.path||file.webkitRelativePath||file.name;
    if(!safeRelativePath(path)||seen.has(path.normalize('NFC').toLowerCase()))throw new Error('File names must be unique safe relative paths.');seen.add(path.normalize('NFC').toLowerCase());
    let bytes;
    if(typeof file.source==='string'){
      let size=0;const text=file.source,limit=Math.min(32*1024*1024,128*1024*1024-total);
      if(text.length>limit)throw new Error('Files exceed the byte limit.');
      for(let n=0;n<text.length;n++){const code=text.charCodeAt(n);size+=code<128?1:code<2048?2:3;if(code>=0xd800&&code<=0xdbff&&n+1<text.length){const low=text.charCodeAt(n+1);if(low>=0xdc00&&low<=0xdfff){size++;n++;}}if(size>limit)throw new Error('Files exceed the byte limit.');}
      bytes=new TextEncoder().encode(text);
    }
    else if(file.bytes instanceof Uint8Array)bytes=file.bytes;
    else if(file.bytes instanceof ArrayBuffer)bytes=new Uint8Array(file.bytes);
    else if(typeof file.arrayBuffer==='function'){if(!Number.isSafeInteger(file.size)||file.size<0||file.size>Math.min(32*1024*1024,128*1024*1024-total))throw new Error('File needs a known size within the byte limit.');bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)throw new Error('File size changed while reading.');}
    else throw new TypeError('Files need source text, bytes or a browser File.');
    signal?.throwIfAborted();total+=bytes.byteLength;if(bytes.byteLength>32*1024*1024||total>128*1024*1024)throw new Error('Files exceed the 32 MiB per-file or 128 MiB total limit.');
    result.push({path,bytes});
  }return result;
}
export function manufacturingDesign(files, options={}) {
  const layers=[],warnings=[];let bounds=null,format='manufacturing',operationCount=0,pathChars=0;
  for(const file of files){const source=file.source??new TextDecoder('utf-8',{fatal:true}).decode(file.bytes);
    const parsed=parseManufacturing(source,{...options,...options.importOptions?.[file.path],path:file.path});
    if(files.length===1)format=parsed.format;
    for(const layer of parsed.layers)for(const operation of layer.operations){operationCount++;pathChars+=operation.path.length;if(operationCount>200000||pathChars>16000000)throw new Error('Manufacturing collection exceeds 200000 operations or 16 million path characters.');}
    for(const note of parsed.warnings)if(warnings.length<500)warnings.push(file.path+': '+note);
    for(const layer of parsed.layers){const id=file.path+(parsed.layers.length>1?' / '+layer.id:'');layers.push({...layer,id,name:id,operations:layer.operations.map(operation=>({...operation,id:file.path+':'+operation.id}))});}
    const b=parsed.bounds;if(b)bounds=bounds?{x:Math.min(bounds.x,b.x),y:Math.min(bounds.y,b.y),w:Math.max(bounds.x+bounds.w,b.x+b.w)-Math.min(bounds.x,b.x),h:Math.max(bounds.y+bounds.h,b.y+b.h)-Math.min(bounds.y,b.y)}:{...b};
  }
  if(!layers.length)throw new Error('No supported manufacturing layers were found.');
  return {format,layers:layers.map(layer=>layer.id),camLayers:layers,bounds,warnings,units:'mm',primitives:[]};
}
