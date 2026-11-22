import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse } = require('../engine/design-diff.js');
const { build } = require('../engine/pcb-renderer.js');
const { bounds, hitPrimitive } = require('../engine/owned-canvas.js');

test('deferred saved contours preserve bridged cutouts, exact coordinates and shared layer outlines', () => {
  const ast = parse(`(kicad_pcb (version 20240108)
    (zone (uuid "plane") (layers "F.Cu" "B.Cu")
      (polygon (pts (xy 0 0) (xy 10.123456789 0) (xy 10 10) (xy 0 10)))
      (filled_polygon (layer "B.Cu") (pts
        (xy 0 0) (xy 10.123456789 0) (xy 10 10) (xy 0 10) (xy 0 0)
        (xy 3 3) (xy 3 7) (xy 7 7) (xy 7 3) (xy 3 3) (xy 0 0)))
      (filled_polygon (layer "F.Cu") (pts (xy 0 0) (xy 1 1)))))`);
  const eager = build(ast, 'board.kicad_pcb');
  const deferred = build(ast, 'board.kicad_pcb', { deferZonePoints: true });
  assert.deepEqual(deferred.zonePointStats(), { contours: 0, vertices: 0 });
  assert.equal('zonePointStats' in eager, false);

  const fills = deferred.primitives.filter(p => p.uuid === 'plane');
  const [filled, front, back] = fills;
  assert.equal(fills.length, 3, 'a two-point contour does not become a primitive');
  assert.deepEqual(fills.map(p => p.layer), ['B.Cu', 'F.Cu', 'B.Cu']);
  assert.ok(Object.keys(filled).includes('points'));
  assert.deepEqual(deferred.zonePointStats(), { contours: 0, vertices: 0 });
  assert.deepEqual(deferred.primitives, eager.primitives);
  assert.equal(front.points, back.points);
  assert.deepEqual(deferred.zonePointStats(), { contours: 2, vertices: 15 });
  assert.equal(hitPrimitive(filled, { x: 1, y: 2 }, 0), true);
  assert.equal(hitPrimitive(filled, { x: 5, y: 5 }, 0), false);
  const fitted = bounds(fills);
  const priorPoints = filled.points;

  deferred.releaseZonePoints();
  assert.deepEqual(deferred.zonePointStats(), { contours: 0, vertices: 0 });
  assert.equal(fills[0], deferred.primitives.find(p => p.kind === 'zone'));
  assert.deepEqual(bounds(fills), fitted);
  assert.deepEqual(filled.points, priorPoints);
  assert.notEqual(filled.points, priorPoints);
  assert.equal(front.points, back.points);
});
