// ================= KARAKONCOLOS: rigged creature model (vendor/creature.glb) + procedural bone animation =================
// API used by main.js: buildMonster, monsterShow, monsterHide, monsterFace, monsterAnimate, monsterChase; MON.reach / MON.twitch / MON.faceH
const MON = { g: null, state: 'off', speed: 0, phase: 0, t: 0, reach: 0, twitch: 0, faceH: 2.0, ready: false, B: {}, REST: {}, WREST: {}, ACC: {}, gaitS: 0, reachS: 0 };
const MON_SCALE = 1.32;   // model is ~1.9 m tall -> ~2.5 m
const MON_BONES = ['Root_00', 'Body_01', 'Body1_02', 'Body2_03', 'Body3_04', 'Body4_05', 'Body5_06', 'Neck_07', 'Head_08', 'Arm_09', 'Elbow_010', 'Hand_011', 'Finger1_014', 'Finger2_012', 'Finger3_013'];
const MON_SPINE = ['Body1_02', 'Body2_03', 'Body3_04', 'Body4_05', 'Body5_06', 'Neck_07'];
const MON_FING = ['Finger1_014', 'Finger2_012', 'Finger3_013'];
function buildMonster() {
  const G = new THREE.Group(); G.visible = false; SCENE.add(G); MON.g = G;
  const holder = new THREE.Group(); holder.scale.setScalar(MON_SCALE); G.add(holder); MON.holder = holder;
  MON.faceH = 1.52 * MON_SCALE;
  // dim cold key light used only to reveal the silhouette at a distance (always in the scene, intensity animated)
  MON.rev = new THREE.SpotLight(0x9fb4ff, 0, 14, 0.5, 0.8, 1.2); SCENE.add(MON.rev); SCENE.add(MON.rev.target); MON.revT = 0;
  if (!window.CREATURE_GLB || !window.GLTFLoader) return;
  new GLTFLoader().load(window.CREATURE_GLB, gl => {
    const m = gl.scene; holder.add(m); MON.model = m;
    m.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.frustumCulled = false;
        const mt = o.material; if (mt) { mt.envMapIntensity = 0; if (mt.color && /Body|Details/.test(mt.name || '')) mt.color.multiplyScalar(0.8);
          if (/Eyes|Gums|HeadDetail/.test(mt.name || '') && mt.emissive) { mt.emissive.setRGB(0.55, 0.06, 0.03); mt.emissiveIntensity = 0.35; if (mt.map && !mt.emissiveMap) mt.emissiveMap = mt.map; mt.needsUpdate = true; (MON.emis = MON.emis || []).push(mt); } }
      }
      if (o.isBone) MON.B[o.name] = o;
    });
    m.updateMatrixWorld(true);
    const inv = m.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const n of MON_BONES) { const b = MON.B[n]; if (!b) continue; MON.REST[n] = b.quaternion.clone(); MON.WREST[n] = inv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())); MON.WINV = MON.WINV || {}; MON.WINV[n] = MON.WREST[n].clone().invert(); }
    MON.ready = true;
    // apply current layer setup (monster may already be shown in the mirror)
    const lay = MON.layer || 0; G.traverse(o => { o.layers.set(lay); if (lay) o.layers.enable(lay); });
  }, undefined, e => console.warn('creature load failed', e));
}
function monsterShow(x, z, ry, layer) {
  const G = MON.g; G.visible = true; G.position.set(x, groundAt(x, z), z); G.rotation.y = ry || 0; MON.layer = layer || 0;
  G.traverse(o => { o.layers.set(layer || 0); }); if (layer) { G.traverse(o => o.layers.enable(layer)); }
  MON.gaitS = 0; MON.reachS = 0;
}
// shift the creature so its head sits on the camera's line of sight at `dist` metres (head bone is off the model's centre line)
function monsterCenterHead(camPos, fwd, dist, dy = 0) {
  if (!MON.ready || !MON.B.Head_08) return; MON.g.updateMatrixWorld(true);
  const h = MON.B.Head_08.getWorldPosition(new THREE.Vector3()); const want = camPos.clone().addScaledVector(fwd, dist);
  MON.g.position.x += want.x - h.x; MON.g.position.z += want.z - h.z; MON.g.position.y += (camPos.y - 0.05 + dy) - (h.y + 0.12 * MON_SCALE);
}
function monsterGlow(k) { for (const m of MON.emis || []) m.emissiveIntensity = 0.35 * k; }
function monsterReveal(k) { MON.revT = k; }
function monsterHide() { monsterGlow(1); MON.revT = 0; if (MON.rev) MON.rev.intensity = 0; MON.g.visible = false; MON.state = 'off'; MON.speed = 0; }
function monsterFace(px, pz) { MON.g.rotation.y = Math.atan2(px - MON.g.position.x, pz - MON.g.position.z); }
// ---- bone helpers: rotations given in model space (x: lean forward, y: twist, z: side bend), added on top of rest pose
function mRot(n, x, y, z, w = 1) { const a = MON.ACC[n] || (MON.ACC[n] = [0, 0, 0]); a[0] += x * w; a[1] += y * w; a[2] += z * w; }
const _mq = new THREE.Quaternion(), _me = new THREE.Euler(), _mq2 = new THREE.Quaternion();
function mApply() {
  for (const n of MON_BONES) {
    const b = MON.B[n]; if (!b) continue; const a = MON.ACC[n];
    if (!a) { b.quaternion.copy(MON.REST[n]); continue; }
    _mq.setFromEuler(_me.set(a[0], a[1], a[2], 'YXZ'));
    _mq2.copy(MON.WINV[n]).multiply(_mq).multiply(MON.WREST[n]);
    b.quaternion.copy(MON.REST[n]).multiply(_mq2);
    a[0] = a[1] = a[2] = 0;
  }
}
const mNoise = t => Math.sin(t * 1.7) * 0.5 + Math.sin(t * 2.9 + 1.3) * 0.3 + Math.sin(t * 5.3 + 2.1) * 0.2;
// gait: 0 = idle/stand, ~0.2-0.5 = slither/walk, 1 = chase
function monsterAnimate(dt, gait, t) {
  if (MON.rev) { MON.rev.intensity += ((MON.g.visible ? MON.revT : 0) - MON.rev.intensity) * Math.min(1, dt * 6);
    if (MON.rev.intensity > 0.01) { const p = MON.g.position, c = (typeof CAMERA !== 'undefined') ? CAMERA.position : p; const dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz) || 1; MON.rev.position.set(p.x + dx / l * 3.5, p.y + 2.6, p.z + dz / l * 3.5); MON.rev.target.position.set(p.x, p.y + 1.9, p.z); MON.rev.target.updateMatrixWorld(); } }
  if (!MON.g.visible || !MON.ready) return;
  MON.gaitS += (gait - MON.gaitS) * Math.min(1, dt * 4); MON.reachS += ((MON.reach || 0) - MON.reachS) * Math.min(1, dt * 8);
  const g = MON.gaitS, idleW = Math.max(0, 1 - g * 3), walkW = Math.max(0, 1 - Math.abs(g - 0.35) * 3.2), runW = Math.max(0, Math.min(1, (g - 0.4) * 1.8));
  MON.phase += dt * (1 + g * 6); const p = MON.phase;
  // idle: breathing sway, slow head search
  if (idleW > 0) {
    const br = Math.sin(t * 1.6);
    MON_SPINE.forEach((n, i) => mRot(n, br * 0.025, Math.sin(t * 0.5 + i) * 0.03, Math.sin(t * 0.7 - i * 0.6) * 0.05, idleW));
    mRot('Head_08', mNoise(t * 0.4) * 0.12, mNoise(t * 0.3 + 4) * 0.35, mNoise(t * 0.5 + 9) * 0.1, idleW);
    mRot('Arm_09', 0, Math.sin(t * 0.8) * 0.2, Math.sin(t * 0.6) * 0.12, idleW); mRot('Elbow_010', 0, 0, Math.sin(t * 1.1) * 0.15, idleW);
    MON_FING.forEach((n, i) => mRot(n, 0, 0, Math.sin(t * 2 + i) * 0.2, idleW));
  }
  // slither: travelling S-wave up the spine
  if (walkW > 0) {
    MON_SPINE.forEach((n, i) => mRot(n, Math.sin(p * 1.3 - i * 0.9) * 0.06, 0, Math.sin(p - i * 0.8) * 0.17, walkW));
    mRot('Body_01', 0.08, Math.sin(p) * 0.1, Math.sin(p + 0.6) * 0.1, walkW);
    mRot('Head_08', -0.12, -Math.sin(p - 4) * 0.35, 0, walkW);
    mRot('Arm_09', 0, 0.5 + Math.sin(p) * 0.4, 0.1, walkW); mRot('Elbow_010', 0, 0, 0.25 + Math.sin(p + 1) * 0.3, walkW);
  }
  // chase: lunging, arm clawing forward, head jitter
  if (runW > 0) {
    MON_SPINE.forEach((n, i) => mRot(n, 0.1 + Math.sin(p * 1.3 - i * 1.1) * 0.08, 0, Math.sin(p - i) * 0.2, runW));
    mRot('Body_01', 0.35, Math.sin(p) * 0.15, 0, runW);
    mRot('Head_08', -0.35 + mNoise(t * 4) * 0.15, mNoise(t * 3 + 2) * 0.3, mNoise(t * 5) * 0.25, runW);
    mRot('Arm_09', 0, 1.2 + Math.sin(p) * 0.45, -0.35 + Math.sin(p * 0.7) * 0.35, runW); mRot('Elbow_010', 0, 0, Math.sin(p + 1) * 0.6, runW);
    MON_FING.forEach((n, i) => mRot(n, 0, 0, Math.sin(t * 12 + i) * 0.4, runW));
  }
  // reach / grab overlay (jumpscares, well climb)
  const r = MON.reachS;
  if (r > 0.01) {
    MON_SPINE.forEach((n, i) => mRot(n, 0.02 + Math.sin(t * 50 + i) * 0.04, 0, Math.sin(t * 37 - i) * 0.06, r));
    mRot('Body_01', 0.12, 0, 0, r);
    mRot('Head_08', -0.3 + Math.sin(t * 61) * 0.08, Math.sin(t * 47) * 0.15, Math.sin(t * 53) * 0.22, r);
    mRot('Arm_09', 0, 1.3, -0.5 + Math.sin(t * 30) * 0.2, r); mRot('Elbow_010', 0, 0, -0.2, r);
    MON_FING.forEach(n => mRot(n, 0, 0, -0.8, r));
  }
  // glitchy twitch bursts
  if (MON.twitch > 0) {
    MON.twitch -= dt; const st = Math.floor(t * 14), rr = k => (Math.sin(st * 12.9898 + k * 78.233) * 43758.5453) % 1;
    MON_SPINE.forEach((n, i) => mRot(n, rr(i) * 0.18, rr(i + 20) * 0.25, rr(i + 40) * 0.25));
    mRot('Head_08', rr(60) * 0.7, rr(61) * 1.1, rr(62) * 0.8);
  } else if (Math.random() < dt * 0.2) MON.twitch = 0.2 + Math.random() * 0.25;
  // small vertical bob while moving
  MON.holder.position.y = Math.abs(Math.sin(p)) * 0.06 * Math.min(1, g * 1.5);
  mApply();
}
// steering toward target with obstacle avoidance
function monsterChase(dt, tx, tz, speed) {
  const G = MON.g, x = G.position.x, z = G.position.z; let dx = tx - x, dz = tz - z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const base = Math.atan2(dx, dz); let best = null;
  for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.4, -2.4]) { const a = base + off * (MON.side || 1); const nx = x + Math.sin(a) * 1.4, nz = z + Math.cos(a) * 1.4; if (!blocked(nx, nz, 0.5)) { best = a; break; } }
  if (best == null) best = base + Math.PI;
  if (Math.random() < dt * 0.3) MON.side = -(MON.side || 1);
  const cur = G.rotation.y; let da = best - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  G.rotation.y = cur + da * Math.min(1, dt * 8);
  const p = { x: x + Math.sin(best) * speed * dt, z: z + Math.cos(best) * speed * dt }; resolve(p, 0.5);
  G.position.x = p.x; G.position.z = p.z; G.position.y += (groundAt(p.x, p.z) - G.position.y) * Math.min(1, dt * 10);
  return d;
}
