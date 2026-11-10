/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { KiCadViewer } from '../src/kicad-viewer.mjs';
import { AltiumViewer } from '../src/altium-viewer.mjs';

const query = new URLSearchParams(location.search);
try {
  if (!query.get('src')) throw new Error('Supply a design URL in the src query parameter.');
  const provider = query.get('provider') || 'kicad';
  if (!['kicad', 'altium'].includes(provider)) throw new Error('Choose the kicad or altium provider.');
  const viewer = provider === 'altium' ? new AltiumViewer('#drawing')
    : new KiCadViewer('#drawing', { theme: query.get('theme') || 'light', inspectOnSelect:query.get('inspectOnSelect')!=='false', highlightStyle:query.get('highlightStyle')||'dim', highlightColor:query.get('highlightColor')||'accent', appearance:query.get('appearance')||'realistic' });
  window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
  const options = { view: query.get('view') || undefined };
  if (provider === 'kicad') {
    options.file = query.get('file') || undefined;
    options.ref = query.get('ref') || undefined;
  }
  await viewer.load(query.get('src'), options);
} catch (error) {
  const panel = document.querySelector('#error');
  panel.hidden = false;
  panel.textContent = error.message;
}
