/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Bounds stay in the footprint's oriented frame; saved drawing points are
// already placed/mirrored by the board parser. Never apply model offsets here.
export function footprintProxies(board) {
  const byRef = new Map(), counts = new Map(), result = new Map();
  for (const part of board.components) counts.set(part.ref, (counts.get(part.ref) || 0) + 1);
  for (const item of [...board.drawings, ...board.pads]) {
    if (!item.ref) continue;
    if (!byRef.has(item.ref)) byRef.set(item.ref, []);
    byRef.get(item.ref).push(item);
  }
  for (const part of board.components) {
    if (counts.get(part.ref) !== 1) continue; // Ambiguous geometry is not guessed.
    const records = byRef.get(part.ref) || [];
    const side = part.layer?.startsWith('B.') ? 'B' : 'F';
    let points = [], outline = null;
    for (const layer of [side + '.Fab', side + '.CrtYd']) {
      const paths = records.filter(item => item.layer === layer && item.points).map(item => item.points);
      points = paths.flat(); outline = closedOutline(paths);
      if (points.length) break;
    }
    if (!points.length) {
      for (const pad of records.filter(item => item.at && item.width > 0 && item.height > 0)) {
        const angle = -(pad.rotation || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        for (const x of [-pad.width / 2, pad.width / 2]) for (const y of [-pad.height / 2, pad.height / 2])
          points.push([pad.at[0] + x * c - y * s, pad.at[1] + x * s + y * c]);
      }
    }
    const angle = (part.rotation || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const local = points.filter(p => p?.length >= 2 && p.every(Number.isFinite)).map(([x, y]) => {
      x -= part.at[0]; y -= part.at[1];
      return [x * c - y * s, x * s + y * c];
    });
    if (!local.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of local) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    let width = maxX - minX, height = maxY - minY;
    if (!(width > 1e-6 && height > 1e-6)) continue;
    const x = (minX + maxX) / 2, y = (minY + maxY) / 2;
    if (outline) {
      const polygon = outline.map(([px, py]) => { px -= part.at[0]; py -= part.at[1]; return [px * c - py * s, px * s + py * c]; });
      // Inscribe the box even for circular/chamfered/concave body outlines.
      if (!inside([x, y], polygon)) continue;
      let lo = 0, hi = 1;
      for (let i = 0; i < 30; i++) {
        const scale = (lo + hi) / 2;
        const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => [x + a * width * scale / 2, y + b * height * scale / 2]);
        const fits = corners.every(p => inside(p, polygon)) && !corners.some((p,j) => polygon.some((q,k) => crosses(p,corners[(j+1)%4],q,polygon[(k+1)%polygon.length])));
        if (fits) lo = scale; else hi = scale;
      }
      width *= lo; height *= lo;
      if (!(width > 1e-6 && height > 1e-6)) continue;
    }
    result.set(part, { at: [part.at[0] + x * c + y * s, part.at[1] - x * s + y * c],
      width, height, rotation: angle }); // Scene Y is inverted: use +angle.
  }
  return result;
}

const near = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]) < 1e-5;
function closedOutline(paths) {
  if (paths.length > 512) return [];
  const remaining = paths.filter(p => p.length > 1).map(p => [...p]), loops = [];
  while (remaining.length) {
    const path = remaining.shift();
    while (!near(path[0],path.at(-1))) {
      const i = remaining.findIndex(p => near(path.at(-1),p[0]) || near(path.at(-1),p.at(-1)));
      if (i < 0) break;
      const next = remaining.splice(i,1)[0]; if (!near(path.at(-1),next[0])) next.reverse();
      path.push(...next.slice(1));
    }
    if (path.length > 3 && near(path[0],path.at(-1))) loops.push(path.slice(0,-1));
  }
  // More than one closed body could include a hole; use only unambiguous outlines.
  return loops.length === 1 ? loops[0] : loops.length ? [] : null;
}
function inside(p, polygon) {
  let yes = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if ((a[1]>p[1]) !== (b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
  }
  return yes;
}
function crosses(a,b,c,d) {
  const side=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  return side(a,b,c)*side(a,b,d)<-1e-12 && side(c,d,a)*side(c,d,b)<-1e-12;
}
