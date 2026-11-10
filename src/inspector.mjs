/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Read-only saved-object inspection; supplied connectivity is bounded and source-derived.
const MAX_PARTS = 10000, MAX_RECORDS = 100000, MAX_FIELDS = 64, MAX_RESULTS = 100, MAX_PRIMITIVES = 200000, MAX_MEMBERS = 400000;
const value = item => item && typeof item === 'object' && !Array.isArray(item) ? item.quoted : item;
const kind = node => Array.isArray(node) ? value(node[0]) : '';
const children = (node, name) => Array.isArray(node) ? node.filter(item => kind(item) === name) : [];
const child = (node, name) => children(node, name)[0];
const field = (node, name) => value(child(node, name)?.[1]);
const identity = node => String(field(node, 'uuid') || field(node, 'tstamp') || '');
const text = input => input === undefined || input === null ? '' : String(input).slice(0, 4096);
const numeric = input => { const n = Number(value(input)); return Number.isFinite(n) ? n : undefined; };
const point = (node, name = 'at') => { const form = child(node, name); if (!form) return null; const x = numeric(form[1]), y = numeric(form[2]); return x === undefined || y === undefined ? null : { x, y }; };
const savedFields = node => children(node, 'property').slice(0, MAX_FIELDS).map(item => ({ name: text(value(item[1])), value: text(value(item[2])) }));
const property = (fields, name) => fields.find(item => item.name === name)?.value || '';
const legacy = (node, name) => text(value(children(node, 'fp_text').find(item => value(item[1]) === name)?.[2]));
const dimensions = node => { const entry = child(node, 'size'); return entry ? { x: numeric(entry[1]), y: numeric(entry[2]) } : null; };
const unique = values => [...new Set(values.filter(Boolean))];

