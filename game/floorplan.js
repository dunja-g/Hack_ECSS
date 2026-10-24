// Floor-plan mode: read walls straight from the drawing's pixels, find the rooms,
// and give ghosts a grid to path-find through doors. No AI here: it is exact and
// takes well under a second. Gemma only names the rooms (see server/prompt_floorplan.txt).

export const FREE = 0, WALL = 1, OUTSIDE = 2;

// Sum over a sliding window along rows or columns, used for fast erosion and dilation.
function windowSum(src, w, h, r, horizontal) {
  const out = new Uint16Array(w * h);
  const lines = horizontal ? h : w, len = horizontal ? w : h;
  const at = horizontal ? (l, i) => l * w + i : (l, i) => i * w + l;
  for (let l = 0; l < lines; l++) {
    let s = 0;
    for (let i = 0; i < Math.min(r, len); i++) s += src[at(l, i)];
    for (let i = 0; i < len; i++) {
      if (i + r < len) s += src[at(l, i + r)];
      if (i - r - 1 >= 0) s -= src[at(l, i - r - 1)];
      out[at(l, i)] = s;
    }
  }
  return out;
}
// Square erosion (all pixels in the window set) or dilation (any pixel set).
function morph(mask, w, h, r, erode) {
  const full = (2 * r + 1);
  const a = windowSum(mask, w, h, r, true);
  const b = new Uint8Array(w * h);
  for (let i = 0; i < b.length; i++) b[i] = erode ? (a[i] === full ? 1 : 0) : (a[i] > 0 ? 1 : 0);
  const c = windowSum(b, w, h, r, false);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = erode ? (c[i] === full ? 1 : 0) : (c[i] > 0 ? 1 : 0);
  return out;
}
// 4-neighbour flood fill; returns how many cells it labelled.
function flood(grid, cols, rows, start, pass, label, labels) {
  const stack = [start]; labels[start] = label; let n = 0;
  while (stack.length) {
    const i = stack.pop(); n++;
    const x = i % cols, y = (i / cols) | 0;
    const near = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1];
    for (const j of near) if (j >= 0 && labels[j] === -1 && pass(grid[j])) { labels[j] = label; stack.push(j); }
  }
  return n;
}

// Solid coloured blocks: colours are binned, the floor (the most common colour inside the drawing) and
// the white background are skipped, and each large, mostly rectangular patch of one colour is a block.
function findZones(px, w, h) {
  const bin = (i) => ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4);
  const isBackground = (i) => px[i * 4] > 232 && px[i * 4 + 1] > 232 && px[i * 4 + 2] > 232;
  const isInk = (i) => { // black or grey linework and text: never a block
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], sat = Math.max(r, g, b) - Math.min(r, g, b);
    return sat < 24 && (r + g + b) / 3 < 200;
  };
  const counts = new Map();
  for (let i = 0; i < w * h; i += 3) if (!isBackground(i) && !isInk(i)) { const k = bin(i); counts.set(k, (counts.get(k) || 0) + 1); }
  let floor = -1, best = 0;
  for (const [k, n] of counts) if (n > best) { best = n; floor = k; }
  const near = (a, b) => Math.abs((a >> 8) - (b >> 8)) <= 1 && Math.abs(((a >> 4) & 15) - ((b >> 4) & 15)) <= 1 && Math.abs((a & 15) - (b & 15)) <= 1;
  const seen = new Uint8Array(w * h), zones = [], minArea = w * h * 0.0018;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || isBackground(start) || isInk(start)) continue;
    const key = bin(start);
    if (near(key, floor)) { seen[start] = 1; continue; }
    const stack = [start], members = []; seen[start] = 1;
    let x0 = w, x1 = 0, y0 = h, y1 = 0, rs = 0, gs = 0, bs = 0;
    while (stack.length) {
      const i = stack.pop(); members.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      rs += px[i * 4]; gs += px[i * 4 + 1]; bs += px[i * 4 + 2];
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !seen[j] && near(bin(j), key)) { seen[j] = 1; stack.push(j); }
      }
    }
    const n = members.length, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // big enough, solid enough (lettering and stair drawings leave holes), and not a thin line
    if (n < minArea || n / (bw * bh) < 0.25 || Math.min(bw, bh) < 10) continue; // the real cells are kept, so an L-shape is fine
    const r = rs / n, g = gs / n, b = bs / n;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    if (lum > 0.92 || n > w * h * 0.25) continue; // paper, page margins, or the whole floor
    if (lum > 0.76 && sat < 0.45) continue;        // a pale pastel fill colours a ROOM, not a piece of furniture
    zones.push({ x0, y0, x1, y1, area: n, members, color: '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''),
      lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255 });
  }
  return zones;
}

