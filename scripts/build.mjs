/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {distributionNotice} from './license-notice.mjs';
import { buildAnalysisDemo } from './build-analysis-demo.mjs';
import { buildDemoArchive } from './build-demo-archive.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = process.env.KICAD_WEB_BUILD_DEPS
  ? require(path.join(path.resolve(process.env.KICAD_WEB_BUILD_DEPS), 'esbuild')) : require('esbuild');
if (esbuild.version !== '0.25.12') throw new Error('Use pinned esbuild 0.25.12.');
const output = path.join(root, 'dist');
mkdirSync(output, { recursive: true });
const options = {
  entryPoints: [path.join(root, 'src/index.mjs')], outfile: path.join(output, 'kivi-viewer.js'),
  bundle: true, splitting: false, platform: 'browser', format: 'esm', target: ['es2022'],
  minify: true, legalComments: 'eof', sourcemap: false, metafile: true,
  banner: { js: distributionNotice(root) },
  plugins: [{ name: 'inline-owned-3d-engine', setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]three-runtime\.mjs$/ }, () => ({
      contents: readFileSync(path.join(root, 'engine/vendor/spike-board3d.bundle.js'), 'utf8') +
        '\nexport function loadThree(){return Promise.resolve(SpikeBoard3D);}\n', loader: 'js',
    }));
  } }],
};
await esbuild.build({entryPoints:[path.join(root,'src/standalone-html.mjs')],outfile:path.join(output,'standalone-html.mjs'),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,banner:{js:distributionNotice(root)}});
await esbuild.build({...options,entryPoints:[path.join(root,'src/index-results.mjs')],outfile:path.join(output,'wayricad-results.js')});
await esbuild.build({...options,entryPoints:[path.join(root,'src/index-bom.mjs')],outfile:path.join(output,'bom-viewer.js')});
const result = await esbuild.build(options);
const classic = await esbuild.build({ ...options, entryPoints: [path.join(root, 'src/browser-global.mjs')], outfile: path.join(output, 'kicad-webview.min.js'), format: 'iife', globalName: 'KiCadWebView' });
if (Object.values(classic.metafile.outputs).some(item => item.imports.length)) throw new Error('Classic distribution has external imports.');
if (Object.values(result.metafile.outputs).some(item => item.imports.length))
  throw new Error('Distribution unexpectedly requires external JavaScript imports.');
