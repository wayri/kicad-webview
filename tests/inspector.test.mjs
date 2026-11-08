import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KiCadViewer } from '../src/kicad-viewer.mjs';
import { buildInspectionModel, inspectionFields, createInspector } from '../src/inspector.mjs';

const board = `(kicad_pcb (version 20240108) (generator pcbnew)
 (general (thickness 1.6)) (paper "A4")
 (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (net 1 "GND")
 (footprint "Test:QFN" (layer "F.Cu") (at 10 20 90) (uuid "part-a")
  (property "Reference" "U1") (property "Value" "Driver") (property "MPN" "<img src=x onerror=alert(1)>")
  (pad "1" thru_hole circle (at 2 0) (size 2 1) (drill 0.5) (layers "*.Cu" "*.Mask") (net 1 "GND") (pinfunction "OUT") (pintype "output") (uuid "pad-a"))))
`;
// The intentionally tiny authored fixture is assembled below to keep source identity clear.
const pcb = board.trim().slice(0, -1) + `
 (footprint "Test:Other" (layer "B.Cu") (at 30 40) (uuid "part-b")
  (property "Reference" "U1") (property "Value" "Other")
  (pad "2" smd rect (at 0 0) (size 1 1) (layers "B.Cu") (net 1 "GND") (uuid "pad-b")))
 (segment (start 0 0) (end 5 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "track-a")))`;
function parsed(source = pcb) {
  const ast = globalThis.KiCadDesignDiff.parse(source), design = globalThis.KiCadPCBRenderer.build(ast, 'board.kicad_pcb');
  return { ast, design, model: buildInspectionModel(ast, { kind: 'pcb', path: 'board.kicad_pcb', design }) };
}
const row = (record, label) => inspectionFields(record).find(field => field.name === label)?.value;

test('saved PCB source exposes exact component, pad and track properties without net reconstruction', () => {
  const { model } = parsed();
  assert.equal(model.parts.length, 2);
  const part = model.find('part-a'), pad = model.resolve({ uuid: 'pad-a', ownerUuid: 'part-a', kind: 'pad' });
  assert.equal(part.reference, 'U1'); assert.equal(part.value, 'Driver'); assert.equal(part.footprint, 'Test:QFN');
  assert.equal(part.fields.find(field => field.name === 'MPN').value, '<img src=x onerror=alert(1)>');
  assert.equal(pad.part, part); assert.equal(pad.number, '1'); assert.equal(pad.name, 'OUT'); assert.equal(pad.net, 'GND');
  assert.deepEqual(pad.position, { x: 10, y: 18 });
  assert.equal(row(pad, 'Size'), '2 × 1 mm'); assert.equal(row(pad, 'Drill size'), '0.5 × 0.5 mm');
  assert.equal(row(model.resolve({ uuid: 'track-a', kind: 'track' }), 'Net'), 'GND');
  assert.equal(row(model.find('track-a'), 'Width'), '0.25 mm');
  assert.ok(model.nets.find(net => net.name === 'GND').primitives.length > 0);
});

test('identical references stay independent and ambiguous saved UUIDs never select another component', () => {
  const { model } = parsed();
  assert.notEqual(model.find('part-a'), model.find('part-b'));
  assert.ok(model.find('part-a').primitives.every(p => p.ownerUuid === 'part-a' || p.uuid === 'part-a'));
  assert.equal(model.resolve({ reference: 'U1', kind: 'unknown' }).primitives.length, 0);
  const duplicate = parsed(pcb.replace('(uuid "part-b")', '(uuid "part-a")')).model;
  assert.equal(duplicate.find('part-a'), null);
  assert.deepEqual(duplicate.resolve({ uuid: 'pad-a', ownerUuid: 'part-a', kind: 'pad' }).part.primitives, []);
  assert.match(duplicate.warnings.join(' '), /duplicated saved UUIDs/);
});

