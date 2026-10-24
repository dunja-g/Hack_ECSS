// PHANTOM FUSION
// A photo becomes an arena (Gemma 4 writes the level JSON), and the ghosts
// hide inside the real objects it found. Anime-style tactical shooter in Three.js.

import * as THREE from 'three';
import { PointerLockControls } from './vendor/PointerLockControls.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { STYLES, pickStyle, decorate, glow, floorTexture, wallTexture, grainTexture } from './styles.js';

const STYLE = pickStyle();
const ST = STYLES[STYLE];

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const HEX = /^#[0-9a-fA-F]{6}$/;

// ======================================================================
// LEVEL CLEANUP (same rules as server/server.py, for pasted or linked JSON)
// ======================================================================
function num(v, d, lo, hi) { const n = Number(v); return clamp(Number.isFinite(n) ? n : d, lo, hi); }
function hex(v, d) { return typeof v === 'string' && HEX.test(v) ? v : d; }

function cleanLevel(data) {
  if (!data || typeof data !== 'object') throw new Error('Level is not a JSON object');
  const s = data.size || {}, p = data.palette || {};
  const level = {
    room_name: String(data.room_name || 'Unnamed Haunt').slice(0, 60),
    vibe: String(data.vibe || 'Something stirs in the shadows.').slice(0, 200),
    size: { width: num(s.width, 16, 10, 30), depth: num(s.depth, 16, 10, 30), height: num(s.height, 5, 3, 8) },
    palette: {
      floor: hex(p.floor, '#3b3355'), walls: hex(p.walls, '#5a4b8a'),
      accent: hex(p.accent, '#ff4d8d'), fog: hex(p.fog, '#1a1430'),
    },
    lighting: ['day', 'dusk', 'night', 'neon'].includes(data.lighting) ? data.lighting : 'night',
    boss_line: String(data.boss_line || 'You should not have opened this door...').slice(0, 140),
    objects: [],
  };
  const names = ['Kurayami', 'Hollowmi', 'Shirei', 'Yurei-X', 'Onibi', 'Bakeneko-chan'];
  for (const o of (Array.isArray(data.objects) ? data.objects : []).slice(0, 12)) {
    if (!o || typeof o !== 'object') continue;
    const pos = Array.isArray(o.pos) && o.pos.length >= 2 ? o.pos : [0.5, 0.5];
    const sz = Array.isArray(o.size) && o.size.length >= 3 ? o.size : [1, 1, 1];
    let x = num(pos[0], 0.5, 0.05, 0.95), z = num(pos[1], 0.5, 0.05, 0.95);
    if (Math.abs(x - 0.5) < 0.15 && z > 0.78) z = 0.7;
    const c = {
      name: String(o.name || 'thing').slice(0, 40),
      shape: ['box', 'cylinder', 'sphere'].includes(o.shape) ? o.shape : 'box',
      pos: [x, z],
      size: [num(sz[0], 1, 0.2, 4), num(sz[1], 1, 0.2, 4), num(sz[2], 1, 0.2, 4)],
      color: hex(o.color, '#8a7bd8'),
      elevation: num(o.elevation, 0, 0, 2.5),
      haunted: !!o.haunted,
    };
    if (c.haunted) {
      const g = o.ghost || {};
      c.ghost = {
        name: String(g.name || names[level.objects.length % names.length]).slice(0, 30),
        personality: String(g.personality || 'restless and grumpy').slice(0, 100),
        hp: num(g.hp, 100, 60, 200), speed: num(g.speed, 2.5, 1, 4),
      };
    }
    level.objects.push(c);
  }
  if (!level.objects.length) throw new Error('Level has no objects');
  let haunted = level.objects.filter((o) => o.haunted).length;
  for (const o of [...level.objects].sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2])) {
    if (haunted >= 2) break;
    if (!o.haunted) {
      o.haunted = true;
      o.ghost = { name: names[haunted], personality: `the restless spirit of the ${o.name}`, hp: 100, speed: 2.5 };
      haunted++;
    }
  }
  return level;
}

function parseLevelText(text) {
  text = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('No JSON object found');
  return cleanLevel(JSON.parse(text.slice(a, b + 1)));
}

// ======================================================================
// AUDIO (tiny synth, no files needed)
// ======================================================================
let actx = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function blip({ freq = 440, to = null, dur = 0.1, type = 'sine', vol = 0.2, noise = false }) {
  try {
    const ctx = audio(), t = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let src;
    if (noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
      src.connect(f); f.connect(g);
    } else {
      src = ctx.createOscillator(); src.type = type; src.frequency.setValueAtTime(freq, t);
      if (to) src.frequency.exponentialRampToValueAtTime(to, t + dur);
      src.connect(g);
    }
    g.connect(ctx.destination); src.start(t); src.stop(t + dur);
  } catch { /* audio is optional */ }
}
const sfx = {
  shot: () => blip({ noise: true, freq: 1400, dur: 0.09, vol: 0.35 }),
  hit: () => blip({ freq: 900, dur: 0.05, type: 'square', vol: 0.08 }),
  head: () => blip({ freq: 1800, to: 2400, dur: 0.12, type: 'triangle', vol: 0.18 }),
  kill: () => blip({ freq: 700, to: 90, dur: 0.45, type: 'sawtooth', vol: 0.12 }),
  hurt: () => blip({ freq: 120, to: 60, dur: 0.2, type: 'square', vol: 0.2 }),
  enemyShot: () => blip({ noise: true, freq: 800, dur: 0.07, vol: 0.16 }),
  reload: () => blip({ freq: 300, to: 600, dur: 0.15, type: 'triangle', vol: 0.1 }),
  dash: () => blip({ noise: true, freq: 500, dur: 0.2, vol: 0.2 }),
  spawn: () => blip({ freq: 220, to: 880, dur: 0.5, type: 'sine', vol: 0.12 }),
};

// ======================================================================
// RENDERER + SCENE
// ======================================================================
const canvas = $('view');
// Add ?lowfx to the URL on a slow laptop: no shadows, lower resolution.
const LOWFX = new URLSearchParams(location.search).has('lowfx');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWFX });
renderer.setPixelRatio(LOWFX ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (ST.realistic) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; }
document.body.classList.add('style-' + STYLE);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);
const controls = new PointerLockControls(camera, document.body);

