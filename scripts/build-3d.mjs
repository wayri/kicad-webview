/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {distributionNotice} from './license-notice.mjs';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const deps = process.env.KICAD_WEB_BUILD_DEPS ? path.resolve(process.env.KICAD_WEB_BUILD_DEPS) : path.join(root, 'node_modules');
const esbuild = require(path.join(deps, 'esbuild'));
if (esbuild.version !== '0.25.12') throw new Error('Use pinned esbuild 0.25.12.');
if (JSON.parse(readFileSync(path.join(deps, 'three/package.json'), 'utf8')).version !== '0.171.0')
  throw new Error('Use pinned Three.js 0.171.0.');
const owners = ['boardParser.ts', 'numericRange.ts', 'layerPalette.ts', 'trackGeometry.ts', 'viewportScenePolicy.ts'];
const source = path.join(root, 'engine/spike-source');
const alias = Object.fromEntries(owners.map(name => ['@spike/' + name.replace('.ts', ''), path.join(source, name)]));
await esbuild.build({
  entryPoints: [path.join(root, 'engine/spike/board3d.js')],
  outfile: path.join(root, 'engine/vendor/spike-board3d.bundle.js'),
  bundle: true, platform: 'browser', format: 'iife', globalName: 'SpikeBoard3D',
  banner: {js:distributionNotice(root)}, target: ['chrome116', 'edge116'], minify: true, legalComments: 'none', nodePaths: [deps], alias,
});
const hashes = owners.map(name => `${name}: ${createHash('sha256').update(readFileSync(path.join(source, name))).digest('hex')}`);
writeFileSync(path.join(root, 'engine/vendor/SPIKE-ENGINE-NOTICE.md'),
  '# SPIKE browser geometry bundle\n\n' +
  'Built from the owner-provided subset in engine/spike-source and adapters in engine/spike. This supplied owner-authored subset is MPL-2.0; see LICENSE and LICENSING.md. Other SPIKE software is not relicensed. Matching source: https://github.com/wayri/kicad-webview/tree/v'+JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version+' . Original extraction provenance and valid earlier grants remain intact.\n\n' +
  hashes.join('\n') + '\n\nIncludes Three.js 0.171.0 (MIT; THREE-LICENSE) and fzstd 0.1.1 (MIT; fzstd/LICENSE). Original extraction provenance is retained in SOURCE-PROVENANCE.json.\n');
console.log('Rebuilt the owned 3D bundle from repository-local sources.');
