import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildProjectHierarchy} from '../src/project-hierarchy.mjs';
const quote=value=>JSON.stringify(value);
const sheet=(file,name='Child',uuid='sheet')=>'(sheet (uuid '+quote(uuid)+') (property "Sheetname" '+quote(name)+') (property "Sheetfile" '+quote(file)+'))';
const sch=(links=[],title='')=>'(kicad_sch (uuid "document") '+(title?'(title_block (title '+quote(title)+'))':'')+links.join(' ')+')';
const file=(path,links=[],title='')=>({path,source:sch(links,title)});
function nodes(model){const result=[],pending=[...model.roots];while(pending.length){const node=pending.pop();result.push(node);pending.push(...node.children);}return result;}

test('saved sheet links resolve listed relative paths and repeated instances keep independent subtrees',()=>{
 const model=buildProjectHierarchy([file('main.kicad_sch',[sheet('./sub/power.kicad_sch','Phase A','a'),sheet('sub/power.kicad_sch','Phase B','b')],'Inverter'),file('sub/power.kicad_sch',[sheet('../sense.kicad_sch','Sense','sense')]),file('sense.kicad_sch')]);
 assert.equal(model.schema,'kicad-webview.hierarchy/v1');assert.equal(model.rootPath,'main.kicad_sch');assert.equal(model.rootReason,'unique-root');assert.equal(model.roots[0].name,'Inverter');
 const [a,b]=model.roots[0].children;assert.equal(a.name,'Phase A');assert.equal(b.name,'Phase B');assert.notEqual(a.id,b.id);assert.equal(a.path,b.path);assert.equal(a.uuid,'a');assert.equal(b.uuid,'b');assert.equal(a.children[0].path,'sense.kicad_sch');assert.notEqual(a.children[0].id,b.children[0].id);assert.equal(model.stats.instances,5);assert.equal(model.stats.truncated,false);
});

test('root precedence is explicit, schematic entry, matching PCB entry and unique graph root',()=>{
 const files=[file('project.kicad_sch',[sheet('child.kicad_sch')]),file('child.kicad_sch')];
 assert.equal(buildProjectHierarchy(files,{root:'child.kicad_sch',entry:'project.kicad_sch'}).rootReason,'explicit');assert.equal(buildProjectHierarchy(files,{root:'child.kicad_sch'}).rootPath,'child.kicad_sch');
 assert.equal(buildProjectHierarchy(files,{entry:'child.kicad_sch'}).rootReason,'entry');assert.equal(buildProjectHierarchy(files,{entry:'project.kicad_pcb'}).rootReason,'matching-entry');assert.equal(buildProjectHierarchy(files).rootReason,'unique-root');
 const sameFolder=buildProjectHierarchy([file('a/project.KICAD_SCH'),file('b/project.kicad_sch')],{entry:'a/project.KICAD_PCB'});assert.equal(sameFolder.rootPath,'a/project.KICAD_SCH');assert.equal(sameFolder.rootReason,'matching-entry');
 const moved=buildProjectHierarchy([file('schematics/project.kicad_sch')],{entry:'pcb/project.kicad_pcb'});assert.equal(moved.rootReason,'matching-entry');
 assert.throws(()=>buildProjectHierarchy(files,{root:'missing.kicad_sch'}),/explicit hierarchy root/);
});

test('ambiguous roots stay a forest and explicit roots retain disconnected components',()=>{
 const files=[file('one.kicad_sch',[sheet('shared.kicad_sch')]),file('two.kicad_sch',[sheet('shared.kicad_sch')]),file('shared.kicad_sch'),file('loose.kicad_sch')];
 const forest=buildProjectHierarchy(files);assert.equal(forest.rootPath,null);assert.equal(forest.rootReason,'forest');assert.deepEqual(forest.roots.map(n=>n.path),['one.kicad_sch','two.kicad_sch','loose.kicad_sch']);
 const explicit=buildProjectHierarchy(files,{root:'one.kicad_sch'});assert.deepEqual(explicit.roots.map(n=>[n.path,n.role]),[['one.kicad_sch','root'],['two.kicad_sch','unlinked'],['loose.kicad_sch','unlinked']]);
});