// Bloom (glow) post-processing. Turned off in ?lowfx mode.
let composer = null;
if (!LOWFX) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), ST.bloom.strength, ST.bloom.radius, ST.bloom.threshold));
  composer.addPass(new OutputPass());
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// Cel-shading: 3 hard light bands, plus black "inverted hull" outlines.
const gradientMap = (() => {
  const tex = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();
const toon = (color, extra = {}) => ST.realistic
  ? new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, ...extra })
  : new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
const outlineMat = new THREE.MeshBasicMaterial({ color: ST.outline || 0x000000, side: THREE.BackSide });
function outline(mesh, thickness = 0.04) {
  if (!ST.outline) return mesh;
  thickness *= ST.outlineMul;
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(1 + thickness);
  o.raycast = () => {}; // outlines never block bullets
  mesh.add(o);
  return mesh;
}

function skyTexture(top, bottom) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textSprite(lines, { width = 512, height = 128, scale = 1.6 } = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(scale, scale * height / width, 1);
  sprite.raycast = () => {};
  sprite.userData.draw = (fn) => { const g = c.getContext('2d'); g.clearRect(0, 0, width, height); fn(g, width, height); tex.needsUpdate = true; };
  if (lines) sprite.userData.draw((g, w) => {
    g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 8; g.strokeStyle = '#120d1f'; g.strokeText(lines, w / 2, 70);
    g.fillStyle = '#ffffff'; g.fillText(lines, w / 2, 70);
  });
  return sprite;
}

const LIGHTS = {
  day:   { sky: ['#8fd3ff', '#ffd6e8'], hemi: ['#ffffff', '#8877aa', 1.5], sun: ['#fff1d6', 2.2], fogMul: 1.0 },
  dusk:  { sky: ['#5b3a8e', '#ff9a6b'], hemi: ['#ffc9a8', '#3b2a55', 1.2], sun: ['#ffb36b', 2.0], fogMul: 0.9 },
  night: { sky: ['#070a1f', '#3a2466'], hemi: ['#8fa8ff', '#1a1030', 0.9], sun: ['#a9b8ff', 1.3], fogMul: 0.7 },
  neon:  { sky: ['#0a0220', '#5a0f6e'], hemi: ['#ff7eff', '#00303a', 1.0], sun: ['#7af7ff', 1.4], fogMul: 0.7 },
};

// ======================================================================
// WORLD BUILDING
// ======================================================================
let world = null;      // THREE.Group with everything level-specific
let level = null;
let solids = [];       // { box: THREE.Box3, mesh } for collisions and bullet blocking
let haunts = [];       // haunted objects: { obj, mesh, light, shake }
let half = { x: 8, z: 8 };

function buildWorld(lv) {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world);
  solids = []; haunts = [];
  const { width: W, depth: D, height: H } = lv.size;
  half = { x: W / 2, z: D / 2 };
  const L = ST; // the visual style decides sky and light; the level decides colours and layout

  scene.background = skyTexture(L.sky[0], L.sky[1]);
  scene.fog = new THREE.Fog(L.fog, L.fogNear, Math.max(W, D) * L.fogFar);
  world.add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
  const sun = new THREE.DirectionalLight(L.sun[0], L.sun[1]);
  sun.position.set(W * 0.3, 14, D * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -W, right: W, top: D, bottom: -D, far: 50 });
  world.add(sun);

  // floor with a training-range grid
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ST.realistic ? new THREE.MeshStandardMaterial({ map: floorTexture(lv.palette.floor, W, D), roughness: 0.6 }) : toon(ST.neon ? '#05030c' : lv.palette.floor));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.solid = true;
  world.add(floor);
  solids.push({ box: new THREE.Box3().setFromObject(floor), mesh: floor });
  const grid = new THREE.GridHelper(Math.max(W, D), Math.max(W, D), lv.palette.accent, lv.palette.accent);
  grid.material.transparent = true; grid.material.opacity = ST.floorGrid;
  if (ST.neon) grid.material.color = glow(lv.palette.accent, 1.1); grid.position.y = 0.01; grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
  grid.raycast = () => {};
  world.add(grid);

  // walls (open roof so the anime sky shows)
  const wallMat = toon(ST.neon ? '#0a0716' : lv.palette.walls);
  const stripeMat = toon(lv.palette.accent, { emissive: lv.palette.accent, emissiveIntensity: LOWFX ? 0.6 : ST.stripeGlow });
  const T = 0.4;
  for (const [x, z, w, d] of [[0, -D / 2, W + T, T], [0, D / 2, W + T, T], [-W / 2, 0, T, D], [W / 2, 0, T, D]]) {
    const wall = outline(new THREE.Mesh(new THREE.BoxGeometry(w, H, d), ST.realistic ? new THREE.MeshStandardMaterial({ map: wallTexture(lv.palette.walls, Math.max(w, d), H), roughness: 0.9 }) : wallMat), 0.01);
    wall.position.set(x, H / 2, z); wall.castShadow = wall.receiveShadow = true;
    if (ST.neon) neonEdges(wall, lv.palette.accent, 1.1);
    world.add(wall); solids.push({ box: new THREE.Box3().setFromObject(wall), mesh: wall });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), stripeMat);
    stripe.position.set(x, 1.0, z); stripe.raycast = () => {};
    if (!ST.realistic) world.add(stripe);
  }

  // objects from the photo
  for (const o of lv.objects) {
    const [w, h, d] = o.size;
    let geo;
    if (o.shape === 'cylinder') geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 20);
    else if (o.shape === 'sphere') geo = new THREE.SphereGeometry(0.5, 20, 14);
    else geo = new THREE.BoxGeometry(w, h, d);
    const mat = ST.neon ? toon('#0c0a1c')
      : ST.realistic ? new THREE.MeshStandardMaterial({ color: o.color, map: grainTexture(), roughness: 0.7, metalness: 0.1 })
      : toon(o.color, o.haunted ? { emissive: '#9b4dff', emissiveIntensity: 0.25 } : {});
    const mesh = outline(new THREE.Mesh(geo, mat), o.shape === 'box' ? 0.03 : 0.05);
    if (ST.neon) neonEdges(mesh, o.haunted ? '#ff2bd6' : o.color, o.haunted ? 2 : 1.4);
    if (o.shape === 'sphere') mesh.scale.set(w, h, d);
    const x = (o.pos[0] - 0.5) * (W - 1.5), z = (o.pos[1] - 0.5) * (D - 1.5);
    mesh.position.set(x, (o.elevation || 0) + h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
    solids.push({ box: new THREE.Box3().setFromObject(mesh), mesh });

    const label = textSprite(o.name, { scale: 2.0 });
    label.position.set(x, h + 0.45, z);
    label.material.opacity = o.haunted ? 1 : 0.55;
    if (ST.labels !== false) world.add(label);

    if (o.haunted) {
      const light = new THREE.PointLight(ST.realistic ? '#cfe0ff' : '#b06bff', 2.5, 5);
      light.position.set(x, h + 0.6, z);
      world.add(light);
      haunts.push({ obj: o, mesh, light, base: mesh.position.clone(), shake: 0 });
    }
  }
  worldUpdate = decorate(STYLE, world, lv);
}

