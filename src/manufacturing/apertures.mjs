/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { circlePath, capsulePath, polygonPath, pointsBounds, transformPoint, transformPath, number } from './geometry.mjs';

const APERTURE_BUDGETS = Object.freeze({ parts: 16384, points: 131072, pathBytes: 8 * 1024 * 1024, macroCommands: 32768, expressionTokens: 524288 });
export function createApertureBudget() { return Object.fromEntries(Object.keys(APERTURE_BUDGETS).map(key => [key, 0])); }
function charge(budget, key, count) {
  budget[key] += count;
  if (budget[key] > APERTURE_BUDGETS[key]) {
    const error = new Error(`Gerber compiled aperture ${key} budget exceeded.`);
    error.code = 'CAM_RESOURCE_LIMIT'; throw error;
  }
}
const positive = value => { const n = number(value); if (!(n > 0)) throw new Error('Aperture dimensions must be positive.'); return n; };
const circle = (x, y, radius) => ({ path: circlePath(x, y, radius), bounds: { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 }, circle: { x, y, radius } });
const polygon = points => ({ path: polygonPath(points), bounds: pointsBounds(points), points });
const rectangle = (width, height, x = 0, y = 0) => [
  { x: x - width / 2, y: y - height / 2 }, { x: x + width / 2, y: y - height / 2 },
  { x: x + width / 2, y: y + height / 2 }, { x: x - width / 2, y: y + height / 2 },
];
function regularPolygon(diameter, vertices, x = 0, y = 0, rotation = 0) {
  if (!Number.isInteger(vertices) || vertices < 3 || vertices > 12) throw new Error('Polygon apertures require 3 to 12 vertices.');
  return Array.from({ length: vertices }, (_, i) => {
    const angle = (rotation + i * 360 / vertices) * Math.PI / 180;
    return { x: x + diameter / 2 * Math.cos(angle), y: y + diameter / 2 * Math.sin(angle) };
  });
}
// A small arithmetic parser, deliberately independent of JavaScript evaluation.
function expression(source, variables, budget) {
  if (source.length > 256) throw new Error('Aperture macro expression exceeds 256 characters.');
  const tokens = source.match(/\$\d+|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-/xX]/g) || [];
  charge(budget, 'expressionTokens', tokens.length);
  if (tokens.join('') !== source.replace(/\s/g, '') || tokens.length > 128) throw new Error('Unsupported aperture macro expression.');
  let position = 0, depth = 0;
  function atom() {
    if (++depth > 32) throw new Error('Aperture macro expression nesting exceeds 32.');
    const token = tokens[position++]; let value;
    if (token === '+' || token === '-') value = (token === '-' ? -1 : 1) * atom();
    else if (token === '(') { value = sum(); if (tokens[position++] !== ')') throw new Error('Unclosed aperture macro expression.'); }
    else if (token?.startsWith('$')) { const index = Number(token.slice(1)); if (index > 500) throw new Error('Aperture macro variable limit exceeded.'); value = variables.get(index) || 0; }
    else if (token !== undefined && /^\d|^\./.test(token)) value = Number(token);
    else throw new Error('Invalid aperture macro expression.');
    depth--; return number(value);
  }
  function product() { let value = atom(); while (['x', 'X', '/'].includes(tokens[position])) { const op = tokens[position++], next = atom(); if (op === '/' && next === 0) throw new Error('Aperture macro division by zero.'); value = number(op === '/' ? value / next : value * next); } return value; }
  function sum() { let value = product(); while (['+', '-'].includes(tokens[position])) { const op = tokens[position++], next = product(); value = number(op === '+' ? value + next : value - next); } return value; }
  const result = sum(); if (position !== tokens.length) throw new Error('Invalid aperture macro expression tail.'); return result;
}
function macroParts(lines, parameters, unit, budget) {
  if (lines.length > 512) throw new Error('Aperture macro exceeds 512 commands.');
  const variables = new Map(parameters.map((value, i) => [i + 1, number(value)])), parts = [];
  for (const line of lines) {
    charge(budget, 'macroCommands', 1);
    if (!line || /^0(?:\s|,|$)/.test(line)) continue;
    if (line.length > 128 * 1024) { charge(budget, 'expressionTokens', APERTURE_BUDGETS.expressionTokens + 1); }
    let separators = 0;
    for (let i = 0; i < line.length; i++) if (line[i] === ',' && ++separators > 4100) charge(budget, 'expressionTokens', APERTURE_BUDGETS.expressionTokens + 1);
    const assignment = /^\$(\d+)=(.+)$/.exec(line);
    if (assignment) { const index = Number(assignment[1]); if (index > 500) throw new Error('Aperture macro variable limit exceeded.'); variables.set(index, expression(assignment[2], variables, budget)); continue; }
    const fields = line.split(','), code = Number(fields.shift());
    const a = fields.map(value => expression(value, variables, budget));
    if (![1, 4, 5, 20, 21, 22].includes(code)) throw new Error(`Aperture macro primitive ${code} is unsupported.`);
    if (a[0] !== 1) throw new Error('Aperture macros with clear exposure are unsupported.');
    let shape, rotation = 0;
    const scaled = value => number(value * unit);
    if (code === 1) {
      if (a.length !== 4 && a.length !== 5) throw new Error('Invalid macro circle.');
      const radius = positive(scaled(a[1])) / 2; rotation = a[4] || 0;
      const center = transformPoint({ x: scaled(a[2]), y: scaled(a[3]) }, { rotation });
      shape = circle(center.x, center.y, radius);
    } else if (code === 20) {
      if (a.length !== 7) throw new Error('Invalid macro vector line.');
      const width = positive(scaled(a[1])), from = { x: scaled(a[2]), y: scaled(a[3]) }, to = { x: scaled(a[4]), y: scaled(a[5]) }, length = Math.hypot(to.x - from.x, to.y - from.y);
      if (!length) throw new Error('A zero-length macro vector line is unsupported.');
      const nx = -(to.y - from.y) / length * width / 2, ny = (to.x - from.x) / length * width / 2;
      rotation = a[6]; shape = polygon([{ x: from.x + nx, y: from.y + ny }, { x: to.x + nx, y: to.y + ny }, { x: to.x - nx, y: to.y - ny }, { x: from.x - nx, y: from.y - ny }].map(p => transformPoint(p, { rotation })));
    } else if (code === 21 || code === 22) {
      if (a.length !== 6) throw new Error('Invalid macro rectangle.');
      const width = positive(scaled(a[1])), height = positive(scaled(a[2])); rotation = a[5];
      const x = scaled(a[3]) + (code === 22 ? width / 2 : 0), y = scaled(a[4]) + (code === 22 ? height / 2 : 0);
      shape = polygon(rectangle(width, height, x, y).map(p => transformPoint(p, { rotation })));
    } else if (code === 5) {
      if (a.length !== 6) throw new Error('Invalid macro polygon.');
      shape = polygon(regularPolygon(positive(scaled(a[4])), a[1], scaled(a[2]), scaled(a[3])).map(p => transformPoint(p, { rotation: a[5] })));
    } else {
      const count = a[1];
      if (!Number.isInteger(count) || count < 3 || count > 2000 || a.length !== count * 2 + 5) throw new Error('Invalid macro outline.');
      charge(budget, 'points', count + 1);
      const points = Array.from({ length: count + 1 }, (_, i) => ({ x: scaled(a[2 + i * 2]), y: scaled(a[3 + i * 2]) }));
      if (Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) > 1e-9) throw new Error('Macro outline is not closed.');
      shape = polygon(points.slice(0, -1).map(p => transformPoint(p, { rotation: a.at(-1) })));
    }
    charge(budget, 'parts', 1);
    if (code !== 4) charge(budget, 'points', shape.points?.length || 1);
    charge(budget, 'pathBytes', shape.path.length);
    parts.push(shape);
    if (parts.length > 256) throw new Error('Aperture macro exceeds 256 primitives.');
  }
  if (!parts.length) throw new Error('Aperture macro contains no drawable primitives.');
  return parts;
}
export function compileAperture(template, parameters, unit, macros, budget = createApertureBudget()) {
  if (parameters.length > 500) throw new Error('Aperture exceeds 500 parameters.');
  const a = parameters.map(number), dimension = index => positive(a[index] * unit);
  let parts, stroke, minimum;
  if (template === 'C') {
    if (a.length < 1 || a.length > 2) throw new Error('Invalid circular aperture parameters.');
    const radius = dimension(0) / 2; parts = [circle(0, 0, radius)]; stroke = { type: 'circle', radius }; minimum = radius * 2;
  } else if (template === 'R' || template === 'O') {
    if (a.length < 2 || a.length > 3) throw new Error('Invalid rectangular/obround aperture parameters.');
    const width = dimension(0), height = dimension(1); minimum = Math.min(width, height);
    if (template === 'R') { const points = rectangle(width, height); parts = [polygon(points)]; stroke = { type: 'polygon', points }; }
    else {
      const radius = minimum / 2, a = { x: -(width - minimum) / 2, y: -(height - minimum) / 2 }, b = { x: -a.x, y: -a.y };
      parts = [{ path: capsulePath(a, b, radius), bounds: { x: -width / 2, y: -height / 2, w: width, h: height }, capsule: { a, b, radius } }];
      if (Math.abs(width - height) < 1e-12) stroke = { type: 'circle', radius };
    }
  } else if (template === 'P') {
    if (a.length < 2 || a.length > 4) throw new Error('Invalid polygon aperture parameters.');
    const points = regularPolygon(dimension(0), a[1], 0, 0, a[2] || 0); parts = [polygon(points)]; stroke = { type: 'polygon', points }; minimum = dimension(0) * Math.cos(Math.PI / a[1]);
  } else {
    if (!macros.has(template)) throw new Error(`Aperture macro ${template} is not defined.`);
    return { template, parts: macroParts(macros.get(template), parameters, unit, budget) };
  }
  const holeIndex = template === 'C' ? 1 : template === 'P' ? 3 : 2, hole = a[holeIndex] ? positive(a[holeIndex] * unit) : 0;
  if (hole) {
    if (hole >= minimum) throw new Error('Aperture hole is not contained inside its outer shape.');
    parts[0].path += circlePath(0, 0, hole / 2);
  }
  charge(budget, 'parts', parts.length);
  for (const part of parts) { charge(budget, 'points', part.points?.length || 1); charge(budget, 'pathBytes', part.path.length); }
  return { template, parts, stroke: hole ? null : stroke, hole };
}
export function flashParts(aperture, transform) {
  return aperture.parts.map(part => {
    if (part.circle) {
      const center = transformPoint(part.circle, transform), radius = part.circle.radius * transform.scale;
      return { path: transformPath(part.path, transform), bounds: { x: center.x - radius, y: center.y - radius, w: radius * 2, h: radius * 2 } };
    }
    if (part.points) return { path: transformPath(part.path, transform), bounds: pointsBounds(part.points.map(p => transformPoint(p, transform))) };
    if (part.capsule) return { path: transformPath(part.path, transform), bounds: pointsBounds([part.capsule.a, part.capsule.b].map(p => transformPoint(p, transform)), part.capsule.radius * transform.scale) };
    const corners = [{ x: part.bounds.x, y: part.bounds.y }, { x: part.bounds.x + part.bounds.w, y: part.bounds.y }, { x: part.bounds.x + part.bounds.w, y: part.bounds.y + part.bounds.h }, { x: part.bounds.x, y: part.bounds.y + part.bounds.h }].map(p => transformPoint(p, transform));
    return { path: transformPath(part.path, transform), bounds: pointsBounds(corners) };
  });
}