// Turn a floor-plan image into a wall grid and a list of rooms.
export function analysePlan(img, { maxSide = 1600, cellPx = 4, sealFrac = 0.022, darkness = 0.72, minThick = 3.5, stroke = 1 } = {}) {
  const k = Math.min(2, maxSide / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;

  // 0. coloured blocks: wayfinding maps paint shelving, workstations, study rooms and stairs as solid
  //    blocks of colour on a floor colour. Find them first, so they become furniture, not walls.
  const zones = findZones(px, w, h);
  // the blocks' own pixels plus a 2 px rim (their outlines); never their whole bounding box, which could
  // reach across a real wall
  let inZone = new Uint8Array(w * h);
  for (const z of zones) for (const i of z.members) inZone[i] = 1;
  inZone = morph(inZone, w, h, 2, false);

  // 1. dark pixels: walls, but also text, dimension lines and furniture outlines
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < dark.length; i++) {
    if (inZone[i]) continue; // a block's own outline and lettering are not walls
    const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255, sat = Math.max(r, gg, b) - Math.min(r, gg, b);
    dark[i] = lum < darkness && sat < 90 ? 1 : 0; // grey/black only: coloured arrows and fills are not walls
  }
  // 2. walls are the thick strokes: an opening (erode then dilate) wipes out hairlines,
  //    then small separate blobs (letters, numbers, symbols) are dropped by size
  const r = Math.max(1, Math.round(stroke * Math.max(w, h) / 1600));
  const raw = morph(morph(dark, w, h, r, true), w, h, r, false);
  const dropBlobs = (walls) => {
    const blob = new Int32Array(w * h).fill(-1), minSpan = Math.max(w, h) * 0.02;
    for (let i = 0; i < walls.length; i++) {
      if (!walls[i] || blob[i] !== -1) continue;
      const stack = [i], members = [i]; blob[i] = 1;
      let x0 = w, x1 = 0, y0 = h, y1 = 0;
      while (stack.length) {
        const j = stack.pop(), x = j % w, y = (j / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
          if (n >= 0 && walls[n] && blob[n] === -1) { blob[n] = 1; stack.push(n); members.push(n); }
        }
      }
      // too small (text, symbols) or too thin on average (dimension lines): not a wall
      const span = Math.max(x1 - x0, y1 - y0) + 1, across = Math.min(x1 - x0, y1 - y0) + 1;
      const dash = span / across > 6 && span < Math.max(w, h) * 0.05; // a lone short straight piece: one dash of a gridline
      if (dash || span < minSpan || members.length / span < minThick * (Math.max(w, h) / 1600)) for (const j of members) walls[j] = 0;
    }
    return walls;
  };
  // 3. coarse grid: a cell is wall if enough of it is wall
  const cols = Math.ceil(w / cellPx), rows = Math.ceil(h / cellPx);
  const toGrid = (walls) => {
    const grid = new Uint8Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let s = 0, n = 0;
      for (let y = cy * cellPx; y < Math.min(h, (cy + 1) * cellPx); y++) for (let x = cx * cellPx; x < Math.min(w, (cx + 1) * cellPx); x++) { s += walls[y * w + x]; n++; }
      grid[cy * cols + cx] = s / n > 0.12 ? WALL : FREE;
    }
    return grid;
  };
  const sealedWalls = dropBlobs(raw.slice());
  const outerGrid = toGrid(sealedWalls);

  // 4. outside: flood in from the border, with door-sized gaps sealed so we do not leak into the building.
  //    Done before gridline cleanup: glazed facades are drawn as broken lines that look like dashes.
  const seal = Math.max(2, Math.round(Math.max(cols, rows) * sealFrac));
  const sealed = morph(outerGrid.map((v) => (v === WALL ? 1 : 0)), cols, rows, seal, false);
  const out = new Int32Array(cols * rows).fill(-1);
  for (let x = 0; x < cols; x++) for (const y of [0, rows - 1]) { const i = y * cols + x; if (out[i] === -1 && !sealed[i]) flood(sealed, cols, rows, i, (v) => !v, 0, out); }
  for (let y = 0; y < rows; y++) for (const x of [0, cols - 1]) { const i = y * cols + x; if (out[i] === -1 && !sealed[i]) flood(sealed, cols, rows, i, (v) => !v, 0, out); }
  let outside = 0; for (let i = 0; i < out.length; i++) if (out[i] === 0) outside++;
  // a cropped plan (building runs off the edge) lets the flood pour inside; then skip it
  const leaked = outside > out.length * 0.6;
  if (!leaked) {
    // grow the outside back up to the real walls (it stopped short by the seal width)
    for (let pass = 0; pass < seal + 1; pass++) {
      const grow = [];
      for (let i = 0; i < out.length; i++) if (out[i] !== 0 && outerGrid[i] === FREE) {
        const x = i % cols, y = (i / cols) | 0;
        if ((x > 0 && out[i - 1] === 0) || (x < cols - 1 && out[i + 1] === 0) || (y > 0 && out[i - cols] === 0) || (y < rows - 1 && out[i + cols] === 0)) grow.push(i);
      }
      for (const i of grow) out[i] = 0;
    }
  }
  // the building's shell (outside and a few cells in) is kept exactly as drawn
  const shell = leaked ? new Uint8Array(cols * rows) : morph(out.map((v) => (v === 0 ? 1 : 0)), cols, rows, 3, false);

  // dash-dot gridlines inside the building: a row (or column) of many short dashes. Real walls are long runs.
  const walls = raw.slice();
  const clearDashed = (lines, len, at) => {
    const flagged = [];
    for (let l = 0; l < lines; l++) {
      // count dash-like runs: long along the line (not a wall's cross-section) but far shorter than a wall
      let dashPx = 0, dashes = 0, longest = 0, run = 0;
      for (let i = 0; i <= len; i++) {
        const v = i < len ? walls[at(l, i)] : 0;
        if (v) run++;
        else if (run) { if (run >= 12 && run < len * 0.06) { dashes++; dashPx += run; } longest = Math.max(longest, run); run = 0; }
      }
      if (dashes >= 5 && dashPx > len * 0.1 && longest < len * 0.25) flagged.push(l);
    }
    // erase only the dash-length pieces on those lines; walls crossing them (short cross-sections) and long walls stay
    for (const l of flagged) for (let d = -3; d <= 3; d++) {
      const ln = l + d; if (ln < 0 || ln >= lines) continue;
      for (let i = 0, start = -1; i <= len; i++) {
        const v = i < len ? walls[at(ln, i)] : 0;
        if (v && start < 0) start = i;
        else if (!v && start >= 0) {
          const run = i - start;
          if (run >= 8 && run < len * 0.06) for (let k = start; k < i; k++) {
            const p = at(ln, k), cx = Math.floor((p % w) / cellPx), cy = Math.floor(((p / w) | 0) / cellPx);
            if (!shell[cy * cols + cx]) walls[p] = 0;
          }
          start = -1;
        }
      }
    }
  };
  clearDashed(h, w, (y, x) => y * w + x);
  clearDashed(w, h, (x, y) => y * w + x);
  dropBlobs(walls);
  const grid = toGrid(walls);
  if (!leaked) for (let i = 0; i < grid.length; i++) if (out[i] === 0 && grid[i] === FREE) grid[i] = OUTSIDE;

  // 5. rooms: floor areas split apart where doorways are sealed
  const roomSeal = Math.max(2, Math.round(seal * 0.75));
  const closed = morph(grid.map((v) => (v === FREE ? 0 : 1)), cols, rows, roomSeal, false);
  const roomOf = new Int32Array(cols * rows).fill(-1);
  const rooms = [];
  const minCells = cols * rows * 0.002;
  for (let i = 0; i < closed.length; i++) {
    if (closed[i] || roomOf[i] !== -1) continue;
    const id = rooms.length, n = flood(closed, cols, rows, i, (v) => !v, id, roomOf);
    rooms.push({ id, cells: n });
  }
  for (const room of rooms) Object.assign(room, { x0: cols, y0: rows, x1: 0, y1: 0, sx: 0, sy: 0 });
  for (let i = 0; i < roomOf.length; i++) {
    const id = roomOf[i]; if (id < 0) continue;
    const rm = rooms[id], x = i % cols, y = (i / cols) | 0;
    rm.x0 = Math.min(rm.x0, x); rm.y0 = Math.min(rm.y0, y); rm.x1 = Math.max(rm.x1, x); rm.y1 = Math.max(rm.y1, y); rm.sx += x; rm.sy += y;
  }
  const kept = rooms.filter((rm) => rm.cells >= minCells);
  const remap = new Map(kept.map((rm, j) => [rm.id, j]));
  for (let i = 0; i < roomOf.length; i++) roomOf[i] = roomOf[i] >= 0 && remap.has(roomOf[i]) ? remap.get(roomOf[i]) : -1;
  kept.forEach((rm, j) => { rm.id = j; rm.cx = rm.sx / rm.cells; rm.cy = rm.sy / rm.cells; });

  // typical wall thickness in pixels, a fallback for the drawing's scale
  let runs = [];
  for (let y = 0; y < h; y += 7) { let run = 0; for (let x = 0; x < w; x++) { if (walls[y * w + x]) run++; else { if (run >= 2 && run < 40) runs.push(run); run = 0; } } }
  runs.sort((a, b) => a - b);
  const wallPx = runs.length ? runs[(runs.length / 2) | 0] : 6;

  // each block keeps the grid cells it really covers (an L-shaped run of shelving is not its bounding box),
  // and blocks outside the building (a page header, the legend) are dropped
  for (const z of zones) {
    const per = new Map();
    for (const i of z.members) { const c = Math.floor(((i / w) | 0) / cellPx) * cols + Math.floor((i % w) / cellPx); per.set(c, (per.get(c) || 0) + 1); }
    z.cells = [...per].filter(([, n]) => n >= cellPx * cellPx * 0.35).map(([c]) => c);
    z.mx = z.cells.reduce((s, c) => s + (c % cols), 0) / (z.cells.length || 1);         // centre of the real cells
    z.my = z.cells.reduce((s, c) => s + ((c / cols) | 0), 0) / (z.cells.length || 1);
    delete z.members;
    Object.assign(z, { cx0: Math.floor(z.x0 / cellPx), cy0: Math.floor(z.y0 / cellPx), cx1: Math.floor(z.x1 / cellPx), cy1: Math.floor(z.y1 / cellPx) });
  }
  const insideZones = zones.filter((z) => {
    const c = Math.round(z.my) * cols + Math.round(z.mx);
    return z.cells.length && grid[c] !== OUTSIDE;
  });
  zones.length = 0; zones.push(...insideZones);
  return { cols, rows, cellPx, imgW: w, imgH: h, grid, roomOf, rooms: kept, leaked, wallPx, canvas, zones };
}

