/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* WebGL camera reprojection of a bounded Canvas2D snapshot during gestures.
 * Source geometry, picking and settled drawing remain owned by owned-canvas.js. */
((root)=>{
  'use strict';
  const MAX_PIXELS=16000000;
  function transform(saved,current){
    if(saved.flipped!==current.flipped)return null;
    const scale=current.zoom/saved.zoom,sign=current.flipped?-1:1;
    const x=(saved.x-current.x)*current.zoom*sign+current.width/2-saved.width*scale/2;
    const y=(saved.y-current.y)*current.zoom+current.height/2-saved.height*scale/2;
    const width=saved.width*scale,height=saved.height*scale;
    if(![x,y,width,height,scale].every(Number.isFinite)||scale<.8||scale>1.5||x>0||y>0||x+width<current.width||y+height<current.height)return null;
    return {x,y,width,height};
  }
  const vertex=`attribute vec2 position; varying vec2 screen;
    void main(){gl_Position=vec4(position,0.0,1.0);screen=vec2(position.x,-position.y)*0.5+0.5;}`;
  const fragment=`precision highp float; varying vec2 screen;
    uniform sampler2D image; uniform vec2 viewportSize; uniform vec4 rect;
    void main(){gl_FragColor=texture2D(image,(screen*viewportSize-rect.xy)/rect.zw);}`;
  class Motion {
    constructor(host){
      this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');
      Object.assign(this.canvas.style,{position:'absolute',inset:'0',pointerEvents:'none',display:'none'});
      this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
      if(!this.gl)throw Error('WebGL is unavailable.');
      const gl=this.gl;this.shaders=[];
      try{
        const compile=(type,source)=>{const shader=gl.createShader(type);this.shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('WebGL shader compilation failed.');return shader;};
        this.program=gl.createProgram();gl.attachShader(this.program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
        if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('WebGL shader linking failed.');
        this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
        for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
        this.position=gl.getAttribLocation(this.program,'position');this.viewportUniform=gl.getUniformLocation(this.program,'viewportSize');this.rectUniform=gl.getUniformLocation(this.program,'rect');this.imageUniform=gl.getUniformLocation(this.program,'image');
        this.lost=event=>{event.preventDefault();this.failed=true;this.hide();this.onLost?.();};this.canvas.addEventListener('webglcontextlost',this.lost);host.append(this.canvas);
      }catch(error){this.dispose();throw error;}
    }
    upload(snapshot,saved){
      const gl=this.gl,max=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(snapshot.width>max||snapshot.height>max||snapshot.width*snapshot.height>MAX_PIXELS)throw Error('WebGL motion snapshot exceeds the texture budget.');
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,snapshot);
      if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL motion texture upload failed.');
      this.saved=saved;
    }
    show(current,dpr){
      if(this.failed||!this.saved)return false;
      const rect=transform(this.saved,current);if(!rect)return false;
      const gl=this.gl,width=Math.round(current.width*dpr),height=Math.round(current.height*dpr);
      if(width*height>MAX_PIXELS)return false;
      if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;
      this.canvas.style.width=current.width+'px';this.canvas.style.height=current.height+'px';
      gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.position);gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(this.imageUniform,0);gl.uniform2f(this.viewportUniform,current.width,current.height);gl.uniform4f(this.rectUniform,rect.x,rect.y,rect.width,rect.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR){this.failed=true;this.hide();return false;}
      this.canvas.style.display='block';return true;
    }
    hide(){if(this.canvas)this.canvas.style.display='none';}
    dispose(){
      this.hide();if(this.lost)this.canvas.removeEventListener('webglcontextlost',this.lost);
      const gl=this.gl;if(gl){if(this.texture)gl.deleteTexture(this.texture);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);for(const shader of this.shaders||[])if(shader)gl.deleteShader(shader);}
      this.canvas.remove();
    }
  }
  root.KiCadMotionWebGL={Motion,transform,MAX_PIXELS};
  if(typeof module==='object'&&module.exports)module.exports=root.KiCadMotionWebGL;
})(globalThis);
