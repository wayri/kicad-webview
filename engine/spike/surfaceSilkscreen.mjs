/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Saved silkscreen graphics, rasterized once per face within a fixed pixel budget. */
const value=item=>item&&typeof item==='object'&&!Array.isArray(item)?item.quoted:item;
const kind=node=>Array.isArray(node)?String(value(node[0])):'';
const child=(node,name)=>Array.isArray(node)?node.find(item=>kind(item)===name):undefined;
const silk=node=>['F.SilkS','B.SilkS'].includes(value(child(node,'layer')?.[1]));
export function silkscreenSource(ast){
  const result=[ast[0]];
  for(const node of ast.slice(1)){
    const type=kind(node);
    if(['version','generator','layers'].includes(type)||silk(node)&&type.startsWith('gr_'))result.push(node);
    else if(type==='footprint'){
      const selected=node.filter((item,index)=>index<2||['at','layer','uuid','tstamp'].includes(kind(item))||silk(item)&&['fp_line','fp_arc','fp_rect','fp_circle','fp_poly','fp_text','fp_curve','property'].includes(kind(item)));
      if(selected.some(item=>silk(item)))result.push(selected);
    }
  }
  return result;
}
export function silkscreenPlan(width,height,maxDimension=2048,constrained=false){
  if(![width,height,maxDimension].every(Number.isFinite)||width<=0||height<=0||maxDimension<1)return null;
  const dimension=Math.min(2048,maxDimension),maxPixels=constrained?524288:1048576;
  const scale=Math.min(16,dimension/width,dimension/height,Math.sqrt(maxPixels/width/height));
  const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
  return{width:w,height:h,scale:Math.min(w/width,h/height),pixels:w*h,maxPixels};
}
export function paintSilkscreen(ctx,primitives,bounds,plan,clipLoops,arcThrough){
  const px=point=>({x:(point.x-bounds.minX)*plan.width/(bounds.maxX-bounds.minX),y:(point.y-bounds.minY)*plan.height/(bounds.maxY-bounds.minY)});
  const zoom=plan.scale;ctx.clearRect(0,0,plan.width,plan.height);ctx.save();
  if(clipLoops?.length){ctx.beginPath();for(const loop of clipLoops){loop.forEach((point,index)=>{const p=px({x:point[0],y:point[1]});if(index)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();}ctx.clip('evenodd');}
  for(const p of primitives){
    ctx.save();ctx.strokeStyle=ctx.fillStyle='#f2efda';ctx.lineWidth=Math.max(.6,(p.width||.15)*zoom);ctx.lineCap=ctx.lineJoin='round';
    if(p.type==='text'){
      const q=px(p),size=(p.fontHeight||p.size||1)*zoom;ctx.translate(q.x,q.y);ctx.rotate((p.angle||0)*Math.PI/180);
      if(p.mirror||p.mirrored)ctx.scale(-1,1);
      ctx.font=`${p.bold?'bold ':''}${p.italic?'italic ':''}${size*4/3}px Arial,sans-serif`;ctx.textAlign=p.align||'center';ctx.textBaseline=p.baseline||'middle';
      if(p.fontWidth&&p.fontHeight)ctx.scale(p.fontWidth/p.fontHeight,1);
      String(p.text||'').split('\n').forEach((text,i,lines)=>ctx.fillText(text,0,(i-(lines.length-1)/2)*size*(p.lineSpacing||1.5)));ctx.restore();continue;
    }
    ctx.beginPath();
    if(p.type==='arc'){
      const arc=arcThrough?.(p.start,p.mid,p.end);if(arc){const q=px(arc);ctx.arc(q.x,q.y,arc.r*zoom,arc.start,arc.end,arc.ccw);}
    }else if(p.type==='circle'){const q=px(p);ctx.arc(q.x,q.y,p.r*zoom,0,2*Math.PI);}
    else {for(const [index,point]of(p.points||[]).entries()){const q=px(point);if(index)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);}if(p.type==='polygon')ctx.closePath();}
    if(p.fill)ctx.fill();if(p.stroke!==false)ctx.stroke();ctx.restore();
  }
  ctx.restore();
}
