import test from 'node:test';
import assert from 'node:assert/strict';
import { KiCadViewer } from '../src/kicad-viewer.mjs';

const board = `(kicad_pcb (version 20240108) (generator pcbnew)
  (general (thickness 1.6)) (paper "A4")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (gr_rect (start 10 20) (end 40 50) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "edge")))`;
const schematic = `(kicad_sch (version 20250114) (generator eeschema)
  (uuid "sheet") (paper "A4") (lib_symbols)
  (wire (pts (xy 10 20) (xy 30 20)) (stroke (width 0) (type default)) (uuid "wire")))`;

function element(doc) {
  return { ownerDocument: doc, style: {}, children: [], textContent: '', attributes: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; }, remove() { this.removed = true; } };
}
function fixture() {
  const doc = { baseURI: 'https://example.test/blog/', createElement() { return element(doc); } };
  const host = element(doc);
  const viewer = new KiCadViewer(host);
  return { doc, host, viewer };
}

// Exercise the public API with real bounded parsers and geometry extraction.
// Only the graphics surface is stubbed here; browser/WebGL coverage is separate.
const originalMount = globalThis.KiCadOwnedCanvas.mount;
globalThis.KiCadOwnedCanvas.mount = (host, options) => Object.assign(new EventTarget(), {
  options, disposed: false, setDocument(design, path) { this.design = design; this.path = path; this.visibleLayers = new Set(design.layers || []); },
  draw() {}, zoom_to_board() { this.fitted = true; }, dispose() { this.disposed = true; },
});
test.after(() => { globalThis.KiCadOwnedCanvas.mount = originalMount; delete globalThis.SpikeBoard3D; });

test('PCB source retains geometry, layer control, theme, selection and teardown', async () => {
  const { viewer, host } = fixture();
  const events = [];
  viewer.addEventListener('select', e => events.push(e.detail));
  assert.equal(await viewer.loadSource(board, { path: 'board.kicad_pcb' }), true);
  assert.equal(viewer.view, 'pcb');
  const edge = viewer.design.primitives.find(p => p.uuid === 'edge');
  assert.deepEqual(edge.points[0], { x: 10, y: 20 });
  assert.ok(viewer.getLayers().includes('F.Cu'));
  viewer.setLayers(['Edge.Cuts']);
  assert.deepEqual([...viewer.renderer.visibleLayers], ['Edge.Cuts']);
  assert.throws(() => viewer.setLayers(['Invented']), /saved PCB layer/);
  viewer.setTheme('dark'); assert.equal(viewer.renderer.dark, true);
  viewer.fit(); assert.equal(viewer.renderer.fitted, true);
  viewer.renderer.dispatchEvent(new CustomEvent('kicad:select', { detail: { item: { uuid: 'edge' } } }));
  assert.equal(events[0].item.uuid, 'edge');
  assert.equal(events[0].path, 'board.kicad_pcb');
  assert.throws(() => new KiCadViewer(host), /already/);
  const renderer = viewer.renderer;
  viewer.dispose(); viewer.dispose();
  assert.equal(renderer.disposed, true);
  assert.equal(viewer.source, null);
  assert.throws(() => viewer.fit(), /disposed/);
  new KiCadViewer(host).dispose();
});

test('schematic input and rejected replacements preserve the current drawing', async () => {
  const { viewer } = fixture();
  await viewer.loadSource(schematic);
  assert.equal(viewer.view, 'schematic');
  assert.ok(viewer.design.primitives.some(p => p.uuid === 'wire'));
  const renderer = viewer.renderer;
  await assert.rejects(viewer.setView('3d'), /Use schematic/);
  await assert.rejects(viewer.loadSource('(not_a_design)'), /Expected/);
  await assert.rejects(viewer.loadSource('('.repeat(1000)), /deep/);
  assert.equal(viewer.renderer, renderer);
  assert.equal(renderer.disposed, false);
  viewer.dispose();
});

