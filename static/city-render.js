// Isometric city drawing primitives. Camera = {ox, oy, s}; world units are tiles.
const HW = 26, HH = 13, FLOOR = 14;

const proj = (cam, x, y) => ({ sx: cam.ox + (x - y) * HW * cam.s, sy: cam.oy + (x + y) * HH * cam.s });

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.round(Math.min(255, v * f));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function quad(ctx, a, b, c, d, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
  ctx.closePath();
  ctx.fill();
}

const lift = (p, h) => ({ sx: p.sx, sy: p.sy - h });

function drawBuilding(ctx, cam, b, t) {
  const f = b.foot / 2;
  const base = [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)];
  const h = b.floors * FLOOR * b.heightScale * cam.s;
  const top = base.map(p => lift(p, h));
  quad(ctx, base[3], base[2], top[2], top[3], shade(b.color, .55));   // SW face
  quad(ctx, base[2], base[1], top[1], top[2], shade(b.color, .75));   // SE face
  quad(ctx, top[0], top[1], top[2], top[3], shade(b.color, 1.05));    // roof
  if (h > 14 * cam.s) drawWindows(ctx, cam, base, h, b, t);
  b.screen = { sx: (base[1].sx + base[3].sx) / 2, top: top[2].sy - 4,
               x0: base[3].sx, x1: base[1].sx, y0: top[2].sy, y1: base[2].sy };
}

function drawWindows(ctx, cam, base, h, b, t) {
  const seed = hash(b.path);
  const glow = Math.max(b.lit, (seed % 10 < 3 ? .35 : 0) + Math.sin(t / 900 + seed) * .04);
  for (let k = 0; k < b.floors; k++) {
    const y = -((k + .55) / b.floors) * h;
    for (const [a, c, off] of [[base[3], base[2], 0], [base[2], base[1], b.floors]]) {
      const lit = glow > 0 && (seed >> (k + off)) % 3 !== 0;
      ctx.fillStyle = lit ? `rgba(255,214,120,${Math.min(1, .25 + glow)})` : 'rgba(20,12,24,.55)';
      for (const u of [.3, .65]) {
        const x = a.sx + (c.sx - a.sx) * u, yy = a.sy + (c.sy - a.sy) * u + y;
        ctx.fillRect(x - 2 * cam.s, yy, 4 * cam.s, 5 * cam.s);
      }
    }
  }
}

function drawCityHall(ctx, cam, x, y) {
  const c = proj(cam, x, y), s = cam.s;
  const w = 64 * s, h = 54 * s, base = c.sy + 14 * s;
  ctx.fillStyle = '#b08c3e';
  ctx.fillRect(c.sx - w / 2 - 8 * s, base - 6 * s, w + 16 * s, 8 * s);        // steps
  ctx.fillStyle = '#d4a953';
  ctx.fillRect(c.sx - w / 2, base - h, w, h - 6 * s);
  ctx.fillStyle = '#f9efe3';
  for (let i = 0; i < 5; i++)                                                // columns
    ctx.fillRect(c.sx - w / 2 + (4 + i * 13) * s, base - h + 14 * s, 5 * s, h - 24 * s);
  ctx.fillStyle = '#b08c3e';
  ctx.beginPath();                                                           // pediment
  ctx.moveTo(c.sx - w / 2 - 6 * s, base - h + 14 * s);
  ctx.lineTo(c.sx, base - h - 16 * s);
  ctx.lineTo(c.sx + w / 2 + 6 * s, base - h + 14 * s);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a2c4d'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#c0395b';
  ctx.fillRect(c.sx - 1.5 * s, base - h - 34 * s, 3 * s, 20 * s);            // flag pole
  ctx.fillRect(c.sx + 1.5 * s, base - h - 34 * s, 12 * s, 7 * s);
}

function drawCloud(ctx, cam, cloud, t) {
  const { sx, sy } = cloud;
  const bob = Math.sin(t / 2400 + hash(cloud.name)) * 6 * cam.s;
  const x = sx + bob, s = cam.s;
  ctx.strokeStyle = 'rgba(249,239,227,.35)';
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(x, sy + 14 * s); ctx.lineTo(cloud.ax, cloud.ay); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f9efe3';
  for (const [dx, dy, w, h] of [[-30, -8, 60, 16], [-18, -18, 36, 14], [-6, 2, 42, 12]])
    ctx.fillRect(x + dx * s, sy + dy * s, w * s, h * s);
  ctx.fillStyle = '#f9efe3';
  ctx.font = `bold ${Math.max(8, 9 * s)}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(cloud.name, x, sy - 24 * s);
}

function drawLabel(ctx, cam, block) {
  const p = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows + .6);
  ctx.font = `${Math.max(7, 9 * cam.s)}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(243,207,217,.75)';
  ctx.fillText(block.comp.name.toUpperCase(), p.sx, p.sy);
}
