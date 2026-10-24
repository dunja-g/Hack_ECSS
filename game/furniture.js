// Furniture: turns each object Gemma found into a recognisable model (desk with
// legs, chair with a back, glowing monitor...) instead of a plain block.
// Every model stands on y = 0, is centred on x/z and faces +z.
import * as THREE from 'three';

export const TYPES = ['desk', 'table', 'chair', 'sofa', 'bed', 'shelf', 'cabinet', 'monitor', 'laptop', 'tv',
  'lamp', 'plant', 'whiteboard', 'door', 'window', 'box'];
export const WALL_TYPES = ['whiteboard', 'door', 'window'];

// Guess a type from the object's name. The last word is usually the real noun
// ("computer desk" is a desk, "desk lamp" is a lamp), so it is checked first.
const COMPOUNDS = [
  ['cabinet', /server rack|filing|vending/],
  ['lamp', /(desk|floor|table) lamp/],
  ['box', /bean ?bag|laundry/],
];
const KEYWORDS = [
  ['box', /^(keyboard|mouse|books?|bag|backpack|box|boxes|bin|case|pile|crate)$/],
  ['laptop', /laptop|notebook/],
  ['monitor', /monitor|screen|display|computer|pc|imac/],
  ['tv', /^tv$|television/],
  ['whiteboard', /board|poster|projection|painting|picture|frame|mirror/],
  ['door', /door|gate/],
  ['window', /window|blind|curtain/],
  ['desk', /desk|workstation|counter|bench/],
  ['table', /table/],
  ['sofa', /sofa|couch/],
  ['bed', /bed|mattress|bunk/],
  ['shelf', /shel(f|ves)|bookcase|rack/],
  ['cabinet', /cabinet|wardrobe|locker|drawer|dresser|fridge|refrigerator|closet|cupboard|printer|server/],
  ['chair', /chair|stool|seat/],
  ['lamp', /lamp|light/],
  ['plant', /plant|tree|flower|pot|cactus/],
];
export function inferType(name) {
  const lower = String(name).toLowerCase();
  for (const [type, re] of COMPOUNDS) if (re.test(lower)) return type;
  const words = lower.split(/[^a-z]+/).filter(Boolean).reverse();
  for (const w of words) for (const [type, re] of KEYWORDS) if (re.test(w)) return type;
  return 'box';
}

const bookGeo = new THREE.BoxGeometry(1, 1, 1);
const BOOK_COLOURS = ['#b5443a', '#2f5d8a', '#d9a441', '#3f7d4e', '#6d4a8f', '#e0d6c3', '#8c2f2f', '#1f4a6e'];

