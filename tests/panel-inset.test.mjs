import test from 'node:test';
import assert from 'node:assert/strict';
import {KiCadViewer} from '../src/kicad-viewer.mjs';
import {ViewerInset} from '../src/viewer-inset.mjs';
import {createPanelSizing,panelWidth} from '../src/viewer-panels.mjs';
import {linkViewers} from '../src/linked-viewers.mjs';

class Element extends EventTarget {
 constructor(doc,tag='div'){super();this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.clientWidth=800;this.scrollTop=0;}
 append(...children){for(const n of children){n.remove?.();this.children.push(n);n.parentNode=this;}}
 replaceChildren(...children){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...children);}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}
 setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}
 focus(){this.ownerDocument.activeElement=this;}
}
function doc(){const d={baseURI:'https://example.test/',createElement:tag=>new Element(d,tag)};return d;}
function pointer(type,values){const e=new Event(type,{cancelable:true});Object.assign(e,values);return e;}
const source='(kicad_pcb (version 20240108) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)) (footprint "Test:R" (layer "F.Cu") (at 10 20) (uuid "part") (property "Reference" "R1") (property "Value" "1k") (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (uuid "pad"))))';
const mount=globalThis.KiCadOwnedCanvas.mount;
globalThis.KiCadOwnedCanvas.mount=(host,options)=>Object.assign(new EventTarget(),{
 viewport:{camera:{center:{x:0,y:0},zoom:1}},options,
 setDocument(design){this.design=design;this.visibleLayers=new Set(design.layers);},draw(){},zoom_to_board(){},
 setNetNames(){},setNetHighlight(){},select(hit){this.dispatchEvent(new CustomEvent('kicad:select',{detail:{item:hit?.context||null}}));},dispose(){this.disposed=true;}
});
test.after(()=>globalThis.KiCadOwnedCanvas.mount=mount);

test('panel sizing remembers preference through narrow hosts without refitting',()=>{
 const d=doc(),v={host:new Element(d),root:new Element(d),emit(){},renderer:{draw(){throw Error('Panel sizing must not redraw');}}};
 const panel=new Element(d);panel.hidden=false;const p=createPanelSizing(v,panel);
 p.setWidth(420);v.root.clientWidth=280;p.sync();assert.deepEqual(p.getState(),{open:true,preferredWidth:420,width:264});
 v.root.clientWidth=800;v.root.clientHeight=240;p.sync();assert.equal(p.getState().width,420);assert.equal(panel.getAttribute('data-short'),'true');
 v.root.clientHeight=600;p.sync();assert.equal(panel.getAttribute('data-short'),'false');
 assert.throws(()=>p.setWidth(NaN));assert.equal(p.getState().preferredWidth,420);
 p.handle.dispatchEvent(pointer('pointerdown',{button:0,pointerId:7,clientX:100}));
 p.handle.dispatchEvent(pointer('pointermove',{pointerId:8,clientX:40}));assert.equal(p.getState().preferredWidth,420);
 p.handle.dispatchEvent(pointer('pointercancel',{pointerId:7}));p.handle.dispatchEvent(pointer('pointermove',{pointerId:7,clientX:40}));assert.equal(p.getState().preferredWidth,420);
 p.handle.dispatchEvent(pointer('keydown',{key:'Home'}));assert.equal(p.getState().preferredWidth,240);
 p.dispose();p.handle.dispatchEvent(pointer('keydown',{key:'End'}));assert.equal(p.getState().preferredWidth,240);
 assert.equal(panelWidth(310,12),0);
});

test('selection preserves inspector scroll and resizing does not change the camera',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d));await v.loadSource(source,{path:'board.kicad_pcb'});
 v.selectPart('part');v.inspector.properties.scrollTop=137;const camera=v.getCamera();v.setInspectorWidth(410);v.selectObject('pad');
 assert.equal(v.inspector.properties.scrollTop,137);assert.deepEqual(v.getCamera(),camera);assert.equal(v.getPanelState().preferredWidth,410);v.dispose();
});

test('context preview forwards exact identity, suppresses properties, closes on replacement and releases slots',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d));await v.loadSource(source,{path:'board.kicad_pcb'});v.selectPart('part');v.setInspectorOpen(false);
 const a=new ViewerInset(new Element(d),{parent:v});assert.equal(await a.ready,true);assert.equal(a.viewer.getSelection().uuid,'part');
 v.setTheme('light');assert.equal(a.viewer.theme,'light');v.setHighlightStyle('bright',{color:'source'});assert.deepEqual(a.viewer.getHighlightStyle(),v.getHighlightStyle());
 a.viewer.selectObject('pad');assert.equal(v.getSelection().uuid,'pad');assert.equal(v.inspector.isOpen(),false);assert.equal(v.inspectOnSelect,true);
 const b=new ViewerInset(new Element(d),{parent:v});await b.ready;
 assert.throws(()=>new ViewerInset(new Element(d),{parent:v}),/maximum two/);b.dispose();
 const c=new ViewerInset(new Element(d),{parent:v});await c.ready;
 await v.loadSource(source+'\n',{path:'board.kicad_pcb'});assert.equal(a.disposed,true);assert.equal(c.disposed,true);assert.equal(a.viewer.disposed,true);v.dispose();
});

