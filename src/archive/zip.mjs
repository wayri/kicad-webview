/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Bounded, browser-only ZIP container reader. No extraction to a filesystem.
 * Format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * Inflation: https://compression.spec.whatwg.org/#deflate-raw
 */
const MiB = 1024 * 1024;
const DEFAULTS = Object.freeze({ maxCompressedBytes: 64 * MiB, maxExpandedBytes: 128 * MiB,
  maxFileBytes: 32 * MiB, maxFiles: 256, maxRatio: 1000 });
const decoder = new TextDecoder('utf-8', { fatal: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

/** ZIP's standard IEEE CRC-32, also useful for deterministic container fixtures. */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function limits(options) {
  const result = {};
  for (const [name, cap] of Object.entries(DEFAULTS)) {
    const value = options[name] ?? cap;
    if (!Number.isSafeInteger(value) || value < 1 || value > cap)
      throw new TypeError(`ZIP ${name} must be an integer between 1 and ${cap}.`);
    result[name] = value;
  }
  return result;
}

function nameOf(bytes, flags) {
  if (!(flags & 0x800) && bytes.some(byte => byte > 127))
    throw new Error('ZIP non-UTF-8 filenames are unsupported; use UTF-8 or ASCII filenames.');
  let name;
  try { name = decoder.decode(bytes); } catch { throw new Error('ZIP filename is not valid UTF-8.'); }
  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  if (!path || path.length > 1000 || /[\\\x00-\x1f\x7f%?#:]/.test(path) || path.startsWith('/') ||
      path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw new Error('ZIP entry has an unsafe relative path.');
  return name;
}

function extras(view, start, length) {
  const end = start + length;
  while (start < end) {
    if (start + 4 > end) throw new Error('ZIP extra field is truncated.');
    const type = view.getUint16(start, true), size = view.getUint16(start + 2, true);
    start += 4;
    if (start + size > end) throw new Error('ZIP extra field is truncated.');
    if (type === 1) throw new Error('ZIP64 archives are unsupported.');
    if (type === 0x7075 || type === 0x6375)
      throw new Error('ZIP alternate Unicode filename metadata is unsupported; use UTF-8 names.');
    start += size;
  }
}

function parseDirectory(bytes, caps) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const range = (start, length) => Number.isSafeInteger(start) && start >= 0 && length >= 0 && start <= bytes.length - length;
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) {
      end = at; break;
    }
  }
  if (end < 0) throw new Error('ZIP end directory is missing or truncated.');
  const disk = view.getUint16(end + 4, true), centralDisk = view.getUint16(end + 6, true);
  const diskCount = view.getUint16(end + 8, true), count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true), centralStart = view.getUint32(end + 16, true);
  if (count === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff)
    throw new Error('ZIP64 archives are unsupported.');
  if (disk || centralDisk || diskCount !== count) throw new Error('Multi-disk ZIP archives are unsupported.');
  if (!count || count > caps.maxFiles) throw new Error(`ZIP must contain between 1 and ${caps.maxFiles} entries.`);
  if (!range(centralStart, centralSize) || centralStart + centralSize !== end)
    throw new Error('ZIP central directory range is inconsistent.');
  const entries = [], names = new Set();
  let cursor = centralStart, expanded = 0;
  for (let index = 0; index < count; index++) {
    if (!range(cursor, 46) || cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('ZIP central directory entry is truncated.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true), nameSize = view.getUint16(cursor + 28, true);
    const extraSize = view.getUint16(cursor + 30, true), commentSize = view.getUint16(cursor + 32, true);
    const fileDisk = view.getUint16(cursor + 34, true), external = view.getUint32(cursor + 38, true);
    const offset = view.getUint32(cursor + 42, true), entrySize = 46 + nameSize + extraSize + commentSize;
    if (!range(cursor, entrySize) || cursor + entrySize > end) throw new Error('ZIP central entry range is inconsistent.');
    if ([compressed, size, offset].includes(0xffffffff)) throw new Error('ZIP64 archives are unsupported.');
    if (fileDisk) throw new Error('Multi-disk ZIP archives are unsupported.');
    if (flags & ~0x80e || flags & 1) throw new Error('Encrypted or unsupported ZIP flags.');
    if (![0, 8].includes(method)) throw new Error('ZIP supports only stored and deflate compression.');
    if (method === 0 && (flags & 6 || compressed !== size)) throw new Error('Stored ZIP sizes or flags are inconsistent.');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameSize), path = nameOf(nameBytes, flags);
    const key = path.replace(/\/$/, '').normalize('NFC').toLowerCase();
    if (names.has(key)) throw new Error('ZIP entry paths must be unique, including case and Unicode normalization.');
    names.add(key);
    const unixType = (external >>> 16) & 0xf000, directory = path.endsWith('/');
    if (unixType && ![0x8000, 0x4000].includes(unixType)) throw new Error('ZIP symlinks and special entries are unsupported.');
    if (unixType === 0x4000 && !directory || unixType === 0x8000 && directory || (external & 0x10) && !directory)
      throw new Error('ZIP directory metadata is inconsistent.');
    if (directory && size) throw new Error('ZIP directory contains unexpected data.');
    if (/\.(?:zip|zipx|jar|war|apk)$/i.test(path)) throw new Error('Nested ZIP archives are unsupported.');
    if (size > caps.maxFileBytes || expanded + size > caps.maxExpandedBytes || size > Math.max(compressed, 1) * caps.maxRatio)
      throw new Error('ZIP expanded size or compression ratio exceeds its limit.');
    expanded += size;
    extras(view, cursor + 46 + nameSize, extraSize);
    if (!range(offset, 30) || offset + 30 > centralStart || view.getUint32(offset, true) !== 0x04034b50)
      throw new Error('ZIP local file header is missing.');
    const localFlags = view.getUint16(offset + 6, true), localMethod = view.getUint16(offset + 8, true);
    const localCRC = view.getUint32(offset + 14, true), localCompressed = view.getUint32(offset + 18, true);
    const localSize = view.getUint32(offset + 22, true), localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true), dataStart = offset + 30 + localName + localExtra;
    if (localFlags !== flags || localMethod !== method || localName !== nameSize || !range(offset, dataStart - offset) || dataStart > centralStart ||
        !nameBytes.every((byte, i) => bytes[offset + 30 + i] === byte))
      throw new Error('ZIP local and central file headers disagree.');
    extras(view, offset + 30 + localName, localExtra);
    if (!range(dataStart, compressed) || dataStart + compressed > centralStart)
      throw new Error('ZIP compressed data range is inconsistent.');
    let dataEnd = dataStart + compressed;
    if (flags & 8) {
      if ((localCRC && localCRC !== crc) || (localCompressed && localCompressed !== compressed) || (localSize && localSize !== size))
        throw new Error('ZIP descriptor local sizes disagree.');
      const signature = range(dataEnd, 4) && view.getUint32(dataEnd, true) === 0x08074b50;
      const descriptor = dataEnd + (signature ? 4 : 0);
      if (!range(descriptor, 12) || descriptor + 12 > centralStart || view.getUint32(descriptor, true) !== crc ||
          view.getUint32(descriptor + 4, true) !== compressed || view.getUint32(descriptor + 8, true) !== size)
        throw new Error('ZIP data descriptor is inconsistent.');
      dataEnd = descriptor + 12;
    } else if (localCRC !== crc || localCompressed !== compressed || localSize !== size)
      throw new Error('ZIP local and central file sizes or CRC disagree.');
    entries.push({ path, directory, method, crc, size, compressed, offset, dataStart, dataEnd });
    cursor += entrySize;
  }
  if (cursor !== end) throw new Error('ZIP central directory length is inconsistent.');
  let previous = 0;
  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== previous) throw new Error('ZIP local entries overlap or contain unsupported padding/prefix data.');
    previous = entry.dataEnd;
  }
  if (previous !== centralStart) throw new Error('ZIP data and central directory do not align.');
  // Prevent a file from masquerading as a directory containing another file.
  const files = new Set(entries.filter(entry => !entry.directory).map(entry => entry.path.normalize('NFC').toLowerCase()));
  for (const entry of entries) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++) if (files.has(parts.slice(0, i).join('/').normalize('NFC').toLowerCase()))
      throw new Error('ZIP file and directory paths conflict.');
  }
  return entries;
}

