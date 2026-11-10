/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
export const INSPECTION_STYLE=`
.viewer-layers{position:static}.viewer-layer-list{right:8px;top:calc(var(--viewer-toolbar-height,48px) + 6px);width:min(330px,calc(100cqw - 20px));min-width:0;max-height:calc(100% - var(--viewer-toolbar-height,48px) - 14px);overflow:auto}
.inspection-presets{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}.viewer-toolbar .inspection-presets button,.viewer-toolbar .layer-row button{min-height:36px;border:1px solid var(--viewer-border);background:var(--viewer-bg)}
.viewer-layer-list .layer-row{display:flex;align-items:center;gap:5px;min-width:0}.viewer-layer-list .layer-row label{flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;min-height:36px}
.layer-swatch{width:12px;height:12px;flex:0 0 12px;border:1px solid var(--viewer-border);border-radius:3px}.layer-row[data-focused="true"]{background:var(--viewer-active);border-radius:5px}
.viewer-layer-list .inspection-field{display:flex;flex-wrap:wrap;align-items:center;gap:6px;white-space:normal;margin:8px 0}.viewer-layer-list select,.viewer-layer-list input[type="search"]{width:100%;min-width:0;min-height:36px;padding:7px;border:1px solid var(--viewer-border);border-radius:5px;background:var(--viewer-bg);color:var(--viewer-ink);font:12px system-ui}.viewer-layer-list input[type="search"]{height:auto}.inspection-help{font:11px/1.5 system-ui;color:var(--viewer-muted);white-space:normal;margin:8px 0}
@media(pointer:coarse){.viewer-layer-list .layer-row label,.viewer-toolbar .inspection-presets button,.viewer-toolbar .layer-row button,.viewer-layer-list select{min-height:44px}}
`;
function tools(viewer,make,icon,fail,label,iconName='layers'){
  const menu=make('details','viewer-layers'),summary=make('summary'),popup=make('div','viewer-layer-list');summary.title=label;summary.setAttribute('aria-label',label);summary.append(icon(iconName));menu.append(summary,popup);
  const button=(text,action)=>{const node=make('button');node.type='button';node.textContent=text;node.onclick=()=>{try{action();}catch(error){fail(error);}};return node;};
  const close=button('Close',()=>{menu.open=false;summary.focus?.();});close.setAttribute('aria-label','Close '+label.toLowerCase());popup.append(close);
  const select=(label,choices,action)=>{const row=make('label','inspection-field'),name=make('span'),control=make('select');name.textContent=label;control.setAttribute('aria-label',label);for(const [value,text]of choices){const option=make('option');option.value=value;option.textContent=text;control.append(option);}control.onchange=()=>{try{action(control.value);}catch(error){fail(error);}};row.append(name,control);popup.append(row);return control;};
  return {menu,summary,popup,button,select};
}
export function createHighlightControls(viewer,make,icon,fail){
  const ui=tools(viewer,make,icon,fail,'Highlight settings','highlight');
  const mode=ui.select('Highlight style',[['dim','Dim context'],['bright','Bright only'],['isolate','Isolate selection']],value=>viewer.setHighlightStyle(value));
  const color=ui.select('Highlight color',[['accent','Accent color'],['source','Source colors']],value=>viewer.setHighlightStyle(viewer.highlightMode,{color:value}));
  const clear=ui.button('Clear selection',()=>viewer.clearSelection());ui.popup.append(clear);
  const help=make('p','inspection-help');help.textContent='Style affects selected parts, pads and nets. Hidden layers remain hidden. Clear restores the surrounding design.';ui.popup.append(help);
  return {...ui,update(){ui.menu.hidden=!['pcb','schematic','3d'].includes(viewer.view)||!viewer.renderer;mode.value=viewer.highlightMode;color.value=viewer.highlightColor;},dispose(){mode.onchange=color.onchange=clear.onclick=null;}};
}
export function createLayerControls(viewer,make,icon,fail){
  const ui=tools(viewer,make,icon,fail,'Layers'),filter=make('input'),list=make('div'),presets=make('div','inspection-presets'),rows=new Map();let signature=null,lastDesign=null;
  filter.type='search';filter.placeholder='Find a layer';filter.setAttribute('aria-label','Find a layer');ui.popup.append(filter,presets);
  for(const [preset,label]of [['all','All'],['none','None'],['front','Front'],['back','Back'],['copper','Copper']])presets.append(ui.button(label,()=>viewer.setLayerPreset(preset)));
  const restore=ui.button('Restore view',()=>viewer.restoreLayerView());presets.append(restore);
  const mode=ui.select('Layer focus mode',[['dim','Dim other layers'],['isolate','Isolate focused layer']],value=>{const state=viewer.getLayerState();if(state.focused)viewer.focusLayer(state.focused,{mode:value});});
  const focusActions=make('div','inspection-presets'),fit=ui.button('Fit focused layer',()=>viewer.fitFocusedLayer()),clear=ui.button('Clear layer focus',()=>viewer.clearLayerFocus());focusActions.append(fit,clear);ui.popup.append(focusActions);
  const status=make('p','inspection-help');status.setAttribute('role','status');ui.popup.append(status,list);
  const reveal=ui.button('Reveal internal copper',()=>{viewer.setAppearance('translucent');viewer.updateControls();});ui.popup.append(reveal);
  filter.oninput=()=>{const query=(filter.value||'').trim().toLowerCase();for(const [layer,row]of rows)row.node.hidden=!layer.toLowerCase().includes(query);};
  function update(){
    const state=viewer.getLayerState();ui.menu.hidden=!state.layers.length;if(ui.menu.hidden)ui.menu.open=false;
    const key=viewer.view+'|'+(viewer.path||'')+'|'+state.layers.join('\0');
    if(key!==signature||lastDesign!==viewer.design){signature=key;lastDesign=viewer.design;const counts=new Map();for(const p of viewer.design?.primitives||[])if(p.layer)counts.set(p.layer,(counts.get(p.layer)||0)+1);rows.clear();list.replaceChildren();for(const layer of state.layers){
      const node=make('div','layer-row'),label=make('label'),input=make('input'),swatch=make('span','layer-swatch'),text=make('span');node.title=layer;input.type='checkbox';input.setAttribute('aria-label','Show layer '+layer);text.textContent=layer;swatch.style.background=globalThis.KiCadPCBRenderer?.colorFor?.(layer)||'#819baa';
      input.onchange=()=>{try{const visible=new Set(viewer.getLayerState().visible);input.checked?visible.add(layer):visible.delete(layer);viewer.setLayers([...visible]);}catch(error){fail(error);}};
      const focus=ui.button('Focus',()=>viewer.focusLayer(layer,{mode:mode.value}));focus.setAttribute('aria-label','Focus layer '+layer);const count=make('small');count.textContent=String(counts.get(layer)||0);count.title='Saved drawing primitives on this layer';label.append(input,swatch,text,count);node.append(label,focus);list.append(node);rows.set(layer,{node,input,focus});
    }}
    const visible=new Set(state.visible);
    for(const [layer,row]of rows){row.input.checked=visible.has(layer);row.focus.hidden=!state.canFocus;row.focus.setAttribute('aria-pressed',String(state.focused===layer));row.node.setAttribute('data-focused',String(state.focused===layer));}
    mode.parentNode&&(mode.parentNode.hidden=!state.canFocus);focusActions.hidden=!state.canFocus;fit.disabled=clear.disabled=!state.focused;restore.disabled=!state.canRestore;mode.value=state.focused?state.focusMode:mode.value||'dim';
    status.textContent=state.focused?state.focused+' · '+(state.focusMode==='isolate'?'isolated':'other layers dimmed'):viewer.view==='3d'?'Copper visibility. Internal layers are rendered in Translucent appearance.':'Select layers to show, or focus one layer. [ and ] cycle; Shift+F fits focus.';
    reveal.hidden=viewer.view!=='3d';filter.oninput();
  }
  const keys=event=>{const tag=event.target?.tagName?.toLowerCase();if(['input','textarea','select','button'].includes(tag)||event.target?.isContentEditable||event.ctrlKey||event.altKey||event.metaKey)return;const state=viewer.getLayerState();if(!state.canFocus)return;
    if(['[',']'].includes(event.key)){event.preventDefault();const index=state.layers.indexOf(state.focused||viewer.renderer.activeLayer),step=event.key===']'?1:-1;viewer.focusLayer(state.layers[(index+step+state.layers.length)%state.layers.length],{mode:mode.value||'dim'});}
    else if(event.shiftKey&&event.key.toLowerCase()==='f'){event.preventDefault();viewer.fitFocusedLayer();}
  };viewer.surface.addEventListener?.('keydown',keys);
  return {...ui,list,filter,update,dispose(){viewer.surface.removeEventListener?.('keydown',keys);filter.oninput=mode.onchange=null;rows.clear();}};
}
