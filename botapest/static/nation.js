// Nation view: repos as cities on isometric pixel terrain — each state a colored land
// province, canals/sea between them, lineage roads across. Zoom in and a city blooms
// into its full Botapest city (City.layout + embedded City.draw via a derived sub-camera).
const canvas = document.getElementById('nation');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const { proj, hash, shade, mix } = City;
const HW = 26, HH = 13;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cam = { ox: 0, oy: 0, s: 1, rot: 0, cx: 0, cy: 0 };
let nation = null, tween = null;

const WATER = 0, PLAZA = 1;                                 // ground codes; land is 10 + state index
const SEA = 2;                                              // tiles of water between provinces
const PLAZACOL = ['#e3d2b2', '#d8c5a0'];

function tile(x, y, fill) {
  const a = proj(cam, x, y), b = proj(cam, x + 1, y), c = proj(cam, x + 1, y + 1), d = proj(cam, x, y + 1);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
  ctx.closePath(); ctx.fill();
}

function quad(a, b, c, d, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
  ctx.closePath(); ctx.fill();
}

// ---- layout: pack cities into integer tile grids per state, stamp a terrain grid ----
function layoutNation(data) {
  const byRepo = {};
  const color = Object.fromEntries(data.states.map(s => [s.id, s.color]));
  for (const c of data.cities) {
    c.fr = clamp(Math.round(Math.sqrt(c.files) / 6) + 1, 2, 4);   // footprint radius in tiles
    c.size = c.fr;
    c.color = color[c.state] || '#7d6b8a';
    byRepo[c.repo] = c;
  }
  const blocks = data.states.map((st, si) => {
    const list = st.repos.map(r => byRepo[r]).filter(Boolean).sort((a, b) => b.fr - a.fr);
    const cols = Math.max(1, Math.ceil(Math.sqrt(list.length)));
    const cell = Math.max(...list.map(c => 2 * c.fr + 1)) + 1;
    const rows = Math.ceil(list.length / cols);
    return { st, si, list, cols, cell, iw: cols * cell + 1, ih: rows * cell + 1,
             landA: mix(st.color, '#20141c', .5), landB: mix(st.color, '#160d14', .5) };
  }).filter(b => b.list.length);

  const area = blocks.reduce((a, b) => a + b.iw * b.ih, 0);
  const targetW = Math.max(...blocks.map(b => b.iw), Math.round(Math.sqrt(area) * 1.2));
  let x = SEA, y = SEA, rowH = 0;
  for (const b of blocks) {
    if (x + b.iw > targetW + SEA && x > SEA) { x = SEA; y += rowH + SEA; rowH = 0; }
    b.x0 = x; b.y0 = y;
    b.list.forEach((c, i) => {
      c.x = x + 1 + (i % b.cols) * b.cell + b.cell / 2;
      c.y = y + 1 + Math.floor(i / b.cols) * b.cell + b.cell / 2;
    });
    x += b.iw + SEA; rowH = Math.max(rowH, b.ih);
  }
  const W = Math.max(...blocks.map(b => b.x0 + b.iw)) + SEA;
  const H = y + rowH + SEA;

  const g = Array.from({ length: H }, () => new Array(W).fill(WATER));
  for (const b of blocks)
    for (let ty = b.y0; ty < b.y0 + b.ih && ty < H; ty++)
      for (let tx = b.x0; tx < b.x0 + b.iw && tx < W; tx++) g[ty][tx] = 10 + b.si;
  for (const c of data.cities)                              // cream plaza pad under each city
    for (let dy = -c.fr; dy <= c.fr; dy++)
      for (let dx = -c.fr; dx <= c.fr; dx++) {
        const tx = Math.floor(c.x) + dx, ty = Math.floor(c.y) + dy;
        if (g[ty]?.[tx] >= 10) g[ty][tx] = PLAZA;
      }

  const props = [];                                         // tree scatter on bare land for terrain texture
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const h = hash(`t${tx},${ty}`);
      if (g[ty][tx] >= 10 && h % 7 === 0)
        props.push({ x: tx + .5, y: ty + .5, seed: h, tree: true });
    }
  const roads = data.roads.map(r => ({ a: byRepo[r.from], b: byRepo[r.to] })).filter(r => r.a && r.b);
  return { blocks, byBlock: Object.fromEntries(blocks.map(b => [b.si, b])), cities: data.cities,
           props, roads, byRepo, g, W, H, root: data.root };
}