async function inflate(compressed, expected, signal) {
  let decompressor;
  try { decompressor = new DecompressionStream('deflate-raw'); }
  catch { throw new Error('This browser cannot decompress ZIP deflate data; use a current browser or unpack the files locally.'); }
  const stream = new Blob([compressed]).stream().pipeThrough(decompressor), reader = stream.getReader();
  const abort = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const output = new Uint8Array(expected);
  let offset = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (value.byteLength > expected - offset) throw new Error('ZIP inflated data exceeds its declared size.');
      output.set(value, offset); offset += value.byteLength;
    }
    if (offset !== expected) throw new Error('ZIP inflated data does not match its declared size.');
    return output;
  } finally {
    signal?.removeEventListener('abort', abort);
    try { await reader.cancel(); } catch { /* Preserve the original decoding error. */ }
  }
}

/** Validate and read a bounded ZIP. Limits can only lower the hard operating caps. */
export async function readZip(input, options = {}) {
  const caps = limits(options), signal = options.signal;
  signal?.throwIfAborted();
  const inputBytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!inputBytes) throw new TypeError('ZIP input must be an ArrayBuffer or Uint8Array.');
  if (inputBytes.byteLength > caps.maxCompressedBytes) throw new Error('ZIP compressed input exceeds its limit.');
  // Keep headers/payload immutable across asynchronous inflation and caller mutation.
  const bytes = inputBytes.slice(), entries = parseDirectory(bytes, caps), result = [];
  for (const entry of entries) {
    signal?.throwIfAborted();
    const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed);
    const output = entry.method === 0 ? data.slice() : await inflate(data, entry.size, signal);
    signal?.throwIfAborted();
    if (crc32(output) !== entry.crc) throw new Error(`ZIP CRC check failed for ${entry.path}.`);
    if (output.length >= 4 && output[0] === 0x50 && output[1] === 0x4b &&
        ((output[2] === 3 && output[3] === 4) || (output[2] === 5 && output[3] === 6)))
      throw new Error('Nested ZIP archives are unsupported.');
    if (!entry.directory) result.push({ path: entry.path, bytes: output });
  }
  if (!result.length) throw new Error('ZIP contains no files.');
  return result;
}