test('a parent disposed before preview initialization never creates a child viewer',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d));await v.loadSource(source,{path:'board.kicad_pcb'});
 const a=new ViewerInset(new Element(d),{parent:v});v.dispose();assert.equal(await a.ready,false);assert.equal(a.disposed,true);assert.equal(a.viewer,undefined);
});


test('existing linked group and two contextual insets synchronize exact terminals, nets and clear without feedback',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),peer=new KiCadViewer(new Element(d));
 const netSource=source.replace('(footprint','(net 1 "GND") (segment (start 1 1) (end 5 1) (width .25) (layer "F.Cu") (net 1) (uuid "route")) (footprint').replace('(uuid "pad")','(net 1 "GND") (uuid "pad")');
 let a,b,group;const seen=new Map();
 try{await parent.loadSource(netSource,{path:'board.kicad_pcb'});await peer.loadSource(netSource,{path:'board.kicad_pcb'});group=linkViewers([parent,peer]);
 a=new ViewerInset(new Element(d),{parent,sourceViewer:peer});await a.ready;b=new ViewerInset(new Element(d),{parent});await b.ready;
 for(const v of [parent,peer,a.viewer,b.viewer]){seen.set(v,0);v.addEventListener('select',()=>{const count=seen.get(v)+1;seen.set(v,count);assert.ok(count<40,'selection dispatch must remain bounded in linked groups plus insets');});}
 parent.setInspectorOpen(false);peer.setInspectorOpen(false);a.viewer.selectObject('pad');
 for(const v of [parent,peer,a.viewer,b.viewer])assert.equal(v.getSelection().uuid,'pad');assert.equal(parent.inspector.isOpen(),false);assert.equal(parent.inspectOnSelect,true);
 const net=parent.getNets().find(n=>n.name==='GND');assert.ok(net);peer.selectNet(net.id);
 for(const v of [parent,peer,a.viewer,b.viewer])assert.equal(v.getSelection().netName,'GND');
 b.viewer.clearSelection();for(const v of [parent,peer,a.viewer,b.viewer])assert.equal(v.getSelection(),null);
 const child=a.viewer;a.dispose();const count=seen.get(child);parent.selectPart('part');assert.equal(seen.get(child),count);assert.equal(child.disposed,true);
 }finally{group?.dispose();a?.dispose();b?.dispose();parent.dispose();peer.dispose();}
});

test('context source identity excludes another saved drawing and rejects duplicate part UUIDs',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),other=new KiCadViewer(new Element(d));let a,b;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});await other.loadSource(source.replace('"part"','"unrelated"'),{path:'other.kicad_pcb'});
 a=new ViewerInset(new Element(d),{parent,sourceViewer:other});await a.ready;parent.selectPart('part');assert.equal(a.viewer.getSelection(),null,'matching reference text cannot select an unrelated saved board');a.dispose();
 const duplicate=source.slice(0,-1)+' (footprint "Test:Other" (layer "F.Cu") (at 30 40) (uuid "part") (property "Reference" "R2") (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (uuid "other-pad"))))';
 await parent.loadSource(duplicate,{path:'duplicate.kicad_pcb'});b=new ViewerInset(new Element(d),{parent});await b.ready;
 assert.equal(parent.selectPart('part'),false);parent.dispatchEvent(new CustomEvent('select',{detail:{item:{kind:'part',uuid:'part'},path:parent.path,view:parent.view}}));assert.equal(b.viewer.getSelection(),null);assert.match(parent.inspector.getWarnings().join(' '),/duplicat/);
 }finally{a?.dispose();b?.dispose();parent.dispose();other.dispose();}
});

