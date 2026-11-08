/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { buildEmbedURL } from './embed-url.mjs';
const [viewerPage, source, theme = 'light'] = process.argv.slice(2);
try { console.log(buildEmbedURL(viewerPage, source, { theme })); }
catch (error) { console.error(error.message); process.exitCode = 1; }
