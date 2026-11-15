/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Local overlay: no assets, timers or external services. The operation owns cancellation. */
export function createLoadingSurface(viewer) {
  const doc=viewer.host.ownerDocument, pane=doc.createElement('div');
  pane.className='viewer-loading'; pane.hidden=true;
  pane.setAttribute('role','status'); pane.setAttribute('aria-live','polite');
  const title=doc.createElement('strong'), detail=doc.createElement('span'), bar=doc.createElement('progress'), stop=doc.createElement('button');
  title.textContent='Opening design'; bar.setAttribute('aria-label','Loading design');
  stop.type='button'; stop.textContent='Stop'; stop.setAttribute('aria-label','Stop loading');
  pane.append(title,detail,bar,stop); viewer.surface.append(pane);
  const style=doc.createElement('style'); style.textContent=
    '.viewer-loading[hidden]{display:none}.viewer-loading{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:16px;box-sizing:border-box;background:var(--viewer-bg,#151a21);color:var(--viewer-ink,#e1eaf3);font:13px system-ui;text-align:center}.viewer-loading span{overflow-wrap:anywhere;max-width:100%}.viewer-loading progress{width:min(240px,85%);accent-color:#59c9d2}.viewer-loading button{font:inherit;min-height:44px;padding:8px 20px;background:transparent;color:inherit;border:1px solid currentColor;border-radius:6px}.viewer-loading button:focus-visible{outline:2px solid #59c9d2;outline-offset:3px}@media(prefers-reduced-motion:reduce){.viewer-loading progress{animation:none}}';
  viewer.surface.append(style);
  let current=null;
  return {
    show(token,onStop){current=token;detail.textContent='Preparing drawing…';stop.disabled=false;stop.onclick=()=>{if(current!==token||stop.disabled)return;stop.disabled=true;detail.textContent='Stopping…';onStop();};pane.hidden=false;viewer.root.setAttribute('aria-busy','true');},
    stage(token,text){if(current===token&&!stop.disabled)detail.textContent=text;},
    hide(token){if(current!==token)return;current=null;pane.hidden=true;stop.onclick=null;viewer.root.setAttribute('aria-busy','false');},
    dispose(){current=null;stop.onclick=null;pane.remove();style.remove();viewer.root.setAttribute('aria-busy','false');}
  };
}
export function paintLoading(signal) {
  if(typeof requestAnimationFrame!=='function')return Promise.resolve();
  // Timeout also permits hidden embeds to finish when animation frames are paused.
  return new Promise((resolve,reject)=>{
    let frame,timer;
    const finish=()=>{clearTimeout(timer);if(frame!==undefined)cancelAnimationFrame(frame);signal.removeEventListener('abort',abort);resolve();};
    const abort=()=>{clearTimeout(timer);if(frame!==undefined)cancelAnimationFrame(frame);signal.removeEventListener('abort',abort);reject(new DOMException('The operation was aborted.','AbortError'));};
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});timer=setTimeout(finish,32);frame=requestAnimationFrame(finish);
  });
}