let worldUpdate = () => {};
function neonEdges(mesh, color, k) {
  const c = new THREE.Color(color); c.offsetHSL(0, 0.2, 0.15);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), new THREE.LineBasicMaterial({ color: c.multiplyScalar(LOWFX ? 1 : k) }));
  e.raycast = () => {};
  mesh.add(e);
}

// ======================================================================
// PLAYER + GUN
// ======================================================================
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), hp: 100, onGround: true, dashT: 0, dashCd: 0, dashDir: new THREE.Vector3() };
const EYE = 1.6, RADIUS = 0.35, SPEED = 6, GRAV = 20;
const keys = {};

const gun = new THREE.Group();
(() => {
  const body = outline(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.55), toon('#ece8e1')), 0.06);
  const grip = outline(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.08), toon('#2a2f45')), 0.08);
  grip.position.set(0, -0.12, 0.12); grip.rotation.x = 0.3;
  const barrel = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), toon('#2a2f45')), 0.1);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.4);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.03, 0.4), toon('#ff4655', { emissive: '#ff4655', emissiveIntensity: 0.5 }));
  stripe.position.set(0, 0.03, -0.02);
  if (ST.realistic) {
    const M = (c, r = 0.45, mt = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt });
    const dark = M('#1c1e22'), mid = M('#2c2f35'), rub = M('#121315', 0.85, 0.1);
    const B = (w, h, d, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; gun.add(b); };
    const C = (r, l, m, x, y, z) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), m); c.rotation.x = Math.PI / 2; c.position.set(x, y, z); gun.add(c); };
    B(0.07, 0.11, 0.42, dark, 0, 0, 0);            // receiver
    B(0.078, 0.088, 0.34, mid, 0, -0.005, -0.36);   // handguard
    C(0.014, 0.26, dark, 0, 0.005, -0.64);          // barrel
    C(0.021, 0.07, dark, 0, 0.005, -0.79);          // muzzle
    B(0.05, 0.2, 0.09, rub, 0, -0.15, -0.08, 0.25); // magazine
    B(0.045, 0.14, 0.06, rub, 0, -0.12, 0.13, -0.35); // grip
    B(0.05, 0.1, 0.26, mid, 0, -0.02, 0.34);        // stock
    B(0.03, 0.016, 0.36, dark, 0, 0.062, -0.12);    // rail
    C(0.026, 0.2, dark, 0, 0.1, -0.06);             // scope
    B(0.02, 0.04, 0.02, dark, 0, 0.075, -0.12); B(0.02, 0.04, 0.02, dark, 0, 0.075, 0.0);
  } else gun.add(body, grip, barrel, stripe);
  gun.traverse((m) => { m.raycast = () => {}; });
})();
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: glow('#fff3a0', LOWFX ? 1 : 4) }));
flash.position.set(0, 0.02, -0.58); flash.visible = false; flash.raycast = () => {};
const flashLight = new THREE.PointLight('#ffd27a', 0, 6);
flashLight.position.copy(flash.position);
gun.add(flash, flashLight);
if (ST.realistic) flash.position.set(0, 0.005, -0.84);
const GUN_REST = ST.realistic ? new THREE.Vector3(0.2, -0.21, -0.42) : new THREE.Vector3(0.17, -0.16, -0.36);
gun.position.copy(GUN_REST);
gun.scale.setScalar(ST.realistic ? 0.8 : 0.45);
gun.rotation.y = -0.04;
camera.add(gun);

const weapon = { mag: 30, size: 30, reloadT: 0, fireCd: 0, recoil: 0, shooting: false };