test('duplicate owner stress quarantines groups before copying cross-object memberships', () => {
  const nodes = Array.from({ length: 1000 }, (_, i) => ['footprint', { quoted: 'Test:Part' }, ['uuid', 'duplicated'], ['pad', { quoted: '1' }, 'smd', 'circle', ['uuid', 'pad-' + i]]]);
  const primitives = nodes.map((_, i) => ({ uuid: 'pad-' + i, ownerUuid: 'duplicated', kind: 'pad' }));
  const model = buildInspectionModel(['kicad_pcb', ...nodes], { kind: 'pcb', design: { primitives } });
  assert.equal(model.parts.reduce((count, part) => count + part.primitives.length, 0), 0);
  assert.ok(model.parts.every(part => part.pads.every(pad => pad.primitives.length <= 1)));
  assert.match(model.warnings.join(' '), /group highlighting are disabled/);
});

test('schematic terminal metadata uses real owner/pin geometry and never invents a net', () => {
  const ast = globalThis.KiCadDesignDiff.parse('(kicad_sch (symbol (uuid "symbol-a") (lib_id "Test:Part") (at 10 20) (property "Reference" "U4") (property "Value" "Amp") (property "Footprint" "Test:SOIC")))');
  const pin = { uuid: 'symbol-a', ownerUuid: 'symbol-a', kind: 'pin', pinNumber: '2', pinName: 'OUT', pinType: 'output', connectPoint: { x: 12, y: 20 } };
  const model = buildInspectionModel(ast, { kind: 'schematic', path: 'sheet.kicad_sch', design: { primitives: [pin] } });
  const selected = model.resolve({ uuid: 'symbol-a', ownerUuid: 'symbol-a', kind: 'pin', pinNumber: '2' });
  assert.equal(selected.type, 'pin'); assert.equal(selected.name, 'OUT'); assert.deepEqual(selected.position, pin.connectPoint);
  assert.equal(row(selected, 'Footprint'), 'Test:SOIC'); assert.equal(row(selected, 'Net'), undefined); assert.deepEqual(model.nets, []);
});

test('CAM inspection retains operation polarity, tool/aperture identity and supplied attributes', () => {
  const operation = { id: 'copper:12', kind: 'stroke', polarity: 'clear', width: 0.25, bounds: { x: 1, y: 2, w: 3, h: 4 }, metadata: { aperture: 12, tool: 3, diameter: 0.8, apertureAttributes: { '.AperFunction': ['ComponentPad'] }, objectAttributes: { '.N': ['GND'] } } };
  const model = buildInspectionModel(null, { kind: 'manufacturing', design: { camLayers: [{ id: 'top.gtl', operations: [operation] }] } });
  const selected = model.resolve({ id: 'copper:12', kind: 'gerber' }), fields = inspectionFields(selected);
  assert.equal(row(selected, 'Polarity'), 'clear'); assert.equal(row(selected, 'Bounds origin'), '1, 2 mm');
  assert.equal(fields.find(f => f.name === 'aperture').value, '12');
  assert.equal(fields.find(f => f.name === 'tool').value, '3');
  assert.equal(fields.find(f => f.name === 'apertureAttributes · .AperFunction').value, 'ComponentPad');
  assert.equal(fields.find(f => f.name === 'objectAttributes · .N').value, 'GND');
});

