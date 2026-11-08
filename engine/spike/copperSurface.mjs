/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Pure saved-world geometry policy; no rendering or source mutation.
export function trackStrokePlan(start,end,width){
 if(!Array.isArray(start)||!Array.isArray(end)||start.length!==2||end.length!==2||![...start,...end,width].every(Number.isFinite)||width<=0)return null;
 const dx=end[0]-start[0],dy=end[1]-start[1];
 return {center:[(start[0]+end[0])/2,(start[1]+end[1])/2],length:Math.hypot(dx,dy),width,radius:width/2,angle:Math.atan2(dy,dx)};
}
export function arcStepPlan(radius,sweep){
 if(!(radius>0)||!Number.isFinite(radius)||!Number.isFinite(sweep))return {steps:1,limited:false};
 // At most 5 µm chord sagitta, with a separate angular bound and a per-arc
 // work cap. The caller discloses when that cap limits geometric accuracy.
 const angle=Math.min(Math.PI/48,2*Math.acos(Math.max(-1,1-Math.min(.005,radius)/radius)));
 const requested=Math.max(8,Math.ceil(Math.abs(sweep)/Math.max(angle,1e-8)));
 return {steps:Math.min(512,requested),limited:requested>512};
}
export function throughVia(via){return Array.isArray(via.layers)&&via.layers.includes('F.Cu')&&via.layers.includes('B.Cu');}
export const copperSurfaceMaterial=Object.freeze({side:2,depthWrite:true,transparent:false,opacity:1});