// ======================================================================
// GHOSTS
// ======================================================================
let ghosts = [];
const ghostGeo = new THREE.LatheGeometry(
  [[0, -0.55], [0.42, -0.5], [0.36, -0.3], [0.42, -0.05], [0.4, 0.25], [0.3, 0.45], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
const headGeo = new THREE.SphereGeometry(0.32, 20, 14);
const eyeGeo = new THREE.SphereGeometry(0.06, 10, 8);
const eyeMat = ST.eyes === 'glow' ? new THREE.MeshBasicMaterial({ color: glow(ST.eyeGlow, 3) }) : new THREE.MeshBasicMaterial({ color: '#120d1f' });
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const blushMat = new THREE.MeshBasicMaterial({ color: '#ff7eb6' });
const tailGeo = new THREE.ConeGeometry(0.34, 0.75, 16, 1, true);
const armGeo = new THREE.SphereGeometry(0.11, 10, 8);

function makeSoldier(haunt, { boss = false, hpMul = 1, speedMul = 1 } = {}) {
  const g = haunt.obj.ghost, group = new THREE.Group();
  const S = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05 });
  const uni = S(boss ? '#4a2026' : '#26314c'), vest = S('#2a2c30'), dark = S('#16181c'), band = S(haunt.obj.color);
  uni.emissive = new THREE.Color('#ff2020'); uni.emissiveIntensity = 0;
  const parts = [];
  const B = (w, h, d, m, x, y, z, parent = group) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); parts.push(b); return b; };
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.12 * s, 0.9, 0); group.add(hip); legs.push(hip);
    B(0.18, 0.86, 0.2, uni, 0, -0.43, 0, hip); B(0.2, 0.1, 0.28, dark, 0, -0.86, 0.04, hip);
  }
  const torso = B(0.5, 0.62, 0.28, uni, 0, 1.22, 0);
  B(0.54, 0.44, 0.33, vest, 0, 1.26, 0);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.32 * s, 1.46, 0); sh.rotation.x = -1.25; sh.rotation.z = -0.35 * s; group.add(sh);
    B(0.14, 0.56, 0.16, uni, 0, -0.26, 0, sh); if (s < 0) B(0.15, 0.08, 0.17, band, 0, -0.08, 0, sh);
  }
  B(0.06, 0.09, 0.72, dark, 0.06, 1.34, 0.42);  // rifle
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.06, 1.34, 0.8); group.add(muzzle);
  const head = B(0.26, 0.28, 0.26, S('#1b1e24'), 0, 1.7, 0);
  B(0.31, 0.12, 0.31, S('#20242b'), 0, 1.85, -0.01); // helmet
  B(0.22, 0.06, 0.03, S('#0a0b0d'), 0, 1.73, 0.135); // goggles
  const maxHp = g.hp * hpMul * (boss ? 3 : 1);
  const ghost = { group, body: torso, head, flashMat: uni, legs, soldier: true, name: boss ? `${g.name} (BOSS)` : g.name, hp: maxHp, maxHp,
    speed: g.speed * speedMul * (boss ? 0.8 : 1), boss, state: 'emerging', t: 0, attackCd: 0, scale: boss ? 1.15 : 1, from: haunt, phase: Math.random() * 6.28,
    muzzle, sees: false, losT: 0, aimT: 0, shotCd: 1 + Math.random(), burstLeft: 0 };
  for (const p of parts) { p.userData = { ghost, part: p === head || p.position.y > 1.6 ? 'head' : 'body' }; }
  const tag = textSprite(null, { width: 512, height: 128, scale: 1.4 }); tag.position.y = 2.2; group.add(tag); ghost.tag = tag; drawTag(ghost);
  const hp = haunt.mesh.position, dir = new THREE.Vector3(player.pos.x - hp.x, 0, player.pos.z - hp.z).normalize();
  group.position.set(hp.x + dir.x * (haunt.obj.size[0] / 2 + 0.6), 0, hp.z + dir.z * (haunt.obj.size[2] / 2 + 0.6));
  group.scale.setScalar(0.01); world.add(group); ghosts.push(ghost); burst(group.position.clone().setY(1), 14); sfx.spawn();
  return ghost;
}

function makeGhost(haunt, opts = {}) {
  if (ST.enemy === 'soldier') return makeSoldier(haunt, opts);
  const { boss = false, hpMul = 1, speedMul = 1 } = opts;
  const g = haunt.obj.ghost;
  const tint = new THREE.Color(haunt.obj.color).lerp(new THREE.Color('#ffffff'), 0.65);
  const group = new THREE.Group();
  const mat = ST.neon
    ? new THREE.MeshBasicMaterial({ color: glow(tint.clone().lerp(new THREE.Color('#3ef2e0'), 0.6), 0.75), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
    : toon(tint, { emissive: STYLE === 'night' ? '#6a8cff' : '#7a3cff', emissiveIntensity: STYLE === 'night' ? 0.35 : 0.15, transparent: true, opacity: 0.92 });
  const body = outline(new THREE.Mesh(ghostGeo, mat), 0.05);
  const head = outline(new THREE.Mesh(headGeo, mat), 0.06);
  head.position.y = 0.82;
  // wispy tail and little floating arms
  const tail = outline(new THREE.Mesh(tailGeo, mat), 0.04);
  tail.rotation.x = Math.PI; tail.position.y = -0.85; tail.raycast = () => {};
  const arms = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat); eye.scale.set(0.8, 1.4, 0.5); eye.position.set(0.11 * s, 0.86, 0.28); eye.raycast = () => {};
    const blush = new THREE.Mesh(eyeGeo, blushMat); blush.scale.set(1.2, 0.5, 0.3); blush.position.set(0.19 * s, 0.75, 0.25); blush.raycast = () => {};
    group.add(eye, blush);
    if (ST.eyes !== 'glow') {
      const shine = new THREE.Mesh(eyeGeo, shineMat); shine.scale.setScalar(0.35); shine.position.set(0.11 * s + 0.015, 0.9, 0.31); shine.raycast = () => {};
      group.add(shine);
    }
    const arm = outline(new THREE.Mesh(armGeo, mat), 0.08);
    arm.scale.set(1, 1.6, 1); arm.position.set(0.48 * s, 0.05, 0.05); arm.raycast = () => {};
    group.add(arm); arms.push(arm);
  }
  group.add(body, head, tail);
  const maxHp = g.hp * hpMul * (boss ? 3 : 1);
  const ghost = {
    group, body, head, name: boss ? `${g.name} (BOSS)` : g.name, hp: maxHp, maxHp,
    speed: g.speed * speedMul * (boss ? 0.8 : 1), boss, state: 'emerging', t: 0, attackCd: 0,
    scale: boss ? 1.7 : 1, from: haunt, phase: Math.random() * 6.28, tail, arms,
  };
  body.userData = { ghost, part: 'body' };
  head.userData = { ghost, part: 'head' };
  const tag = textSprite(null, { width: 512, height: 128, scale: boss ? 3.4 : 2.6 });
  tag.position.y = 1.55;
  group.add(tag);
  ghost.tag = tag;
  drawTag(ghost);
  const p = haunt.mesh.position;
  group.position.set(p.x, haunt.obj.size[1], p.z);
  group.scale.setScalar(0.01);
  world.add(group);
  ghosts.push(ghost);
  sfx.spawn();
  return ghost;
}

function drawTag(gh) {
  gh.tag.userData.draw((g, w) => {
    g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center';
    g.lineWidth = 8; g.strokeStyle = '#120d1f'; g.strokeText(gh.name, w / 2, 48);
    g.fillStyle = gh.boss ? '#ff4655' : '#ffffff'; g.fillText(gh.name, w / 2, 48);
    g.fillStyle = '#120d1fcc'; g.fillRect(96, 70, 320, 22);
    g.fillStyle = gh.hp / gh.maxHp > 0.35 ? '#3ef2e0' : '#ff4655';
    g.fillRect(100, 74, 312 * Math.max(0, gh.hp / gh.maxHp), 14);
  });
}

// ======================================================================
// GAME STATE
// ======================================================================
const game = { running: false, paused: false, wave: 0, queue: [], spawnT: 0, betweenT: 0, stats: null, time: 0 };
const WAVES = 3;

