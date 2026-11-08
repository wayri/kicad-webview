/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
let ready;
export function loadThree() {
  if (globalThis.SpikeBoard3D) return Promise.resolve(globalThis.SpikeBoard3D);
  if (!ready) ready = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../engine/vendor/spike-board3d.bundle.js', import.meta.url).href;
    script.onload = () => {
      script.remove();
      if (globalThis.SpikeBoard3D) resolve(globalThis.SpikeBoard3D);
      else { ready = null; reject(new Error('3D renderer did not initialize.')); }
    };
    script.onerror = () => { script.remove(); ready = null; reject(new Error('Cannot load the 3D renderer.')); };
    document.head.append(script);
  });
  return ready;
}
