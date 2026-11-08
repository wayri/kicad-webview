/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Screen-relative CAD orbit using the pinned Three controller's input/pan/zoom.
 * Rotate the camera frame with vertical motion instead of clamping a spherical
 * camera at a world-up pole. The same frame defines panning and button views. */
export function boardOrbitControls(OrbitControls) {
 return class BoardOrbitControls extends OrbitControls {
  _viewFrame() {
   const offset=this.object.position.clone().sub(this.target),view=offset.clone().normalize();
   let up=this.object.up.clone().addScaledVector(view,-this.object.up.dot(view));
   if(up.lengthSq()<1e-8){up.setFromMatrixColumn(this.object.matrix,1);up.addScaledVector(view,-up.dot(view));}
   if(up.lengthSq()<1e-8){up.set(Math.abs(view.y)<.9?0:1,Math.abs(view.y)<.9?1:0,0);up.addScaledVector(view,-up.dot(view));}
   up.normalize();this.object.up.copy(up);return{offset,up,right:up.clone().cross(view).normalize()};
  }
  _inputAngle(angle){const h=this.domElement?.clientHeight||600,w=this.domElement?.clientWidth||600;return angle*h/Math.max(600,w,h);}
  _rotateLeft(angle) {
   const {offset,up}=this._viewFrame();offset.applyAxisAngle(up,-this._inputAngle(angle));this.object.position.copy(this.target).add(offset);
  }
  _rotateUp(angle) {
   const {offset,up,right}=this._viewFrame(),turn=-this._inputAngle(angle);offset.applyAxisAngle(right,turn);up.applyAxisAngle(right,turn);this.object.up.copy(up);this.object.position.copy(this.target).add(offset);
  }
  update(deltaTime) {
   const {up}=this._viewFrame();
   this._quat.setFromUnitVectors(up,up.clone().set(0,1,0));this._quatInverse.copy(this._quat).invert();
   return super.update(deltaTime);
  }
 };
}

/** Pan mode applies to both a mouse drag and a one-finger gesture. */
export function setBoardPanMode(controls, input, enabled){
 controls.mouseButtons.LEFT=enabled?input.MOUSE.PAN:input.MOUSE.ROTATE;
 controls.touches.ONE=enabled?input.TOUCH.PAN:input.TOUCH.ROTATE;
}
