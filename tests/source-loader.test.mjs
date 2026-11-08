import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSource, fetchText, fetchAsset, httpURL } from '../src/source-loader.mjs';

const source = '(kicad_pcb (version 20240108))';
const revision = 'a'.repeat(40), treeRevision = 'b'.repeat(40);
const api = 'https://api.github.com/repos/owner/board';
const raw = `https://raw.githubusercontent.com/owner/board/${revision}/`;
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const blob = path => ({ path, type: 'blob', mode: '100644' });
async function withFetch(implementation, run) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try { await run(); } finally { globalThis.fetch = original; }
}

test('hosted relative drawings resolve against the containing page without credentials', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url.href, 'https://site.example/project/board.kicad_pcb');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return new Response(source);
  }, async () => {
    assert.deepEqual(await resolveSource('board.kicad_pcb', { baseURL: 'https://site.example/project/' }),
      { source, path: 'board.kicad_pcb', project: null });
  });
});

test('manifest URLs resolve child URLs against the manifest and fetch only the selected drawing', async () => {
  const requests = [];
  await withFetch(async url => {
    requests.push(url.href);
    if (url.pathname.endsWith('.json')) return json({ files: [
      { path: 'board.kicad_sch', url: './drawing.kicad_sch' },
      { path: 'board.kicad_pcb', url: './layout.kicad_pcb' },
      { path: 'models/part.wrl', url: './part.wrl' },
    ] });
    return new Response(source);
  }, async () => {
    const result = await resolveSource('/design/project.json', { baseURL: 'https://site.example/blog/' });
    assert.equal(result.path, 'board.kicad_pcb');
    assert.equal(result.project.entry, 'board.kicad_pcb');
    assert.equal(result.project.files[2].url, 'https://site.example/design/part.wrl');
    assert.deepEqual(requests, ['https://site.example/design/project.json', 'https://site.example/design/layout.kicad_pcb']);
    assert.equal(Object.isFrozen(result.project.files), true);
  });
});

test('manifest objects support entry/file choice and do not trust a supplied array by reference', async () => {
  const manifest = { entry: 'child.kicad_sch', files: [
    { path: 'board.kicad_pcb', url: '/board.kicad_pcb' }, { path: 'child.kicad_sch', url: '/child.kicad_sch' },
  ] };
  await withFetch(async () => new Response(source), async () => {
    const result = await resolveSource(manifest, { baseURL: 'https://site.example/' });
    assert.equal(result.path, 'child.kicad_sch');
    assert.notEqual(result.project.files, manifest.files);
    assert.equal((await resolveSource(manifest, { baseURL: 'https://site.example/', file: 'board.kicad_pcb' })).path, 'board.kicad_pcb');
    await assert.rejects(resolveSource(manifest, { baseURL: 'https://site.example/', file: 'missing.kicad_sch' }), /not listed/);
  });
});

test('JSON content type and redirected manifest base are recognized', async () => {
  await withFetch(async url => {
    if (url.pathname === '/project') {
      const response = json({ files: [{ path: 'board.kicad_pcb', url: 'board.kicad_pcb' }] });
      Object.defineProperty(response, 'url', { value: 'https://cdn.example/hardware/project' });
      return response;
    }
    assert.equal(url.href, 'https://cdn.example/hardware/board.kicad_pcb');
    return new Response(source);
  }, async () => assert.equal((await resolveSource('https://site.example/project')).path, 'board.kicad_pcb'));
});

test('malformed, duplicate, traversal and unsupported manifest inputs reject without a source request', async () => {
  await withFetch(async () => { throw new Error('Unexpected network request'); }, async () => {
    for (const manifest of [{}, { files: [] }, { files: Array.from({ length: 257 }, (_, i) => ({ path: `${i}.kicad_pcb`, url: '/board' })) },
      { files: [{ path: '../board.kicad_pcb', url: '/board' }] },
      { files: [{ path: '/board.kicad_pcb', url: '/board' }] },
      { files: [{ path: 'board%2fkicad_pcb', url: '/board' }] },
      { files: [{ path: 'report.html', url: '/report.html' }] },
      { files: [{ path: 'board.kicad_pcb', url: 'javascript:alert(1)' }] },
      { files: [{ path: 'board.kicad_pcb', url: '/board' }, { path: 'board.kicad_pcb', url: '/other' }] },
      { files: [{ path: 'board.kicad_pcb', url: '/board' }], entry: 'missing.kicad_sch' }]) {
      await assert.rejects(resolveSource(manifest, { baseURL: 'https://site.example/' }), TypeError);
    }
  });
});

