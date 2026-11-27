// ================= WORLD: textures, terrain, village, forest, interiors =================
const W = { colliders: [], circles: [], grid: new Map(), inter: [], doors: {}, lights: {}, objs: {}, indoorBoxes: [], foot: [] };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// --- value noise ---
const NP = (() => { const r = rng(1337); const p = new Uint8Array(512); const b = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } for (let i = 0; i < 512; i++) p[i] = b[i & 255]; return p; })();
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const h = (a, b) => NP[(NP[a & 255] + b) & 255] / 255; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.1; } return s; }
function heightAt(x, z) {
  let h = (fbm(x * 0.012 + 10, z * 0.012 + 3) - 0.5) * 11 + (fbm(x * 0.05, z * 0.05) - 0.5) * 2.2;
  const dv = Math.hypot(x, z * 0.9); const village = Math.min(1, Math.max(0, (dv - 50) / 30));
  let road = 1; if (z > 30) road = Math.min(1, Math.max(0, (Math.abs(x) - 5) / 28));
  const cem = Math.min(1, Math.max(0, (Math.hypot(x - 45, z + 32) - 22) / 12));
  const hut = Math.min(1, Math.max(0, (Math.hypot(x + 25, z + 105) - 7) / 8));
  const k = Math.min(village, road, cem, hut);
  return h * k + (1 - k) * (0.12 * Math.sin(x * 0.3) * Math.cos(z * 0.25));
}
// --- canvas textures ---
function canvasTex(w, h, draw, repeat, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat[0], repeat[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function speck(g, w, h, n, cols, smin, smax, r) { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = smin + r() * (smax - smin); g.fillRect(r() * w, r() * h, s, s); } }
// ---- imported house model (Medieval House 1) : geometry + PBR textures embedded as base64 ----
function b64buf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
function texFromData(url, srgb, rep) { const im = new Image(); const t = new THREE.Texture(im); im.onload = () => { t.needsUpdate = true; }; im.src = url; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) t.repeat.set(rep, rep); return t; }
let HOUSE_TPL = null;
function houseTemplate() {
  if (HOUSE_TPL || !window.HOUSE_META) return HOUSE_TPL;
  const meta = window.HOUSE_META, buf = b64buf(window.HOUSE_BIN), T = window.HOUSE_TEX;
  const key = { 'Wood': 'Wood', 'Roof': 'Roof', 'Wall Brick': 'Wall_Brick', 'Door And Window': 'Door_And_Window', 'Wall': 'Wall' };
  const g = new THREE.Group();
  for (const p of meta.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, p.pos, p.count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(buf, p.nor, p.count * 3), 3, true));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, p.uv, p.count * 2), 2));
    geo.setIndex(new THREE.BufferAttribute(p.i32 ? new Uint32Array(buf, p.idx, p.icount) : new Uint16Array(buf, p.idx, p.icount), 1));
    geo.computeBoundingSphere(); geo.computeTangents && false;
    const k = key[p.mat];
    const mat = new THREE.MeshStandardMaterial({ map: texFromData(T[k + '_c'], true), normalMap: texFromData(T[k + '_n'], false), roughnessMap: texFromData(T[k + '_rm'], false), metalnessMap: texFromData(T[k + '_rm'], false), roughness: 1, metalness: 1, side: p.mat === 'Roof' ? THREE.DoubleSide : THREE.FrontSide });
    mat.normalScale.set(1, 1);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.name = p.name; g.add(m);
  }
  g.traverse(o => { if (o.isMesh) addRoofSnow(o.material, o.name === 'Roof' ? 0.92 : 0.7); });
  g.userData.box = meta.box; HOUSE_TPL = g; return g;
}

