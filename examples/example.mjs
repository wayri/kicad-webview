/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { KiCadViewer } from '../src/kicad-viewer.mjs';

const viewer = new KiCadViewer('#drawing', { theme: 'dark' });
const message = document.querySelector('#message');
const showError = error => { message.textContent = error.message; };
document.querySelector('#open').onsubmit = async event => {
  event.preventDefault();
  try { await viewer.load(document.querySelector('#source').value); message.textContent = viewer.path; }
  catch (error) { showError(error); }
};
document.querySelector('#file').onchange = async event => {
  const files=event.target.files;if(!files.length)return;
  try {
    if(files.length===1 && /\.zip$/i.test(files[0].name)) {
      if(files[0].size>64*1024*1024)throw new Error('Choose a ZIP smaller than 64 MiB.');
      await viewer.loadArchive(await files[0].arrayBuffer());
    } else await viewer.loadFiles(files);
    message.textContent=viewer.path;
  }catch(error){showError(error);}
};
document.querySelector('#fabrication').onclick=async()=>{try{await viewer.load('./manufacturing/inverter-fabrication.zip');message.textContent='Inverter fabrication beta · toggle layers, inspect geometry or measure in mm.';}catch(error){showError(error);}};
viewer.addEventListener('measure',event=>{message.textContent=event.detail.distance.toFixed(3)+' mm';});
viewer.addEventListener('select', event => {
  const item = event.detail.item;
  message.textContent = item ? 'Selection details are open in the inspector.' : 'Selection cleared';
});
window.addEventListener('pagehide', () => viewer.dispose(), { once: true });

viewer.load(document.querySelector('#source').value).then(() => { message.textContent = 'Three-phase inverter · select a part or pad to inspect, or open Inspect to search parts and layers.'; }).catch(showError);
