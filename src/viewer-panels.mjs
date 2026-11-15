/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Host-local panel preference; temporary viewport clamps never overwrite it. */
export function panelWidth(preferred, available) {
  if (typeof preferred !== 'number' || !Number.isFinite(preferred) || preferred < 240 || preferred > 480) throw new TypeError('Inspector width must be 240 to 480 pixels.');
  const width = Number.isFinite(available) && available > 0 ? available : preferred + 16;
  return Math.round(Math.min(preferred, Math.max(0, width - 16)));
}

export const PANEL_STYLE = `
.viewer-inspector{top:calc(var(--viewer-toolbar-height,48px) + 8px);width:var(--viewer-panel-width,310px);max-height:calc(100% - var(--viewer-toolbar-height,48px) - 16px);overscroll-behavior:contain}
.inspector-resize{position:absolute;top:0;bottom:0;left:0;width:7px;z-index:2;cursor:ew-resize;touch-action:none}
.inspector-resize:hover,.inspector-resize:focus-visible{background:var(--viewer-accent);opacity:.7;outline:none}
.inspector-tabs{flex-shrink:0}
.inspector-heading{flex-shrink:0}.viewer-inspector .inspector-body{overflow:auto;overscroll-behavior:contain}.inspector-fields dd{min-width:0}.inspector-options summary{cursor:pointer;min-height:32px;display:list-item;font:600 11px system-ui;padding:8px 0}.inspector-options summary:focus-visible{outline:2px solid var(--viewer-accent)}.inspector-options label{display:flex;gap:7px;align-items:center;min-height:32px}
@container(max-width:580px){.viewer-inspector{top:auto;right:8px;width:calc(100% - 16px);max-height:min(65%,calc(100% - var(--viewer-toolbar-height,96px) - 16px))}.inspector-resize{display:none}}
.viewer-inspector[data-short="true"]{overflow:auto}.viewer-inspector[data-short="true"] .inspector-body{flex:0 0 auto;min-height:60px}.viewer-inspector[data-short="true"] .inspector-footer{flex-shrink:0}
`;

/** Width changes affect only the overlay: never resize or refit its drawing. */
export function createPanelSizing(viewer, panel) {
  const handle = viewer.host.ownerDocument.createElement('div');
  handle.className = 'inspector-resize'; handle.tabIndex = 0;
  handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize inspector');
  handle.setAttribute('aria-valuemin', '240'); handle.setAttribute('aria-valuemax', '480');
  panel.append(handle);
  let preferred = 310, displayed = 310, drag = null, disposed = false;
  const state = () => ({open: !panel.hidden, preferredWidth: preferred, width: displayed});
  const sync = () => {
    if (disposed) return;
    displayed = panelWidth(preferred, viewer.root?.clientWidth || viewer.host.clientWidth);
    const height = viewer.root?.clientHeight || viewer.host.clientHeight;
    panel.setAttribute('data-short', String(Number.isFinite(height) && height > 0 && height <= 420));
    panel.style.setProperty?.('--viewer-panel-width', displayed + 'px');
    handle.setAttribute('aria-valuenow', String(preferred));
    handle.setAttribute('aria-valuetext', preferred + ' pixels');
  };
  const setWidth = width => { panelWidth(width); preferred = width; sync(); viewer.emit?.('panelchange', state()); return state(); };
  const end = event => {
    if (!drag || event?.pointerId !== undefined && event.pointerId !== drag.id) return;
    const id = drag.id; drag = null;
    if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture?.(id);
  };
  const down = event => {
    if (event.button !== 0 || drag) return;
    drag = {id:event.pointerId, x:event.clientX, width:preferred};
    handle.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation();
  };
  const move = event => {
    if (!drag || drag.id !== event.pointerId) return;
    setWidth(Math.max(240, Math.min(480, drag.width + drag.x - event.clientX)));
    event.stopPropagation();
  };
  const key = event => {
    if (event.ctrlKey || event.altKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key)) return;
    if (event.key === 'Escape') { end(); return; }
    const step = event.shiftKey ? 64 : 16;
    setWidth(event.key === 'Home' ? 240 : event.key === 'End' ? 480 : Math.max(240, Math.min(480, preferred + (event.key === 'ArrowLeft' ? step : -step))));
    event.preventDefault(); event.stopPropagation();
  };
  const events = {pointerdown:down, pointermove:move, pointerup:end, pointercancel:end, lostpointercapture:end, keydown:key};
  for (const [name, fn] of Object.entries(events)) handle.addEventListener?.(name, fn);
  const Observer = viewer.host.ownerDocument.defaultView?.ResizeObserver || globalThis.ResizeObserver;
  const observer = Observer && viewer.root ? new Observer(sync) : null; observer?.observe(viewer.root); sync();
  return {handle, sync, setWidth, getState:state, dispose(){ if(disposed)return; end(); disposed=true; observer?.disconnect(); for(const [name,fn]of Object.entries(events))handle.removeEventListener?.(name,fn); handle.remove(); }};
}
