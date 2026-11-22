/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** gl.getError can synchronize CPU/GPU work. Probe newly created render targets,
 * not every steady orbit frame; shader/context-loss callbacks remain active. */
export function createGraphicsHealth(gl){
 let pending=true,checks=0;
 return {invalidate(){pending=true;},check(){if(!pending)return true;pending=false;checks++;return gl.getError()===gl.NO_ERROR;},stats:()=>({checks,pending})};
}
