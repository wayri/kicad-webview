const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../engine/design-diff.js');
const { build } = require('../engine/schematic-renderer.js');

// Independent KiCad 10 native SVG reference, exported with:
// kicad-cli sch export svg -e -n -o <output> fixtures/schematic-orientation.kicad_sch
// Rows: 0/90/180/270 degrees; no mirror, mirror x, mirror y.
// Circle centers and pin endpoints are numeric SVG landmarks. Field angle and
// justification are determined from native stroked text relative to saved anchors.
const landmarks = [
  [[41,38],[[40,45],[40,42]],['left','top'],['left','top']],
  [[88,39],[[95,40],[92,40]],['left','top'],['right','bottom']],
  [[139,42],[[140,35],[140,38]],['right','bottom'],['right','bottom']],
  [[192,41],[[185,40],[188,40]],['right','bottom'],['left','top']],
  [[41,92],[[40,85],[40,88]],['left','bottom'],['right','top']],
  [[88,91],[[95,90],[92,90]],['right','top'],['right','top']],
  [[139,88],[[140,95],[140,92]],['right','top'],['left','bottom']],
  [[192,89],[[185,90],[188,90]],['left','bottom'],['left','bottom']],
  [[39,138],[[40,145],[40,142]],['right','top'],['left','bottom']],
  [[92,139],[[85,140],[88,140]],['left','bottom'],['left','bottom']],
  [[141,142],[[140,135],[140,138]],['left','bottom'],['right','top']],
  [[188,141],[[195,140],[192,140]],['right','top'],['right','top']]
];

test('rotated and mirrored symbols retain native circles, pin joins and field layout', () => {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/schematic-fields/schematic-orientation.kicad_sch'), 'utf8');
  const ast = parse(source), original = JSON.stringify(ast), primitives = build(ast).primitives;
  for (let i=0; i<landmarks.length; i++) {
    const [circle, pin, referenceStyle, valueStyle] = landmarks[i];
    const owned = primitives.filter(p => p.reference === 'U'+(i+1));
    const body = owned.find(p => p.type === 'circle');
    assert.deepEqual([body.x,body.y], circle, body.reference+' circle');
    const stem = owned.find(p => p.kind === 'pin');
    assert.deepEqual(stem.points.map(p => [p.x,p.y]), pin, body.reference+' pin');
    assert.deepEqual(stem.connectPoint, {x:pin[0][0],y:pin[0][1]});
    for (const [field, style, offset, vertical] of [
      ['Reference',referenceStyle,-4,i%2 === 1], ['Value',valueStyle,4,i%2 === 0]
    ]) {
      const text = owned.find(p => p.kind === 'property' && p.property === field);
      assert.deepEqual([text.x,text.y], [48+(i%4)*50,40+Math.floor(i/4)*50+offset], text.text+' saved anchor');
      assert.equal(Math.abs(text.angle), vertical ? 90 : 0, text.text+' orientation');
      assert.deepEqual([text.align,text.baseline], style, text.text+' justification');
    }
  }
  assert.equal(JSON.stringify(ast), original, 'rendering does not rewrite source');
});