// snow settles on up-facing surfaces (roofs, ledges) of imported/procedural meshes
function addRoofSnow(mat, amount) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;')
      .replace('#include <map_fragment>', `#include <map_fragment>\nfloat snowK = smoothstep(0.42, 0.8, vWN.y) * ${amount.toFixed(2)};\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.85, 0.92), snowK);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, snowK);');
  };
  mat.customProgramCacheKey = () => 'roofsnow' + amount;
}
// normal map from a grayscale height canvas (Sobel)
function normalFromHeight(src, strength) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const out = g.createImageData(w, h); const o = out.data;
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength; const l = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4; o[i] = (-dx / l * 0.5 + 0.5) * 255; o[i + 1] = (dy / l * 0.5 + 0.5) * 255; o[i + 2] = (1 / l * 0.5 + 0.5) * 255; o[i + 3] = 255; }
  g.putImageData(out, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
// texture from a canvas, with a matching normal map built from its luminance
function texPair(w, h, draw, strength) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return [t, normalFromHeight(c, strength)];
}
const TEX = {};
function buildTextures() {
  const r = rng(7);
  TEX.snow = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#dfe6ef'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { const v = 200 + r() * 55 | 0; g.fillStyle = `rgba(${v - 10},${v - 4},${v + 5},${0.3 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); } for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(170,185,205,${0.08 + r() * 0.1})`; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 30, 4 + r() * 10, r() * 3, 0, 7); g.fill(); } }, [90, 90]);
  TEX.snowBump = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4000; i++) { const v = 90 + r() * 90 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } }, [90, 90], false);
  const r2 = rng(11);
  [TEX.wood, TEX.woodN] = texPair(512, 512, (g, w, h) => { for (let y = 0; y < h; y += 64) { const base = 58 + r2() * 26; g.fillStyle = `rgb(${base + 22 | 0},${base * 0.74 | 0},${base * 0.5 | 0})`; g.fillRect(0, y, w, 64);
      for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(${r2() < 0.5 ? '28,16,8' : '120,90,60'},${0.08 + r2() * 0.18})`; g.lineWidth = 0.6 + r2() * 1.4; g.beginPath(); const yy = y + 3 + r2() * 58; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + r2() * 6 - 3, w * 0.6, yy + r2() * 6 - 3, w, yy + r2() * 4 - 2); g.stroke(); }
      if (r2() < 0.7) { const kx = r2() * w, ky = y + 14 + r2() * 36; for (let q = 6; q > 0; q--) { g.fillStyle = `rgba(30,16,8,${0.12 + 0.05 * q})`; g.beginPath(); g.ellipse(kx, ky, q * 3, q * 1.4, 0, 0, 7); g.fill(); } }
      g.fillStyle = 'rgba(6,3,1,.9)'; g.fillRect(0, y + 60, w, 4); g.fillStyle = 'rgba(255,230,200,.06)'; g.fillRect(0, y, w, 2);
      for (let nx = 40 + r2() * 30; nx < w; nx += 120 + r2() * 80) { g.fillStyle = 'rgba(20,20,22,.9)'; g.beginPath(); g.arc(nx, y + 10, 2.2, 0, 7); g.arc(nx, y + 52, 2.2, 0, 7); g.fill(); } } }, 3.2);
  [TEX.floor, TEX.floorN] = texPair(512, 512, (g, w, h) => { for (let x = 0; x < w; x += 64) { const b = 72 + r2() * 26; g.fillStyle = `rgb(${b + 18 | 0},${b * 0.72 | 0},${b * 0.47 | 0})`; g.fillRect(x, 0, 64, h);
      for (let k = 0; k < 60; k++) { g.strokeStyle = `rgba(30,18,10,${0.08 + r2() * 0.2})`; g.lineWidth = 0.5 + r2(); g.beginPath(); const xx = x + r2() * 64; g.moveTo(xx, 0); g.bezierCurveTo(xx + r2() * 6 - 3, h * 0.3, xx + r2() * 6 - 3, h * 0.7, xx + r2() * 4 - 2, h); g.stroke(); }
      g.fillStyle = 'rgba(6,3,1,.9)'; g.fillRect(x + 61, 0, 3, h); const cut = (r2() * h) | 0; g.fillRect(x, cut, 64, 3);
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(20,12,6,${0.05 + r2() * 0.08})`; g.beginPath(); g.ellipse(x + r2() * 64, r2() * h, 8 + r2() * 20, 20 + r2() * 60, 0, 0, 7); g.fill(); } } }, 2.6);
  [TEX.stone, TEX.stoneN] = texPair(512, 512, (g, w, h) => { g.fillStyle = '#2c2b2a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 56) for (let x = -40 + ((y / 56) % 2) * 44; x < w + 40; x += 88) { const v = 80 + r2() * 55 | 0; const bw = 80 + r2() * 6, bh = 48 + r2() * 4;
      const gr = g.createLinearGradient(x, y, x, y + bh); gr.addColorStop(0, `rgb(${v + 14},${v + 11},${v + 6})`); gr.addColorStop(1, `rgb(${v - 18},${v - 20},${v - 22})`); g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(x + 4, y + 4, bw, bh, 10) : g.rect(x + 4, y + 4, bw, bh); g.fill();
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${r2() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r2() * 0.1})`; g.fillRect(x + 6 + r2() * (bw - 6), y + 6 + r2() * (bh - 6), 1 + r2() * 3, 1 + r2() * 3); }
      if (r2() < 0.35) { g.fillStyle = 'rgba(70,90,60,.25)'; g.beginPath(); g.ellipse(x + r2() * bw, y + bh, 18, 8, 0, 0, 7); g.fill(); } } }, 4.0);
  [TEX.plaster, TEX.plasterN] = texPair(512, 512, (g, w, h) => { g.fillStyle = '#9a9080'; g.fillRect(0, 0, w, h); speck(g, w, h, 9000, ['rgba(60,50,40,.12)', 'rgba(255,250,240,.08)'], 1, 4, r2);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,45,30,${0.04 + r2() * 0.1})`; g.beginPath(); g.ellipse(r2() * w, r2() * h, 20 + r2() * 90, 10 + r2() * 50, 0, 0, 7); g.fill(); }
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(110,80,60,${0.25 + r2() * 0.2})`; const x = r2() * w, y = r2() * h; g.fillRect(x, y, 40 + r2() * 60, 18 + r2() * 20); }
      for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(30,22,14,.5)'; g.lineWidth = 0.8 + r2(); g.beginPath(); let x = r2() * w, y = r2() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += r2() * 24 - 12; y += r2() * 20; g.lineTo(x, y); } g.stroke(); }
      const gr = g.createLinearGradient(0, h * 0.75, 0, h); gr.addColorStop(0, 'rgba(40,30,20,0)'); gr.addColorStop(1, 'rgba(40,30,20,.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 2.0);
  TEX.roof = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e4ebf3'; g.fillRect(0, 0, w, h); speck(g, w, h, 2000, ['rgba(150,165,185,.25)', 'rgba(255,255,255,.4)'], 1, 4, r); for (let x = 0; x < w; x += 24) { g.fillStyle = 'rgba(120,135,155,.12)'; g.fillRect(x, 0, 2, h); } });
  TEX.bark = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#2e2219'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? '15,10,6' : '70,55,40'},.6)`; g.lineWidth = 1 + r() * 2; g.beginPath(); const x = r() * w; g.moveTo(x, 0); g.lineTo(x + r() * 6 - 3, h); g.stroke(); } }, [1, 2]);
  TEX.kilim = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#6a1d17'; g.fillRect(0, 0, w, h); const cols = ['#a83a22', '#d8b25a', '#1e2a4a', '#efe3c6']; for (let y = 16; y < h - 16; y += 32) for (let x = 16; x < w - 16; x += 32) { g.fillStyle = cols[((x + y) / 32) % 4 | 0]; g.beginPath(); g.moveTo(x + 16, y); g.lineTo(x + 32, y + 16); g.lineTo(x + 16, y + 32); g.lineTo(x, y + 16); g.fill(); g.fillStyle = '#6a1d17'; g.beginPath(); g.moveTo(x + 16, y + 8); g.lineTo(x + 24, y + 16); g.lineTo(x + 16, y + 24); g.lineTo(x + 8, y + 16); g.fill(); } g.strokeStyle = '#d8b25a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); speck(g, w, h, 1500, ['rgba(0,0,0,.15)'], 1, 2, r); });
  TEX.sign = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#5a3c22'; g.fillRect(0, 0, w, h); for (let k = 0; k < 60; k++) { g.strokeStyle = 'rgba(20,10,5,.3)'; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.lineTo(w, y + r() * 4 - 2); g.stroke(); } g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText('KOÇOĞLU', w / 2 + 3, h / 2 + 3); g.fillStyle = '#e9dcc0'; g.fillText('KOÇOĞLU', w / 2, h / 2); g.fillStyle = 'rgba(240,245,255,.9)'; g.fillRect(0, 0, w, 10); });
  TEX.grave = canvasTex(256, 384, (g, w, h) => { g.fillStyle = '#7d7b76'; g.fillRect(0, 0, w, h); speck(g, w, h, 2500, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.1)', 'rgba(60,80,50,.2)'], 1, 4, r); g.fillStyle = '#2a2826'; g.textAlign = 'center'; g.font = 'bold 30px Georgia, serif'; g.fillText('ŞAKİR', w / 2, 120); g.fillText('AKSU', w / 2, 158); g.font = '24px Georgia, serif'; g.fillText('1938 — 2026', w / 2, 200); g.font = 'italic 19px Georgia, serif'; g.fillText('"Söz kuyudadır.', w / 2, 260); g.fillText('İpi çek, sesine', w / 2, 288); g.fillText('dönme."', w / 2, 316); g.fillStyle = 'rgba(240,245,255,.95)'; g.fillRect(0, 0, w, 12); });
  TEX.photo = canvasTex(128, 160, (g, w, h) => { g.fillStyle = '#d9c9a5'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a7a5c'; g.fillRect(10, 10, w - 20, h - 20); g.fillStyle = '#4a3e2c'; for (const [x, s] of [[40, 1], [88, 0.9]]) { g.beginPath(); g.arc(x, 62, 15 * s, 0, 7); g.fill(); g.fillRect(x - 18 * s, 80, 36 * s, 60); } g.fillStyle = 'rgba(60,40,20,.3)'; g.fillRect(0, 0, w, h); });
  TEX.foot = canvasTex(64, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(120,140,170,.55)'; g.beginPath(); g.ellipse(32, 40, 16, 26, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(32, 100, 13, 18, 0, 0, 7); g.fill(); });
  TEX.claw = canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(90,105,135,.65)'; g.beginPath(); g.ellipse(64, 76, 34, 40, 0, 0, 7); g.fill(); for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(64 + i * 17, 26 + Math.abs(i) * 6, 6, 16, i * 0.25, 0, 7); g.fill(); } });
  TEX.glow = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,160,.6)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
const MAT = {};
function buildMaterials() {
  if (window.SNOW_TEX) {
    const sd = texFromData(SNOW_TEX.diff, true, 140), sn = texFromData(SNOW_TEX.nor, false, 140), sr = texFromData(SNOW_TEX.rough, false, 140);
    MAT.snow = new THREE.MeshStandardMaterial({ color: 0xe8eef7, map: sd, normalMap: sn, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: sr, roughness: 1, metalness: 0 });
    // break up tiling: low-frequency brightness variation + sparkle-free large drifts
    MAT.snow.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat mv = texture2D(map, vMapUv * 0.061).r * 0.6 + texture2D(map, vMapUv * 0.013 + 0.37).g * 0.4;\ndiffuseColor.rgb *= 0.82 + 0.3 * mv;'); };
    TEX.snowRoad = texFromData(SNOW_TEX.diff, true); TEX.snowRoad.repeat.set(1.5, 56);
    MAT.roofSnow = new THREE.MeshStandardMaterial({ color: 0xeef3fa, map: texFromData(SNOW_TEX.diff, true, 2), normalMap: texFromData(SNOW_TEX.nor, false, 2), roughness: 0.95 });
  } else MAT.snow = new THREE.MeshStandardMaterial({ color: 0xd9e2ee, map: TEX.snow, bumpMap: TEX.snowBump, bumpScale: 0.6, roughness: 0.92, metalness: 0 });
  MAT.wood = new THREE.MeshStandardMaterial({ map: TEX.wood, normalMap: TEX.woodN, roughness: 0.82 });
  MAT.woodDark = new THREE.MeshStandardMaterial({ map: TEX.wood, normalMap: TEX.woodN, color: 0x6a5a50, roughness: 0.88 });
  MAT.floor = new THREE.MeshStandardMaterial({ map: TEX.floor, normalMap: TEX.floorN, roughness: 0.72 });
  MAT.stone = new THREE.MeshStandardMaterial({ map: TEX.stone, normalMap: TEX.stoneN, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.93 }); addRoofSnow(MAT.stone, 0.8);
  MAT.rock = new THREE.MeshStandardMaterial({ color: 0x77756f, map: TEX.snowBump, roughness: 1 });
  MAT.plaster = new THREE.MeshStandardMaterial({ map: TEX.plaster, normalMap: TEX.plasterN, roughness: 0.94 });
  MAT.roof = MAT.roofSnow || new THREE.MeshStandardMaterial({ map: TEX.roof, roughness: 0.9, color: 0xdce4ee });
  MAT.bark = new THREE.MeshStandardMaterial({ map: TEX.bark, roughness: 1 });
  MAT.kilim = new THREE.MeshStandardMaterial({ map: TEX.kilim, roughness: 1 });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.2, metalness: 0.6 });
  MAT.dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  MAT.metal = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.8 });
  MAT.pine = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  MAT.fabric = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 1 });
  MAT.paper = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1, emissive: 0x3a3428, emissiveIntensity: 0.3 });
}
// --- collision registry ---
function addBox(minx, maxx, minz, maxz, tag) { const b = { minx, maxx, minz, maxz, tag, on: true }; W.colliders.push(b); return b; }
function addCircle(x, z, r) { const c = { x, z, r }; W.circles.push(c); const k = Math.floor(x / 8) + ',' + Math.floor(z / 8); if (!W.grid.has(k)) W.grid.set(k, []); W.grid.get(k).push(c); return c; }
function circlesNear(x, z) { const out = []; const cx = Math.floor(x / 8), cz = Math.floor(z / 8); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = W.grid.get((cx + i) + ',' + (cz + j)); if (a) for (const c of a) out.push(c); } return out; }
function blocked(x, z, r) {
  for (const b of W.colliders) if (b.on && x + r > b.minx && x - r < b.maxx && z + r > b.minz && z - r < b.maxz) return b;
  for (const c of circlesNear(x, z)) if (Math.hypot(x - c.x, z - c.z) < r + c.r) return c;
  return null;
}
function resolve(p, r) { // push circle (p.x,p.z) out of colliders
  for (let it = 0; it < 3; it++) {
    for (const b of W.colliders) { if (!b.on) continue; const cx = Math.max(b.minx, Math.min(p.x, b.maxx)), cz = Math.max(b.minz, Math.min(p.z, b.maxz)); const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d < r) { if (d > 1e-4) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; } else { const l = p.x - b.minx, rr = b.maxx - p.x, t = p.z - b.minz, bb = b.maxz - p.z, m = Math.min(l, rr, t, bb); if (m === l) p.x = b.minx - r; else if (m === rr) p.x = b.maxx + r; else if (m === t) p.z = b.minz - r; else p.z = b.maxz + r; } } }
    for (const c of circlesNear(p.x, p.z)) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d < r + c.r && d > 1e-4) { p.x = c.x + dx / d * (r + c.r); p.z = c.z + dz / d * (r + c.r); } }
  }
}
function addInter(o) { W.inter.push(Object.assign({ on: true, r: 1.6 }, o)); return o; }
// --- helpers ---
function box(w, h, d, mat, x, y, z, parent, cast = true, rec = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = rec; (parent || SCENE).add(m); return m; }
function uvScale(geo, s) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s[0], uv.getY(i) * s[1]); return geo; }
function wallBox(w, h, d, mat, x, y, z, parent) { const g = uvScale(new THREE.BoxGeometry(w, h, d), [Math.max(w, d) / 2.5, h / 2.5]); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; (parent || SCENE).add(m); return m; }
function gableRoof(w, d, h, parent, y) {
  const g = new THREE.Group(); const slope = Math.hypot(w / 2 + 0.4, h);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(uvScale(new THREE.BoxGeometry(slope, 0.25, d + 0.8), [2, 2]), MAT.roof); m.position.set(s * (w / 4 + 0.1), y + h / 2, 0); m.rotation.z = -s * Math.atan2(h, w / 2 + 0.4); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, h); tri.lineTo(-w / 2, 0);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), MAT.woodDark); m.position.set(0, y, s * d / 2); if (s < 0) m.rotation.y = Math.PI; g.add(m); }
  parent.add(g); return g;
}
function windowMesh(parent, x, y, z, ry, lit) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), lit ? new THREE.MeshBasicMaterial({ color: 0xffb060 }) : MAT.glass); g.add(glass);
  for (const [w, h, px, py] of [[1.05, 0.08, 0, 0.44], [1.05, 0.08, 0, -0.44], [0.08, 0.95, 0.48, 0], [0.08, 0.95, -0.48, 0], [0.05, 0.85, 0, 0], [0.9, 0.05, 0, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), MAT.woodDark); f.position.set(px, py, 0.02); g.add(f); }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.25), MAT.roof); sill.position.set(0, -0.48, 0.1); g.add(sill);
  parent.add(g); return { g, glass };
}
// --- simple closed house ---
function makeHouse(x, z, w, d, ry, seed) {
  const r = rng(seed); const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ry; SCENE.add(g);
  wallBox(w + 0.3, 0.7, d + 0.3, MAT.stone, 0, 0.1, 0, g);
  wallBox(w, 2.6, d, r() < 0.5 ? MAT.wood : MAT.plaster, 0, 1.75, 0, g);
  gableRoof(w, d, 1.6, g, 3.05);
  box(0.6, 1.4, 0.6, MAT.stone, w * 0.25, 4.1, -d * 0.2, g);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.08), MAT.woodDark); door.position.set(r() * 2 - 1, 1.45, d / 2 + 0.03); g.add(door);
  const wins = []; for (const s of [-1, 1]) wins.push(windowMesh(g, s * w * 0.3, 1.9, d / 2 + 0.03, 0));
  wins.push(windowMesh(g, w / 2 + 0.03, 1.9, 0, Math.PI / 2));
  // collider (world AABB, rotation 0 or 90 only)
  const hw = (Math.abs(Math.cos(ry)) > 0.5 ? w : d) / 2 + 0.2, hd = (Math.abs(Math.cos(ry)) > 0.5 ? d : w) / 2 + 0.2;
  addBox(x - hw, x + hw, z - hd, z + hd);
  // snow drift around base
  const drift = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(w, d) * 0.62, Math.max(w, d) * 0.7, 0.4, 16), MAT.snow); drift.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); drift.position.y = 0.05; drift.receiveShadow = true; g.add(drift);
  return { g, wins };
}
// --- imported model house (closed) ---
const HOUSE_S = 0.62;
function makeHouseModel(x, z, ry, seed) {
  const tpl = houseTemplate(); if (!tpl) return null;
  const b = tpl.userData.box, s = HOUSE_S, r = rng(seed);
  const cos = Math.round(Math.cos(ry)), sin = Math.round(Math.sin(ry));
  const corners = [[b[0][0], b[0][2]], [b[1][0], b[0][2]], [b[0][0], b[1][2]], [b[1][0], b[1][2]]].map(([lx, lz]) => [x + (lx * cos + lz * sin) * s, z + (-lx * sin + lz * cos) * s]);
  const hs = corners.map(([cx, cz]) => heightAt(cx, cz)); const y = Math.min(...hs) + 0.05;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; SCENE.add(g);
  const m = tpl.clone(); m.scale.setScalar(s); g.add(m);
  // stone plinth hides any gap where the ground falls away
  const pw = (b[1][0] - b[0][0]) * s, pd = (b[1][2] - b[0][2]) * s, pcx = (b[0][0] + b[1][0]) / 2 * s, pcz = (b[0][2] + b[1][2]) / 2 * s;
  const drop = Math.max(...hs) - y + 1.2; wallBox(pw * 0.96, drop, pd * 0.96, MAT.stone, pcx, -drop / 2 + 0.06, pcz, g);
  const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.snow); drift.scale.set(pw * 0.6, 0.32, pd * 0.6); drift.position.set(pcx, -0.18, pcz); drift.receiveShadow = true; g.add(drift);
  const xs = corners.map(c => c[0]), zs = corners.map(c => c[1]); addBox(Math.min(...xs) - 0.1, Math.max(...xs) + 0.1, Math.min(...zs) - 0.1, Math.max(...zs) + 0.1);
  // upper front window: a glass pane we can light (candle scene)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * s, 0.68 * s), MAT.glass); glass.position.set(0, 4.23 * s, 5.53 * s + 0.02); g.add(glass);
  return { g, wins: [{ g: glass, glass }] };
}
// --- pine trees (instanced) ---
function pineGeometry() {
  const geos = []; const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); const snow = y > 0 ? 0 : 0; a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const layers = [[2.6, 2.6, 1.6], [2.1, 2.3, 3.0], [1.6, 2.0, 4.3], [1.05, 1.8, 5.5], [0.55, 1.4, 6.5]];
  for (const [rad, h, y] of layers) {
    const c = new THREE.ConeGeometry(rad, h, 8, 1, true); c.translate(0, y, 0); geos.push(col(c, 0x14261c));
    const s = new THREE.ConeGeometry(rad * 0.86, h * 0.55, 8, 1, true); s.translate(0, y + h * 0.26, 0); s.rotateY(0.3); geos.push(col(s, 0xcfd9e6));
  }
  return mergeGeos(geos);
}
function mergeGeos(geos) {
  let n = 0; for (const g of geos) { const gi = g.index ? g.toNonIndexed() : g; g._ni = gi; n += gi.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { const gi = g._ni; gi.computeVertexNormals(); pos.set(gi.attributes.position.array, o * 3); nor.set(gi.attributes.normal.array, o * 3); if (gi.attributes.color) col.set(gi.attributes.color.array, o * 3); o += gi.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out;
}
function plantForest() {
  const r = rng(42); const pts = [];
  const ok = (x, z) => {
    if (Math.hypot(x, z * 0.9) < 54) return false;
    if (z > 40 && Math.abs(x) < 6.5) return false;                    // road
    if (Math.hypot(x - 45, z + 32) < 24) return false;              // mosque + cemetery
    if (Math.hypot(x + 25, z + 105) < 9) return false;               // hut clearing
    if (Math.abs(x + 34) < 12 && Math.abs(z - 44) < 8) return false; // school yard
    // trail to hut: segment (-10,-50)->(-25,-100)
    const ax = -10, az = -50, bx = -25, bz = -100; const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); if (Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))) < 3.2) return false;
    if (Math.abs(x) > 205 || Math.abs(z) > 205) return false;
    return true;
  };
  for (let i = 0; i < 4200 && pts.length < 1100; i++) {
    const x = (r() - 0.5) * 420, z = (r() - 0.5) * 420; if (!ok(x, z)) continue;
    const dens = z < -45 ? 1 : 0.55; if (r() > dens) continue;
    if (pts.some(p => Math.hypot(p[0] - x, p[1] - z) < 3.2)) continue;
    pts.push([x, z, 0.75 + r() * 0.6, r() * 6.28]);
  }
  const geo = pineGeometry(); const inst = new THREE.InstancedMesh(geo, MAT.pine, pts.length); inst.castShadow = true; inst.receiveShadow = true;
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6); trunkG.translate(0, 1.1, 0); const trunks = new THREE.InstancedMesh(trunkG, MAT.bark, pts.length); trunks.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  pts.forEach(([x, z, sc, rot], i) => { const y = heightAt(x, z) - 0.2; q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot); s.set(sc, sc * (0.9 + (i % 7) * 0.05), sc); p.set(x, y, z); m.compose(p, q, s); inst.setMatrixAt(i, m); trunks.setMatrixAt(i, m); addCircle(x, z, 0.35 * sc); });
  SCENE.add(inst); SCENE.add(trunks); W.trees = pts;
}
// --- dede's house (enterable) ---
const DEDE = { x: -18, z: -8 };
function buildDedeHouse() {
  const H = new THREE.Group(); const y0 = heightAt(DEDE.x, DEDE.z); H.position.set(DEDE.x, y0, DEDE.z); SCENE.add(H); W.dedeY = y0; W.objs.dede = H;
  const L = (lx, lz) => [DEDE.x + lx, DEDE.z + lz]; const T = 0.25, HT = 3;
  // floor + foundation
  const fl = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(10, 8), [3, 2.5]), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.42; fl.receiveShadow = true; H.add(fl);
  wallBox(10.5, 0.45, 8.5, MAT.stone, 0, 0.2, 0, H);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), MAT.woodDark); ceil.rotation.x = Math.PI / 2; ceil.position.y = HT + 0.42; H.add(ceil);
  for (let i = -4; i <= 4; i += 2) box(0.18, 0.22, 8, MAT.woodDark, i, HT + 0.3, 0, H, false);
  const seg = (x0, x1, z0, z1, mat) => { const w = Math.max(T, x1 - x0), d = Math.max(T, z1 - z0); wallBox(w, HT, d, mat, (x0 + x1) / 2, 0.42 + HT / 2, (z0 + z1) / 2, H); const a = L(x0, z0), b = L(x1, z1); addBox(Math.min(a[0], b[0]) - 0.02, Math.max(a[0], b[0]) + 0.02, Math.min(a[1], b[1]) - 0.02, Math.max(a[1], b[1]) + 0.02); };
  const outer = MAT.wood, inner = MAT.plaster;
  seg(-5, 5, -4 - T / 2, -4 + T / 2, outer);                              // north
  seg(-5, -0.65, 4 - T / 2, 4 + T / 2, outer); seg(0.65, 5, 4 - T / 2, 4 + T / 2, outer); // south with door gap
  wallBox(1.3, 0.8, T, outer, 0, 0.42 + HT - 0.4, 4, H);                // above door
  // west wall has a real window opening (z -2.45..-1.55, y 1.7..2.5) so the face at the window can be seen from inside
  { const wx = -5, wz0 = -2.45, wz1 = -1.55, y0w = 1.7, y1w = 2.5;
    wallBox(T, HT, wz0 + 4, outer, wx, 0.42 + HT / 2, (-4 + wz0) / 2, H); wallBox(T, HT, 4 - wz1, outer, wx, 0.42 + HT / 2, (wz1 + 4) / 2, H);
    wallBox(T, y0w - 0.42, wz1 - wz0, outer, wx, (0.42 + y0w) / 2, (wz0 + wz1) / 2, H); wallBox(T, 0.42 + HT - y1w, wz1 - wz0, outer, wx, (y1w + 0.42 + HT) / 2, (wz0 + wz1) / 2, H);
    const a = L(wx - T / 2, -4), b = L(wx + T / 2, 4); addBox(a[0] - 0.02, b[0] + 0.02, a[1] - 0.02, b[1] + 0.02); }
  seg(5 - T / 2, 5 + T / 2, -4, 4, outer); // east
  seg(-5, -3, -T / 2, T / 2, inner); seg(-2, 2, -T / 2, T / 2, inner); seg(3, 5, -T / 2, T / 2, inner); // partition
  wallBox(1, 0.7, T, inner, -2.5, 0.42 + HT - 0.35, 0, H); wallBox(1, 0.7, T, inner, 2.5, 0.42 + HT - 0.35, 0, H);
  seg(-T / 2, T / 2, -4, 0, inner);
  // interior plaster skins
  // interior plaster skins (south skin is split so the doorway stays open)
  const skin = (w, h, x, y, z, ry) => { const p = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(w, h), [w / 3, h / 3]), inner); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; H.add(p); return p; };
  skin(9.5, HT, 0, 0.42 + HT / 2, -3.86, 0);
  skin(4.1, HT, -2.7, 0.42 + HT / 2, 3.86, Math.PI); skin(4.1, HT, 2.7, 0.42 + HT / 2, 3.86, Math.PI);
  skin(1.3, 0.8, 0, 0.42 + HT - 0.4, 3.86, Math.PI);
  // door frame (jambs + lintel) so the opening reads clearly from both sides
  for (const sx of [-0.68, 0.68]) box(0.1, 2.3, T + 0.1, MAT.woodDark, sx, 0.42 + 1.15, 4, H);
  box(1.46, 0.12, T + 0.1, MAT.woodDark, 0, 0.42 + 2.26, 4, H); box(1.5, 0.05, 0.5, MAT.stone, 0, 0.44, 4.2, H);
  // west skin split around the window; east skin whole
  { const zA = -3.75, zB = 3.75, w0 = -2.45, w1 = -1.55, yb = 0.42, yt = 0.42 + HT; const sk = (z0, z1, y0, y1) => { const p = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(z1 - z0, y1 - y0), [(z1 - z0) / 3, (y1 - y0) / 3]), inner); p.position.set(-4.86, (y0 + y1) / 2, (z0 + z1) / 2); p.rotation.y = Math.PI / 2; p.receiveShadow = true; H.add(p); };
    sk(zA, w0, yb, yt); sk(w1, zB, yb, yt); sk(w0, w1, yb, 1.7); sk(w0, w1, 2.5, yt); }
  { const p = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(7.5, HT), [2.5, 1]), inner); p.position.set(4.86, 0.42 + HT / 2, 0); p.rotation.y = -Math.PI / 2; p.receiveShadow = true; H.add(p); }
  gableRoof(10.2, 8.2, 2, H, 0.42 + HT);
  box(0.8, 2.4, 0.8, MAT.stone, -2.5, 0.42 + HT + 1.3, -3.6, H); // chimney
  // windows
  W.dedeWinW = windowMesh(H, -5.14, 2.1, -2, -Math.PI / 2); windowMesh(H, 5.14, 2.1, -2, Math.PI / 2); windowMesh(H, -3, 2.1, 4.14, 0); windowMesh(H, 3, 2.1, 4.14, 0);
  // the west pane is see-through (night outside); inner frame + sill for it
  W.dedeWinW.glass.material = new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
  windowMesh(H, -4.84, 2.1, -2, Math.PI / 2).glass.visible = false;
  // interior faces of the other (decorative) windows so the rooms have windows from inside too
  for (const [x, z, ry] of [[4.84, -2, -Math.PI / 2], [-3, 3.84, Math.PI], [3, 3.84, Math.PI]]) { const iw = windowMesh(H, x, 2.1, z, ry); iw.glass.material = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.08, metalness: 0.5, emissive: 0x0a1220, emissiveIntensity: 0.6 }); }
  // front door (hinged)
  const dp = new THREE.Group(); dp.position.set(-0.62, 0.42, 4); H.add(dp); const door = box(1.24, 2.2, 0.08, MAT.woodDark, 0.62, 1.1, 0, dp); box(0.06, 0.06, 0.14, MAT.metal, 1.1, 1.05, 0.05, dp);
  const dcol = addBox(DEDE.x - 0.65, DEDE.x + 0.65, DEDE.z + 3.85, DEDE.z + 4.15, 'door');
  W.doors.dede = { pivot: dp, col: dcol, open: false, ang: 0, target: 0, locked: false };
  const lant = box(0.25, 0.4, 0.25, MAT.metal, 1.0, 2.8, 4.25, H, false); W.dedeLantern = new THREE.PointLight(0xffa860, 0, 9, 2); W.dedeLantern.position.set(DEDE.x + 1, y0 + 2.7, DEDE.z + 4.6); SCENE.add(W.dedeLantern);
  const lg = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060 })); lg.position.set(1, 2.75, 4.25); H.add(lg); W.dedeLanternBulb = lg;
  // exterior dressing: stone base band, corner posts, eaves trim, door canopy, shutters
  { const o = 0.06, bh = 1.0;
    wallBox(10.6, bh, 0.14, MAT.stone, 0, 0.42 + bh / 2, -4 - T / 2 - o, H); wallBox(0.14, bh, 8.2, MAT.stone, -5 - T / 2 - o, 0.42 + bh / 2, 0, H); wallBox(0.14, bh, 8.2, MAT.stone, 5 + T / 2 + o, 0.42 + bh / 2, 0, H);
    wallBox(4.3, bh, 0.14, MAT.stone, -2.85, 0.42 + bh / 2, 4 + T / 2 + o, H); wallBox(4.3, bh, 0.14, MAT.stone, 2.85, 0.42 + bh / 2, 4 + T / 2 + o, H);
    for (const [x, z] of [[-5.1, -4.1], [5.1, -4.1], [-5.1, 4.1], [5.1, 4.1]]) box(0.26, HT + 0.1, 0.26, MAT.woodDark, x, 0.42 + HT / 2, z, H);
    for (const z of [-4.12, 4.12]) box(10.5, 0.18, 0.12, MAT.woodDark, 0, 0.42 + HT - 0.05, z, H);
    const can = new THREE.Group(); can.position.set(0, 0.42 + 2.65, 4.55); H.add(can);
    for (const sx of [-1, 1]) { const r = box(1.15, 0.08, 1.3, MAT.roof, sx * 0.5, 0.22, 0, can); r.rotation.z = -sx * 0.42; }
    for (const sx of [-0.95, 0.95]) { box(0.12, 2.75, 0.12, MAT.woodDark, sx, -1.33, 0.5, can); }
    box(2.0, 0.12, 0.14, MAT.woodDark, 0, -0.05, 0.5, can);
    for (const [x, z, ry] of [[-3, 4.17, 0], [3, 4.17, 0], [5.17, -2, Math.PI / 2]]) { const sh = new THREE.Group(); sh.position.set(x, 2.1, z); sh.rotation.y = ry; H.add(sh); for (const sx of [-1, 1]) { const p = box(0.42, 0.95, 0.05, MAT.woodDark, sx * 0.72, 0, 0.03, sh); p.rotation.y = sx * 0.35; } }
  }
  // --- ocak (fireplace) in main room ---
  const oc = new THREE.Group(); oc.position.set(-2.5, 0.42, -3.55); H.add(oc);
  wallBox(1.9, 1.4, 0.7, MAT.stone, 0, 0.7, 0, oc); box(1.0, 0.8, 0.5, MAT.dark, 0, 0.5, 0.16, oc, false); wallBox(2.1, 0.15, 0.85, MAT.stone, 0, 1.45, 0.05, oc); wallBox(1.2, 1.6, 0.5, MAT.stone, 0, 2.3, -0.1, oc);
  W.ocakWood = new THREE.Group(); oc.add(W.ocakWood); for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.7, 6), MAT.bark); l.rotation.z = Math.PI / 2; l.rotation.y = (i - 1.5) * 0.3; l.position.set(0, 0.18 + (i % 2) * 0.1, 0.18); W.ocakWood.add(l); } W.ocakWood.visible = false;
  addBox(DEDE.x - 3.5, DEDE.x - 1.5, DEDE.z - 4, DEDE.z - 3.1);
  W.fireLight = new THREE.PointLight(0xff7a2a, 0, 12, 1.6); W.fireLight.position.set(DEDE.x - 2.5, y0 + 1.0, DEDE.z - 3.0); W.fireLight.castShadow = false; SCENE.add(W.fireLight);
  W.firePos = new THREE.Vector3(DEDE.x - 2.5, y0 + 0.75, DEDE.z - 3.35);
  // main room furniture
  const tbl = new THREE.Group(); tbl.position.set(-2.2, 0.42, -1.6); H.add(tbl); box(1.3, 0.08, 0.8, MAT.wood, 0, 0.75, 0, tbl); for (const [a, b] of [[-0.55, -0.32], [0.55, -0.32], [-0.55, 0.32], [0.55, 0.32]]) box(0.07, 0.75, 0.07, MAT.woodDark, a, 0.37, b, tbl);
  addBox(DEDE.x - 2.9, DEDE.x - 1.5, DEDE.z - 2.05, DEDE.z - 1.15);
  const lamp = new THREE.Group(); lamp.position.set(-2.55, 1.22, -1.65); H.add(lamp); box(0.16, 0.06, 0.16, MAT.metal, 0, 0, 0, lamp, false); const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.35, emissive: 0x000000 })); chim.position.y = 0.14; lamp.add(chim); W.lampChim = chim;
  W.lampLight = new THREE.PointLight(0xffb070, 0, 10, 1.7); W.lampLight.position.set(DEDE.x - 2.55, y0 + 1.75, DEDE.z - 1.65); SCENE.add(W.lampLight);
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), MAT.paper); note.rotation.x = -Math.PI / 2; note.rotation.z = 0.3; note.position.set(-1.9, 1.215, -1.5); H.add(note); W.note2Mesh = note;
  const chair = new THREE.Group(); chair.position.set(-1.0, 0.42, -1.6); H.add(chair); box(0.5, 0.06, 0.5, MAT.wood, 0, 0.45, 0, chair); box(0.5, 0.6, 0.06, MAT.wood, 0, 0.75, -0.22, chair); for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(0.05, 0.45, 0.05, MAT.woodDark, a, 0.22, b, chair); chair.rotation.y = 1.3;
  const sedir = box(0.8, 0.45, 3, MAT.fabric, -4.45, 0.64, -2, H); const kil = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), MAT.kilim); kil.rotation.x = -Math.PI / 2; kil.position.set(-2.4, 0.43, -2); kil.receiveShadow = true; H.add(kil);
  addBox(DEDE.x - 5, DEDE.x - 4, DEDE.z - 3.5, DEDE.z - 0.5);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshStandardMaterial({ map: TEX.photo, roughness: 0.7 })); photo.position.set(-1.0, 2.2, -3.85); H.add(photo);
  // kitchen
  const cab = new THREE.Group(); cab.position.set(4.35, 0.42, -2.6); H.add(cab); box(1.1, 0.9, 1.8, MAT.wood, 0, 0.45, 0, cab); box(1.2, 0.06, 1.9, MAT.woodDark, 0, 0.92, 0, cab); box(0.02, 0.25, 0.7, MAT.woodDark, -0.56, 0.7, -0.4, cab); box(0.02, 0.25, 0.7, MAT.woodDark, -0.56, 0.7, 0.4, cab);
  addBox(DEDE.x + 3.8, DEDE.x + 5, DEDE.z - 3.6, DEDE.z - 1.6);
  const stove = box(0.7, 0.9, 0.7, MAT.metal, 1.0, 0.87, -3.4, H); addBox(DEDE.x + 0.6, DEDE.x + 1.4, DEDE.z - 3.8, DEDE.z - 3);
  for (let i = 0; i < 3; i++) { const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8), new THREE.MeshStandardMaterial({ color: [0x6a3a20, 0x9a8a40, 0x3a5a3a][i], roughness: 0.4, transparent: true, opacity: 0.85 })); jar.position.set(4.3, 1.45 + 0, -3.2 + i * 0.3); H.add(jar); }
  box(1.2, 0.05, 0.3, MAT.wood, 4.6, 1.35, -2.9, H, false);
  // hallway mirror
  const mirrorFrame = box(0.06, 1.3, 0.8, MAT.woodDark, -4.84, 1.9, 2.0, H, false);
  W.mirrorAt = { x: DEDE.x - 4.80, y: y0 + 1.9, z: DEDE.z + 2.0 };
  const rack = new THREE.Group(); rack.position.set(4.6, 0.42, 2.6); H.add(rack); box(0.08, 1.8, 0.08, MAT.woodDark, 0, 0.9, 0, rack); const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 })); coat.position.set(0, 1.1, 0.15); rack.add(coat);
  const run = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.4), MAT.kilim); run.rotation.x = -Math.PI / 2; run.rotation.z = Math.PI / 2; run.position.set(0, 0.43, 2); H.add(run);
  W.indoorBoxes.push({ minx: DEDE.x - 5, maxx: DEDE.x + 5, minz: DEDE.z - 4, maxz: DEDE.z + 4, y: y0 });
  // interactables
  addInter({ id: 'dedeDoor', x: DEDE.x, y: y0 + 1.4, z: DEDE.z + 4.1, label: 'Kapı', r: 2.0 });
  addInter({ id: 'matches', x: DEDE.x + 3.8, y: y0 + 1.2, z: DEDE.z - 2.6, label: 'Çekmeceyi aç', on: false });
  addInter({ id: 'lamp', x: DEDE.x - 2.55, y: y0 + 1.3, z: DEDE.z - 1.65, label: 'Gaz lambasını yak', on: false });
  addInter({ id: 'note2', x: DEDE.x - 1.9, y: y0 + 1.25, z: DEDE.z - 1.5, label: 'Notu oku', on: false });
  addInter({ id: 'ocak', x: DEDE.x - 2.5, y: y0 + 0.9, z: DEDE.z - 3.0, label: 'Ocak', on: false, r: 2.0 });
  addInter({ id: 'photo', x: DEDE.x - 1.0, y: y0 + 2.2, z: DEDE.z - 3.8, label: 'Fotoğrafa bak', r: 1.8 });
}
// --- woodcutter hut ---
const HUT = { x: -25, z: -105 };
function buildHut() {
  const G = new THREE.Group(); const y0 = heightAt(HUT.x, HUT.z); G.position.set(HUT.x, y0, HUT.z); SCENE.add(G); W.hutY = y0;
  const T = 0.22, HT = 2.5; const seg = (x0, x1, z0, z1) => { wallBox(Math.max(T, x1 - x0), HT, Math.max(T, z1 - z0), MAT.woodDark, (x0 + x1) / 2, 0.3 + HT / 2, (z0 + z1) / 2, G); addBox(HUT.x + Math.min(x0, x1) - 0.02, HUT.x + Math.max(x0, x1) + 0.02, HUT.z + Math.min(z0, z1) - 0.02, HUT.z + Math.max(z0, z1) + 0.02); };
  wallBox(5.4, 0.35, 4.4, MAT.stone, 0, 0.12, 0, G); const fl = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.31; fl.receiveShadow = true; G.add(fl);
  seg(-2.5, 2.5, -2 - T / 2, -2 + T / 2); seg(-2.5, -0.55, 2 - T / 2, 2 + T / 2); seg(0.55, 2.5, 2 - T / 2, 2 + T / 2); seg(-2.5 - T / 2, -2.5 + T / 2, -2, 2); seg(2.5 - T / 2, 2.5 + T / 2, -2, 2);
  wallBox(1.1, 0.5, T, MAT.woodDark, 0, 0.3 + HT - 0.25, 2, G);
  gableRoof(5.2, 4.2, 1.4, G, 0.3 + HT); const ceil = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), MAT.woodDark); ceil.rotation.x = Math.PI / 2; ceil.position.y = 0.3 + HT; G.add(ceil);
  windowMesh(G, 2.64, 1.7, 0, Math.PI / 2);
  // wood pile
  const pile = new THREE.Group(); pile.position.set(-1.7, 0.3, -1.4); G.add(pile); W.hutWood = pile;
  for (let i = 0; i < 14; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 7), MAT.bark); l.rotation.x = Math.PI / 2; l.position.set((i % 4 - 1.5) * 0.2, 0.1 + Math.floor(i / 4) * 0.17, 0); l.castShadow = true; pile.add(l); }
  addBox(HUT.x - 2.3, HUT.x - 1.2, HUT.z - 1.9, HUT.z - 0.9);
  // shelf with kav
  box(1.2, 0.05, 0.35, MAT.wood, 1.7, 1.4, -1.75, G, false); const kav = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 1 })); kav.scale.set(1.3, 0.6, 1); kav.position.set(1.6, 1.5, -1.75); G.add(kav); W.hutKav = kav;
  // table + chest
  box(1.0, 0.06, 0.6, MAT.wood, 1.4, 0.95, 0.3, G); for (const [a, b] of [[0.95, 0.05], [1.85, 0.05], [0.95, 0.55], [1.85, 0.55]]) box(0.06, 0.65, 0.06, MAT.woodDark, a, 0.62, b, G);
  const chest = new THREE.Group(); chest.position.set(1.4, 0.98, 0.3); G.add(chest); box(0.55, 0.3, 0.35, MAT.wood, 0, 0.15, 0, chest); const lid = box(0.57, 0.06, 0.37, MAT.woodDark, 0, 0.32, 0, chest); box(0.08, 0.1, 0.02, MAT.metal, 0, 0.2, 0.18, chest); W.hutChestLid = lid;
  addBox(HUT.x + 0.85, HUT.x + 1.95, HUT.z, HUT.z + 0.65);
  // wardrobe (hiding spot)
  const wd = new THREE.Group(); wd.position.set(-1.95, 0.3, 0.9); G.add(wd); wallBox(0.75, 2.0, 1.1, MAT.wood, 0, 1.0, 0, wd); box(0.04, 1.8, 0.5, MAT.woodDark, 0.39, 1.0, -0.26, wd); box(0.04, 1.8, 0.5, MAT.woodDark, 0.39, 1.0, 0.26, wd);
  addBox(HUT.x - 2.35, HUT.x - 1.55, HUT.z + 0.33, HUT.z + 1.47);
  W.hutHide = { x: HUT.x - 1.95, y: y0 + 1.9, z: HUT.z + 0.9 };
  W.indoorBoxes.push({ minx: HUT.x - 2.5, maxx: HUT.x + 2.5, minz: HUT.z - 2, maxz: HUT.z + 2, y: y0 });
  addInter({ id: 'wood', x: HUT.x - 1.7, y: y0 + 0.7, z: HUT.z - 1.4, label: 'Odunu al', on: false });
  addInter({ id: 'kav', x: HUT.x + 1.6, y: y0 + 1.5, z: HUT.z - 1.75, label: 'Kavı al', on: false });
  addInter({ id: 'chest', x: HUT.x + 1.4, y: y0 + 1.2, z: HUT.z + 0.3, label: 'Sandığı aç', on: false });
  addInter({ id: 'wardrobe', x: HUT.x - 1.55, y: y0 + 1.3, z: HUT.z + 0.9, label: 'Dolaba saklan', on: false });
}
// --- village school (Koçoğlu İlkokulu) : enterable ---
const SCHOOL = { x: -34, z: 44 };
function buildSchool() {
  const S = new THREE.Group(); const y0 = heightAt(SCHOOL.x, SCHOOL.z); S.position.set(SCHOOL.x, y0, SCHOOL.z); SCENE.add(S); W.schoolY = y0; W.objs.school = S;
  const T = 0.25, HT = 3.1, F = 0.31; const L = (lx, lz) => [SCHOOL.x + lx, SCHOOL.z + lz];
  const seg = (x0, x1, z0, z1, mat) => { const w = Math.max(T, x1 - x0), d = Math.max(T, z1 - z0); wallBox(w, HT, d, mat, (x0 + x1) / 2, F + HT / 2, (z0 + z1) / 2, S); const a = L(x0, z0), b = L(x1, z1); addBox(Math.min(a[0], b[0]) - 0.02, Math.max(a[0], b[0]) + 0.02, Math.min(a[1], b[1]) - 0.02, Math.max(a[1], b[1]) + 0.02); };
  const wall = MAT.plaster;
  wallBox(14.5, 0.5, 8.5, MAT.stone, 0, 0.05, 0, S);
  const fl = new THREE.Mesh(uvScale(new THREE.PlaneGeometry(14, 8), [5, 3]), MAT.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = F; fl.receiveShadow = true; S.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), MAT.plaster); ce.rotation.x = Math.PI / 2; ce.position.y = F + HT; S.add(ce);
  // outer walls: north/south long walls, west wall, east wall with entrance (z 1.4..2.6)
  seg(-7, 7, -4 - T / 2, -4 + T / 2, wall); seg(-7, 7, 4 - T / 2, 4 + T / 2, wall); seg(-7 - T / 2, -7 + T / 2, -4, 4, wall);
  seg(7 - T / 2, 7 + T / 2, -4, 1.4, wall); seg(7 - T / 2, 7 + T / 2, 2.6, 4, wall); wallBox(T, 0.8, 1.2, wall, 7, F + HT - 0.4, 2, S);
  // classroom | east part partition at x=1 with doorway z 1.4..2.6 ; teacher room | hall partition at z=0 (x 1..7) with doorway x 3.5..4.5
  seg(1 - T / 2, 1 + T / 2, -4, 1.4, wall); seg(1 - T / 2, 1 + T / 2, 2.6, 4, wall); wallBox(T, 0.8, 1.2, wall, 1, F + HT - 0.4, 2, S);
  seg(1, 3.5, -T / 2, T / 2, wall); seg(4.5, 7, -T / 2, T / 2, wall); wallBox(1, 0.8, T, wall, 4, F + HT - 0.4, 0, S);
  // wainscot (painted lower band) inside the classroom
  const wain = new THREE.MeshStandardMaterial({ color: 0x3e5a52, roughness: 0.8, map: TEX.plaster, normalMap: TEX.plasterN });
  for (const [w, x, z, ry] of [[7.7, -3, -3.86, 0], [7.7, -3, 3.86, Math.PI]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), wain); p.position.set(x, F + 0.55, z); p.rotation.y = ry; S.add(p); }
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(7.7, 1.1), wain); p.position.set(-6.86, F + 0.55, 0); p.rotation.y = Math.PI / 2; S.add(p); }
  gableRoof(14.6, 8.6, 1.8, S, F + HT);
  box(0.7, 1.8, 0.7, MAT.stone, -4, F + HT + 1.4, -2.6, S); // chimney
  // windows (outside + inside faces) on the long walls of the classroom
  for (const x of [-5, -2.2]) { windowMesh(S, x, 2.0, -4.14, Math.PI); windowMesh(S, x, 2.0, 4.14, 0); const a = windowMesh(S, x, 2.0, -3.86, 0), b = windowMesh(S, x, 2.0, 3.86, Math.PI); for (const w of [a, b]) w.glass.material = new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.08, metalness: 0.5, emissive: 0x0a1220, emissiveIntensity: 0.6 }); }
  windowMesh(S, 4, 2.0, -4.14, Math.PI);
  // entrance: door hanging open, sign above
  const dp = new THREE.Group(); dp.position.set(7, F, 1.4); S.add(dp); box(0.08, 2.3, 1.2, MAT.woodDark, 0, 1.15, 0.6, dp); dp.rotation.y = -1.9; W.schoolDoor = dp;
  for (const z of [1.33, 2.67]) box(T + 0.1, 2.4, 0.1, MAT.woodDark, 7, F + 1.2, z, S);
  const signTex = canvasTex(512, 96, (g, w, h) => { g.fillStyle = '#e9e2cf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7a1c18'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#1d2a4a'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KOÇOĞLU İLKOKULU', w / 2, h / 2 + 2); g.fillStyle = 'rgba(40,30,20,.25)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 })); sign.position.set(7.16, F + HT - 0.15, 2); sign.rotation.y = Math.PI / 2; S.add(sign);
  // flag pole outside
  box(0.08, 6, 0.08, MAT.metal, 9.5, 3, -2, S); addCircle(SCHOOL.x + 9.5, SCHOOL.z - 2, 0.2);
  // blackboard on the west wall; its texture is swapped during a scare
  const mkBoard = (lines) => canvasTex(1024, 384, (g, w, h) => { g.fillStyle = '#1f3a2e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); } g.fillStyle = 'rgba(240,240,230,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([t, f, y]) => { g.font = f; g.fillText(t, w / 2, y); }); });
  W.boardTex = [mkBoard([['5. SINIF   —   ZEMHERİ', 'italic 40px "Comic Sans MS", cursive', 70], ['HALİL  +  EMİRHAN', 'bold 64px "Comic Sans MS", cursive', 190], ['en iyi arkadaş', 'italic 38px "Comic Sans MS", cursive', 290]]),
    mkBoard([['AÇ KAPIYI HALİL', 'bold 92px "Comic Sans MS", cursive', 130], ['AÇ  AÇ  AÇ  AÇ  AÇ', 'bold 60px "Comic Sans MS", cursive', 270]])];
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.5), new THREE.MeshStandardMaterial({ map: W.boardTex[0], roughness: 0.9 })); board.position.set(-6.85, F + 1.75, 0); board.rotation.y = Math.PI / 2; S.add(board); W.board = board;
  box(0.08, 1.7, 4.4, MAT.woodDark, -6.9, F + 1.75, 0, S, false); box(0.18, 0.05, 4.2, MAT.wood, -6.78, F + 0.98, 0, S, false);
  // teacher's desk + chair, three rows of pupils' desks
  const tdesk = new THREE.Group(); tdesk.position.set(-5.3, F, 1.6); S.add(tdesk); box(0.8, 0.08, 1.5, MAT.wood, 0, 0.78, 0, tdesk); box(0.75, 0.7, 0.06, MAT.woodDark, 0.0, 0.42, -0.7, tdesk); box(0.75, 0.7, 0.06, MAT.woodDark, 0, 0.42, 0.7, tdesk);
  addBox(SCHOOL.x - 5.7, SCHOOL.x - 4.9, SCHOOL.z + 0.85, SCHOOL.z + 2.35);
  W.desks = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const d = new THREE.Group(); const x = -3.6 + r * 1.55, z = -2.4 + c * 1.9; d.position.set(x, F, z); S.add(d);
    box(0.55, 0.05, 1.2, MAT.wood, 0, 0.72, 0, d); for (const [a, b] of [[-0.22, -0.52], [0.22, -0.52], [-0.22, 0.52], [0.22, 0.52]]) box(0.04, 0.72, 0.04, MAT.metal, a, 0.36, b, d);
    box(0.32, 0.04, 1.1, MAT.wood, 0.5, 0.42, 0, d); box(0.04, 0.42, 1.1, MAT.wood, 0.66, 0.62, 0, d);
    d.userData.base = { x, z, ry: 0 }; W.desks.push(d); addBox(SCHOOL.x + x - 0.35, SCHOOL.x + x + 0.7, SCHOOL.z + z - 0.62, SCHOOL.z + z + 0.62);
  }
  // wood stove + pipe
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.8, 14), MAT.metal); st.position.set(-0.3, F + 0.4, -3.2); S.add(st); const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), MAT.metal); pipe.position.set(-0.3, F + 1.9, -3.2); S.add(pipe); addCircle(SCHOOL.x - 0.3, SCHOOL.z - 3.2, 0.45);
  // the photograph on the south wall of the classroom
  const ptex = window.OKUL_PHOTO ? texFromData(OKUL_PHOTO, true) : TEX.photo;
  const pf = new THREE.Group(); pf.position.set(-3.6, F + 1.75, 3.84); pf.rotation.y = Math.PI; S.add(pf);
  box(0.62, 1.02, 0.04, MAT.woodDark, 0, 0, -0.01, pf, false); const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.89), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.55 })); ph.position.z = 0.015; pf.add(ph);
  W.schoolPhotoAt = { x: SCHOOL.x - 3.6, y: y0 + F + 1.75, z: SCHOOL.z + 3.8 };
  // hall: school bell; teacher room: cabinet + desk with the well crank
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.35 })); bell.rotation.x = Math.PI; bell.position.set(6.8, F + 2.4, 3.2); S.add(bell); W.schoolBellPos = new THREE.Vector3(SCHOOL.x + 6.8, y0 + F + 2.4, SCHOOL.z + 3.2);
  const cab = box(0.5, 2.0, 1.4, MAT.woodDark, 6.6, F + 1.0, -2.6, S); addBox(SCHOOL.x + 6.3, SCHOOL.x + 7, SCHOOL.z - 3.35, SCHOOL.z - 1.85);
  const td2 = new THREE.Group(); td2.position.set(3.2, F, -2.3); S.add(td2); box(1.4, 0.07, 0.75, MAT.wood, 0, 0.76, 0, td2); for (const [a, b] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) box(0.06, 0.76, 0.06, MAT.woodDark, a, 0.38, b, td2);
  addBox(SCHOOL.x + 2.45, SCHOOL.x + 3.95, SCHOOL.z - 2.7, SCHOOL.z - 1.9);
  const kol = new THREE.Group(); kol.position.set(3.3, F + 0.82, -2.25); S.add(kol); box(0.5, 0.04, 0.04, MAT.metal, 0, 0, 0, kol); box(0.04, 0.04, 0.22, MAT.metal, 0.24, 0, 0.1, kol); const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), MAT.woodDark); grip.rotation.x = Math.PI / 2; grip.position.set(0.24, 0, 0.24); kol.add(grip); W.kolMesh = kol;
  W.indoorBoxes.push({ minx: SCHOOL.x - 7, maxx: SCHOOL.x + 7, minz: SCHOOL.z - 4, maxz: SCHOOL.z + 4, y: y0 }); W.schoolBox = W.indoorBoxes[W.indoorBoxes.length - 1];
  addInter({ id: 'schoolPhoto', x: W.schoolPhotoAt.x, y: W.schoolPhotoAt.y, z: W.schoolPhotoAt.z, label: 'Fotoğrafı incele', r: 2.0, on: false });
  addInter({ id: 'kol', x: SCHOOL.x + 3.3, y: y0 + F + 0.9, z: SCHOOL.z - 2.25, label: 'Kuyu kolunu al', r: 1.8, on: false });
  addInter({ id: 'board', x: SCHOOL.x - 6.8, y: y0 + F + 1.75, z: SCHOOL.z, label: 'Tahtaya bak', r: 2.6, on: false });
}
// --- well, mosque, cemetery, sign, fences ---
const WELL = { x: 6, z: 4 };
function buildVillageProps() {
  const y = heightAt(WELL.x, WELL.z); const G = new THREE.Group(); G.position.set(WELL.x, y, WELL.z); SCENE.add(G); W.wellG = G; W.wellY = y;
  const ring = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(1.0, 1.05, 0.95, 18, 1, true), [3, 0.5]), MAT.stone); ring.position.y = 0.47; ring.castShadow = true; ring.receiveShadow = true; G.add(ring);
  const ringIn = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.95, 18, 1, true), MAT.stone); ringIn.material = MAT.stone.clone(); ringIn.material.side = THREE.BackSide; ringIn.position.y = 0.47; G.add(ringIn);
  const top = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.08, 18), MAT.roof); top.rotation.x = -Math.PI / 2; top.position.y = 0.96; G.add(top);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.83, 18), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.6; G.add(hole);
  for (const s of [-1, 1]) box(0.14, 2.2, 0.14, MAT.woodDark, s * 1.05, 1.1, 0, G);
  const roofG = new THREE.Group(); roofG.position.y = 2.2; G.add(roofG); for (const s of [-1, 1]) { const m = box(1.1, 0.06, 1.5, MAT.roof, s * 0.42, 0.25, 0, roofG); m.rotation.z = -s * 0.6; }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), MAT.wood); axle.rotation.z = Math.PI / 2; axle.position.y = 1.75; G.add(axle); W.wellAxle = axle;
  const crank = box(0.05, 0.4, 0.05, MAT.metal, 1.2, 1.6, 0, G, false);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), new THREE.MeshStandardMaterial({ color: 0x8a7a5a })); rope.position.set(0, 1.25, 0); G.add(rope); W.wellRope = rope;
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.25, 10), MAT.woodDark); bucket.position.set(0, 0.6, 0); G.add(bucket); W.wellBucket = bucket; bucket.visible = false;
  addCircle(WELL.x, WELL.z, 1.15);
  addInter({ id: 'well', x: WELL.x, y: y + 1.0, z: WELL.z, label: 'Kuyuya bak', r: 2.4 });
  // mosque
  const mx = 34, mz = -24, my = heightAt(mx, mz); const M = new THREE.Group(); M.position.set(mx, my, mz); SCENE.add(M);
  wallBox(8.4, 0.6, 8.4, MAT.stone, 0, 0.1, 0, M); wallBox(8, 5, 8, MAT.plaster, 0, 2.8, 0, M);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.roof); dome.position.y = 5.3; dome.castShadow = true; M.add(dome);
  const alem = box(0.08, 0.7, 0.08, MAT.metal, 0, 8.9, 0, M, false);
  const mn = new THREE.Group(); mn.position.set(4.6, 0, 4.6); M.add(mn); const shaft = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(0.55, 0.65, 14, 12), [2, 4]), MAT.plaster); shaft.position.y = 7; shaft.castShadow = true; mn.add(shaft);
  const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.8, 0.3, 12), MAT.stone); bal.position.y = 11; mn.add(bal);
  { const lm = new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false }); for (let i = 0; i < 10; i++) { const a2 = i / 10 * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), lm); l.position.set(Math.cos(a2) * 0.92, 11.25, Math.sin(a2) * 0.92); mn.add(l); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffb060, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); halo.scale.set(4.5, 2.2, 1); halo.position.y = 11.3; mn.add(halo); } const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.4, 12), MAT.roof); cone.position.y = 15.2; mn.add(cone);
  for (const [x, z, ry] of [[0, 4.03, 0], [-4.03, 0, -Math.PI / 2], [4.03, 0, Math.PI / 2]]) { const a = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), MAT.glass); a.position.set(x, 3, z); a.rotation.y = ry; M.add(a); }
  box(1.4, 2.4, 0.1, MAT.woodDark, -2, 1.6, 4.03, M, false);
  addBox(mx - 4.3, mx + 4.3, mz - 4.3, mz + 4.3); addCircle(mx + 4.6, mz + 4.6, 0.8);
  // cemetery: low wall + stones
  const cx0 = 42, cx1 = 62, cz0 = -48, cz1 = -30; const r = rng(99);
  const wallSeg = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0); const m = new THREE.Mesh(uvScale(new THREE.BoxGeometry(l, 0.8, 0.4), [l / 2, 0.4]), MAT.stone); m.position.set((x0 + x1) / 2, heightAt((x0 + x1) / 2, (z0 + z1) / 2) + 0.3, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); m.castShadow = true; m.receiveShadow = true; SCENE.add(m); addBox(Math.min(x0, x1) - 0.2, Math.max(x0, x1) + 0.2, Math.min(z0, z1) - 0.2, Math.max(z0, z1) + 0.2); };
  wallSeg(cx0, cz0, cx1, cz0); wallSeg(cx0, cz1, cx1, cz1); wallSeg(cx1, cz0, cx1, cz1); wallSeg(cx0, cz0, cx0, -40.5); wallSeg(cx0, -37.5, cx0, cz1);
  const stoneG = new THREE.BoxGeometry(0.5, 1, 0.12); const turbG = new THREE.SphereGeometry(0.2, 8, 6);
  for (let x = cx0 + 2.5; x < cx1 - 1; x += 2.4) for (let z = cz0 + 2; z < cz1 - 1; z += 2.8) {
    if (Math.abs(x - 52.4) < 1.5 && Math.abs(z - (-39.6)) < 1.5) continue; if (r() < 0.2) continue;
    const yy = heightAt(x, z); const s = new THREE.Mesh(stoneG, MAT.rock); const h = 0.6 + r() * 0.7; s.scale.set(1, h, 1); s.position.set(x + r() * 0.4, yy + h / 2, z); s.rotation.set((r() - 0.5) * 0.25, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2); s.castShadow = true; SCENE.add(s);
    if (r() < 0.35) { const t = new THREE.Mesh(turbG, MAT.rock); t.scale.set(1, 0.8, 1); t.position.set(s.position.x, yy + h + 0.1, z); SCENE.add(t); }
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5, 0, 6.3, 0, 1.4), MAT.snow); mound.scale.set(0.9, 0.35, 1.8); mound.position.set(x, yy, z + 1.0); SCENE.add(mound);
  }
  // dede's grave
  const gx = 52.4, gz = -39.6, gy = heightAt(gx, gz); const gs = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.3, 0.16), [MAT.rock, MAT.rock, MAT.roof, MAT.rock, new THREE.MeshStandardMaterial({ map: TEX.grave, roughness: 0.9 }), MAT.rock]); gs.position.set(gx, gy + 0.65, gz); gs.castShadow = true; SCENE.add(gs);
  const fresh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, 6.3, 0, 1.4), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1 })); fresh.scale.set(0.9, 0.4, 1.9); fresh.position.set(gx, gy, gz + 1.2); SCENE.add(fresh);
  addInter({ id: 'grave', x: gx, y: gy + 1, z: gz + 0.2, label: 'Mezar taşını oku', r: 2.2, on: false });
  // sign
  const sy = heightAt(5, 62); for (const s of [-1, 1]) box(0.12, 2.2, 0.12, MAT.woodDark, 5 + s * 1.1, sy + 1.1, 62); const sg = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.65, 0.08), [MAT.wood, MAT.wood, MAT.roof, MAT.wood, new THREE.MeshStandardMaterial({ map: TEX.sign, roughness: 0.9 }), MAT.wood]); sg.position.set(5, sy + 1.8, 62); sg.rotation.y = 0; sg.castShadow = true; SCENE.add(sg);
  // fences & dead lamp posts
  const postG = new THREE.BoxGeometry(0.1, 1.1, 0.1); const posts = []; const fr = rng(5);
  for (const [x0, z0, x1, z1] of [[-24, -14, -12, -14], [-24, -14, -24, -2], [-12, -14, -12, -6], [8, -26, 18, -26], [24, 6, 34, 6], [-42, 12, -30, 12], [16, 28, 26, 28], [-12, 30, -4, 30]]) { const l = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(l / 1.6); for (let i = 0; i <= n; i++) { if (fr() < 0.15) continue; const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; posts.push([x, z, (fr() - 0.5) * 0.3]); } }
  const pi = new THREE.InstancedMesh(postG, MAT.woodDark, posts.length); const mm = new THREE.Matrix4(); posts.forEach(([x, z, t], i) => { mm.makeRotationZ(t); mm.setPosition(x, heightAt(x, z) + 0.5, z); pi.setMatrixAt(i, mm); }); pi.castShadow = true; SCENE.add(pi);
  for (const [x, z] of [[-3, 45], [3, 28], [-6, 8], [14, -12], [-8, -40]]) { const yy = heightAt(x, z); box(0.16, 4.5, 0.16, MAT.woodDark, x, yy + 2.25, z); box(0.9, 0.08, 0.08, MAT.woodDark, x + 0.35, yy + 4.3, z); const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), MAT.glass); b.position.set(x + 0.75, yy + 4.1, z); SCENE.add(b); addCircle(x, z, 0.2); }
  W.flickerPost = (() => { const x = -8, z = -40, yy = heightAt(x, z); const l = new THREE.PointLight(0xffd090, 0, 14, 1.8); l.position.set(x + 0.75, yy + 4.0, z); SCENE.add(l); return l; })();
}
// --- minibus (intro) ---
function buildBus() {
  const G = new THREE.Group(); SCENE.add(G); const body = new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.6, metalness: 0.2 });
  box(2.1, 2.0, 5.2, body, 0, 1.4, 0, G); box(2.12, 0.6, 3.6, new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffb060, emissiveIntensity: 0.6 }), 0, 1.9, -0.4, G, false);
  for (const [x, z] of [[-1.05, 1.6], [1.05, 1.6], [-1.05, -1.6], [1.05, -1.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), MAT.dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); G.add(w); }
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); t.position.set(s * 0.8, 1.0, 2.62); G.add(t); }
  const tail = new THREE.PointLight(0xff2a1a, 6, 10, 2); tail.position.set(0, 1, 3.2); G.add(tail);
  const head = new THREE.SpotLight(0xfff0d0, 120, 40, 0.5, 0.5, 1.5); head.position.set(0, 1.2, -2.7); head.target.position.set(0, 0, -15); G.add(head); G.add(head.target);
  W.bus = G; return G;
}
// --- snowfall ---
function buildSnowfall() {
  const N = 3500, pos = new Float32Array(N * 3), rnd = new Float32Array(N); const r = rng(3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 50; pos[i * 3 + 1] = r() * 22; pos[i * 3 + 2] = (r() - 0.5) * 50; rnd[i] = r(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: 2.5 }, uOpacity: { value: 0.85 }, uSize: { value: 26 } },
    vertexShader: `attribute float rnd; uniform float uTime; uniform vec3 uCam; uniform float uWind; uniform float uSize; varying float vA;
      void main(){ vec3 p = position; float fall = uTime*(1.1+rnd*0.9); p.y = mod(p.y - fall, 22.0); p.x += sin(uTime*0.7+rnd*20.0)*0.6 + uTime*uWind*(0.6+rnd*0.4); p.z += cos(uTime*0.5+rnd*13.0)*0.5;
      p.x = mod(p.x - uCam.x + 25.0, 50.0) - 25.0 + uCam.x; p.z = mod(p.z - uCam.z + 25.0, 50.0) - 25.0 + uCam.z; p.y += uCam.y - 8.0;
      vec4 mv = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mv; float d = -mv.z; gl_PointSize = uSize * (0.4+rnd*0.8) / max(d,0.5); vA = smoothstep(40.0, 4.0, d) * smoothstep(0.2, 1.5, d); }`,
    fragmentShader: `uniform float uOpacity; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.5,0.1,length(c)); gl_FragColor = vec4(0.86,0.9,0.97, a*vA*uOpacity); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; SCENE.add(pts); W.snow = pts; return pts;
}
// footprints
const footGeo = new THREE.PlaneGeometry(0.22, 0.42), clawGeo = new THREE.PlaneGeometry(0.55, 0.6);
function footprint(x, z, rot, big) {
  const m = new THREE.Mesh(big ? clawGeo : footGeo, new THREE.MeshBasicMaterial({ map: big ? TEX.claw : TEX.foot, transparent: true, depthWrite: false, opacity: 0 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -rot; m.position.set(x, heightAt(x, z) + 0.03, z); SCENE.add(m); W.foot.push(m);
  if (W.foot.length > 120) { const o = W.foot.shift(); SCENE.remove(o); }
  m.userData.fade = 0; return m;
}
function buildWorld() {
  buildTextures(); buildMaterials();
  const tg = new THREE.PlaneGeometry(420, 420, 160, 160); tg.rotateX(-Math.PI / 2); const p = tg.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i))); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, MAT.snow); terrain.receiveShadow = true; SCENE.add(terrain); W.terrain = terrain;
  // road tracks (darker snow)
  const rg = new THREE.PlaneGeometry(4.5, 170, 1, 60); rg.rotateX(-Math.PI / 2); const rp = rg.attributes.position; for (let i = 0; i < rp.count; i++) { rp.setZ(i, rp.getZ(i) + 120); rp.setY(i, heightAt(rp.getX(i), rp.getZ(i)) + 0.02); }
  const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x9aa4b2, map: TEX.snowRoad || TEX.snow, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false })); road.receiveShadow = true; SCENE.add(road);
  plantForest(); buildDedeHouse(); buildHut(); buildSchool(); buildVillageProps(); buildBus(); buildSnowfall();
  const H = [[12, -30, 8, 6, 0, 1], [28, 12, 7, 6, Math.PI / 2, 2], [-36, 16, 8, 7, 0, 3], [20, 34, 7, 6, 0, 4], [-8, 34, 8, 6, Math.PI / 2, 5], [44, 2, 7, 6, 0, 6], [-38, -26, 8, 6, Math.PI / 2, 7], [-2, -26, 6, 5, 0, 8]];
  W.houses = H.map(([x, z, w, d, ry, s]) => makeHouseModel(x, z, ry, s) || makeHouse(x, z, w, d, ry, s));
  // one house with a candle in the window (scripted to go out)
  const hz = W.houses[4]; W.candleWin = hz.wins[0]; W.candleWin.glass.material = new THREE.MeshBasicMaterial({ color: 0xffa040 }); W.candleLight = { intensity: 1 };
  // world bounds
  addBox(-215, -205, -215, 215); addBox(205, 215, -215, 215); addBox(-215, 215, -215, -205); addBox(-215, 215, 205, 215);
}
function isIndoor(x, z) { for (const b of W.indoorBoxes) if (x > b.minx && x < b.maxx && z > b.minz && z < b.maxz) return b; return null; }
function groundAt(x, z) { const b = isIndoor(x, z); if (b) return b === W.indoorBoxes[0] ? b.y + 0.42 : b.y + 0.31; return heightAt(x, z); }