test('independent instances and 3D switches dispose the previous renderer', async () => {
  const a = fixture().viewer, b = fixture().viewer;
  const calls = [];
  globalThis.SpikeBoard3D = { mountBoard3D(host, source, options) {
    calls.push({ source, options });
    return { fit() {}, setTheme(dark) { this.dark = dark; }, dispose() { this.disposed = true; } };
  } };
  await a.loadSource(board); await b.loadSource(schematic);
  const previous = a.renderer;
  await a.setView('3d');
  assert.equal(previous.disposed, true);
  assert.equal(calls[0].source, board);
  assert.equal(b.view, 'schematic');
  a.setTheme('dark'); assert.equal(a.renderer.dark, true);
  const three = a.renderer;
  await a.setView('pcb'); assert.equal(three.disposed, true);
  a.dispose(); b.dispose();
});

test('URL loads omit credentials and reject oversized or unsafe sources', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.href, 'https://example.test/blog/board.kicad_pcb');
      assert.equal(options.credentials, 'omit');
      return new Response(board);
    };
    assert.equal(await viewer.load('board.kicad_pcb'), true);
    await assert.rejects(viewer.load('file:///private.kicad_pcb'), /HTTP/);
    await assert.rejects(viewer.load('https://user:password@example.test/board'), /credentials/);
    globalThis.fetch = async () => new Response(board, { headers: { 'content-length': String(65 * 1024 * 1024) } });
    await assert.rejects(viewer.load('board.kicad_pcb'), /64 MiB/);
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(viewer.load('board.kicad_pcb'), /404/);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});

test('late network results cannot overwrite newer source or remount after disposal', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  try {
    let finish;
    globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
    const pending = viewer.load('old.kicad_pcb');
    await viewer.loadSource(schematic);
    finish(new Response(board));
    assert.equal(await pending, false);
    assert.equal(viewer.kind, 'schematic');
    const next = viewer.load('another.kicad_pcb');
    viewer.dispose(); finish(new Response(board));
    assert.equal(await next, false);
    assert.equal(viewer.renderer, null);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});

test('streamed size is bounded even when the server omits content-length', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  let cancelled = false;
  try {
    globalThis.fetch = async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
      read: async () => ({ done: false, value: { byteLength: 65 * 1024 * 1024 } }),
      cancel: async () => { cancelled = true; },
    }) } });
    await assert.rejects(viewer.load('oversized.kicad_pcb'), /64 MiB/);
    assert.equal(cancelled, true);
    assert.equal(viewer.source, null);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});

test('caller cancellation aborts the download and leaves the current drawing', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  try {
    await viewer.loadSource(schematic);
    globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    });
    const controller = new AbortController();
    const pending = viewer.load('board.kicad_pcb', { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(viewer.kind, 'schematic');
  } finally { globalThis.fetch = original; viewer.dispose(); }
});

test('hosted projects expose drawings and compact controls can switch files and themes', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  try {
    globalThis.fetch = async url => new Response(String(url).endsWith('.kicad_sch') ? schematic : board);
    const project = { files: [
      { path: 'board.kicad_pcb', url: 'https://example.test/board.kicad_pcb' },
      { path: 'power.kicad_sch', url: 'https://example.test/power.kicad_sch' },
    ] };
    await viewer.loadProject(project);
    assert.equal(viewer.getFiles().length, 2);
    assert.equal(viewer.fileSelect.hidden, false);
    assert.equal(viewer.threeButton.hidden, false);
    assert.equal(viewer.fitButton.disabled, false);
    assert.equal(viewer.layerList.children.length, viewer.getLayers().length);
    await viewer.openFile('power.kicad_sch');
    assert.equal(viewer.view, 'schematic');
    assert.equal(viewer.fileSelect.value, 'power.kicad_sch');
    assert.equal(viewer.threeButton.hidden, true);
    assert.equal(viewer.layersMenu.hidden, true);
    viewer.themeButton.onclick();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(viewer.theme, 'dark');
    assert.equal(viewer.themeButton.getAttribute('aria-label'), 'Switch to light theme');
    await assert.rejects(viewer.openFile('not-listed.kicad_sch'), /loaded project/);
    await viewer.loadSource(board);
    assert.equal(viewer.fileSelect.hidden, true);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});

