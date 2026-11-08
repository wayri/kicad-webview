import test from 'node:test';
import assert from 'node:assert/strict';
import { AltiumViewer } from '../src/altium-viewer.mjs';
import { KiCadViewer } from '../src/kicad-viewer.mjs';

function fixture() {
  const window = new EventTarget();
  const doc = { baseURI: 'https://blog.example/designs/', defaultView: window,
    createElement(tag) { return { ownerDocument: doc, style: {}, attributes: {}, children: [],
      contentWindow: tag === 'iframe' ? {} : undefined,
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; }, remove() { this.removed = true; } }; } };
  return { host: doc.createElement('div'), window };
}
function message(window, source, origin, type) {
  const event = new Event('message');
  Object.defineProperties(event, { source: { value: source }, origin: { value: origin }, data: { value: { type } } });
  window.dispatchEvent(event);
}

test('constructing the beta creates no external frame; explicit load builds the documented embed', () => {
  const { host } = fixture();
  const viewer = new AltiumViewer(host);
  assert.equal(viewer.frame, null);
  const mounted = [];
  viewer.addEventListener('mount', event => mounted.push(event.detail));
  assert.equal(viewer.load('https://public.example/project.zip', { view: '3d' }), viewer);
  const frame = viewer.frame;
  assert.match(frame.srcdoc, /https:\/\/viewer\.altium\.com\/client\/static\/js\/embed\.js/);
  assert.match(frame.srcdoc, /data-project-src="https:\/\/public\.example\/project.zip"/);
  assert.match(frame.srcdoc, /data-enabled-views="sch,pcb,3d,bom"/);
  assert.match(frame.srcdoc, /data-active-view="3d"/);
  assert.match(frame.srcdoc, /data-project-outputs="none"/);
  assert.equal(frame.attributes.sandbox, 'allow-scripts allow-downloads');
  assert.equal(frame.attributes.referrerpolicy, 'no-referrer');
  assert.equal(mounted[0].provider, 'altium365');
  assert.equal(mounted[0].view, '3d');
  viewer.dispose();
});

test('user-controlled URL characters stay attribute data, never executable HTML', () => {
  const { host } = fixture();
  const viewer = new AltiumViewer(host);
  viewer.load('https://public.example/project.zip?x="&y=</script><script>alert(1)</script>');
  assert.ok(!viewer.frame.srcdoc.includes('<script>alert(1)</script>'));
  assert.match(viewer.frame.srcdoc, /&amp;y=/);
  assert.match(viewer.frame.srcdoc, /%22/);
  assert.match(viewer.frame.srcdoc, /%3C/);
  viewer.dispose();
});

test('unsafe, private-address and raw native inputs reject before replacing an existing embed', () => {
  const { host } = fixture();
  const viewer = new AltiumViewer(host);
  viewer.load('https://public.example/project.zip');
  const previous = viewer.frame;
  for (const url of ['javascript:alert(1)', 'file:///project.zip', 'http://public.example/project.zip',
    'https://user:secret@public.example/project.zip', 'https://localhost/project.zip',
    'https://192.168.1.10/project.zip', 'https://[::1]/project.zip', 'https://board.local/project.zip',
    'https://public.example/board.PcbDoc', 'https://public.example/board.SchDoc']) {
    assert.throws(() => viewer.load(url));
    assert.equal(viewer.frame, previous);
  }
  viewer.dispose();
});

test('view changes remount with validated provider options; BOM alone is unavailable', () => {
  const { host } = fixture();
  const viewer = new AltiumViewer(host, { views: ['pcb', '3d'], view: 'pcb' });
  assert.throws(() => viewer.setView('3d'), /Load/);
  viewer.load('https://public.example/project.7z');
  const first = viewer.frame;
  viewer.setView('3d');
  assert.notEqual(viewer.frame, first);
  assert.match(viewer.frame.srcdoc, /data-enabled-views="pcb,3d"/);
  assert.throws(() => viewer.setView('schematic'), /enabled/);
  assert.throws(() => viewer.setView('bom'), /initial view/);
  assert.throws(() => viewer.load('https://public.example/project.zip', { views: ['bom'] }), /Choose/);
  assert.throws(() => viewer.load('https://public.example/project.zip', { views: ['pcb', 'pcb'] }), /Choose/);
  assert.throws(() => viewer.load('https://public.example/project.zip', { views: ['toString'] }), /Choose/);
  viewer.dispose();
});

test('bootstrap messages require the current opaque wrapper, and never claim design readiness', () => {
  const { host, window } = fixture();
  const viewer = new AltiumViewer(host);
  viewer.load('https://public.example/project.rar');
  let loaded = 0, errors = 0, ready = 0;
  viewer.addEventListener('providerload', () => loaded++);
  viewer.addEventListener('error', () => errors++);
  viewer.addEventListener('ready', () => ready++);
  const old = viewer.frame.contentWindow;
  message(window, {}, 'null', 'altium-beta:script-loaded');
  message(window, old, 'https://evil.example', 'altium-beta:script-loaded');
  assert.equal(loaded, 0);
  message(window, old, 'null', 'altium-beta:script-loaded');
  assert.equal(loaded, 1);
  assert.equal(ready, 0);
  viewer.setView('pcb');
  message(window, old, 'null', 'altium-beta:script-error');
  assert.equal(errors, 0);
  const current = viewer.frame.contentWindow;
  message(window, current, 'null', 'altium-beta:script-error');
  assert.equal(errors, 1);
  viewer.dispose();
  message(window, current, 'null', 'altium-beta:script-error');
  assert.equal(errors, 1);
});

test('different provider instances cannot occupy the same host and disposal releases ownership', () => {
  const { host } = fixture();
  const viewer = new AltiumViewer(host);
  assert.throws(() => new AltiumViewer(host), /already/);
  assert.throws(() => new KiCadViewer(host), /already/);
  viewer.load('https://public.example/project.zip');
  viewer.dispose(); viewer.dispose();
  assert.equal(viewer.frame, null);
  assert.equal(viewer.url, null);
  assert.equal(viewer.root.removed, true);
  assert.throws(() => viewer.load('https://public.example/project.zip'), /disposed/);
  const kicad = new KiCadViewer(host);
  assert.throws(() => new AltiumViewer(host), /already/);
  kicad.dispose();
});