// Set-of-mark prompting: a numbered red badge on every coloured block, so Gemma only has to read
// "badge 3 sits on the block labelled Periodicals" instead of guessing coordinates.
export function annotatePlan(img, plan, maxSide = 1280) {
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  const sx = c.width / plan.imgW, sy = c.height / plan.imgH, r = Math.max(9, Math.round(c.width / 90));
  plan.zones.forEach((z, i) => {
    // inside the block's top-left corner, clear of the label that usually sits in its middle
    const x = (z.x0 + Math.min(z.x1 - z.x0, 6 * r) * 0.3) * sx + r, y = (z.y0 + Math.min(z.y1 - z.y0, 6 * r) * 0.3) * sy + r;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#e0001b'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(r * 1.25)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), x, y + 1);
  });
  return c.toDataURL('image/jpeg', 0.9);
}

// Quick picture of what was detected, for the upload card: walls black, rooms tinted.
export function planPreview(plan) {
  const c = document.createElement('canvas'); c.width = plan.cols; c.height = plan.rows;
  const g = c.getContext('2d'), img = g.createImageData(plan.cols, plan.rows);
  const hue = (id) => [80 + (id * 67) % 150, 120 + (id * 97) % 120, 140 + (id * 41) % 110];
  for (let i = 0; i < plan.grid.length; i++) {
    const v = plan.grid[i], id = plan.roomOf[i];
    const [r, gg, b] = v === WALL ? [20, 20, 24] : v === OUTSIDE ? [235, 235, 235] : id >= 0 ? hue(id) : [200, 200, 200];
    img.data.set([r, gg, b, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  // coloured blocks found on the plan, outlined in their own colour
  g.lineWidth = 1;
  for (const z of plan.zones || []) { g.fillStyle = z.color + 'cc'; g.fillRect(z.cx0, z.cy0, z.cx1 - z.cx0 + 1, z.cy1 - z.cy0 + 1); }
  return c;
}

// ------------------------------------------------------------------ pathfinding
// A* over a coarser walk grid. A cell is walkable only if nothing solid is within a ghost's radius.
export function makeNav(plan, cellM, radiusM = 0.35) {
  const step = Math.max(1, Math.round(0.3 / cellM)); // ~30 cm nav cells
  const cols = Math.ceil(plan.cols / step), rows = Math.ceil(plan.rows / step);
  const pad = Math.ceil(radiusM / cellM);
  const blocked = new Uint8Array(cols * rows);
  for (let ny = 0; ny < rows; ny++) for (let nx = 0; nx < cols; nx++) {
    const cx = nx * step + (step >> 1), cy = ny * step + (step >> 1);
    let bad = false;
    for (let y = cy - pad; y <= cy + pad && !bad; y++) for (let x = cx - pad; x <= cx + pad; x++) {
      if (x < 0 || y < 0 || x >= plan.cols || y >= plan.rows || plan.grid[y * plan.cols + x] !== FREE) { bad = true; break; }
    }
    blocked[ny * cols + nx] = bad ? 1 : 0;
  }
  return { cols, rows, step, blocked };
}

export function findPath(nav, from, to) {
  const { cols, rows, blocked } = nav;
  const idx = (x, y) => y * cols + x;
  const near = (p) => { // snap to the closest walkable cell
    if (!blocked[idx(p[0], p[1])]) return p;
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = p[0] + dx, y = p[1] + dy;
      if (x >= 0 && y >= 0 && x < cols && y < rows && !blocked[idx(x, y)]) return [x, y];
    }
    return null;
  };
  const a = near(from), b = near(to);
  if (!a || !b) return null;
  const start = idx(a[0], a[1]), goal = idx(b[0], b[1]);
  const gScore = new Float32Array(cols * rows).fill(Infinity), came = new Int32Array(cols * rows).fill(-1);
  const heap = [[0, start]]; gScore[start] = 0;
  const h = (i) => { const dx = Math.abs((i % cols) - b[0]), dy = Math.abs(((i / cols) | 0) - b[1]); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let steps = 0;
  while (heap.length && steps++ < 40000) {
    const [, cur] = pop();
    if (cur === goal) break;
    const x = cur % cols, y = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = idx(nx, ny);
      if (blocked[j] || (dx && dy && (blocked[idx(x + dx, y)] || blocked[idx(x, y + dy)]))) continue; // no corner cutting
      const ng = gScore[cur] + (dx && dy ? 1.414 : 1);
      if (ng < gScore[j]) { gScore[j] = ng; came[j] = cur; push([ng + h(j), j]); }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path = [];
  for (let c = goal; c !== -1 && c !== start; c = came[c]) path.push([c % cols, (c / cols) | 0]);
  return path.reverse();
}

// ------------------------------------------------------------------ plan -> level
// Room kinds Gemma can name, and how each is furnished.
// What a label means. Checked in order, most specific first ("Group Study Room" is a room, "Group Study
// Area" is open floor with desks, "P - PM" is a run of shelving by call number).
const KIND_RULES = [
  ['core', /stair|lift|elevator|toilet|\bwc\b|restroom|washroom|riser|plant room|electric|cleaner/],
  ['study_room', /study.?room|group.?room|seminar|pod\b|booth/],
  ['shelves', /shel|stack|periodical|journal|book|microf|atlas|reference|collection|pamphlet|archive|librar|report/],
  ['workstations', /workstation|computer|\bpcs?\b|\bit\b|terminal|print/],
  ['desks', /study area|open study|reading area|silent study/],
  ['meeting', /meeting|group|conference|board/],
  ['desks', /study|quiet|office|classroom|\blab\b|reading|silent|desk/],
  ['cafe', /caf|coffee|kitchen|canteen|dining|social|refectory/],
  ['lounge', /lobby|foyer|reception|lounge|entrance|corridor|hall|atrium/],
];
const CALL_NUMBERS = /^\s*[a-z]{1,3}\s*[-–—]\s*[a-z]{1,3}\s*$/i; // "P - PM", "N-NX": library call-number ranges
function kindOf(type, name) {
  if (CALL_NUMBERS.test(name || '')) return 'shelves';
  const typed = String(type || '').toLowerCase();
  if (['stairs', 'lift', 'toilets'].includes(typed)) return 'core';
  if (['shelves', 'study_room', 'workstations'].includes(typed)) return typed;
  const t = `${name || ''} ${typed}`.toLowerCase();
  for (const [kind, re] of KIND_RULES) if (re.test(t)) return kind;
  return 'none';
}
const BLOCK_KINDS = ['core', 'study_room', 'shelves', 'workstations'];

// plan: from analysePlan. info: Gemma's reading of the plan (may be null). Returns a level for cleanLevel().
export function planToLevel(plan, info, { SIZES, COLOURS, widthOverride = null } = {}) {
  info = info || {};
  // 1. crop to the building
  let c0 = plan.cols, c1 = 0, r0 = plan.rows, r1 = 0;
  for (let i = 0; i < plan.grid.length; i++) if (plan.grid[i] !== OUTSIDE) {
    const x = i % plan.cols, y = (i / plan.cols) | 0;
    if (x < c0) c0 = x; if (x > c1) c1 = x; if (y < r0) r0 = y; if (y > r1) r1 = y;
  }
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const grid = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grid[y * cols + x] = plan.grid[(y + r0) * plan.cols + x + c0];

  // 1b. name every coloured block from Gemma's badge readings (badge n = block n), else from the legend
  const readings = new Map((Array.isArray(info.blocks) ? info.blocks : []).map((b) => [Number(b.n), b]));
  const libraryish = /librar|stack|periodical|shel|book/i.test(JSON.stringify([info.room_name, info.rooms, info.legend, info.blocks]));
  const blocks = (plan.zones || []).map((z, i) => {
    const rd = readings.get(i + 1);
    let kind = rd ? kindOf(rd.type, rd.label) : 'none';
    if (kind === 'none' && libraryish && !rd) kind = 'shelves'; // an unread block on a library plan is shelving
    return { ...z, kind, name: (rd && rd.label) || (kind === 'shelves' ? 'stacks' : 'block') };
  });

  // 2. scale: metres per cell. Best cue: a staircase is about 3 m wide. Next: partition walls are about
  //    0.1 m thick. Gemma's own estimate is blended in only when it roughly agrees.
  const fromWalls = cols * plan.cellPx * (0.1 / Math.max(2, plan.wallPx));
  const stairSides = blocks.filter((b) => b.kind === 'core' && /stair/i.test(b.name)).map((b) => Math.min(b.cx1 - b.cx0 + 1, b.cy1 - b.cy0 + 1)).sort((x, y) => x - y);
  const fromStairs = stairSides.length ? cols * (3.0 / stairSides[stairSides.length >> 1]) : 0;
  const fromGemma = Number(info.building_width_m);
  let guess;
  if (fromStairs) guess = fromGemma > fromStairs * 0.6 && fromGemma < fromStairs * 1.6 ? Math.sqrt(fromStairs * fromGemma) : fromStairs;
  else guess = fromGemma > fromWalls * 0.7 && fromGemma < fromWalls * 1.4 ? fromGemma : fromWalls;
  const widthM = Math.max(12, Math.min(90, Number(widthOverride) || guess));
  const cellM = widthM / cols;
  const W = cols * cellM, D = rows * cellM;
  const toWorld = (x, y) => [(x + 0.5) * cellM - W / 2, (y + 0.5) * cellM - D / 2];
  const toCell = (wx, wz) => [Math.floor((wx + W / 2) / cellM), Math.floor((wz + D / 2) / cellM)];

  // 3. distance from every free cell to the nearest wall (in cells), so furniture keeps clear of walls
  const dist = new Float32Array(cols * rows).fill(1e9);
  const q = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] !== FREE) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % cols, y = (i / cols) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1]) {
      if (j >= 0 && dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  const taken = new Uint8Array(cols * rows);
  // does a w x d footprint centred at (wx, wz) fit, keeping `clear` metres from walls and other furniture?
  const fits = (wx, wz, w, d, clear) => {
    const [a, b] = toCell(wx - w / 2, wz - d / 2), [e, f] = toCell(wx + w / 2, wz + d / 2);
    if (a < 0 || b < 0 || e >= cols || f >= rows) return false;
    for (let y = b; y <= f; y++) for (let x = a; x <= e; x++) {
      const i = y * cols + x;
      if (grid[i] !== FREE || taken[i] || dist[i] * cellM < clear) return false;
    }
    return true;
  };
  const claim = (wx, wz, w, d, pad = 0.15) => {
    const [a, b] = toCell(wx - w / 2 - pad, wz - d / 2 - pad), [e, f] = toCell(wx + w / 2 + pad, wz + d / 2 + pad);
    for (let y = Math.max(0, b); y <= Math.min(rows - 1, f); y++) for (let x = Math.max(0, a); x <= Math.min(cols - 1, e); x++) taken[y * cols + x] = 1;
  };
  const objects = [];
  const place = (type, name, wx, wz, room, { rot = 0, size = null, color = null, elevation = 0 } = {}) => {
    const s = (size || SIZES[type]).slice();
    const swap = rot === 90 || rot === 270;
    claim(wx, wz, swap ? s[2] : s[0], swap ? s[0] : s[2]);
    const o = { name, type, shape: 'box', at: [wx, wz], size: s, rotation: rot, elevation, color: color || COLOURS[type], haunted: false, room };
    objects.push(o);
    return o;
  };

  // 3b. build every coloured block for what it is
  const boxOf = (cells) => { let x0 = cols, x1 = 0, y0 = rows, y1 = 0; for (const c of cells) { const x = c % cols, y = (c / cols) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, x1, y0, y1 }; };
  const inBlock = new Int16Array(cols * rows).fill(-1);
  const cellsOf = (z) => {
    const raw = z.cells.map((c) => { const x = (c % plan.cols) - c0, y = ((c / plan.cols) | 0) - r0; return x >= 0 && y >= 0 && x < cols && y < rows ? y * cols + x : -1; }).filter((c) => c >= 0);
    if (!raw.length) return raw;
    // the label printed on a block leaves holes in it: close them (dilate, then erode) inside its box
    const bb = boxOf(raw), pad = 5, bw = bb.x1 - bb.x0 + 1 + pad * 2, bh = bb.y1 - bb.y0 + 1 + pad * 2;
    const m = new Uint8Array(bw * bh);
    for (const c of raw) m[((c / cols | 0) - bb.y0 + pad) * bw + (c % cols) - bb.x0 + pad] = 1;
    const closed = morph(morph(m, bw, bh, 4, false), bw, bh, 4, true);
    const out = [];
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const gx = x + bb.x0 - pad, gy = y + bb.y0 - pad;
      if (closed[y * bw + x] && gx >= 0 && gy >= 0 && gx < cols && gy < rows && grid[gy * cols + gx] !== OUTSIDE) out.push(gy * cols + gx);
    }
    return out;
  };
  const builtBlocks = [];
  blocks.forEach((b, bi) => {
    const cells = cellsOf(b);
    if (!cells.length) return;
    for (const c of cells) { inBlock[c] = bi; taken[c] = 1; }
    const bb = boxOf(cells);
    const [ax, az] = toWorld(bb.x0, bb.y0), [bx, bz] = toWorld(bb.x1, bb.y1);
    const wide = bx - ax, deep = bz - az;
    const inside = (wx, wz) => { const [x, y] = toCell(wx, wz); return x >= 0 && y >= 0 && x < cols && y < rows && inBlock[y * cols + x] === bi; };
    const footprintInside = (wx, wz, w, d) => inside(wx - w / 2, wz - d / 2) && inside(wx + w / 2, wz - d / 2) && inside(wx - w / 2, wz + d / 2) && inside(wx + w / 2, wz + d / 2) && inside(wx, wz);
    builtBlocks.push({ ...bb, name: b.name, kind: b.kind });

    if (b.kind === 'core') { // stairs, lifts, toilets: solid, you walk round them
      for (const c of cells) grid[c] = WALL;
    } else if (b.kind === 'shelves') {
      // library ranges: double-sided stacks across the block's short side, 0.9 m aisles between them
      const [, sh, sd] = SIZES.stack, pitch = sd + 0.95, steel = b.lum > 0.55; // pale blocks are rolling stacks
      const across = wide <= deep; // ranges run along x when the block is tall
      const len = (across ? wide : deep) - 0.2, run = across ? deep : wide;
      const segs = Math.max(1, Math.ceil(len / 2.4)), segLen = len / segs;
      for (let t = 0.5 + sd / 2; t <= run - sd / 2 - 0.1; t += pitch) {
        for (let k = 0; k < segs; k++) {
          const u = -len / 2 + segLen * (k + 0.5);
          const wx = across ? (ax + bx) / 2 + u : ax + t, wz = across ? az + t : (az + bz) / 2 + u;
          if (!footprintInside(wx, wz, across ? segLen : sd, across ? sd : segLen)) continue;
          place('stack', steel ? 'rolling stack' : 'bookshelf range', wx, wz, b.name, { rot: across ? 0 : 90, size: [segLen - 0.04, sh, sd], color: steel ? '#8d949b' : '#9a6a3c' });
        }
      }
    } else if (b.kind === 'workstations') {
      // computer desks in back-to-back pairs, monitors on top, a chair at each
      const [dw, dh, dd] = SIZES.desk;
      const rowPitch = dd * 2 + 1.4, nRows = Math.max(1, Math.floor((deep + 1.4) / rowPitch));
      for (let r = 0; r < nRows; r++) {
        const z = (az + bz) / 2 + (r - (nRows - 1) / 2) * rowPitch;
        for (let x = ax + dw / 2 + 0.2; x <= bx - dw / 2 - 0.2; x += dw + 0.1) {
          for (const side of [-1, 1]) {
            const zz = z + side * dd / 2;
            if (!footprintInside(x, zz, dw, dd)) continue;
            place('desk', 'computer desk', x, zz, b.name, { rot: side > 0 ? 0 : 180 });
            place('monitor', 'monitor', x, zz - side * 0.15, b.name, { elevation: dh, rot: side > 0 ? 0 : 180, size: [0.55, 0.42, 0.05] });
            place('chair', 'chair', x, zz + side * (dd / 2 + 0.35), b.name, { rot: side > 0 ? 180 : 0 });
          }
        }
      }
    } else if (b.kind === 'study_room' || b.kind === 'meeting') {
      // one block may hold a row of rooms (study rooms 1015, 1013, 1011, 1009): split it into squarish rooms,
      // put walls round each with a door, and a table with chairs inside
      const longX = wide >= deep, n = Math.max(1, Math.round((longX ? wide : deep) / Math.max(2.4, longX ? deep : wide)));
      for (let r = 0; r < n; r++) {
        const rx0 = longX ? ax + (wide / n) * r : ax, rx1 = longX ? ax + (wide / n) * (r + 1) : bx;
        const rz0 = longX ? az : az + (deep / n) * r, rz1 = longX ? bz : az + (deep / n) * (r + 1);
        const [cx0, cy0] = toCell(rx0, rz0), [cx1, cy1] = toCell(rx1, rz1);
        const doorX = Math.round((cx0 + cx1) / 2), doorW = Math.max(2, Math.round(0.9 / cellM));
        for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
          const i = y * cols + x;
          if (i < 0 || i >= grid.length || inBlock[i] !== bi) continue;
          const edge = x === cx0 || x === cx1 || y === cy0 || y === cy1;
          const door = y === cy0 && Math.abs(x - doorX) <= doorW / 2; // the door opens on the block's top side
          if (edge && !door) grid[i] = WALL;
        }
        const tx = (rx0 + rx1) / 2, tz = (rz0 + rz1) / 2 + 0.2, tw = Math.min(1.6, (rx1 - rx0) - 1.4), td = Math.min(0.9, (rz1 - rz0) - 1.6);
        if (tw < 0.6 || td < 0.5) continue;
        place('table', 'study table', tx, tz, b.name, { size: [tw, 0.75, td] });
        place('chair', 'chair', tx, tz - td / 2 - 0.3, b.name);
        place('chair', 'chair', tx, tz + td / 2 + 0.3, b.name, { rot: 180 });
      }
    }
  });

  // 4. rooms: Gemma's labelled boxes, or the detected areas if Gemma could not help
  const totalRoomCells = plan.rooms.reduce((sum, r) => sum + r.cells, 0) || 1;
  let rooms = (Array.isArray(info.rooms) ? info.rooms : []).map((r) => {
    const b = Array.isArray(r.box) && r.box.length === 4 ? r.box.map(Number) : null;
    if (!b || b.some((v) => !Number.isFinite(v))) return null;
    // box is in fractions of the whole image; convert to cropped cells
    const x0 = Math.round(b[0] * plan.cols) - c0, y0 = Math.round(b[1] * plan.rows) - r0;
    const x1 = Math.round(b[2] * plan.cols) - c0, y1 = Math.round(b[3] * plan.rows) - r0;
    if (BLOCK_KINDS.includes(kindOf(r.type, r.name)) && blocks.length) return null; // built from its badge above
    const room = { name: String(r.name || 'room').slice(0, 40), kind: kindOf(r.type, r.name), x0: Math.max(0, Math.min(x0, x1)), y0: Math.max(0, Math.min(y0, y1)), x1: Math.min(cols - 1, Math.max(x0, x1)), y1: Math.min(rows - 1, Math.max(y0, y1)) };
    // Gemma's boxes are rough: snap to the walled room the box is centred in, when there is a clear one
    const mx = Math.round((room.x0 + room.x1) / 2) + c0, my = Math.round((room.y0 + room.y1) / 2) + r0;
    let id = -1;
    for (let rr = 0; rr < 6 && id < 0; rr++) for (let dy = -rr; dy <= rr && id < 0; dy++) for (let dx = -rr; dx <= rr && id < 0; dx++) {
      const x = mx + dx, y = my + dy;
      if (x >= 0 && y >= 0 && x < plan.cols && y < plan.rows) id = plan.roomOf[y * plan.cols + x];
    }
    const found = id >= 0 && plan.rooms[id];
    if (found && found.cells < totalRoomCells * 0.4) Object.assign(room, { x0: found.x0 - c0, y0: found.y0 - r0, x1: found.x1 - c0, y1: found.y1 - r0, snapped: true });
    return room;
  }).filter((r) => r && r.x1 - r.x0 > 3 && r.y1 - r.y0 > 3);
  if (!rooms.length) {
    const biggest = Math.max(...plan.rooms.map((r) => r.cells), 1);
    rooms = plan.rooms.map((r) => ({ name: 'area', kind: r.cells > biggest * 0.4 ? 'desks' : r.cells > biggest * 0.08 ? 'meeting' : 'lounge',
      x0: r.x0 - c0, y0: r.y0 - r0, x1: r.x1 - c0, y1: r.y1 - r0 }));
  }

  // 5. furnish each room from its template. Rooms on a plan are rarely neat rectangles (and Gemma's boxes
  //    are rough), so scan the room every 30 cm and put furniture wherever it really fits.
  for (const room of rooms) {
    const [ax, az] = toWorld(room.x0, room.y0), [bx, bz] = toWorld(room.x1, room.y1);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, area = (bx - ax) * (bz - az);
    const spots = (byCentre) => {
      const out = [];
      for (let z = az + 0.3; z <= bz - 0.3; z += 0.3) for (let x = ax + 0.3; x <= bx - 0.3; x += 0.3) out.push([x, z]);
      if (byCentre) out.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cz) - Math.hypot(q[0] - cx, q[1] - cz));
      return out;
    };
    if (room.kind === 'desks') {
      const [dw, , dd] = SIZES.desk;
      let n = 0, cap = Math.max(1, Math.floor(area / 3.2));
      for (const [x, z] of spots(false)) {
        if (n >= cap) break;
        if (!fits(x, z, dw + 0.3, dd + 0.9, 0.15)) continue; // the desk, its chair, and a gap to the next
        place('desk', 'study desk', x, z - 0.4, room.name);
        place('chair', 'chair', x, z - 0.4 + dd / 2 + 0.35, room.name, { rot: 180 });
        n++;
      }
    } else if (room.kind === 'shelves') {
      const [sw, , sd] = SIZES.shelf;
      let n = 0;
      for (const [x, z] of spots(false)) {
        if (n >= 30) break;
        if (fits(x, z, sw * 2, sd + 1.2, 0.2)) { place('shelf', 'bookshelf', x - sw / 2, z, room.name); place('shelf', 'bookshelf', x + sw / 2, z, room.name); n += 2; }
      }
    } else if (room.kind === 'meeting') {
      let n = 0, cap = Math.max(1, Math.floor(area / 9));
      for (const [tw, td] of [[1.8, 0.9], [1.2, 0.8]]) for (const [x, z] of spots(true)) {
        if (n >= cap) break;
        if (!fits(x, z, tw + 0.9, td + 0.9, 0.1)) continue;
        place('table', 'meeting table', x, z, room.name, { size: [tw, 0.75, td] });
        const k = Math.max(1, Math.floor(tw / 0.65));
        for (let c = 0; c < k; c++) {
          const px = x + (c - (k - 1) / 2) * 0.65;
          place('chair', 'chair', px, z - td / 2 - 0.3, room.name);
          place('chair', 'chair', px, z + td / 2 + 0.3, room.name, { rot: 180 });
        }
        n++;
      }
    } else if (room.kind === 'cafe') {
      let n = 0;
      for (const [x, z] of spots(true)) {
        if (n >= 10) break;
        if (!fits(x, z, 2.0, 2.0, 0.2)) continue;
        place('table', 'round cafe table', x, z, room.name, { size: [0.9, 0.75, 0.9], color: '#e8e4dc' });
        place('chair', 'chair', x, z - 0.75, room.name);
        place('chair', 'chair', x, z + 0.75, room.name, { rot: 180 });
        n++;
      }
    } else if (room.kind === 'lounge') {
      let n = 0;
      for (const [x, z] of spots(false)) { if (n < 2 && fits(x, z, 0.7, 0.7, 0.5)) { place('plant', 'potted plant', x, z, room.name); n++; } }
    }
  }
  // big open floor left empty (cafe corners often have no text label): cafe tables, or study desks in a library
  const covered = (x, y) => { const [wx, wz] = toWorld(x, y); return objects.some((o) => Math.hypot(o.at[0] - wx, o.at[1] - wz) < 3); };
  const pitch = Math.max(1, Math.round(2.8 / cellM));
  let cafes = 0;
  for (let y = pitch; y < rows - pitch && cafes < 12; y += pitch) for (let x = pitch; x < cols - pitch && cafes < 12; x += pitch) {
    const i = y * cols + x;
    if (grid[i] !== FREE || dist[i] * cellM < 2.0 || covered(x, y)) continue;
    const [wx, wz] = toWorld(x, y);
    if (!fits(wx, wz, 2.0, 2.0, 0.3)) continue;
    if (libraryish) { // a reading table with four seats
      place('table', 'reading table', wx, wz, 'open floor', { size: [1.6, 0.75, 0.9], color: '#c99a62' });
      for (const s of [-1, 1]) { place('chair', 'chair', wx - 0.4, wz + s * 0.75, 'open floor', { rot: s > 0 ? 180 : 0 }); place('chair', 'chair', wx + 0.4, wz + s * 0.75, 'open floor', { rot: s > 0 ? 180 : 0 }); }
    } else {
      place('table', 'round cafe table', wx, wz, 'open floor', { size: [0.9, 0.75, 0.9], color: '#e8e4dc' });
      place('chair', 'chair', wx, wz - 0.75, 'open floor');
      place('chair', 'chair', wx, wz + 0.75, 'open floor', { rot: 180 });
    }
    cafes++;
  }
  if (objects.length > 380) objects.length = 380;

  // 6. where the player starts: the most open spot of the lobby / foyer, else the most open spot anywhere
  const lobby = rooms.find((r) => r.kind === 'lounge');
  let best = -1, bi = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== FREE || taken[i]) continue;
    const x = i % cols, y = (i / cols) | 0;
    const inLobby = lobby && x >= lobby.x0 && x <= lobby.x1 && y >= lobby.y0 && y <= lobby.y1;
    const open = dist[i] * cellM;
    const score = open + (inLobby && open > 1.5 ? 100 : 0);
    if (score > best) { best = score; bi = i; }
  }
  const spawn = toWorld(bi % cols, (bi / cols) | 0);

  // 7. haunted: the kinds Gemma picked, else sturdy furniture in different rooms, far from the player
  const far = (o) => -Math.hypot(o.at[0] - spawn[0], o.at[1] - spawn[1]);
  for (const h of (Array.isArray(info.haunted) ? info.haunted : []).slice(0, 4)) {
    const want = String((h && h.object) || '').toLowerCase();
    const pool = objects.filter((o) => !o.haunted && (o.type === want || o.name.includes(want)) && o.type !== 'chair').sort((a, b) => far(a) - far(b));
    const pick = pool[Math.floor(pool.length * 0.3)];
    if (pick) { pick.haunted = true; pick.ghost = (h && h.ghost) || {}; }
  }
  const usedRooms = new Set(objects.filter((o) => o.haunted).map((o) => o.room));
  for (const o of objects.filter((x) => x.type !== 'chair').sort((a, b) => far(a) - far(b))) {
    if (objects.filter((x) => x.haunted).length >= 3) break;
    if (!o.haunted && !usedRooms.has(o.room)) { o.haunted = true; usedRooms.add(o.room); }
  }

  const level = {
    room_name: info.room_name || 'The Haunted Floor', vibe: info.vibe || 'Every room on this floor hides something.',
    boss_line: info.boss_line, palette: info.palette, lighting: info.lighting || 'day',
    size: { width: W, depth: D, height: 3.0 }, objects, spawn, expanded: true, plan_mode: true,
  };
  return { level, map: { grid, cols, rows, cellM, W, D }, rooms, blocks: builtBlocks };
}

