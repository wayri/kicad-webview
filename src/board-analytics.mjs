/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import '../engine/design-diff.js';
import '../engine/bom-analytics.js';

const diff = globalThis.KiCadDesignDiff;
const analytics = globalThis.KiCadBomAnalytics;
const MAX_BYTES = 8 * 1024 * 1024, MAX_OBJECTS = 100000, MAX_PROPERTIES = 64, MAX_CSV_BYTES = 32 * 1024 * 1024;
const bomReports = new WeakSet();
const value = x => x && typeof x === 'object' && !Array.isArray(x) ? x.quoted : x;
const kind = x => Array.isArray(x) ? String(value(x[0])) : '';
const children = (x, name) => Array.isArray(x) ? x.filter(item => kind(item) === name) : [];
const child = (x, name) => children(x, name)[0];
const field = (x, name) => value(child(x, name)?.[1]);
function checked(source, path) {
  if (typeof source !== 'string') throw new TypeError('Source must be KiCad text.');
  if (new TextEncoder().encode(source).length > MAX_BYTES) throw new Error('Source exceeds 8 MiB.');
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\x00-\x1f\x7f]/.test(path)) throw new TypeError('A source path of at most 1024 characters without control characters is required.');
  const ast = diff.parse(source), root = kind(ast);
  if (!['kicad_pcb', 'kicad_sch'].includes(root)) throw new Error('Expected a saved KiCad PCB or schematic.');
  let count = 0;
  for (const form of ast) if (Array.isArray(form)) {
    count++;
    if (kind(form) === 'footprint') count += children(form, 'pad').length;
    if (kind(form) === 'zone') count += children(form, 'polygon').length + children(form, 'filled_polygon').length;
    if (count > MAX_OBJECTS) throw new Error('Source exceeds the 100,000-object analytics limit.');
  }
  return {ast, root};
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function flag(form, name) {
  const item = child(form, name);
  if (!item) return null;
  if (item.length === 1) return true;
  const text = String(value(item[1])).toLowerCase();
  if (['yes','true','1'].includes(text)) return true;
  if (['no','false','0'].includes(text)) return false;
  return null;
}
function partFrom(form, path, ordinal, warnings) {
  const type = kind(form), properties = {}, entries = children(form, 'property');
  // Reference, Value and Footprint remain available even when the property cap is reached.
  for (const item of entries) {
    if (item.length < 3) continue;
    const key = String(value(item[1]));
    if (['Reference','Value','Footprint'].includes(key)) properties[key] = String(value(item[2]));
  }
  for (const item of entries) {
    if (item.length < 3) continue;
    const key = String(value(item[1]));
    if (Object.hasOwn(properties, key)) continue;
    if (Object.keys(properties).length >= MAX_PROPERTIES) { warnings.add('Part properties limited to 64 saved fields.'); continue; }
    Object.defineProperty(properties, key, {value:String(value(item[2])), enumerable:true, writable:true, configurable:true});
  }
  if (type === 'footprint') for (const [role, name] of [['reference','Reference'],['value','Value']]) {
    const legacy = children(form, 'fp_text').find(item => value(item[1]) === role);
    if (!Object.hasOwn(properties,name) && legacy?.length >= 3) properties[name] = String(value(legacy[2]));
  }
  const library = type === 'symbol' ? field(form,'lib_id') : value(form[1]);
  if (library !== undefined && !Object.hasOwn(properties,'Library ID')) properties['Library ID'] = String(library);
  const attributes = child(form,'attr')?.slice(1).map(value).map(String) || [];
  const affirmative = x => ['yes','true','1','dnp','dni','do not populate','do not install'].includes(String(x ?? '').trim().toLowerCase());
  const marked = entries.some(item => ['dnp','do not populate','dni','do not install'].includes(String(value(item[1])).trim().toLowerCase()) && affirmative(value(item[2])));
  const uuid = field(form,'uuid') ?? field(form,'tstamp') ?? null;
  return {id:uuid ? `${path}#${String(uuid)}` : `${path}#object-${ordinal}`, uuid:uuid === null ? null : String(uuid), kind:type, path,
    reference:properties.Reference || null, properties,
    populated:!(flag(form,'dnp') === true || attributes.includes('dnp') || marked),
    excludeFromBom:flag(form,'in_bom') === false || attributes.includes('exclude_from_bom')};
}
export function analyzeBoard(source, {path = 'board.kicad_pcb'} = {}) {
  const {ast, root} = checked(source,path);
  if (root !== 'kicad_pcb') throw new Error('Board analytics requires a saved PCB.');
  const result = analytics.board(source), thickness = field(child(ast,'general'),'thickness');
  if (thickness !== undefined && (!Number.isFinite(Number(thickness)) || Number(thickness) <= 0)) {
    result.boardThicknessMm = null;
    result.warnings.push('Invalid or nonpositive saved board thickness omitted.');
  }
  return freeze({path, sourceKind:'pcb', ...result});
}
export function buildBOM(source, {path = 'drawing.kicad_pcb'} = {}) {
  const {ast, root} = checked(source,path), warnings = new Set(), wanted = root === 'kicad_pcb' ? 'footprint' : 'symbol';
  const parts = children(ast,wanted).map((form,index) => partFrom(form,path,index+1,warnings));
  if (root === 'kicad_pcb') {
    const counts = new Map();
    for (const part of parts) if (part.uuid) counts.set(part.uuid,(counts.get(part.uuid) || 0) + 1);
    parts.forEach((part,index) => {
      if (part.uuid && counts.get(part.uuid) > 1) {
        part.savedUUID = part.uuid;
        part.uuid = null;
        part.id = path + '#object-' + (index+1);
        while (counts.has(part.id)) part.id += '#';
        warnings.add('Duplicate saved PCB footprint UUIDs are ambiguous; affected parts cannot be selected by UUID.');
      }
    });
  }
  const report = analytics.bom(parts);
  const result = freeze({path,sourceKind:root === 'kicad_pcb' ? 'pcb' : 'schematic', ...report, warnings:[...warnings],
    limits:'BOM counts saved file/reference identities; reused sheet instances are not expanded. Source is limited to 8 MiB and 100,000 objects; part properties are limited to 64 saved fields. CSV export is limited to 32 MiB UTF-8.'});
  bomReports.add(result);
  return result;
}
// Only reports produced here are accepted, so preflight traverses a bounded frozen shape.
export function bomToCSV(report) {
  if (!report || !bomReports.has(report)) throw new TypeError('Expected a report returned by buildBOM.');
  const encoder = new TextEncoder();
  let bytes = 0;
  const row = cells => {
    // Quoting, commas and CRLF; embedded quotes are doubled by the upstream exporter.
    bytes += cells.length * 2 + cells.length - 1 + 2;
    for (const cell of cells) {
      const text = String(cell ?? '');
      bytes += encoder.encode(text).length;
      if (/^[\s]*[=+@-]/.test(text)) bytes++;
      for (let i=0;i<text.length;i++) if (text[i] === '"') bytes++;
      if (bytes > MAX_CSV_BYTES) throw new Error('BOM CSV exceeds 32 MiB UTF-8.');
    }
  };
  row(['Reference','Value','Footprint','Population','File']);
  for (const group of report.groups) for (const part of group.parts) {
    row([part.reference || '',group.value,group.footprint,group.populated ? 'Fitted' : 'DNP',part.path]);
  }
  return analytics.csv(report);
}
