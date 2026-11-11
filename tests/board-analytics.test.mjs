import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBoard, buildBOM, bomToCSV} from '../src/board-analytics.mjs';

test('saved counts, arc lengths, layers, nets and overlapping fills remain explicit', () => {
 const report=analyzeBoard(`(kicad_pcb (general(thickness 1.6))(net 1 "GND")(net 2 "Signal")
 (footprint "x" (pad "1" smd rect)(pad "2" thru_hole circle(drill 1)))
 (segment(start 0 0)(end 3 4)(layer "F.Cu")(net 1))
 (arc(start 1 0)(mid 0 1)(end -1 0)(layer "B.Cu")(net 1))
 (segment(start 0 0)(end 0 2)(layer "F.Cu")(net 2))(arc(start 0 0)(mid 1 0)(end 2 0))
 (via(at 2 2))(zone (polygon(pts(xy 0 0)(xy 10 0)(xy 10 10)(xy 0 10)))
 (filled_polygon(layer "F.Cu")(pts(xy 0 0)(xy 5 0)(xy 5 5)(xy 0 5)))
 (filled_polygon(layer "F.Cu")(pts(xy 0 5)(xy 5 5)(xy 5 0)(xy 0 0)))))`,{path:'x.kicad_pcb'});
 assert.equal(report.path,'x.kicad_pcb');assert.equal(report.sourceKind,'pcb');
 assert.deepEqual([report.footprints,report.pads,report.drilledPads,report.smdPads,report.throughHolePads,report.segments,report.arcs,report.vias],[1,2,1,1,1,2,2,1]);
 assert.ok(Math.abs(report.totalTrackLengthMm-(7+Math.PI))<1e-9);assert.equal(report.omittedTracks,1);
 assert.equal(report.netTracks[0].name,'GND');assert.equal(report.netTracks[0].arcs,1);assert.equal(report.layerTracks.find(x=>x.layer==='F.Cu').lengthMm,7);
 assert.equal(report.zones[0].outlineAreaMm2,100);assert.equal(report.zones[0].fillAreaMm2,50);assert.equal(report.layerFill[0].areaMm2,50);
 assert.match(report.warnings.join(' '),/malformed/);assert.match(report.limits,/overlaps/);assert.ok(Object.isFrozen(report.zones[0]));
});

test('bounds, malformed geometry and unsupported edges remain disclosed',()=>{
 const report=analyzeBoard('(kicad_pcb (zone(polygon(pts(xy 0 0)(xy 1 1)))) (gr_arc(start 0 0)(mid 1 1)(end 2 0)(layer "Edge.Cuts")))');
 assert.equal(report.edgeBounds,null);assert.equal(report.boardThicknessMm,null);assert.equal(report.zones[0].valid,false);
 assert.match(report.warnings.join(' '),/invalid polygon/);assert.match(report.warnings.join(' '),/no saved filled/);assert.match(report.warnings.join(' '),/envelope unavailable/);
 assert.throws(()=>analyzeBoard('(kicad_sch)'),/saved PCB/);assert.throws(()=>buildBOM('<script>bad</script>'),/KiCad|expression/i);
 assert.throws(()=>buildBOM('x'.repeat(8*1024*1024+1)),/8 MiB/);
});

test('PCB BOM groups fitted and DNP parts, excludes saved flags and neutralizes CSV',()=>{
 const report=buildBOM(`(kicad_pcb
 (footprint "R_0603" (uuid a)(property "Reference" "=R1")(property "Value" "10k"))
 (footprint "R_0603" (uuid b)(fp_text reference "R2")(fp_text value "10k"))
 (footprint "@danger" (uuid c)(property "Reference" "R3")(property "Value" "10k")(attr dnp))
 (footprint "R_0603" (uuid d)(property "Reference" "R4")(attr exclude_from_bom)))`,{path:'board.kicad_pcb'});
 assert.deepEqual([report.total,report.fitted,report.dnp,report.excluded,report.eligible],[4,3,1,1,3]);
 assert.equal(report.groups.length,2);assert.equal(report.parts[0].id,'board.kicad_pcb#a');assert.equal(report.parts[1].reference,'R2');
 assert.match(bomToCSV(report),/"'=R1"/);assert.match(bomToCSV(report),/"'@danger"/);
 assert.ok(Object.isFrozen(report.parts[0].properties));assert.ok(Object.isFrozen(report.groups[0].parts));
});

