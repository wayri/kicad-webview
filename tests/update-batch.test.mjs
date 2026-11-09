/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateBatch } from '../engine/spike/updateBatch.mjs';

test('coalesces requests and ignores empty flushes', () => {
  let calls = 0, invalidations = 0;
  const batch = createUpdateBatch(() => calls++, () => invalidations++);
  for (let i = 0; i < 100; i++) batch.request();
  assert.deepEqual(batch.stats(), { requestCount: 100, flushCount: 0, pending: true });
  assert.equal(invalidations, 1);
  batch.flush(); batch.flush();
  assert.equal(calls, 1);
  const snapshot = batch.stats(); snapshot.pending = true;
  assert.deepEqual(batch.stats(), { requestCount: 100, flushCount: 1, pending: false });
});

test('retains a request made during flush', () => {
  let calls = 0, invalidations = 0;
  const batch = createUpdateBatch(() => { if (++calls === 1) batch.request(); }, () => invalidations++);
  batch.request(); batch.flush();
  assert.equal(batch.stats().pending, true);
  assert.equal(invalidations, 2);
  batch.flush();
  assert.deepEqual(batch.stats(), { requestCount: 2, flushCount: 2, pending: false });
});

test('recovers after a callback throws', () => {
  let calls = 0;
  const batch = createUpdateBatch(() => { if (++calls === 1) throw Error('failure'); }, () => {});
  batch.request(); assert.throws(() => batch.flush(), /failure/);
  assert.equal(batch.stats().pending, false);
  batch.request(); batch.flush();
  assert.deepEqual(batch.stats(), { requestCount: 2, flushCount: 2, pending: false });
});

test('dispose cancels pending work and rejects future requests', () => {
  let calls = 0, invalidations = 0;
  const batch = createUpdateBatch(() => calls++, () => invalidations++);
  batch.request(); batch.dispose(); batch.flush(); batch.request(); batch.dispose();
  assert.equal(calls, 0); assert.equal(invalidations, 1);
  assert.deepEqual(batch.stats(), { requestCount: 1, flushCount: 0, pending: false });
});

test('a failed invalidation can be retried', () => {
  let calls = 0, invalidations = 0;
  const batch = createUpdateBatch(() => calls++, () => { if (++invalidations === 1) throw Error('failure'); });
  assert.throws(() => batch.request(), /failure/);
  assert.equal(batch.stats().pending, false);
  batch.request(); batch.flush();
  assert.equal(calls, 1); assert.equal(invalidations, 2);
});