/** Build bounded lookup tables from saved identities, retaining actual rendered members. */
export function buildInspectionModel(ast, { kind: documentKind, path = '', design, connectivity } = {}) {
  const parts = [], byId = new Map(), byUuid = new Map(), primitiveByUuid = new Map(), primitiveByOwner = new Map(), warnings = [];
  if (connectivity?.warnings) warnings.push(...connectivity.warnings.slice(0, 1000));
  const candidates = new Set(); let candidateCount = 0;
  const partNodes = children(ast, documentKind === 'pcb' ? 'footprint' : 'symbol');
  for (const node of partNodes.slice(0, MAX_PARTS)) {
    if (identity(node)) candidates.add(identity(node)); candidateCount++;
    for (const form of node) if (kind(form) === 'pad' && candidateCount++ < MAX_RECORDS && identity(form)) candidates.add(identity(form));
  }
  for (const node of ast || []) if (['segment', 'arc', 'via', 'zone'].includes(kind(node)) && candidateCount++ < MAX_RECORDS && identity(node)) candidates.add(identity(node));
  for (const p of (design?.primitives || []).slice(0, MAX_PRIMITIVES)) if (p.uuid && !p.frame) candidates.add(p.uuid);
  const identityCounts = new Map([...candidates].map(uuid => [uuid, 0])), stack = Array.isArray(ast) ? [{ node: ast, index: 0 }] : [];
  while (stack.length) {
    const frame = stack.at(-1); if (frame.index >= frame.node.length) { stack.pop(); continue; }
    const form = frame.node[frame.index++]; if (!Array.isArray(form)) continue;
    if (['uuid', 'tstamp'].includes(kind(form))) { const uuid = String(value(form[1]) || ''); if (identityCounts.has(uuid)) identityCounts.set(uuid, identityCounts.get(uuid) + 1); }
    else stack.push({ node: form, index: 0 });
  }
  const ambiguous = new Set([...identityCounts].filter(([, count]) => count > 1).map(([uuid]) => uuid));
  if (ambiguous.size) warnings.push(`${ambiguous.size} duplicated saved UUIDs: ambiguous object lookup and owner-group highlighting are disabled.`);
  if (candidateCount > MAX_RECORDS || documentKind === 'manufacturing' && (design?.camLayers || []).reduce((count, layer) => count + (layer.operations?.length || 0), 0) > MAX_RECORDS)
    warnings.push('Object lookup is limited to 100,000 saved records.');
  let memberCount = 0;
  function boundedMembers(groups, owner) {
    const result = [], seen = new Set();
    for (const group of groups) for (const primitive of group) {
      if (seen.has(primitive) || owner && primitive.ownerUuid !== owner) continue;
      if (memberCount >= MAX_MEMBERS) { if (!warnings.includes('Inspection membership is limited to 400,000 geometry references.')) warnings.push('Inspection membership is limited to 400,000 geometry references.'); return result; }
      seen.add(primitive); result.push(primitive); memberCount++;
    }
    return result;
  }
  let records = 0;
  const add = record => {
    if (records++ >= MAX_RECORDS) { if (!warnings.includes('Object lookup is limited to 100,000 saved records.')) warnings.push('Object lookup is limited to 100,000 saved records.'); return record; }
    byId.set(record.id, record);
    if (record.uuid) byUuid.set(record.uuid, ambiguous.has(record.uuid) || byUuid.has(record.uuid) ? null : record);
    return record;
  };
  if ((design?.primitives?.length || 0) > MAX_PRIMITIVES) warnings.push('Inspection geometry lookup is limited to the first 200,000 primitives.');
  for (const primitive of (design?.primitives || []).slice(0, MAX_PRIMITIVES)) {
    if (primitive.frame) continue;
    if (primitive.uuid && !ambiguous.has(primitive.uuid)) { const list = primitiveByUuid.get(primitive.uuid) || []; list.push(primitive); primitiveByUuid.set(primitive.uuid, list); }
    if (primitive.ownerUuid && !ambiguous.has(primitive.ownerUuid)) { const list = primitiveByOwner.get(primitive.ownerUuid) || []; list.push(primitive); primitiveByOwner.set(primitive.ownerUuid, list); }
  }
  const netNames = new Map(children(ast, 'net').map(node => [value(node[1]), text(value(node[2]))]));
  const net = node => { const form = child(node, 'net'); if (!form) return ''; return text(value(form[2]) ?? (typeof value(form[1]) === 'string' ? value(form[1]) : netNames.get(value(form[1])))); };
  const members = uuid => uuid && !ambiguous.has(uuid) ? boundedMembers([primitiveByUuid.get(uuid) || [], primitiveByOwner.get(uuid) || []]) : [];
  if (documentKind === 'pcb' || documentKind === 'schematic') {
    const nodes = partNodes;
    if (nodes.length > MAX_PARTS) warnings.push('Part search is limited to the first 10,000 saved parts.');
    for (const [index, node] of nodes.slice(0, MAX_PARTS).entries()) {
      if (records >= MAX_RECORDS) break;
      const uuid = identity(node), fields = savedFields(node), primitives = members(uuid), at = point(node);
      const allProperties = children(node, 'property'), basic = name => text(value(allProperties.find(item => value(item[1]) === name)?.[2]));
      const part = add({ id: `${path}#${uuid || 'part-' + index}`, uuid, type: 'part', reference: basic('Reference') || legacy(node, 'reference'),
        value: basic('Value') || legacy(node, 'value'), footprint: documentKind === 'pcb' ? text(value(node[1])) : basic('Footprint'),
        schematicUuid: documentKind === 'pcb' ? text(field(node, 'path')).split('/').filter(Boolean).at(-1) || '' : '',
        symbol: documentKind === 'schematic' ? text(field(node, 'lib_id')) : '', layer: text(field(node, 'layer')), position: at,
        rotation: numeric(child(node, 'at')?.[3]), fields, primitives, pads: [], layers: unique(primitives.map(p => p.layer)), path });
      if (children(node, 'property').length > MAX_FIELDS) part.note = 'Only the first 64 saved fields are shown.';
      if (ambiguous.has(uuid)) part.note = 'Saved UUID is duplicated; part-group highlighting is disabled.';
      parts.push(part);
      if (documentKind !== 'pcb') continue;
      const pads = children(node, 'pad');
      for (const [padIndex, pad] of pads.entries()) {
        const padUuid = identity(pad), matching = padUuid && !ambiguous.has(padUuid) ? boundedMembers([primitiveByUuid.get(padUuid) || []], uuid) : [];
        const rendered = matching.find(p => p.kind === 'pad'), local = point(pad), angle = (part.rotation || 0) * Math.PI / 180;
        const world = rendered?.padCenter || (at && local ? { x: at.x + local.x * Math.cos(angle) + local.y * Math.sin(angle), y: at.y - local.x * Math.sin(angle) + local.y * Math.cos(angle) } : null);
        const drill = child(pad, 'drill'), oval = value(drill?.[1]) === 'oval';
        const record = add({ id: `${path}#${padUuid || 'pad-' + index + '-' + padIndex}`, uuid: padUuid, type: 'pad', part,
          number: text(value(pad[1])), name: text(field(pad, 'pinfunction')), pinType: text(field(pad, 'pintype')), padType: text(value(pad[2])), shape: text(value(pad[3])),
          net: net(pad), position: world, localPosition: local, rotation: numeric(child(pad, 'at')?.[3]), size: dimensions(pad),
          drill: drill ? { x: numeric(drill[oval ? 2 : 1]), y: numeric(drill[oval ? 3 : 1]) } : null,
          layers: unique(matching.map(p => p.layer).concat((child(pad, 'layers') || []).slice(1).map(item => text(value(item))))), primitives: matching, fields: savedFields(pad), path });
        part.pads.push(record);
        if (records >= MAX_RECORDS) break;
      }
    }
    for (const node of ast || []) {
      if (!['segment', 'arc', 'via', 'zone'].includes(kind(node))) continue;
      const uuid = identity(node); if (!uuid) continue;
      add({ id: `${path}#${uuid}`, uuid, type: kind(node), net: net(node), layer: text(field(node, 'layer')), layers: unique((primitiveByUuid.get(uuid) || []).map(p => p.layer)),
        position: point(node) || point(node, 'start'), end: point(node, 'end'), width: numeric(field(node, 'width')), size: numeric(field(node, 'size')), drill: numeric(field(node, 'drill')),
        primitives: primitiveByUuid.get(uuid) || [], path });
      if (records >= MAX_RECORDS) break;
    }
  } else if (documentKind === 'manufacturing') {
    cam: for (const layer of design?.camLayers || []) for (const operation of layer.operations || []) {
      if (records >= MAX_RECORDS) break cam;
      add({ id: operation.id, type: 'manufacturing', operation: operation.kind, polarity: operation.polarity, layer: layer.id,
        width: operation.width, bounds: operation.bounds, metadata: operation.metadata || {}, layers: [layer.id], primitives: [], path: layer.id });
      if (records >= MAX_RECORDS) break;
    }
  }
  function resolve(item) {
    if (!item) return null;
    const uuid = text(item.uuid || item.id), owner = text(item.ownerUuid || item.parent?.uuid);
    const direct = byUuid.get(uuid) || byId.get(uuid);
    if (direct?.type === 'pad' || direct && !['pad', 'pin', 'pin-marker', 'pin-name', 'pin-number'].includes(item.kind)) return direct;
    const part = (owner && byUuid.get(owner)) || (direct?.type === 'part' ? direct : null);
    if (part?.type === 'part' && item.pinNumber !== undefined) {
      const pads = part.pads.filter(p => p.number === String(item.pinNumber));
      if (pads.length === 1) return pads[0];
      const primitives = part.primitives.filter(p => p.pinNumber === String(item.pinNumber) && p.ownerUuid === part.uuid);
      const pin = primitives.find(p => p.kind === 'pin') || primitives[0];
      return { id: `${part.id}:pin:${item.pinNumber}`, type: 'pin', part, number: text(item.pinNumber), name: text(item.pinName || pin?.pinName), pinType: text(pin?.pinType), position: pin?.connectPoint || item.connectPoint,
        primitives, layers: [], fields: [], path };
    }
    if (part?.type === 'part') return part;
    if (direct) return direct;
    return { id: uuid, type: item.kind || item.type || 'object', reference: text(item.reference || item.ref), value: text(item.value), layer: text(item.layer),
      net: text(item.netName || item.net), number: text(item.pinNumber), name: text(item.pinName), position: item.connectPoint || null,
      layers: unique((primitiveByUuid.get(uuid) || []).map(p => p.layer)), fields: [], primitives: primitiveByUuid.get(uuid) || [], metadata: item, path };
  }
  const nets = new Map();
  if (documentKind === 'pcb') for (const record of byId.values()) if (record.net && record.primitives?.length) {
    const group = nets.get(record.net) || { name: record.net, primitives: [] }; for (const primitive of record.primitives) group.primitives.push(primitive); nets.set(record.net, group);
  }
  const allowed = new Set((design?.primitives || []).slice(0, MAX_PRIMITIVES));
  const groups = connectivity ? connectivity.nets.slice(0, MAX_RECORDS).map(net => ({ ...net, name: net.displayName || net.name, type: 'net', net: net.displayName || net.name,
    primitives: net.primitives.filter(p => allowed.has(p) && !ambiguous.has(p.uuid)), layers: unique(net.primitives.map(p => p.layer)), fields: [], path })) : [...nets.values()].map((net, i) => ({ ...net, id: path + '#net-' + i, type: 'net', net: net.name, layers: unique(net.primitives.map(p => p.layer)), fields: [], path }));
  const byPrimitiveNet = new Map();
  for (const group of groups) for (const primitive of group.primitives) byPrimitiveNet.set(primitive, byPrimitiveNet.has(primitive) && byPrimitiveNet.get(primitive) !== group ? null : group);
  const netFor = record => { const found = new Set((record?.primitives || []).map(p => byPrimitiveNet.get(p)).filter(Boolean)); return found.size === 1 ? [...found][0] : null; };
  return { parts, warnings, nets: groups, netFor, resolve, find: id => byId.get(id) || byUuid.get(id) || null };
}