for (const name of ['embed.html', 'embed.mjs', 'example.html', 'example.mjs', 'altium-example.html', 'altium-example.mjs', 'direct.html', 'manufacturing.html', 'cdn.html', 'analysis.html', 'analysis.mjs', 'advanced.html', 'advanced.mjs', 'lite.html', 'lite-example.mjs', 'carousel.html', 'carousel.mjs', 'linked.html', 'linked.mjs', 'interactive.html', 'interactive.mjs', 'tft-graphics.mjs', 'hierarchy.html', 'hierarchy-example.mjs', 'presentation.html', 'presentation.mjs']) {
  writeFileSync(path.join(output, name), readFileSync(path.join(root, 'examples', name), 'utf8')
    .replaceAll("'../src/kicad-viewer.mjs'", "'./kivi-viewer.js'")
    .replaceAll("'../src/index.mjs'", "'./kivi-viewer.js'")
    .replaceAll("'../src/project-viewer.mjs'", "'./kivi-viewer.js'")
    .replaceAll("'../src/index-lite.mjs'", "'./lite/kicad-webview-lite.js'")
    .replaceAll("'../src/altium-viewer.mjs'", "'./kivi-viewer.js'")
    .replaceAll('../fixtures/sensor/sensor.kicad_pcb', './demo/project.json')
    .replaceAll('__BETA_VERSION__', JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version)
    .replaceAll('__VIEWER_INTEGRITY__', 'sha384-'+createHash('sha384').update(readFileSync(path.join(output,'kicad-webview.min.js'))).digest('base64')));
}
buildAnalysisDemo(root,path.join(output,'analysis'));
copyFileSync(path.join(output, 'example.html'), path.join(output, 'index.html'));
writeFileSync(path.join(output, '.nojekyll'), '');
mkdirSync(path.join(output, 'demo'), { recursive: true });
const demoFiles = ['3PD+IB.kicad_pcb', '3PD+IB.kicad_sch', 'DCL_Sens.kicad_sch', 'HBD21094.kicad_sch', 'HBD21094B.kicad_sch', 'HBD21094C.kicad_sch', 'T_sens.kicad_sch', 'outputFilter.kicad_sch', 'project.json', 'PROVENANCE.json', 'README.md'];
for (const name of demoFiles) copyFileSync(path.join(root, 'fixtures/inverter', name), path.join(output, 'demo', name));
mkdirSync(path.join(output,'manufacturing'),{recursive:true});
for(const name of ['3PD+IB-F_Cu.gtl','3PD+IB-B_Cu.gbl','3PD+IB-F_Silkscreen.gto','3PD+IB-Edge_Cuts.gm1','3PD+IB-PTH.drl','3PD+IB-NPTH.drl','project.json','PROVENANCE.json'])copyFileSync(path.join(root,'fixtures/inverter-cam',name),path.join(output,'manufacturing',name));
buildDemoArchive(root,path.join(output,'manufacturing/inverter-fabrication.zip'));
for (const [source, target] of [
  ['docs/BOM-ANALYTICS.md','BOM-ANALYTICS.md'],
  ['docs/UPSTREAM-SYNC.md','UPSTREAM-SYNC.md'],
  ['docs/PRESENTATION.md','PRESENTATION.md'],
  ['docs/WAYRICAD-RESULTS.md','WAYRICAD-RESULTS.md'],
  ['docs/MOBILE-PERFORMANCE.md','MOBILE-PERFORMANCE.md'],
  ['docs/INSPECTION-CONTROLS.md','INSPECTION-CONTROLS.md'],
  ['docs/PROJECT-TREE.md','PROJECT-TREE.md'],
  ['docs/VIEW-NAVIGATION.md','VIEW-NAVIGATION.md'],
  ['CONTRIBUTING.md','CONTRIBUTING.md'], ['SECURITY.md','SECURITY.md'], ['TRADEMARKS.md','TRADEMARKS.md'], ['README.md', 'README.md'], ['LICENSE', 'LICENSE'], ['LICENSING.md', 'LICENSING.md'],
  ['THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.md'],
  ['docs/INTERACTIVE-DEMO.md','INTERACTIVE-DEMO.md'], ['docs/LINKED-VIEWS.md','LINKED-VIEWS.md'], ['docs/VIEW-LINKS.md','VIEW-LINKS.md'], ['docs/CAROUSEL.md','CAROUSEL.md'], ['docs/PUBLIC-API.md','PUBLIC-API.md'], ['docs/LIGHTWEIGHT.md','LIGHTWEIGHT.md'], ['docs/ADVANCED-VIEWER.md','ADVANCED-VIEWER.md'], ['docs/NET-MODEL-PROVENANCE.md','NET-MODEL-PROVENANCE.md'], ['docs/ANALYSIS.md','ANALYSIS.md'], ['docs/HOSTING.md', 'HOSTING.md'], ['docs/MANUFACTURING-BETA.md','MANUFACTURING-BETA.md'], ['docs/APP-INTEGRATIONS-BETA.md','APP-INTEGRATIONS-BETA.md'], ['docs/RELEASING.md', 'RELEASING.md'], ['docs/BROWSER-CHECKS.md', 'BROWSER-CHECKS.md'], ['docs/ALTIUM-BETA.md', 'ALTIUM-BETA.md'],
  ['docs/KICAD-COMPATIBILITY.md', 'KICAD-COMPATIBILITY.md'],
  ['engine/vendor/THREE-LICENSE', 'THREE-LICENSE'],
  ['engine/vendor/fzstd/LICENSE', 'FZSTD-LICENSE'],
  ['engine/vendor/SPIKE-ENGINE-NOTICE.md', 'SPIKE-ENGINE-NOTICE.md'],
]) {
  if (target.endsWith('.md')) {
    const text = readFileSync(path.join(root, source), 'utf8')
      .replaceAll('(../LICENSE)', '(LICENSE)')
      .replaceAll('(../README.md)', '(README.md)')
      .replaceAll('(../examples/altium-example.html)', '(altium-example.html)')
      .replaceAll('](docs/', '](')
      .replaceAll('./dist/kivi-viewer.js', './kivi-viewer.js')
      .replaceAll('dist/embed.html?', 'embed.html?')
      .replaceAll('engine/vendor/THREE-LICENSE', 'THREE-LICENSE')
      .replaceAll('engine/vendor/fzstd/LICENSE', 'FZSTD-LICENSE')
      .replaceAll('engine/vendor/SPIKE-ENGINE-NOTICE.md', 'SPIKE-ENGINE-NOTICE.md');
    writeFileSync(path.join(output, target), text);
  } else copyFileSync(path.join(root, source), path.join(output, target));
}
copyFileSync(path.join(root, 'SOURCE-PROVENANCE.json'), path.join(output, 'SOURCE-PROVENANCE.json'));
mkdirSync(path.join(output, 'licenses'), { recursive: true });
copyFileSync(path.join(root, 'licenses/Pocket-KiView-Source-Available-1.0.txt'), path.join(output, 'licenses/Pocket-KiView-Source-Available-1.0.txt'));
console.log(`Built dist/kivi-viewer.js (${statSync(path.join(output, 'kivi-viewer.js')).size} bytes); no external JS imports.`);

await import('./build-lite.mjs');