test('failed 3D inset readiness releases its slot, mount, child and listeners without fetching',async()=>{
 const old=globalThis.SpikeBoard3D,fetch=globalThis.fetch,d=doc(),parent=new KiCadViewer(new Element(d)),target=new Element(d);let a,b,c,requests=0;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});globalThis.fetch=()=>{requests++;throw Error('No implicit network admission');};globalThis.SpikeBoard3D={mountBoard3D(){throw Error('Unavailable GPU');}};
 a=new ViewerInset(target,{parent,view:'3d'});await assert.rejects(a.ready,/Unavailable GPU/);assert.equal(a.disposed,true);assert.equal(a.viewer.disposed,true);assert.equal(target.children.length,0);
 parent.setTheme('dark');parent.selectPart('part');assert.equal(requests,0);
 b=new ViewerInset(new Element(d),{parent});c=new ViewerInset(new Element(d),{parent});assert.equal(await b.ready,true);assert.equal(await c.ready,true);assert.throws(()=>new ViewerInset(new Element(d),{parent}),/maximum two/);
 }finally{globalThis.SpikeBoard3D=old;globalThis.fetch=fetch;a?.dispose();b?.dispose();c?.dispose();parent.dispose();}
});

test('replacement during 3D inset mounting closes the preview and disposes the rejected renderer exactly once',async()=>{
 const old=globalThis.SpikeBoard3D,d=doc(),parent=new KiCadViewer(new Element(d));let a,disposed=0;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});globalThis.SpikeBoard3D={mountBoard3D(){parent.dispose();return{dispose(){disposed++;}};}};
 a=new ViewerInset(new Element(d),{parent,view:'3d'});assert.equal(await a.ready,false);assert.equal(a.disposed,true);assert.equal(a.viewer.disposed,true);assert.equal(disposed,1);
 }finally{globalThis.SpikeBoard3D=old;a?.dispose();parent.dispose();}
});

test('failed floating preview replacements preserve the working preview and main camera',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),oldRuntime=globalThis.SpikeBoard3D;let current;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});parent.selectPart('part');current=await parent.openInset();const camera=parent.getCamera();
 await assert.rejects(parent.openInset({view:'schematic'}),/match/);
 assert.equal(current.disposed,false);assert.equal(parent.floatingInset,current);assert.deepEqual(parent.getCamera(),camera);
 globalThis.SpikeBoard3D={mountBoard3D(){throw Error('GPU preview unavailable');}};
 await assert.rejects(parent.openInset({view:'3d'}),/GPU preview unavailable/);
 assert.equal(current.disposed,false);assert.equal(parent.floatingInset,current);assert.deepEqual(parent.getCamera(),camera);
 const next=await parent.openInset();assert.equal(next.disposed,false);assert.equal(parent.floatingInset,next);assert.equal(current.disposed,true);
 }finally{globalThis.SpikeBoard3D=oldRuntime;parent.dispose();}
});

test('newest floating request cancels pending replacement without losing the accepted preview early',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),load=KiCadViewer.prototype.loadSource;let release,startedResolve,pending;
 const started=new Promise(resolve=>startedResolve=resolve);
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});const current=await parent.openInset();
 KiCadViewer.prototype.loadSource=function(s,o){if(o?.view==='3d'){startedResolve(this);return new Promise(resolve=>release=()=>resolve(false));}return load.call(this,s,o);};
 pending=parent.openInset({view:'3d'});const pendingViewer=await started;
 assert.equal(current.disposed,false,'accepted preview stays available while replacement prepares');
 const newest=await parent.openInset();assert.equal(pendingViewer.disposed,true);assert.equal(current.disposed,true);assert.equal(newest.disposed,false);
 release();assert.equal(await pending,null);assert.equal(parent.floatingInset,newest);
 }finally{KiCadViewer.prototype.loadSource=load;release?.();if(pending)await pending.catch(()=>{});parent.dispose();}
});

test('preview slot limit rejects replacement without closing either accepted preview',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d));let independent;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});const current=await parent.openInset();independent=new ViewerInset(new Element(d),{parent});await independent.ready;
 await assert.rejects(parent.openInset(),/maximum two/);assert.equal(current.disposed,false);assert.equal(independent.disposed,false);assert.equal(parent.floatingInset,current);
 independent.dispose();const next=await parent.openInset();assert.equal(next.disposed,false);assert.equal(current.disposed,true);
 }finally{independent?.dispose();parent.dispose();}
});

test('closing the accepted preview cancels a pending floating replacement',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),load=KiCadViewer.prototype.loadSource;let release,startedResolve,pending;
 const started=new Promise(resolve=>startedResolve=resolve);
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});const current=await parent.openInset();
 KiCadViewer.prototype.loadSource=function(s,o){if(o?.view==='3d'){startedResolve(this);return new Promise(resolve=>release=()=>resolve(false));}return load.call(this,s,o);};
 pending=parent.openInset({view:'3d'});const pendingViewer=await started;current.dispose();
 assert.equal(pendingViewer.disposed,true);assert.equal(parent.floatingInset,null);assert.equal(parent.pendingFloatingInset,null);
 release();assert.equal(await pending,null);
 }finally{KiCadViewer.prototype.loadSource=load;release?.();if(pending)await pending.catch(()=>{});parent.dispose();}
});