const numberText = n => Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '';
const pointText = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) ? `${numberText(p.x)}, ${numberText(p.y)} mm` : '';
const sizeText = size => size && Number.isFinite(size.x) && Number.isFinite(size.y) ? `${numberText(size.x)} × ${numberText(size.y)} mm` : '';
function metadataFields(metadata, prefix = '', depth = 0, fields = []) {
  if (!metadata || depth > 3 || fields.length >= MAX_FIELDS) return fields;
  for (const [key, value] of Object.entries(metadata)) {
    if (fields.length >= MAX_FIELDS) break;
    const name = prefix ? `${prefix} · ${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) metadataFields(value, name, depth + 1, fields);
    else if (value !== undefined && value !== null) fields.push({ name: text(name), value: text(Array.isArray(value) ? value.join(', ') : value) });
  }
  return fields;
}
export function inspectionFields(record) {
  if (!record) return [];
  const rows = [], add = (name, value) => { if (value !== '' && value !== undefined && value !== null) rows.push({ name, value: text(value) }); };
  const part = record.type === 'part' ? record : record.part;
  if (part) { add('Reference', part.reference); add('Value', part.value); add('Footprint', part.footprint); add('Symbol', part.symbol); }
  if (['pad', 'pin'].includes(record.type)) {
    add(record.type === 'pad' ? 'Pad number' : 'Pin number', record.number); add('Pin name', record.name); add('Pin type', record.pinType);
    add('Pad type', record.padType); add('Shape', record.shape); add('Size', sizeText(record.size)); add('Drill size', sizeText(record.drill));
  }
  add('Net', record.net); if (record.type === 'net') add('Objects', record.primitives.length); add('Layer', record.layer); add('Position', pointText(record.position)); add('End position', pointText(record.end));
  if (record.rotation !== undefined) add(record.type === 'pad' ? 'Saved pad angle' : 'Rotation', `${numberText(record.rotation)}°`);
  if (typeof record.width === 'number') add('Width', `${numberText(record.width)} mm`);
  if (typeof record.size === 'number') add('Diameter', `${numberText(record.size)} mm`);
  if (typeof record.drill === 'number') add('Drill', `${numberText(record.drill)} mm`);
  if (record.type === 'manufacturing') {
    add('Operation', record.operation); add('Polarity', record.polarity);
    if (record.bounds) { add('Bounds origin', pointText(record.bounds)); add('Bounds size', sizeText({ x: record.bounds.w, y: record.bounds.h })); }
    rows.push(...metadataFields(record.metadata));
  }
  add('Source', record.path); add('Saved UUID', record.uuid); return rows;
}

const STYLE = `
.viewer-inspector{position:absolute;z-index:9;top:58px;right:10px;bottom:10px;width:310px;max-width:calc(100% - 20px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--viewer-border);border-radius:12px;background:var(--viewer-bar);color:var(--viewer-ink);box-shadow:var(--viewer-shadow);font:12px/1.45 system-ui}
.viewer-inspector[hidden]{display:none!important}.inspector-heading{display:flex;align-items:center;gap:6px;padding:12px 12px 10px;border-bottom:1px solid var(--viewer-border)}.inspector-heading>span{min-width:0;flex:1}.inspector-heading small{display:block;color:var(--viewer-muted);font:700 9px/1.4 system-ui;letter-spacing:.1em}.inspector-heading strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.viewer-inspector button{border:1px solid transparent;border-radius:5px;background:transparent;color:var(--viewer-muted);font:600 11px system-ui;padding:5px 7px;cursor:pointer}.viewer-inspector button:hover{background:var(--viewer-hover);color:var(--viewer-ink)}.viewer-inspector button:disabled{opacity:.4;cursor:default}.viewer-inspector button:focus-visible,.viewer-inspector input:focus-visible{outline:2px solid var(--viewer-accent);outline-offset:2px}
.inspector-tabs{display:flex;gap:3px;padding:6px 10px;background:var(--viewer-bg);border-bottom:1px solid var(--viewer-border)}.inspector-tabs button{flex:1;min-height:29px}.inspector-tabs button[aria-selected=true]{background:var(--viewer-bar);color:var(--viewer-accent);box-shadow:0 1px 3px #0001}.inspector-body{overflow:auto;flex:1;min-height:0;padding:12px}.inspector-body[hidden]{display:none}.inspector-fields{display:grid;grid-template-columns:minmax(65px,auto) minmax(0,1fr);gap:7px 14px;margin:0}.inspector-fields dt{color:var(--viewer-muted);font-size:10px}.inspector-fields dd{margin:0;overflow-wrap:anywhere;font-size:11px;font-variant-numeric:tabular-nums;white-space:pre-wrap}.inspector-section{margin:16px 0 8px;color:var(--viewer-muted);font-size:9px;letter-spacing:.07em;text-transform:uppercase}.inspector-help{margin:0 0 10px;color:var(--viewer-muted);font-size:11px;line-height:1.6}.inspector-search{width:100%;margin:0 0 10px;padding:8px 9px;border:1px solid var(--viewer-border);border-radius:7px;background:var(--viewer-bg);color:var(--viewer-ink);font:12px system-ui}.inspector-results{display:flex;flex-direction:column;gap:3px}.inspector-results button{display:block;width:100%;text-align:left;border:1px solid var(--viewer-border);padding:8px}.inspector-results button strong{color:var(--viewer-ink);font-size:12px}.inspector-results button small{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px/1.4 system-ui}.inspector-pad-list{display:flex;flex-wrap:wrap;gap:4px}.inspector-pad-list button{border-color:var(--viewer-border);font-variant-numeric:tabular-nums}.inspector-layers{display:flex;flex-direction:column;gap:5px}.inspector-layers label{display:flex;align-items:center;gap:6px;font:11px system-ui}.inspector-layers input{accent-color:var(--viewer-accent)}.inspector-footer{border-top:1px solid var(--viewer-border);padding:7px 12px;color:var(--viewer-muted);font-size:9px;letter-spacing:.02em}
@container (max-width:580px){.viewer-inspector{width:min(340px,calc(100% - 20px));max-height:calc(100% - 68px);bottom:10px;top:auto}.inspector-body{max-height:52vh}.inspector-heading{padding:10px 12px}.inspector-fields{gap:6px 10px}}
@container (max-width:580px){.viewer-inspector{top:auto;bottom:8px;right:8px;width:calc(100% - 16px);max-width:none;max-height:min(65%,calc(100% - var(--viewer-toolbar-height,96px) - 16px));overflow:auto;overscroll-behavior:contain}.inspector-body{flex:1 0 120px;min-height:120px;max-height:none;overscroll-behavior:contain}.inspector-search{font-size:16px;min-height:44px}.viewer-inspector button{min-height:40px}.inspector-heading{flex-shrink:0}.inspector-tabs,.inspector-footer{flex-shrink:0}.inspector-footer label{display:flex;align-items:center;gap:7px;min-height:36px}.inspector-footer input{width:18px;height:18px}.inspector-fields{grid-template-columns:minmax(65px,auto) minmax(0,1fr)}}
@media(pointer:coarse){.viewer-inspector button{min-height:44px}.inspector-layers label{min-height:44px}.inspector-layers input{width:20px;height:20px}.inspector-footer label{min-height:40px}}
`;

/** All design-origin text is written with textContent, including field names. */
export function createInspector(viewer) {
  const doc = viewer.host.ownerDocument, make = (tag, className, value) => { const node = doc.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; };
  const style = make('style', '', STYLE), panel = make('aside', 'viewer-inspector'); panel.hidden = true; panel.setAttribute('aria-label', 'Drawing inspector');
  const heading = make('header', 'inspector-heading'), identity = make('span'), eyebrow = make('small', '', 'INSPECT'), title = make('strong', '', 'Properties'); identity.append(eyebrow, title);
  const button = (label, action) => { const node = make('button', '', label); node.type = 'button'; node.title = label; node.setAttribute('aria-label', label); node.onclick = action; return node; };
  const clearButton = button('Clear selection', () => viewer.clearSelection()), closeButton = button('Close inspector', () => toggle(false));
  closeButton.textContent = '×'; heading.append(identity, clearButton, closeButton);
  const tabs = make('div', 'inspector-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Inspection sections');
  const propertiesTab = button('Properties', () => setTab('properties')), partsTab = button('Parts', () => setTab('parts'));
  propertiesTab.setAttribute('role', 'tab'); partsTab.setAttribute('role', 'tab'); const netsTab = button('Nets', () => setTab('nets')); netsTab.setAttribute('role', 'tab'); tabs.append(propertiesTab, partsTab, netsTab);
  const properties = make('section', 'inspector-body'), partsPanel = make('section', 'inspector-body');
  const search = make('input', 'inspector-search'); search.type = 'search'; search.placeholder = 'Find reference, value or footprint'; search.setAttribute('aria-label', 'Find a part');
  const resultCount = make('p', 'inspector-help'), results = make('div', 'inspector-results'); resultCount.setAttribute('role', 'status'); partsPanel.append(search, resultCount, results);
  const netsPanel = make('section', 'inspector-body'), netSearch = make('input', 'inspector-search'), netCount = make('p', 'inspector-help'), netResults = make('div', 'inspector-results');
  netSearch.type = 'search'; netSearch.placeholder = 'Find net name'; netSearch.setAttribute('aria-label', 'Find a net'); netsPanel.append(netSearch, netCount, netResults);
  const footer = make('footer', 'inspector-footer'), labels = make('label'), labelToggle = make('input'); labelToggle.type = 'checkbox'; labelToggle.setAttribute('aria-label', 'Show saved PCB pad and net labels');
  labelToggle.disabled = true;
  labels.title = 'Saved PCB net and pad names appear at close zoom.'; labels.append(labelToggle, make('span', '', 'Pad / net labels at close zoom'));
  const netLabel = make('label'), netToggle = make('input'); netToggle.type = 'checkbox'; netToggle.checked = true; netToggle.setAttribute('aria-label', 'Highlight entire net on selection'); netLabel.append(netToggle, make('span', '', 'Highlight entire net'));
  const autoLabel=make('label'),autoInspect=make('input');autoInspect.type='checkbox';autoInspect.checked=viewer.inspectOnSelect!==false;autoInspect.setAttribute('aria-label','Open properties on selection');autoInspect.onchange=()=>viewer.setInspectOnSelect(autoInspect.checked);autoLabel.append(autoInspect,make('span','','Open properties on selection'));
  footer.append(autoLabel, netLabel, labels, make('div', '', 'READ ONLY · Saved source properties')); panel.append(heading, tabs, properties, partsPanel, netsPanel, footer);
  let model = buildInspectionModel(null, {}), selected = null, activeTab = 'properties', open = false, labelsEnabled = false, layerSignature = '', layerRecords = [];
  function toggle(enabled = !open) { open = Boolean(enabled); panel.hidden = !open; viewer.inspectorButton?.setAttribute('aria-expanded', String(open)); }
  function setTab(name) { activeTab = name; properties.hidden = name !== 'properties'; partsPanel.hidden = name !== 'parts'; netsPanel.hidden = name !== 'nets'; netsTab.setAttribute('aria-selected', String(name === 'nets')); propertiesTab.setAttribute('aria-selected', String(name === 'properties')); partsTab.setAttribute('aria-selected', String(name === 'parts')); }
  function section(name) { properties.append(make('h3', 'inspector-section', name)); }
  function renderFields(fields) { const list = make('dl', 'inspector-fields'); for (const row of fields.slice(0, 128)) list.append(make('dt', '', row.name), make('dd', '', row.value)); properties.append(list); }
  function renderProperties() {
    api.layerSection = null; layerSignature = ''; layerRecords = [];
    properties.replaceChildren(); clearButton.disabled = !selected;
    title.textContent = selected ? selected.type === 'pad' || selected.type === 'pin' ? `${selected.part?.reference || ''} ${selected.type} ${selected.number}`.trim() : selected.reference || selected.part?.reference || selected.operation || selected.type : 'Properties';
    if (!selected) { properties.append(make('p', 'inspector-help', 'Select an object in the drawing to inspect its saved properties, or use Parts to find a component.')); return; }
    const selectedNet = model.netFor(selected);
    if (selectedNet && !selected.net) selected = { ...selected, net: selectedNet.name };
    title.textContent = selected.type === 'net' ? 'Net · ' + selected.name : ['segment', 'arc', 'via', 'zone'].includes(selected.type) ? (selected.type === 'segment' ? 'Track' : selected.type) + (selected.net ? ' · ' + selected.net : '') : title.textContent;
    renderFields(inspectionFields(selected));
    if (selectedNet && selected.type !== 'net') properties.append(button('Highlight net ' + selectedNet.name, () => selectNet(selectedNet.id, { locate: false })));
    const part = selected.type === 'part' ? selected : selected.part;
    if (part) {
      if (selected.type !== 'part') properties.append(button(viewer.view === '3d' ? 'Highlight part and pads' : 'Locate part and pads', () => selectRecord(part, true)));
      const fields = part.fields.filter(field => !['Reference', 'Value', 'Footprint'].includes(field.name));
      if (fields.length) { section('Supplied fields'); renderFields(fields); }
      if (part.note) properties.append(make('p', 'inspector-help', part.note));
      if (part.pads.length) {
        section(`Pads · ${part.pads.length}`); const pads = make('div', 'inspector-pad-list');
        for (const pad of part.pads.slice(0, 100)) { const node = button(`Pad ${pad.number}${pad.net ? ' · ' + pad.net : ''}`, () => selectRecord(pad, true)); node.disabled = !pad.primitives.length; pads.append(node); }
        properties.append(pads); if (part.pads.length > 100) properties.append(make('p', 'inspector-help', 'Showing the first 100 pads.'));
      }
    }
    refreshLayers();
  }
  function refreshLayers() {
    if (!selected) return;
    const known = viewer.getLayers(), layers = unique((selected.layers || []).concat(selected.part?.layers || []));
    const signature = viewer.view + '|' + layers.join('\0');
    if (signature === layerSignature && api.layerSection) { for (const { layer, input } of layerRecords) input.checked = viewer.renderer?.visibleLayers?.has(layer) || false; return; }
    if (api.layerSection) api.layerSection.remove();
    api.layerSection = null; layerRecords = []; layerSignature = signature;
    if (!layers.length) return;
    const area = make('div'), label = make('h3', 'inspector-section', 'Object layers'), list = make('div', 'inspector-layers');
    for (const layer of layers) {
      const row = make('label'), input = make('input'); input.type = 'checkbox'; input.checked = viewer.renderer?.visibleLayers?.has(layer) || false;
      input.disabled = !['pcb', 'manufacturing'].includes(viewer.view) || !known.includes(layer); input.setAttribute('aria-label', `Show layer ${layer}`);
      layerRecords.push({ layer, input });
      input.onchange = () => { const enabled = new Set(viewer.renderer.visibleLayers); if (input.checked) enabled.add(layer); else enabled.delete(layer); viewer.setLayers([...enabled]); };
      row.append(input, make('span', '', layer)); list.append(row);
    }
    area.append(label, list); properties.append(area); api.layerSection = area;
  }
  function updateResults() {
    const query = search.value?.trim().toLowerCase().slice(0, 200) || '', matches = model.parts.filter(part => `${part.reference}\n${part.value}\n${part.footprint}`.toLowerCase().includes(query));
    resultCount.textContent = `${matches.length} ${matches.length === 1 ? 'part' : 'parts'}${matches.length > MAX_RESULTS ? ' · showing first 100' : ''}${model.warnings.length ? ' · bounded source index' : ''}`;
    results.replaceChildren(...matches.slice(0, MAX_RESULTS).map(part => {
      const node = button(`Select ${part.reference || part.uuid || 'part'}`, () => selectRecord(part, true)); node.replaceChildren(make('strong', '', part.reference || 'Unreferenced part'), make('small', '', [part.value, part.footprint].filter(Boolean).join(' · ')));
      node.disabled = !part.uuid || !part.primitives.length || model.find(part.uuid) !== part; return node;
    }));
    if (!model.parts.length) resultCount.textContent = viewer.kind === 'manufacturing' ? 'CAM files contain manufacturing objects, not a component list.' : 'No saved parts are available in this drawing.';
  }
  function highlight(record, locate = false) {
    const owner = record?.part || record;
    const net = record?.type === 'net' ? record : netToggle.checked && record?.type !== 'part' ? model.netFor(record) : null;
    const primitives = net?.primitives || (record?.type === 'pad' || record?.type === 'pin' ? record.primitives : owner?.primitives) || [];
    if (viewer.view === '3d') { if(viewer.renderer?.setSelectionStyle)viewer.renderer.setSelectionStyle({mode:viewer.highlightMode||'dim',color:viewer.highlightColor||'accent'});else viewer.renderer?.setSelectionDim?.(viewer.highlightMode!=='bright'); viewer.renderer?.setSelection?.(net ? { netNames: [net.name] } : record ? { uuids: unique([model.find(owner.uuid) === owner ? owner.uuid : '', ...(owner.pads || []).filter(pad => model.find(pad.uuid) === pad).map(pad => pad.uuid), model.find(record.uuid) === record ? record.uuid : '']) } : {}); if (locate && owner?.type === 'part' && model.find(owner.uuid) === owner) viewer.renderer?.focusPart?.(owner.uuid); return; }
    if (viewer.view === 'manufacturing') return;
    viewer.renderer?.setNetHighlight?.(record && primitives.length ? { primitives } : null, { mode: viewer.highlightMode||'dim', selectionColor: viewer.highlightColor||'accent' });
    if (locate && record?.primitives?.length && viewer.renderer?.viewport?.camera) {
      const bounds = globalThis.KiCadOwnedCanvas?.bounds(record.primitives); if (bounds) { const margin = Math.max(1, Math.max(bounds.w, bounds.h) * 0.15); viewer.renderer.viewport.camera.bbox = { x: bounds.x - margin, y: bounds.y - margin, w: Math.max(bounds.w, 1) + margin * 2, h: Math.max(bounds.h, 1) + margin * 2 }; }
    }
    viewer.renderer?.draw?.();
  }
  function selectRecord(record, locate = false) {
    if (!record) return false;
    if (viewer.view === '3d') { select({ uuid: record.uuid, ownerUuid: record.part?.uuid, kind: record.type, pinNumber: record.number }, { locate }); viewer.emit('select', { item: { uuid: record.uuid, ownerUuid: record.part?.uuid, reference: record.reference || record.part?.reference, kind: record.type }, path: viewer.path, view: viewer.view }); return true; }
    const primitive = record.primitives?.find(p => !p.hidden && p.kind !== 'drill') || record.primitives?.[0];
    if (!primitive) return false;
    if (locate) highlight(record, true);
    const context = { uuid: record.uuid, ownerUuid: record.part?.uuid, reference: record.reference || record.part?.reference, kind: record.type, pinNumber: record.number };
    if (viewer.renderer?.select) viewer.renderer.select({ primitive, context }); else viewer.handleSelection({ item: context });
    return true;
  }
  function selectNet(id, { locate = false } = {}) {
    const exact = model.nets.find(net => net.id === id), names = model.nets.filter(net => net.name === id), net = exact || (names.length === 1 ? names[0] : null);
    if (!net?.primitives.length || !['pcb', 'schematic', '3d'].includes(viewer.view)) return false;
    selected = net; viewer.renderer.selected = null; highlight(net, locate); renderProperties(); if(viewer.inspectOnSelect!==false){setTab('properties');toggle(true);}
    viewer.emit('select', { item: { kind: 'net', id: net.id, netName: net.name }, path: viewer.path, view: viewer.view }); return true;
  }
  function updateNetResults() {
    const query = netSearch.value?.trim().toLowerCase().slice(0, 200) || '', found = model.nets.filter(net => net.name.toLowerCase().includes(query));
    netCount.textContent = found.length + ' nets' + (found.length > MAX_RESULTS ? ' · showing first 100' : '') + (viewer.kind === 'schematic' ? ' · per-file saved connectivity' : '');
    netResults.replaceChildren(...found.slice(0, MAX_RESULTS).map(net => { const node = button('Select net ' + net.name, () => selectNet(net.id, { locate: true })); node.disabled = !net.primitives.length; return node; }));
  }
  function select(item, { locate = true } = {}) { selected = model.resolve(item); highlight(selected, locate && viewer.view === '3d'); renderProperties(); if (selected && viewer.inspectOnSelect !== false) { setTab('properties'); toggle(true); } }
  const escape = event => { if (event.key === 'Escape' && open) { toggle(false); viewer.inspectorButton?.focus?.(); } };
  viewer.surface.addEventListener?.('keydown', escape);
  search.oninput = updateResults; netSearch.oninput = updateNetResults; netToggle.onchange = () => highlight(selected);
  function syncRenderer() {
    highlight(selected);
    updateNetResults();
    netToggle.disabled = !['pcb', 'schematic', '3d'].includes(viewer.view);
    labelToggle.disabled = viewer.view !== 'pcb' || typeof viewer.renderer?.setNetNames !== 'function';
    labelToggle.checked = labelsEnabled && !labelToggle.disabled;
    if (!labelToggle.disabled) { viewer.renderer.setNetNames(model.nets); viewer.renderer.showNetNames = labelsEnabled; viewer.renderer.draw?.(); }
  }
  labelToggle.onchange = () => { labelsEnabled = labelToggle.checked; syncRenderer(); };
  const api = { style, panel, search, results, resultCount, clearButton, closeButton, propertiesTab, partsTab, properties, partsPanel, netsTab, netSearch, netResults, netToggle, layerSection: null,
    toggle, select, refreshLayers, syncRenderer, labelToggle, autoInspect, refreshHighlight() {highlight(selected);},
    setModel(value) { model = value; selected = null; search.value = ''; netSearch.value = ''; updateResults(); updateNetResults(); renderProperties(); },
    resetSelection() { selected = null; renderProperties(); },
    getSelectionPosition() {const p=selected?.position;if(!p||![p.x,p.y].every(Number.isFinite))return null;const q=selected.type==='segment'?selected.end:null;return {x:q&&Number.isFinite(q.x)?(p.x+q.x)/2:p.x,y:q&&Number.isFinite(q.y)?(p.y+q.y)/2:p.y,layer:selected.layer||selected.layers?.find(l=>/^(F|B|In\d+)\.Cu$/.test(l))||null};},
    getSelection() {if(!selected)return null;const net=selected.type==='net'?selected:model.netFor(selected);return {kind:selected.type,...(selected.uuid?{uuid:selected.uuid}:{}),...(selected.id?{id:selected.id}:{}),...(selected.part?.uuid?{ownerUuid:selected.part.uuid}:{}),...(net?.name||selected.net?{netName:net?.name||selected.net}:{}),...(['pad','pin'].includes(selected.type)?{pinNumber:selected.number}:{})};},
    selectObject(id,{locate=false,pinNumber}={}){let record=model.find(id);if(record?.type==='part'&&pinNumber!==undefined)record=model.resolve({uuid:record.uuid,ownerUuid:record.uuid,kind:'pin',pinNumber});return record?selectRecord(record,locate):false;},
    getParts() { return model.parts.map(part => ({ id: part.id, uuid: part.uuid, reference: part.reference, value: part.value, footprint: part.footprint, layer: part.layer, schematicUuid: part.schematicUuid })); },
    selectPart(id, { locate = true } = {}) { const part = model.find(id); return part?.type === 'part' && part.uuid && model.find(part.uuid) === part ? selectRecord(part, locate) : false; },
    getNets() { return model.nets.map(net => ({ id: net.id, name: net.name, layers: [...net.layers], count: net.primitives.length })); },
    selectNet,
    isOpen() { return open; },
    getWarnings() { return [...(model?.warnings || [])]; },
    dispose() { viewer.surface.removeEventListener?.('keydown', escape); search.oninput = netSearch.oninput = netToggle.onchange = labelToggle.onchange = autoInspect.onchange = null; for (const node of [clearButton, closeButton, propertiesTab, partsTab, netsTab]) node.onclick = null; model = null; selected = null; panel.remove(); },
  };
  setTab(activeTab); renderProperties(); updateResults(); return api;
}