test('cycles are detected per instance ancestry without suppressing repeated noncyclic references',()=>{
 const model=buildProjectHierarchy([file('a.kicad_sch',[sheet('b.kicad_sch','B1','b1'),sheet('b.kicad_sch','B2','b2')]),file('b.kicad_sch',[sheet('a.kicad_sch','A','a')]),file('root.kicad_sch')]);
 assert.equal(model.rootPath,'root.kicad_sch');const a=model.roots.find(n=>n.path==='a.kicad_sch');assert.equal(a.role,'unlinked');assert.equal(a.children.length,2);assert.ok(a.children.every(n=>n.children[0].status==='cycle'));assert.ok(a.children.every(n=>n.children[0].path==='a.kicad_sch'));assert.match(model.warnings.join(' '),/cycle/);
 const onlyCycle=buildProjectHierarchy([file('a.kicad_sch',[sheet('a.kicad_sch')])]);assert.equal(onlyCycle.rootReason,'forest');assert.equal(onlyCycle.roots[0].children[0].status,'cycle');
});

test('missing and unsafe child references are markers, never guessed file links',()=>{
 const bad=['../escape.kicad_sch','/absolute.kicad_sch','C:/secret.kicad_sch','folder\\windows.kicad_sch','%2e%2e/secret.kicad_sch','board.kicad_pcb','$'+'{KIPRJMOD}/child.kicad_sch'];
 const model=buildProjectHierarchy([file('main.kicad_sch',[sheet('absent.kicad_sch'),...bad.map(name=>sheet(name))]),{path:'board.kicad_pcb',source:'ignored'}]);const children=model.roots[0].children;
 assert.equal(children[0].status,'missing');assert.equal(children[0].path,null);assert.ok(children.slice(1).every(n=>n.status==='invalid'&&n.path===null));assert.equal(model.stats.files,1);
 const exact=buildProjectHierarchy([file('main.kicad_sch',[sheet('CHILD.kicad_sch')]),file('child.kicad_sch')],{root:'main.kicad_sch'});assert.equal(exact.roots[0].children[0].status,'missing');assert.equal(exact.roots[1].role,'unlinked');
});

test('parse and HTTP read errors remain visible and never use fabricated source',()=>{
 const model=buildProjectHierarchy([file('root.kicad_sch',[sheet('bad.kicad_sch'),sheet('network.kicad_sch')]),{path:'bad.kicad_sch',source:'(kicad_sch'},{path:'network.kicad_sch',error:'HTTP 404'}]);
 assert.deepEqual(model.roots[0].children.map(n=>n.status),['error','error']);assert.equal(model.files.find(f=>f.path==='network.kicad_sch').error,'HTTP 404');assert.match(model.files.find(f=>f.path==='bad.kicad_sch').error,/Incomplete/);
 const wrong=buildProjectHierarchy([{path:'board.kicad_sch',source:'(kicad_pcb)'}]);assert.equal(wrong.roots[0].status,'error');assert.throws(()=>buildProjectHierarchy([{path:'missing.kicad_sch'}]),/source text or/);
 const deep=buildProjectHierarchy([{path:'deep.kicad_sch',source:'('.repeat(100)+')'.repeat(100)}]);assert.equal(deep.roots[0].status,'error');assert.match(deep.files[0].error,/deep/);
});

test('only direct saved sheet forms count and duplicate filename properties remain invalid',()=>{
 const source='(kicad_sch (lib_symbols (sheet (property "Sheetfile" "fake.kicad_sch"))) (sheet (tstamp "legacy") (property "Sheet name" "Actual") (property "Sheet file" "child.kicad_sch")) (sheet (property "Sheetfile" "child.kicad_sch") (property "Sheetfile" "other.kicad_sch")))';
 const model=buildProjectHierarchy([{path:'root.kicad_sch',source},file('child.kicad_sch')]);assert.equal(model.files[0].sheetCount,2);assert.equal(model.roots[0].children[0].name,'Actual');assert.equal(model.roots[0].children[0].uuid,'legacy');assert.equal(model.roots[0].children[1].status,'invalid');
});

test('input limits and unsafe/duplicate file paths reject before graph construction',()=>{
 for(const path of ['../bad.kicad_sch','/bad.kicad_sch','C:/bad.kicad_sch','a//b.kicad_sch','a\\b.kicad_sch','a%20b.kicad_sch'])assert.throws(()=>buildProjectHierarchy([file(path)]),/safe relative paths/);
 assert.throws(()=>buildProjectHierarchy([file('same.kicad_sch'),file('SAME.kicad_sch')]),/unique/);assert.throws(()=>buildProjectHierarchy([file('café.kicad_sch'),file('cafe\u0301.kicad_sch')]),/unique/);
 assert.throws(()=>buildProjectHierarchy(Array.from({length:257},(_,i)=>({path:'asset'+i+'.png'}))),/256/);
 assert.throws(()=>buildProjectHierarchy([{path:'big.kicad_sch',source:' '.repeat(8*1024*1024+1)}]),/8 MiB/);
 const source=' '.repeat(8*1024*1024);assert.throws(()=>buildProjectHierarchy(Array.from({length:9},(_,i)=>({path:'s'+i+'.kicad_sch',source}))),/64 MiB/);
});

