/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const smooth=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
export function expansionPhases(value){
 if(!Number.isFinite(value))throw new TypeError('Expand amount must be finite.');
 const amount=Math.max(0,Math.min(100,value));
 return{amount,components:smooth(amount/35),layers:smooth((amount-35)/65)};
}
/** One retargetable, non-overshooting motion. No idle animation loop. */
export function createExpansionMotion({request,cancel,now=()=>performance.now(),update,canRun=()=>true,reducedMotion=()=>false,settle=()=>{}}){
 let value=0,target=0,frame=null,last=0,disposed=false;
 function schedule(){if(!disposed&&frame===null&&value!==target&&canRun()){last=now();frame=request(tick);}}
 function tick(time){frame=null;if(disposed||!canRun())return;
  const dt=Math.max(1,Math.min(64,time-last));last=time;
  value+= (target-value)*(1-Math.exp(-dt/85));
  if(Math.abs(target-value)<.04)value=target;
  update(value);
  if(disposed)return;
  if(value!==target)frame=request(tick);else settle(value);
 }
 return{set(next,{immediate=false}={}){if(disposed)return target;target=expansionPhases(next).amount;
   if(immediate||reducedMotion()){if(frame!==null)cancel(frame);frame=null;value=target;update(value);if(!disposed)settle(value);}
   else schedule();return target;},resume:schedule,get:()=>value,target:()=>target,running:()=>frame!==null,
  dispose(){disposed=true;if(frame!==null)cancel(frame);frame=null;}};
}
