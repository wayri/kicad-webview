/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {boxFitDistance} from './fitPolicy.mjs';

/** Face the saved mounting side and frame the rendered part, in millimetres. */
export function partFocusCamera(min,max,layer,fov,aspect){
 if(!['F.Cu','B.Cu'].includes(layer)||![min,max].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))||min.some((v,i)=>v>max[i]))return null;
 const target=min.map((v,i)=>(v+max[i])/2),size=min.map((v,i)=>Math.max(i===2?1:8,max[i]-v));
 const side=layer==='B.Cu'?-1:1,up=[0,1,0],distance=boxFitDistance(size,[0,0,side],fov,aspect,.55,up);
 if(distance===null)return null;
 return {target,position:[target[0],target[1],target[2]+side*distance],up};
}