test('GitHub repository links resolve the default branch and pin every listed file to one immutable revision', async () => {
  const requests = [];
  await withFetch(async (url, options) => {
    requests.push(url.href);
    assert.equal(options.credentials, 'omit');
    if (url.href === api) return json({ default_branch: 'main' });
    if (url.href === `${api}/commits/main`) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    if (url.href === `${api}/git/trees/${treeRevision}?recursive=1`) return json({ truncated: false, tree: [
      blob('board/board.kicad_sch'), blob('board/board.kicad_pcb'), blob('board/part.wrl'),
      { path: 'board/link.kicad_pcb', type: 'blob', mode: '120000' }, blob('README.md'),
    ] });
    assert.equal(url.href, raw + 'board/board.kicad_pcb');
    return new Response(source);
  }, async () => {
    const result = await resolveSource('https://github.com/owner/board');
    assert.equal(result.project.revision, revision);
    assert.equal(result.project.repository, 'owner/board');
    assert.equal(result.project.files.length, 3);
    assert.ok(result.project.files.every(item => item.url.startsWith(raw)));
    assert.equal(requests.length, 4);
  });
});

test('GitHub blob links load source from a pinned commit without enumerating a tree', async () => {
  const requests = [];
  await withFetch(async url => {
    requests.push(url.href);
    if (url.href === `${api}/commits/main`) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    assert.equal(url.href, raw + 'nested/board.kicad_pcb');
    return new Response(source);
  }, async () => {
    const result = await resolveSource('https://github.com/owner/board/blob/main/nested/board.kicad_pcb');
    assert.deepEqual(result, { source, path: 'nested/board.kicad_pcb', project: null });
    assert.equal(requests.length, 2);
  });
});

test('GitHub tree scope and slash-containing refs use the explicit ref', async () => {
  await withFetch(async url => {
    if (url.href === `${api}/commits/feature%2Fviewer`) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    if (url.pathname.includes('/git/trees/')) return json({ truncated: false, tree: [blob('board/board.kicad_pcb'), blob('other/other.kicad_pcb')] });
    assert.equal(url.href, raw + 'board/board.kicad_pcb');
    return new Response(source);
  }, async () => {
    const result = await resolveSource('https://github.com/owner/board/tree/feature/viewer/board', { ref: 'feature/viewer' });
    assert.equal(result.project.files.length, 1);
    assert.equal(result.path, 'board/board.kicad_pcb');
    await assert.rejects(resolveSource('https://github.com/owner/board/tree/main/board', { ref: 'wrong' }), /must match/);
  });
});

test('GitHub-hosted manifests normalize relative file URLs at the pinned revision', async () => {
  await withFetch(async url => {
    if (url.pathname.includes('/commits/')) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    if (url.pathname.endsWith('/project.json')) return json({ files: [{ path: 'board.kicad_pcb', url: 'board.kicad_pcb' }] });
    assert.equal(url.href, raw + 'hardware/board.kicad_pcb');
    return new Response(source);
  }, async () => {
    const result = await resolveSource('https://github.com/owner/board/blob/main/hardware/project.json');
    assert.equal(result.path, 'board.kicad_pcb');
    assert.equal(result.project.files[0].url, raw + 'hardware/board.kicad_pcb');
  });
});

test('GitHub KiCad project document chooses its matching drawing within its directory', async () => {
  await withFetch(async url => {
    if (url.pathname.includes('/commits/')) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    if (url.pathname.includes('/git/trees/')) return json({ truncated: false, tree: [
      blob('hardware/example.kicad_pro'), blob('hardware/aaa.kicad_pcb'), blob('hardware/example.kicad_pcb'), blob('elsewhere/a.kicad_pcb'),
    ] });
    assert.equal(url.href, raw + 'hardware/example.kicad_pcb');
    return new Response(source);
  }, async () => {
    const result = await resolveSource('https://github.com/owner/board/blob/main/hardware/example.kicad_pro');
    assert.equal(result.path, 'hardware/example.kicad_pcb');
    assert.equal(result.project.files.length, 2);
  });
});

test('truncated or invalid GitHub responses are rejected rather than showing incomplete projects', async () => {
  await withFetch(async url => {
    if (url.pathname.includes('/commits/')) return json({ sha: revision, commit: { tree: { sha: treeRevision } } });
    return json({ truncated: true, tree: [blob('board.kicad_pcb')] });
  }, async () => await assert.rejects(resolveSource('https://github.com/owner/board/tree/main'), /truncated/));
  await withFetch(async () => json({ sha: 'main', commit: { tree: { sha: treeRevision } } }),
    async () => await assert.rejects(resolveSource('https://github.com/owner/board/tree/main'), /immutable/));
});