function startGame() {
  buildWorld(level);
  ghosts = [];
  player.pos.set(0, 0, half.z - 1.5);
  player.vel.set(0, 0, 0); player.hp = 100; player.dashCd = 0; player.dashT = 0;
  camera.position.set(player.pos.x, EYE, player.pos.z);
  camera.rotation.set(0, 0, 0);
  Object.assign(weapon, { mag: weapon.size, reloadT: 0, fireCd: 0, recoil: 0, shooting: false });
  game.stats = { shots: 0, hits: 0, heads: 0, kills: 0, start: performance.now() };
  game.wave = 0; game.queue = []; game.betweenT = 1.5; game.running = true; game.paused = false; game.time = 0;
  $('room-tag').textContent = level.room_name.toUpperCase();
  show('hud');
  updateHud();
  controls.lock();
}

function nextWave() {
  game.wave++;
  const n = game.wave;
  game.queue = [];
  for (const h of haunts) game.queue.push({ h, opts: { hpMul: 1 + (n - 1) * 0.3, speedMul: 1 + (n - 1) * 0.12 } });
  if (n >= 2) for (const h of haunts.slice(0, Math.ceil(haunts.length / 2))) game.queue.push({ h, opts: { hpMul: 1 + (n - 1) * 0.3, speedMul: 1.15 } });
  if (n === WAVES) {
    const strongest = [...haunts].sort((a, b) => b.obj.ghost.hp - a.obj.ghost.hp)[0];
    game.queue.unshift({ h: strongest, opts: { boss: true } });
    shout(`"${level.boss_line}"`, 3500);
  } else {
    shout(`WAVE ${n}`, 1500);
  }
  game.spawnT = 1.2;
  updateHud();
}

function shout(text, ms = 1500) {
  const el = $('shout'); el.textContent = text; el.classList.add('show');
  clearTimeout(shout.t); shout.t = setTimeout(() => el.classList.remove('show'), ms);
}
function feed(name, head) {
  const el = document.createElement('div');
  if (head) el.className = 'hs';
  el.innerHTML = `YOU &rarr; ${name.replace(/[<>&]/g, '')}${head ? ' <em>HEADSHOT</em>' : ''}`;
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 3600);
}

function endGame(won) {
  game.running = false;
  controls.unlock();
  const s = game.stats, secs = Math.round(game.time);
  $('end-kicker').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('end-title').textContent = won ? `${level.room_name} is cleansed` : 'The haunt claimed you';
  $('end-stats').innerHTML = [
    ['GHOSTS', s.kills], ['HEADSHOTS', s.heads],
    ['ACCURACY', s.shots ? Math.round((s.hits / s.shots) * 100) + '%' : '0%'], ['TIME', secs + 's'],
  ].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  show('end');
}

// ======================================================================
// INPUT
// ======================================================================
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (!game.running || game.paused) return;
  if (e.code === 'KeyR') reload();
  if (e.code === 'Space' && player.onGround) { player.vel.y = 7; player.onGround = false; }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && player.dashCd <= 0) dash();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousedown', (e) => { if (e.button === 0 && controls.isLocked) weapon.shooting = true; });
document.addEventListener('mouseup', (e) => { if (e.button === 0) weapon.shooting = false; });

controls.addEventListener('unlock', () => {
  weapon.shooting = false;
  if (game.running) { game.paused = true; show('pause'); }
});
controls.addEventListener('lock', () => { game.paused = false; show('hud'); });

function reload() {
  if (weapon.reloadT > 0 || weapon.mag === weapon.size) return;
  weapon.reloadT = 1.4; sfx.reload();
  $('ammo').classList.add('reloading');
}

function dash() {
  const dir = moveDir();
  if (dir.lengthSq() === 0) camera.getWorldDirection(dir).setY(0).normalize();
  player.dashDir.copy(dir); player.dashT = 0.16; player.dashCd = 3; sfx.dash();
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
function moveDir() {
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();
  const d = new THREE.Vector3();
  if (keys.KeyW) d.add(_fwd); if (keys.KeyS) d.sub(_fwd);
  if (keys.KeyD) d.add(_right); if (keys.KeyA) d.sub(_right);
  return d.lengthSq() ? d.normalize() : d;
}

// ======================================================================
// SHOOTING
// ======================================================================
const ray = new THREE.Raycaster();
const sparks = [];
const sparkMat = new THREE.MeshBasicMaterial({ color: '#3ef2e0' });
const sparkGeo = new THREE.OctahedronGeometry(0.06);

function fire() {
  weapon.mag--; weapon.fireCd = 0.105; weapon.recoil = 1; game.stats.shots++;
  sfx.shot();
  flash.visible = true; flashLight.intensity = 6;
  setTimeout(() => { flash.visible = false; flashLight.intensity = 0; }, 45);

  const moving = moveDir().lengthSq() > 0 || !player.onGround;
  const spread = (moving ? 0.035 : 0.006) + weapon.recoil * 0.004;
  ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread), camera);
  const targets = [...solids.map((s) => s.mesh), ...ghosts.filter((g) => g.state !== 'dead').flatMap((g) => [g.body, g.head])];
  const hit = ray.intersectObjects(targets, false)[0];
  tracer(hit ? hit.point : ray.ray.at(60, new THREE.Vector3()));
  if (hit) {
    const s = new THREE.Mesh(sparkGeo, sparkMat); s.position.copy(hit.point); s.userData.life = 0.25;
    world.add(s); sparks.push(s);
    const info = hit.object.userData;
    if (info.ghost) damageGhost(info.ghost, info.part === 'head');
  }
  // camera kick
  camera.rotation.x = clamp(camera.rotation.x + 0.006, -1.5, 1.5);
  if (weapon.mag <= 0) reload();
  updateHud();
}

function damageGhost(gh, head) {
  const dmg = head ? 100 : 34;
  gh.hp -= dmg; game.stats.hits++;
  if (head) game.stats.heads++;
  (head ? sfx.head : sfx.hit)();
  const hm = $('hitmarker'); hm.className = head ? 'head' : ''; void hm.offsetWidth; hm.classList.add('show');
  const fm = gh.flashMat || gh.body.material;
  fm.emissiveIntensity = gh.flashMat ? 0.8 : 1.2;
  setTimeout(() => { fm.emissiveIntensity = gh.flashMat ? 0 : 0.15; }, 80);
  drawTag(gh);
  if (gh.hp <= 0) {
    gh.state = 'dead'; gh.t = 0; game.stats.kills++;
    burst(gh.group.position.clone().setY(gh.soldier ? 1.2 : gh.group.position.y), gh.soldier ? 10 : gh.boss ? 40 : 20);
    sfx.kill(); feed(gh.name, head);
  }
}

