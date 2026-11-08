/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import path from 'node:path';
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
/** Deterministic, small demo ZIP builder; not shipped to or used by the browser. */
export function buildDemoArchive(root,output){
  const manifest=JSON.parse(readFileSync(path.join(root,'fixtures/inverter-cam/project.json'),'utf8'));
  const locals=[],central=[];let offset=0;
  for(const item of manifest.files){const name=Buffer.from(item.path,'utf8'),bytes=readFileSync(path.join(root,'fixtures/inverter-cam',item.path)),compressed=deflateRawSync(bytes,{level:9}),crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(name.length,26);locals.push(local,name,compressed);
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);central.push(entry,name);offset+=local.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(manifest.files.length,8);end.writeUInt16LE(manifest.files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,Buffer.concat([...locals,directory,end]));
}