test('a delayed default preview follows the current selection without replaying the stale selection',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d)),load=KiCadViewer.prototype.loadSource;let release,startedResolve,inset;
 const started=new Promise(resolve=>startedResolve=resolve);
 const twoParts=source.slice(0,-1)+' (footprint "Test:Other" (layer "B.Cu") (at 30 40) (uuid "second") (property "Reference" "R2") (pad "1" smd rect (at 0 0) (size 2 2) (layers "B.Cu") (uuid "second-pad"))))';
 try{await parent.loadSource(twoParts,{path:'board.kicad_pcb'});parent.selectPart('part');
 KiCadViewer.prototype.loadSource=function(s,o){if(this!==parent){startedResolve();return new Promise(resolve=>release=()=>resolve(load.call(this,s,o)));}return load.call(this,s,o);};
 inset=new ViewerInset(new Element(d),{parent});await started;parent.selectPart('second');release();await inset.ready;
 assert.equal(parent.getSelection().uuid,'second');assert.equal(inset.viewer.getSelection().uuid,'second');
 }finally{KiCadViewer.prototype.loadSource=load;release?.();inset?.dispose();parent.dispose();}
});

test('explicit initial preview selection and clear never change the parent selection',async()=>{
 const d=doc(),parent=new KiCadViewer(new Element(d));let inset,blank;
 try{await parent.loadSource(source,{path:'board.kicad_pcb'});parent.selectObject('pad');
 inset=new ViewerInset(new Element(d),{parent,selection:{kind:'part',uuid:'part'}});await inset.ready;
 assert.equal(inset.viewer.getSelection().uuid,'part');assert.equal(parent.getSelection().uuid,'pad');
 blank=new ViewerInset(new Element(d),{parent,selection:null});await blank.ready;
 assert.equal(blank.viewer.getSelection(),null);assert.equal(parent.getSelection().uuid,'pad');
 }finally{inset?.dispose();blank?.dispose();parent.dispose();}
});

test('explicit text variables survive contextual preview and cannot mutate after load',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d)),variables={ORG:'Wayri'};
 const sch='(kicad_sch (version 20250114) (uuid "root") (paper "A4") (text "'+String.fromCharCode(36)+'{ORG} = @{2^3}" (at 20 20 0) (effects (font (size 1 1)))))';
 await v.loadSource(sch,{path:'drawing.kicad_sch',textVariables:variables});variables.ORG='Changed';
 assert.ok(v.design.primitives.some(p=>p.text==='Wayri = 8'));assert.equal(v.textVariables.ORG,'Wayri');
 const inset=await v.openInset();assert.ok(inset.viewer.design.primitives.some(p=>p.text==='Wayri = 8'));v.dispose();
});
test('invalid explicit variable dictionaries leave the accepted design intact',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d));await v.loadSource(source,{path:'board.kicad_pcb'});const old=v.design;
 await assert.rejects(v.loadSource(source,{path:'board.kicad_pcb',textVariables:{bad:12}}),/text variables/);assert.equal(v.design,old);assert.equal(v.root.getAttribute('aria-busy'),'false');v.dispose();
});

test('local project settings and loaded hierarchy context reach the public renderer across navigation',async()=>{
 const d=doc(),v=new KiCadViewer(new Element(d));
 const root='(kicad_sch (version 20250114) (uuid "root") (sheet (uuid "child-instance") (at 10 10) (size 10 10) (property "Sheetname" "Amplifier" (at 10 9 0) (effects (font (size 1 1)))) (property "Sheetfile" "child.kicad_sch" (at 10 21 0) (effects (font (size 1 1))))))';
 const child='(kicad_sch (version 20250114) (uuid "child") (text "'+String.fromCharCode(36)+'{ORG} / '+String.fromCharCode(36)+'{SHEETNAME}" (at 20 20 0) (effects (font (size 1 1)))))';
 await v.loadFiles([{path:'project.kicad_pro',source:JSON.stringify({text_variables:{ORG:'Wayri'}})},{path:'root.kicad_sch',source:root},{path:'child.kicad_sch',source:child}],{file:'child.kicad_sch'});
 assert.ok(v.design.primitives.some(p=>p.text==='Wayri / Amplifier'));assert.equal(v.getFiles().length,2);const inset=await v.openInset();assert.ok(inset.viewer.design.primitives.some(p=>p.text==='Wayri / Amplifier'));inset.dispose();
 await v.openFile('root.kicad_sch');await v.openFile('child.kicad_sch');assert.ok(v.design.primitives.some(p=>p.text==='Wayri / Amplifier'));v.dispose();
});
