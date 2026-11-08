/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Keep fine pad/model edges sharp on high-density phones without allocating an
// unbounded full-resolution framebuffer on large monitors or foldables.
export function viewportPixelRatio(width, height, deviceRatio = 1, maxDimension = 4096) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const dimension = Number.isFinite(maxDimension) && maxDimension > 0 ? maxDimension : 4096;
  return Math.min(dpr, 3, Math.sqrt(4_000_000 / w / h), dimension / w, dimension / h);
}

export function qualityName(value){return ['low','balanced','high','presentation'].includes(value)?value:'balanced';}
// Touch input says nothing about GPU capacity. Use reported capabilities and
// memory only; unknown devices retain the normal, bounded allocation policy.
export function graphicsProfile({maxTextureSize=4096,maxRenderbufferSize=maxTextureSize,deviceMemory,hardwareConcurrency=0,floatTargets=false,android=false}={}){
 const dimension=Math.min(...[maxTextureSize,maxRenderbufferSize].map(value=>Number.isFinite(value)&&value>0?value:4096));
 const memory=Number.isFinite(deviceMemory)&&deviceMemory>0?deviceMemory:null;
 const constrained=dimension<=4096||memory!==null&&memory<=2;
 const premium=!constrained&&floatTargets&&dimension>=8192&&(memory!==null?memory>=6:dimension>=16384&&hardwareConcurrency>=8);
 return{tier:constrained?'constrained':premium?'premium':'standard',constrained,premium,maxDimension:dimension,defaultQuality:android&&premium?'high':'balanced',highMaxPixels:constrained?1_000_000:premium?3_000_000:2_000_000};
}
// Includes HDR ping-pong buffers, G-buffer/depth, AO/denoise, SMAA buffers,
// canvas and the cached shadow maps. This is a conservative allocation bound,
// not a claim about a particular driver's private memory accounting.
export function qualityViewport(width,height,deviceRatio=1,maxDimension=4096,quality='balanced',constrained=false){
 const mode=qualityName(quality),w=Number.isFinite(width)&&width>0?width:1,h=Number.isFinite(height)&&height>0?height:1;
 const profile=constrained&&typeof constrained==='object'?constrained:null,limited=profile?profile.constrained:constrained;
 const enhanced=mode==='high'||mode==='presentation';
 const maxPixels=mode==='presentation'?(limited?1_000_000:profile?.premium?4_000_000:3_000_000):mode==='high'?(profile?profile.highMaxPixels:limited?1_000_000:2_000_000):mode==='low'?1_000_000:limited?3_000_000:4_000_000;
 const ratio=Math.min(viewportPixelRatio(w,h,mode==='presentation'&&!limited?Math.max(1.5,deviceRatio):deviceRatio,maxDimension),Math.sqrt(maxPixels/w/h));
 const pixels=Math.floor(w*ratio)*Math.floor(h*ratio),bytesPerPixel=enhanced?96:mode==='low'?12:24;
 return {quality:mode,ratio,width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio)),pixels,maxPixels,estimatedBytes:pixels*bytesPerPixel+(mode==='low'?0:2*(mode==='presentation'&&!limited?2048:1024)**2*4)};
}
export function boardOcclusion(thickness=1.6,quality='high'){
 const t=Number.isFinite(thickness)&&thickness>0?thickness:1.6;
 return {radius:Math.max(.35,Math.min(3,t*.85)),thickness:Math.max(.12,Math.min(1,t*.3)),distanceExponent:2,distanceFallOff:1,scale:1,samples:quality==='presentation'?24:12,screenSpaceRadius:false};
}
export function padHasMaskOpening(pad,layer){const mask=layer==='B.Cu'?'B.Mask':'F.Mask';return Array.isArray(pad?.layers)&&(pad.layers.includes(mask)||pad.layers.includes('*.Mask'));}
export const physicalColors=Object.freeze({coatedCopper:0x164631,exposedCopper:0xc5aa6c});

// Avoid a kilometre-scale far plane for millimetre-scale boards. Updating this
// on orbit/zoom preserves thin copper depth precision and close inspection.
/** Nearest camera-space depth of an enclosing world-axis-aligned box. */
export function boxNearDepth(position,direction,min,max){
 let depth=0,radius=0;
 for(let i=0;i<3;i++){depth+=((min[i]+max[i])/2-position[i])*direction[i];radius+=(max[i]-min[i])/2*Math.abs(direction[i]);}
 return depth-radius;
}
export function boardClipRange(distance,radius,closestDepth){
 const d=Number.isFinite(distance)&&distance>0?distance:1,r=Number.isFinite(radius)&&radius>0?radius:1;
 // The actual camera-oriented box gives useful precision without clipping
 // a nearby board corner. Fall back conservatively to sphere clearance.
 const clearance=Number.isFinite(closestDepth)?closestDepth:d-r;
 const near=Math.max(.005,clearance*.5);
 return {near,far:Math.max(10,d+r*4,near+1)};
}

// Neutral studio lighting is paired about the board plane, so turning a PCB
// over does not leave the back in darkness. Intensities are intentionally
// modest: environment reflections reveal metal without bleaching fine traces.
export const studioLights=Object.freeze([
  {x:.65,y:-.45,z:1,intensity:1.25,color:0xfff5e8},
  {x:.65,y:-.45,z:-1,intensity:1.25,color:0xfff5e8},
  {x:-.8,y:.35,z:.6,intensity:.65,color:0xe5efff},
  {x:-.8,y:.35,z:-.6,intensity:.65,color:0xe5efff}
].map(Object.freeze));
export const studioMaterials=Object.freeze({
  solderMask:Object.freeze({color:0x0d4935,roughness:.46,metalness:.04,clearcoat:.3,clearcoatRoughness:.5}),
  substrateEdge:Object.freeze({color:0xa8986e,roughness:.92,metalness:0}),
  copper:Object.freeze({metalness:.62,roughness:.38}),
  proxy:Object.freeze({color:0x353d49,metalness:.06,roughness:.66})
});

/** The color scene uses logarithmic depth for micrometre copper separation.
 * GTAO owns an independent normal/depth target and reconstructs perspective
 * depth. Keep only that prepass in ordinary depth, including its denoiser. */
export function configureOcclusionDepth(material){
 const inherited=material.onBeforeCompile;
 material.onBeforeCompile=function(shader,renderer){
  inherited?.call(this,shader,renderer);
  const chunk='#include <logdepthbuf_fragment>';
  if(!shader.fragmentShader.includes(chunk))throw Error('Unsupported occlusion depth shader.');
  shader.fragmentShader=shader.fragmentShader.replace(chunk,'');
 };
 const cacheKey=material.customProgramCacheKey;
 material.customProgramCacheKey=function(){return cacheKey.call(this)+'|perspective-occlusion-depth-v1';};
}