test('GitLab blob links normalize to raw links while other hosted URLs remain unchanged', async () => {
  await withFetch(async url => {
    assert.equal(url.href, 'https://gitlab.com/group/project/-/raw/main/board.kicad_pcb');
    return new Response(source);
  }, async () => assert.equal((await resolveSource('https://gitlab.com/group/project/-/blob/main/board.kicad_pcb')).path, 'board.kicad_pcb'));
});

test('HTTP/CORS errors, bad JSON and hosted project-only files give actionable failures', async () => {
  await withFetch(async () => new Response('', { status: 403 }),
    async () => await assert.rejects(resolveSource('https://site.example/board.kicad_pcb'), /403/));
  await withFetch(async () => { throw new TypeError('Failed to fetch'); },
    async () => await assert.rejects(resolveSource('https://site.example/board.kicad_pcb'), /Failed to fetch/));
  await withFetch(async () => new Response('not json'),
    async () => await assert.rejects(resolveSource('https://site.example/project.json'), /valid project manifest/));
  await withFetch(async () => { throw new Error('Unexpected network request'); },
    async () => await assert.rejects(resolveSource('https://site.example/project.kicad_pro'), /manifest/));
});

test('download limits apply to streamed bytes as well as Content-Length', async () => {
  await withFetch(async () => new Response(source, { headers: { 'content-length': String(65 * 1024 * 1024) } }),
    async () => await assert.rejects(fetchText('https://site.example/board.kicad_pcb'), /64 MiB/));
  let cancelled = false;
  await withFetch(async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
    read: async () => ({ done: false, value: { byteLength: 65 * 1024 * 1024 } }),
    cancel: async () => { cancelled = true; },
  }) } }), async () => {
    await assert.rejects(fetchText('https://site.example/board.kicad_pcb'), /64 MiB/);
    assert.equal(cancelled, true);
  });
});

test('aborted requests do not fetch; credential mode is explicit and bounded', async () => {
  await withFetch(async (url, options) => {
    assert.equal(options.credentials, 'same-origin');
    return new Response(source);
  }, async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(fetchText('https://site.example/board', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(await fetchText('https://site.example/board', { credentials: 'same-origin' }), source);
    await assert.rejects(fetchText('https://site.example/board', { credentials: 'include' }), /Credentials/);
  });
  for (const input of ['', undefined, 'file:///board.kicad_pcb', 'javascript:alert(1)', 'https://user:secret@site.example/board'])
    assert.throws(() => httpURL(input, 'https://site.example/'));
});

test('model assets preserve non-UTF8 binary bytes exactly across streamed chunks', async () => {
  const bytes = Uint8Array.from({ length: 90000 }, (_, index) => index % 256);
  await withFetch(async (url, options) => {
    assert.equal(url.href, 'https://site.example/model.glb');
    assert.equal(options.credentials, 'omit');
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.subarray(0, 40001));
      controller.enqueue(bytes.subarray(40001));
      controller.close();
    } }));
  }, async () => {
    const asset = await fetchAsset('https://site.example/model.glb');
    assert.deepEqual(Uint8Array.from(atob(asset.base64), char => char.charCodeAt(0)), bytes);
    assert.deepEqual(Object.keys(asset), ['base64']);
  });
});

test('model assets enforce the 8 MiB cap before allocation for headers and streamed bytes', async () => {
  await withFetch(async () => new Response(new Uint8Array([255]), {
    headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
  }), async () => await assert.rejects(fetchAsset('https://site.example/model.glb'), /8388608 byte/));
  let cancelled = false;
  await withFetch(async () => ({ ok: true, headers: new Headers(), body: { getReader: () => ({
    read: async () => ({ done: false, value: { byteLength: 8 * 1024 * 1024 + 1 } }),
    cancel: async () => { cancelled = true; },
  }) } }), async () => {
    await assert.rejects(fetchAsset('https://site.example/model.glb'), /8388608 byte/);
    assert.equal(cancelled, true);
  });
});

test('model request cancellation cancels the body even when it arrives after the abort', async () => {
  const controller = new AbortController();
  let cancelled = false;
  await withFetch(async () => {
    controller.abort();
    return { ok: true, body: { cancel: async () => { cancelled = true; } } };
  }, async () => {
    await assert.rejects(fetchAsset('https://site.example/model.glb', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(cancelled, true);
  });
});

test('HTTP errors cancel the response body without a cleanup failure masking the status', async () => {
  let cancelled = false;
  await withFetch(async () => ({ ok: false, status: 403, body: { cancel: async () => {
    cancelled = true; throw new Error('cleanup failed');
  } } }), async () => {
    await assert.rejects(fetchAsset('https://site.example/model.glb'), /403/);
    assert.equal(cancelled, true);
  });
});
