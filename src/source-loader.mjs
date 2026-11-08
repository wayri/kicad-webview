/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Public, browser-only source resolution. No service credentials or filesystem access. */
import { isDrawingPath, isManufacturingPath, isArchivePath } from './source-types.mjs';
import { detectManufacturing } from './manufacturing/index.mjs';
const MAX_SOURCE = 64 * 1024 * 1024;
const MAX_METADATA = 8 * 1024 * 1024;
const MAX_ASSET = 8 * 1024 * 1024;
const MAX_FILES = 256;
const drawing = isDrawingPath;
const supported = path => drawing(path) || /\.(wrl|glb)$/i.test(path);
const sha = value => typeof value === 'string' && /^[a-f\d]{40}$/i.test(value);

export function httpURL(input, base) {
  if (!(input instanceof URL) && (typeof input !== 'string' || !input || input.length > 8192))
    throw new TypeError('Supply a non-empty design URL.');
  const url = new URL(input, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new TypeError('Use an HTTP(S) design URL without embedded credentials.');
  return url;
}

function credentialMode(value) {
  if (!['omit', 'same-origin'].includes(value)) throw new TypeError('Credentials must be omit or same-origin.');
  return value;
}

async function cancelBody(response) {
  try { await response.body?.cancel(); } catch { /* Preserve the original request/limit failure. */ }
}

async function readResponse(url, { signal, credentials = 'omit', limit = MAX_SOURCE } = {}, binary = false) {
  credentialMode(credentials);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_SOURCE) throw new TypeError('Invalid download limit.');
  signal?.throwIfAborted();
  const response = await fetch(httpURL(url), { signal, credentials, referrerPolicy: 'no-referrer' });
  if (signal?.aborted) { await cancelBody(response); signal.throwIfAborted(); }
  if (!response.ok) {
    await cancelBody(response);
    throw new Error(`Design request failed (${response.status}).`);
  }
  const tooLarge = () => new Error(`Design exceeds the ${limit === MAX_SOURCE ? '64 MiB' : limit + ' byte'} download limit.`);
  if (Number(response.headers.get('content-length')) > limit) {
    await cancelBody(response);
    throw tooLarge();
  }
  if (!response.body?.getReader) throw new Error('Streaming downloads are unavailable; use loadSource.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, source = '';
  const chunks = binary ? [] : null;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw tooLarge();
      if (binary) chunks.push(value.slice());
      else source += decoder.decode(value, { stream: true });
    }
    if (!binary) source += decoder.decode();
  } finally { try { await reader.cancel(); } catch { /* Cleanup must not mask cancellation or size errors. */ } }
  let bytes;
  if (binary) {
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  }
  return { source, bytes, size, type: response.headers.get('content-type') || '', url: response.url || String(url) };
}

export async function fetchBytes(url, options = {}) { return (await readResponse(url, options, true)).bytes; }

export async function fetchText(url, options = {}) {
  return (await readResponse(url, options)).source;
}

/** A renderer-compatible linked-model response, preserving the downloaded bytes. */
export async function fetchAsset(url, { signal, credentials = 'omit' } = {}) {
  const { bytes } = await readResponse(url, { signal, credentials, limit: MAX_ASSET }, true);
  let binary = '';
  // Keep each call's argument count bounded on all supported browser engines.
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { base64: btoa(binary) };
}

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1000 &&
    !/[\\\x00-\x1f\x7f%?#:]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

function parseJSON(text) {
  try { return JSON.parse(text); }
  catch { throw new Error('Expected a valid project manifest or repository JSON response.'); }
}

function normalizeManifest(manifest, baseURL) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES)
    throw new TypeError('A project manifest needs between 1 and 256 files.');
  const seen = new Set();
  const files = manifest.files.map(item => {
    if (!item || !safePath(item.path) || !supported(item.path) || typeof item.url !== 'string' || !item.url)
      throw new TypeError('Each manifest file needs a safe relative drawing/model path and HTTP(S) URL.');
    if (seen.has(item.path)) throw new TypeError('Project file paths must be unique.');
    seen.add(item.path);
    return Object.freeze({ path: item.path, url: httpURL(item.url, baseURL).href });
  });
  if (!files.some(item => drawing(item.path))) throw new TypeError('A project must contain a supported KiCad, manufacturing or ZIP drawing.');
  if (manifest.entry !== undefined && (!safePath(manifest.entry) || !files.some(item => item.path === manifest.entry && drawing(item.path))))
    throw new TypeError('The project entry must name a listed supported drawing.');
  return { files: Object.freeze(files), ...(manifest.entry !== undefined ? { entry: manifest.entry } : {}) };
}

