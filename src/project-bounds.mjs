/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* The saved-source parser owns modern KiCad drawing and project byte bounds. */
import '../engine/design-diff.js';
const policy = globalThis.KiCadDesignDiff;
export const MAX_SOURCE_BYTES = policy.MAX_FILE_BYTES;
export const MAX_PROJECT_BYTES = policy.MAX_PROJECT_BYTES;
export const MAX_RENDER_PRIMITIVES = policy.MAX_RENDER_PRIMITIVES;
