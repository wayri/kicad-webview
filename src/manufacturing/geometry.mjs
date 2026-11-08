/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// CAM geometry stays Cartesian y-up and millimetres until the viewport transform.
export const LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, commands: 200000, operations: 200000, segments: 500000, apertures: 1024, repeats: 10000 });
export const number = value => {
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1000000) throw new Error('CAM numeric value is invalid or exceeds the 1,000,000 mm coordinate bound.');
  return result;
};
export const fmt = value => String(Math.round(number(value) * 1e9) / 1e9);
export function validateSource(source) {
  if (typeof source !== 'string') throw new TypeError('Manufacturing source must be text.');
  if (source.length > LIMITS.bytes) throw new Error('Manufacturing source exceeds 16 MiB.');
  let bytes = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === 0) throw new Error('Binary manufacturing files are unsupported.');
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && source.charCodeAt(i + 1) >= 0xdc00 && source.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
    if (bytes > LIMITS.bytes) throw new Error('Manufacturing source exceeds 16 MiB.');
  }
}
export function pointsBounds(points, margin = 0) {
  let x = Infinity, y = Infinity, right = -Infinity, top = -Infinity;
  for (const point of points) {
    const px = number(point.x), py = number(point.y);
    x = Math.min(x, px - margin); y = Math.min(y, py - margin);
    right = Math.max(right, px + margin); top = Math.max(top, py + margin);
  }
  return x === Infinity ? null : { x, y, w: right - x, h: top - y };
}
export function unionBounds(items) {
  return pointsBounds(items.filter(Boolean).flatMap(b => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]));
}
export function circlePath(x, y, radius) {
  if (!(radius > 0)) throw new Error('Aperture/tool dimensions must be positive.');
  return `M${fmt(x + radius)} ${fmt(y)}A${fmt(radius)} ${fmt(radius)} 0 1 1 ${fmt(x - radius)} ${fmt(y)}A${fmt(radius)} ${fmt(radius)} 0 1 1 ${fmt(x + radius)} ${fmt(y)}Z`;
}
export const polygonPath = points => points.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join('') + 'Z';
export function capsulePath(a, b, radius) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length < 1e-12) return circlePath(a.x, a.y, radius);
  const nx = -dy / length * radius, ny = dx / length * radius;
  return `M${fmt(a.x + nx)} ${fmt(a.y + ny)}L${fmt(b.x + nx)} ${fmt(b.y + ny)}A${fmt(radius)} ${fmt(radius)} 0 0 0 ${fmt(b.x - nx)} ${fmt(b.y - ny)}L${fmt(a.x - nx)} ${fmt(a.y - ny)}A${fmt(radius)} ${fmt(radius)} 0 0 0 ${fmt(a.x + nx)} ${fmt(a.y + ny)}Z`;
}
const tau = Math.PI * 2;
const positive = angle => (angle % tau + tau) % tau;
export function arcGeometry(a, b, center, clockwise) {
  const radius = Math.hypot(a.x - center.x, a.y - center.y), endRadius = Math.hypot(b.x - center.x, b.y - center.y);
  if (!(radius > 0) || Math.abs(radius - endRadius) > Math.max(0.005, radius * 1e-6)) throw new Error('Circular interpolation has inconsistent endpoint radii.');
  const start = Math.atan2(a.y - center.y, a.x - center.x), end = Math.atan2(b.y - center.y, b.x - center.x);
  const full = Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  const sweep = full ? tau : positive(clockwise ? start - end : end - start), flag = clockwise ? 0 : 1;
  let segment;
  if (full) {
    const mid = { x: center.x * 2 - a.x, y: center.y * 2 - a.y };
    segment = `A${fmt(radius)} ${fmt(radius)} 0 1 ${flag} ${fmt(mid.x)} ${fmt(mid.y)}A${fmt(radius)} ${fmt(radius)} 0 1 ${flag} ${fmt(b.x)} ${fmt(b.y)}`;
  } else segment = `A${fmt(radius)} ${fmt(radius)} 0 ${sweep > Math.PI ? 1 : 0} ${flag} ${fmt(b.x)} ${fmt(b.y)}`;
  const points = [a, b];
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    if (full || positive(clockwise ? start - angle : angle - start) <= sweep + 1e-10)
      points.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
  }
  return { segment, bounds: pointsBounds(points), radius, sweep, center };
}
export function centerFromRadius(a, b, radius, clockwise) {
  const dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy);
  if (!(radius > 0) || chord < 1e-12 || chord > radius * 2 + 1e-8) throw new Error('Invalid or ambiguous radius-defined route arc.');
  const height = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4)), sign = clockwise ? -1 : 1;
  return { x: (a.x + b.x) / 2 - sign * dy / chord * height, y: (a.y + b.y) / 2 + sign * dx / chord * height };
}
export function transformPoint(point, { rotation = 0, mirrorX = false, mirrorY = false, scale = 1, x = 0, y = 0 } = {}) {
  const angle = rotation * Math.PI / 180, px = point.x * (mirrorX ? -1 : 1) * scale, py = point.y * (mirrorY ? -1 : 1) * scale;
  return { x: number(x + px * Math.cos(angle) - py * Math.sin(angle)), y: number(y + px * Math.sin(angle) + py * Math.cos(angle)) };
}
export function transformPath(path, transform = {}) {
  const tokens = path.match(/[MLAZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
  const output = [], scale = transform.scale ?? 1, flip = Boolean(transform.mirrorX) !== Boolean(transform.mirrorY);
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++];
    if (command === 'Z') { output.push('Z'); continue; }
    if (command === 'M' || command === 'L') {
      const point = transformPoint({ x: Number(tokens[i++]), y: Number(tokens[i++]) }, transform);
      output.push(`${command}${fmt(point.x)} ${fmt(point.y)}`);
    } else if (command === 'A') {
      const radiusX = Number(tokens[i++]) * scale, radiusY = Number(tokens[i++]) * scale;
      i++; const large = tokens[i++], sweep = Number(tokens[i++]);
      const point = transformPoint({ x: Number(tokens[i++]), y: Number(tokens[i++]) }, transform);
      output.push(`A${fmt(radiusX)} ${fmt(radiusY)} 0 ${large} ${flip ? 1 - sweep : sweep} ${fmt(point.x)} ${fmt(point.y)}`);
    } else throw new Error('Unexpected internal CAM path command.');
  }
  return output.join('');
}
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = iterable => { const result = []; for (const p of iterable) { while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop(); result.push(p); } return result; };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}
export function createCollector(format, path) {
  const operations = [], warnings = [], warningSet = new Set();
  let pathBytes = 0, metadataCharacters = 0;
  const warn = message => { if (!warningSet.has(message)) { warningSet.add(message); if (warnings.length < 100) warnings.push(message); } };
  const add = operation => {
    if (operations.length >= LIMITS.operations) throw new Error('Manufacturing geometry exceeds 200,000 operations.');
    pathBytes += operation.path.length;
    if (pathBytes > 32 * 1024 * 1024) throw new Error('Manufacturing SVG geometry exceeds 32 MiB.');
    metadataCharacters += JSON.stringify(operation.metadata || {}).length;
    if (metadataCharacters > 8 * 1024 * 1024) throw new Error('Manufacturing operation metadata exceeds 8 Mi characters.');
    const result = { id: `${path || format}:${operations.length + 1}`, polarity: 'dark', fill: true, ...operation };
    operations.push(result); return result;
  };
  const finish = (metadata = {}) => ({ format, path, units: 'mm', layers: [{ id: path || format, name: metadata.fileFunction || path || format, operations }], warnings, bounds: unionBounds(operations.map(op => op.bounds)), metadata });
  return { operations, warnings, warn, add, finish };
}