async function loadProject(project, options) {
  const requested = options.file || project.entry;
  const entry = requested ? project.files.find(item => item.path === requested && drawing(item.path))
    : [...project.files].filter(item => drawing(item.path)).sort((a, b) => {
      const pcbFirst = Number(/\.kicad_pcb$/i.test(b.path)) - Number(/\.kicad_pcb$/i.test(a.path));
      return pcbFirst || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    })[0];
  if (!entry) throw new Error('The requested project drawing is not listed.');
  const retained = Object.freeze({ ...project, entry: entry.path });
  if (isArchivePath(entry.path)) return { archive: await fetchBytes(entry.url, options), path: entry.path, project: retained };
  if (options.metadataOnly) return {path:entry.path,project:retained};
  if (isManufacturingPath(entry.path)) {
    const files=[]; let total=0;
    for(const item of project.files.filter(item=>isManufacturingPath(item.path))) {
      const source=await fetchText(item.url,{...options,limit:32*1024*1024}); total+=new TextEncoder().encode(source).byteLength;
      if(total>128*1024*1024)throw new Error('Manufacturing project exceeds 128 MiB.');
      if(!item.path.toLowerCase().endsWith('.txt')||detectManufacturing(source,item.path))files.push({path:item.path,source});
    }
    const chosen=files.find(file=>file.path===entry.path)||(!requested?files[0]:null);
    if(!chosen)throw new Error('The requested manufacturing entry was not recognized as Gerber or Excellon.');
    const recognized=new Set(files.map(file=>file.path));
    return {files,path:chosen.path,project:Object.freeze({...retained,entry:chosen.path,files:Object.freeze(project.files.filter(file=>!file.path.toLowerCase().endsWith('.txt')||recognized.has(file.path)))})};
  }
  const source = await fetchText(entry.url, options);
  return { source, path: entry.path, project: retained };
}

function githubLocation(url, explicitRef) {
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { throw new TypeError('Invalid encoded GitHub path.'); }
  if (parts.length < 2 || parts.slice(0, 2).some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || ['.', '..'].includes(part)))
    throw new TypeError('Use a GitHub repository, tree or file link.');
  const [owner, repo] = parts;
  const repository = `${owner}/${repo.replace(/\.git$/i, '')}`;
  if (!repository.split('/')[1]) throw new TypeError('Invalid GitHub repository.');
  if (parts.length === 2) return { repository, ref: explicitRef, path: '', type: 'repo' };
  const type = parts[2];
  if (!['blob', 'tree'].includes(type)) throw new TypeError('Use a GitHub repository, tree or blob link.');
  const tail = parts.slice(3).join('/');
  const ref = explicitRef || parts[3];
  if (typeof ref !== 'string' || !ref || ref.length > 500 || !/^[A-Za-z0-9_./-]+$/.test(ref) ||
      ref.split('/').some(part => !part || part === '.' || part === '..'))
    throw new TypeError('Invalid GitHub revision. Use the ref option for branches containing slashes.');
  if (!(tail === ref || tail.startsWith(ref + '/')))
    throw new TypeError('The explicit ref must match the GitHub URL.');
  const path = tail.slice(ref.length).replace(/^\//, '');
  if (path && !safePath(path) || type === 'blob' && !path) throw new TypeError('Invalid GitHub design path.');
  return { repository, ref, path, type };
}