test('3D project model loading is confined to listed assets and stops on view changes', async () => {
  const original = globalThis.fetch;
  const { viewer } = fixture();
  let options, modelSignal;
  try {
    globalThis.SpikeBoard3D = { mountBoard3D(host, source, value) { options = value; return { dispose() {} }; } };
    globalThis.fetch = async (url, value) => {
      if (String(url).endsWith('.glb')) { modelSignal = value.signal; return new Response(new Uint8Array([0, 128, 255])); }
      return new Response(board);
    };
    await viewer.loadProject({ files: [
      { path: 'board.kicad_pcb', url: 'https://example.test/board.kicad_pcb' },
      { path: 'models/part.glb', url: 'https://example.test/part.glb' },
    ] });
    await viewer.setView('3d');
    assert.deepEqual(options.assetPaths, ['models/part.glb']);
    assert.equal(options.loadAsset('unlisted.glb'), undefined);
    assert.equal((await options.loadAsset('models/part.glb')).base64, 'AID/');
    assert.equal(modelSignal.aborted, false);
    await viewer.setView('pcb');
    assert.equal(modelSignal.aborted, true);
    await assert.rejects(viewer.openFile('models/part.glb'), /loaded project/);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});


test('icon controls have accessible names, active states and expandable rendering notes', async () => {
  const { viewer } = fixture();
  let diagnostics;
  globalThis.SpikeBoard3D = { mountBoard3D(host, source, options) {
    assert.equal(options.embedded, true);
    diagnostics = options.onDiagnostics;
    diagnostics(['Linked component models: 0/1', 'One footprint uses an approximate stand-in.']);
    return { dispose() {}, setTheme() {} };
  } };
  await viewer.loadSource(board, { path: 'board.kicad_pcb' });
  for (const control of [viewer.layoutButton, viewer.threeButton, viewer.fitButton, viewer.themeButton, viewer.notesButton]) {
    assert.ok(control.getAttribute('aria-label'));
    assert.ok(control.title);
    assert.match(control.children[0].innerHTML, /<svg/);
  }
  assert.equal(viewer.layoutButton.getAttribute('aria-pressed'), 'true');
  assert.equal(viewer.threeButton.getAttribute('aria-pressed'), 'false');
  await viewer.setView('3d');
  assert.equal(viewer.threeButton.getAttribute('aria-pressed'), 'true');
  assert.equal(viewer.status.hidden, true);
  assert.equal(viewer.notesButton.title, 'Rendering notes (' + (2 + viewer.design.warnings.length) + ')');
  viewer.notesButton.onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(viewer.status.hidden, false);
  assert.equal(viewer.notesButton.getAttribute('aria-expanded'), 'true');
  assert.match(viewer.status.textContent, /approximate stand-in/);
  viewer.notesButton.onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(viewer.status.hidden, true);
  await viewer.setView('pcb');
  const currentNotes = viewer.status.textContent;
  diagnostics(['Stale model load must not overwrite this drawing.']);
  assert.equal(viewer.status.textContent, currentNotes);
  viewer.dispose();
  assert.equal(viewer.notesButton.onclick, null);
});

test('download failures expose readable notes and a layer checkbox keeps its focusable node', async () => {
  const { viewer } = fixture();
  await viewer.loadSource(board);
  const checkbox = viewer.layerList.children[0].children[0].children[0];
  checkbox.checked = false; checkbox.onchange();
  assert.equal(viewer.layerList.children[0].children[0].children[0], checkbox);
  assert.equal(checkbox.checked, false);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(viewer.load('missing.kicad_pcb'), /404/);
    assert.equal(viewer.status.hidden, false);
    assert.equal(viewer.notesButton.getAttribute('aria-expanded'), 'true');
    assert.match(viewer.status.textContent, /404/);
  } finally { globalThis.fetch = original; viewer.dispose(); }
});
