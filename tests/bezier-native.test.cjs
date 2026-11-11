const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const diff=require('../engine/design-diff.js'),pcb=require('../engine/pcb-renderer.js'),sch=require('../engine/schematic-renderer.js'),nets=require('../engine/net-model.js');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures/bezier',name),'utf8');
const cubic=(p,t)=>({x:(1-t)**3*p[0].x+3*(1-t)**2*t*p[1].x+3*(1-t)*t*t*p[2].x+t**3*p[3].x,y:(1-t)**3*p[0].y+3*(1-t)**2*t*p[1].y+3*(1-t)*t*t*p[2].y+t**3*p[3].y});
function distance(point,line){let closest=Infinity;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length2)):0;closest=Math.min(closest,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));}return closest;}

test('adaptive cubics bound geometric error, preserve loops and collinear overshoot without mutating source',()=>{
 for(const controls of [[{x:0,y:0},{x:5,y:15},{x:15,y:-15},{x:20,y:0}],[{x:0,y:0},{x:10,y:15},{x:-10,y:15},{x:0,y:0}],[{x:0,y:0},{x:30,y:0},{x:-30,y:0},{x:1,y:0}]]){
  const before=JSON.stringify(controls),points=diff.cubicBezierPoints(controls);assert.equal(JSON.stringify(controls),before);assert.deepEqual(points[0],controls[0]);assert.deepEqual(points.at(-1),controls[3]);assert.ok(points.length<=2049);
  for(let i=0;i<=2000;i++)assert.ok(distance(cubic(controls,i/2000),points)<=.00501);
 }
});

test('invalid and excessive Bezier inputs fail within a fixed tessellation budget',()=>{
 for(const controls of [[],[{x:0,y:0}],Array(4).fill({x:NaN,y:0}),Array(4).fill({x:0,y:Infinity}),[{x:0,y:0},{x:1e9,y:1e9},{x:-1e9,y:1e9},{x:0,y:0}]])assert.throws(()=>diff.cubicBezierPoints(controls));
});

test('front and rotated back PCB Beziers agree with retained KiCad 10.0.6 SVG control coordinates',()=>{
 const source=fixture('curves.kicad_pcb'),ast=diff.parse(source),before=JSON.stringify(ast),result=pcb.build(ast,'curves.kicad_pcb');assert.equal(JSON.stringify(ast),before);
 const curves=result.primitives.filter(p=>['gr_curve','fp_curve'].includes(p.kind));assert.equal(curves.length,2);assert.equal(curves[1].ownerUuid,'11a9e074-4d46-4034-921b-ec1e092bfa03');assert.equal(curves[1].layer,'B.SilkS');
 const native=[...fixture('pcb-native.svg').matchAll(/<path d="M([^\"]+)"/g)].map(match=>{const values=match[1].match(/-?\d+(?:\.\d+)?/g).map(Number);return Array.from({length:4},(_,i)=>({x:values[i*2],y:values[i*2+1]}));});assert.equal(native.length,2);
 for(let curve=0;curve<2;curve++){assert.deepEqual(curves[curve].points[0],native[curve][0]);assert.deepEqual(curves[curve].points.at(-1),native[curve][3]);for(let i=0;i<=2000;i++)assert.ok(distance(cubic(native[curve],i/2000),curves[curve].points)<=.00501);}
 assert.ok(!result.warnings.some(w=>/curve/.test(w)));
});

test('rotated mirrored symbol curve and conductive pin follow native SVG and retain wire connectivity',()=>{
 const content=fixture('curves.kicad_sch'),ast=diff.parse(content),before=JSON.stringify(ast),result=sch.build(ast,'curves.kicad_sch');assert.equal(JSON.stringify(ast),before);
 const curves=result.primitives.filter(p=>p.type==='polyline'&&p.kind==='symbol');assert.equal(curves.length,2);
 const native=[...fixture('schematic-native.svg').matchAll(/<path\b[^>]*d="([^\"]+)"/g)].map(match=>match[1].match(/-?\d+(?:\.\d+)?/g).map(Number)).filter(values=>values.length>8);assert.equal(native.length,2);
 for(let i=0;i<2;i++)for(let j=0;j<native[i].length;j+=2)assert.ok(distance({x:native[i][j],y:native[i][j+1]},curves[i].points)<.006);
 const pin=result.primitives.find(p=>p.kind==='pin'&&p.uuid==='11a9e074-4d46-4034-921b-ec1e092bfb02');assert.deepEqual(pin.connectPoint,{x:130,y:110});
 assert.match(fixture('schematic-native.svg'),/M130\.0000 108\.0000\s+L130\.0000 110\.0000/);assert.match(fixture('schematic-native.svg'),/M130\.0000 110\.0000\s+L135\.0000 110\.0000/);
 const model=nets.build([{path:'curves.kicad_sch',content}],new Map([['curves.kicad_sch',result]]));const joined=model.nets.find(n=>n.members.some(m=>m.kind==='wire'));
 assert.ok(joined.members.some(m=>m.kind==='pin'&&m.reference==='U2'&&m.position.x===130&&m.position.y===110));
});

test('malformed curves are disclosed and do not invent geometry or lose saved text mirroring',()=>{
 const source=fixture('curves.kicad_pcb').replace('(xy 105 85)','').replace('(hide yes)','');const result=pcb.build(diff.parse(source));assert.ok(result.warnings.some(w=>/Invalid or over-budget gr_curve/.test(w)));assert.ok(!result.primitives.some(p=>p.kind==='gr_curve'));const text=result.primitives.find(p=>p.type==='text'&&p.layer==='B.SilkS');assert.equal(text.mirrored,true);
 const schematic=fixture('curves.kicad_sch').replace('(xy 5 -15)','');const drawn=sch.build(diff.parse(schematic));assert.ok(drawn.warnings.some(w=>/Invalid or over-budget bezier/.test(w)));assert.equal(drawn.primitives.filter(p=>p.type==='polyline'&&p.kind==='symbol').length,0);
});
