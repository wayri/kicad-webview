import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSource} from '../src/source-loader.mjs';
const gerber='%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,1*%\nD10*\nX100000Y100000D03*\nM02*';
const drill='M48\nMETRIC\nT1C0.8\n%\nG90\nT1\nX10.0Y10.0\nM30\n';
test('hosted manufacturing manifest fetches aligned layers and detects .txt drill candidates',async()=>{
  const original=globalThis.fetch,calls=[];try{globalThis.fetch=async(url,options)=>{calls.push({url:String(url),credentials:options.credentials});return new Response(String(url).endsWith('holes.txt')?drill:String(url).endsWith('README.txt')?'readme':gerber);};
    const result=await resolveSource({entry:'top.gbr',files:[{path:'top.gbr',url:'./top.gbr'},{path:'holes.txt',url:'./holes.txt'},{path:'README.txt',url:'./README.txt'}]},{baseURL:'https://site.test/manufacturing/'});
    assert.deepEqual(result.files.map(file=>file.path),['top.gbr','holes.txt']);assert.equal(result.project.files.length,2);assert.equal(calls.length,3);assert.ok(calls.every(call=>call.credentials==='omit'));assert.equal(result.path,'top.gbr');
  }finally{globalThis.fetch=original;}
});
test('default manifest entry skips unrecognized text; explicit invalid text entry rejects',async()=>{
  const original=globalThis.fetch;try{globalThis.fetch=async url=>new Response(String(url).endsWith('README.txt')?'readme':gerber);
    const files=[{path:'README.txt',url:'https://site.test/README.txt'},{path:'top.gbr',url:'https://site.test/top.gbr'}];
    assert.equal((await resolveSource({files})).path,'top.gbr');await assert.rejects(resolveSource({entry:'README.txt',files}),/not recognized/);
  }finally{globalThis.fetch=original;}
});
test('hosted ZIP bytes retain binary content and requested cancellation',async()=>{
  const original=globalThis.fetch;try{const bytes=new Uint8Array([80,75,3,4,255,0,128]);globalThis.fetch=async()=>new Response(bytes);const result=await resolveSource('https://site.test/board.zip');assert.deepEqual(result.archive,bytes);assert.equal(result.source,undefined);
    const signal=AbortSignal.abort();await assert.rejects(resolveSource('https://site.test/board.zip',{signal}),{name:'AbortError'});
  }finally{globalThis.fetch=original;}
});
