import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewerCarousel } from '../src/carousel.mjs';

class Element extends EventTarget {
  constructor(doc, tag) { super(); this.ownerDocument = doc; this.tag = tag; this.children = []; this.style = {}; this.attributes = {}; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
}
function fixture(slides = [{ label: 'Board', view: 'pcb' }, { label: 'Assembly', view: '3d' }], options = {}) {
  const motion = Object.assign(new EventTarget(), { matches: false });
  const doc = Object.assign(new EventTarget(), { hidden: false, defaultView: { matchMedia: () => motion }, createElement(tag) { return new Element(doc, tag); } });
  const host = new Element(doc, 'div'), calls = [];
  const viewer = { view: 'pcb', async load(input, options) { calls.push(['load', input, options]); this.view = options.view || 'pcb'; return true; }, async loadSource(input, options) { calls.push(['source', input, options]); this.view = options.view || 'pcb'; return true; }, async setView(view) { calls.push(['view', view]); this.view = view; return true; }, setCamera(camera) { calls.push(['camera', camera]); }, setCamera3D(camera) { calls.push(['camera3D', camera]); }, selectNet(net) { calls.push(['net', net]); return true; }, clearSelection() { calls.push(['clear']); }, dispose() { calls.push(['dispose']); } };
  const carousel = new ViewerCarousel(host, { viewer, slides, ...options });
  return { carousel, viewer, calls, host, doc, motion };
}

test('presentation is opt-in, accessible and bounded; navigation reuses the supplied viewer', async () => {
  const { carousel, calls, host } = fixture();
  assert.equal(carousel.playing, false); assert.equal(calls.length, 0);
  assert.equal(carousel.label.getAttribute('aria-live'), 'polite');
  assert.equal(carousel.previousButton.disabled, true);
  assert.equal(await carousel.next(), true); assert.equal(carousel.index, 0);
  assert.match(carousel.label.textContent, /1 \/ 2.*Board/);
  await carousel.next(); assert.deepEqual(calls, [['view', '3d']]);
  assert.equal(carousel.nextButton.disabled, true);
  await carousel.previous(); assert.equal(carousel.index, 0);
  assert.throws(() => carousel.show(2), /slide index/);
  carousel.dispose(); carousel.dispose(); assert.equal(host.children.length, 0);
  assert.equal(calls.some(call => call[0] === 'dispose'), false);
  assert.throws(() => carousel.next(), /disposed/);
});

test('slides load source inputs then apply view, cameras and saved net focus in order', async () => {
  const camera = { center: { x: 10, y: 20 }, zoom: 2, flipped: false };
  const { carousel, calls } = fixture([
    { label: 'Sheet', source: 'saved drawing', options: { path: 'sheet.kicad_sch' }, view: 'schematic', camera, clearSelection: true, net: 'GND' },
    { label: 'Board', input: '/board.kicad_pcb', view: '3d', camera3D: 'top' },
    { label: 'Underside', view: '3d', camera3D: 'bottom' }
  ]);
  camera.center.x = 999;
  await carousel.show(0);
  assert.deepEqual(calls.map(call => call[0]), ['source', 'camera', 'clear', 'net']);
  assert.equal(calls[0][2].path, 'sheet.kicad_sch'); assert.equal(calls[1][1].center.x, 10);
  await carousel.show(1); await carousel.show(2);
  assert.deepEqual(calls.slice(-3).map(call => [call[0], call[1]]), [['load', '/board.kicad_pcb'], ['camera3D', 'top'], ['camera3D', 'bottom']]);
  assert.ok(calls.find(call => call[0] === 'load')[2].signal instanceof AbortSignal);
  carousel.dispose();
});

test('queued transitions coalesce and stale async work cannot apply a later camera or emit completion', async () => {
  const { carousel, viewer, calls } = fixture([{ label: 'Old', input: 'old', camera3D: 'top' }, { label: 'Skipped', view: '3d', camera3D: 'left' }, { label: 'Latest', view: '3d', camera3D: 'right' }]);
  let finish, signal; const events = []; carousel.addEventListener('slidechange', event => events.push(event.detail.index));
  viewer.load = async (input, options) => { signal = options.signal; await new Promise(resolve => { finish = resolve; }); return true; };
  const old = carousel.show(0); await Promise.resolve();
  const skipped = carousel.show(1), latest = carousel.show(2);
  assert.equal(signal.aborted, true); assert.deepEqual(calls, []);
  finish(); assert.equal(await old, false); assert.equal(await skipped, false); assert.equal(await latest, true);
  assert.deepEqual(events, [2]); assert.deepEqual(calls, [['view', '3d'], ['camera3D', 'right']]);
  viewer.setView = async () => { await new Promise(resolve => { finish = resolve; }); return true; };
  const disposed = carousel.show(0); await Promise.resolve(); await Promise.resolve();
  carousel.dispose(); finish(); assert.equal(await disposed, false); assert.deepEqual(events, [2]);
});

test('failed slides report errors, stop playback and permit retry', async () => {
  const { carousel, viewer } = fixture(); const errors = [];
  carousel.addEventListener('error', event => errors.push(event.detail));
  viewer.setView = async () => { throw new Error('renderer unavailable'); };
  carousel.play(); await carousel.queue; await assert.rejects(carousel.show(1), /renderer unavailable/);
  assert.equal(carousel.playing, false); assert.equal(errors.length, 1); assert.equal(carousel.index, 0);
  assert.equal(carousel.root.getAttribute('aria-busy'), 'false');
  viewer.setView = async () => true; assert.equal(await carousel.show(1), true); carousel.dispose();
});

test('superseded rejection is quiet and disposal during a view change prevents camera application', async () => {
  const { carousel, viewer, calls } = fixture([{ label: 'Network', input: 'old' }, { label: 'Camera', view: '3d', camera3D: 'top' }]);
  let rejectLoad, finishView; const errors = []; carousel.addEventListener('error', event => errors.push(event.detail));
  viewer.load = () => new Promise((resolve, reject) => { rejectLoad = reject; });
  const old = carousel.show(0); await Promise.resolve();
  viewer.setView = () => new Promise(resolve => { finishView = resolve; });
  const latest = carousel.show(1); rejectLoad(new DOMException('Aborted', 'AbortError')); assert.equal(await old, false);
  await Promise.resolve(); assert.equal(typeof finishView, 'function');
  carousel.dispose(); finishView(true); assert.equal(await latest, false);
  assert.deepEqual(errors, []); assert.deepEqual(calls, []);
});

test('play schedules after completion, loops, and pauses for focus, hidden documents and reduced motion', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = (callback, delay) => { timers.set(++id, { callback, delay }); return id; };
  globalThis.clearTimeout = value => timers.delete(value);
  const { carousel, doc, motion } = fixture();
  try {
    assert.equal(carousel.play(), true); await carousel.queue;
    assert.equal(timers.size, 1); assert.equal([...timers.values()][0].delay, 5000);
    [...timers.values()][0].callback(); await carousel.queue; assert.equal(carousel.index, 1);
    [...timers.values()][0].callback(); await carousel.queue; assert.equal(carousel.index, 0);
    carousel.root.dispatchEvent(new Event('focusin')); assert.equal(carousel.playing, false); assert.equal(timers.size, 0);
    carousel.play(); await carousel.queue; doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(carousel.playing, false); assert.equal(carousel.play(), false);
    doc.hidden = false; carousel.play(); await carousel.queue; motion.matches = true; motion.dispatchEvent(new Event('change'));
    assert.equal(carousel.playing, false); assert.equal(carousel.playButton.disabled, true); assert.equal(carousel.play(), false);
    assert.equal(await carousel.show(1), true);
    carousel.dispose(); assert.equal(timers.size, 0);
  } finally { carousel.dispose(); globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});

test('constructor rejects excessive entries, invalid timing and conflicting camera modes', () => {
  const { carousel, host, viewer } = fixture(); carousel.dispose();
  for (const slides of [[], Array.from({ length: 101 }, () => ({ label: 'x' })), [{ label: '' }], [{ label: 'x', view: 'invalid' }], [{ label: 'x', source: 'text', input: 'url' }], [{ label: 'x', view: 'pcb', camera3D: 'top' }], [{ label: 'x', camera3D: 'unknown' }]]) assert.throws(() => new ViewerCarousel(host, { viewer, slides }), TypeError);
  assert.throws(() => new ViewerCarousel(host, { viewer, slides: [{ label: 'x' }], interval: 0 }), /interval/);
  assert.equal(host.children.length, 0);
});
