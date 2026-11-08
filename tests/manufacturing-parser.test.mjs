import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseManufacturing, parseGerber, parseExcellon, detectManufacturing } from '../src/manufacturing/index.mjs';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const gerber = body => `%FSLAX24Y24*%%MOMM*%${body}M02*`;
const operations = model => model.layers[0].operations;
const drill = body => `M48\n;FORMAT={-:-/ absolute / metric / decimal}\nMETRIC\nT1C1.0\n%\nG90\nG05\nT1\n${body}\nM30\n`;

test('content detection distinguishes CAM signatures and never trusts a filename alone', () => {
  assert.equal(detectManufacturing(gerber('%ADD10C,1*%D10*X0Y0D03*')), 'gerber');
  assert.equal(detectManufacturing(drill('X1.0Y2.0')), 'excellon');
  assert.equal(detectManufacturing('<html>not a board</html>', 'board.gbr'), null);
  assert.throws(() => parseManufacturing('(kicad_pcb)'), /not a recognized/);
  assert.throws(() => parseManufacturing('\0binary', { format: 'gerber' }), /Binary/);
});

test('Gerber circular flashes, holes and metric leading suppression preserve true millimetres', () => {
  const model = parseGerber(gerber('%ADD10C,2X1*%D10*X10000Y20000D03*'), { path: 'copper.gtl' });
  const op = operations(model)[0];
  assert.equal(model.format, 'gerber'); assert.equal(model.units, 'mm');
  assert.deepEqual(op.bounds, { x: 0, y: 1, w: 2, h: 2 });
  assert.equal((op.path.match(/M/g) || []).length, 2);
  assert.equal(op.polarity, 'dark'); assert.equal(op.fill, true);
  assert.match(op.id, /^copper\.gtl:/);
});

test('Gerber inch conversion and trailing-zero suppression agree with numeric reference', () => {
  const inch = parseGerber('%FSLAX24Y24*%%MOIN*%%ADD10C,0.1*%D10*X10000Y-20000D03*M02*');
  near(operations(inch)[0].bounds.x, 25.4 - 1.27); near(operations(inch)[0].bounds.y, -50.8 - 1.27);
  const trailing = parseGerber('%FSTAX24Y24*%%MOMM*%%ADD10C,2*%D10*X01Y02D03*M02*');
  assert.deepEqual(operations(trailing)[0].bounds, { x: 0, y: 1, w: 2, h: 2 });
});

test('standard R/O/P apertures and LR/LM/LS transforms retain exact flash bounds', () => {
  const rect = parseGerber(gerber('%ADD10R,2X1*%%LR90*%%LS2*%D10*X10000Y20000D03*'));
  near(rect.bounds.x, 0); near(rect.bounds.y, 0); near(rect.bounds.w, 2); near(rect.bounds.h, 4);
  const circle = parseGerber(gerber('%ADD10C,2*%%LR45*%D10*X0Y0D03*'));
  assert.deepEqual(circle.bounds, { x: -1, y: -1, w: 2, h: 2 });
  const obround = parseGerber(gerber('%ADD10O,4X2*%%LR90*%D10*X0Y0D03*'));
  near(obround.bounds.w, 2); near(obround.bounds.h, 4);
  const polygon = parseGerber(gerber('%ADD10P,2X4X0*%D10*X0Y0D03*'));
  near(polygon.bounds.w, 2); near(polygon.bounds.h, 2);
});

test('circular traces and rectangular linear sweeps carry physical widths and bounds', () => {
  const circular = parseGerber(gerber('%ADD10C,0.4*%D10*X0Y0D02*X100000Y0D01*'));
  const trace = operations(circular)[0];
  assert.equal(trace.fill, false); near(trace.width, 0.4); near(trace.bounds.w, 10.4);
  const rectangle = parseGerber(gerber('%ADD10R,2X1*%D10*X0Y0D02*X100000Y0D01*'));
  near(rectangle.bounds.x, -1); near(rectangle.bounds.w, 12); near(rectangle.bounds.h, 1);
});

