/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {paintSilkscreen} from './surfaceSilkscreen.mjs';
/** Intersect all 12 frustum edges with the saved board plane. Corner rays alone
 * miss oblique/horizon views; clip the resulting footprint to actual board bounds. */
export function silkscreenViewBounds(THREE,camera,z,bounds,centerX,centerY,padding=.2){
 camera.updateMatrixWorld();const corners=[];
 for(const depth of [-1,1])for(const y of [-1,1])for(const x of [-1,1])corners.push(new THREE.Vector3(x,y,depth).unproject(camera));
 const hits=[];for(let i=0;i<8;i++)for(const bit of [1,2,4]){const j=i^bit;if(j<i)continue;const a=corners[i],b=corners[j],dz=b.z-a.z;
  if(Math.abs(dz)<1e-12)continue;const t=(z-a.z)/dz;if(t>=0&&t<=1)hits.push({x:a.x+(b.x-a.x)*t+centerX,y:centerY-a.y-(b.y-a.y)*t});
 }
 if(!hits.length)return null;
 const minX=Math.max(bounds.minX,Math.min(...hits.map(p=>p.x))),maxX=Math.min(bounds.maxX,Math.max(...hits.map(p=>p.x))),minY=Math.max(bounds.minY,Math.min(...hits.map(p=>p.y))),maxY=Math.min(bounds.maxY,Math.max(...hits.map(p=>p.y)));
 if(maxX-minX<1e-6||maxY-minY<1e-6)return null;
 // A small guard around the visible footprint avoids edge seams under damping.
 const dx=(maxX-minX)*padding,dy=(maxY-minY)*padding;
 return {minX:Math.max(bounds.minX,minX-dx),maxX:Math.min(bounds.maxX,maxX+dx),minY:Math.max(bounds.minY,minY-dy),maxY:Math.min(bounds.maxY,maxY+dy)};
}
export function silkscreenDetailPlan(width,height,maxDimension=4096,constrained=false){
 if(![width,height,maxDimension].every(Number.isFinite)||width<=0||height<=0||maxDimension<1)return null;
 const dimension=Math.min(constrained?1024:2048,maxDimension),maxPixels=constrained?1048576:4194304;
 const scale=Math.min(dimension/width,dimension/height,Math.sqrt(maxPixels/width/height));
 const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
 return {width:w,height:h,scale:Math.min(w/width,h/height),pixels:w*h,maxPixels};
}
/** Reuse one bounded detail canvas/texture per face. Detailed saved geometry is
 * retained while its guarded crop covers the view; refreshes are throttled,
 * never repeatedly switched to the blurry whole-board map during damping. */
export function createSilkscreenDetail(THREE,{camera,document,bounds,centerX,centerY,graphics,resources,invalidate,arcThrough,setTimer=setTimeout,clearTimer=clearTimeout,onError=()=>{}}){
 const faces=[];let closed=false,timer=null,signature=null;
 function coarse(face){face.crop=null;face.scale=null;face.mesh.material.map=face.base;face.mesh.position.set(0,0,face.z);face.mesh.scale.set(1,1,1);}
 function repaint(){timer=null;if(closed)return;if(document.hidden){signature=null;return;}
  for(const face of faces){
   if(!face.mesh.visible||!face.mesh.parent?.visible||(face.front?camera.position.z<=face.z:camera.position.z>=face.z))continue;
   const crop=silkscreenViewBounds(THREE,camera,face.z,bounds,centerX,centerY);if(!crop)continue;
   const w=crop.maxX-crop.minX,h=crop.maxY-crop.minY,plan=silkscreenDetailPlan(w,h,graphics.maxDimension,graphics.constrained);if(!plan)continue;
   try{const dimension=Math.floor(Math.min(graphics.constrained?1024:2048,graphics.maxDimension));
    // Three uses immutable GPU texture storage. Keep the upload canvas fixed;
    // only the sampled subrectangle changes with the visible crop/aspect.
    if(!face.texture)face.canvas.width=face.canvas.height=dimension;
    const ctx=face.canvas.getContext('2d');if(!ctx)continue;ctx.clearRect(0,0,dimension,dimension);
    paintSilkscreen(ctx,face.primitives,crop,plan,face.clips,arcThrough);
    if(!face.texture){face.texture=resources.track(new THREE.CanvasTexture(face.canvas));face.texture.colorSpace=THREE.SRGBColorSpace;face.texture.anisotropy=face.base.anisotropy;}
    face.texture.repeat.set(plan.width/dimension,plan.height/dimension);face.texture.offset.set(0,1-plan.height/dimension);
    face.texture.needsUpdate=true;face.mesh.material.map=face.texture;face.crop=crop;face.scale=plan.scale;
    face.mesh.scale.set(w/(bounds.maxX-bounds.minX),h/(bounds.maxY-bounds.minY),1);
    face.mesh.position.set((crop.minX+crop.maxX)/2-centerX,centerY-(crop.minY+crop.maxY)/2,face.z);
   }catch(error){coarse(face);onError(error);}
  }
  invalidate();
 }
 return {
  add(mesh,primitives,clips,front){faces.push({mesh,primitives,clips,front,z:mesh.position.z,base:mesh.material.map,canvas:document.createElement('canvas'),texture:null});},
  // Ignore subpixel damping residue: exact matrix equality creates a repaint/invalidate loop.
  sync(){if(closed)return;
   // Selection swaps/restores material clones. Texture/crop state belongs to
   // this face, so repair the active material even when the camera is still.
   for(const face of faces){const map=face.crop?face.texture:face.base;if(face.mesh.material.map!==map)face.mesh.material.map=map;}
   camera.updateMatrixWorld();const next=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements,...faces.map(f=>f.mesh.visible&&f.mesh.parent?.visible?1:0)];if(signature&&next.every((n,i)=>Math.abs(n-signature[i])<=1e-5*Math.max(1,Math.abs(n),Math.abs(signature[i]))))return;signature=next;let refresh=false;for(const face of faces){
   if(!face.mesh.visible||!face.mesh.parent?.visible)continue;
   const view=silkscreenViewBounds(THREE,camera,face.z,bounds,centerX,centerY,0),crop=face.crop;
   const covered=view&&crop&&view.minX>=crop.minX&&view.maxX<=crop.maxX&&view.minY>=crop.minY&&view.maxY<=crop.maxY;
   if(!covered){coarse(face);refresh=true;continue;}
   const plan=silkscreenDetailPlan(view.maxX-view.minX,view.maxY-view.minY,graphics.maxDimension,graphics.constrained);
   if(plan&&plan.scale>face.scale*1.5)refresh=true;
  }if(refresh&&timer===null)timer=setTimer(repaint,100);},
  dispose(){if(closed)return;closed=true;if(timer!==null)clearTimer(timer);timer=null;for(const face of faces){coarse(face);face.canvas.width=face.canvas.height=1;}faces.length=0;}
 };
}