function rawURL(repository, revision, path) {
  return `https://raw.githubusercontent.com/${repository}/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function loadGithub(url, options) {
  const location = githubLocation(url, options.ref);
  const api = `https://api.github.com/repos/${location.repository}`;
  let remaining = MAX_METADATA;
  const json = async address => {
    const result = await readResponse(address, { ...options, credentials: 'omit', limit: remaining });
    remaining -= result.size;
    if (remaining <= 0) throw new Error('GitHub metadata exceeds the 8 MiB budget.');
    const data = parseJSON(result.source);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid GitHub response.');
    return data;
  };
  if (!location.ref) {
    const metadata = await json(api);
    location.ref = metadata.default_branch;
  }
  if (typeof location.ref !== 'string' || !location.ref || location.ref.length > 500 || /[\x00-\x1f\x7f]/.test(location.ref))
    throw new Error('GitHub did not provide a valid default revision.');
  const commit = await json(`${api}/commits/${encodeURIComponent(location.ref)}`);
  if (!sha(commit.sha) || !sha(commit.commit?.tree?.sha)) throw new Error('GitHub did not provide an immutable commit/tree revision.');
  const revision = commit.sha;
  if (location.type === 'blob' && /\.json$/i.test(location.path)) {
    const address = rawURL(location.repository, revision, location.path);
    const result = await readResponse(address, { ...options, limit: MAX_METADATA });
    const project = normalizeManifest(parseJSON(result.source), result.url);
    // Relative manifest URLs already inherit this immutable raw-file base. An
    // explicit external URL stays external, so do not label the whole manifest pinned.
    return loadProject(project, options);
  }
  if (location.type === 'blob' && drawing(location.path) && !options.file) {
    const address=rawURL(location.repository, revision, location.path);
    if(isArchivePath(location.path)) return {archive:await fetchBytes(address,options),path:location.path,project:null};
    if(options.metadataOnly) return {path:location.path,project:{entry:location.path,files:[{path:location.path,url:address}]}};
    return { source: await fetchText(address, options), path: location.path, project: null };
  }
  const tree = await json(`${api}/git/trees/${commit.commit.tree.sha}?recursive=1`);
  if (tree.truncated === true) throw new Error('GitHub returned a truncated tree. Use a hosted project manifest for this repository.');
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('Invalid GitHub file listing.');
  let directory = location.path;
  if (location.type === 'blob') {
    if (!/\.kicad_pro$/i.test(location.path)) throw new TypeError('Choose a KiCad project, schematic or PCB link.');
    directory = location.path.split('/').slice(0, -1).join('/');
    if (!tree.tree.some(item => item.path === location.path && item.type === 'blob' && !['120000', '160000'].includes(item.mode)))
      throw new Error('The requested KiCad project is not present at this revision.');
  }
  const files = [];
  for (const item of tree.tree) {
    if (item.type !== 'blob' || !['100644', '100755'].includes(item.mode) || !safePath(item.path) || !supported(item.path)) continue;
    if (directory && !item.path.startsWith(directory + '/')) continue;
    files.push(Object.freeze({ path: item.path, url: rawURL(location.repository, revision, item.path) }));
    if (files.length > MAX_FILES) throw new Error('The project exceeds 256 supported files. Use a smaller project manifest.');
  }
  if (!files.some(item => drawing(item.path))) throw new Error('No supported KiCad or manufacturing drawings were found in this project.');
  let entry;
  if (location.type === 'blob') {
    const stem = location.path.replace(/\.kicad_pro$/i, '');
    entry = [stem + '.kicad_pcb', stem + '.kicad_sch'].find(path => files.some(item => item.path === path));
  }
  return loadProject({ files: Object.freeze(files), entry, revision, repository: location.repository }, options);
}

/** Resolve one selected drawing while retaining project file URLs for navigation/assets. */
export async function resolveSource(input, { baseURL, signal, ref, file, credentials = 'omit', metadataOnly = false } = {}) {
  const options = { signal, ref, file, credentials: credentialMode(credentials), metadataOnly:metadataOnly === true };
  if (input && typeof input === 'object' && !(input instanceof URL))
    return loadProject(normalizeManifest(input, baseURL), options);
  let url = httpURL(input, baseURL);
  if (url.hostname === 'github.com' && !url.port && url.protocol === 'https:') return loadGithub(url, options);
  if (url.hostname === 'gitlab.com' && !url.port && url.protocol === 'https:' && url.pathname.includes('/-/blob/')) {
    url = new URL(url.href.replace('/-/blob/', '/-/raw/'));
  }
  if (/\.kicad_pro$/i.test(url.pathname))
    throw new TypeError('A hosted .kicad_pro needs a project manifest listing its schematic and PCB URLs.');
  if(isArchivePath(url.pathname)) return {archive:await fetchBytes(url,options),path:decodeURIComponent(url.pathname.split('/').at(-1)),project:null};
  if(options.metadataOnly && drawing(url.pathname)) {
    let path;try{path=decodeURIComponent(url.pathname.split('/').at(-1));}catch{throw new TypeError('Invalid encoded design filename.');}
    const project=normalizeManifest({entry:path,files:[{path,url:url.href}]},url.href);
    return {path,project};
  }
  const result = await readResponse(url, { ...options, limit: /\.json$/i.test(url.pathname) ? MAX_METADATA : MAX_SOURCE });
  if (/\.json$/i.test(url.pathname) || /\bapplication\/(?:[a-z\d.+-]+\+)?json\b/i.test(result.type)) {
    if (result.size > MAX_METADATA) throw new Error('Project manifest exceeds 8 MiB.');
    return loadProject(normalizeManifest(parseJSON(result.source), result.url), options);
  }
  let path;
  try { path = decodeURIComponent(url.pathname.split('/').at(-1)); }
  catch { throw new TypeError('Invalid encoded design filename.'); }
  return { source: result.source, path: path || 'drawing.kicad_pcb', project: null };
}
