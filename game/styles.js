// Visual styles for PHANTOM FUSION. Pick one with ?style=tactical | clean | night | neon (default: halloween)
import * as THREE from 'three';

export const STYLES = {
  // E. Halloween night (default): the room after dark. Moonlight, fog, dead ceiling lights,
  //    jack-o'-lanterns and candles, cobwebs, will-o'-wisps, and your own flashlight.
  halloween: {
    label: 'Halloween Night',
    realistic: true, ceiling: true, dark: true,
    sky: ['#05030a', '#140b22'], hemi: ['#4a3a78', '#0c0606', 0.28], sun: ['#7d8fd8', 0.5],
    fog: '#0b0712', fogNear: 3, fogFar: 1.3,
    outline: null, outlineMul: 0,
    bloom: { strength: 0.55, radius: 0.5, threshold: 0.95 }, // only flames, faces and wisps glow, not lit surfaces
    eyes: 'dark', eyeGlow: '#ffffff', tracer: '#ffb35a', burst: '#ff8a2a', stripeGlow: 0,
    floorGrid: 0, labels: false, ghostGlow: 0.3,
  },
  // D. Tactical: realistic-looking indoor room, human enemies, CS-style HUD (default)
  tactical: {
    label: 'Tactical',
    realistic: true, ceiling: true,
    sky: ['#9aa6ae', '#d9dee2'], hemi: ['#ffffff', '#6e665c', 0.45], sun: ['#fff8ee', 1.1],
    fog: '#c4c9cd', fogNear: 22, fogFar: 3.5,
    outline: null, outlineMul: 0,
    bloom: { strength: 0.18, radius: 0.3, threshold: 1.0 },
    eyes: 'dark', eyeGlow: '#ffffff', tracer: '#ffd9a0', burst: '#8a8f96', stripeGlow: 0,
    floorGrid: 0, labels: false,
  },
  // A. Valorant Clean: bright warm dusk, crisp ink outlines, light glow
  clean: {
    label: 'Valorant Clean',
    sky: ['#3a6186', '#ffc59a'], hemi: ['#ffffff', '#7a6aa8', 1.5], sun: ['#fff1dc', 2.0],
    fog: '#e3b7b0', fogNear: 18, fogFar: 2.8,
    outline: '#1a1424', outlineMul: 1.4,
    bloom: { strength: 0.45, radius: 0.35, threshold: 1.0 },
    eyes: 'dark', eyeGlow: '#3ef2e0', tracer: '#ffe066', burst: '#3ef2e0', stripeGlow: 1.6,
    floorGrid: 0.22, labels: true,
  },
  // B. Anime Night: moon, stars, paper lanterns, fireflies, petal deaths
  night: {
    label: 'Anime Night',
    sky: ['#040716', '#232a6b'], hemi: ['#9fb4ff', '#120d2a', 0.85], sun: ['#c4d4ff', 1.2],
    fog: '#151a45', fogNear: 9, fogFar: 2.2,
    outline: '#06061a', outlineMul: 1.1,
    bloom: { strength: 0.7, radius: 0.5, threshold: 0.8 },
    eyes: 'glow', eyeGlow: '#ffd27a', tracer: '#ffd27a', burst: '#ff9ec7', petals: true, stripeGlow: 0.9,
    floorGrid: 0.08, labels: true,
  },
  // C. Neon Cyber-Haunt: dark world, glowing neon edges, hologram ghosts
  neon: {
    label: 'Neon Cyber-Haunt',
    sky: ['#000000', '#16002e'], hemi: ['#6a4cff', '#000000', 0.45], sun: ['#3ef2e0', 0.35],
    fog: '#07000f', fogNear: 7, fogFar: 2.2,
    outline: null, outlineMul: 0,
    bloom: { strength: 0.9, radius: 0.45, threshold: 0.55 },
    eyes: 'glow', eyeGlow: '#ff2bd6', tracer: '#3ef2e0', burst: '#ff2bd6', neon: true, stripeGlow: 1.3,
    floorGrid: 0.35, labels: true, scanlines: true,
  },
};

export function pickStyle() {
  const q = new URLSearchParams(location.search).get('style');
  return STYLES[q] ? q : 'halloween';
}

