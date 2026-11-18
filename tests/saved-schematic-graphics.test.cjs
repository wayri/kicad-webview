const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../engine/design-diff.js'),{build}=require('../engine/schematic-renderer.js');
const render=source=>build(parse(source)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6);
function pngFixture(width=3,height=2,ppm=null,extra=[]){
 const {crc32,deflateSync}=require('node:zlib'),chunk=(type,data)=>{const name=Buffer.from(type),header=Buffer.alloc(4),checksum=Buffer.alloc(4);header.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([header,name,data,checksum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const parts=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr)];
 if(ppm!==null){const physical=Buffer.alloc(9);physical.writeUInt32BE(ppm);physical.writeUInt32BE(ppm,4);physical[8]=1;parts.push(chunk('pHYs',physical));}
 for(const [type,data]of extra)parts.push(chunk(type,data));
 // Oversize header test cases need no large pixel buffer: they must be rejected
 // by IHDR validation before browser decoding is permitted.
 const pixels=width*height<=100000?Buffer.alloc((width*4+1)*height):Buffer.alloc(5);parts.push(chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0)));return Buffer.concat(parts);
}
const imageSource=(png,version=20260623,attributes='')=>`(kicad_sch (version ${version}) (image (at -5 230) (scale 2) ${attributes} (uuid "saved-image") (data "${png.toString('base64')}")))`;

test('embedded PNGs retain off-page world quads and KiCad saved physical-resolution eras',()=>{
 const png=pngFixture(300,150,3780);
 for(const [version,ppi]of [[20230121,300],[20231120,94],[20260623,96]]){
  const result=render(imageSource(png,version)),image=result.primitives.find(p=>p.type==='image');assert.ok(image,result.warnings.join(' '));assert.equal(image.pixelWidth,300);assert.equal(image.pixelHeight,150);assert.equal(image.dataUrl,'data:image/png;base64,'+png.toString('base64'));assert.equal(image.opacity,1);
  const width=300*25.4/ppi*2,height=150*25.4/ppi*2;near(image.points[0].x,Math.round((-5-width/2)*1e6)/1e6);near(image.points[0].y,Math.round((230-height/2)*1e6)/1e6);near(image.points[2].x,Math.round((-5+width/2)*1e6)/1e6);near(image.points[2].y,Math.round((230+height/2)*1e6)/1e6);
 }
 const noResolution=render(imageSource(pngFixture(300,150))).primitives.find(p=>p.type==='image');near(noResolution.points[1].x-noResolution.points[0].x,50.8);
 const rotated=render(imageSource(pngFixture(3,2),20260623,'(rotate 90) (opacity 0.4)')).primitives.find(p=>p.type==='image');assert.equal(rotated.opacity,.4);assert.equal(rotated.points[0].y>rotated.points[1].y,true);
});

test('PNG validation blocks external data, corrupt chunks, oversized decoded images and animation before image emission',()=>{
 const corrupted=Buffer.from(pngFixture());corrupted[29]^=1;
 for(const png of [corrupted,pngFixture(4001,4000),pngFixture(3,2,null,[['acTL',Buffer.alloc(8)]]),Buffer.from('not PNG')]){
  const result=render(imageSource(png));assert.equal(result.primitives.some(p=>p.type==='image'),false);assert.ok(result.warnings.some(w=>/image was not rendered/.test(w)));
 }
 const external=render('(kicad_sch (image (at 0 0) (data "https://example.com/image.png")))');assert.equal(external.primitives.some(p=>p.type==='image'),false);
 const png=pngFixture();for(const attrs of ['(scale -1)','(opacity 2)']){const result=render(`(kicad_sch (image (at 0 0) ${attrs} (data "${png.toString('base64')}")))`);assert.equal(result.primitives.some(p=>p.type==='image'),false);}
 const count=render('(kicad_sch '+Array.from({length:17},(_,i)=>`(image (at ${i} 0) (data "${png.toString('base64')}"))`).join(' ')+')');assert.equal(count.primitives.filter(p=>p.type==='image').length,16);assert.match(count.warnings.join(' '),/16-image/);
 const large=pngFixture(4000,4000),budget=render('(kicad_sch '+Array.from({length:3},(_,i)=>`(image (at ${i} 0) (data "${large.toString('base64')}"))`).join(' ')+')');assert.equal(budget.primitives.filter(p=>p.type==='image').length,1);assert.match(budget.warnings.join(' '),/16 megapixel/);
});