test('depth and instance limits are explicit and disconnected roots retain reserved slots',()=>{
 const chain=Array.from({length:35},(_,i)=>file('s'+i+'.kicad_sch',i<34?[sheet('s'+(i+1)+'.kicad_sch')]:[]));const deep=buildProjectHierarchy(chain,{root:'s0.kicad_sch'});assert.equal(deep.stats.truncated,true);assert.equal(deep.roots.length,1);assert.equal(nodes(deep).at(-1).status,'truncated');assert.equal(nodes(deep).length,33);
 const many=buildProjectHierarchy([file('main.kicad_sch',Array.from({length:5000},(_,i)=>sheet('leaf.kicad_sch','Repeated','s'+i))),file('leaf.kicad_sch'),file('disconnected.kicad_sch')],{root:'main.kicad_sch'});
 assert.equal(many.stats.truncated,true);assert.ok(many.stats.instances<=4096);assert.equal(nodes(many).length,many.stats.instances);assert.equal(many.roots.at(-1).path,'disconnected.kicad_sch');assert.equal(many.roots.at(-1).role,'unlinked');assert.ok(nodes(many).some(n=>n.status==='truncated'));assert.equal(new Set(nodes(many).map(n=>n.id)).size,many.stats.instances);
});

test('labels and diagnostics are bounded and explicit unavailable files remain serializable',()=>{
 const model=buildProjectHierarchy([file('a.kicad_sch',[sheet('missing.kicad_sch','n'.repeat(900),'u'.repeat(200))],'t'.repeat(900))]);const child=model.roots[0].children[0];assert.ok(model.roots[0].name.length<=512);assert.ok(child.name.length<=512);assert.equal(child.uuid,null);assert.match(model.warnings.join(' '),/shortened/);
 const failures=buildProjectHierarchy(Array.from({length:256},(_,i)=>({path:'failure'+i+'.kicad_sch',error:'Error '+i+' '+ 'x'.repeat(2000)})));assert.ok(failures.warnings.length<=128);assert.ok(failures.files.every(f=>f.error.length<=512));assert.equal(failures.roots.length,256);assert.equal(JSON.parse(JSON.stringify(failures)).stats.instances,256);
 const empty=buildProjectHierarchy([{path:'board.kicad_pcb',source:'ignored'}]);assert.deepEqual(empty.roots,[]);assert.equal(empty.rootPath,null);assert.equal(empty.rootReason,'forest');assert.equal(empty.stats.files,0);
});

test('retained inverter fixture yields saved child sheets without online resolution',()=>{
 const directory=new URL('../fixtures/inverter/',import.meta.url),files=fs.readdirSync(directory).filter(name=>/\.kicad_sch$/.test(name)).map(path=>({path,source:fs.readFileSync(new URL(encodeURIComponent(path),directory),'utf8')}));
 const model=buildProjectHierarchy(files,{entry:'3PD+IB.kicad_pcb'});assert.equal(model.rootPath,'3PD+IB.kicad_sch');assert.equal(model.rootReason,'matching-entry');assert.equal(model.roots[0].children.length,6);assert.ok(model.roots[0].children.every(n=>n.status==='ok'&&n.path));assert.equal(model.stats.truncated,false);
});


test('a leaf at the depth boundary is complete rather than a truncated branch',()=>{
 const chain=Array.from({length:33},(_,i)=>file('leaf'+i+'.kicad_sch',i<32?[sheet('leaf'+(i+1)+'.kicad_sch')]:[]));const model=buildProjectHierarchy(chain,{root:'leaf0.kicad_sch'});assert.equal(nodes(model).length,33);assert.equal(nodes(model).at(-1).status,'ok');assert.equal(model.stats.truncated,false);
});
test('obviously oversized source rejects before allocating UTF-8 bytes',()=>{
 const Original=globalThis.TextEncoder;let encoded=0;globalThis.TextEncoder=class extends Original{encode(value){encoded++;return super.encode(value);}};
 try{assert.throws(()=>buildProjectHierarchy([{path:'huge.kicad_sch',source:' '.repeat(8*1024*1024+1)}]),/8 MiB/);assert.equal(encoded,0);}finally{globalThis.TextEncoder=Original;}
});
