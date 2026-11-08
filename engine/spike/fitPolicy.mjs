/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** A sphere fits in both frustum axes at every orbit angle. */
export function sphereFitDistance(radius, verticalFovDegrees, aspect, margin = 1.1) {
  if (!(radius > 0) || !Number.isFinite(radius) || !(aspect > 0) || !Number.isFinite(aspect) || !(verticalFovDegrees > 0 && verticalFovDegrees < 180)) return null;
  const verticalHalf = verticalFovDegrees * Math.PI / 360;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * aspect);
  return radius * Math.max(1, margin) / Math.sin(Math.min(verticalHalf, horizontalHalf));
}

/** Fit saved/model bounds in the current view basis, retaining a modest border. */
export function boxFitDistance(size,direction,verticalFovDegrees,aspect,fill=.85,cameraUp=[0,1,0]){
 if(!Array.isArray(size)||size.length!==3||size.some(value=>!Number.isFinite(value)||value<0)||!Array.isArray(direction)||direction.length!==3||direction.some(value=>!Number.isFinite(value))||!Array.isArray(cameraUp)||cameraUp.length!==3||cameraUp.some(value=>!Number.isFinite(value))||Math.hypot(...cameraUp)<1e-10||!(aspect>0&&Number.isFinite(aspect))||!(verticalFovDegrees>0&&verticalFovDegrees<180)||!(fill>0&&fill<1))return null;
 const length=Math.hypot(...direction);if(length<1e-10)return null;const d=direction.map(value=>value/length),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
 let right=cross(cameraUp,d);if(Math.hypot(...right)<1e-8)right=cross(Math.abs(d[2])<.9?[0,0,1]:[0,1,0],d);const rightLength=Math.hypot(...right);right=right.map(value=>value/rightLength);const up=cross(d,right),tanY=Math.tan(verticalFovDegrees*Math.PI/360)*fill,tanX=tanY*aspect;
 let distance=.01;for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const corner=[x*size[0]/2,y*size[1]/2,z*size[2]/2],depth=dot(corner,d);distance=Math.max(distance,depth+Math.abs(dot(corner,right))/tanX,depth+Math.abs(dot(corner,up))/tanY,depth+.01);}
 return distance;
}