// ======================================================================
// EFFECTS: bullet tracers and death bursts
// ======================================================================
const fx = [];
const tracerMat = new THREE.MeshBasicMaterial({ color: glow(ST.tracer, LOWFX ? 1 : 3), transparent: true });
const burstGeo = ST.petals ? new THREE.PlaneGeometry(0.14, 0.09) : new THREE.OctahedronGeometry(0.07);
const burstMat = new THREE.MeshBasicMaterial({ color: glow(ST.burst, LOWFX ? 1 : 2.5), side: THREE.DoubleSide, transparent: true });

const enemyTracerMat = new THREE.MeshBasicMaterial({ color: glow('#ff5a3c', LOWFX ? 1 : 3), transparent: true });

function tracer(to, from = flash.getWorldPosition(new THREE.Vector3()), mat = tracerMat) {
  const len = from.distanceTo(to);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, len), mat.clone());
  m.position.copy(from).lerp(to, 0.5); m.lookAt(to); m.raycast = () => {};
  world.add(m); fx.push({ m, life: 0.07, max: 0.07, dispose: true });
}

function burst(at, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(burstGeo, burstMat.clone());
    m.position.copy(at); m.raycast = () => {};
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
    world.add(m); fx.push({ m, v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), life: 0.9, max: 0.9 });
  }
}

function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    f.m.material.opacity = Math.max(0, f.life / f.max);
    if (f.v) {
      f.v.y -= (ST.petals ? 1.5 : 5) * dt; f.v.multiplyScalar(ST.petals ? 0.97 : 0.99);
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.spin.x * dt; f.m.rotation.y += f.spin.y * dt; f.m.rotation.z += f.spin.z * dt;
    }
    if (f.life <= 0) { world.remove(f.m); if (f.dispose) f.m.geometry.dispose(); fx.splice(i, 1); }
  }
}

// ======================================================================
// UPDATE LOOP
// ======================================================================
const _box = new THREE.Box3();
function collide(pos, feetY) {
  let ground = 0;
  for (const { box } of solids) {
    if (pos.x > box.min.x - RADIUS && pos.x < box.max.x + RADIUS && pos.z > box.min.z - RADIUS && pos.z < box.max.z + RADIUS) {
      if (feetY >= box.max.y - 0.25) { ground = Math.max(ground, box.max.y); continue; } // standing on top
      if (feetY + 1.7 < box.min.y) continue;
      const pushL = pos.x - (box.min.x - RADIUS), pushR = (box.max.x + RADIUS) - pos.x;
      const pushB = pos.z - (box.min.z - RADIUS), pushF = (box.max.z + RADIUS) - pos.z;
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) pos.x -= pushL; else if (m === pushR) pos.x += pushR;
      else if (m === pushB) pos.z -= pushB; else pos.z += pushF;
    }
  }
  pos.x = clamp(pos.x, -half.x + RADIUS + 0.2, half.x - RADIUS - 0.2);
  pos.z = clamp(pos.z, -half.z + RADIUS + 0.2, half.z - RADIUS - 0.2);
  return ground;
}

function updatePlayer(dt) {
  const dir = moveDir();
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.pos.addScaledVector(player.dashDir, 22 * dt);
  } else {
    player.pos.addScaledVector(dir, SPEED * dt);
  }
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.vel.y -= GRAV * dt;
  player.pos.y += player.vel.y * dt;
  const ground = collide(player.pos, player.pos.y);
  if (player.pos.y <= ground) { player.pos.y = ground; player.vel.y = 0; player.onGround = true; }
  else if (player.pos.y > ground + 0.05) player.onGround = false;
  const bob = player.onGround && dir.lengthSq() ? Math.sin(game.time * 12) * 0.03 : 0;
  camera.position.set(player.pos.x, player.pos.y + EYE + bob, player.pos.z);
}

function updateWeapon(dt) {
  weapon.fireCd -= dt;
  if (weapon.reloadT > 0) {
    weapon.reloadT -= dt;
    gun.rotation.x = -0.6 * Math.sin(Math.min(1, 1 - weapon.reloadT / 1.4) * Math.PI);
    if (weapon.reloadT <= 0) { weapon.mag = weapon.size; gun.rotation.x = 0; $('ammo').classList.remove('reloading'); updateHud(); }
  } else if (weapon.shooting && weapon.fireCd <= 0 && weapon.mag > 0) {
    fire();
  }
  weapon.recoil = Math.max(0, weapon.recoil - dt * 6);
  gun.position.set(GUN_REST.x, GUN_REST.y + weapon.recoil * 0.015, GUN_REST.z + weapon.recoil * 0.06);
  const moving = moveDir().lengthSq() > 0 || !player.onGround;
  document.documentElement.style.setProperty('--spread', `${(moving ? 8 : 0) + weapon.recoil * 6}px`);
}

function updateGhosts(dt) {
  for (const gh of ghosts) {
    gh.t += dt;
    const g = gh.group;
    if (gh.soldier) { updateSoldier(gh, dt); continue; }
    if (gh.state === 'emerging') {
      const k = Math.min(1, gh.t / 1.1);
      g.scale.setScalar(gh.scale * (0.01 + 0.99 * k));
      g.position.y = gh.from.obj.size[1] + k * 0.9;
      if (k >= 1) gh.state = 'chase';
    } else if (gh.state === 'chase') {
      const to = new THREE.Vector3(player.pos.x - g.position.x, 0, player.pos.z - g.position.z);
      const dist = to.length();
      // sway sideways so they are harder to hit (anime-style dodging)
      const side = new THREE.Vector3(-to.z, 0, to.x).normalize().multiplyScalar(Math.sin(gh.t * 2.2 + gh.phase) * 0.9);
      if (dist > 1.0) g.position.addScaledVector(to.normalize().add(side).normalize(), gh.speed * dt);
      g.position.y = 1.0 + Math.sin(gh.t * 3 + gh.phase) * 0.18 + (gh.boss ? 0.4 : 0);
      gh.tail.rotation.z = Math.sin(gh.t * 5 + gh.phase) * 0.25;
      gh.arms.forEach((a, k) => { a.position.y = 0.05 + Math.sin(gh.t * 4 + k * 3) * 0.08; });
      g.lookAt(player.pos.x, g.position.y, player.pos.z);
      gh.attackCd -= dt;
      if (dist < 1.3 && gh.attackCd <= 0) {
        gh.attackCd = 0.9;
        hurt(gh.boss ? 20 : 12);
      }
    } else if (gh.state === 'dead') {
      g.scale.multiplyScalar(1 + dt * 2);
      g.position.y += dt * 2;
      g.rotation.y += dt * 10;
      gh.body.material.opacity = Math.max(0, 0.92 - gh.t * 2.2);
      g.traverse((m) => { if (m.isMesh && m.material !== gh.body.material) m.visible = false; });
      if (gh.t > 0.45) { world.remove(g); gh.state = 'gone'; }
    }
  }
  ghosts = ghosts.filter((g) => g.state !== 'gone');
}

