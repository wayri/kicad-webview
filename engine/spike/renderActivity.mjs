/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export function createRenderActivity({request,cancel,render,canRender=()=>true,state:initial={}}){
  const state={documentVisible:true,intersecting:true,hasSize:true,contextAvailable:true,...initial};
  let frame=null,dirty=false,disposed=false,requestCount=0,scheduledFrames=0,renderCallbacks=0,suppressedInvalidations=0,cancelledFrames=0,skippedFrames=0,resumeCount=0;
  const allowed=()=>!disposed&&state.documentVisible&&state.intersecting&&state.hasSize&&state.contextAvailable&&canRender();
  function cancelPending(){if(frame!==null){cancel(frame);frame=null;cancelledFrames++;}}
  function schedule(){
    if(!dirty||frame!==null||!allowed())return;
    scheduledFrames++;
    frame=request(()=>{frame=null;if(!allowed()){skippedFrames++;return;}if(!dirty)return;dirty=false;renderCallbacks++;render();});
  }
  return {
    invalidate(){if(disposed)return;requestCount++;dirty=true;if(!allowed())suppressedInvalidations++;else schedule();},
    setState(next){
      if(disposed)return;const wasAllowed=allowed();Object.assign(state,next);
      const nowAllowed=allowed();if(!nowAllowed)cancelPending();else {if(!wasAllowed){resumeCount++;dirty=true;}schedule();}
    },
    stats(){return {...state,paused:!allowed(),dirty,pending:frame!==null,requestCount,scheduledFrames,renderCallbacks,suppressedInvalidations,cancelledFrames,skippedFrames,resumeCount};},
    dispose(){if(disposed)return;disposed=true;cancelPending();dirty=false;}
  };
}
export function observeRenderActivity(activity,target,Observer=globalThis.IntersectionObserver){
  if(typeof Observer!=='function')return null;let observer;
  try{
    observer=new Observer(entries=>{const entry=entries.find(item=>item.target===target);if(entry)activity.setState({intersecting:Boolean(entry.isIntersecting)&&entry.intersectionRatio!==0});});
    observer.observe(target);return observer;
  }catch{observer?.disconnect();activity.setState({intersecting:true});return null;}
}