// kit: paint(color, opts) -> material, screen(color) -> glowing material, edge(mesh) -> mesh
export function buildFurniture(o, kit) {
  const [w, h, d] = o.size;
  const root = new THREE.Group();
  const base = new THREE.Color(o.color);
  const shade = (k) => '#' + base.clone().multiplyScalar(k).getHexString();
  const main = kit.paint(o.color, { grain: true });
  const dark = kit.paint(shade(0.45), { rough: 0.6 });
  const metal = kit.paint('#8d939b', { rough: 0.35, metal: 0.8 });
  const blackPlastic = kit.paint('#1d2024', { rough: 0.5 });

  const add = (geo, mat, x, y, z, edge = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    root.add(edge ? kit.edge(m) : m);
    return m;
  };
  const box = (bw, bh, bd, mat, x, y, z, edge) => add(new THREE.BoxGeometry(bw, bh, bd), mat, x, y, z, edge);
  const cyl = (rt, rb, ch, mat, x, y, z, edge) => add(new THREE.CylinderGeometry(rt, rb, ch, 16), mat, x, y, z, edge);
  const legs = (lh, inset, size, mat) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(size, lh, size, mat, sx * (w / 2 - inset), lh / 2, sz * (d / 2 - inset), false);
  };

  switch (o.type) {
    case 'desk':
    case 'table': {
      const t = Math.min(0.05, h * 0.08);
      box(w, t, d, main, 0, h - t / 2, 0);
      legs(h - t, 0.06, 0.05, o.type === 'desk' ? metal : dark);
      if (o.type === 'desk') box(w * 0.9, h * 0.4, 0.02, dark, 0, h * 0.55, -d / 2 + 0.06, false); // modesty panel
      if (o.divider) box(w * 0.96, 0.45, 0.02, kit.paint('#e6eaed', { rough: 0.3 }), 0, h + 0.225, -d / 2 + 0.03, false); // study screen
      break;
    }
    case 'chair': {
      const seat = Math.min(0.48, h * 0.45);
      box(w, 0.06, d * 0.92, main, 0, seat, 0.02);
      if (/office|swivel|gaming/.test(o.name.toLowerCase())) {
        cyl(0.03, 0.03, seat - 0.08, metal, 0, (seat - 0.08) / 2 + 0.05, 0, false);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2, leg = box(0.04, 0.03, w * 0.48, blackPlastic, Math.sin(a) * w * 0.22, 0.05, Math.cos(a) * w * 0.22, false);
          leg.rotation.y = a;
        }
      } else legs(seat, 0.05, 0.035, dark);
      box(w * 0.94, h - seat - 0.03, 0.05, main, 0, seat + (h - seat) / 2, -d / 2 + 0.04);
      break;
    }
    case 'sofa': {
      const seatH = h * 0.45, armW = Math.min(0.2, w * 0.12);
      box(w, seatH, d, main, 0, seatH / 2, 0);
      box(w, h, d * 0.25, main, 0, h / 2, -d / 2 + d * 0.125);
      for (const s of [-1, 1]) box(armW, h * 0.65, d, main, s * (w / 2 - armW / 2), h * 0.325, 0);
      const cushion = kit.paint(shade(1.15), { grain: true });
      const n = Math.max(1, Math.round((w - armW * 2) / 0.7)), cw = (w - armW * 2) / n;
      for (let i = 0; i < n; i++) box(cw - 0.03, 0.12, d * 0.68, cushion, -w / 2 + armW + cw * (i + 0.5), seatH + 0.06, d * 0.1);
      break;
    }
    case 'bed': {
      box(w, h * 0.45, d, dark, 0, h * 0.225, 0);
      box(w * 0.96, h * 0.4, d * 0.97, kit.paint('#eeeae2', { rough: 0.95 }), 0, h * 0.45 + h * 0.2, 0.01);
      box(w * 0.92, 0.06, d * 0.6, main, 0, h * 0.86, d * 0.18); // blanket
      box(w, Math.max(h * 1.6, 0.9), 0.08, dark, 0, Math.max(h * 1.6, 0.9) / 2, -d / 2 + 0.04);
      box(w * 0.4, 0.12, 0.3, kit.paint('#ffffff', { rough: 0.95 }), 0, h * 0.92, -d / 2 + 0.3);
      break;
    }
    case 'shelf': {
      const side = 0.03;
      for (const s of [-1, 1]) box(side, h, d, main, s * (w / 2 - side / 2), h / 2, 0);
      box(w, side, d, main, 0, h - side / 2, 0); box(w, side, d, main, 0, side / 2, 0);
      box(w, h, 0.015, dark, 0, h / 2, -d / 2 + 0.008, false);
      const rows = Math.max(1, Math.round(h / 0.38));
      const books = [];
      for (let r = 0; r < rows; r++) {
        const y = (h / rows) * r;
        if (r > 0) box(w - side * 2, side, d, main, 0, y, 0, false);
        let x = -w / 2 + side + 0.02;
        while (x < w / 2 - side - 0.06) {
          const bw = 0.03 + Math.random() * 0.04, bh = Math.min(h / rows - 0.06, 0.18 + Math.random() * 0.1);
          if (Math.random() < 0.85) books.push([x + bw / 2, y + side / 2 + bh / 2, bw, bh]);
          x += bw + 0.005;
        }
      }
      // all the books in one bookcase are a single instanced mesh: one draw call, not hundreds
      const inst = new THREE.InstancedMesh(bookGeo, kit.paint('#ffffff', { rough: 0.8 }), books.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      books.forEach(([bx, by, bw, bh], i) => {
        inst.setMatrixAt(i, m4.compose(new THREE.Vector3(bx, by, 0.02), new THREE.Quaternion(), new THREE.Vector3(bw, bh, d * 0.75)));
        inst.setColorAt(i, col.set(BOOK_COLOURS[(Math.random() * BOOK_COLOURS.length) | 0]));
      });
      inst.castShadow = inst.receiveShadow = true;
      root.add(inst);
      break;
    }
    case 'cabinet': {
      box(w, h, d, main, 0, h / 2, 0);
      const doors = w > 0.7 ? 2 : 1;
      for (let i = 0; i < doors; i++) {
        const cx = -w / 2 + (w / doors) * (i + 0.5);
        box(w / doors - 0.03, h - 0.06, 0.012, kit.paint(shade(1.08), { grain: true }), cx, h / 2, d / 2 + 0.006, false);
        box(0.02, Math.min(0.25, h * 0.2), 0.03, metal, cx + (doors === 2 ? (i ? -1 : 1) : 1) * (w / doors / 2 - 0.07), h * 0.55, d / 2 + 0.025, false);
      }
      break;
    }
    case 'monitor':
    case 'tv': {
      const stand = o.type === 'monitor' && !o.wall;
      const screenH = stand ? h * 0.72 : h, y0 = stand ? h - screenH : 0, depth = Math.min(d, 0.06);
      box(w, screenH, depth, blackPlastic, 0, y0 + screenH / 2, 0);
      add(new THREE.PlaneGeometry(w - 0.03, screenH - 0.03), kit.screen(o.type === 'tv' ? '#5aa7ff' : '#7fc4ff'), 0, y0 + screenH / 2, depth / 2 + 0.002, false);
      if (stand) {
        box(0.05, y0 + 0.02, 0.04, blackPlastic, 0, y0 / 2, -0.02, false);
        box(w * 0.35, 0.02, Math.max(0.16, d), blackPlastic, 0, 0.01, 0, false);
      }
      break;
    }
    case 'laptop': {
      const t = 0.02;
      box(w, t, d, metal, 0, t / 2, 0);
      box(w * 0.9, 0.004, d * 0.5, blackPlastic, 0, t + 0.002, 0.03, false); // keys
      const lid = new THREE.Group(); lid.position.set(0, t, -d / 2); lid.rotation.x = -0.25; root.add(lid);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, d, t * 0.6), metal); panel.position.y = d / 2; panel.castShadow = true; lid.add(panel);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, d - 0.03), kit.screen('#8fd0ff')); scr.position.set(0, d / 2, t * 0.31); lid.add(scr);
      break;
    }
    case 'lamp': {
      const r = Math.max(0.12, Math.min(w, d) / 2);
      cyl(r * 0.8, r, 0.04, dark, 0, 0.02, 0, false);
      cyl(0.015, 0.015, h * 0.75, metal, 0, h * 0.375, 0, false);
      const shadeM = add(new THREE.CylinderGeometry(r * 0.55, r, h * 0.25, 20, 1, true), kit.screen('#ffe2a8', 1.6), 0, h * 0.86, 0, false);
      shadeM.material.side = THREE.DoubleSide;
      break;
    }
    case 'plant': {
      const potH = Math.min(h * 0.35, 0.45), r = Math.min(w, d) / 2;
      cyl(r * 0.75, r * 0.55, potH, main, 0, potH / 2, 0);
      const leaf = kit.paint('#3f8a4a', { rough: 0.8 }), leaf2 = kit.paint('#5aa35c', { rough: 0.8 });
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, rr = i ? r * 0.55 : 0, y = potH + (h - potH) * (0.3 + 0.12 * (i % 4));
        const s = add(new THREE.IcosahedronGeometry(Math.max(0.12, r * 0.75) * (i ? 0.8 : 1), 0), i % 2 ? leaf : leaf2, Math.cos(a) * rr, y, Math.sin(a) * rr, false);
        s.rotation.set(a, a * 0.7, 0);
      }
      break;
    }
    case 'whiteboard': {
      const frame = Math.min(0.03, d);
      box(w, h, frame, metal, 0, h / 2, 0, false);
      add(new THREE.PlaneGeometry(w - 0.05, h - 0.05), kit.paint(/black|chalk/.test(o.name.toLowerCase()) ? '#24302a' : '#f6f6f2', { rough: 0.25 }), 0, h / 2, frame / 2 + 0.002, false);
      box(w * 0.6, 0.03, 0.08, metal, 0, 0.015, 0.05, false); // pen tray
      break;
    }
    case 'door': {
      box(w + 0.1, 0.06, 0.1, dark, 0, h + 0.03, 0, false);
      for (const s of [-1, 1]) box(0.05, h, 0.1, dark, s * (w / 2 + 0.025), h / 2, 0, false);
      box(w, h, 0.05, main, 0, h / 2, 0);
      cyl(0.025, 0.025, 0.08, metal, w / 2 - 0.1, h * 0.48, 0.06, false).rotation.x = Math.PI / 2;
      break;
    }
    case 'window': {
      const glass = kit.screen('#cfe8ff', 1.2);
      add(new THREE.PlaneGeometry(w, h), glass, 0, h / 2, 0.005, false);
      const bar = kit.paint('#eceae4', { rough: 0.6 });
      box(w + 0.08, 0.06, 0.08, bar, 0, 0, 0.02, false); box(w + 0.08, 0.06, 0.08, bar, 0, h, 0.02, false);
      for (const s of [-1, 0, 1]) box(0.05, h, 0.06, bar, s * w / 2, h / 2, 0.02, false);
      box(w, 0.04, 0.05, bar, 0, h / 2, 0.02, false);
      break;
    }
    default: {
      if (o.shape === 'cylinder') cyl(w / 2, w / 2, h, main, 0, h / 2, 0);
      else if (o.shape === 'sphere') add(new THREE.SphereGeometry(0.5, 20, 14), main, 0, h / 2, 0).scale.set(w, h, d);
      else box(w, h, d, main, 0, h / 2, 0);
    }
  }

  // invisible collider: exact footprint for movement, bullets and line of sight
  const collider = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  collider.position.y = h / 2;
  root.add(collider);
  root.traverse((m) => { if (m !== collider && m.isMesh) m.raycast = () => {}; });
  return { root, collider };
}
