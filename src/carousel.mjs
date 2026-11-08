/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Read-only presentation controls for an existing KiCadViewer. */
export class ViewerCarousel extends EventTarget {
  constructor(target, { viewer, slides, interval = 5000 } = {}) {
    super();
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host?.ownerDocument || !host.append) throw new TypeError('Choose a carousel controls container.');
    if (!viewer || typeof viewer.setView !== 'function') throw new TypeError('Supply an existing KiCadViewer.');
    if (!Array.isArray(slides) || slides.length < 1 || slides.length > 100) throw new TypeError('Choose 1 to 100 presentation slides.');
    if (!Number.isFinite(interval) || interval < 1000 || interval > 3600000) throw new TypeError('Choose an interval from 1000 to 3600000 milliseconds.');
    this.slides = slides.map((slide, i) => {
      if (!slide || typeof slide !== 'object' || typeof slide.label !== 'string' || !slide.label.trim() || slide.label.length > 500) throw new TypeError('Each slide needs a label of 1 to 500 characters.');
      if (slide.view !== undefined && !['pcb', 'schematic', '3d', 'manufacturing'].includes(slide.view)) throw new TypeError('Choose a supported slide view.');
      if ('source' in slide && ('input' in slide || typeof slide.source !== 'string')) throw new TypeError('Choose either source text or a load input.');
      if (slide.camera && slide.view === '3d') throw new TypeError('Programmable cameras require a 2D drawing view.');
      if (slide.camera3D !== undefined && !['top', 'bottom', 'front', 'back', 'left', 'right', 'isometric'].includes(slide.camera3D)) throw new TypeError('Choose a named 3D camera preset.');
      if (slide.camera3D !== undefined && (slide.camera || slide.view !== undefined && slide.view !== '3d')) throw new TypeError('3D camera presets require a 3D view without a 2D camera.');
      if (slide.net !== undefined && (typeof slide.net !== 'string' || !slide.net || slide.net.length > 1000)) throw new TypeError('Choose a saved net name.');
      return { ...slide, options: { ...slide.options }, camera: slide.camera ? { ...slide.camera, center: { ...slide.camera.center } } : undefined };
    });
    this.viewer = viewer; this.host = host; this.doc = host.ownerDocument; this.interval = interval;
    this.index = -1; this.requestedIndex = -1; this.ticket = 0; this.disposed = false; this.playing = false; this.queue = Promise.resolve(); this.listeners = [];
    const make = (tag, text) => { const node = this.doc.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
    this.root = make('section'); this.root.setAttribute('aria-label', 'Drawing presentation');
    this.root.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:8px;font:inherit';
    const button = (label, action) => { const node = make('button', label); node.type = 'button'; node.setAttribute('aria-label', label); node.onclick = () => { this.pause(); Promise.resolve().then(action).catch(() => {}); }; return node; };
    this.previousButton = button('Previous slide', () => this.previous());
    this.nextButton = button('Next slide', () => this.next());
    this.playButton = button('Play presentation', () => this.play());
    // Toggle without the manual-navigation pause used by the other buttons.
    this.playButton.onclick = () => { if (this.playing) this.pause(); else this.play(); };
    this.label = make('span', 'Choose a slide'); this.label.setAttribute('role', 'status'); this.label.setAttribute('aria-live', 'polite'); this.label.setAttribute('aria-atomic', 'true');
    this.root.append(this.previousButton, this.label, this.nextButton, this.playButton); host.append(this.root);
    this.motion = this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
    const listen = (target, name, callback) => { target?.addEventListener?.(name, callback); this.listeners.push(() => target?.removeEventListener?.(name, callback)); };
    listen(this.motion, 'change', () => { if (this.motion.matches) this.pause(); this.refresh(); });
    listen(this.doc, 'visibilitychange', () => { if (this.doc.hidden) this.pause(); });
    listen(this.root, 'focusin', () => this.pause());
    this.refresh();
  }
  assertActive() { if (this.disposed) throw new Error('Carousel has been disposed.'); }
  emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
  refresh() {
    this.previousButton.disabled = this.requestedIndex <= 0;
    this.nextButton.disabled = this.requestedIndex >= this.slides.length - 1;
    this.playButton.disabled = this.slides.length < 2 || Boolean(this.motion?.matches);
    this.playButton.textContent = this.playing ? 'Pause presentation' : 'Play presentation';
    this.playButton.setAttribute('aria-label', this.playButton.textContent);
    this.playButton.setAttribute('aria-pressed', String(this.playing));
  }
  /** Display a zero-based slide; returns false if superseded, aborted or disposed. */
  show(index) {
    this.assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.slides.length) throw new RangeError('Choose a slide index in the presentation.');
    const ticket = ++this.ticket; this.requestedIndex = index; this.pending?.abort(); clearTimeout(this.timer); this.refresh();
    const current = () => !this.disposed && ticket === this.ticket;
    const run = async () => {
      if (!current()) return false;
      const slide = this.slides[index], controller = new AbortController(); this.pending = controller;
      this.root.setAttribute('aria-busy', 'true');
      try {
        let ok;
        if ('input' in slide) ok = await this.viewer.load(slide.input, { ...slide.options, view: slide.view, signal: controller.signal });
        else if ('source' in slide) ok = await this.viewer.loadSource(slide.source, { ...slide.options, view: slide.view, signal: controller.signal });
        if (!current() || ok === false) return false;
        if (slide.view !== undefined && this.viewer.view !== slide.view) {
          ok = await this.viewer.setView(slide.view);
          if (!current() || ok === false) return false;
        }
        if (slide.camera) this.viewer.setCamera(slide.camera);
        if (slide.camera3D !== undefined) this.viewer.setCamera3D(slide.camera3D);
        if (slide.clearSelection) this.viewer.clearSelection();
        if (slide.net !== undefined && !this.viewer.selectNet(slide.net)) throw new Error('Saved net is absent from this drawing: ' + slide.net);
        if (!current()) return false;
        this.index = index; this.label.textContent = (index + 1) + ' / ' + this.slides.length + ' · ' + slide.label;
        this.emit('slidechange', { index, label: slide.label }); return true;
      } catch (error) {
        if (!current() || controller.signal.aborted) return false;
        this.pause(); this.label.textContent = 'Unable to show ' + slide.label + ': ' + error.message;
        this.emit('error', { index, error }); throw error;
      } finally {
        if (current()) { this.pending = null; this.root.setAttribute('aria-busy', 'false'); this.schedule(); }
      }
    };
    const result = this.queue.then(run); this.queue = result.catch(() => {}); return result;
  }
  next() { this.assertActive(); return this.show(Math.min(this.slides.length - 1, this.requestedIndex + 1)); }
  previous() { this.assertActive(); return this.show(Math.max(0, this.requestedIndex - 1)); }
  play() {
    this.assertActive(); if (this.motion?.matches || this.doc.hidden || this.slides.length < 2) return false;
    this.playing = true; this.refresh();
    if (this.requestedIndex < 0) this.show(0).catch(() => {}); else this.queue.then(() => this.schedule());
    return true;
  }
  schedule() {
    clearTimeout(this.timer);
    if (!this.disposed && this.playing) this.timer = setTimeout(() => { if (!this.disposed && this.playing) this.show((this.requestedIndex + 1) % this.slides.length).catch(() => {}); }, this.interval);
  }
  pause() { if (this.disposed) return; this.playing = false; clearTimeout(this.timer); this.refresh(); }
  /** Removes controls and cancels queued work; the supplied viewer remains owned by its caller. */
  dispose() {
    if (this.disposed) return;
    this.pause(); this.disposed = true; ++this.ticket; this.pending?.abort();
    this.listeners.forEach(stop => stop()); this.listeners = [];
    this.previousButton.onclick = this.nextButton.onclick = this.playButton.onclick = null;
    this.root.remove();
  }
}
