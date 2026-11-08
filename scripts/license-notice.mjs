import {readFileSync} from 'node:fs';
import path from 'node:path';
export function distributionNotice(root){const {version}=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));return '/*! KiCad WebView '+version+' | Copyright (c) 2026 wayri | SPDX-License-Identifier: MPL-2.0 | Source: https://github.com/wayri/kicad-webview/tree/v'+version+' | Keep LICENSE and THIRD-PARTY-NOTICES.md; bundled dependencies retain their licenses. */';}
