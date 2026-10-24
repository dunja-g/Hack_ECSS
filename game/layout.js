// Layout engine: the second half of the photo -> arena pipeline.
// Gemma only describes the room (what kind of room, what lines each wall, which
// groups of furniture stand where). This file turns that description into
// precisely placed furniture with real-world sizes, so a library gets walls of
// full-size bookcases and rows of study desks, every time.
import { TYPES, inferType } from './furniture.js';

// Real-world sizes [width, height, depth] in metres, and a fallback colour.
export const SIZES = {
  desk: [1.2, 0.75, 0.7], table: [1.6, 0.75, 0.9], chair: [0.5, 0.9, 0.5], sofa: [2.0, 0.85, 0.9],
  bed: [2.0, 0.55, 1.4], shelf: [0.9, 2.1, 0.35], cabinet: [0.9, 1.9, 0.55], monitor: [0.55, 0.45, 0.05],
  laptop: [0.34, 0.02, 0.24], tv: [1.2, 0.7, 0.06], lamp: [0.35, 1.6, 0.35], plant: [0.45, 1.1, 0.45],
  whiteboard: [2.4, 1.2, 0.03], door: [1.0, 2.1, 0.06], window: [1.4, 1.4, 0.05], box: [0.5, 0.5, 0.5],
};
const COLOURS = {
  desk: '#c99a62', table: '#b98a58', chair: '#3a4a6b', sofa: '#6b7f99', bed: '#5b8cff', shelf: '#b07a45',
  cabinet: '#8b8f94', monitor: '#1d1f23', laptop: '#8d9096', tv: '#15171a', lamp: '#e8d9b0', plant: '#8a5a3c',
  whiteboard: '#f4f4f2', door: '#9a7b5a', window: '#dfefff', box: '#9a8f80',
};
// What each kind of room looks like when Gemma is unsure: size and what to do with empty walls.
const ROOMS = {
  library: { size: [10, 14, 3.4], shelf: [0.9, 2.2, 0.35], emptyWalls: 'shelves' },
  classroom: { size: [10, 12, 3.2] }, lab: { size: [11, 12, 3.2] }, office: { size: [10, 10, 3.0] },
  bedroom: { size: [10, 10, 2.8] }, living_room: { size: [11, 10, 2.8] }, kitchen: { size: [10, 10, 2.8] },
  cafe: { size: [12, 12, 3.2] }, hallway: { size: [10, 18, 3.0] }, other: { size: [12, 12, 3.2] },
};
// Elevation for things that hang on a wall.
const HANG = { window: 0.9, whiteboard: 0.9, tv: 1.2 };

const clampN = (v, d, lo, hi) => { const n = Number(v); return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : d)); };
const typeOf = (t, name) => (TYPES.includes(t) ? t : inferType(t || name || ''));

export function isScene(data) {
  return !!data && typeof data === 'object' && (Array.isArray(data.groups) || (data.walls && typeof data.walls === 'object'));
}

