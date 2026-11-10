/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {createResultOverlay,validateResultSurface} from './result3d.js';
import {createSavedScalarAppearance} from './wayricadResult3d.mjs';
import {FIELD_COLOR_STOPS,fieldColorRange} from './fieldColors.mjs';

function registrationError(message){return Object.assign(new Error(message),{code:'UNSUPPORTED_RESULT_REGISTRATION'});}
/** Register only saved board coordinates; never infer internal layer elevations. */
export function prepareRegisteredResult3D(surface,{bounds,thickness,layers=[]},options={}){
  const data=validateResultSurface(surface),basis=data.zBasis,layer=data.layer??options.layer??null;
  if(options.layer!==undefined&&data.layer!==undefined&&options.layer!==data.layer)throw registrationError('Selected layer does not match the saved result layer.');
  if(layer!==null&&(typeof layer!=='string'||!layers.includes(layer)))throw registrationError('Saved result layer is not present on this board.');
  if(basis!==undefined&&basis!==null&&!['front-depth','board-center'].includes(basis))throw registrationError('Saved result elevation basis is unsupported; use the standalone result scene.');
  if(data.zKnown===true?!['front-depth','board-center'].includes(basis):!['F.Cu','B.Cu'].includes(data.layer))throw registrationError('Saved elevation requires front-depth or board-center; without saved Z only saved F.Cu/B.Cu layers can be placed.');
  if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY,thickness].every(Number.isFinite)||bounds.minX>bounds.maxX||bounds.minY>bounds.maxY||thickness<=0)throw new TypeError('Choose finite board bounds and a positive thickness.');
  if(options.palette!==undefined&&options.palette!=='wayricad')throw new TypeError('Choose the supported WayriCAD palette or omit it for legacy colors.');
  if(options.range!==undefined&&(!Array.isArray(options.range)||options.range.length!==2||!options.range.every(Number.isFinite)||options.range[1]<=options.range[0]))throw new TypeError('Choose an increasing finite result range.');
  const centerX=bounds.minX/2+bounds.maxX/2,centerY=bounds.minY/2+bounds.maxY/2;
  const transform=([x,y,z])=>[x-centerX,centerY-y,data.zKnown===true?(basis==='front-depth'?thickness/2-z:z):(data.layer==='F.Cu'?thickness/2:-thickness/2)];
  const range=options.range?[...options.range]:options.palette==='wayricad'?fieldColorRange(data.values):null;
  if(options.palette==='wayricad'&&!range)throw registrationError('No known saved field values are available for placement.');
  return {surface:data,transform,layer,basis:data.zKnown===true?basis:data.layer,flat:data.zKnown!==true,range,throughBoard:options.throughBoard!==false};
}

export function createRegisteredResultOverlay(surface,board,options={}){
  const prepared=prepareRegisteredResult3D(surface,board,options);
  const overlay=createResultOverlay(prepared.surface,prepared.transform,{...(prepared.range?{range:prepared.range}:{}),...(options.palette==='wayricad'?{palette:FIELD_COLOR_STOPS}:{})});
  const sample=overlay.sample;overlay.sample=hit=>{const probe=sample(hit);return probe?{...probe,overlayOwner:options.owner}:null;};
  let scalarAppearance=null,closed=false;
  try{
    overlay.mesh.material.depthTest=!prepared.throughBoard;overlay.mesh.renderOrder=prepared.throughBoard?20:0;
    if(options.palette==='wayricad')scalarAppearance=createSavedScalarAppearance(overlay);
  }catch(error){scalarAppearance?.dispose();overlay.dispose();throw error;}
  const diagnostics=[];
  if(scalarAppearance?.mode==='vertex-color')diagnostics.push('Scalar values exceed the GPU normalization range; vertex-color interpolation is active. Probe values remain exact.');
  return {overlay,prepared,scalarAppearance,diagnostics,
    state(){return {placed:true,layer:prepared.layer,basis:prepared.basis,flat:prepared.flat,throughBoard:prepared.throughBoard,triangles:overlay.mesh.geometry.getAttribute('position').count/3,range:overlay.range?[...overlay.range]:null,diagnostics:[...diagnostics]};},
    useColorFallback(){if(!scalarAppearance?.useFallback())return false;diagnostics.push('Scalar color mapping is unavailable; vertex-color interpolation is active. Probe values remain exact.');return true;},
    dispose(){if(closed)return;closed=true;scalarAppearance?.dispose();overlay.dispose();}
  };
}

/** A controller owns detached scalar materials as well as the attached mesh. */
export function createAnalysisOverlayController(board,{scene,invalidate=()=>{},isActive=()=>true}={}){
  let content=null,owner;
  const owns=options=>options?.owner===undefined||options.owner===owner;
  const empty=reason=>({placed:false,layer:null,basis:null,throughBoard:false,triangles:0,range:null,diagnostics:[],...(reason?{reason}:{})});
  return {
    get overlay(){return content?.overlay||null;},
    getAnalysisOverlayState(){return content?content.state():empty();},
    setAnalysisOverlay(surface,options={}){
      if(!isActive())return empty('3D viewer is closed.');
      if(!surface){if(!owns(options))return empty('Overlay belongs to another owner.');content?.dispose();content=null;owner=undefined;invalidate();return empty('Overlay cleared.');}
      let next;
      try{next=createRegisteredResultOverlay(surface,board,options);}catch(error){if(error.code==='UNSUPPORTED_RESULT_REGISTRATION')return empty(error.message);throw error;}
      scene.add(next.overlay.group);const previous=content;content=next;owner=options.owner;previous?.dispose();invalidate();return content.state();
    },
    setAnalysisProbes(probes,options={}){if(!content||!owns(options))return false;content.overlay.setProbes(probes);invalidate();return true;},
    setAnalysisOpacity(value,options={}){if(!content||!owns(options))return false;content.overlay.setOpacity(value);invalidate();return true;},
    useColorFallback(){return content?.useColorFallback()||false;},
    dispose(){content?.dispose();content=null;owner=undefined;}
  };
}
