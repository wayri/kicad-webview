import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildInspectionModel } from '../src/inspector.mjs';
import { fetchText } from '../src/source-loader.mjs';
import { readZip } from '../src/archive/zip.mjs';

const require = createRequire(import.meta.url);
const diff = require('../engine/design-diff.js');
const nets = require('../engine/net-model.js');
const MiB = 1024 * 1024;

test('a schematic beyond the former 8 MiB parser and cache input limits is accepted', () => {
  const content = `(kicad_sch${' '.repeat(9 * MiB)}(symbol (uuid "late") (property "Reference" "U1")))`;
  assert.equal(diff.projectObjects([{ path: 'large.kicad_sch', content }]).length, 1);
  assert.deepEqual(nets.createBuilder().build([{ path: 'large.kicad_sch', content }]).nets, []);
});

test('20,001 saved parts and late geometry remain available across 32 copper layers', () => {
  const layers = ['layers', ...Array.from({ length: 32 }, (_, i) => [i, `In${i}.Cu`, 'signal'])];
  const parts = Array.from({ length: 20001 }, (_, i) => ['footprint', { quoted: 'Test:Part' },
    ['uuid', `part-${i}`], ['property', { quoted: 'Reference' }, { quoted: `U${i}` }]]);
  parts.at(-1).push(['pad', { quoted: '1' }, 'smd', 'rect', ['uuid', 'last-pad'], ['at', 0, 0], ['size', 1, 1]]);
  const late = { uuid: 'last-pad', ownerUuid: 'part-20000', kind: 'pad', layer: 'In31.Cu' };
  const primitives = Array(1_200_000).fill({ frame: true });
  primitives.push(late);
  const model = buildInspectionModel(['kicad_pcb', layers, ...parts], {
    kind: 'pcb', path: 'large.kicad_pcb', design: { primitives },
  });
  assert.equal(model.parts.length, 20001);
  assert.equal(model.find('part-20000').reference, 'U20000');
  assert.equal(model.find('last-pad').part, model.find('part-20000'));
  assert.deepEqual(model.find('last-pad').primitives, [late]);
  assert.deepEqual(model.find('part-20000').layers, ['In31.Cu']);
  assert.ok(!model.warnings.some(warning => /limited to the first/.test(warning)));
});

test('download and archive caps accept bounded modern files while rejecting larger requests', async () => {
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('(kicad_sch)', { headers: { 'content-length': String(65 * MiB) } });
    assert.equal(await fetchText('https://example.test/large.kicad_sch'), '(kicad_sch)');
    globalThis.fetch = async () => new Response('(kicad_sch)', { headers: { 'content-length': String(257 * MiB) } });
    await assert.rejects(fetchText('https://example.test/large.kicad_sch'), /256 MiB/);
  } finally { globalThis.fetch = previous; }
  await assert.rejects(readZip(new Uint8Array(), { maxCompressedBytes: 257 * MiB }), /maxCompressedBytes/);
  await assert.rejects(readZip(new Uint8Array(), { maxFileBytes: 257 * MiB }), /maxFileBytes/);
  await assert.rejects(readZip(new Uint8Array(), { maxExpandedBytes: 513 * MiB }), /maxExpandedBytes/);
  await assert.rejects(readZip(new Uint8Array(), { maxFileBytes: 256 * MiB, maxExpandedBytes: 512 * MiB }), /end directory/);
});

test('actual >8 MiB KiCad board keeps the last of 20,001 parts and layer 32', () => {
  const layers = Array.from({ length: 32 }, (_, i) => `(${i} "${i === 0 ? 'F.Cu' : i === 31 ? 'B.Cu' : `In${i}.Cu`}" signal)`).join(' ');
  const footprints = Array.from({ length: 20001 }, (_, i) => `(footprint "Test:Part" (layer "F.Cu") (at ${i % 200} ${Math.floor(i / 200)}) (uuid "part-${i}") (property "Reference" "U${i}")${i === 20000 ? ' (pad "1" smd rect (at 0 0) (size 1 1) (layers "B.Cu") (uuid "last-pad"))' : ''})`).join(' ');
  const content = `(kicad_pcb (version 20241229) (layers ${layers}) ${footprints} ${' '.repeat(9 * MiB)})`;
  assert.ok(Buffer.byteLength(content) > 8 * MiB);
  const ast = diff.parse(content);
  const design = require('../engine/pcb-renderer.js').build(ast, 'large.kicad_pcb');
  const model = buildInspectionModel(ast, { kind: 'pcb', path: 'large.kicad_pcb', design });
  assert.equal(design.layers.length, 32);
  assert.equal(model.parts.length, 20001);
  assert.equal(model.find('part-20000').reference, 'U20000');
  assert.equal(model.find('last-pad').part, model.find('part-20000'));
  assert.ok(design.primitives.some(primitive => primitive.uuid === 'last-pad' && primitive.layer === 'B.Cu'));
  assert.ok(!model.warnings.some(warning => /limited to the first/.test(warning)));
});