// Turn a scene description into the classic level format ({size, objects: [...]}).
export function expandScene(data) {
  const roomType = ROOMS[data.room_type] ? data.room_type : 'other';
  const room = ROOMS[roomType];
  const g = data.size_guess || data.size || {};
  // small vision models tend to overestimate room size; keep it near what this kind of room really is
  let W = clampN(g.width, room.size[0], 10, Math.max(10, room.size[0] * 1.4));
  let D = clampN(g.depth, room.size[1], 10, Math.max(10, room.size[1] * 1.4));
  const H = clampN(g.height, room.size[2], 3, 8);
  if (data.shape === 'long' && D < W) [W, D] = [D, W];
  if (data.shape === 'wide' && W < D) [W, D] = [D, W];

  const objects = [];
  const used = [];  // footprints already taken, for scattered placement
  const sizeFor = (type) => (type === 'shelf' && room.shelf ? room.shelf : SIZES[type]).slice();
  const put = (type, name, x, z, { rot = 0, wall = null, elevation = 0, size = null, color = null, divider = false } = {}) => {
    const s = size || sizeFor(type);
    const o = { name, type, shape: 'box', at: [x, z], size: s, rotation: rot, wall, elevation, color: color || COLOURS[type], haunted: false };
    if (divider) o.divider = true;
    objects.push(o);
    used.push({ x, z, r: Math.max(s[0], s[2]) / 2 + 0.3 });
    return o;
  };

  // ---------------------------------------------------------------- walls
  // Each wall is a list in order (back wall: left to right; side walls: back to front).
  // "shelves" entries stretch to fill whatever length the fixed items leave free.
  const walls = data.walls && typeof data.walls === 'object' ? data.walls : {};
  const listFor = (side) => {
    const raw = Array.isArray(walls[side]) ? walls[side] : [];
    const list = raw.map((e) => String(e).toLowerCase().trim()).filter(Boolean).slice(0, 8);
    if (room.emptyWalls && side !== 'front' && !list.some((e) => /shel|book/.test(e))) {
      // e.g. a library wall with just a door is really shelves, door, shelves
      const filled = [room.emptyWalls];
      for (const e of list) filled.push(e, room.emptyWalls);
      return filled;
    }
    return list;
  };
  const sides = { back: listFor('back'), left: listFor('left'), right: listFor('right'), front: listFor('front') };
  const shelfDepth = sizeFor('shelf')[2];
  const sideHasShelves = (s) => sides[s].some((e) => /shel|book/.test(e));
  for (const side of ['back', 'left', 'right', 'front']) {
    const list = sides[side];
    if (!list.length) continue;
    const along = side === 'back' || side === 'front';
    const length = along ? W : D;
    // keep corners free for the neighbouring wall, and the front of the room free for the player
    let start = -length / 2 + 0.3, end = length / 2 - 0.3;
    if (along) {
      if (sideHasShelves('left')) start += shelfDepth + 0.15;
      if (sideHasShelves('right')) end -= shelfDepth + 0.15;
    } else {
      if (sideHasShelves('back')) start += shelfDepth + 0.15;
      end -= 2.2; // the camera side: open floor where the player starts
    }
    const items = list.map((e) => (/shel|book/.test(e) ? { fill: true } : { type: typeOf(null, e), name: e }));
    const gap = 0.3;
    const fixed = items.filter((i) => !i.fill).reduce((sum, i) => sum + sizeFor(i.type)[0] + gap, 0);
    const fills = items.filter((i) => i.fill).length;
    const fillLen = fills ? Math.max(0, (end - start - fixed) / fills - gap) : 0;
    // with nothing to stretch, spread the fixed items evenly along the wall
    const spread = fills ? 0 : Math.max(0, (end - start - fixed) / (items.length + 1));
    let cursor = start;
    for (const item of items) {
      cursor += spread;
      if (item.fill) {
        const sw = sizeFor('shelf')[0], n = Math.floor((fillLen + 0.02) / (sw + 0.02));
        const runStart = cursor + (fillLen - (n * (sw + 0.02) - 0.02)) / 2;
        for (let k = 0; k < n; k++) {
          const c = runStart + sw / 2 + k * (sw + 0.02);
          put('shelf', 'bookshelf', along ? c : 0, along ? 0 : c, { wall: side });
        }
        cursor += fillLen + gap;
      } else {
        const s = sizeFor(item.type), c = cursor + s[0] / 2;
        if (cursor + s[0] <= end + 0.01) {
          put(item.type, item.name, along ? c : 0, along ? 0 : c, { wall: side, elevation: HANG[item.type] || 0 });
        }
        cursor += s[0] + gap;
      }
    }
  }

  // ---------------------------------------------------------------- groups
  const margin = (side) => (sideHasShelves(side) ? shelfDepth + 0.25 : 0.25) + 0.9; // wall stuff + an aisle
  const inner = { x0: -W / 2 + margin('left'), x1: W / 2 - margin('right'), z0: -D / 2 + margin('back'), z1: D / 2 - 3.2 };
  const surfaces = []; // desks and tables, for chairs and things that sit on top
  const groups = Array.isArray(data.groups) ? data.groups.slice(0, 12) : [];
  // furniture that others attach to goes first
  const order = (gr) => (gr.on ? 2 : gr.with ? 1 : 0);
  for (const gr of [...groups].sort((a, b) => order(a) - order(b))) {
    if (!gr || typeof gr !== 'object') continue;
    const type = typeOf(gr.type, gr.name);
    const name = String(gr.name || type).slice(0, 40);
    const count = Math.round(clampN(gr.count, 1, 1, 24));
    const color = typeof gr.color === 'string' && /^#[0-9a-f]{6}$/i.test(gr.color) ? gr.color : null;
    const s = sizeFor(type);

    if (gr.on) { // laptops, monitors, lamps on desks or tables
      const hosts = surfaces.filter((h) => !gr.on || h.type === typeOf(gr.on) || gr.on === 'any').slice(0, count);
      for (const h of hosts) {
        const [x, z] = h.at;
        put(type, name, x, z - h.size[2] * 0.15, { elevation: h.size[1], color, rot: h.rotation });
      }
      continue;
    }
    if (gr.with) { // chairs at desks or tables
      // seat the desks nearest the camera first, like the people you see in a photo
      const hosts = surfaces.filter((h) => h.type === typeOf(gr.with)).sort((p, q) => q.at[1] - p.at[1]).slice(0, count);
      for (const h of hosts) {
        const [x, z] = h.at;
        put(type, name, x, z + h.size[2] / 2 + s[2] / 2 + 0.1, { rot: 180, color });
      }
      continue;
    }

    const layout = ['rows', 'cluster', 'scattered'].includes(gr.layout) ? gr.layout : (['desk', 'table', 'chair'].includes(type) ? 'rows' : 'scattered');
    if (layout === 'rows' || layout === 'cluster') {
      // a grid with a centre aisle, like desks in a classroom or study tables in a library
      const pitchX = s[0] + (layout === 'cluster' ? 1.4 : 0.5), pitchZ = s[2] + (layout === 'cluster' ? 1.8 : 1.4);
      const aisle = 1.4;
      const maxCols = Math.max(1, Math.floor((inner.x1 - inner.x0 - aisle + 0.5) / pitchX));
      let rows = Math.round(clampN(gr.rows, Math.ceil(count / Math.min(maxCols, 4)), 1, 8));
      let cols = Math.min(maxCols, Math.ceil(count / rows));
      rows = Math.ceil(count / cols);
      const halfCols = cols / 2, gridW = cols * pitchX + (cols >= 2 ? aisle : 0), gridD = rows * pitchZ;
      const where = String(gr.where || 'center');
      let zc = where === 'back' ? inner.z0 + gridD / 2 : where === 'front' ? inner.z1 - gridD / 2 : (inner.z0 + inner.z1) / 2;
      zc = Math.max(inner.z0 + gridD / 2, Math.min(inner.z1 - gridD / 2, zc));
      let n = 0;
      for (let r = 0; r < rows && n < count; r++) {
        for (let c = 0; c < cols && n < count; c++, n++) {
          let x = -gridW / 2 + pitchX * (c + 0.5);
          if (cols >= 2 && c >= halfCols) x += aisle;
          const z = zc - gridD / 2 + pitchZ * (r + 0.5);
          const o = put(type, name, x, z, { color, divider: !!gr.divider });
          if (type === 'desk' || type === 'table') surfaces.push(o);
        }
      }
      continue;
    }
    // scattered: free spots, kept apart from everything already placed
    const zone = String(gr.where || '');
    for (let i = 0, tries = 0; i < count && tries < 200; tries++) {
      let x = inner.x0 + Math.random() * (inner.x1 - inner.x0), z = inner.z0 + Math.random() * (inner.z1 - inner.z0);
      if (/left/.test(zone)) x = inner.x0 + Math.random() * 1.5;
      if (/right/.test(zone)) x = inner.x1 - Math.random() * 1.5;
      if (/back/.test(zone)) z = inner.z0 + Math.random() * 1.5;
      const r = Math.max(s[0], s[2]) / 2 + 0.3;
      if (used.some((u) => Math.hypot(u.x - x, u.z - z) < u.r + r)) continue;
      const o = put(type, name, x, z, { color });
      if (type === 'desk' || type === 'table') surfaces.push(o);
      i++;
    }
  }

  // ---------------------------------------------------------------- haunted
  // Gemma names which kinds of objects are haunted; pick real pieces of that kind, spread around.
  const haunted = Array.isArray(data.haunted) ? data.haunted.slice(0, 5) : [];
  for (const h of haunted) {
    if (!h || typeof h !== 'object') continue;
    const want = typeOf(null, h.object || h.type || '');
    const pool = objects.filter((o) => !o.haunted && o.type === want && o.type !== 'window' && o.type !== 'door');
    const pick = pool[Math.floor(pool.length * (0.25 + Math.random() * 0.5))] || pool[0];
    if (!pick) continue;
    pick.haunted = true;
    pick.ghost = h.ghost || {};
  }

  return {
    room_name: data.room_name, vibe: data.vibe, boss_line: data.boss_line, palette: data.palette, lighting: data.lighting,
    size: { width: W, depth: D, height: H }, objects, expanded: true,
  };
}
