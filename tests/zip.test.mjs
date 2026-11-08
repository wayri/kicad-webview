import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readZip, crc32 } from '../src/archive/zip.mjs';

const text = new TextEncoder(), content = bytes => new TextDecoder().decode(bytes);
function archive(items) {
  const locals = [], central = [], offsets = [];
  let offset = 0;
  for (const item of items) {
    const raw = typeof item.data === 'string' ? text.encode(item.data) : item.data || new Uint8Array();
    const data = item.method === 8 ? deflateRawSync(raw) : raw, name = item.nameBytes || text.encode(item.path);
    const flags = item.flags ?? (0x800 | (item.descriptor ? 8 : 0)), method = item.method || 0;
    const extra = item.extra || new Uint8Array(), crc = crc32(raw), size = item.declaredSize ?? raw.length;
    const local = new Uint8Array(30 + name.length + extra.length + data.length + (item.descriptor ? 16 : 0));
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, flags, true); view.setUint16(8, method, true);
    if (!item.descriptor) { view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, size, true); }
    view.setUint16(26, name.length, true); view.setUint16(28, extra.length, true); local.set(name, 30); local.set(extra, 30 + name.length);
    local.set(data, 30 + name.length + extra.length);
    if (item.descriptor) { const start = local.length - 16; view.setUint32(start, 0x08074b50, true); view.setUint32(start + 4, crc, true); view.setUint32(start + 8, data.length, true); view.setUint32(start + 12, size, true); }
    const header = new Uint8Array(46 + name.length + extra.length), cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 0x314, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true); cv.setUint16(10, method, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, size, true); cv.setUint16(28, name.length, true);
    cv.setUint16(30, extra.length, true); cv.setUint32(38, item.external || 0, true); cv.setUint32(42, offset, true);
    header.set(name, 46); header.set(extra, 46 + name.length); offsets.push(offset); locals.push(local); central.push(header); offset += local.length;
  }
  const directory = offset, centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, items.length, true); ev.setUint16(10, items.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, directory, true);
  const output = new Uint8Array(directory + centralSize + 22); offset = 0;
  for (const part of [...locals, ...central, end]) { output.set(part, offset); offset += part.length; }
  return { bytes: output, directory, offsets };
}

test('stored and deflated manufacturing files preserve exact bytes and paths', async () => {
  const { bytes } = archive([{ path: 'Gerbers/', external: 0x40000010, method: 8 },
    { path: 'Gerbers/front.gbr', data: '%FSLAX46Y46*%\nM02*' },
    { path: 'Gerbers/drill.drl', data: 'M48\nMETRIC,TZ\nT1C0.8\n%\nT1\nX0100Y0200\nM30', method: 8 }]);
  const files = await readZip(bytes);
  assert.deepEqual(files.map(file => file.path), ['Gerbers/front.gbr', 'Gerbers/drill.drl']);
  assert.equal(content(files[0].bytes), '%FSLAX46Y46*%\nM02*');
  assert.match(content(files[1].bytes), /^M48/);
  files[0].bytes[0] = 0;
  assert.equal((await readZip(bytes))[0].bytes[0], 37);
  assert.equal(crc32(text.encode('123456789')), 0xcbf43926);
});

test('deflated entries with signed data descriptors validate and decode', async () => {
  const { bytes } = archive([{ path: 'board.gbr', data: 'G04 descriptor*\nM02*', method: 8, descriptor: true }]);
  assert.equal(content((await readZip(bytes.buffer))[0].bytes), 'G04 descriptor*\nM02*');
  const bad = bytes.slice(); bad[bad.length - 22 - (46 + 9) - 4] ^= 1;
  await assert.rejects(readZip(bad), /descriptor/);
});

test('unsigned descriptors and explicit zero-byte files are supported', async () => {
  const signed = archive([{ path: 'a.gbr', data: 'M02*', method: 8, descriptor: true }]);
  const descriptor = signed.directory - 16, unsigned = new Uint8Array(signed.bytes.length - 4);
  unsigned.set(signed.bytes.subarray(0, descriptor)); unsigned.set(signed.bytes.subarray(descriptor + 4), descriptor);
  new DataView(unsigned.buffer).setUint32(unsigned.length - 22 + 16, signed.directory - 4, true);
  assert.equal(content((await readZip(unsigned))[0].bytes), 'M02*');
  assert.equal((await readZip(archive([{ path: 'empty.txt', data: '' }]).bytes))[0].bytes.length, 0);
});

test('unsafe paths, duplicate/casefold names and file-directory collisions reject', async () => {
  for (const path of ['../escape.gbr', '/root.gbr', 'a/../b.drl', 'a\\b.gbr', 'C:drive.gbr', 'a//b.gbr', 'CON.txt', 'a./b.gbr', 'a%2fb.gbr'])
    await assert.rejects(readZip(archive([{ path, data: 'x' }]).bytes), /unsafe/);
  for (const paths of [['Top.gbr', 'top.gbr'], ['café.gbr', 'cafe\u0301.gbr'], ['a', 'a/b.gbr']])
    await assert.rejects(readZip(archive(paths.map(path => ({ path, data: 'x' }))).bytes), /unique|conflict/);
});

test('symlinks and special-file entries reject before data is returned', async () => {
  for (const external of [0xa1ff0000, 0x61ff0000])
    await assert.rejects(readZip(archive([{ path: 'board.gbr', data: 'x', external }]).bytes), /symlink|special/);
});

