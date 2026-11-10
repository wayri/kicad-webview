import {highlightSettings} from '../../src/inspection-api.mjs';
import {appearanceName} from '../../engine/spike/translucentAppearance.mjs';
/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Host adapters only: the viewer library remains the rendering authority. */
export function publicHTTPS(input, allowedHosts) {
  if (typeof input !== 'string' || !input || input.length > 8192 || /[\u0000-\u0020\u007f]/.test(input)) throw new TypeError('Supply a bounded HTTPS URL.');
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' ||
      host.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(host) || !host.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || host.endsWith('.')) throw new TypeError('Use a public HTTPS hostname without credentials.');
  if (allowedHosts && (!Array.isArray(allowedHosts) || !allowedHosts.includes(host))) throw new TypeError('The URL hostname is not approved for this integration.');
  return url;
}

export function publicSource(input, allowedHosts) {
  const url = publicHTTPS(input, allowedHosts);
  // The initial beta accepts public, stable sources only. Signed/private links
  // must not be stored in page configuration, Slack metadata or share URLs.
  if (url.search || url.hash) throw new TypeError('Public beta sources must not contain query strings or fragments.');
  return url.href;
}

export function validateEmbedOptions({ theme = 'light', view, file, ref, inspectOnSelect, highlightStyle, highlightColor, appearance } = {}) {
  if (!['light', 'dark'].includes(theme)) throw new TypeError('Choose light or dark theme.');
  if (view !== undefined && !['pcb', 'schematic', '3d', 'manufacturing'].includes(view)) throw new TypeError('Unknown viewer mode.');
  for (const [name, value] of Object.entries({ file, ref })) {
    if (value !== undefined && (typeof value !== 'string' || !value || value.length > 1000 ||
      /[\\\u0000-\u001f\u007f?#:%]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')))
      throw new TypeError('Invalid ' + name + ' option.');
  }
  if(inspectOnSelect!==undefined&&typeof inspectOnSelect!=='boolean')throw new TypeError('inspectOnSelect must be a boolean.');
  if(highlightStyle!==undefined||highlightColor!==undefined)highlightSettings(highlightStyle,highlightColor);if(appearance!==undefined)appearanceName(appearance);
  return { theme, ...(highlightStyle!==undefined?{highlightStyle}:{}), ...(highlightColor!==undefined?{highlightColor}:{}), ...(appearance!==undefined?{appearance}:{}), ...(inspectOnSelect!==undefined?{inspectOnSelect}:{}), ...(view ? { view } : {}), ...(file ? { file } : {}), ...(ref ? { ref } : {}) };
}

export function buildEmbedURL(viewerPage, source, options = {}, { sourceHosts, viewerHosts } = {}) {
  const page = publicHTTPS(viewerPage, viewerHosts);
  if (page.search || page.hash || !page.pathname.endsWith('/embed.html')) throw new TypeError('Choose the deployed viewer embed.html page without query parameters.');
  page.searchParams.set('src', publicSource(source, sourceHosts));
  for (const [name, value] of Object.entries(validateEmbedOptions(options))) page.searchParams.set(name, value);
  return page.href;
}