// HDR colour: values above 1 make bloom pick it up
export const glow = (hex, k = 2.5) => new THREE.Color(hex).multiplyScalar(k);

function dotTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(0.35, inner); r.addColorStop(1, outer);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function points(count, place, color, size, opacity = 1) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) place(pos, i * 3, i);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, map: dotTexture(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const p = new THREE.Points(geo, mat); p.raycast = () => {}; return p;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY); t.anisotropy = 8;
  return t;
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }
function speckle(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}
// floor tiles, 1 texture tile = 1 metre
export function floorTexture(hex, W, D) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = shade(hex, 0.94 + Math.random() * 0.1); g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
    }
    speckle(g, w, h, 900, 0.05);
    g.strokeStyle = shade(hex, 0.7); g.lineWidth = 3;
    for (const v of [0, 128, 256]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
  }, W, D);
}
// wall: painted upper part, darker skirting band near the floor
export function wallTexture(hex, length, height) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, 0.035);
    const skirt = h * (1 - 0.15 / height);
    g.fillStyle = shade(hex, 0.55); g.fillRect(0, skirt, w, h - skirt);
    const rail = h * (1 - 1.0 / height);
    g.fillStyle = shade(hex, 0.85); g.fillRect(0, rail, w, 6);
  }, Math.max(1, Math.round(length / 4)), 1);
}
export function ceilingTexture(W, D, dark = false) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = dark ? '#5b5650' : '#e9e7e2'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, dark ? 0.12 : 0.06);
    if (dark) for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(40,30,20,${0.15 + Math.random() * 0.2})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 40, 0, 7); g.fill(); } // water stains
    g.strokeStyle = dark ? '#3e3a35' : '#b9b6ae'; g.lineWidth = 4;
    for (const v of [0, 128, 256]) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, h); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(w, v); g.stroke(); }
  }, W / 1.2, D / 1.2);
}
// subtle surface grain for furniture blocks
let grainTex = null;
export function grainTexture() {
  if (!grainTex) grainTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); speckle(g, w, h, 700, 0.06); });
  return grainTex;
}

