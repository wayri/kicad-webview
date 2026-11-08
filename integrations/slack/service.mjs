/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {SLACK_FRAME_ANCESTORS} from './adapter.mjs';
const assets=new Map([['licenses/Pocket-KiView-Source-Available-1.0.txt','text/plain; charset=utf-8'],['licenses/kicad-web-view-Source-Available-1.0.txt','text/plain; charset=utf-8'],['embed.html','text/html; charset=utf-8'],['embed.mjs','text/javascript; charset=utf-8'],['kivi-viewer.js','text/javascript; charset=utf-8'],['LICENSE','text/plain; charset=utf-8'],['LICENSING.md','text/plain; charset=utf-8'],['THIRD-PARTY-NOTICES.md','text/plain; charset=utf-8'],['THREE-LICENSE','text/plain; charset=utf-8'],['FZSTD-LICENSE','text/plain; charset=utf-8'],['SPIKE-ENGINE-NOTICE.md','text/plain; charset=utf-8']]);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Public embed assets and approved links only; event secrets remain private. */
export function createSlackService({dist,catalog,eventHandler,onError=()=>{}}){
 if(typeof dist!=='string'||!catalog?.byID||typeof eventHandler!=='function')throw new TypeError('Configure viewer distribution, approved catalog and Slack handler.');
 const routes=new Map();for(const entry of catalog.byID.values()){const url=new URL(entry.url);if(routes.has(url.pathname))throw new Error('Catalog share paths must be unique.');routes.set(url.pathname,entry);}
 return async(request,response)=>{
  if(request.url==='/slack/events')return eventHandler(request,response);
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'self' "+SLACK_FRAME_ANCESTORS};
  const send=(status,type,body)=>{response.writeHead(status,{...headers,'Content-Type':type});response.end(request.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(request.method))return send(405,'text/plain; charset=utf-8','Method not allowed.');
  let url;try{url=new URL(request.url,'http://localhost');}catch{return send(400,'text/plain; charset=utf-8','Invalid request.');}
  if(url.pathname==='/healthz')return send(200,'application/json','{"status":"ready"}');
  const entry=routes.get(url.pathname);
  if(entry&&!url.search)return send(200,'text/html; charset=utf-8','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(entry.title)+'</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}a{position:absolute;right:12px;bottom:12px;background:#fff;color:#123;padding:8px;font:13px system-ui}</style><iframe title="'+escape(entry.title)+'" src="'+escape(entry.previewURL)+'" referrerpolicy="no-referrer"></iframe><a href="'+escape(entry.previewURL)+'">Open viewer</a></html>');
  const name=url.pathname.startsWith('/viewer/')?url.pathname.slice(8):'',type=assets.get(name);
  if(!type)return send(404,'text/plain; charset=utf-8','Not found.');
  try{const target=path.join(dist,name),stat=await lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)throw Error('Invalid asset.');const bytes=request.method==='HEAD'?undefined:await readFile(target);headers['Access-Control-Allow-Origin']='*';return send(200,type,bytes);}
  catch(error){try{onError(error);}catch{}return send(503,'text/plain; charset=utf-8','Viewer asset unavailable.');}
 };
}
