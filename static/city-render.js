// Botapest City lib — layout from zoning + git seed, iso drawing, live growth.
// Everything is scoped; pages talk to the `City` object only.
const City = (() => {
  const HW = 26, HH = 13, FLOOR = 14;
  const proj = (cam, x, y) => ({ sx: cam.ox + (x - y) * HW * cam.s, sy: cam.oy + (x + y) * HH * cam.s });
  const lift = (p, h) => ({ sx: p.sx, sy: p.sy - h });
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(Math.min(255, v * f));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function quad(ctx, a, b, c, d, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();
  }

  function layout(data) {
    const byComp = {};
    for (const b of data.buildings) (byComp[b.component] ??= []).push(b);
    let bandY = 0;
    const bands = [];
    for (const layer of data.zone.layers) {
      const band = { blocks: [], width: 0 };
      let bx = 0, maxRows = 0;
      for (const comp of data.zone.components.filter(c => c.layer === layer)) {
        const list = byComp[comp.id] || [];
        const cols = list.length ? Math.max(2, Math.round(Math.sqrt(list.length * 2.4))) : 4;
        const rows = list.length ? Math.ceil(list.length / cols) : 3;
        band.blocks.push({ comp, list, x0: bx, y0: bandY, cols, rows, next: list.length });
        bx += cols + 2;
        maxRows = Math.max(maxRows, rows);
      }
      band.width = bx - 2;
      bandY += maxRows + 2.5;
      bands.push(band);
    }
    const w = Math.max(...bands.map(b => b.width));
    for (const band of bands)
      for (const block of band.blocks) block.x0 += (w - band.width) / 2;

    const state = { zone: data.zone, blocks: bands.flatMap(b => b.blocks),
                    buildings: [], byPath: new Map(), clouds: [], cityHall: null, w, h: bandY };
    for (const block of state.blocks) {
      block.list.forEach((b, i) => place(state, block, b, i));
      if (block.comp.kind === 'civic')
        state.cityHall = { x: block.x0 + block.cols / 2, y: block.y0 + block.rows / 2 };
    }
    state.buildings.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    state.clouds = data.zone.clouds.map((c, i) => ({ name: c.name, tether: c.tether, band: 60 + (i % 2) * 52 }));
    return state;
  }

  function place(state, block, b, i) {
    const under = block.comp.layer === 'under';
    b.x = block.x0 + (i % block.cols) + .5;
    b.y = block.y0 + Math.floor(i / block.cols) + .5;
    b.color = block.comp.color;
    b.floors ??= under ? 1 : 1 + b.centrality + (b.commits >= 12 ? 1 : 0);
    b.heightScale = under ? .35 : 1;
    b.foot = .55 + .38 * Math.min(1, Math.log10(b.loc + 1) / 4);
    b.lit ??= Math.max(0, 1 - b.age_days / 240);
    state.buildings.push(b);
    state.byPath.set(b.path, b);
  }

  const matches = (path, g) =>
    g.startsWith('*') ? path.endsWith(g.slice(1)) : g.includes('*') ? path.startsWith(g.split('*')[0]) : path === g;

  function addBuilding(state, path) {
    const comp = state.zone.components.find(c => c.globs.some(g => matches(path, g)));
    const block = state.blocks.find(bl => bl.comp === comp);
    if (!block) return null;
    const b = { path, component: comp.id, loc: 30, commits: 0, centrality: 0, age_days: 0,
                files: 1, floors: 1, lit: 1, born: performance.now() };
    place(state, block, b, block.next++);
    block.rows = Math.max(block.rows, Math.ceil(block.next / block.cols));
    state.buildings.sort((x, y) => (x.x + x.y) - (y.x + y.y));
    return b;
  }

  function applyEvent(state, e) {
    if (e.commit) {
      for (const b of state.buildings)
        if (b.scaffold) { b.scaffold = false; b.floors = Math.min(b.floors + 1, 14); b.flash = performance.now(); }
      return;
    }
    if (!e.path) return;
    let b = state.byPath.get(e.path);
    if (!b && ['Edit', 'Write', 'NotebookEdit'].includes(e.tool)) b = addBuilding(state, e.path);
    if (!b) return;
    b.lit = 1;
    if (['Edit', 'Write', 'NotebookEdit'].includes(e.tool)) b.scaffold = true;
  }

  function fit(cam, canvas, state, reserve = 210, bias = 55) {
    cam.s = Math.min((canvas.width - 40) / ((state.w + state.h) * HW),
                     (canvas.height - reserve) / ((state.w + state.h) * HH));
    cam.ox = 0; cam.oy = 0;
    const center = proj(cam, state.w / 2, state.h / 2);
    cam.ox = canvas.width / 2 - center.sx;
    cam.oy = canvas.height / 2 + bias - center.sy;
  }

  function drawBuilding(ctx, cam, b, t) {
    const pop = b.born ? Math.min(1, (t - b.born) / 600) : 1;
    const f = b.foot * pop / 2;
    const base = [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                  proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)];
    const h = b.floors * FLOOR * b.heightScale * pop * cam.s;
    const top = base.map(p => lift(p, h));
    quad(ctx, base[3], base[2], top[2], top[3], shade(b.color, .55));
    quad(ctx, base[2], base[1], top[1], top[2], shade(b.color, .75));
    quad(ctx, top[0], top[1], top[2], top[3], shade(b.color, 1.05));
    if (h > 14 * cam.s) drawWindows(ctx, cam, base, h, b, t);
    if (b.scaffold) drawScaffold(ctx, cam, base, h);
    if (b.flash && t - b.flash < 1500) drawFlash(ctx, cam, top, (t - b.flash) / 1500);
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

  function drawScaffold(ctx, cam, base, h) {
    ctx.strokeStyle = '#c98f4a';
    ctx.lineWidth = Math.max(1, 1.5 * cam.s);
    const up = h + 7 * cam.s;
    ctx.beginPath();
    for (const p of base) { ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy - up); }
    const tops = base.map(p => lift(p, up));
    ctx.moveTo(tops[0].sx, tops[0].sy);
    for (const p of [...tops.slice(1), tops[0]]) ctx.lineTo(p.sx, p.sy);
    ctx.stroke();
  }

  function drawFlash(ctx, cam, top, k) {
    const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#ffd678';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, (12 + 36 * k) * cam.s, (6 + 18 * k) * cam.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCityHall(ctx, cam, x, y) {
    const c = proj(cam, x, y), s = cam.s;
    const w = 64 * s, h = 54 * s, base = c.sy + 14 * s;
    ctx.fillStyle = '#b08c3e';
    ctx.fillRect(c.sx - w / 2 - 8 * s, base - 6 * s, w + 16 * s, 8 * s);
    ctx.fillStyle = '#d4a953';
    ctx.fillRect(c.sx - w / 2, base - h, w, h - 6 * s);
    ctx.fillStyle = '#f9efe3';
    for (let i = 0; i < 5; i++)
      ctx.fillRect(c.sx - w / 2 + (4 + i * 13) * s, base - h + 14 * s, 5 * s, h - 24 * s);
    ctx.fillStyle = '#b08c3e';
    ctx.beginPath();
    ctx.moveTo(c.sx - w / 2 - 6 * s, base - h + 14 * s);
    ctx.lineTo(c.sx, base - h - 16 * s);
    ctx.lineTo(c.sx + w / 2 + 6 * s, base - h + 14 * s);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a2c4d'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#c0395b';
    ctx.fillRect(c.sx - 1.5 * s, base - h - 34 * s, 3 * s, 20 * s);
    ctx.fillRect(c.sx + 1.5 * s, base - h - 34 * s, 12 * s, 7 * s);
  }

  function drawCloud(ctx, cam, cloud, t) {
    const bob = Math.sin(t / 2400 + hash(cloud.name)) * 6 * cam.s;
    const x = cloud.sx + bob, sy = cloud.sy, s = cam.s;
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

  function draw(ctx, cam, state, t) {
    for (const b of state.buildings) drawBuilding(ctx, cam, b, t);
    if (state.cityHall) drawCityHall(ctx, cam, state.cityHall.x, state.cityHall.y);
    ctx.fillStyle = 'rgba(243,207,217,.75)';
    for (const block of state.blocks) {
      const p = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows + .6);
      ctx.font = `${Math.max(7, 9 * cam.s)}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(block.comp.name.toUpperCase(), p.sx, p.sy);
    }
    for (const c of state.clouds) {
      const block = state.blocks.find(bl => bl.comp.id === c.tether);
      const a = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows / 2);
      c.sx = a.sx; c.ax = a.sx; c.ay = a.sy;
      c.sy = Math.min(c.band * Math.max(.8, cam.s), a.sy - 120 * cam.s);
      drawCloud(ctx, cam, c, t);
    }
  }

  function pick(state, mx, my) {
    let hit = null;
    for (const b of state.buildings)
      if (b.screen && mx > b.screen.x0 && mx < b.screen.x1 && my > b.screen.y0 && my < b.screen.y1)
        hit = b;
    return hit;
  }

  return { layout, fit, draw, applyEvent, pick, proj };
})();
