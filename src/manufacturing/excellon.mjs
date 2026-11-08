/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { LIMITS, validateSource, number, fmt, circlePath, pointsBounds, arcGeometry, centerFromRadius, createCollector } from './geometry.mjs';

function digitsOption(value) {
  if (value === undefined || value === null) return null;
  const pair = Array.isArray(value) ? value : typeof value === 'string' ? value.split(':').map(Number) : [value.integer, value.decimal];
  if (pair.length !== 2 || pair.some(n => !Number.isInteger(n)) || pair[0] < 1 || pair[0] > 6 || pair[1] < 1 || pair[1] > 7) throw new TypeError('Excellon formatDigits must specify integer and decimal digit counts.');
  return { integer: pair[0], decimal: pair[1] };
}
export function parseExcellon(source, options = {}) {
  validateSource(source);
  const { path = '' } = options, collector = createCollector('excellon', path), tools = new Map();
  const fileAttributes = Object.create(null), toolAttributes = Object.create(null), objectAttributes = Object.create(null);
  const unitsOption = options.units === undefined ? null : options.units === 'mm' ? 1 : options.units === 'inch' ? 25.4 : NaN;
  if (Number.isNaN(unitsOption)) throw new TypeError('Excellon units must be mm or inch.');
  let unit = unitsOption, digits = digitsOption(options.formatDigits), zeroSuppression = options.zeroSuppression || null;
  if (zeroSuppression && !['leading', 'trailing', 'none'].includes(zeroSuppression)) throw new TypeError('Excellon zeroSuppression must be leading, trailing or none.');
  let decimalMode = options.decimal === true || options.coordinateFormat === 'decimal' || /\.xnc$/i.test(path);
  let header = false, sawHeader = false, headerEnded = false, ended = false, current = null, selected = null, mode = 'drill', toolDown = false, interpolation = 'linear', lastRadius = null;
  let lineCount = 1;
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10 && ++lineCount > LIMITS.commands) throw new Error('Excellon command limit exceeded.');
  const inputLines = source.split(/\r?\n/);
  const setUnits = next => { if (unit && unit !== next) throw new Error('Excellon units conflict with the header/options.'); unit = next; };
  const setDigits = next => { if (digits && (digits.integer !== next.integer || digits.decimal !== next.decimal)) throw new Error('Excellon digit format conflicts with the header/options.'); digits = next; };
  const setZeros = next => { if (zeroSuppression && zeroSuppression !== next) throw new Error('Excellon zero suppression conflicts with the header/options.'); zeroSuppression = next; };
  const coord = raw => {
    if (!unit) throw new Error('Excellon units are missing; specify units explicitly.');
    if (/^[+-]?(?:\d+\.\d*|\.\d+)$/.test(raw) || decimalMode) return number(Number(raw) * unit);
    if (!/^[+-]?\d+$/.test(raw)) throw new Error('Invalid Excellon coordinate.');
    if (Number(raw) === 0) return 0;
    if (!digits) throw new Error('Ambiguous Excellon integer coordinates: specify formatDigits or use a declared decimal format.');
    const sign = raw.startsWith('-') ? -1 : 1, value = raw.replace(/^[+-]/, ''), total = digits.integer + digits.decimal;
    if (value.length > total) throw new Error('Excellon coordinate exceeds its declared digit format.');
    if (value.length < total && (!zeroSuppression || zeroSuppression === 'none')) throw new Error('Ambiguous Excellon omitted zeros: specify zeroSuppression.');
    const padded = zeroSuppression === 'trailing' ? value.padEnd(total, '0') : value.padStart(total, '0');
    return number(sign * Number(padded) / 10 ** digits.decimal * unit);
  };
  function words(text) {
    const fields = [...text.matchAll(/([XYIJA])([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g)];
    if (!fields.length || fields.map(m => m[0]).join('') !== text) throw new Error(`Unsupported Excellon coordinate command: ${text.slice(0, 80)}.`);
    const result = Object.create(null);
    for (const field of fields) { if (result[field[1]] !== undefined) throw new Error('Duplicate Excellon coordinate word.'); result[field[1]] = coord(field[2]); }
    return result;
  }
  function position(parsed, previous = current) {
    const point = { x: parsed.X ?? previous?.x, y: parsed.Y ?? previous?.y };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('The first Excellon position must define both axes.');
    return point;
  }
  function tool() { const result = tools.get(selected); if (!result) throw new Error('Excellon geometry requires a defined selected tool.'); return result; }
  function add(geometry, kind, line) {
    const chosen = tool();
    collector.add({ ...geometry, kind, metadata: { tool: selected, diameter: chosen.diameter, line, toolAttributes: { ...chosen.attributes }, objectAttributes: { ...objectAttributes } } });
    chosen.operations++;
  }
  function drill(point, line) { const radius = tool().diameter / 2; add({ path: circlePath(point.x, point.y, radius), bounds: { x: point.x - radius, y: point.y - radius, w: radius * 2, h: radius * 2 } }, 'drill', line); }
  function route(start, end, parsed, line, kind = 'route') {
    const width = tool().diameter;
    let segment, bounds;
    if (interpolation === 'linear' || kind === 'slot') { segment = `L${fmt(end.x)} ${fmt(end.y)}`; bounds = pointsBounds([start, end]); }
    else {
      const clockwise = interpolation === 'clockwise'; let center;
      if (parsed.I !== undefined || parsed.J !== undefined) center = { x: start.x + (parsed.I || 0), y: start.y + (parsed.J || 0) };
      else {
        const radius = parsed.A ?? lastRadius;
        if (!radius) throw new Error('Excellon circular routing requires I/J offsets or an explicit A radius.');
        lastRadius = radius; center = centerFromRadius(start, end, radius, clockwise);
      }
      ({ segment, bounds } = arcGeometry(start, end, center, clockwise));
    }
    add({ path: `M${fmt(start.x)} ${fmt(start.y)}` + segment, fill: false, width, bounds: { x: bounds.x - width / 2, y: bounds.y - width / 2, w: bounds.w + width, h: bounds.h + width } }, kind, line);
  }
  for (let index = 0; index < inputLines.length; index++) {
    const raw = inputLines[index].trim(); if (!raw) continue;
    if (raw.startsWith(';')) {
      let match;
      if ((match = /FILE_FORMAT\s*=\s*(\d+)\s*:\s*(\d+)/i.exec(raw))) setDigits(digitsOption([Number(match[1]), Number(match[2])]));
      if (/FORMAT=.*\/\s*decimal\s*\}/i.test(raw)) decimalMode = true;
      if ((match = /#@!\s*(TF|TA|TO)([^,\s]+)(?:,(.*))?/.exec(raw))) {
        const target = match[1] === 'TF' ? fileAttributes : match[1] === 'TA' ? toolAttributes : objectAttributes;
        if (Object.keys(target).length > 128 || raw.length > 4096) throw new Error('Excellon attributes exceed metadata limits.');
        target[match[2]] = match[3]?.split(',') || [];
      }
      if (/#@!\s*TD/.test(raw)) { for (const target of [toolAttributes, objectAttributes]) for (const key of Object.keys(target)) delete target[key]; }
      continue;
    }
    if (ended) throw new Error('Excellon commands appear after M30.');
    const command = raw.replace(/\s/g, ''); let match;
    if (command === 'M48') { if (sawHeader) throw new Error('Repeated Excellon header.'); sawHeader = header = true; continue; }
    if (!sawHeader) throw new Error('An Excellon M48 header is required in this beta.');
    if (command === '%' || command === 'M95') { if (!header) throw new Error('Unexpected Excellon header end.'); header = false; headerEnded = true; continue; }
    if ((match = /^(METRIC|INCH)(?:,(LZ|TZ))?(?:,(0+)\.(0+))?$/.exec(command))) {
      if (!header) throw new Error('Excellon unit declaration must be in its header.');
      setUnits(match[1] === 'METRIC' ? 1 : 25.4);
      // Excellon names the zeros RETAINED, unlike Gerber FS suppression flags.
      if (match[2]) setZeros(match[2] === 'LZ' ? 'trailing' : 'leading');
      if (match[3]) setDigits(digitsOption([match[3].length, match[4].length]));
      continue;
    }
    if (command === 'M71' || command === 'M72') { setUnits(command === 'M71' ? 1 : 25.4); continue; }
    if (command === 'FMAT,2' || command === 'VER,1' || command === 'ICI,OFF' || command === 'G90') continue;
    if (command === 'G91' || command === 'ICI,ON') throw new Error('Incremental Excellon coordinates are unsupported.');
    if ((match = /^T(\d+)C((?:\d+(?:\.\d*)?|\.\d+))(?:F[\d.]+)?(?:S[\d.]+)?$/.exec(command))) {
      if (!header || !unit) throw new Error('Excellon tools must be declared in a header with explicit units.');
      const id = Number(match[1]), diameter = number(Number(match[2]) * unit);
      if (id < 1 || id > 9999 || tools.has(id) || tools.size >= LIMITS.apertures || !(diameter > 0)) throw new Error('Invalid, duplicate or excessive Excellon tool.');
      tools.set(id, { diameter, attributes: { ...toolAttributes }, operations: 0 }); continue;
    }
    if (header) throw new Error(`Unsupported Excellon header command: ${command.slice(0, 80)}.`);
    if (command === 'M30') { if (toolDown) throw new Error('Excellon ended with the route tool down.'); ended = true; continue; }
    if ((match = /^T(\d+)$/.exec(command))) { selected = Number(match[1]) || null; if (selected && !tools.has(selected)) throw new Error('Undefined Excellon tool selected.'); continue; }
    if (/^G0?5$/.test(command)) { mode = 'drill'; toolDown = false; interpolation = 'linear'; continue; }
    if (command === 'M15') { if (mode !== 'rout' || !current) throw new Error('Excellon tool down requires a route start.'); tool(); toolDown = true; continue; }
    if (command === 'M16' || command === 'M17') { toolDown = false; continue; }
    if (command.includes('G85')) {
      if (toolDown) throw new Error('G85 slot encountered while routing.');
      const parts = command.split('G85'); if (parts.length !== 2 || !parts[1]) throw new Error('Invalid Excellon G85 slot.');
      const start = parts[0] ? position(words(parts[0])) : current;
      if (!start) throw new Error('Excellon slot start is undefined.');
      const end = position(words(parts[1]), start); route(start, end, {}, index + 1, 'slot'); current = end; continue;
    }
    if ((match = /^R(\d+)(.*)$/.exec(command))) {
      const count = Number(match[1]); if (mode !== 'drill' || !current || count < 1 || count > LIMITS.repeats) throw new Error('Invalid or excessive Excellon repeat drill pattern.');
      const delta = words(match[2]); if (Object.keys(delta).some(key => !['X', 'Y'].includes(key))) throw new Error('Unsupported Excellon repeat fields.');
      for (let repeat = 0; repeat < count; repeat++) { current = { x: number(current.x + (delta.X || 0)), y: number(current.y + (delta.Y || 0)) }; drill(current, index + 1); }
      continue;
    }
    let coords = command, g = null;
    if ((match = /^G(0?[0123])(.*)$/.exec(command))) { g = Number(match[1]); coords = match[2]; }
    if (g === 0) { mode = 'rout'; if (toolDown) throw new Error('Rapid route movement with tool down is unsupported.'); if (coords) current = position(words(coords)); continue; }
    if (g !== null) { mode = 'rout'; interpolation = g === 1 ? 'linear' : g === 2 ? 'clockwise' : 'counterclockwise'; }
    const parsed = words(coords), next = position(parsed);
    if (mode === 'drill') {
      if (['I', 'J', 'A'].some(key => parsed[key] !== undefined)) throw new Error('Unexpected arc fields in drill mode.');
      drill(next, index + 1);
    } else {
      if (!toolDown || !current) throw new Error('Excellon route segment requires tool down and a starting point.');
      route(current, next, parsed, index + 1);
    }
    current = next;
  }
  if (!headerEnded || header) throw new Error('Excellon header is incomplete.');
  if (!unit) throw new Error('Excellon units are missing.');
  if (!ended) collector.warn('Excellon M30 end marker is missing.');
  return collector.finish({ inputUnits: unit === 1 ? 'mm' : 'inch', coordinateFormat: decimalMode ? 'decimal' : digits, zeroSuppression, attributes: { ...fileAttributes }, fileFunction: fileAttributes['.FileFunction']?.join(','), tools: [...tools].map(([id, tool]) => ({ id, diameter: tool.diameter, operations: tool.operations, attributes: { ...tool.attributes } })) });
}
