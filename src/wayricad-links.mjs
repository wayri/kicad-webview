/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Producer-declared identities only; never infer nets from series labels. */
export function getWayriCADSourceLinks(model){
 const raw=model?.raw,route=raw?.schema==='wayricad.quick-si/v1'?raw.path:null;
 const name=route?.net_name||(raw?.mesh&&raw?.result?raw.request?.net_name:null),netName=typeof name==='string'&&name.length>0&&name.length<=1000?name:null;
 const objectIds=[...new Set((Array.isArray(route?.segments)?route.segments:[]).map(s=>s?.item_uuid).filter(id=>typeof id==='string'&&id.length>0&&id.length<=240))];
 return Object.freeze({netName,objectIds:Object.freeze(objectIds)});
}
