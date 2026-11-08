import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('standalone distribution imports with no repository module dependencies', async t => {
  const url = new URL('../dist/kivi-viewer.js', import.meta.url);
  try { await access(url); } catch { t.skip('Build with npm run build to check the distribution.'); return; }
  const source = await readFile(url, 'utf8');
  // Import from memory: no sibling extension/ or source files can satisfy imports.
  const library = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(typeof library.KiCadViewer, 'function');
  assert.equal(typeof library.AltiumViewer, 'function');
  assert.equal(typeof library.registerKiCadViewer, 'function');
  const mount = globalThis.KiCadOwnedCanvas.mount;
  globalThis.KiCadOwnedCanvas.mount = () => Object.assign(new EventTarget(), {
    setDocument(design) { this.design = design; this.visibleLayers = new Set(design.layers || []); },
    draw() {}, dispose() {},
  });
  const doc = { baseURI: 'https://site.test/repository/', createElement() { return { ownerDocument: doc, style: {}, children: [], attributes: {},
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children=items; },
    setAttribute(name,value) { this.attributes[name]=String(value); }, getAttribute(name) { return this.attributes[name]??null; }, remove() {} }; } };
  const viewer = new library.KiCadViewer(doc.createElement('div'));
  try {
    await viewer.loadSource('(kicad_pcb (version 20240108) (generator pcbnew) (layers (0 "F.Cu" signal)) (gr_rect (start 1 2) (end 3 4) (stroke (width 0.1) (type default)) (fill none) (layer "F.Cu")))');
    assert.equal(viewer.view, 'pcb');
    assert.ok(viewer.design.primitives.some(item => !item.frame));
    assert.equal(viewer.threeButton.hidden, false);
    assert.equal(viewer.fitButton.disabled, false);
  } finally { viewer.dispose(); globalThis.KiCadOwnedCanvas.mount = mount; }
});
