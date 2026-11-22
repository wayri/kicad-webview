/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Coordinates are measured inward from the selected paper-margin corner.
import {isWorksheetPath, safeRelativePath} from './source-types.mjs';

const value = item => item?.quoted ?? item;
const child = (node, name) => node?.find(item => Array.isArray(item) && item[0] === name);
const number = (item, fallback = 0) => typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 1e5 ? item : fallback;
const mm = item => Math.trunc(number(item) * 1000) / 1000;
export const worksheetLimit = 2 * 1024 * 1024;

export function parseWorksheet(source, parser) {
  if (typeof source !== 'string' || source.length > worksheetLimit || parser.sourceByteLength(source) > worksheetLimit)
    throw new Error('Worksheet must be text within 2 MiB.');
  const ast = parser.parse(source);
  if (!['kicad_wks', 'page_layout'].includes(ast[0])) throw new Error('Expected a KiCad worksheet template.');
  return (page, path, context, resolveText, warn) => drawWorksheet(ast, page, path, context, resolveText, warn);
}

function drawWorksheet(ast, page, path, context, resolveText, warn) {
  const setup = child(ast, 'setup');
  const margin = name => number(child(setup, name + '_margin')?.[1], 10);
  const left = margin('left'), top = margin('top'), right = page.width - margin('right'), bottom = page.height - margin('bottom');
  const anchor = (form, dx, dy) => {
    if (typeof form?.[1] !== 'number' || typeof form?.[2] !== 'number') return null;
    const corner = form[3] || 'rbcorner';
    if (!['ltcorner', 'lbcorner', 'rtcorner', 'rbcorner'].includes(corner)) return null;
    return {x:corner[0] === 'l' ? left + mm(form[1]) + dx : right - mm(form[1]) - dx,
      y:corner[1] === 't' ? top + mm(form[2]) + dy : bottom - mm(form[2]) - dy};
  };
  const {title = '', date = '', rev = '', company = '', comments = []} = page.titleBlock || {};
  const legacy = {T:title,D:date,R:rev,Y:company,Z:page.format,F:path.split('/').at(-1),S:context.sheetNumber ?? 1,
    N:context.sheetCount ?? 1,P:context.sheetName ?? '/',K:context.kicadVersion || 'KiCad', '%':'%'};
  const paperFields = {PAPER:page.format, '#':legacy.S, '##':legacy.N};
  const primitives = [];
  let vertices = 0, chars = 0;
  const defaultSize = child(setup, 'textsize');
  const within = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;

  for (const item of ast) {
    if (!Array.isArray(item) || ['setup','version','generator','generator_version'].includes(item[0])) continue;
    const type = item[0];
    if (!['line','rect','polygon','tbtext'].includes(type)) {
      warn('Worksheet object "' + String(type).slice(0,80) + '" is not rendered.');
      continue;
    }
    const option = child(item, 'option')?.[1], first = String(context.sheetNumber ?? 1) === '1';
    if (option === 'page1only' && !first || option === 'notonpage1' && first) continue;
    const repeat = Math.max(1, Math.trunc(number(child(item,'repeat')?.[1],1)));
    if (repeat > 1000) throw new Error('Worksheet repeat count exceeds 1,000.');
    const dx = mm(child(item,'incrx')?.[1]), dy = mm(child(item,'incry')?.[1]);
    const angle = number(child(item,'rotate')?.[1]), radians = angle * Math.PI / 180;
    const cos = Math.cos(radians), sin = Math.sin(radians);
    const font = child(item,'font'), size = child(font,'size') || defaultSize;
    const justify = child(item,'justify');
    const start = child(item, type === 'line' || type === 'rect' ? 'start' : 'pos');
    const end = child(item,'end');
    const base = {frame:true,kind:'custom-worksheet',color:'#a0a0a0',
      width:number(child(item,'linewidth')?.[1],number(child(setup,'linewidth')?.[1],.15)) || .15};
    for (let i = 0; i < repeat; i++) {
      const a = anchor(start,dx*i,dy*i), b = anchor(end,dx*i,dy*i);
      if (!a || i > 0 && type !== 'polygon' && (!within(a) || b && !within(b))) continue;
      if (type === 'line' && b) primitives.push({...base,type:'line',points:[a,b]});
      if (type === 'rect' && b) primitives.push({...base,type:'polygon',points:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}]});
      if (type === 'polygon') {
        for (const form of item) {
          if (!Array.isArray(form) || form[0] !== 'pts') continue;
          vertices += form.length - 1;
          if (vertices > 100000) throw new Error('Worksheet exceeds 100,000 polygon vertices.');
          const points = form.slice(1).filter(p=>Array.isArray(p)&&p[0]==='xy').map(([,x,y])=>({
            x:a.x+mm(x)*cos+mm(y)*sin,
            y:a.y-mm(x)*sin+mm(y)*cos,
          }));
          if (points.length >= 2 && (!i || points.every(within))) primitives.push({...base,type:'polygon',points,fill:points.length>2});
        }
      }
      if (type === 'tbtext') {
        let text = String(value(item[1]) ?? '');
        if (i && !/[%$\n]/.test(text)) {
          const step = i * number(child(item,'incrlabel')?.[1],1);
          text = /\d+$/.test(text) ? text.replace(/\d+$/,n=>String(Number(n)+step)) :
            text.replace(/[A-Za-z]$/,c=>String.fromCharCode(c.charCodeAt(0)+step));
        }
        if (ast[0] === 'page_layout') text=text.replace(/%([C][0-8]|[TDRYZFSNPK%])/g,(_,k)=>k.length===2 ? comments[Number(k[1])] ?? '' : legacy[k] ?? '');
        text = resolveText(text.replace(/\$\{(PAPER|##?)\}/g,(token,key)=>String(paperFields[key]??token)));
        chars += text.length;
        if (chars > 250000) throw new Error('Worksheet exceeds its display text budget.');
        if (text) primitives.push({...base,type:'text',...a,text,angle:-angle,
          fontWidth:number(size?.[1],1.5),fontHeight:number(size?.[2],1.5),
          align:justify?.includes('right')?'right':justify?.includes('center')?'center':'left',
          baseline:justify?.includes('top')?'top':justify?.includes('bottom')?'bottom':'middle',
          bold:font?.includes('bold'),italic:font?.includes('italic')});
      }
      if (primitives.length > 10000) throw new Error('Worksheet exceeds 10,000 drawing elements.');
    }
  }
  return primitives;
}

export function applySavedWorksheet(settings, path, project) {
    const settingsFile = settings.find(item=>item.path.replace(/\.kicad_pro$/i,'')===path.replace(/\.kicad_(pcb|sch)$/i,'')) ||
      (settings.length===1 ? settings[0] : null);
    if (settingsFile) {
      const folder = settingsFile.path.split('/').slice(0,-1);
      const name = /\.kicad_pcb$/i.test(path) ? settingsFile.pcb : settingsFile.sch;
      if (typeof name === 'string' && name) {
        const relative = name.replace(/^\$\{KIPRJMOD\}[\\/]/,'').replaceAll('\\','/');
        const target = [...folder, relative].join('/');
        if (safeRelativePath(relative) && project.files.some(item=>item.path===target&&isWorksheetPath(item.path))) project.worksheet=target;
        else project.notes.push('The saved project worksheet is not in the loaded files. Include the template or supply worksheetSource.');
      }
    }
}
