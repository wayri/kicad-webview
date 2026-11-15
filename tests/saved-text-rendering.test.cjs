/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../engine/design-diff.js');
const pcb=require('../engine/pcb-renderer.js'),sch=require('../engine/schematic-renderer.js');
test('PCB visible custom properties resolve saved expressions and preserve mirrored text and source',()=>{
 const ast=parse('(kicad_pcb (version 20250101) (layers (0 "F.Cu" signal)) (footprint "X" (layer "F.Cu") (at 10 20) (uuid f) (property "Reference" "U1" (at 0 0) (layer "F.Cu") (effects (font (size 1 1)))) (property "MPN" "${PART}" (at 0 2) (layer "F.Cu") (effects (font (size 1 1)) (justify mirror))) (fp_text user "@{${COUNT} * 2}" (at 0 4) (layer "F.Cu") (effects (font (size 1 1))))))');
 const before=JSON.stringify(ast),result=pcb.build(ast,'board.kicad_pcb',{textVariables:{PART:'ABC',COUNT:'3'}});
 assert.equal(result.primitives.find(p=>p.property==='MPN').text,'ABC');assert.equal(result.primitives.find(p=>p.property==='MPN').mirrored,true);assert.ok(result.primitives.some(p=>p.type==='text'&&p.text==='6'));assert.equal(JSON.stringify(ast),before);
});
test('schematic resolved text preserves original expression for inspection and unresolved data stays literal',()=>{
 const ast=parse('(kicad_sch (text "${PART} @{2 + 3}" (at 10 10) (effects (font (size 1 1)))) (text "${MISSING}" (at 10 20) (effects (font (size 1 1)))))');
 const result=sch.build(ast,'sheet.kicad_sch',{textVariables:{PART:'ABC'}}),texts=result.primitives.filter(p=>p.type==='text'&&!p.frame);
 assert.ok(texts.some(p=>p.text==='ABC 5'&&p.rawText==='${PART} @{2 + 3}'));assert.ok(texts.some(p=>p.text==='${MISSING}'));assert.ok(result.warnings.some(w=>w.includes('MISSING')));
});
