import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
test('classic bundle runs without a module loader and registers the HTML viewer', async () => {
  const tags = new Map();
  const context = { EventTarget, TextDecoder, HTMLElement: class {}, customElements: { get: name => tags.get(name), define: (name, value) => tags.set(name, value) } };
  runInNewContext(await readFile(new URL('../dist/kicad-webview.min.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.KiCadWebView.Viewer, 'function');
  assert.equal(context.KiCadWebView.Viewer, context.KiCadWebView.KiCadViewer);
  assert.equal(typeof tags.get('kicad-viewer'), 'function');
});
