/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const tool = path.join(root, '.cache/forge-runtime/tool/node_modules/@forge/cli');
const args = process.argv.slice(2);
if (!args.length) throw new Error('Supply a Forge command, for example login, whoami or lint.');
if (args[0] === 'login' && args.length !== 1) throw new Error('Use prompt-only login without credential flags.');
if (JSON.parse(await readFile(path.join(tool, 'package.json'), 'utf8')).version !== '14.2.0')
  throw new Error('This task wrapper expects local Forge CLI 14.2.0.');
const state = path.join(root, '.cache/forge-runtime/state');
for (const directory of [path.join(state, 'roaming'), path.join(state, 'local'), path.join(root, '.cache/forge-temp')])
  await mkdir(directory, { recursive: true });
const env = { ...process.env,
  APPDATA: path.join(state, 'roaming'), LOCALAPPDATA: path.join(state, 'local'),
  TEMP: path.join(root, '.cache/forge-temp'), TMP: path.join(root, '.cache/forge-temp'),
  npm_config_cache: path.join(root, '.cache/forge-runtime'),
  npm_config_logs_dir: path.join(root, '.cache/forge-runtime/logs'),
  FORGE_DISABLE_ANALYTICS: '1', FORGE_DISABLE_SEASONAL_EFFECTS: '1',
};
if (args[0] === 'login') {
  // User enters credentials in the CLI prompts; never put tokens in command
  // arguments, source files, shell history or child environment variables.
  delete env.FORGE_EMAIL; delete env.FORGE_API_TOKEN; delete env.CI;
}
const result = spawnSync(process.execPath, [path.join(tool, 'out/bin/cli.js'), ...args], { cwd: here, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