class Element extends EventTarget {
  constructor(doc) { super(); this.ownerDocument = doc; this.style = {}; this.children = []; this.attributes = {}; this.textContent = ''; }
  append(...children) { for (const node of children) { this.children.push(node); node.parentNode = this; } }
  replaceChildren(...children) { for (const node of this.children) node.parentNode = null; this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  focus() { this.focused = true; }
}
function document() { const doc = { baseURI: 'https://example.test/', createElement: () => new Element(doc) }; return doc; }
const originalMount = globalThis.KiCadOwnedCanvas.mount;
globalThis.KiCadOwnedCanvas.mount = (host, options) => Object.assign(new EventTarget(), { options, viewport: { camera: {} },
  setDocument(design) { this.design = design; this.visibleLayers = new Set(design.layers); }, draw() {}, zoom_to_board() {},
  setNetNames(nets) { this.netNames = nets; }, setNetHighlight(net) { this.highlight = net; },
  select(hit) { this.selected = hit?.primitive || null; this.dispatchEvent(new CustomEvent('kicad:select', { detail: { item: hit?.context || null } })); },
  dispose() { this.disposed = true; },
});
test.after(() => { globalThis.KiCadOwnedCanvas.mount = originalMount; delete globalThis.SpikeBoard3D; });
function fixture() { const doc = document(), host = new Element(doc), viewer = new KiCadViewer(host); return { doc, host, viewer }; }
function nodes(root) { return [root, ...root.children.flatMap(nodes)]; }

test('selection opens safe properties, groups the real part and pads, and clear/Escape preserve lifecycle', async () => {
  const { viewer } = fixture();
  assert.equal(viewer.inspector.panel.hidden, true);
  await viewer.loadSource(pcb, { path: 'board.kicad_pcb' });
  assert.equal(viewer.getParts().length, 2); assert.equal(viewer.selectPart('part-a'), true);
  assert.equal(viewer.inspector.panel.hidden, false); assert.equal(viewer.inspectorButton.getAttribute('aria-expanded'), 'true');
  assert.ok(viewer.renderer.highlight.primitives.every(p => p.ownerUuid === 'part-a' || p.uuid === 'part-a'));
  assert.ok(viewer.renderer.viewport.camera.bbox.w > 0);
  const unsafe = nodes(viewer.inspector.panel).find(node => node.textContent === '<img src=x onerror=alert(1)>');
  assert.ok(unsafe); assert.equal(unsafe.innerHTML, undefined);
  const layerCheckbox = viewer.inspector.layerSection.children[1].children[0].children[0];
  layerCheckbox.checked = false; layerCheckbox.onchange();
  assert.equal(viewer.inspector.layerSection.children[1].children[0].children[0], layerCheckbox);
  viewer.clearSelection(); assert.equal(viewer.renderer.selected, null); assert.equal(viewer.renderer.highlight, null);
  assert.equal(viewer.inspector.clearButton.disabled, true);
  viewer.setInspectorOpen(true);
  const event = new Event('keydown'); Object.defineProperty(event, 'key', { value: 'Escape' }); viewer.surface.dispatchEvent(event);
  assert.equal(viewer.inspector.panel.hidden, true); assert.equal(viewer.inspectorButton.focused, true);
  viewer.dispose(); assert.equal(viewer.inspector.panel.removed, true); assert.equal(viewer.inspector.search.oninput, null);
  assert.throws(() => viewer.selectPart('part-a'), /disposed/);
});

test('parts search is bounded and highlights the UUID-selected result instead of a matching reference', () => {
  const doc = document(), host = new Element(doc), surface = new Element(doc);
  const components = Array.from({ length: 150 }, (_, i) => ['footprint', { quoted: 'Test:Part' }, ['uuid', 'part-' + i], ['property', { quoted: 'Reference' }, { quoted: 'R' + i }], ['property', { quoted: 'Value' }, { quoted: '10k' }]]);
  const primitives = components.map((node, i) => ({ uuid: 'part-' + i, ownerUuid: 'part-' + i, kind: 'footprint-hit' }));
  const model = buildInspectionModel(['kicad_pcb', ...components], { kind: 'pcb', design: { primitives } });
  const viewer = { host, surface, kind: 'pcb', view: 'pcb', path: 'board', renderer: { setNetHighlight() {}, draw() {}, select(hit) { viewer.selection = hit.context; } }, getLayers: () => [], clearSelection() {} };
  const inspector = createInspector(viewer); inspector.setModel(model);
  assert.equal(inspector.results.children.length, 100); assert.match(inspector.resultCount.textContent, /150 parts.*first 100/);
  inspector.search.value = 'R149'; inspector.search.oninput(); assert.equal(inspector.results.children.length, 1);
  inspector.results.children[0].onclick(); assert.equal(viewer.selection.uuid, 'part-149');
  inspector.dispose();
});

test('existing PCB label overlays use saved nets only, layer filters remain read-only until toggled', async () => {
  const { viewer } = fixture(); await viewer.loadSource(pcb);
  assert.equal(viewer.inspector.labelToggle.disabled, false);
  viewer.inspector.labelToggle.checked = true; viewer.inspector.labelToggle.onchange();
  assert.equal(viewer.renderer.showNetNames, true); assert.ok(viewer.renderer.netNames.every(net => net.name === 'GND'));
  const visible = [...viewer.renderer.visibleLayers]; viewer.chrome.layerFilter.value = 'F.Cu'; viewer.chrome.layerFilter.oninput();
  assert.equal(viewer.layerList.children.find(label => label.title === 'F.Cu').hidden, false);
  assert.equal(viewer.layerList.children.find(label => label.title === 'B.Cu').hidden, true);
  assert.deepEqual([...viewer.renderer.visibleLayers], visible);
  viewer.dispose();
});

test('3D inspection requests UUID groups and suppresses duplicate internal inspector UI', async () => {
  const { viewer } = fixture(); let options, highlighted;
  globalThis.SpikeBoard3D = { mountBoard3D(host, source, value) { options = value; return { setSelection(selection) { highlighted = selection; }, dispose() {} }; } };
  await viewer.loadSource(pcb); await viewer.setView('3d');
  assert.equal(options.externalInspector, true); viewer.selectPart('part-a');
  assert.deepEqual(new Set(highlighted.uuids), new Set(['part-a', 'pad-a']));
  options.onSelect({ id: 'pad-a', type: 'Pad' });
  assert.ok(nodes(viewer.inspector.properties).some(node => node.textContent === 'OUT'));
  viewer.clearSelection(); assert.deepEqual(highlighted, {}); viewer.dispose();
});

test('late renderer selections cannot inspect a replacement source or access a disposed inspector', async () => {
  const { viewer } = fixture(); let lateSelect, events = 0;
  viewer.addEventListener('select', () => events++);
  globalThis.SpikeBoard3D = { mountBoard3D(host, source, options) { lateSelect = options.onSelect; return { setSelection() {}, dispose() {} }; } };
  await viewer.loadSource(pcb); await viewer.setView('3d');
  await viewer.loadSource(pcb.replace('Driver', 'Replacement'), { path: 'replacement.kicad_pcb' });
  viewer.setInspectorOpen(false); lateSelect({ id: 'part-a', type: 'Component' });
  assert.equal(viewer.inspector.panel.hidden, true); assert.equal(events, 0);
  viewer.dispose(); assert.doesNotThrow(() => lateSelect({ id: 'part-a' })); assert.equal(events, 0);
});

test('lookup truncation and ambiguity are explicit in the viewer rendering notes', async () => {
  const { viewer } = fixture();
  await viewer.loadSource(pcb.replace('(uuid "part-b")', '(uuid "part-a")'));
  assert.match(viewer.status.textContent, /duplicated saved UUIDs/);
  const operations = Array.from({ length: 100001 }, (_, i) => ({ id: 'op-' + i, kind: 'flash', polarity: 'dark', metadata: {}, bounds: { x: 0, y: 0, w: 1, h: 1 } }));
  const model = buildInspectionModel(null, { kind: 'manufacturing', design: { camLayers: [{ id: 'copper.gtl', operations }] } });
  assert.match(model.warnings.join(' '), /100,000/);
  viewer.inspector.setModel(model); viewer.updateStatus(); assert.match(viewer.status.textContent, /100,000/);
  viewer.dispose();
});

test('native inverter source supplies real references, footprints and terminal properties', () => {
  const source = fs.readFileSync(new URL('../fixtures/inverter/3PD%2BIB.kicad_pcb', import.meta.url), 'utf8');
  const { model } = parsed(source); assert.equal(model.parts.length, 153);
  assert.ok(model.parts.some(part => part.reference && part.value && part.footprint));
  const part = model.parts.find(part => part.pads.some(pad => pad.net && pad.uuid));
  assert.ok(part); const pad = part.pads.find(pad => pad.net && pad.uuid);
  assert.equal(model.resolve({ uuid: pad.uuid, kind: 'pad' }), pad);
  assert.ok(row(pad, 'Size')); assert.equal(row(pad, 'Net'), pad.net);
});

test('trace and named net selection highlight the complete saved copper group, not only a bounding box', async () => {
  const { viewer } = fixture(); await viewer.loadSource(pcb, { path: 'board.kicad_pcb' });
  const net = viewer.getNets().find(n => n.name === 'GND'); assert.ok(net && net.count >= 3);
  const trace = viewer.design.primitives.find(p => p.uuid === 'track-a');
  viewer.renderer.select({ primitive: trace, context: { uuid: 'track-a', kind: 'track' } });
  assert.ok(viewer.renderer.highlight.primitives.includes(trace));
  assert.ok(viewer.renderer.highlight.primitives.some(p => p.uuid === 'pad-a'));
  assert.ok(nodes(viewer.inspector.properties).some(node => node.textContent === 'GND'));
  assert.equal(viewer.selectNet(net.id, { locate: false }), true);
  assert.ok(viewer.renderer.highlight.primitives.includes(trace)); assert.equal(viewer.renderer.selected, null);
  assert.equal(viewer.selectNet('missing'), false); assert.ok(viewer.renderer.highlight.primitives.includes(trace));
  viewer.clearSelection(); assert.equal(viewer.renderer.highlight, null); viewer.dispose();
});
test('rendered graphics retain actual selected geometry without an AST inspection record', async () => {
  const { viewer } = fixture(); await viewer.loadSource(pcb);
  const p={uuid:'graphic',kind:'gr_text',layer:'F.SilkS',type:'text',x:5,y:5,text:'Note'};
  const model=buildInspectionModel(globalThis.KiCadDesignDiff.parse(pcb),{kind:'pcb',design:{primitives:[p]}});
  assert.deepEqual(model.resolve({uuid:'graphic',kind:'gr_text'}).primitives,[p]); viewer.dispose();
});
test('schematic wire selection exposes the source-connected per-file network',async()=>{
 const { viewer }=fixture();
 await viewer.loadSource('(kicad_sch (wire (pts (xy 0 0) (xy 5 0)) (uuid "w1")) (wire (pts (xy 5 0) (xy 5 5)) (uuid "w2")) (label "VCC" (at 0 0) (uuid "l1")))',{path:'s.kicad_sch'});
 const nets=viewer.getNets();assert.equal(nets.length,1);assert.equal(nets[0].name,'VCC');assert.equal(viewer.selectNet(nets[0].id),true);
 assert.ok(viewer.renderer.highlight.primitives.some(p=>p.uuid==='w1'));assert.ok(viewer.renderer.highlight.primitives.some(p=>p.uuid==='w2'));viewer.dispose();
});

test('saved child sheets resolve only listed relative project paths, preserving repeated instances',async()=>{
 const {viewer}=fixture();await viewer.loadSource('(kicad_sch (sheet (uuid "a") (property "Sheetname" "Power") (property "Sheetfile" "../power.kicad_sch")) (sheet (uuid "b") (property "Sheetname" "Power again") (property "Sheetfile" "../power.kicad_sch")) (sheet (uuid "c") (property "Sheetname" "Outside") (property "Sheetfile" "../../escape.kicad_sch")))',{path:'folder/root.kicad_sch',project:{files:[{path:'power.kicad_sch',url:'https://example.test/power'}]}});
 assert.deepEqual(viewer.getSheets().map(s=>s.path),['power.kicad_sch','power.kicad_sch',null]);assert.equal(viewer.getSheets()[0].name,'Power');viewer.dispose();
});

test('native inverter uses saved spaced Sheet name/Sheet file properties',async()=>{
 const {viewer}=fixture(),source=fs.readFileSync(new URL('../fixtures/inverter/3PD%2BIB.kicad_sch',import.meta.url),'utf8');
 await viewer.loadSource(source,{path:'3PD+IB.kicad_sch',project:{files:['outputFilter','T_sens','DCL_Sens','HBD21094','HBD21094B','HBD21094C'].map(name=>({path:name+'.kicad_sch',url:'https://example.test/'+name}))}});
 assert.equal(viewer.getSheets().length,6);assert.ok(viewer.getSheets().every(sheet=>sheet.name&&sheet.path));assert.ok(viewer.getSheets().some(sheet=>sheet.path==='HBD21094.kicad_sch'));viewer.dispose();
});

test('selected nets survive PCB/3D switching and 3D copper picks select the complete named net', async () => {
  const {viewer}=fixture();let options,highlighted,dim;
  globalThis.SpikeBoard3D={mountBoard3D(host,source,value){options=value;return {setSelection(v){highlighted=v;},setSelectionDim(v){dim=v;},dispose(){}};}};
  await viewer.loadSource(pcb,{path:'board.kicad_pcb'});
  assert.equal(viewer.selectNet('GND'),true);await viewer.setView('3d');
  assert.deepEqual(highlighted,{netNames:['GND']});assert.equal(dim,true);
  assert.equal(viewer.inspector.netToggle.disabled,false);
  assert.equal(viewer.inspector.netResults.children[0].disabled,false);
  assert.equal(viewer.selectNet('GND'),true);
  viewer.clearSelection();assert.deepEqual(highlighted,{});
  options.onSelect({id:'track-a',net:'GND',type:'Track'});
  assert.deepEqual(highlighted,{netNames:['GND']});
  await viewer.setView('pcb');assert.ok(viewer.renderer.highlight.primitives.some(p=>p.uuid==='track-a'));
  await viewer.loadSource(pcb.replaceAll('GND','VCC'));assert.equal(viewer.renderer.highlight,null);
  viewer.dispose();
});

test('public selection snapshots preserve saved terminal identity without exposing primitive records',async()=>{
 const {viewer}=fixture();await viewer.loadSource(pcb,{path:'board.kicad_pcb'});
 assert.equal(viewer.getSelection(),null);assert.equal(viewer.selectObject('pad-a'),true);
 const selected=viewer.getSelection();assert.equal(selected.kind,'pad');assert.equal(selected.uuid,'pad-a');assert.equal(selected.ownerUuid,'part-a');assert.equal(selected.pinNumber,'1');assert.equal(selected.netName,'GND');assert.equal(selected.primitives,undefined);
 selected.uuid='changed';assert.equal(viewer.getSelection().uuid,'pad-a');assert.equal(viewer.selectObject('missing'),false);assert.equal(viewer.getSelection().uuid,'pad-a');
 viewer.clearSelection();assert.equal(viewer.getSelection(),null);viewer.dispose();
});

test('click selection can highlight without opening Properties, manual inspection and re-enabling still work',async()=>{
 const doc=document(),host=new Element(doc),viewer=new KiCadViewer(host,{inspectOnSelect:false});await viewer.loadSource(pcb,{path:'board.kicad_pcb'});
 viewer.renderer.select({primitive:viewer.design.primitives.find(p=>p.uuid==='track-a'),context:{uuid:'track-a',kind:'track'}});
 assert.equal(viewer.inspector.panel.hidden,true);assert.ok(viewer.renderer.highlight.primitives.some(p=>p.uuid==='pad-a'));assert.equal(viewer.getSelection().uuid,'track-a');
 viewer.setInspectorOpen(true);assert.equal(viewer.inspector.panel.hidden,false);viewer.setInspectorOpen(false);viewer.setInspectOnSelect(true);viewer.selectPart('part-a');assert.equal(viewer.inspector.panel.hidden,false);
 assert.throws(()=>viewer.setInspectOnSelect('false'),/boolean/);viewer.dispose();assert.throws(()=>viewer.setInspectOnSelect(false),/disposed/);
});

test('3D part search and clicks locate once; explicit suppression, renderer refresh and nets retain camera', async () => {
 const {viewer}=fixture();await viewer.loadSource(pcb,{path:'board.kicad_pcb'});
 const calls=[];viewer.view='3d';viewer.renderer={setSelection(){},setSelectionDim(){},focusPart(uuid){calls.push(uuid);},dispose(){}};
 assert.equal(viewer.selectPart('part-a'),true);assert.deepEqual(calls,['part-a']);
 viewer.selectPart('part-b',{locate:false});viewer.inspector.syncRenderer();assert.equal(calls.length,1);
 viewer.inspector.select({uuid:'part-b',kind:'part'});assert.deepEqual(calls,['part-a','part-b']);
 viewer.inspector.select({uuid:'pad-a',ownerUuid:'part-a',kind:'pad'});assert.equal(calls.at(-1),'part-a');
 viewer.selectNet('GND');viewer.clearSelection();assert.equal(calls.length,3);
 viewer.inspector.partsTab.onclick();viewer.inspector.search.value='Driver';viewer.inspector.search.oninput();viewer.inspector.results.children[0].onclick();assert.equal(calls.length,4);assert.equal(calls.at(-1),'part-a');
 viewer.dispose();
});
