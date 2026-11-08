/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export * from './index.mjs';
export { KiCadViewer as Viewer } from './kicad-viewer.mjs';
import { registerKiCadViewer } from './kicad-viewer.mjs';
registerKiCadViewer();
