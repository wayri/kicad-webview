/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Copy and validate a board-centred millimetre 3D orbit camera. */
export function cameraState3D(input){
 const vector=name=>{const a=input?.[name];if(!Array.isArray(a)||a.length!==3||!a.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7))throw new TypeError('Choose finite bounded 3D camera vectors.');return [...a];};
 const position=vector('position'),target=vector('target'),up=vector('up'),d=position.map((x,i)=>x-target[i]);
 const length=Math.hypot(...d),u=Math.hypot(...up),cross=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]];
 if(length<1e-4||u<1e-8||Math.hypot(...cross)<length*u*1e-6)throw new TypeError('Choose a nondegenerate 3D camera direction and up vector.');
 return {position,target,up};
}
