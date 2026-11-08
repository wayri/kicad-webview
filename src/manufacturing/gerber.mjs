/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { LIMITS, validateSource, number, fmt, pointsBounds, unionBounds, arcGeometry, polygonPath, convexHull, transformPoint, transformPath, createCollector } from './geometry.mjs';
import { compileAperture, flashParts, createApertureBudget } from './apertures.mjs';

function* tokenize(source) {
  let position = 0, count = 0;
  while (position < source.length) {
    if (/\s/.test(source[position])) { position++; continue; }
    const extended = source[position] === '%', end = source.indexOf(extended ? '%' : '*', position + (extended ? 1 : 0));
    if (end < 0) throw new Error('Unterminated Gerber command.');
    const body = source.slice(position + (extended ? 1 : 0), end).trim(); position = end + 1;
    if (extended && body.startsWith('AM')) {
      if (++count > LIMITS.commands) throw new Error('Gerber command limit exceeded.');
      yield { extended, body }; continue;
    }
    let start = 0;
    while (start < body.length) {
      const separator = extended ? body.indexOf('*', start) : -1;
      const command = body.slice(start, separator < 0 ? body.length : separator).trim();
      start = separator < 0 ? body.length : separator + 1;
      if (!command) continue;
      if (++count > LIMITS.commands) throw new Error('Gerber command limit exceeded.');
      yield { extended, body: command };
    }
  }
}
export function parseGerber(source, { path = '' } = {}) {
  validateSource(source);
  const collector = createCollector('gerber', path), apertures = new Map(), macros = new Map();
  const apertureBudget = createApertureBudget();
  const fileAttributes = Object.create(null), apertureAttributes = Object.create(null), objectAttributes = Object.create(null);
  let unit = null, format = null, current = null, selected = null, operation = null, interpolation = 'linear', quadrant = null;
  let polarity = 'dark', transform = { rotation: 0, scale: 1, mirrorX: false, mirrorY: false }, repeat = null;
  let region = null, ended = false, segments = 0;
  const coord = (value, axis) => {
    if (!unit || !format) throw new Error('Gerber units and coordinate format must be declared before coordinates.');
    if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(value)) return number(Number(value) * unit);
    if (!/^[+-]?\d+$/.test(value)) throw new Error('Invalid Gerber coordinate.');
    const sign = value.startsWith('-') ? -1 : 1, digits = value.replace(/^[+-]/, ''), f = format[axis];
    if (digits.length > f.integer + f.decimal) throw new Error('Gerber coordinate exceeds its declared digit format.');
    const padded = format.zeros === 'T' ? digits.padEnd(f.integer + f.decimal, '0') : digits.padStart(f.integer + f.decimal, '0');
    return number(sign * Number(padded) / 10 ** f.decimal * unit);
  };
  const emit = (geometry, kind, metadata = {}) => {
    const operation = { ...geometry, kind, polarity, metadata: { aperture: selected, apertureAttributes: { ...apertures.get(selected)?.attributes }, objectAttributes: { ...objectAttributes }, ...metadata } };
    (repeat ? repeat.buffer : collector).add(operation);
  };
  function flushRepeat() {
    if (!repeat) return;
    // Gerber SR replays the complete object block: Y first, then X. Clear
    // objects affect all earlier objects, including overlapping prior copies.
    for (let x = 0; x < repeat.x; x++) for (let y = 0; y < repeat.y; y++) for (const buffered of repeat.buffer.operations) {
      const { id, ...operation } = buffered, dx = x * repeat.i, dy = y * repeat.j;
      collector.add({ ...operation, path: dx || dy ? transformPath(operation.path, { x: dx, y: dy }) : operation.path,
        bounds: { ...operation.bounds, x: operation.bounds.x + dx, y: operation.bounds.y + dy },
        metadata: { ...operation.metadata, repeat: { x, y } } });
    }
    repeat = null;
  }
  function closeContour() {
    if (!region?.contour) return;
    const contour = region.contour;
    if (contour.edges && Math.hypot(contour.start.x - current.x, contour.start.y - current.y) > 1e-7) throw new Error('Gerber region contour is not closed.');
    if (contour.edges) { region.paths.push(contour.path + 'Z'); region.bounds.push(...contour.bounds); }
    region.contour = null;
  }
  function arc(start, end, words) {
    if (!quadrant) throw new Error('Gerber circular interpolation requires G74 or G75 quadrant mode.');
    const i = words.I === undefined ? 0 : coord(words.I, 'x'), j = words.J === undefined ? 0 : coord(words.J, 'y');
    const clockwise = interpolation === 'clockwise';
    if (quadrant === 'multi') return arcGeometry(start, end, { x: start.x + i, y: start.y + j }, clockwise);
    const candidates = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      try {
        const candidate = arcGeometry(start, end, { x: start.x + Math.abs(i) * sx, y: start.y + Math.abs(j) * sy }, clockwise);
        if (candidate.sweep <= Math.PI / 2 + 1e-6 && !candidates.some(c => Math.hypot(c.center.x - candidate.center.x, c.center.y - candidate.center.y) < 1e-8)) candidates.push(candidate);
      } catch { /* Other sign combinations are not valid single-quadrant centers. */ }
    }
    if (candidates.length !== 1) throw new Error('Gerber single-quadrant arc has no unique valid center.');
    return candidates[0];
  }
  for (const token of tokenize(source)) {
    const raw = token.body;
    if (ended) throw new Error('Gerber commands appear after M02.');
    if (!token.extended && /^G0?4/.test(raw)) continue;
    if (token.extended && raw.startsWith('AM')) {
      let separators = 0;
      for (let i = 0; i < raw.length; i++) if (raw[i] === '*' && ++separators > 513) throw new Error('Aperture macro exceeds 512 commands.');
      const pieces = raw.split('*').map(piece => piece.trim()).filter(Boolean), name = pieces.shift().slice(2);
      if (!/^[A-Za-z_.$][A-Za-z0-9_.$]{0,99}$/.test(name) || macros.has(name) || macros.size >= LIMITS.apertures) throw new Error('Invalid, duplicate or excessive Gerber aperture macro.');
      macros.set(name, pieces); continue;
    }
    const command = raw.replace(/\s/g, '');
    if (token.extended) {
      let m;
      if ((m = /^FS([LT])([AI])X(\d)(\d)Y(\d)(\d)$/.exec(command))) {
        if (format || m[2] !== 'A') throw new Error('Repeated or incremental Gerber format declarations are unsupported.');
        const x = { integer: Number(m[3]), decimal: Number(m[4]) }, y = { integer: Number(m[5]), decimal: Number(m[6]) };
        if ([x, y].some(f => f.integer < 1 || f.integer > 6 || f.decimal < 1 || f.decimal > 7)) throw new Error('Invalid Gerber digit format.');
        format = { zeros: m[1], x, y }; continue;
      }
      if (/^MO(MM|IN)$/.test(command)) { const next = command === 'MOMM' ? 1 : 25.4; if (unit && unit !== next) throw new Error('Gerber unit changes within a file are unsupported.'); unit = next; continue; }
      if ((m = /^ADD(\d+)([A-Za-z_.$][A-Za-z0-9_.$]*)(?:,(.*))?$/.exec(command))) {
        if (!unit) throw new Error('Gerber aperture declaration needs explicit units.');
        const id = Number(m[1]); if (id < 10 || apertures.has(id) || apertures.size >= LIMITS.apertures) throw new Error('Invalid, duplicate or excessive Gerber aperture.');
        if (m[3]) {
          let separators = 0;
          for (let i = 0; i < m[3].length; i++) if (m[3][i] === 'X' && ++separators >= 500) throw new Error('Aperture exceeds 500 parameters.');
        }
        try { apertures.set(id, { ...compileAperture(m[2], m[3] ? m[3].split('X') : [], unit, macros, apertureBudget), attributes: { ...apertureAttributes } }); }
        catch (error) { if (error.code === 'CAM_RESOURCE_LIMIT') throw error; apertures.set(id, { unsupported: error.message, attributes: { ...apertureAttributes } }); }
        continue;
      }
      if ((m = /^(TF|TA|TO)([^,]+)(?:,(.*))?$/.exec(raw))) {
        const target = m[1] === 'TF' ? fileAttributes : m[1] === 'TA' ? apertureAttributes : objectAttributes;
        if (Object.keys(target).length >= 128 || raw.length > 4096) throw new Error('Gerber attributes exceed metadata limits.');
        target[m[2]] = m[3] === undefined ? [] : m[3].split(','); continue;
      }
      if ((m = /^TD(.*)$/.exec(command))) { for (const target of [apertureAttributes, objectAttributes]) for (const key of Object.keys(target)) if (!m[1] || key === m[1]) delete target[key]; continue; }
      if (/^LP[DC]$/.test(command)) { if (region) throw new Error('Polarity changes inside a Gerber region are unsupported.'); polarity = command === 'LPD' ? 'dark' : 'clear'; continue; }
      if ((m = /^LM(N|X|Y|XY)$/.exec(command))) { transform = { ...transform, mirrorX: m[1].includes('X'), mirrorY: m[1].includes('Y') }; continue; }
      if ((m = /^LR([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(command))) { transform = { ...transform, rotation: number(m[1]) }; continue; }
      if ((m = /^LS([+]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(command))) { const scale = number(m[1]); if (!(scale > 0)) throw new Error('Invalid aperture scale.'); transform = { ...transform, scale }; continue; }
      if (command === 'SR') { if (region) throw new Error('Step-repeat changes inside a region are unsupported.'); flushRepeat(); continue; }
      if ((m = /^SRX(\d+)Y(\d+)I([+-]?(?:\d+(?:\.\d*)?|\.\d+))J([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(command))) {
        if (region || repeat || !unit) throw new Error('Nested or invalid Gerber step-repeat state.');
        repeat = { x: Number(m[1]), y: Number(m[2]), i: number(Number(m[3]) * unit), j: number(Number(m[4]) * unit), buffer: createCollector('gerber-repeat', path) };
        if (repeat.x < 1 || repeat.y < 1 || repeat.x * repeat.y > LIMITS.repeats) throw new Error('Gerber step-repeat exceeds 10,000 copies.');
        continue;
      }
      if (/^LN/.test(command)) { fileAttributes.LayerName = [raw.slice(2)]; continue; }
      if (command === 'IPPOS') continue;
      throw new Error(`Unsupported Gerber state command: ${command.slice(0, 80)}.`);
    }
    if (/^M0?2$/.test(command)) { if (region || repeat) throw new Error('Gerber ended inside a region or step-repeat block.'); ended = true; continue; }
    if (/^G0?36$/.test(command)) { if (region) throw new Error('Nested Gerber regions are unsupported.'); region = { paths: [], bounds: [], contour: null }; continue; }
    if (/^G0?37$/.test(command)) { if (!region) throw new Error('Gerber region end without a start.'); closeContour(); if (region.paths.length) emit({ path: region.paths.join(''), bounds: unionBounds(region.bounds) }, 'region'); region = null; continue; }
    if (/^G0?74$/.test(command)) { quadrant = 'single'; continue; }
    if (/^G0?75$/.test(command)) { quadrant = 'multi'; continue; }
    if (/^G0?90$/.test(command)) continue;
    if (/^G0?91$/.test(command)) throw new Error('Incremental Gerber coordinates are unsupported.');
    const normalized = command.replace(/^G0?54/, '');
    const fields = [...normalized.matchAll(/([XYIJDG])([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g)];
    if (!fields.length || fields.map(m => m[0]).join('') !== normalized) throw new Error(`Unsupported Gerber command: ${command.slice(0, 80)}.`);
    const words = Object.create(null);
    for (const field of fields) { if (words[field[1]] !== undefined) throw new Error('Duplicate Gerber coordinate/code word.'); words[field[1]] = field[2]; }
    if (words.G !== undefined) {
      const g = Number(words.G); if (![1, 2, 3].includes(g)) throw new Error(`Unsupported Gerber interpolation G${g}.`);
      interpolation = g === 1 ? 'linear' : g === 2 ? 'clockwise' : 'counterclockwise';
    }
    if (words.D !== undefined && Number(words.D) >= 10) {
      if (['X', 'Y', 'I', 'J'].some(key => words[key] !== undefined)) throw new Error('Aperture selection cannot carry coordinates.');
      selected = Number(words.D); if (!apertures.has(selected)) throw new Error('Selected Gerber aperture is undefined.'); continue;
    }
    if (words.D !== undefined) { operation = Number(words.D); if (![1, 2, 3].includes(operation)) throw new Error('Invalid Gerber operation code.'); }
    const hasCoordinates = ['X', 'Y'].some(key => words[key] !== undefined);
    if (!hasCoordinates && words.D === undefined) continue;
    if (!operation) throw new Error('Gerber coordinates have no operation code.');
    const next = { x: words.X === undefined ? current?.x : coord(words.X, 'x'), y: words.Y === undefined ? current?.y : coord(words.Y, 'y') };
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) throw new Error('The first Gerber position must define both axes.');
    if (++segments > LIMITS.segments) throw new Error('Gerber geometry segment limit exceeded.');
    if (operation === 2) {
      if (region) { closeContour(); region.contour = { start: next, path: `M${fmt(next.x)} ${fmt(next.y)}`, bounds: [], edges: 0 }; }
      current = next; continue;
    }
    const aperture = apertures.get(selected);
    if (operation === 3) {
      if (region) throw new Error('A flash is not valid inside a Gerber region.');
      if (!aperture) throw new Error('Gerber flash needs a selected aperture.');
      if (aperture.unsupported) collector.warn(`D${selected} omitted: ${aperture.unsupported}`);
      else for (const part of flashParts(aperture, { ...transform, x: next.x, y: next.y })) emit(part, 'flash');
      current = next; continue;
    }
    if (!current) throw new Error('Gerber draw needs a starting position.');
    const segment = interpolation === 'linear' ? { segment: `L${fmt(next.x)} ${fmt(next.y)}`, bounds: pointsBounds([current, next]) } : arc(current, next, words);
    if (region) {
      if (!region.contour) throw new Error('A region contour needs an initial D02 move.');
      region.contour.path += segment.segment; region.contour.bounds.push(segment.bounds); region.contour.edges++;
    } else {
      if (!aperture) throw new Error('Gerber draw needs a selected aperture.');
      if (aperture.unsupported || !aperture.stroke) collector.warn(`D${selected} draw omitted: ${aperture.unsupported || 'unsupported swept aperture or aperture hole'}.`);
      else if (aperture.stroke.type === 'circle') {
        const width = aperture.stroke.radius * 2 * transform.scale, bounds = segment.bounds;
        emit({ path: `M${fmt(current.x)} ${fmt(current.y)}` + segment.segment, fill: false, width, bounds: { x: bounds.x - width / 2, y: bounds.y - width / 2, w: bounds.w + width, h: bounds.h + width } }, 'stroke');
      } else if (interpolation === 'linear') {
        const shape = aperture.stroke.points.map(point => transformPoint(point, transform));
        const swept = convexHull(shape.flatMap(point => [{ x: point.x + current.x, y: point.y + current.y }, { x: point.x + next.x, y: point.y + next.y }]));
        emit({ path: polygonPath(swept), bounds: pointsBounds(swept) }, 'stroke');
      } else collector.warn(`D${selected} circular draw omitted: non-circular swept apertures are unsupported.`);
    }
    current = next;
  }
  if (region) throw new Error('Unclosed Gerber region.');
  if (repeat) throw new Error('Unclosed Gerber step-repeat block.');
  if (!unit || !format) throw new Error('Gerber units/format are missing; RS-274D without embedded apertures is unsupported.');
  if (!ended) collector.warn('Gerber M02 end marker is missing.');
  return collector.finish({ inputUnits: unit === 1 ? 'mm' : 'inch', coordinateFormat: format, attributes: { ...fileAttributes }, fileFunction: fileAttributes['.FileFunction']?.join(',') || fileAttributes.LayerName?.join(',') });
}
