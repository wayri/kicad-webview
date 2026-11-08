/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// One owner per mount container, including when different format adapters coexist.
export const viewerOwners = new WeakMap();
