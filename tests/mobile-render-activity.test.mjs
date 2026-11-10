/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderActivity,observeRenderActivity} from '../engine/spike/renderActivity.mjs';
function fixture(options={}){
  const queue=new Map();let id=0,draws=0;
  const activity=createRenderActivity({...options,request(callback){queue.set(++id,callback);return id;},cancel(id){queue.delete(id);},render(){draws++;options.render?.();}});
  return {activity,queue,get draws(){return draws;},flush(){const callbacks=[...queue.values()];queue.clear();callbacks.forEach(callback=>callback());}};
}
test('offscreen requests stay dirty without scheduling and resume as one coalesced frame',()=>{
  const f=fixture();f.activity.setState({intersecting:false});
  for(let i=0;i<100;i++)f.activity.invalidate();
  assert.equal(f.queue.size,0);assert.equal(f.draws,0);assert.equal(f.activity.stats().suppressedInvalidations,100);assert.equal(f.activity.stats().dirty,true);
  f.activity.setState({intersecting:true});f.activity.invalidate();assert.equal(f.queue.size,1);f.flush();
  assert.equal(f.draws,1);assert.equal(f.activity.stats().renderCallbacks,1);assert.equal(f.activity.stats().resumeCount,1);assert.equal(f.activity.stats().dirty,false);assert.equal(f.queue.size,0);
});
test('document, zero-size and context gates cancel a pending frame and preserve dirty updates until every gate clears',()=>{
  const f=fixture();f.activity.invalidate();assert.equal(f.queue.size,1);f.activity.setState({hasSize:false,documentVisible:false,contextAvailable:false});assert.equal(f.queue.size,0);assert.equal(f.activity.stats().cancelledFrames,1);
  f.activity.invalidate();f.activity.setState({documentVisible:true,hasSize:true});assert.equal(f.queue.size,0);f.activity.setState({contextAvailable:true});assert.equal(f.queue.size,1);f.flush();assert.equal(f.draws,1);
  const snapshot=f.activity.stats();snapshot.hasSize=false;assert.equal(f.activity.stats().hasSize,true);
});
test('a late hidden-pane change is checked again in the frame callback and resumes without losing work',()=>{
  let visible=true;const f=fixture({canRender:()=>visible});f.activity.invalidate();visible=false;f.flush();assert.equal(f.draws,0);assert.equal(f.activity.stats().skippedFrames,1);assert.equal(f.activity.stats().dirty,true);
  visible=true;f.activity.setState({hasSize:true});f.flush();assert.equal(f.draws,1);
});
test('invalidations made during a render are retained and disposal cancels all subsequent scheduling',()=>{
  let activity;const f=fixture({render(){if(f.draws===1)activity.invalidate();}});activity=f.activity;activity.invalidate();f.flush();assert.equal(f.draws,1);assert.equal(f.queue.size,1);
  activity.dispose();activity.dispose();assert.equal(f.queue.size,0);activity.invalidate();activity.setState({intersecting:true});f.flush();assert.equal(f.draws,1);assert.equal(activity.stats().dirty,false);assert.equal(activity.stats().paused,true);
});
test('intersection observation tracks only its canvas and supports unavailable or failing observers',()=>{
  const f=fixture(),canvas={},other={};let callback,observed,disconnected=0;
  class Observer{constructor(handler){callback=handler;}observe(target){observed=target;}disconnect(){disconnected++;}}
  const observer=observeRenderActivity(f.activity,canvas,Observer);assert.equal(observed,canvas);f.activity.invalidate();callback([{target:other,isIntersecting:false,intersectionRatio:0}]);assert.equal(f.queue.size,1);
  callback([{target:canvas,isIntersecting:false,intersectionRatio:0}]);assert.equal(f.queue.size,0);callback([{target:canvas,isIntersecting:true,intersectionRatio:1}]);f.flush();assert.equal(f.draws,1);observer.disconnect();assert.equal(disconnected,1);
  assert.equal(observeRenderActivity(f.activity,canvas,null),null);
  class BrokenObserver{observe(){throw Error('unavailable');}disconnect(){disconnected++;}}
  assert.equal(observeRenderActivity(f.activity,canvas,BrokenObserver),null);assert.equal(disconnected,2);assert.equal(f.activity.stats().intersecting,true);f.activity.invalidate();f.flush();assert.equal(f.draws,2);
});
