import test from 'node:test';import assert from 'node:assert/strict';
import {linkViewers,linkedPart,linkSelection} from '../src/linked-viewers.mjs';
class Viewer extends EventTarget{
 constructor({kind='pcb',path='board.kicad_pcb',source='saved-board',parts=[],nets=[]}={}){super();Object.assign(this,{kind,path,source,parts,nets,view:kind,calls:[],selection:null});}
 getParts(){if(this.disposed)throw Error('disposed');return this.parts;}getNets(){if(this.disposed)throw Error('disposed');return this.nets;}getSelection(){return this.selection;}
 choose(item){this.selection=item;this.dispatchEvent(new CustomEvent('select',{detail:{item,path:this.path,view:this.view}}));}
 selectPart(id,options){this.calls.push({type:'part',id,options});const part=this.parts.find(p=>p.id===id);if(!part)return false;this.choose({uuid:part.uuid,kind:'part'});return true;}
 selectNet(id,options){this.calls.push({type:'net',id,options});const net=this.nets.find(n=>n.id===id||n.name===id);if(!net)return false;this.choose({kind:'net',id:net.id,netName:net.name});return true;}
 clearSelection(){this.calls.push({type:'clear'});this.choose(null);}
}
const footprint={id:'pcb#fp',uuid:'fp',reference:'U2',schematicUuid:'symbol'},symbol={id:'sch#symbol',uuid:'symbol',reference:'U2'};
test('exact saved component relationships cross-select schematic, layout and 3D without feedback and with part focus in 3D',()=>{
 const pcb=new Viewer({parts:[footprint]}),three=new Viewer({parts:[footprint]}),sch=new Viewer({kind:'schematic',path:'driver.kicad_sch',source:'saved-sheet',parts:[symbol]});three.view='3d';
 const group=linkViewers([pcb,three,sch]),events=[];group.addEventListener('link',event=>events.push(event.detail));
 pcb.choose({uuid:'fp',kind:'part'});assert.deepEqual(three.calls,[{type:'part',id:'pcb#fp',options:{locate:true}}]);assert.equal(sch.calls[0].id,'sch#symbol');assert.equal(pcb.calls.length,0);assert.equal(events.length,2);
 sch.choose({uuid:'symbol',kind:'part'});assert.equal(pcb.calls.length,1);assert.equal(three.calls.length,2);assert.equal(sch.calls.length,1);
 group.dispose();pcb.choose({uuid:'fp'});assert.equal(three.calls.length,2);
});
test('duplicate identities and reference-only coincidences never cross-probe a part',()=>{
 const pcb=new Viewer({parts:[footprint]}),sch=new Viewer({kind:'schematic',path:'driver.kicad_sch',parts:[symbol,{...symbol,id:'second'}]});
 assert.equal(linkedPart(pcb,sch,{uuid:'fp'}),null);sch.parts=[{...symbol,uuid:'unrelated'}];assert.equal(linkedPart(pcb,sch,{reference:'U2'}),null);
 pcb.parts=[footprint,{...footprint,id:'duplicate'}];sch.parts=[symbol];assert.equal(linkedPart(pcb,sch,{uuid:'fp'}),null);
});
test('nets and traces cross-select only exact current saved drawings; sheet-local names are never guessed',()=>{
 const nets=[{id:'board#net1',name:'GND'}],pcb=new Viewer({nets}),three=new Viewer({nets}),other=new Viewer({source:'different-board',nets}),sch=new Viewer({kind:'schematic',path:'sheet.kicad_sch',source:'sheet',nets});three.view='3d';
 const group=linkViewers([pcb,three,other,sch]);pcb.choose({kind:'net',id:'board#net1',netName:'GND'});assert.equal(three.calls[0].type,'net');assert.equal(other.calls.length,0);assert.equal(sch.calls.length,0);
 pcb.choose({kind:'segment',uuid:'track',netName:'GND'});assert.equal(three.calls.length,2);
 pcb.choose({kind:'net',netName:'absent'});assert.equal(three.calls.length,2);
 other.parts=[footprint];pcb.parts=[footprint];pcb.choose({uuid:'fp'});assert.equal(other.calls.length,0);group.dispose();
});
test('terminal selection maps to its saved owning component; no pin number or net name is invented',()=>{
 const pcb=new Viewer({parts:[footprint]}),sch=new Viewer({kind:'schematic',path:'driver.kicad_sch',source:'sheet',parts:[symbol]});const group=linkViewers([pcb,sch]);
 pcb.choose({kind:'pad',uuid:'pad',ownerUuid:'fp',pinNumber:'2'});assert.equal(sch.calls[0].type,'part');assert.equal(sch.calls[0].id,symbol.id);group.dispose();
});
test('clear propagates once, paused groups stop forwarding, and disposed/unloaded/stale viewers are ignored',()=>{
 const a=new Viewer(),b=new Viewer(),c=new Viewer({source:''}),group=linkViewers([a,b,c]);
 a.choose(null);assert.equal(b.calls.length,1);assert.equal(b.calls[0].type,'clear');assert.equal(a.calls.length,0);assert.equal(c.calls.length,0);
 group.setEnabled(false);assert.equal(group.enabled,false);a.choose(null);assert.equal(b.calls.length,1);group.setEnabled(true);
 a.dispatchEvent(new CustomEvent('select',{detail:{item:null,path:'stale.kicad_pcb',view:'pcb'}}));assert.equal(b.calls.length,1);
 a.dispatchEvent(new CustomEvent('select',{detail:{item:null,path:a.path,view:'3d'}}));assert.equal(b.calls.length,1);
 b.disposed=true;a.choose(null);assert.equal(b.calls.length,1);b.disposed=false;
 group.dispose();group.dispose();assert.equal(group.enabled,false);assert.throws(()=>group.setEnabled(true),/disposed/);a.choose(null);assert.equal(b.calls.length,1);
});
test('one failed target does not break other links; linkerror reports active target failures',()=>{
 const a=new Viewer(),b=new Viewer(),c=new Viewer(),group=linkViewers([a,b,c]),errors=[];b.clearSelection=()=>{throw Error('unavailable');};group.addEventListener('linkerror',event=>errors.push(event.detail));
 a.choose(null);assert.equal(errors.length,1);assert.equal(errors[0].target,b);assert.equal(c.calls.length,1);group.dispose();
});
test('explicit membership is bounded, validated and copied',()=>{
 const a=new Viewer(),b=new Viewer(),members=[a,b],group=linkViewers(members,{enabled:false});members.length=0;assert.equal(group.enabled,false);group.setEnabled(true);a.choose(null);assert.equal(b.calls.length,1);group.dispose();
 for(const input of [[],[a],[a,a],Array.from({length:9},()=>new Viewer()),[a,{}]])assert.throws(()=>linkViewers(input),TypeError);
});

