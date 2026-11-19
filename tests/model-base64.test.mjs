/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../engine/embedded-models.js';
const {decodeBase64}=globalThis.KiCadEmbeddedModels;

test('native and indexed fallback model decoding preserve every byte and valid padding',()=>{
 const payloads=[Buffer.alloc(0),Buffer.from([0]),Buffer.from([0,255]),Buffer.from([0,255,128]),Buffer.from(Array.from({length:32768},(_,i)=>i%256))];
 for(const native of [false,true]){
  let calls=0;
  const host=native?{Uint8Array:{fromBase64(value){calls++;return new Uint8Array(Buffer.from(value,'base64'));}},atob(){assert.fail('Native decoding must not allocate a binary string.');}}:{atob(value){calls++;return atob(value);}};
  for(const input of payloads){
   const encoded=input.toString('base64');
   for(const padded of [false,true])assert.deepEqual(decodeBase64(encoded,{host,padded}),new Uint8Array(input));
   assert.deepEqual(decodeBase64(encoded.replace(/=+$/,''),{host}),new Uint8Array(input));
  }
  assert.equal(calls,payloads.length*3);
 }
 // Exercise the actual native implementation as well when this runtime has it.
 if(typeof Uint8Array.fromBase64==='function')assert.deepEqual(decodeBase64('AP+A'),new Uint8Array([0,255,128]));
});

test('malformed and oversized inputs fail before either decoder allocates output',()=>{
 const host={Uint8Array:{fromBase64(){assert.fail('Rejected input reached native allocation.');}},atob(){assert.fail('Rejected input reached fallback allocation.');}};
 for(const input of [null,undefined,12,'A','AA=','A===','AA===','A=AA','AA\nA','____','====','AA==A','éAAA'])assert.throws(()=>decodeBase64(input,{host}));
 for(const input of ['AA','AAA'])assert.throws(()=>decodeBase64(input,{host,padded:true}));
 for(const maxBytes of [-1,NaN,1.5,8*1024*1024+1])assert.throws(()=>decodeBase64('AAAA',{host,maxBytes}));
 assert.throws(()=>decodeBase64('A'.repeat(88),{host,maxBytes:64}),/limit/);
 assert.throws(()=>decodeBase64('A'.repeat(11200001),{host}),/oversized/);
 assert.equal(decodeBase64('AAAA',{maxBytes:3}).byteLength,3);
 assert.equal(decodeBase64('AA==',{maxBytes:1}).byteLength,1);
});

test('embedded decoding retains frame, output-size and checksum validation',async()=>{
 const {decode,murmur}=globalThis.KiCadEmbeddedModels,expected=new Uint8Array([4,5,6]);
 const frame=Buffer.from([0x28,0xb5,0x2f,0xfd,32,3,25,0,0,...expected]),asset={base64:frame.toString('base64'),checksum:murmur(expected)};
 let calls=0;
 const decompress=(bytes,output)=>{calls++;assert.equal(output.length,3);output.set(bytes.subarray(9));return output;};
 assert.deepEqual(await decode(asset,decompress),expected);assert.equal(calls,1);
 await assert.rejects(decode({...asset,checksum:'0'.repeat(32)},decompress),/checksum mismatch/);
 await assert.rejects(decode(asset,()=>new Uint8Array(2)),/size mismatch/);
 const oversized=Buffer.from([0x28,0xb5,0x2f,0xfd,160,1,0,128,0]);
 await assert.rejects(decode({...asset,base64:oversized.toString('base64')},()=>assert.fail('Oversized frame reached decompression.')),/exceeds 8 MiB/);
 await assert.rejects(decode({...asset,base64:Buffer.concat([frame,frame]).toString('base64')},()=>assert.fail('Concatenated frames reached decompression.')),/trailing/);
});