test('multi/single-quadrant arcs and full circles have correct sweep and cardinal extents', () => {
  const arc = parseGerber(gerber('%ADD10C,0.2*%D10*G75*X10000Y0D02*G03X0Y10000I-10000J0D01*'));
  const op = operations(arc)[0]; assert.match(op.path, /A1 1 0 0 1 0 1/);
  near(op.bounds.x, -0.1); near(op.bounds.y, -0.1); near(op.bounds.w, 1.2); near(op.bounds.h, 1.2);
  const single = parseGerber(gerber('%ADD10C,0.2*%D10*G74*X10000Y0D02*G03X0Y10000I10000J0D01*'));
  near(single.bounds.w, arc.bounds.w);
  const full = parseGerber(gerber('%ADD10C,0.2*%D10*G75*X10000Y0D02*G02X10000Y0I-10000J0D01*'));
  assert.equal((operations(full)[0].path.match(/A/g) || []).length, 2); near(full.bounds.w, 2.2); near(full.bounds.h, 2.2);
});

test('regions, ordered clear polarity and step-repeat preserve operation identities', () => {
  const model = parseGerber(gerber('G36*X0Y0D02*G01X10000Y0D01*X10000Y10000D01*X0Y10000D01*X0Y0D01*G37*%LPC*%%ADD10C,0.4*%D10*X5000Y5000D03*'));
  assert.equal(operations(model)[0].kind, 'region'); assert.equal(operations(model)[1].polarity, 'clear');
  const repeat = parseGerber(gerber('%ADD10C,2*%%SRX2Y2I10J20*%D10*X10000Y20000D03*%SR*%'));
  assert.equal(operations(repeat).length, 4); assert.equal(new Set(operations(repeat).map(op => op.id)).size, 4);
  assert.deepEqual(repeat.bounds, { x: 0, y: 1, w: 12, h: 22 });
  assert.match(operations(repeat)[3].path, /M12 22/);
});

test('positive aperture macro arithmetic, rectangles and circle unions emit exact constituent operations', () => {
  const macro = '%AMRounded*$4=$1x2*21,1,$2,$3,0,0,0*1,1,$4,$2/2,0*1,1,$4,-$2/2,0*%';
  const model = parseGerber(gerber(macro + '%ADD10Rounded,0.5X2X1*%D10*X10000Y20000D03*'));
  assert.equal(operations(model).length, 3); assert.deepEqual(model.warnings, []);
  near(model.bounds.x, -0.5); near(model.bounds.w, 3); near(model.bounds.h, 1);
});

