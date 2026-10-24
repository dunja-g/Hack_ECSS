// Weapons: one primary (pick from four), a pistol and a butterfly knife.
// Models are built from simple shapes. Each faces -z with its grip near the origin.
import * as THREE from 'three';

// dmg is a body hit; head multiplies it. spread is [standing still, moving] in screen units.
export const WEAPONS = {
  rifle: { slot: 1, name: 'Phantom Rifle', auto: true, rate: 0.105, mag: 30, reserve: 90, dmg: 34, head: 2.95, pellets: 1,
    spread: [0.006, 0.035], kick: 0.006, reload: 1.4, adsFov: 34, scope: true, move: 1, sound: 'rifle',
    blurb: 'Balanced. Scoped, full auto.' },
  smg: { slot: 1, name: 'Wisp SMG', auto: true, rate: 0.068, mag: 25, reserve: 100, dmg: 22, head: 2.5, pellets: 1,
    spread: [0.012, 0.03], kick: 0.0035, reload: 1.15, adsFov: 60, scope: false, move: 1.1, sound: 'smg',
    blurb: 'Fast and light. Run and gun.' },
  shotgun: { slot: 1, name: 'Exorcist Shotgun', auto: false, rate: 0.8, mag: 8, reserve: 32, dmg: 17, head: 1.6, pellets: 9,
    spread: [0.1, 0.12], kick: 0.03, reload: 2.1, adsFov: 62, scope: false, move: 0.95, sound: 'shotgun',
    blurb: 'Nine pellets. Brutal up close.' },
  sniper: { slot: 1, name: 'Banshee Sniper', auto: false, rate: 1.15, mag: 5, reserve: 20, dmg: 115, head: 3, pellets: 1,
    spread: [0.002, 0.09], hipSpread: 0.06, kick: 0.035, reload: 2.4, adsFov: 18, scope: true, move: 0.9, sound: 'sniper',
    blurb: 'One shot, one ghost. Scope in.' },
  pistol: { slot: 2, name: 'Hex Pistol', auto: false, rate: 0.16, mag: 12, reserve: 48, dmg: 30, head: 3, pellets: 1,
    spread: [0.008, 0.028], kick: 0.009, reload: 1.1, adsFov: 60, scope: false, move: 1.05, sound: 'pistol',
    blurb: 'Semi-auto sidearm.' },
  knife: { slot: 3, name: 'Butterfly Knife', melee: true, rate: 0.42, heavyRate: 1.0, dmg: 55, heavyDmg: 135, range: 2.2,
    move: 1.15, blurb: 'Slash, or right-click to stab.' },
};
export const PRIMARIES = ['rifle', 'smg', 'shotgun', 'sniper'];

