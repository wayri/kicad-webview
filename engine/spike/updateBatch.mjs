/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Coalesce work until the caller flushes it, without owning a scheduler. */
export function createUpdateBatch(flush, invalidate) {
  let pending = false, disposed = false, requestCount = 0, flushCount = 0;
  return {
    request() {
      if (disposed) return;
      requestCount++;
      if (!pending) {
        pending = true;
        try { invalidate(); } catch (error) { pending = false; throw error; }
      }
    },
    flush() {
      if (disposed || !pending) return;
      pending = false;
      flushCount++;
      flush();
    },
    dispose() { disposed = true; pending = false; },
    stats() { return { requestCount, flushCount, pending }; },
  };
}
