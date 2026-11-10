/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export const FIELD_COLOR_STOPS=Object.freeze([[26,64,115],[20,136,156],[107,196,151],[255,225,112]].map(stop=>Object.freeze(stop)));
export function fieldColorRange(values){
  let low=Infinity,high=-Infinity;for(const value of values)if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
  if(!Number.isFinite(low))return null;
  if(low===high){const width=.5*Math.max(1,Math.abs(low));return [Math.max(-Number.MAX_VALUE,low-width),Math.min(Number.MAX_VALUE,high+width)];}
  return [low,high];
}
export function fieldNormalized(value,range){
  const span=range[1]-range[0],fraction=Number.isFinite(span)?(value-range[0])/span:(value/2-range[0]/2)/(range[1]/2-range[0]/2);
  return Math.max(0,Math.min(1,fraction));
}
export function fieldRGB(value,range){
  const scaled=fieldNormalized(value,range)*3,index=Math.min(2,Math.floor(scaled)),fraction=scaled-index;
  return FIELD_COLOR_STOPS[index].map((n,i)=>Math.round(n+(FIELD_COLOR_STOPS[index+1][i]-n)*fraction));
}
