// The BOO ghost: a hand-drawn style white sheet ghost with dot eyes, a wavy hem
// and a little "BOO!" sign on a stick. Every enemy in the game uses this model.
import * as THREE from 'three';

const ink = new THREE.MeshBasicMaterial({ color: '#111111', side: THREE.BackSide });
const eyeMat = new THREE.MeshBasicMaterial({ color: '#111111' });
const stickMat = new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.8 });

// Sheet profile from hem to crown, spun around Y. Then the hem gets waves and the
// lower body is swept back, so the ghost leans into its flight like the drawing.
const bodyGeo = (() => {
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = 1 - i / 28;                       // 1 = hem, 0 = crown
    const y = 1.0 - t * 1.55;
    const r = t < 0.32 ? Math.sin((t / 0.32) * Math.PI / 2) * 0.42 : 0.42 + (t - 0.32) * 0.3;
    pts.push(new THREE.Vector2(Math.max(r, 0.002), y));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    if (v.y < -0.25) v.y += Math.sin(a * 5) * 0.075 * Math.min(1, (-0.25 - v.y) / 0.3); // wavy hem
    const k = Math.pow((1.0 - v.y) / 1.55, 2);   // 0 at the crown, ~1 at the hem
    v.z -= k * 0.38; v.x -= k * 0.12;            // trailing sheet
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
})();
const headGeo = new THREE.SphereGeometry(0.43, 12, 10);
const eyeGeo = new THREE.SphereGeometry(1, 12, 10);

function signTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 168;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 168);
  g.strokeStyle = '#111111'; g.lineWidth = 9; g.strokeRect(5, 5, 246, 158);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 88px "Comic Sans MS", "Chalkboard SE", "Marker Felt", "Segoe Print", cursive';
  g.save(); g.translate(128, 88); g.rotate(-0.06); g.fillText(text, 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
const signTex = { normal: null, boss: null };

function inked(mesh, thickness) {
  const o = new THREE.Mesh(mesh.geometry, ink);
  o.scale.setScalar(1 + thickness); o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

// Soft round shadow that stays on the floor under a floating ghost.
let shadowTex = null;
export function makeGhostShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.raycast = () => {};
  return m;
}

export function makeBooGhost({ boss = false, glow = 0.35 } = {}) {
  const group = new THREE.Group();
  // everything sits in a slightly tilted pose, like the ghost in the drawing
  const pose = new THREE.Group(); pose.rotation.z = -0.16; group.add(pose);
  // opaque while alive so the eyes draw on top; the death fade switches on transparency
  const mat = new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 0.9, emissive: '#ffffff', emissiveIntensity: glow, side: THREE.DoubleSide });
  const body = inked(new THREE.Mesh(bodyGeo, mat), 0.05);
  body.castShadow = true;
  pose.add(body);

  // invisible head hitbox: pokes out of the dome so shots up top count as headshots
  const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ visible: false }));
  head.position.y = 0.62;
  pose.add(head);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.scale.set(0.036, 0.054, 0.025); eye.position.set(0.11 * s, 0.6, 0.37); eye.raycast = () => {};
    pose.add(eye);
  }

  // little arm curling round the stick
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.12, 0.2, 0.32), new THREE.Vector3(0.02, 0.06, 0.46), new THREE.Vector3(0.16, 0.14, 0.47),
  ]);
  const arm = inked(new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.045, 8), mat), 0.18);
  arm.raycast = () => {};
  pose.add(arm);

  // the sign: stick in the paw, board up by the face, tilted like the drawing
  const sign = new THREE.Group();
  sign.position.set(0.16, 0.14, 0.5); sign.rotation.z = -0.55;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8), stickMat);
  stick.position.y = 0.1; stick.raycast = () => {};
  const key = boss ? 'boss' : 'normal';
  if (!signTex[key]) signTex[key] = signTexture(boss ? 'BOO!!' : 'BOO!', boss ? '#d4202f' : '#111111');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.29), new THREE.MeshBasicMaterial({ map: signTex[key], side: THREE.DoubleSide }));
  board.position.y = 0.4; board.raycast = () => {};
  sign.add(stick, board);
  pose.add(sign);

  // where thrown orbs leave from
  const muzzle = new THREE.Object3D(); muzzle.position.set(0.16, 0.5, 0.55);
  pose.add(muzzle);
  return { group, body, head, sign, muzzle, flashMat: mat };
}
