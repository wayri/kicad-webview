/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Optional 3D and analysis modules stay behind KiCadViewer's async feature APIs.
export { KiCadViewer, KiCadViewer as Viewer, registerKiCadViewer } from './kicad-viewer.mjs';
export { parseManufacturing } from './manufacturing/index.mjs';
export { readZip } from './archive/zip.mjs';

export { EMBED_API_VERSION } from './api-version.mjs';

export { ViewerCarousel } from './carousel.mjs';

export {linkViewers} from './linked-viewers.mjs';
export {captureViewState,restoreViewState,createViewLink,parseViewLink,validateViewState} from './view-state.mjs';

export {DemoController} from './demo-controller.mjs';

export {ProjectTree,buildProjectHierarchy,loadProjectHierarchy,hierarchyToSVG} from './project-tree.mjs';
