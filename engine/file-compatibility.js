/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Saved-format capability disclosure; never upgrades or rewrites a design. */
((root)=>{'use strict';
 const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x.quoted:x;
 const common='version generator generator_version uuid paper title_block embedded_fonts embedded_files'.split(' ');
 const known={kicad_pcb:new Set([...common,...'general layers setup net footprint segment arc via zone gr_line gr_arc gr_rect gr_circle gr_poly gr_text gr_curve gr_text_box gr_bitmap dimension target property group image'.split(' ')]),kicad_sch:new Set([...common,...'lib_symbols symbol sheet wire bus bus_entry junction no_connect label global_label hierarchical_label netclass_flag text text_box image rule_area polyline rectangle circle arc sheet_instances symbol_instances group'.split(' ')])};
 function inspect(ast){
  const kind=String(value(ast?.[0])),field=name=>value(ast.find(x=>Array.isArray(x)&&value(x[0])===name)?.[1]);
  if(!Array.isArray(ast)||!known[kind])throw Error('Unsupported KiCad drawing root.');
  const generatorVersion=String(field('generator_version')??''),formatVersion=field('version')??null,major=/^(\d+)(?:\.|$)/.exec(generatorVersion),warnings=[];
  if(major&&Number(major[1])>10)warnings.push(`KiCad ${generatorVersion} is a forward-compatibility preview: only recognized saved constructs are rendered; new version features are not verified.`);
  const unknown=[...new Set(ast.filter(Array.isArray).map(x=>String(value(x[0]))).filter(x=>!known[kind].has(x)))];
  if(unknown.length)warnings.push('Unrecognized saved drawing constructs omitted: '+unknown.slice(0,40).join(', ')+(unknown.length>40?' …':''));
  return {majorVersion:major?Number(major[1]):null,kind,generatorVersion:generatorVersion||null,formatVersion,forwardPreview:Boolean(major&&Number(major[1])>10),unknown,warnings};
 }
 const features=Object.freeze([
  {id:'drawing',label:'Saved schematic / PCB geometry',since:8,implemented:true},
  {id:'review',label:'Selection, properties, comments and comparison',since:8,implemented:true},
  {id:'hierarchy',label:'Sheet navigation and cross-sheet highlighting',since:8,implemented:true},
  {id:'copper',label:'Saved copper fills and zone outlines',since:8,implemented:true},
  {id:'models',label:'Repository-linked 3D models',since:8,implemented:true},
  {id:'embeddedAssets',label:'Embedded fonts and 3D assets',since:9,implemented:false},
  {id:'componentClasses',label:'Component-class rules',since:9,implemented:false},
  {id:'netclassRuleAreas',label:'Schematic net-class rule areas',since:9,implemented:false},
  {id:'schematicTables',label:'Native schematic tables',since:9,implemented:false}
 ]);
 function capability(info,id){
  const feature=features.find(f=>f.id===id);
  if(!feature)return {available:false,reason:'This feature is not recognized by the viewer.',upgrade:false};
  const major=info?.majorVersion;
  if(Number.isInteger(major)&&major<feature.since)return {available:false,upgrade:true,reason:`${feature.label} requires KiCad ${feature.since} or later. This drawing identifies itself as KiCad ${info.generatorVersion||major}. Upgrade to the latest stable KiCad and save a separate project copy. `+(feature.implemented?'':'This viewer also needs support for this feature; upgrading the project alone will not enable it.')};
  if(!feature.implemented)return {available:false,upgrade:false,reason:`${feature.label} is not implemented in this viewer. Upgrading KiCad alone will not enable it.`};
  return {available:true,upgrade:false,reason:'Available for recognized saved data; existing geometry and connectivity limits still apply.'};
 }
 function mountStatus(host,read){
  const doc=host.ownerDocument||root.document;
  const button=doc.createElement('button');button.type='button';button.className='compatibility-button';button.title='Saved-file compatibility and feature availability';host.append(button);
  const dialog=doc.createElement('dialog');dialog.className='compatibility-dialog';dialog.setAttribute('aria-label','Saved-file compatibility');doc.body.append(dialog);
  const make=(tag,text)=>{const node=doc.createElement(tag);node.textContent=text;return node;};
  function explain(feature){
   const result=capability(read(),feature.id);if(result.available)return true;
   dialog.replaceChildren(make('h2',feature.label),make('p',result.reason));
   if(result.upgrade){const link=make('a','Get the latest stable KiCad');link.href='https://www.kicad.org/download/';link.target='_blank';link.rel='noopener noreferrer';dialog.append(link);}
   const close=make('button','Close');close.type='button';close.onclick=()=>dialog.close();dialog.append(close);if(!dialog.open)dialog.showModal();return false;
  }
  function show(){
   const info=read();dialog.replaceChildren(make('h2','Saved-file compatibility'),make('p',info?.generatorVersion?`KiCad ${info.generatorVersion} · saved format ${info.formatVersion??'unknown'}`:'Generator version unknown; no major version inferred from the format date.'));
   for(const feature of features){const result=capability(info,feature.id),row=make('button',`${result.available?'Available':'Blocked'} · ${feature.label}${result.available?'':' · Why?'}`);row.type='button';row.className='compatibility-feature';row.setAttribute('data-blocked',String(!result.available));row.title=result.reason;row.onclick=()=>result.available?undefined:explain(feature);dialog.append(row);}
   if(info?.unknown?.length)dialog.append(make('p','Omitted saved constructs: '+info.unknown.join(', ')+'. These are renderer limitations; upgrading alone is not a remedy.'));
   const close=make('button','Close');close.type='button';close.onclick=()=>dialog.close();dialog.append(close);if(!dialog.open)dialog.showModal();
  }
  dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
  button.onclick=show;
  const refresh=()=>{const info=read();button.textContent=info?.majorVersion?`KiCad ${info.majorVersion} · Features`:'File features';if(dialog.open)dialog.close();};refresh();
  return {refresh,check(id){const feature=features.find(f=>f.id===id);return feature?explain(feature):false;},dispose(){dialog.remove();button.remove();}};
 }
 root.KiCadFileCompatibility={inspect,features,capability,mountStatus};if(typeof module==='object'&&module.exports)module.exports=root.KiCadFileCompatibility;
})(typeof globalThis==='object'?globalThis:this);
