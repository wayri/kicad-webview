import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingSurface,paintLoading} from '../src/viewer-loading.mjs';
class Element {constructor(){this.children=[];this.attrs={};}append(...nodes){this.children.push(...nodes);}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}remove(){this.removed=true;}}
const fixture=()=>({root:new Element(),surface:new Element(),host:{ownerDocument:{createElement:()=>new Element()}}});
test('loading is host-local, staged, cancellable once, and protected from stale completion',()=>{
 const v=fixture(),ui=createLoadingSurface(v),pane=v.surface.children[0],stop=pane.children[3];let stopped=0;
 ui.show(1,()=>stopped++);assert.equal(pane.hidden,false);assert.equal(v.root.attrs['aria-busy'],'true');
 ui.stage(1,'Fetching design…');assert.equal(pane.children[1].textContent,'Fetching design…');stop.onclick();assert.equal(stopped,1);assert.equal(stop.disabled,true);
 ui.show(2,()=>{});ui.stage(1,'Stale');ui.hide(1);assert.equal(pane.hidden,false);assert.equal(pane.children[1].textContent,'Preparing drawing…');
 ui.hide(2);assert.equal(pane.hidden,true);assert.equal(stop.onclick,null);assert.equal(v.root.attrs['aria-busy'],'false');ui.dispose();assert.ok(pane.removed);assert.equal(v.root.attrs['aria-busy'],'false');
});
test('loading paint fallback handles cancellation and a paused animation frame',async()=>{
 const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>4;let cancelled=0;globalThis.cancelAnimationFrame=()=>cancelled++;
 try{const c=new AbortController(),pending=paintLoading(c.signal);c.abort();await assert.rejects(pending,{name:'AbortError'});await paintLoading(new AbortController().signal);assert.equal(cancelled,2);}
 finally{globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel;}
});
