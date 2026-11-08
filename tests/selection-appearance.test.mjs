
import test from 'node:test';import assert from 'node:assert/strict';
import {createSelectionAppearance} from '../engine/spike/selectionAppearance.mjs';
class Color{constructor(hex=0xffffff){this.setHex(hex);}setHex(h){return this.setRGB((h>>16&255)/255,(h>>8&255)/255,(h&255)/255);}setRGB(r,g,b){Object.assign(this,{r,g,b});return this;}copy(c){return this.setRGB(c.r,c.g,c.b);}fromArray(a,i){return this.setRGB(a[i],a[i+1],a[i+2]);}multiply(c){return this.setRGB(this.r*c.r,this.g*c.g,this.b*c.b);}}
function material(hex){return {color:new Color(hex),emissive:new Color(0),clone(){const m=material(hex);m.color.copy(this.color);return m;},customProgramCacheKey(){return 'original';},dispose(){this.disposed=true;}};}
test('3D net copper receives actual accent material, unrelated geometry desaturates and clear restores originals',()=>{
 const copper={material:material(0x804000),userData:{record:{net:'GND'}}},body={material:material(0x008000),userData:{record:{net:'OTHER'}}};
 const original=copper.material,other=body.material,style=createSelectionAppearance({Color},()=>[copper,body]);
 style.update(r=>r?.net==='GND',true,r=>r?.net==='GND');
 assert.notEqual(copper.material,original);assert.deepEqual(copper.material.color,new Color(0x63e6ee));
 const dim=body.material,shader={fragmentShader:'#include <opaque_fragment>'};dim.onBeforeCompile(shader);assert.match(shader.fragmentShader,/dot\(outgoingLight/);
 assert.equal(original.color.r,128/255);style.restore();assert.equal(copper.material,original);assert.equal(body.material,other);assert.equal(dim.disposed,true);
});
test('instanced pads accent only selected net and restore instance colors and materials on clear',()=>{
 const original=material(0xffffff),colors={array:new Float32Array([.8,.4,0,0,.8,0]),clone(){return {array:this.array.slice()};}};
 const object={material:original,isInstancedMesh:true,instanceColor:colors,userData:{records:[{net:'GND'},{net:'VCC'}]},setColorAt(i,c){this.instanceColor.array.set([c.r,c.g,c.b],i*3);},dispose(){}};
 const style=createSelectionAppearance({Color},()=>[object]);style.update(r=>r.net==='GND',true,r=>r.net==='GND');
 const values=object.instanceColor.array;assert.ok(Math.abs(values[0]-99/255)<1e-6);assert.equal(values[3],values[4]);assert.equal(values[4],values[5]);assert.ok(values[4]<.8);
 style.update(()=>false,false);assert.equal(object.instanceColor,colors);assert.equal(object.material,original);assert.equal(colors.array[0],new Float32Array([.8])[0]);
});
