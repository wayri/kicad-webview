/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Loopback development preview for the standalone viewer and manufacturing demo.
const http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const fixture = pathname.startsWith('/fixtures/');
    const base = fixture ? path.join(root, 'fixtures/sensor') : output;
    const relative = fixture ? pathname.slice('/fixtures/'.length) : pathname.slice(1) || 'index.html';
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep) || !(/\.(html|mjs|js|json|css|md|zip|gtl|gbl|gto|gm1|gbr|drl|kicad_pcb|kicad_sch)$/i.test(file)||/^(LICENSE|THREE-LICENSE|FZSTD-LICENSE)$/.test(path.basename(file)))) {
      response.writeHead(404).end(); return;
    }
    response.setHeader('Content-Type', /\.(js|mjs)$/.test(file) ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : file.endsWith('.zip') ? 'application/zip' : file.endsWith('.css') ? 'text/css' : 'text/plain');
    response.end(await fs.readFile(file));
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}`));