// kit: mat(name) -> material from a small palette, edge(mesh) -> outlined mesh for cel-shaded styles
export function buildWeapon(id, kit) {
  const g = new THREE.Group();
  const B = (w, h, d, m, x, y, z, rx = 0) => { const b = kit.edge(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kit.mat(m))); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };
  const C = (r, l, m, x, y, z, seg = 14) => { const c = kit.edge(new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), kit.mat(m))); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); g.add(c); return c; };
  const out = { group: g, muzzle: new THREE.Vector3(0, 0, -0.5), rest: new THREE.Vector3(0.2, -0.21, -0.42), ads: new THREE.Vector3(0, -0.13, -0.34) };

  if (id === 'rifle') {
    B(0.07, 0.11, 0.42, 'dark', 0, 0, 0); B(0.078, 0.088, 0.34, 'mid', 0, -0.005, -0.36);
    C(0.014, 0.26, 'dark', 0, 0.005, -0.64); C(0.021, 0.07, 'dark', 0, 0.005, -0.79);
    B(0.05, 0.2, 0.09, 'rubber', 0, -0.15, -0.08, 0.25); B(0.045, 0.14, 0.06, 'rubber', 0, -0.12, 0.13, -0.35);
    B(0.05, 0.1, 0.26, 'mid', 0, -0.02, 0.34); B(0.03, 0.016, 0.36, 'dark', 0, 0.062, -0.12);
    C(0.026, 0.2, 'dark', 0, 0.1, -0.06); B(0.02, 0.04, 0.02, 'dark', 0, 0.075, -0.12); B(0.02, 0.04, 0.02, 'dark', 0, 0.075, 0);
    out.muzzle.set(0, 0.005, -0.84); out.ads.set(0, -0.085, -0.3);
  } else if (id === 'smg') {
    B(0.065, 0.1, 0.3, 'dark', 0, 0, -0.02); C(0.016, 0.14, 'dark', 0, 0.01, -0.24); C(0.024, 0.06, 'mid', 0, 0.01, -0.33);
    B(0.04, 0.26, 0.06, 'rubber', 0, -0.17, -0.06); B(0.042, 0.13, 0.055, 'rubber', 0, -0.11, 0.1, -0.3);
    B(0.012, 0.012, 0.22, 'mid', 0.03, -0.02, 0.24); B(0.012, 0.012, 0.22, 'mid', -0.03, -0.02, 0.24); B(0.07, 0.07, 0.02, 'mid', 0, -0.03, 0.35);
    B(0.04, 0.04, 0.06, 'dark', 0, 0.07, -0.04); B(0.03, 0.03, 0.005, 'lens', 0, 0.072, -0.072); // red-dot sight
    out.muzzle.set(0, 0.01, -0.37); out.rest.set(0.19, -0.2, -0.38);
  } else if (id === 'shotgun') {
    C(0.022, 0.62, 'dark', 0, 0.02, -0.4); C(0.018, 0.5, 'mid', 0, -0.025, -0.36);
    B(0.06, 0.06, 0.16, 'wood', 0, -0.025, -0.3); // pump
    B(0.07, 0.1, 0.24, 'dark', 0, 0, 0.02); B(0.05, 0.13, 0.32, 'wood', 0, -0.05, 0.27, -0.12);
    B(0.045, 0.12, 0.05, 'wood', 0, -0.1, 0.1, -0.35); B(0.012, 0.016, 0.012, 'lens', 0, 0.05, -0.7);
    out.muzzle.set(0, 0.02, -0.72); out.rest.set(0.2, -0.22, -0.4);
  } else if (id === 'sniper') {
    B(0.07, 0.1, 0.4, 'dark', 0, 0, 0); C(0.013, 0.62, 'dark', 0, 0.01, -0.5); C(0.024, 0.09, 'mid', 0, 0.01, -0.85);
    C(0.034, 0.32, 'dark', 0, 0.11, -0.05); C(0.042, 0.05, 'dark', 0, 0.11, -0.23); C(0.04, 0.04, 'dark', 0, 0.11, 0.13);
    B(0.02, 0.05, 0.02, 'dark', 0, 0.07, -0.12); B(0.02, 0.05, 0.02, 'dark', 0, 0.07, 0.04);
    B(0.05, 0.12, 0.34, 'wood', 0, -0.04, 0.34, -0.08); B(0.04, 0.13, 0.05, 'rubber', 0, -0.11, 0.12, -0.35);
    B(0.04, 0.12, 0.05, 'rubber', 0, -0.11, -0.06, 0.15); // magazine
    const bolt = C(0.01, 0.07, 'mid', 0.05, 0.04, 0.08); bolt.rotation.set(0, 0, Math.PI / 2);
    out.muzzle.set(0, 0.01, -0.9); out.ads.set(0, -0.088, -0.28);
  } else if (id === 'pistol') {
    B(0.05, 0.055, 0.22, 'dark', 0, 0.035, -0.06); B(0.046, 0.04, 0.18, 'mid', 0, -0.005, -0.04);
    B(0.044, 0.14, 0.06, 'rubber', 0, -0.08, 0.04, -0.22); B(0.012, 0.03, 0.05, 'dark', 0, -0.03, -0.02); // trigger guard
    B(0.012, 0.012, 0.012, 'lens', 0, 0.068, -0.15); B(0.03, 0.012, 0.012, 'dark', 0, 0.068, 0.04); // sights
    out.muzzle.set(0, 0.035, -0.18); out.rest.set(0.15, -0.15, -0.42); out.ads.set(0, -0.1, -0.4);
  } else if (id === 'knife') {
    // Balisong rig. root = your hand. spinner turns the blade about the pivot pins.
    // Handle "safe" (A) stays in your hand; the blade and handle "bite" (B) swing round it.
    const spinner = new THREE.Group(); g.add(spinner);
    const steel = kit.mat('steel'), edgeMat = kit.mat('edge');
    const extrude = (shape, depth, bevel = 0.0015) => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
      geo.translate(0, 0, -depth / 2);
      return geo;
    };
    // spear-point blade, drawn with the tip pointing +x, then turned to point forward (-z)
    const bs = new THREE.Shape();
    bs.moveTo(-0.018, -0.011); bs.lineTo(0.118, -0.012); bs.quadraticCurveTo(0.15, -0.009, 0.172, 0.001);
    bs.quadraticCurveTo(0.15, 0.009, 0.122, 0.0125); bs.lineTo(0.012, 0.0125); bs.quadraticCurveTo(0.004, 0.0125, 0.0, 0.009);
    bs.lineTo(-0.018, 0.011); bs.lineTo(-0.018, -0.011);
    const blade = kit.edge(new THREE.Mesh(extrude(bs, 0.0035, 0.001), steel)); blade.rotation.y = Math.PI / 2; spinner.add(blade);
    // the sharpened edge: a thin bright strip along the bottom
    const es = new THREE.Shape(); es.moveTo(0.005, -0.0118); es.lineTo(0.118, -0.0122); es.quadraticCurveTo(0.15, -0.0094, 0.17, 0.0); es.lineTo(0.15, -0.0062); es.lineTo(0.005, -0.0075);
    const edge = new THREE.Mesh(extrude(es, 0.0056, 0.0004), edgeMat); edge.rotation.y = Math.PI / 2; spinner.add(edge);
    // two pivot pins through the tang
    for (const y of [0.0075, -0.0075]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.032, 10), kit.mat('mid')); pin.rotation.z = Math.PI / 2; pin.position.set(0, y, 0.012); spinner.add(pin); }
    // skeletonised channel handles with three cut-outs
    const hs = new THREE.Shape();
    const L = 0.148, Hh = 0.026, r = 0.006;
    hs.moveTo(r, -Hh / 2); hs.lineTo(L - r, -Hh / 2); hs.quadraticCurveTo(L, -Hh / 2, L, -Hh / 2 + r); hs.lineTo(L, Hh / 2 - r);
    hs.quadraticCurveTo(L, Hh / 2, L - r, Hh / 2); hs.lineTo(r, Hh / 2); hs.quadraticCurveTo(0, Hh / 2, 0, Hh / 2 - r); hs.lineTo(0, -Hh / 2 + r); hs.quadraticCurveTo(0, -Hh / 2, r, -Hh / 2);
    for (const cx of [0.042, 0.078, 0.114]) {
      const hole = new THREE.Path(); const hw = 0.013, hh = 0.0055;
      hole.moveTo(cx - hw, -hh); hole.lineTo(cx + hw, -hh); hole.quadraticCurveTo(cx + hw + hh, 0, cx + hw, hh); hole.lineTo(cx - hw, hh); hole.quadraticCurveTo(cx - hw - hh, 0, cx - hw, -hh);
      hs.holes.push(hole);
    }
    const handleGeo = extrude(hs, 0.0075);
    const handle = (side, y, matName) => {
      const pivot = new THREE.Group(); pivot.position.set(0, y, 0.012); spinner.add(pivot);
      const h = kit.edge(new THREE.Mesh(handleGeo, kit.mat(matName))); h.rotation.y = -Math.PI / 2; h.position.set(side * 0.0068, -y, -0.006); pivot.add(h);
      return pivot;
    };
    const safe = handle(1, -0.0075, 'handle'), bite = handle(-1, 0.0075, 'handle2');
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.03), kit.mat('mid')); latch.position.set(-0.0068, -0.008, 0.132); bite.add(latch);

    // gloved hand wrapped round the safe handle (it never leaves your hand)
    const glove = kit.mat('glove'), hand = new THREE.Group(); g.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.064, 0.1), glove); palm.position.set(0.026, -0.012, 0.09); palm.rotation.z = 0.15; hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.05, 8), glove);
      finger.rotation.set(0, 0, Math.PI / 2 - 0.25); finger.position.set(-0.004, -0.027 + i * 0.001, 0.052 + i * 0.023); hand.add(finger);
      const tipK = new THREE.Mesh(new THREE.SphereGeometry(0.0098, 8, 6), glove); tipK.position.set(-0.026, -0.02, 0.052 + i * 0.023); hand.add(tipK);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0085, 0.05, 8), glove); thumb.rotation.set(0.9, 0, 0.5); thumb.position.set(0.014, 0.022, 0.05); hand.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.06, 12), kit.mat('rubber')); cuff.rotation.x = Math.PI / 2; cuff.position.set(0.03, -0.016, 0.17); hand.add(cuff);

    out.spinner = spinner; out.handles = [safe, bite];
    out.base = new THREE.Euler(-0.15, 0.3, 0.35); // how the knife sits in the hand at rest
    g.rotation.copy(out.base);
    out.muzzle.set(0, 0, -0.2); out.rest.set(0.1, -0.115, -0.29); out.ads = out.rest.clone();
  }
  g.traverse((m) => { m.raycast = () => {}; m.castShadow = false; });
  return out;
}
