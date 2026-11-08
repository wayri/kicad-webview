/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { publicSource, validateEmbedOptions } from '../../shared/embed-url.mjs';

export function validateMacroConfig(input, sourceHosts) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Configure a public design URL.');
  const source = publicSource(input.source, sourceHosts);
  const options = validateEmbedOptions({ theme: input.theme || 'light', ...(input.view ? { view: input.view } : {}),
    ...(input.file ? { file: input.file } : {}), ...(input.ref ? { ref: input.ref } : {}) });
  return { source, ...options };
}

/** Host bridge and viewer injected for contract testing; production uses the built library. */
export async function mountConfluenceViewer({ bridge, Viewer, target, sourceHosts, context, onCreate }) {
  const hostContext = context || await bridge.getContext();
  const config = validateMacroConfig(hostContext.extension?.config, sourceHosts);
  const viewer = new Viewer(target, { theme: config.theme });
  try {
    onCreate?.(viewer);
    await viewer.load(config.source, { ...(config.view ? { view: config.view } : {}), ...(config.file ? { file: config.file } : {}), ...(config.ref ? { ref: config.ref } : {}) });
    return viewer;
  } catch (error) { viewer.dispose(); throw error; }
}

export async function saveMacroConfig(bridge, input, sourceHosts) {
  const config = validateMacroConfig(input, sourceHosts);
  await bridge.submit({ config });
  return config;
}