test('unsupported compression, encryption, nested archives and ambiguous encoding reject', async () => {
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', method: 12 }]).bytes), /compression/);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', flags: 1 }]).bytes), /Encrypted/);
  await assert.rejects(readZip(archive([{ path: 'a.zip', data: 'x' }]).bytes), /Nested/);
  await assert.rejects(readZip(archive([{ path: 'a.bin', data: archive([{ path: 'a.gbr', data: 'x' }]).bytes }]).bytes), /Nested/);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', flags: 0, nameBytes: new Uint8Array([0xff]) }]).bytes), /non-UTF-8/);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', nameBytes: new Uint8Array([0xff]) }]).bytes), /valid UTF-8/);
});

test('declared file, aggregate, ratio and compressed budgets are enforced', async () => {
  const { bytes } = archive([{ path: 'a.gbr', data: 'abcdef' }, { path: 'b.drl', data: 'abcdef' }]);
  await assert.rejects(readZip(bytes, { maxFileBytes: 5 }), /expanded/);
  await assert.rejects(readZip(bytes, { maxExpandedBytes: 10 }), /expanded/);
  await assert.rejects(readZip(bytes, { maxCompressedBytes: bytes.length - 1 }), /compressed input/);
  await assert.rejects(readZip(bytes, { maxFiles: 1 }), /entries/);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x'.repeat(5000), method: 8 }]).bytes, { maxRatio: 2 }), /ratio/);
  await assert.rejects(readZip(bytes, { maxFileBytes: 33 * 1024 * 1024 }), /integer between/);
});

test('actual inflation exceeding a dishonest declared size is bounded', async () => {
  const { bytes } = archive([{ path: 'a.gbr', data: 'x'.repeat(3000), method: 8, declaredSize: 8 }]);
  await assert.rejects(readZip(bytes), /inflated data exceeds/);
  const tooLong = archive([{ path: 'a.gbr', data: 'xyz', method: 8, declaredSize: 8 }]).bytes;
  await assert.rejects(readZip(tooLong), /does not match/);
});

test('CRC, central/local name and method/size mismatch and overlapping entries reject', async () => {
  const original = archive([{ path: 'a.gbr', data: 'x' }, { path: 'b.gbr', data: 'y' }]);
  const crc = original.bytes.slice(); crc[30 + 5] ^= 1;
  await assert.rejects(readZip(crc), /CRC check/);
  const name = original.bytes.slice(); name[30] = 98;
  await assert.rejects(readZip(name), /headers disagree/);
  const method = original.bytes.slice(); new DataView(method.buffer).setUint16(8, 8, true);
  await assert.rejects(readZip(method), /headers disagree/);
  const size = original.bytes.slice(); new DataView(size.buffer).setUint32(22, 9, true);
  await assert.rejects(readZip(size), /sizes or CRC/);
  const overlap = original.bytes.slice(); new DataView(overlap.buffer).setUint32(original.directory + 46 + 5 + 42, 0, true);
  await assert.rejects(readZip(overlap), /headers disagree|overlap/);
});

test('truncation, malformed directory, multi-disk and ZIP64 are diagnosed', async () => {
  const { bytes } = archive([{ path: 'a.gbr', data: 'x' }]);
  await assert.rejects(readZip(bytes.subarray(0, bytes.length - 1)), /end directory/);
  const disk = bytes.slice(); new DataView(disk.buffer).setUint16(bytes.length - 22 + 4, 1, true);
  await assert.rejects(readZip(disk), /Multi-disk/);
  const zip64 = bytes.slice(); new DataView(zip64.buffer).setUint16(bytes.length - 22 + 10, 0xffff, true);
  await assert.rejects(readZip(zip64), /ZIP64/);
  const extra = new Uint8Array([1, 0, 0, 0]);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', extra }]).bytes), /ZIP64/);
  const unicode = new Uint8Array([0x75, 0x70, 0, 0]);
  await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', extra: unicode }]).bytes), /alternate Unicode/);
  await assert.rejects(readZip(new Uint8Array()), /end directory/);
});

test('pre-aborted and in-flight archive reads preserve cancellation', async () => {
  const { bytes } = archive([{ path: 'a.gbr', data: 'x'.repeat(200000), method: 8 }]);
  const before = new AbortController(); before.abort();
  await assert.rejects(readZip(bytes, { signal: before.signal }), { name: 'AbortError' });
  const during = new AbortController(), reading = readZip(bytes, { signal: during.signal }); during.abort();
  await assert.rejects(reading, { name: 'AbortError' });
});

test('deflate unavailability produces an actionable browser diagnostic', async () => {
  const original = globalThis.DecompressionStream;
  try {
    globalThis.DecompressionStream = undefined;
    await assert.rejects(readZip(archive([{ path: 'a.gbr', data: 'x', method: 8 }]).bytes), /current browser|unpack/);
  } finally { globalThis.DecompressionStream = original; }
});

test('project hierarchy loads ZIP schematics with saved relative child links without network',async()=>{
 const {loadProjectHierarchy}=await import('../src/hierarchy-loader.mjs');
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('ZIP must stay local');};
 try{const {bytes}=archive([{path:'project/main.kicad_sch',data:'(kicad_sch (sheet (uuid "power") (property "Sheetname" "Power") (property "Sheetfile" "power.kicad_sch")))'},{path:'project/power.kicad_sch',data:'(kicad_sch)'},{path:'project/main.kicad_pcb',data:'(kicad_pcb)'}]);const model=await loadProjectHierarchy(bytes,{root:'project/main.kicad_sch'});assert.equal(model.files.length,2);assert.equal(model.roots[0].children[0].path,'project/power.kicad_sch');assert.equal(model.roots[0].children[0].status,'ok');}finally{globalThis.fetch=original;}
});