function updateSoldier(gh, dt) {
  const g = gh.group;
  if (gh.state === 'emerging') {
    const k = Math.min(1, gh.t / 0.6); g.scale.setScalar(gh.scale * (0.01 + 0.99 * k));
    if (k >= 1) gh.state = 'chase';
  } else if (gh.state === 'chase') {
    const to = new THREE.Vector3(player.pos.x - g.position.x, 0, player.pos.z - g.position.z);
    const dist = to.length(); to.normalize();
    // line of sight from the rifle to the player's chest, rechecked a few times a second
    gh.losT -= dt;
    if (gh.losT <= 0) {
      gh.losT = 0.15;
      gh.sees = dist < SOLDIER_RANGE && canSee(gh.muzzle.getWorldPosition(_muzzle), chest());
    }
    // with a clear shot, hold position and strafe; otherwise keep closing in
    const holding = gh.sees && dist > 3 && dist < 14;
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(Math.sin(gh.t * 1.3 + gh.phase) * (holding ? 1 : 0.7));
    if (dist > 1.1) {
      const move = holding ? side.normalize().multiplyScalar(0.35) : to.add(side).normalize();
      g.position.addScaledVector(move, gh.speed * 0.8 * dt);
      collide(g.position, 0);
      gh.legs[0].rotation.x = Math.sin(gh.t * 9) * 0.55 * (holding ? 0.4 : 1); gh.legs[1].rotation.x = -gh.legs[0].rotation.x;
    }
    g.rotation.y = Math.atan2(player.pos.x - g.position.x, player.pos.z - g.position.z);
    gh.attackCd -= dt;
    if (dist < 1.5 && gh.attackCd <= 0) { gh.attackCd = 0.9; hurt(gh.boss ? 20 : 12); }
    else if (dist >= 1.5) soldierShoot(gh, dist, dt);
  } else if (gh.state === 'dead') {
    g.rotation.x = -Math.min(1, gh.t / 0.35) * Math.PI / 2;
    if (gh.t > 1.6) g.position.y -= dt * 0.6;
    if (gh.t > 2.6) { world.remove(g); gh.state = 'gone'; }
  }
}

// soldiers aim for a moment once they see you, then fire short bursts
const SOLDIER_RANGE = 22;
const losRay = new THREE.Raycaster();
const _muzzle = new THREE.Vector3(), _chest = new THREE.Vector3(), _losDir = new THREE.Vector3();
function chest() { return _chest.set(player.pos.x, player.pos.y + 1.2, player.pos.z); }
function canSee(from, to) {
  const d = _losDir.subVectors(to, from).length();
  losRay.set(from, _losDir.divideScalar(d)); losRay.far = d - 0.3;
  return losRay.intersectObjects(solids.map((s) => s.mesh), false).length === 0;
}

function soldierShoot(gh, dist, dt) {
  gh.shotCd -= dt;
  if (!gh.sees) { gh.aimT = 0; gh.burstLeft = 0; return; }
  gh.aimT += dt;
  if (gh.aimT < 0.5 || gh.shotCd > 0) return;
  if (gh.burstLeft <= 0) gh.burstLeft = 3;
  gh.burstLeft--;
  gh.shotCd = gh.burstLeft > 0 ? 0.12 : (gh.boss ? 1.0 : 1.6 + Math.random() * 0.8);

  // harder to hit at range, while moving, and much harder mid-dash
  let chance = 0.6 - dist * 0.02;
  if (player.dashT > 0) chance *= 0.3;
  else if (moveDir().lengthSq() > 0 || !player.onGround) chance *= 0.55;
  const from = gh.muzzle.getWorldPosition(new THREE.Vector3()), target = chest().clone();
  sfx.enemyShot();
  if (Math.random() < clamp(chance, 0.08, 0.6)) {
    tracer(target, from, enemyTracerMat);
    hurt(gh.boss ? 8 : 5);
  } else {
    const miss = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.7 + Math.random() * 0.6);
    tracer(target.add(miss).sub(from).setLength(dist + 6).add(from), from, enemyTracerMat);
  }
}

function hurt(dmg) {
  if (player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - dmg);
  sfx.hurt();
  const v = $('vignette'); v.classList.add('hurt'); setTimeout(() => v.classList.remove('hurt'), 120);
  updateHud();
  if (player.hp <= 0) endGame(false);
}

function updateHaunts(dt) {
  for (const h of haunts) {
    h.light.intensity = 2 + Math.sin(game.time * 4 + h.base.x) * 0.8;
    if (h.shake > 0) {
      h.shake -= dt;
      h.mesh.position.set(h.base.x + (Math.random() - 0.5) * 0.12, h.base.y, h.base.z + (Math.random() - 0.5) * 0.12);
      h.light.intensity = 8;
      if (h.shake <= 0) { h.mesh.position.copy(h.base); makeGhost(h, h.pending); }
    }
  }
}

function updateWaves(dt) {
  const alive = ghosts.filter((g) => g.state !== 'dead').length;
  const shaking = haunts.some((h) => h.shake > 0);
  if (game.queue.length) {
    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      const { h, opts } = game.queue.shift();
      if (h.shake <= 0) { h.shake = 0.8; h.pending = opts; } else game.queue.push({ h, opts });
      game.spawnT = 1.3;
    }
  } else if (!alive && !shaking) {
    if (game.wave >= WAVES) return endGame(true);
    game.betweenT -= dt;
    if (game.betweenT <= 0) { game.betweenT = 2.5; nextWave(); }
  }
  $('left').textContent = `${alive + game.queue.length} GHOSTS`;
}