// Helpers the game uses at run time.
export function mapHelpers(map) {
  const { grid, cols, rows, cellM, W, D } = map;
  const blockedAt = (wx, wz) => {
    const x = Math.floor((wx + W / 2) / cellM), y = Math.floor((wz + D / 2) / cellM);
    return x < 0 || y < 0 || x >= cols || y >= rows || grid[y * cols + x] !== FREE;
  };
  // push a circle (radius r) out of any wall cells it overlaps
  const pushOut = (pos, r) => {
    const x0 = Math.floor((pos.x - r + W / 2) / cellM), x1 = Math.floor((pos.x + r + W / 2) / cellM);
    const y0 = Math.floor((pos.z - r + D / 2) / cellM), y1 = Math.floor((pos.z + r + D / 2) / cellM);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x >= 0 && y >= 0 && x < cols && y < rows && grid[y * cols + x] === FREE) continue;
      const bx0 = x * cellM - W / 2, bx1 = bx0 + cellM, bz0 = y * cellM - D / 2, bz1 = bz0 + cellM;
      const nx = Math.max(bx0, Math.min(pos.x, bx1)), nz = Math.max(bz0, Math.min(pos.z, bz1));
      const dx = pos.x - nx, dz = pos.z - nz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) { pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
      else { // centre inside the cell: leave by the nearest side
        const l = pos.x - bx0, rr = bx1 - pos.x, t = pos.z - bz0, b = bz1 - pos.z, m = Math.min(l, rr, t, b);
        if (m === l) pos.x = bx0 - r; else if (m === rr) pos.x = bx1 + r; else if (m === t) pos.z = bz0 - r; else pos.z = bz1 + r;
      }
    }
  };
  // merge wall cells into rectangles for drawing (row runs, stacked when identical)
  const wallRects = () => {
    const rects = [], open = new Map();
    for (let y = 0; y <= rows; y++) {
      const runs = [];
      if (y < rows) for (let x = 0; x < cols;) {
        if (grid[y * cols + x] !== WALL) { x++; continue; }
        const s = x; while (x < cols && grid[y * cols + x] === WALL) x++;
        runs.push(`${s},${x}`);
      }
      const next = new Map();
      for (const k of runs) next.set(k, open.has(k) ? open.get(k) : y);
      for (const [k, y0] of open) if (!next.has(k)) { const [a, b] = k.split(',').map(Number); rects.push([a, y0, b, y]); }
      open.clear(); for (const [k, v] of next) open.set(k, v);
    }
    return rects.map(([a, y0, b, y1]) => ({ x: (a + b) / 2 * cellM - W / 2, z: (y0 + y1) / 2 * cellM - D / 2, w: (b - a) * cellM, d: (y1 - y0) * cellM }));
  };
  const nav = makeNav({ grid, cols, rows }, cellM, 0.25); // ghosts are slim enough for any doorway
  const navCell = (wx, wz) => [Math.floor((wx + W / 2) / cellM / nav.step), Math.floor((wz + D / 2) / cellM / nav.step)];
  const navWorld = ([nx, ny]) => [(nx + 0.5) * nav.step * cellM - W / 2, (ny + 0.5) * nav.step * cellM - D / 2];
  return { blockedAt, pushOut, wallRects, nav, navCell, navWorld };
}
