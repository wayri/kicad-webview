/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {tapGesture} from './selectionState.mjs';
/** Native contextmenu may precede right-drag movement. Pick only on an unmoved release. */
export function selectionGesture({onPick,onContextMenu,isHeld=()=>false},limit=6){
 const tap=tapGesture(limit);
 return {
  down:event=>tap.down(event),move:event=>tap.move(event),cancel:event=>tap.cancel(event),
  up(event,{select=true}={}){const tapped=tap.up(event);if(select&&tapped&&!isHeld()){if(event.button===0)onPick(event);else if(event.button===2)onContextMenu(event);}return tapped;},
  context(event){event.preventDefault?.();if(event.button!==2&&!isHeld())onContextMenu(event);}
 };
}
