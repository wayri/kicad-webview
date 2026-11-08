/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { validate } = require('@forge/manifest');
const manifestPath = process.env.FORGE_MANIFEST || path.join(here, 'manifest.yml');
const result = await validate(false, manifestPath);
console.log(JSON.stringify({ success: result.success, errors: result.errors || [] }, null, 2));
if (!result.success) process.exitCode = 1;