function fit() {
  cam.cx = nation.W / 2; cam.cy = nation.H / 2;
  cam.s = Math.min((canvas.width - 60) / ((nation.W + nation.H) * HW),
                   (canvas.height - 120) / ((nation.W + nation.H) * HH));
  cam.ox = 0; cam.oy = 0;
  const c = proj(cam, nation.W / 2, nation.H / 2);
  cam.ox = canvas.width / 2 - c.sx;
  cam.oy = canvas.height / 2 - c.sy;
}

function drawGround(t) {
  const { g, W, H } = nation;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = proj(cam, x + .5, y + .5);                  // cull tiles outside the viewport
      if (p.sx < -40 || p.sx > canvas.width + 40 || p.sy < -40 || p.sy > canvas.height + 60) continue;
      const code = g[y][x], alt = (x + y) % 2;
      if (code === WATER) {
        tile(x, y, alt ? '#1d5a72' : '#1a5168');
        if ((x * 7 + y * 11) % 4 === 0) {
          ctx.strokeStyle = `rgba(190,228,238,${Math.max(0, .16 + .13 * Math.sin(t / 650 + x * 1.7 + y))})`;
          ctx.lineWidth = Math.max(1, cam.s);
          ctx.beginPath(); ctx.moveTo(p.sx - 5 * cam.s, p.sy); ctx.lineTo(p.sx + 5 * cam.s, p.sy); ctx.stroke();
        }
      } else if (code === PLAZA) tile(x, y, alt ? PLAZACOL[0] : PLAZACOL[1]);
      else { const b = nation.byBlock[code - 10]; tile(x, y, alt ? b.landA : b.landB); }
    }
}

function drawTree(p, seed) {
  const s = cam.s, base = p.sy + 5 * s;
  ctx.fillStyle = '#6b4226'; ctx.fillRect(p.sx - 1.5 * s, base - 6 * s, 3 * s, 6 * s);
  ctx.fillStyle = '#2e8b4f'; ctx.fillRect(p.sx - 6 * s, base - 15 * s, 12 * s, 10 * s);
  ctx.fillStyle = '#37a35e'; ctx.fillRect(p.sx - 3.5 * s, base - 18 * s, 7 * s, 5 * s);
}

// ---- silhouette: a small seeded skyline on the city's plaza ----
function drawSilhouette(c, t) {
  const seed = hash(c.repo), n = clamp(3 + c.fr, 4, 8), lit = c.age_days < 30, f = c.fr;
  const boxes = [];
  for (let k = 0; k < n; k++) {
    const u = ((seed >> k) % 9) / 9 - .44, v = ((seed >> (k + 4)) % 9) / 9 - .44;
    const bx = c.x + u * f * 1.5, by = c.y + v * f * 1.5;
    boxes.push({ bx, by, k, d: bx + by });
  }
  boxes.sort((a, b) => a.d - b.d);
  for (const { bx, by, k } of boxes) {
    const g = (seed >> (k + 1)) % 7, r = clamp(f * .3, .4, 1.1);
    const hpx = (8 + (g % 4) * 6 + f * 7 * (1 - (g / 7) * .4)) * cam.s;
    const base = [proj(cam, bx - r, by - r), proj(cam, bx + r, by - r),
                  proj(cam, bx + r, by + r), proj(cam, bx - r, by + r)];
    const top = base.map(p => ({ sx: p.sx, sy: p.sy - hpx }));
    quad(base[3], base[2], top[2], top[3], shade(c.color, .55));
    quad(base[2], base[1], top[1], top[2], shade(c.color, .82));
    quad(top[0], top[1], top[2], top[3], shade(c.color, 1.12));
    if (lit) {                                              // recent repos: warm lit windows
      ctx.fillStyle = `rgba(255,214,120,${.55 + .3 * Math.sin(t / 700 + seed + k)})`;
      const mx = (base[2].sx + base[1].sx) / 2;
      ctx.fillRect(mx - cam.s, base[2].sy - hpx * .6, 2 * cam.s, 2.5 * cam.s);
    }
  }
}

