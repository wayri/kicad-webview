const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../engine/design-diff.js');
const {build}=require('../engine/schematic-renderer.js');
const definition='(symbol "Demo:Field" (symbol "Field_1_1" (rectangle (start -1 -1) (end 1 1))))';
function field(symbolAngle,fieldAngle,mirror=''){
 const source='(kicad_sch (lib_symbols '+definition+') (symbol (lib_id "Demo:Field") (at 20 30 '+symbolAngle+') '+(mirror?'(mirror '+mirror+')':'')+' (unit 1) (uuid "r") (property "Reference" "R1" (at 23 25 '+fieldAngle+') (effects (font (size 1 1))))))';
 return build(parse(source)).primitives.find(p=>p.kind==='property');
}
test('native KiCad field orientation combines symbol and field rotation while keeping saved anchors',()=>{
 // Native 10.0.6 SVG export: at=90, field=90 is horizontal; field=0 is vertical.
 for(const {mirror,symbolAngle,fieldAngle,nativeSvgAngle} of require('./fixtures/schematic-fields/native-orientation.json').cases){
  const p=field(symbolAngle,fieldAngle,mirror);
  assert.equal(Math.abs(p.angle), Math.abs(nativeSvgAngle));
  assert.deepEqual([p.x,p.y],[23,25]);
 }
});
test('multi-unit reference display adds unit letters without changing component selection identity',()=>{
 const source='(kicad_sch (lib_symbols (symbol "Demo:Dual" (symbol "Dual_1_1" (rectangle (start -1 -1) (end 1 1))) (symbol "Dual_2_1" (rectangle (start -1 -1) (end 1 1))) (symbol "Dual_3_1" (rectangle (start -1 -1) (end 1 1))))) '+[1,2,3].map(unit=>'(symbol (lib_id "Demo:Dual") (at '+(unit*10)+' 20 0) (unit '+unit+') (uuid "u'+unit+'") (property "Reference" "U1" (at '+(unit*10)+' 15 0) (effects (font (size 1 1)))))').join('')+')';
 const refs=build(parse(source)).primitives.filter(p=>p.kind==='property');
 assert.deepEqual(refs.map(p=>p.text),['U1A','U1B','U1C']);
 assert.ok(refs.every(p=>p.reference==='U1'));
 assert.equal(field(0,0).text,'R1');
});
