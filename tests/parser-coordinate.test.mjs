/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const {parse, parseMetadata} = createRequire(import.meta.url)('../engine/design-diff.js');

test('canonical vertex scanning preserves exact values and fallback forms', () => {
  const fast = '(xy +1.25e1 -0\t)';
  const fallback = '(xy\n+1.25e1 ; comment\n -0)';
  const ast = parse(`(kicad_pcb (zone (polygon (pts ${fast} ${fallback} (xy 4 5 extra)))))`);
  assert.deepEqual(ast[1][1][1], ['pts', ['xy', 12.5, -0], ['xy', 12.5, -0], ['xy', 4, 5, 'extra']]);
  assert.throws(() => parse('(kicad_pcb (xy 1e999 2))'), /Invalid numeric/);
  assert.throws(() => parse('(kicad_pcb (xy 1 2)'), /Incomplete/);
  assert.deepEqual(parseMetadata(`(kicad_pcb (version 20240108) (zone ${fast}))`),
    ['kicad_pcb', ['version', 20240108]]);
});