function cityLabel(c) {
  if (cam.s < .3) return;
  const p = proj(cam, c.x, c.y + c.fr + .6);
  ctx.fillStyle = 'rgba(20,10,22,.55)';
  ctx.font = `${Math.max(8, Math.min(13, 10 * cam.s))}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  const name = c.repo.length > 20 ? c.repo.slice(0, 19) + '…' : c.repo;
  ctx.fillText(name, p.sx + 1, p.sy + 1);
  ctx.fillStyle = 'rgba(249,239,227,.95)';
  ctx.fillText(name, p.sx, p.sy);
}

function stateLabel(b) {
  const p = proj(cam, b.x0 + b.iw / 2, b.y0 + .2);
  ctx.fillStyle = hexA(b.st.color, 1);
  ctx.font = `bold ${Math.max(10, Math.min(26, 13 * cam.s * 1.4))}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(20,10,22,.5)'; ctx.fillText(b.st.name.toUpperCase(), p.sx + 1.5, p.sy + 1.5);
  ctx.fillStyle = hexA(b.st.color, 1); ctx.fillText(b.st.name.toUpperCase(), p.sx, p.sy);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawRoads(t) {
  ctx.lineWidth = Math.max(1.5, 2.5 * cam.s);
  for (const r of nation.roads) {
    const a = proj(cam, r.a.x, r.a.y), b = proj(cam, r.b.x, r.b.y);
    ctx.setLineDash([5 * cam.s, 5 * cam.s]);
    ctx.strokeStyle = `rgba(212,169,83,${.45 + .2 * Math.sin(t / 900 + a.sx)})`;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ---- bloom: render the full city in place, scaled to its footprint ----
const BLOOM = 2.4, PREFETCH = 2.0;
function subcam(c) {
  const cs = c.cityState, fscale = (2 * c.fr) / Math.max(cs.W, cs.H);
  const P = proj(cam, c.x, c.y), s = cam.s * fscale;
  return { ox: P.sx, oy: P.sy - (cs.W + cs.H) / 2 * HH * s, s, rot: 0, cx: cs.W / 2, cy: cs.H / 2, _bloom: c };
}

function ensureCity(c) {
  if (c.cityState || c.fetching) return;
  c.fetching = true;
  fetch(`city-data.json?repo=${encodeURIComponent(c.repo)}`)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { c.cityState = City.layout(d); })
    .catch(() => { c.fetching = false; });
}

function frame(t) {
  if (tween) {
    for (const k of ['ox', 'oy', 's']) cam[k] += (tween[k] - cam[k]) * .16;
    if (Math.abs(tween.s - cam.s) < tween.s * .01) tween = null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGround(t);
  drawRoads(t);
  const items = [...nation.props, ...nation.cities]
    .sort((a, b) => proj(cam, a.x, a.y).sy - proj(cam, b.x, b.y).sy);
  for (const it of items) {
    if (it.tree) { drawTree(proj(cam, it.x, it.y), it.seed); continue; }
    const c = it, zoom = c.fr * cam.s;
    c._scr = proj(cam, c.x, c.y); c._rpx = c.fr * cam.s * HW;
    if (zoom > PREFETCH) ensureCity(c);
    if (zoom > BLOOM && c.cityState) {
      c._sub = subcam(c);
      City.draw(ctx, c._sub, c.cityState, t, { embedded: true });
    } else { c._sub = null; drawSilhouette(c, t); }
    cityLabel(c);
  }
  for (const b of nation.blocks) stateLabel(b);
  requestAnimationFrame(frame);
}

async function init() {
  nation = layoutNation(await (await fetch('nation-data.json')).json());
  fit();
  requestAnimationFrame(frame);
}

// ---- camera controls (mirrors the city explorer) ----
function zoom(k, mx = canvas.width / 2, my = canvas.height / 2) {
  cam.ox = mx + (cam.ox - mx) * k; cam.oy = my + (cam.oy - my) * k; cam.s *= k; tween = null;
}
function rotate(dir) { cam.rot = ((cam.rot || 0) + (dir > 0 ? 1 : 7)) % 8; }
function flyTo(c) {
  const s = (BLOOM + 1.4) / c.fr;
  const p = proj({ ...cam, ox: 0, oy: 0, s }, c.x, c.y);
  tween = { ox: canvas.width / 2 - p.sx, oy: canvas.height / 2 - p.sy, s };
}

const CTL = { 'rot-': () => rotate(-1), 'rot+': () => rotate(1),
              'zoom+': () => zoom(1.18), 'zoom-': () => zoom(1 / 1.18),
              'reset': () => { cam.rot = 0; tween = null; fit(); } };
document.getElementById('mapctl').addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (act && nation) CTL[act]();
});
window.addEventListener('keydown', e => { if (e.key === 'q' || e.key === 'e') rotate(e.key === 'q' ? 1 : -1); });

let drag = null, moved = false;
canvas.addEventListener('mousedown', m => { drag = { x: m.clientX, y: m.clientY }; moved = false; });
window.addEventListener('mouseup', () => drag = null);
canvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoom(m.deltaY < 0 ? 1.12 : 1 / 1.12, (m.clientX - r.left) * (canvas.width / r.width),
       (m.clientY - r.top) * (canvas.height / r.height));
}, { passive: false });

