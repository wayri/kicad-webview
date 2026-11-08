/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { view } from '@forge/bridge';
import { mountConfluenceViewer, saveMacroConfig } from './controller.mjs';
import policy from '../policy.json';

const error = document.querySelector('#error');
const showError = value => { error.textContent = value.message || String(value); error.hidden = false; };
try {
  const context = await view.getContext();
  if (context.extension?.macro?.isConfiguring) {
    const form = document.querySelector('#config'); form.hidden = false;
    const config = context.extension.config || {};
    for (const name of ['source', 'theme', 'view', 'file', 'ref']) if (typeof config[name] === 'string') form.elements.namedItem(name).value = config[name];
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true;
      const submit = form.querySelector('button[type=submit]'); submit.disabled = true;
      try { await saveMacroConfig(view, Object.fromEntries(new FormData(form)), policy.sourceHosts); }
      catch (value) { showError(value); }
      finally { submit.disabled = false; }
    });
    document.querySelector('#cancel').addEventListener('click', () => view.close().catch(showError));
  } else {
    const target = document.querySelector('#drawing'); target.hidden = false;
    let viewer;
    window.addEventListener('pagehide', () => viewer?.dispose(), { once: true });
    await mountConfluenceViewer({ bridge: view, Viewer: globalThis.KiCadWebView.Viewer, target, sourceHosts: policy.sourceHosts, context, onCreate: instance => { viewer = instance; } });
  }
} catch (value) { showError(value); }