test('overlapping mixed-polarity step-repeat replays complete blocks in Y-then-X order', () => {
  const model = parseGerber(gerber('%ADD10C,2*%%ADD11C,0.5*%%SRX2Y2I1J1*%D10*X0Y0D03*%LPC*%D11*X0Y0D03*%SR*%'));
  assert.deepEqual(operations(model).map(op => op.polarity), ['dark', 'clear', 'dark', 'clear', 'dark', 'clear', 'dark', 'clear']);
  assert.deepEqual(operations(model).filter(op => op.polarity === 'dark').map(op => op.metadata.repeat), [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
  assert.throws(() => parseGerber(gerber('%SRX2Y1I1J0*%%ADD10C,1*%D10*X0Y0D03*')), /step-repeat block/);
});

test('X2 file, aperture and object attributes survive as source metadata', () => {
  const model = parseGerber(gerber('%TF.FileFunction,Copper,L1,Top*%%TA.AperFunction,ComponentPad*%%ADD10C,1*%%TD*%%TO.N,GND*%D10*X0Y0D03*%TD*%X10000Y0D03*'));
  assert.equal(model.layers[0].name, 'Copper,L1,Top');
  assert.deepEqual(operations(model)[0].metadata.apertureAttributes['.AperFunction'], ['ComponentPad']);
  assert.deepEqual(operations(model)[0].metadata.objectAttributes['.N'], ['GND']);
  assert.equal(operations(model)[1].metadata.objectAttributes['.N'], undefined);
});

test('unsupported apertures are omitted with diagnostics; unsupported state and malformed arcs reject', () => {
  const omitted = parseGerber(gerber('%AMHole*1,1,2,0,0*1,0,1,0,0*%%ADD10Hole*%D10*X0Y0D03*'));
  assert.equal(operations(omitted).length, 0); assert.match(omitted.warnings[0], /clear exposure/);
  const swept = parseGerber(gerber('%ADD10O,2X1*%D10*X0Y0D02*X10000Y0D01*'));
  assert.equal(operations(swept).length, 0); assert.match(swept.warnings[0], /unsupported swept/);
  assert.throws(() => parseGerber(gerber('%AB D10*%')), /Unsupported Gerber state/);
  assert.throws(() => parseGerber(gerber('%ADD10C,1*%D10*G75*X10000Y0D02*G03X10000Y10000I-10000J0D01*')), /radii/);
  assert.throws(() => parseGerber(gerber('G36*X0Y0D02*X10000Y0D01*G37*')), /not closed/);
  assert.throws(() => parseGerber('%FSLIX24Y24*%%MOMM*%M02*'), /incremental/);
});

test('decimal Excellon hits and G85 slots retain tool identity, diameter and units', () => {
  const model = parseExcellon(drill('X1.0Y2.0\nX0.0Y0.0G85X2.0Y0.0'), { path: 'holes.drl' });
  assert.equal(model.units, 'mm'); assert.equal(operations(model).length, 2);
  assert.deepEqual(operations(model)[0].bounds, { x: 0.5, y: 1.5, w: 1, h: 1 });
  assert.equal(operations(model)[1].kind, 'slot'); near(operations(model)[1].bounds.w, 3);
  assert.equal(operations(model)[1].width, 1); assert.equal(model.metadata.tools[0].operations, 2);
});

test('Excellon inch units and LZ/TZ retained-zero convention decode correctly', () => {
  const inch = parseExcellon('M48\nINCH\nT01C0.1\n%\nT01\nX1.0Y-2.0\nM30');
  near(inch.bounds.x, 25.4 - 1.27); near(inch.bounds.y, -50.8 - 1.27);
  const leadingKept = parseExcellon('M48\nMETRIC,LZ,00.0000\nT1C0.1\n%\nT1\nX001Y002\nM30');
  const trailingKept = parseExcellon('M48\nMETRIC,TZ,00.0000\nT1C0.1\n%\nT1\nX1000Y2000\nM30');
  near(leadingKept.bounds.x, 0.05); near(leadingKept.bounds.y, 0.15);
  assert.deepEqual(trailingKept.bounds, leadingKept.bounds);
});

test('ambiguous Excellon integer encodings reject until explicit settings resolve them', () => {
  const raw = 'M48\nMETRIC\nT1C1.0\n%\nT1\nX12500Y25000\nM30';
  assert.throws(() => parseExcellon(raw), /formatDigits/);
  assert.throws(() => parseExcellon(raw, { formatDigits: [3, 3] }), /zeroSuppression/);
  const fixed = parseExcellon(raw, { formatDigits: [3, 3], zeroSuppression: 'leading' });
  near(fixed.bounds.x, 12); near(fixed.bounds.y, 24.5);
  assert.throws(() => parseExcellon(raw, { units: 'inch' }), /conflict/);
  const xnc = parseExcellon('M48\nMETRIC\nT1C1\n%\nG05\nT1\nX1Y2\nM30', { path: 'holes.xnc' });
  near(xnc.bounds.x, 0.5); near(xnc.bounds.y, 1.5);
});

test('Excellon linear and short-radius arc routing uses round tool sweeps', () => {
  const model = parseExcellon(drill('G00X0.0Y0.0\nM15\nG01X1.0Y0.0\nG03X2.0Y1.0A1.0\nM16\nG05\nX3.0Y3.0'));
  assert.equal(operations(model).length, 3); assert.equal(operations(model)[0].fill, false);
  assert.match(operations(model)[1].path, /A1 1 0 0 1 2 1/);
  near(operations(model)[1].bounds.x, 0.5); near(operations(model)[1].bounds.y, -0.5);
  const repeat = parseExcellon(drill('X0.0Y0.0\nR3X1.0Y0.0'));
  assert.equal(operations(repeat).length, 4); near(repeat.bounds.w, 4);
});

test('malformed tools, unsupported transforms and bounded repeat/input sizes fail explicitly', () => {
  assert.throws(() => parseExcellon(drill('T2\nX1.0Y2.0')), /Undefined/);
  assert.throws(() => parseExcellon(drill('G93X0Y0')), /Unsupported/);
  assert.throws(() => parseExcellon(drill('G91')), /Incremental/);
  assert.throws(() => parseExcellon(drill('X0.0Y0.0\nR10001X1.0Y0.0')), /excessive/);
  assert.throws(() => parseGerber(gerber('%SRX10001Y1I1J0*%')), /10,000/);
  assert.throws(() => parseManufacturing(' '.repeat(16 * 1024 * 1024 + 1), { format: 'gerber' }), /16 MiB/);
});

test('aggregate compiled aperture budgets fail closed before repeated macros retain excessive geometry', () => {
  const points = Array.from({ length: 2000 }, (_, i) => `${Math.cos(i * Math.PI / 1000).toFixed(6)},${Math.sin(i * Math.PI / 1000).toFixed(6)}`);
  const macro = `%AMLarge*4,1,2000,${points.join(',')},${points[0]},0*%`;
  const declarations = Array.from({ length: 70 }, (_, i) => `%ADD${i + 10}Large*%`).join('');
  assert.throws(() => parseGerber(gerber(macro + declarations)), error => error.code === 'CAM_RESOURCE_LIMIT' && /aperture.*budget/.test(error.message));
  const assignmentMacro = '%AMWork*' + Array.from({ length: 512 }, () => '$1=1+2+3+4+5+6+7+8*').join('') + '%';
  assert.throws(() => parseGerber(gerber(assignmentMacro + declarations.replaceAll('Large', 'Work'))), error => error.code === 'CAM_RESOURCE_LIMIT');
});

test('token and UTF-8 byte budgets reject before bulk split/encoding allocations', () => {
  assert.throws(() => parseGerber(gerber('%AMMany*' + '0 ignored*'.repeat(514) + '%')), /512 commands/);
  assert.throws(() => parseGerber(gerber('%ADD10C,' + '1X'.repeat(501) + '1*%')), /500 parameters/);
  assert.throws(() => parseManufacturing('\u20ac'.repeat(6 * 1024 * 1024), { format: 'gerber' }), /16 MiB/);
  assert.throws(() => parseExcellon('\n'.repeat(200001)), /command limit/);
});

test('native KiCad 10 inverter exports parse without omissions and retain drill tool counts', () => {
  const expected = { '3PD+IB-B_Cu.gbl': 1960, '3PD+IB-F_Cu.gtl': 1262, '3PD+IB-Edge_Cuts.gm1': 93, '3PD+IB-F_Silkscreen.gto': 14716, '3PD+IB-PTH.drl': 295, '3PD+IB-NPTH.drl': 17 };
  for (const [path, count] of Object.entries(expected)) {
    const source = fs.readFileSync(new URL('../fixtures/inverter-cam/' + path, import.meta.url), 'utf8');
    const model = parseManufacturing(source, { path });
    assert.equal(operations(model).length, count, path); assert.deepEqual(model.warnings, [], path);
    assert.ok(model.bounds.x > 20 && model.bounds.x < 40, path);
    assert.ok(model.bounds.y < -260 && model.bounds.y > -270, path);
    if (path.endsWith('-PTH.drl')) assert.equal(model.metadata.tools.length, 14);
  }
});
