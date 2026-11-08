/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Beta adapter for Altium's documented online embed, not a native file parser. */
import { viewerOwners as owners } from './viewer-host.mjs';

const scriptURL = 'https://viewer.altium.com/client/static/js/embed.js';
const viewNames = Object.freeze({ schematic: 'sch', pcb: 'pcb', '3d': '3d', bom: 'bom' });
const defaults = ['schematic', 'pcb', '3d', 'bom'];
const escapeAttribute = value => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function viewOptions(view, views) {
  if (!Array.isArray(views) || !views.length || views.length > 4 ||
      views.some(name => !Object.hasOwn(viewNames, name)) || new Set(views).size !== views.length ||
      views.every(name => name === 'bom')) throw new TypeError('Choose schematic, pcb, 3d and optionally bom views.');
  if (!['schematic', 'pcb', '3d'].includes(view) || !views.includes(view))
    throw new TypeError('The initial view must be an enabled schematic, pcb or 3d view.');
  return { view, views: [...views] };
}

function projectURL(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new TypeError('Use a public HTTPS archive URL without embedded credentials.');
  if (!/\.(zip|rar|7z)$/i.test(url.pathname))
    throw new TypeError('The Altium beta expects a publicly hosted .zip, .rar or .7z project archive.');
  // A cloud viewer cannot access a loopback/LAN file. Do not mistake those for public inputs.
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host))
    throw new TypeError('Use a public hostname reachable by Altium, rather than a local address or IP literal.');
  return url.href;
}

function embedDocument(url, { view, views }) {
  // User input is attribute data only. The wrapper runs at an opaque sandbox origin.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Altium 365 beta viewer</title><style>
html,body{height:100%;width:100%;margin:0}body{font:13px/1.4 system-ui}
.altium-ecad-viewer{height:100%;width:100%;box-sizing:border-box;overflow:hidden}
#error{padding:12px;color:#842828}
</style></head><body>
<div class="altium-ecad-viewer" data-project-src="${escapeAttribute(url)}"
 data-enabled-views="${views.map(name => viewNames[name]).join(',')}"
 data-active-view="${viewNames[view]}" data-src-type="Design" data-project-outputs="none">
<a href="https://www.altium365.com/viewer/">PCB File Viewer by Altium</a>
</div><div id="error" role="alert" hidden></div>
<script src="${scriptURL}" onerror="document.getElementById('error').hidden=false;document.getElementById('error').textContent='Altium viewer could not load. Check network access and your site content policy.';parent.postMessage({type:'altium-beta:script-error'},'*')"
 onload="parent.postMessage({type:'altium-beta:script-loaded'},'*')"></script>
</body></html>`;
}

/** Opt-in online Altium embed. Importing/constructing performs no network access. */
export class AltiumViewer extends EventTarget {
  constructor(target, { view = 'schematic', views = defaults } = {}) {
    super();
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host?.append || !host?.ownerDocument?.defaultView)
      throw new TypeError('Choose a viewer container in a browser document.');
    if (owners.has(host)) throw new Error('This container already has a viewer.');
    const options = viewOptions(view, views);
    this.host = host;
    this.window = host.ownerDocument.defaultView;
    this.view = options.view;
    this.views = options.views;
    this.disposed = false;
    this.frame = null;
    this.url = null;
    this.root = host.ownerDocument.createElement('div');
    this.root.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden';
    this.stage = host.ownerDocument.createElement('div');
    this.stage.style.cssText = 'flex:1;min-height:0;position:relative';
    this.status = host.ownerDocument.createElement('div');
    this.status.setAttribute('role', 'status');
    this.status.style.cssText = 'font:12px/1.4 system-ui;padding:4px 8px;background:#f5f7fa;color:#253044';
    this.status.textContent = 'Altium 365 beta · online viewer';
    this.root.append(this.stage, this.status);
    host.append(this.root);
    owners.set(host, this);
    this.onMessage = event => {
      if (this.disposed || !this.frame || event.source !== this.frame.contentWindow || event.origin !== 'null') return;
      if (event.data?.type === 'altium-beta:script-error') {
        const error = new Error('The Altium embed script could not load.');
        this.status.textContent = error.message;
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      } else if (event.data?.type === 'altium-beta:script-loaded') {
        // This confirms only the bootstrap script, never successful design processing.
        this.dispatchEvent(new CustomEvent('providerload', { detail: { provider: 'altium365' } }));
      }
    };
    this.window.addEventListener('message', this.onMessage);
  }

  assertActive() { if (this.disposed) throw new Error('Viewer has been disposed.'); }

  /** Pass only a public project archive authorized for processing by Altium. */
  load(url, { view = this.view, views = this.views } = {}) {
    this.assertActive();
    const address = projectURL(url, this.host.ownerDocument.baseURI);
    const options = viewOptions(view, views);
    const frame = this.host.ownerDocument.createElement('iframe');
    frame.title = 'Interactive Altium schematic, PCB and 3D viewer (beta)';
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = embedDocument(address, options);
    this.stage.replaceChildren(frame);
    this.frame = frame;
    this.url = address;
    this.view = options.view;
    this.views = options.views;
    this.status.textContent = 'Altium 365 beta · online viewer';
    this.dispatchEvent(new CustomEvent('mount', { detail: { provider: 'altium365', view: this.view, views: [...this.views] } }));
    return this;
  }

  /** Remounts with a new initial view; current provider camera/selection is lost. */
  setView(view) {
    this.assertActive();
    if (!this.url) throw new Error('Load a public project archive first.');
    return this.load(this.url, { view });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.window.removeEventListener('message', this.onMessage);
    this.stage.replaceChildren();
    this.frame = this.url = null;
    this.root.remove();
    owners.delete(this.host);
  }
}
