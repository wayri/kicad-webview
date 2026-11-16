const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const diff = require('../engine/design-diff.js');

function boundedModule(name, limit) {
  const filename = path.join(__dirname, '../engine', name);
  const context = { module: { exports: {} }, TextEncoder,
    KiCadDesignDiff: { ...diff, MAX_RENDER_PRIMITIVES: limit },
    require: specifier => require(path.join(__dirname, '../engine', specifier)),
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}

test('renderers and connectivity share the bounded parser primitive contract', () => {
  assert.equal(diff.MAX_RENDER_PRIMITIVES, 1_500_000);
  const board = diff.parse('(kicad_pcb (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 1) (uuid "a")))');
  const schematic = diff.parse('(kicad_sch (wire (pts (xy 0 0) (xy 1 0)) (uuid "a")))');
  assert.throws(() => boundedModule('pcb-renderer.js', 1).build(board), /too many render primitives/);
  assert.throws(() => boundedModule('schematic-renderer.js', 1).build(schematic), /too many drawing primitives/);
  const model = boundedModule('net-model.js', 1);
  const files = [{ path: 'tiny.kicad_sch', content: '(kicad_sch)' }];
  const designs = { 'tiny.kicad_sch': { primitives: [{ kind: 'pin' }, { kind: 'pin' }] } };
  assert.throws(() => model.build(files, designs), /Too many render primitives/);
  assert.throws(() => model.createBuilder().build(files, designs), /Too many render primitives/);
});
