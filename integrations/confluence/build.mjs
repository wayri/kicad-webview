/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const esbuild = process.env.KICAD_WEB_BUILD_DEPS ? require(path.join(process.env.KICAD_WEB_BUILD_DEPS, 'esbuild')) : require('esbuild');
if (esbuild.version !== '0.25.12') throw new Error('Use pinned esbuild 0.25.12.');
const bridgePackage = JSON.parse(await readFile(path.resolve(path.dirname(require.resolve('@forge/bridge')), '../package.json'), 'utf8'));
if (bridgePackage.version !== '7.2.1') throw new Error('Use pinned Forge bridge 7.2.1.');
const output = path.join(here, 'static');
await mkdir(output, { recursive: true });
const result = await esbuild.build({ entryPoints: [path.join(here, 'src/app.mjs')], outfile: path.join(output, 'app.js'),
  bundle: true, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'eof', metafile: true });
if (Object.values(result.metafile.outputs).some(item => item.imports.length))
  throw new Error('Forge controller unexpectedly requires external JavaScript imports.');

// Retain actual license/notice files for every package contributing code to app.js.
const packageDirs = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = path.resolve(input), normalized = absolute.replaceAll('\\', '/'), marker = '/node_modules/';
  const offset = normalized.lastIndexOf(marker);
  if (offset < 0) continue;
  const tail = normalized.slice(offset + marker.length).split('/');
  const count = tail[0].startsWith('@') ? 2 : 1;
  packageDirs.add(normalized.slice(0, offset + marker.length) + tail.slice(0, count).join('/'));
}
const notices = [];
for (const directory of [...packageDirs].sort()) {
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const names = (await readdir(directory)).filter(name => /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i.test(name));
  let licenseDirectory = directory;
  if (!names.length && pkg.name === 'iframe-resizer' && pkg.version === '4.4.5' && pkg.license === 'MIT') {
    // Reviewed upstream packaging omission; provenance distinguishes supplemental text.
    licenseDirectory = path.join(here, 'licenses/iframe-resizer-4.4.5');
    names.push(...await readdir(licenseDirectory));
  }
  if (!names.length) throw new Error('Missing dependency license/notice file for ' + pkg.name + '; review before distributing.');
  const relative = 'licenses/dependencies/' + pkg.name.replaceAll('@', '').replaceAll('/', '__') + '-' + pkg.version;
  await mkdir(path.join(output, relative), { recursive: true });
  const files = [];
  for (const name of names) {
    const bytes = await readFile(path.join(licenseDirectory, name));
    await writeFile(path.join(output, relative, name), bytes);
    files.push({ path: relative + '/' + name, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  notices.push({ name: pkg.name, version: pkg.version, license: pkg.license || null, files });
}
await mkdir(path.join(output, 'licenses'), { recursive: true });
await writeFile(path.join(output, 'licenses/DEPENDENCIES.json'), JSON.stringify(notices, null, 2) + '\n');
await writeFile(path.join(output, 'FORGE-DEPENDENCY-NOTICES.md'), '# Forge controller dependency notices\n\n' +
  'These dependencies retain their original licenses and terms; the viewer MPL-2.0 license does not replace them. Atlassian packages may be subject to Atlassian Developer Terms. See each retained license/notice file and licenses/DEPENDENCIES.json.\n\n' +
  notices.map(item => '- ' + item.name + '@' + item.version + ': ' + (typeof item.license === 'string' ? item.license : JSON.stringify(item.license)) + '; ' +
    item.files.map(file => '[' + path.basename(file.path) + '](' + file.path + ')').join(', ')).join('\n') + '\n');
for (const name of ['index.html', 'style.css']) await copyFile(path.join(here, 'src', name), path.join(output, name));
const library = await readFile(path.join(root, 'dist/kicad-webview.min.js'));
await writeFile(path.join(output, 'kicad-webview.min.js'), library);
for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'THREE-LICENSE', 'FZSTD-LICENSE', 'SPIKE-ENGINE-NOTICE.md'])
  await copyFile(path.join(root, 'dist', name), path.join(output, name));
await copyFile(path.join(root, 'licenses/Pocket-KiView-Source-Available-1.0.txt'), path.join(output, 'licenses/Pocket-KiView-Source-Available-1.0.txt'));
const manifest = { package: '@wayrisignals/kicad-webview',
  version: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
  sha256: createHash('sha256').update(library).digest('hex'),
  controllerSha256: createHash('sha256').update(await readFile(path.join(output, 'app.js'))).digest('hex'),
  bridge: bridgePackage.version, dependencyPackages: notices.length, externalJavaScriptImports: 0 };
await writeFile(path.join(output, 'VIEWER-BUILD.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared Forge resources: exact viewer bundle, ' + notices.length + ' dependency notices, no external JS imports.');