test('native PNG trailers and compressed ancillary metadata never reach browser decoding',()=>{
 const png=pngFixture(),metadata=pngFixture(3,2,null,[['iCCP',Buffer.from('profile\0\0compressed')],['zTXt',Buffer.from('comment\0\0compressed')]]);
 // Older KiCad demo sheets contain 1024 or 1025 bytes following IEND.
 const trailer=Buffer.alloc(1025,0x61),data=Buffer.concat([metadata,trailer]);
 const chunks=data.toString('base64').match(/.{1,76}/g).map(part=>JSON.stringify(part)).join(' ');
 const result=render(`(kicad_sch (image (at 4 5) (data ${chunks})))`);
 assert.equal(result.warnings.some(warning=>warning.includes('image was not rendered')),false);
 assert.equal(result.primitives.find(p=>p.type==='image')?.dataUrl,'data:image/png;base64,'+png.toString('base64'));
});

test('bounded inline BMPs and legacy hexadecimal bitmap blocks share image validation',()=>{
 const bmp=Buffer.alloc(62);
 bmp.write('BM');bmp.writeUInt32LE(bmp.length,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);
 bmp.writeInt32LE(2,18);bmp.writeInt32LE(1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);
 const modern=render(imageSource(bmp)).primitives.find(p=>p.type==='image');
 assert.equal(modern?.dataUrl,'data:image/bmp;base64,'+bmp.toString('base64'));
 assert.deepEqual([modern.pixelWidth,modern.pixelHeight],[2,1]);
 const hex=bmp.toString('hex').match(/.{2}/g).join(' ');
 const { parse: parseLegacy }=require('../engine/legacy-kicad.js');
 const legacy=build(parseLegacy(`EESchema Schematic File Version 4
$Bitmap
Pos 1000 2000
Scale 2
Data
${hex}
EndData
$EndBitmap
$EndSCHEMATC`));
 const image=legacy.primitives.find(p=>p.type==='image');
 assert.equal(image?.dataUrl,modern.dataUrl);
 near((image.points[0].x+image.points[2].x)/2,25.4);
 near((image.points[0].y+image.points[2].y)/2,50.8);
 const invalid=Buffer.from(bmp);invalid.writeUInt32LE(1,30);
 assert.equal(render(imageSource(invalid)).primitives.some(p=>p.type==='image'),false);
 const external=render('(kicad_sch (image (at 0 0) (file "picture.bmp")))');
 assert.match(external.warnings.join(' '),/No inline bitmap data/);
});

test('saved lib_name selects embedded overrides across rotation and mirror states',()=>{
 for(const angle of [0,90,180,270])for(const mirror of ['', 'x', 'y']){
  const place=`(at 50 60 ${angle}) ${mirror?'(mirror '+mirror+')':''} (unit 1) (uuid placed)`;
  const library='(lib_symbols (symbol "Lib:Original" (symbol "Original_1_1" (circle (center 7 9) (radius 2)))) (symbol "SavedOverride" (symbol "SavedOverride_1_1" (polyline (pts (xy 1 2) (xy 3 4))))))';
  const overridden=render(`(kicad_sch ${library} (symbol (lib_id "Lib:Original") (lib_name "SavedOverride") ${place}))`);
  const direct=render(`(kicad_sch ${library} (symbol (lib_id "SavedOverride") ${place}))`);
  assert.deepEqual(overridden.primitives,direct.primitives,`${angle} mirror ${mirror}`);
  assert.equal(overridden.primitives.some(p=>p.type==='circle'),false);
  assert.ok(overridden.primitives.some(p=>p.type==='line'||p.type==='polyline'));
 }
 const missingOriginal=render('(kicad_sch (lib_symbols (symbol "Saved" (symbol "Saved_1_1" (circle (center 0 0) (radius 1))))) (symbol (lib_id "Missing:Original") (lib_name "Saved") (at 10 20) (uuid alias)))');
 assert.ok(missingOriginal.primitives.some(p=>p.type==='circle'&&p.uuid==='alias'));
 assert.equal(missingOriginal.warnings.some(w=>/unavailable|No drawable/.test(w)),false);
});