canvas.addEventListener('click', m => {
  if (moved || !nation) return;
  const r = canvas.getBoundingClientRect();
  const c = pickCity((m.clientX - r.left) * (canvas.width / r.width), (m.clientY - r.top) * (canvas.height / r.height));
  if (c && !c._sub) flyTo(c);
});

function pickCity(mx, my) {
  let best = null, bd = Infinity;
  for (const c of nation.cities) {
    if (!c._scr) continue;
    const d = Math.hypot(mx - c._scr.sx, my - (c._scr.sy - c._rpx * .5));
    if (d < c._rpx * 1.4 && d < bd) { bd = d; best = c; }
  }
  return best;
}

canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width / r.width, ky = canvas.height / r.height;
  const mx = (m.clientX - r.left) * kx, my = (m.clientY - r.top) * ky;
  if (drag) {
    moved = true;
    cam.ox += (m.clientX - drag.x) * kx; cam.oy += (m.clientY - drag.y) * ky;
    drag = { x: m.clientX, y: m.clientY }; tween = null;
    return;
  }
  const c = nation && pickCity(mx, my);
  let text = null;
  if (c && c._sub) {
    const b = City.pick(c.cityState, mx, my);
    text = b ? `${c.repo} › ${b.path} · ${b.floors} fl · ${b.loc} loc` : null;
  }
  if (!text && c)
    text = `${c.repo} · ${stateName(c.state)} · ${c.files} files · ${c.commits} commits · ${c.age_days}d · ${c.lang || '—'}`;
  if (text) {
    tooltip.textContent = text;
    tooltip.style.left = `${m.clientX + 14}px`; tooltip.style.top = `${m.clientY + 14}px`;
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});

function stateName(id) { return (nation.blocks.find(b => b.st.id === id) || { st: {} }).st.name || id; }

init();
