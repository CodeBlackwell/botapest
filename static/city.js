// Layout city blocks from zoning + git seed, drive camera and tooltip.
const canvas = document.getElementById('city');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const cam = { ox: 0, oy: 0, s: 1 };
let blocks = [], buildings = [], clouds = [], cityHall = null;

async function init() {
  const data = await (await fetch('city-data.json')).json();
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
      band.blocks.push({ comp, list, x0: bx, y0: bandY, cols, rows });
      bx += cols + 2;
      maxRows = Math.max(maxRows, rows);
    }
    band.width = bx - 2;
    bandY += maxRows + 2.5;
    bands.push(band);
  }
  const cityW = Math.max(...bands.map(b => b.width));
  for (const band of bands)                                  // center each band
    for (const block of band.blocks) block.x0 += (cityW - band.width) / 2;
  blocks = bands.flatMap(b => b.blocks);

  for (const block of blocks) {
    const under = block.comp.layer === 'under';
    block.list.forEach((b, i) => {
      b.x = block.x0 + (i % block.cols) + .5;
      b.y = block.y0 + Math.floor(i / block.cols) + .5;
      b.color = block.comp.color;
      b.floors = under ? 1 : 1 + b.centrality + (b.commits >= 12 ? 1 : 0);
      b.heightScale = under ? .35 : 1;
      b.foot = .55 + .38 * Math.min(1, Math.log10(b.loc + 1) / 4);
      b.lit = Math.max(0, 1 - b.age_days / 240);
      buildings.push(b);
    });
    if (block.comp.kind === 'civic')
      cityHall = { x: block.x0 + block.cols / 2, y: block.y0 + block.rows / 2 };
  }
  buildings.sort((a, b) => (a.x + a.y) - (b.x + b.y));

  fitCamera(cityW, bandY);
  clouds = data.zone.clouds.map((c, i) => ({ name: c.name, tether: c.tether, band: 60 + (i % 2) * 52 }));
  requestAnimationFrame(frame);
}

function fitCamera(w, h) {
  cam.s = Math.min((canvas.width - 40) / ((w + h) * HW), (canvas.height - 210) / ((w + h) * HH));
  const center = proj(cam, w / 2, h / 2);
  cam.ox += canvas.width / 2 - center.sx;
  cam.oy += canvas.height / 2 + 55 - center.sy;     // leave sky room for clouds
}

function frame(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const b of buildings) drawBuilding(ctx, cam, b, t);
  if (cityHall) drawCityHall(ctx, cam, cityHall.x, cityHall.y);
  for (const block of blocks) drawLabel(ctx, cam, block);
  for (const c of clouds) {
    const block = blocks.find(bl => bl.comp.id === c.tether);
    const a = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows / 2);
    c.sx = a.sx; c.ax = a.sx; c.ay = a.sy;
    c.sy = Math.min(c.band * Math.max(.8, cam.s), a.sy - 120 * cam.s);
    drawCloud(ctx, cam, c, t);
  }
  requestAnimationFrame(frame);
}

let drag = null;
canvas.addEventListener('mousedown', m => drag = { x: m.clientX, y: m.clientY });
window.addEventListener('mouseup', () => drag = null);
canvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = canvas.getBoundingClientRect();
  const mx = (m.clientX - r.left) * (canvas.width / r.width);
  const my = (m.clientY - r.top) * (canvas.height / r.height);
  const k = m.deltaY < 0 ? 1.12 : 1 / 1.12;
  cam.ox = mx + (cam.ox - mx) * k;
  cam.oy = my + (cam.oy - my) * k;
  cam.s *= k;
}, { passive: false });

canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width / r.width, ky = canvas.height / r.height;
  if (drag) {
    cam.ox += (m.clientX - drag.x) * kx;
    cam.oy += (m.clientY - drag.y) * ky;
    drag = { x: m.clientX, y: m.clientY };
    return;
  }
  const mx = (m.clientX - r.left) * kx, my = (m.clientY - r.top) * ky;
  let hit = null;
  for (const b of buildings)
    if (b.screen && mx > b.screen.x0 && mx < b.screen.x1 && my > b.screen.y0 && my < b.screen.y1)
      hit = b;
  if (hit) {
    const files = hit.files > 1 ? ` · ${hit.files} files` : '';
    tooltip.textContent = `${hit.path}${files} · ${hit.floors} fl · ${hit.loc} loc · `
      + `${hit.commits} commits · touched ${hit.age_days}d ago`;
    tooltip.style.left = `${m.clientX + 14}px`;
    tooltip.style.top = `${m.clientY + 14}px`;
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});

init();
