/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareCatalog } from './adapter.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (!process.env.VIEWER_CATALOG) throw new Error('Set VIEWER_CATALOG to your reviewed public catalog.');
const catalog = prepareCatalog(JSON.parse(await readFile(process.env.VIEWER_CATALOG, 'utf8')));
const output = path.join(root, '.cache/integrations/slack-pages');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
await mkdir(output, { recursive: true });
const pages = [];
for (const item of catalog.byID.values()) {
  // File paths are fixed from validated IDs, never from arbitrary URL paths.
  const target = item.id + '.html';
  await writeFile(path.join(output, target), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(item.title) +
    '</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}a{position:absolute;right:12px;bottom:12px;background:#fff;padding:8px;font:13px system-ui;color:#123}</style><iframe title="' + escape(item.title) +
    '" src="' + escape(item.previewURL) + '" referrerpolicy="no-referrer"></iframe><a href="' + escape(item.previewURL) + '">Open viewer</a></html>');
  pages.push({ file: target, deployAt: item.url });
}
await writeFile(path.join(output, 'deploy-map.json'), JSON.stringify(pages, null, 2) + '\n');
console.log('Prepared ' + pages.length + ' public landing pages in ' + output + '. Deploy using deploy-map.json; no upload performed.');
