/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { AltiumViewer } from '../src/altium-viewer.mjs';

const viewer = new AltiumViewer('#drawing');
const message = document.querySelector('#message');
document.querySelector('#open').onsubmit = event => {
  event.preventDefault();
  try {
    viewer.load(document.querySelector('#source').value, { view: document.querySelector('#view').value });
    message.textContent = 'Embed mounted. Design processing and any service errors appear inside the Altium viewer.';
  } catch (error) { message.textContent = error.message; }
};
viewer.addEventListener('error', event => { message.textContent = event.detail.message; });
window.addEventListener('pagehide', () => viewer.dispose(), { once: true });
