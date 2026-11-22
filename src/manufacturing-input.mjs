/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { safeRelativePath } from './source-types.mjs';

export async function normalizeFiles(input, { signal, lazyBoards = false } = {}) {
  if(!input||!Number.isSafeInteger(input.length)||input.length<1||input.length>256)throw new Error('Choose between 1 and 256 files using an array or FileList.');
  const result=[],seen=new Set();let total=0;
  for(let index=0;index<input.length;index++){const file=input[index];signal?.throwIfAborted();const path=file.path||file.webkitRelativePath||file.name;
    if(!safeRelativePath(path)||seen.has(path.normalize('NFC').toLowerCase()))throw new Error('File names must be unique safe relative paths.');seen.add(path.normalize('NFC').toLowerCase());
    let bytes;
    if(typeof file.source==='string'){
      let size=0;const text=file.source,limit=Math.min(32*1024*1024,128*1024*1024-total);
      if(text.length>limit)throw new Error('Files exceed the byte limit.');
      for(let n=0;n<text.length;n++){const code=text.charCodeAt(n);size+=code<128?1:code<2048?2:3;if(code>=0xd800&&code<=0xdbff&&n+1<text.length){const low=text.charCodeAt(n+1);if(low>=0xdc00&&low<=0xdfff){size++;n++;}}if(size>limit)throw new Error('Files exceed the byte limit.');}
      total+=size;result.push({path,source:text});continue;
    }
    else if(file.bytes instanceof Uint8Array)bytes=file.bytes;
    else if(file.bytes instanceof ArrayBuffer)bytes=new Uint8Array(file.bytes);
    else if(typeof file.arrayBuffer==='function'){if(!Number.isSafeInteger(file.size)||file.size<0||file.size>Math.min(32*1024*1024,128*1024*1024-total))throw new Error('File needs a known size within the byte limit.');if(lazyBoards&&/\.kicad_pcb$/i.test(path)){total+=file.size;result.push({path,size:file.size,arrayBuffer:()=>file.arrayBuffer()});continue;}bytes=new Uint8Array(await file.arrayBuffer());if(bytes.byteLength!==file.size)throw new Error('File size changed while reading.');}
    else throw new TypeError('Files need source text, bytes or a browser File.');
    signal?.throwIfAborted();total+=bytes.byteLength;if(bytes.byteLength>32*1024*1024||total>128*1024*1024)throw new Error('Files exceed the 32 MiB per-file or 128 MiB total limit.');
    result.push({path,bytes});
  }return result;
}
/** Decode only the chosen local board; inactive File/Blob handles stay encoded. */
export async function localSource(file,{signal}={}) {
  signal?.throwIfAborted();
  if(typeof file.source==='string')return file.source;
  let bytes=file.bytes;
  if(bytes instanceof ArrayBuffer)bytes=new Uint8Array(bytes);
  if(!(bytes instanceof Uint8Array)){
    if(typeof file.arrayBuffer!=='function'||!Number.isSafeInteger(file.size)||file.size<0||file.size>32*1024*1024)throw new Error('File needs a known size within the byte limit.');
    bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.byteLength!==file.size)throw new Error('File size changed while reading.');
  }
  signal?.throwIfAborted();
  if(bytes.byteLength>32*1024*1024)throw new Error('File exceeds the 32 MiB limit.');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
