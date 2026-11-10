/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {analysisColor} from './analysis-results.mjs';
import {fieldColorRange} from '../engine/spike/fieldColors.mjs';
export const surfaceRange=surface=>fieldColorRange(surface.values);
export function surfaceBounds(surface){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of surface.points){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}if(![x0,y0,x1,y1].every(Number.isFinite)||x1<=x0||y1<=y0)return null;return{x0,y0,x1,y1};}
/** Bounded, transparent raster of only the supplied triangles, with barycentric nodal values. */
export function rasterizeWayriCADSurface(surface,{maxSize=768,maxPixelTests=16000000,range:fixedRange}={}){
 if(!Number.isSafeInteger(maxSize)||maxSize<2||maxSize>1024||!Number.isSafeInteger(maxPixelTests)||maxPixelTests<1||maxPixelTests>32000000)throw new RangeError('Invalid field preview budget.');
 if(fixedRange&&(!Array.isArray(fixedRange)||fixedRange.length!==2||!fixedRange.every(Number.isFinite)||fixedRange[1]<=fixedRange[0]))throw new RangeError('Invalid fixed field range.');
 const bounds=surfaceBounds(surface),range=fixedRange||surfaceRange(surface);if(!bounds||!range)return null;
 const dx=bounds.x1-bounds.x0,dy=bounds.y1-bounds.y0;if(!Number.isFinite(dx+dy))throw new RangeError('Field extent exceeds the preview range.');const width=Math.max(2,Math.round(maxSize*dx/Math.max(dx,dy))),height=Math.max(2,Math.round(maxSize*dy/Math.max(dx,dy))),pixels=new Uint8ClampedArray(width*height*4);
 const colors=Array.from({length:256},(_,i)=>analysisColor(range[0]+i/255*(range[1]-range[0]),range).match(/\d+/g).map(Number));let tests=0,drawn=0,omitted=0;
 for(let index=0;index<surface.triangles.length;index++){
  const triangle=surface.triangles[index],points=triangle.map(i=>surface.points[i]),values=surface.nodal?triangle.map(i=>surface.values[i]):[surface.values[index]];
  if(values.some(v=>!Number.isFinite(v))){omitted++;continue;}
  const p=points.map(q=>[(q[0]-bounds.x0)/dx*width,(q[1]-bounds.y0)/dy*height]);
  const [a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(!Number.isFinite(den)||Math.abs(den)<1e-14){omitted++;continue;}
  const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
  tests+=(right-left+1)*(bottom-top+1);if(tests>maxPixelTests)throw new RangeError('Field exceeds the bounded 2D raster preview budget. Use a smaller result or 3D; full data is retained.');
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const px=x+.5,py=y+.5,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,w=1-u-v;if(u<-1e-10||v<-1e-10||w<-1e-10)continue;
   const value=surface.nodal?u*values[0]+v*values[1]+w*values[2]:values[0],color=colors[Math.max(0,Math.min(255,Math.round((value-range[0])/(range[1]-range[0])*255)))],at=(y*width+x)*4;pixels[at]=color[0];pixels[at+1]=color[1];pixels[at+2]=color[2];pixels[at+3]=255;
  }drawn++;
 }
 return{bounds,range,width,height,pixels,drawn,omitted,pixelTests:tests};
}
/** Full saved arrays remain untouched; UI exposes the finite plotting budget. */
export function waveformWindow(plot,selected,{maxPoints=100000}={}){
 const result=[];let used=0,total=0,x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 for(const [index,series]of (plot.series||[]).entries()){
  if(!selected.has(index))continue;total+=series.points.length;const count=Math.min(series.points.length,Math.max(0,maxPoints-used)),points=series.points.slice(0,count);used+=count;
  for(const p of points){if(Number.isFinite(p.x)){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);}if(Number.isFinite(p.y)){y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);}}
  result.push({index,name:series.name,points});
 }
 const spread=(a,b)=>a===b?[a-.5*Math.max(1,Math.abs(a)),b+.5*Math.max(1,Math.abs(b))]:[a,b];
 return{series:result,shown:used,total,limited:used<total,bounds:[x0,x1,y0,y1].every(Number.isFinite)?{x:spread(x0,x1),y:spread(y0,y1)}:null};
}