test('schematic units share saved reference identity and flags are read from source',()=>{
 const report=buildBOM(`(kicad_sch (symbol(lib_id "X:U")(uuid a)(unit 1)(property "Reference" "U1")(property "Value" "Logic"))
 (symbol(lib_id "X:U")(uuid b)(unit 2)(property "Reference" "U1")(property "Value" "Logic"))
 (symbol(lib_id "X:R")(uuid c)(property "Reference" "R1")(property "DNI" "yes"))
 (symbol(lib_id "X:R")(uuid d)(property "Reference" "R2")(in_bom no)))`,{path:'main.kicad_sch'});
 assert.equal(report.sourceKind,'schematic');assert.deepEqual([report.total,report.dnp,report.excluded,report.eligible],[3,1,1,2]);
 assert.equal(report.parts.find(p=>p.reference==='U1').uuid,'a');assert.match(report.limits,/not expanded/);
});

test('object and saved-property budgets are bounded with visible warning',()=>{
 const props=Array.from({length:70},(_,i)=>`(property "P${i}" "v")`).join('');
 const report=buildBOM(`(kicad_pcb(footprint "X" (property "Reference" "R1") ${props}))`);
 assert.match(report.warnings.join(' '),/64 saved fields/);assert.ok(Object.keys(report.parts[0].properties).length<=65);
 assert.throws(()=>analyzeBoard('(kicad_pcb'+ '(via)'.repeat(100001)+')'),/100,000-object/);
});

test('saved zone point budget rejects excessive polygon data',()=>{
 const source='(kicad_pcb(zone(polygon(pts'+ '(xy 0 0)'.repeat(200001)+'))))';
 assert.throws(()=>analyzeBoard(source),/200,000 polygon points/);
});

test('CSV preflight bounds UTF-8 expansion and rejects foreign reports',()=>{
 assert.throws(()=>bomToCSV({groups:[]}),/buildBOM/);
 assert.throws(()=>buildBOM('(kicad_pcb)',{path:'bad\npath'}),/control/);
 assert.throws(()=>buildBOM('(kicad_pcb)',{path:'x'.repeat(1025)}),/1024/);
 const report=buildBOM('(kicad_pcb'+Array.from({length:33000},(_,i)=>`(footprint "R"(uuid ${i})(property "Reference" "R${i}"))`).join('')+')',{path:'x'.repeat(1024)});
 assert.throws(()=>bomToCSV(report),/32 MiB/);
 const unicode=buildBOM('(kicad_pcb(footprint "@Ω"(property "Reference" "+R1")(property "Value" "Ω")))');
 const csv=bomToCSV(unicode);assert.match(csv,/"'\+R1"/);assert.match(csv,/"'@Ω"/);assert.match(csv,/"Ω"/);
});

test('duplicate PCB UUIDs retain both parts but disable ambiguous selection',()=>{
 const report=buildBOM('(kicad_pcb(footprint "R"(uuid same)(property "Reference" "R1"))(footprint "R"(uuid same)(property "Reference" "R2")))');
 assert.equal(report.total,2);assert.equal(report.parts.length,2);assert.ok(report.parts.every(p=>p.uuid===null && p.savedUUID==='same'));
 assert.notEqual(report.parts[0].id,report.parts[1].id);assert.match(report.warnings.join(' '),/Duplicate saved PCB footprint UUIDs/);
});

test('invalid saved board thickness is omitted and warned',()=>{
 for(const thickness of ['-1','0','"1e309"','bad']) {
  const report=analyzeBoard(`(kicad_pcb(general(thickness ${thickness})))`);
  assert.equal(report.boardThicknessMm,null);assert.match(report.warnings.join(' '),/thickness omitted/);
 }
 assert.equal(analyzeBoard('(kicad_pcb(general(thickness 1.6)))').boardThicknessMm,1.6);
 assert.equal(analyzeBoard('(kicad_pcb)').warnings.length,0);
});