test('shared single-selection helper returns the applied mapping and ignores inactive peers',()=>{
 const pcb=new Viewer({parts:[footprint]}),sch=new Viewer({kind:'schematic',path:'driver.kicad_sch',source:'sheet',parts:[symbol]});
 assert.equal(linkSelection(pcb,sch,{uuid:'fp'}),'part');assert.equal(linkSelection(pcb,sch,null),'clear');assert.equal(linkSelection(pcb,sch,undefined),null);
 sch.disposed=true;assert.equal(linkSelection(pcb,sch,null),null);assert.equal(sch.calls.length,2);
});
test('disposal during a target update stops later forwarding and does not announce success afterward',()=>{
 const a=new Viewer(),b=new Viewer(),c=new Viewer(),group=linkViewers([a,b,c]);let announcements=0;
 group.addEventListener('link',()=>announcements++);b.addEventListener('select',()=>group.dispose());a.choose(null);
 assert.equal(b.calls.length,1);assert.equal(c.calls.length,0);assert.equal(announcements,0);
});

test('same-drawing pad linkage preserves the exact object before its part or net fallback',()=>{
 const pcb=new Viewer({parts:[footprint],nets:[{id:'g',name:'GND'}]}),three=new Viewer({parts:[footprint],nets:[{id:'g',name:'GND'}]});three.view='3d';
 three.selectObject=(id,options)=>{three.calls.push({type:'object',id,options});three.choose({kind:'pad',uuid:id,ownerUuid:'fp',pinNumber:'2'});return true;};
 const group=linkViewers([pcb,three]);const events=[];group.addEventListener('link',event=>events.push(event.detail.kind));
 pcb.choose({kind:'pad',uuid:'pad-exact',ownerUuid:'fp',pinNumber:'2',netName:'GND'});
 assert.deepEqual(three.calls,[{type:'object',id:'pad-exact',options:{locate:true,pinNumber:'2'}}]);assert.deepEqual(events,['object']);assert.equal(pcb.calls.length,0);group.dispose();
});
test('same-drawing traces, arcs, vias and zones preserve saved UUIDs; pins use saved owner and number',()=>{
 const source=new Viewer(),target=new Viewer();target.selectObject=(id,options)=>{target.calls.push({type:'object',id,options});return true;};
 for(const kind of ['segment','track','arc','via','zone'])assert.equal(linkSelection(source,target,{kind,uuid:kind+'-uuid',netName:'GND'}),'object');
 assert.deepEqual(target.calls.map(call=>call.id),['segment-uuid','track-uuid','arc-uuid','via-uuid','zone-uuid']);
 const sheet=new Viewer({kind:'schematic',path:'sheet.kicad_sch',source:'sheet'}),other=new Viewer({kind:'schematic',path:'sheet.kicad_sch',source:'sheet'});
 other.selectObject=(id,options)=>{other.calls.push({id,options});return true;};assert.equal(linkSelection(sheet,other,{kind:'pin',ownerUuid:'symbol',pinNumber:'7'}),'object');assert.deepEqual(other.calls,[{id:'symbol',options:{locate:false,pinNumber:'7'}}]);
});
test('exact object lookup never crosses drawings, and failed lookup can use the documented owner fallback',()=>{
 const pcb=new Viewer({parts:[footprint]}),same=new Viewer({parts:[footprint]}),sheet=new Viewer({kind:'schematic',path:'driver.kicad_sch',source:'sheet',parts:[symbol]});
 same.selectObject=()=>false;sheet.selectObject=()=>{throw Error('must not guess an object across drawings');};
 const pad={kind:'pad',uuid:'pad',ownerUuid:'fp',pinNumber:'2'};assert.equal(linkSelection(pcb,same,pad),'part');assert.equal(same.calls[0].id,footprint.id);
 assert.equal(linkSelection(pcb,sheet,pad),'part');assert.equal(sheet.calls[0].id,symbol.id);
});