function updateHud() {
  $('hp').textContent = Math.ceil(player.hp);
  $('hp-bar').style.width = player.hp + '%';
  $('health').classList.toggle('low', player.hp <= 30);
  $('mag').textContent = weapon.mag;
  $('wave-label').textContent = game.wave ? `WAVE ${game.wave} / ${WAVES}` : 'GET READY';
}

function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.userData.life -= dt; s.rotation.y += dt * 20;
    if (s.userData.life <= 0) { world.remove(s); sparks.splice(i, 1); }
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.running && !game.paused) {
    game.time += dt;
    updatePlayer(dt);
    updateWeapon(dt);
    updateHaunts(dt);
    updateGhosts(dt);
    updateWaves(dt);
    updateSparks(dt);
    updateFx(dt);
    worldUpdate(dt, game.time);
    $('ability').classList.toggle('cool', player.dashCd > 0);
    $('dash-ring').style.height = (player.dashCd / 3) * 100 + '%';
  } else if (world && !game.running) {
    // slow orbit behind the menus
    game.time += dt;
    camera.position.set(Math.sin(game.time * 0.15) * half.x * 0.9, 4, Math.cos(game.time * 0.15) * half.z * 0.9);
    camera.lookAt(0, 0.8, 0);
    updateHaunts(dt);
    worldUpdate(dt, game.time);
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ======================================================================
// MENUS
// ======================================================================
const screens = ['menu', 'briefing', 'pause', 'end', 'hud'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }

function openBriefing(lv) {
  level = lv;
  game.running = false;
  buildWorld(level);
  $('b-name').textContent = lv.room_name;
  $('b-vibe').textContent = lv.vibe;
  $('b-ghosts').innerHTML = '';
  for (const o of lv.objects.filter((x) => x.haunted)) {
    const li = document.createElement('li');
    li.innerHTML = `<b></b> hides in the <span></span><small></small>`;
    li.querySelector('b').textContent = o.ghost.name;
    li.querySelector('span').textContent = o.name;
    li.querySelector('small').textContent = `${o.ghost.personality} · ${Math.round(o.ghost.hp)} HP`;
    $('b-ghosts').appendChild(li);
  }
  $('b-json').textContent = JSON.stringify(lv, null, 2);
  show('briefing');
}

function setMsg(text, cls = '') { const m = $('fuse-msg'); m.textContent = text; m.className = 'msg ' + cls; }

async function checkGemma() {
  const el = $('gemma-status');
  try {
    const r = await (await fetch('api/health')).json();
    if (r.ollama && r.model_ready) { el.className = 'status ok'; el.querySelector('span').textContent = `Gemma 4 ready · ${r.model}`; }
    else if (r.ollama) { el.className = 'status bad'; el.querySelector('span').textContent = `Ollama is up but ${r.model} is not downloaded yet`; }
    else { el.className = 'status bad'; el.querySelector('span').textContent = 'Gemma offline · samples still work'; }
  } catch {
    el.className = 'status bad'; el.querySelector('span').textContent = 'Game server not reachable';
  }
}

let photoData = null;
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 768, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('This browser cannot read that image. Try a JPG or PNG.'));
    img.src = URL.createObjectURL(file);
  });
}

async function takePhoto(file) {
  if (!file) return;
  try {
    photoData = await resizeImage(file);
    $('preview').src = photoData; $('drop').classList.add('has');
    $('fuse').disabled = false; setMsg('Photo ready. Press FUSE.');
  } catch (e) { setMsg(e.message, 'err'); }
}

$('photo').addEventListener('change', (e) => takePhoto(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); takePhoto(e.dataTransfer.files[0]); });

$('fuse').addEventListener('click', async () => {
  if (!photoData) return;
  audio();
  $('fuse').disabled = true;
  const t0 = performance.now();
  const timer = setInterval(() => setMsg(`Gemma is reading your room... ${Math.round((performance.now() - t0) / 1000)}s`, 'busy'), 500);
  try {
    const res = await fetch('api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: photoData, hint: $('hint').value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gemma failed');
    setMsg(`Fused in ${data.seconds}s with ${data.model}`);
    openBriefing(cleanLevel(data.level));
  } catch (e) {
    setMsg(`${e.message}. You can still play a sample.`, 'err');
  } finally {
    clearInterval(timer);
    $('fuse').disabled = false;
  }
});

document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', async () => {
  audio();
  try { openBriefing(cleanLevel(await (await fetch(b.dataset.sample)).json())); }
  catch (e) { setMsg('Could not load sample: ' + e.message, 'err'); }
}));

$('load-paste').addEventListener('click', () => {
  try { openBriefing(parseLevelText($('paste').value)); }
  catch (e) { setMsg('That JSON did not work: ' + e.message, 'err'); }
});

$('enter').addEventListener('click', () => { audio(); startGame(); });
$('resume').addEventListener('click', () => controls.lock());
$('again').addEventListener('click', () => startGame());
document.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => {
  game.running = false; game.paused = false;
  history.replaceState(null, '', location.pathname);
  show('menu');
}));

// Level link from the Open WebUI "Play this room" button: #level=<base64url JSON>
function levelFromHash() {
  const m = location.hash.match(/level=([A-Za-z0-9_\-=]+)/);
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    openBriefing(cleanLevel(JSON.parse(json)));
    return true;
  } catch (e) { setMsg('Level link was broken: ' + e.message, 'err'); return false; }
}

checkGemma();
if (!levelFromHash()) {
  show('menu');
  fetch('samples/ecs-lab.json').then((r) => r.json()).then((lv) => { if (!level) buildWorld(cleanLevel(lv)); }).catch(() => {});
}

// handy for testing in the browser console
function step(dt) { // one logic tick without drawing (used by automated tests)
  game.time += dt; updatePlayer(dt); updateWeapon(dt); updateHaunts(dt); updateGhosts(dt); updateWaves(dt); updateSparks(dt); updateFx(dt); worldUpdate(dt, game.time);
}
window.phantom = { game, player, camera, weapon, burst, STYLE, get ghosts() { return ghosts; }, get solids() { return solids; }, nextWave, startGame, cleanLevel, step };
