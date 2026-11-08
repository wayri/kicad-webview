/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Host-supplied full-color canvas graphics; values are scripted, not a solve. */
export function drawTFT(ctx,w,h,{value,phase,running,held,marker}){
 const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#162d6b');gradient.addColorStop(.5,'#131e3d');gradient.addColorStop(1,'#541e53');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#ffffff';ctx.font='bold 22px system-ui';ctx.fillText('FULL COLOR TFT',14,30);ctx.font='13px monospace';ctx.fillStyle='#a9c8ff';ctx.fillText((running?'LIVE':'PAUSED')+' / SCRIPTED GRAPHICS',14,51);
 ctx.fillStyle='#071326';ctx.fillRect(12,66,w-24,99);ctx.strokeStyle='#263c59';ctx.lineWidth=1;for(let y=82;y<160;y+=20){ctx.beginPath();ctx.moveTo(12,y);ctx.lineTo(w-12,y);ctx.stroke();}
 for(const [i,color]of ['#48edcc','#ff6cad','#ffcf64'].entries()){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();for(let x=16;x<w-16;x++){const y=114+Math.sin((x-16)*.035+phase+i*1.7)*(12+value*.22);x===16?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
 const palette=['#ff496c','#ff9e45','#ffe05c','#59e5a7','#4cd9f5','#777bff','#df71ef'];palette.forEach((color,i)=>{ctx.fillStyle=color;ctx.fillRect(12+i*(w-24)/palette.length,176,(w-24)/palette.length+1,18);});
 ctx.fillStyle=held?'#ffe05c':'#ffffff';ctx.font='bold 18px monospace';ctx.fillText('LEVEL '+String(value).padStart(3,'0'),14,220);ctx.font='12px monospace';ctx.fillStyle='#c7d5fa';ctx.fillText(held?'KEY HELD':'SPACE = KEY',185,219);
 if(marker){const x=marker.x*w,y=(1-marker.y)*h;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x-7,y-7,14,14);ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();}
}