// Adds style-only decoration to the world. Returns an update(dt, t) function.
export function decorate(styleName, world, lv) {
  const S = STYLES[styleName];
  const { width: W, depth: D, height: H } = lv.size;
  const updates = [];

  if (styleName === 'tactical' || styleName === 'halloween') {
    const spooky = styleName === 'halloween';
    // ceiling with fluorescent light panels
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: ceilingTexture(W, D, spooky), roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; ceil.raycast = () => {};
    world.add(ceil);
    const panelMat = new THREE.MeshBasicMaterial({ color: glow('#f4f8ff', 1.25) });
    const deadMat = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6 });
    const buzzMat = new THREE.MeshBasicMaterial({ color: glow('#c9d4ff', 1.1) });
    const lights = [];
    const nx = Math.max(2, Math.round(W / 5)), nz = Math.max(2, Math.round(D / 5));
    const panelGeo = new THREE.BoxGeometry(1.2, 0.04, 0.3);
    const buzzing = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = ((i + 0.5) / nx - 0.5) * W, z = ((j + 0.5) / nz - 0.5) * D;
      const alive = !spooky || (i * 7 + j * 3) % 4 === 0; // after dark, only a few still work
      const panel = new THREE.Mesh(panelGeo, alive ? (spooky ? buzzMat.clone() : panelMat) : deadMat);
      panel.position.set(x, H - 0.02, z); panel.raycast = () => {};
      world.add(panel);
      if (spooky && alive) buzzing.push(panel);
    }
    // real lights spread evenly over the whole ceiling (big floor plans included)
    const lx = Math.min(spooky ? 2 : 3, nx), lz = Math.max(1, Math.min(2, nz));
    for (let i = 0; i < lx; i++) for (let j = 0; j < lz; j++) {
      const l = new THREE.PointLight(spooky ? '#aab8ff' : '#fff6e6', spooky ? 2.2 : 9, Math.max(W / lx, D / lz) * (spooky ? 1.1 : 1.6), 1.6);
      l.position.set(((i + 0.5) / lx - 0.5) * W, H - 0.3, ((j + 0.5) / lz - 0.5) * D); world.add(l); lights.push(l);
    }
    if (spooky) {
      // dying fluorescent tubes: long dark spells, a stutter, a moment of light
      updates.push((dt, t) => {
        lights.forEach((l, k) => {
          const n = Math.sin(t * (3.1 + k)) + Math.sin(t * (7.7 + k * 1.3)) * 0.6 + Math.sin(t * 23 + k) * 0.3;
          l.intensity = n > 1.1 ? 2.6 : n > 0.7 ? 0.8 : 0.12;
        });
        buzzing.forEach((p, k) => { p.visible = Math.sin(t * (2.3 + k * 0.7)) + Math.sin(t * (13 + k)) * 0.4 > -0.2; });
      });
      decorateHalloween(world, lv, updates);
    } else {
      // one flickering light: something is wrong in here
      const flick = lights[lights.length - 1];
      updates.push((dt, t) => { if (flick) flick.intensity = Math.sin(t * 23) > 0.92 || Math.sin(t * 3.1) > 0.97 ? 1 : 9; });
    }
  }

  if (styleName === 'clean') {
    // soft floating dust in the light
    const dust = points(90, (a, i) => { a[i] = (Math.random() - 0.5) * W; a[i + 1] = Math.random() * H; a[i + 2] = (Math.random() - 0.5) * D; }, '#fff4e0', 0.06, 0.6);
    world.add(dust);
    const base = dust.geometry.attributes.position.array.slice();
    updates.push((dt, t) => {
      const a = dust.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) { a[i + 1] = (base[i + 1] + t * 0.15) % H; a[i] = base[i] + Math.sin(t * 0.5 + i) * 0.2; }
      dust.geometry.attributes.position.needsUpdate = true;
    });
    // big soft sun
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,236,200,1)'), color: glow('#fff0d0', 1.6), fog: false, depthWrite: false }));
    sun.position.set(W * 2, 18, -D * 3); sun.scale.setScalar(18); world.add(sun);
  }

  if (styleName === 'night') {
    // stars on a dome
    const stars = points(700, (a, i) => {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45, r = 90;
      a[i] = Math.cos(th) * Math.sin(ph) * r; a[i + 1] = Math.cos(ph) * r * 0.6 + 6; a[i + 2] = Math.sin(th) * Math.sin(ph) * r;
    }, glow('#dfe8ff', 1.6), 0.9);
    world.add(stars);
    // the moon
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,250,230,1)', 'rgba(255,240,200,0)'), color: glow('#fff6dc', 1.25), fog: false, depthWrite: false }));
    moon.position.set(-W * 1.6, 26, -D * 3.2); moon.scale.setScalar(10); world.add(moon);
    // paper lanterns floating above the arena
    const lanternMat = new THREE.MeshBasicMaterial({ color: glow('#ff8a3d', 1.6) });
    const capMat = new THREE.MeshBasicMaterial({ color: '#3a1a0a' });
    const lanterns = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 12), lanternMat);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.06, 12), capMat); top.position.y = 0.24;
      const bot = top.clone(); bot.position.y = -0.24; bot.rotation.x = Math.PI;
      g.add(body, top, bot);
      g.traverse((m) => { m.raycast = () => {}; });
      g.position.set((Math.random() - 0.5) * (W - 2), H * 0.75 + Math.random() * 1.5, (Math.random() - 0.5) * (D - 2));
      g.userData.y = g.position.y; g.userData.p = Math.random() * 6;
      world.add(g); lanterns.push(g);
    }
    const warm = new THREE.PointLight('#ff9a4d', 3, W, 1.5); warm.position.set(0, H, 0); world.add(warm);
    // fireflies
    const flies = points(160, (a, i) => { a[i] = (Math.random() - 0.5) * W; a[i + 1] = 0.3 + Math.random() * 2.5; a[i + 2] = (Math.random() - 0.5) * D; }, glow('#e8ff9a', 2), 0.07);
    world.add(flies);
    const base = flies.geometry.attributes.position.array.slice();
    updates.push((dt, t) => {
      for (const l of lanterns) { l.position.y = l.userData.y + Math.sin(t * 0.8 + l.userData.p) * 0.25; l.rotation.y += dt * 0.3; }
      const a = flies.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] = base[i] + Math.sin(t * 0.7 + i) * 0.6; a[i + 1] = base[i + 1] + Math.sin(t * 1.3 + i * 0.5) * 0.3; a[i + 2] = base[i + 2] + Math.cos(t * 0.6 + i) * 0.6;
      }
      flies.geometry.attributes.position.needsUpdate = true;
      flies.material.opacity = 0.75 + Math.sin(t * 3) * 0.25;
    });
  }

  if (styleName === 'neon') {
    // drifting data particles + a horizon glow ring
    const bits = points(220, (a, i) => { a[i] = (Math.random() - 0.5) * W; a[i + 1] = Math.random() * H * 1.4; a[i + 2] = (Math.random() - 0.5) * D; }, glow('#3ef2e0', 1.4), 0.05);
    world.add(bits);
    const base = bits.geometry.attributes.position.array.slice();
    updates.push((dt, t) => {
      const a = bits.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) a[i + 1] = (base[i + 1] + t * 0.6) % (H * 1.4);
      bits.geometry.attributes.position.needsUpdate = true;
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(W, D) * 1.4, 0.15, 6, 80), new THREE.MeshBasicMaterial({ color: glow('#ff2bd6', 2), fog: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; ring.raycast = () => {}; world.add(ring);
  }

  if (S.scanlines) document.body.classList.add('scanlines'); else document.body.classList.remove('scanlines');
  return (dt, t) => { for (const u of updates) u(dt, t); };
}

// ---------------------------------------------------------------- halloween night props
function faceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffd36b';
  g.beginPath(); g.moveTo(30, 52); g.lineTo(50, 30); g.lineTo(58, 56); g.fill();       // eyes
  g.beginPath(); g.moveTo(98, 52); g.lineTo(78, 30); g.lineTo(70, 56); g.fill();
  g.beginPath(); g.moveTo(58, 66); g.lineTo(64, 56); g.lineTo(70, 66); g.fill();       // nose
  g.beginPath(); g.moveTo(26, 76); g.quadraticCurveTo(64, 112, 102, 76);              // grin with teeth
  g.lineTo(90, 82); g.lineTo(84, 74); g.lineTo(74, 86); g.lineTo(64, 76); g.lineTo(54, 86); g.lineTo(44, 74); g.lineTo(38, 82); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function webTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.strokeStyle = 'rgba(235,235,245,0.55)'; g.lineWidth = 1.4;
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); g.stroke(); }
  for (let r = 30; r < 256; r += 30 + r * 0.08) {
    g.beginPath();
    for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2, rr = r * (0.92 + 0.08 * Math.sin(k * 2)); k ? g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.93, Math.sin(a - 0.1) * rr * 0.93, Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function decorateHalloween(world, lv, updates) {
  const { width: W, depth: D, height: H } = lv.size;
  // spots on top of furniture (always inside the room), else on open floor away from the player's start
  const tops = [];
  for (const o of lv.objects || []) {
    if (!['desk', 'table', 'cabinet', 'shelf'].includes(o.type) || o.wall) continue;
    const [x, z] = o.at || [(o.pos[0] - 0.5) * (W - 1.5), (o.pos[1] - 0.5) * (D - 1.5)];
    tops.push([x + (Math.random() - 0.5) * o.size[0] * 0.5, (o.elevation || 0) + o.size[1], z]);
  }
  tops.sort(() => Math.random() - 0.5);
  while (tops.length < 6) tops.push([(Math.random() - 0.5) * (W - 3), 0, (Math.random() - 0.5) * (D - 3) - 1.5]);

  // jack-o'-lanterns with candlelight
  const face = faceTexture();
  const pumpkinMat = new THREE.MeshStandardMaterial({ color: '#d4560c', roughness: 0.65, emissive: '#3a1200', emissiveIntensity: 0.6 });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#3d5a1f', roughness: 0.8 });
  const faceMat = new THREE.MeshBasicMaterial({ map: face, color: glow('#ffb347', 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [];
  tops.slice(0, 7).forEach(([x, y, z], k) => {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = Math.random() * Math.PI * 2;
    const s = 0.75 + Math.random() * 0.5;
    for (let r = 0; r < 6; r++) { // ribbed body
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), pumpkinMat);
      lobe.scale.set(0.62, 0.82, 1); lobe.position.set(Math.cos(r / 6 * Math.PI * 2) * 0.06, 0.13, Math.sin(r / 6 * Math.PI * 2) * 0.06); lobe.rotation.y = r / 6 * Math.PI * 2; p.add(lobe);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 6), stemMat); stem.position.y = 0.28; stem.rotation.z = 0.25; p.add(stem);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), faceMat); f.position.set(0, 0.13, 0.215); p.add(f);
    p.scale.setScalar(s);
    p.traverse((m) => { m.raycast = () => {}; });
    world.add(p);
    if (k < 4) { // the first few cast real light (keeps the light count sensible)
      const l = new THREE.PointLight('#ff8a2a', 1.8, 5, 1.6); l.position.set(x, y + 0.3 * s, z); world.add(l);
      flames.push({ l, base: 1.8, p: Math.random() * 10 });
    }
    // two candles beside it
    for (let c = 0; c < 2; c++) {
      const cx = x + (c ? 0.22 : -0.2) * s, cz = z + 0.12 * (c ? -1 : 1), hgt = 0.08 + Math.random() * 0.08;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, hgt, 8), new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.9 }));
      candle.position.set(cx, y + hgt / 2, cz); candle.raycast = () => {}; world.add(candle);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture('rgba(255,220,140,1)'), color: glow('#ffb347', 2.5), blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.scale.set(0.05, 0.08, 1); flame.position.set(cx, y + hgt + 0.035, cz); world.add(flame);
      flames.push({ sprite: flame, p: Math.random() * 10 });
    }
  });
  updates.push((dt, t) => {
    for (const f of flames) {
      const n = 0.82 + Math.sin(t * 11 + f.p) * 0.1 + Math.sin(t * 23 + f.p * 2) * 0.08;
      if (f.l) f.l.intensity = f.base * n;
      if (f.sprite) f.sprite.scale.set(0.05 * n, 0.085 * (0.9 + 0.2 * Math.sin(t * 17 + f.p)), 1);
    }
  });

  // cobwebs in the ceiling corners
  const web = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.85 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), web);
    m.position.set(sx * (W / 2 - 0.82), H - 0.82, sz * (D / 2 - 0.82));
    m.lookAt(0, H - 0.82, 0); m.rotation.z = sx * sz > 0 ? 0 : Math.PI / 2; m.raycast = () => {};
    world.add(m);
  }

  // will-o'-wisps: slow ghostly lights drifting through the room
  const wisps = points(60, (a, i) => { a[i] = (Math.random() - 0.5) * W; a[i + 1] = 0.4 + Math.random() * (H - 0.8); a[i + 2] = (Math.random() - 0.5) * D; }, glow('#8dffb0', 1.6), 0.09, 0.9);
  world.add(wisps);
  const base = wisps.geometry.attributes.position.array.slice();
  updates.push((dt, t) => {
    const a = wisps.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] = base[i] + Math.sin(t * 0.3 + i) * 0.8; a[i + 1] = base[i + 1] + Math.sin(t * 0.5 + i * 0.7) * 0.25; a[i + 2] = base[i + 2] + Math.cos(t * 0.25 + i) * 0.8;
    }
    wisps.geometry.attributes.position.needsUpdate = true;
    wisps.material.opacity = 0.6 + Math.sin(t * 1.7) * 0.25;
  });

  // low mist hugging the floor
  const mistMat = new THREE.SpriteMaterial({ map: dotTexture('rgba(180,170,220,0.5)'), color: '#6a6290', transparent: true, opacity: 0.18, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Sprite(mistMat); m.scale.set(4 + Math.random() * 3, 0.9, 1);
    m.position.set((Math.random() - 0.5) * W, 0.25, (Math.random() - 0.5) * D); m.userData.x = m.position.x; m.userData.p = Math.random() * 6;
    world.add(m); mist.push(m);
  }
  updates.push((dt, t) => { for (const m of mist) m.position.x = m.userData.x + Math.sin(t * 0.12 + m.userData.p) * 1.2; });
}
