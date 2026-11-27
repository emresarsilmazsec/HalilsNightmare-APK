// ================= MAIN: engine, player, UI, cinematics, chapters =================
const $ = id => document.getElementById(id);
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : Object.assign({}, d, v); } catch (e) { return d; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
const SET = Object.assign({ vol: 0.85, sens: 1, q: 'auto', subs: 1, bri: 1, amb: 0.5, voice: 1, js: 1 }, load('hn_set', {}));
let isTouch = matchMedia('(pointer:coarse)').matches;
const QUAL = () => SET.q === 'auto' ? (isTouch ? 'mid' : 'high') : SET.q;
// ---------- renderer ----------
const canvas = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const SCENE = new THREE.Scene(); const FOG = new THREE.FogExp2(0x0d131c, 0.04); SCENE.fog = FOG; SCENE.background = new THREE.Color(0x0d131c);
const CAMERA = new THREE.PerspectiveCamera(72, 1, 0.08, 220); window.CAMERA = CAMERA; CAMERA.rotation.order = 'YXZ';
let RT = null, RS = 1;
const post = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFear: { value: 0 }, uChroma: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uGrain: { value: 0.06 }, uExpo: { value: 1.5 }, uBlur: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime,uFear,uChroma,uFade,uFlash,uGrain,uExpo,uBlur; uniform vec3 uFlashCol; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    vec3 samp(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
    void main(){
      vec2 c = vUv - 0.5; vec2 uv = vUv + c * dot(c,c) * (0.06 + 0.1*uFear*sin(uTime*2.3));
      float ca = 0.0012 + uChroma*0.016 + uFear*0.004;
      vec3 col = vec3(samp(uv + c*ca).r, samp(uv).g, samp(uv - c*ca).b);
      if (uBlur > 0.0) { vec3 b = vec3(0.0); for (int i=0;i<6;i++){ float f = float(i)/6.0; b += samp(mix(uv, vec2(0.5), f*0.06*uBlur)); } col = mix(col, b/6.0, uBlur); }
      col = aces(col * uExpo); col = pow(col, vec3(1.12));
      float l = dot(col, vec3(0.299,0.587,0.114)); col = mix(vec3(l), col, 0.72 - uFear*0.35);
      col = col * vec3(0.93, 0.99, 1.08) + vec3(0.0, 0.003, 0.012);
      col = toSRGB(col);
      float v = smoothstep(0.8, 0.16, length(c*vec2(1.0,0.92)) * (1.0 + uFear*0.5)); col *= v;
      col += vec3(0.22,0.0,0.0) * uFear * (1.0 - v) * (0.6+0.4*sin(uTime*7.0));
      col += (rand(vUv*uRes + fract(uTime)*91.0) - 0.5) * (uGrain + uFear*0.05);
      col *= 0.985 + 0.015*sin(uTime*53.0);
      col = mix(col, uFlashCol, clamp(uFlash,0.0,1.0)); col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0); }`, depthTest: false, depthWrite: false });
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
function resize() {
  const w = window.innerWidth, h = window.innerHeight; const q = QUAL();
  RS = q === 'high' ? Math.min(window.devicePixelRatio, 1.5) : q === 'mid' ? Math.min(window.devicePixelRatio, 1) * 0.85 : 0.6;
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const rw = Math.round(w * RS), rh = Math.round(h * RS);
  if (RT) RT.dispose(); RT = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, depthBuffer: true }); post.uniforms.tDiffuse.value = RT.texture; post.uniforms.uRes.value.set(rw, rh);
  CAMERA.aspect = w / h; CAMERA.updateProjectionMatrix();
  renderer.shadowMap.enabled = q !== 'low'; if (FL) FL.shadow.mapSize.set(q === 'high' ? 1024 : 512, q === 'high' ? 1024 : 512);
  $('rot').style.display = isTouch && h > w ? 'flex' : 'none';
}
window.addEventListener('resize', resize);
// ---------- lights ----------
const HEMI = new THREE.HemisphereLight(0x5a6a90, 0x0a0b12, 0.32); SCENE.add(HEMI);
const MOON = new THREE.DirectionalLight(0x8fa4d6, 0.45); MOON.position.set(-60, 90, -40); SCENE.add(MOON);
const FL = new THREE.SpotLight(0xffe8c8, 0, 32, 0.46, 0.6, 1.6); FL.castShadow = true; FL.shadow.mapSize.set(1024, 1024); FL.shadow.bias = -0.0004; FL.shadow.camera.near = 0.2; FL.shadow.camera.far = 30; SCENE.add(FL); SCENE.add(FL.target);
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, color: 0xc8d6ff, fog: false, depthWrite: false, transparent: true, opacity: 0.55 }));
// ---------- player ----------
const P = { x: 0, z: 176, y: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, stam: 1, run: false, light: false, lock: true, bob: 0, stepD: 0, footN: 0, items: {}, breath: 1, hidden: false, eye: 1.65, inside: false, fear: 0 };
const G = { started: false, paused: false, time: 0, cine: null, flags: {}, cp: null, ch: 0, chase: null, subsQ: 0, fearBoost: 0, mirrorOn: false, flash: 0, chroma: 0, fade: 1, fadeTo: 0, trig: [], busy: 0, monsterLines: 0 };
// ---------- timers / sequencer ----------
let SEQ = 1; const TIMERS = [];
function wait(s) { const tok = SEQ; const p = new Promise((res, rej) => TIMERS.push({ t: s, res, rej, tok })); p.catch(() => {}); return p; }
function until(fn) { const tok = SEQ; const p = new Promise((res, rej) => TIMERS.push({ until: fn, res, rej, tok })); p.catch(() => {}); return p; }
function tickTimers(dt) { for (let i = TIMERS.length - 1; i >= 0; i--) { const t = TIMERS[i]; if (t.tok !== SEQ) { TIMERS.splice(i, 1); t.rej('cancel'); continue; } if (t.until ? t.until() : (t.t -= dt) <= 0) { TIMERS.splice(i, 1); t.res(); } } }
function run(fn) { fn().catch(e => { if (e !== 'cancel') console.error(e); }); }
function cancelAll() { $('bigPhoto') && $('bigPhoto').classList.remove('show'); SEQ++; G.trigBusy = 0; G.stalkBusy = false; G.lightKill = 0; G.jsCenter = null; stopVoice(); hideSub(); $('note').classList.remove('show', 'letter'); G.noteOpen = false; G.slowmo = 1; G.choiceTick = null; G.hideT = null; G.hideLight = false; G.camAnim = false; $('hide').classList.remove('show'); $('phone').classList.remove('show'); $('choice').classList.remove('show'); letterbox(false); G.cine = null; }
// ---------- UI helpers ----------
function setObj(t) { const o = $('obj'); o.querySelector('b').textContent = t; o.classList.remove('show'); void o.offsetWidth; o.classList.add('show'); G.flags.obj = t; }
let subTok = 0;
function showSub(sp, text) { const s = $('subs'); const S = SPEAKERS[sp] || { name: sp, col: '#ddd' }; s.innerHTML = `<span style="color:${S.col}">${S.name}</span>${text}`; s.classList.add('show'); }
function hideSub() { $('subs').classList.remove('show'); }
async function say(id) {
  const L = LINES[id]; if (!L) return;
  const tok = SEQ; await playVoice(id); if (tok !== SEQ) throw 'cancel';
}
function sayBg(id) { run(async () => { await say(id); }); }   // fire-and-forget (cancelled with SEQ)
function caption(t, s = 2) { const c = $('cap'); c.textContent = t; c.classList.add('show'); clearTimeout(caption.t); caption.t = setTimeout(() => c.classList.remove('show'), s * 1000); }
function letterbox(on) { document.body.classList.toggle('cinema', on); }
async function card(i) { const c = $('card'); c.querySelector('small').textContent = 'BÖLÜM ' + CHAPTERS[i].n; c.querySelector('b').textContent = CHAPTERS[i].t; c.classList.add('show'); sfx('boom'); await wait(3.6); c.classList.remove('show'); }
function fadeTo(v, s = 1) { G.fadeTo = v; G.fadeSpd = 1 / Math.max(0.01, s); return wait(s); }
function note(key, auto) {
  return new Promise(res => { const n = NOTES[key]; $('noteT').textContent = n.title; $('noteB').textContent = n.text; $('note').classList.add('show'); unlockPointer(); G.noteOpen = true; $('noteClose').style.visibility = auto ? 'hidden' : 'visible';
    const close = () => { $('note').classList.remove('show'); G.noteOpen = false; window.removeEventListener('keydown', kd); res(); if (!auto) relock(); }; const kd = e => { if (['KeyE', 'Escape', 'Enter', 'Space'].includes(e.code)) close(); };
    if (auto) { G.noteClose = close; } else { $('noteClose').onclick = close; window.addEventListener('keydown', kd); } });
}
async function phone(caller, ids, opts = {}) {
  const ph = $('phone'); $('phName').textContent = caller; $('phSt').textContent = opts.unknown ? 'Bilinmeyen konum' : 'Arıyor…'; ph.classList.add('show'); ph.classList.remove('live');
  for (let i = 0; i < 3; i++) { sfx('ring'); await wait(1.1); }
  ph.classList.add('live'); $('phSt').textContent = '00:00'; const t0 = G.time; G.phoneTimer = () => { const s = Math.floor(G.time - t0); $('phSt').textContent = `00:${String(s).padStart(2, '0')}`; };
  if (opts.static) sfx('static', null, 0.8); if (opts.unknown) sfx('signal', null, 0.55);
  for (const id of ids) { await say(id); await wait(0.25); }
  if (opts.cut) { sfx('static', null, 1.4); $('phSt').textContent = 'Bağlantı kesildi'; await wait(1.2); }
  G.phoneTimer = null; ph.classList.remove('show');
}
function choice(opts, secs, def) {
  return new Promise(res => {
    const box = $('choice'); box.querySelector('.opts').innerHTML = opts.map((o, i) => `<button data-v="${o.v}"><kbd>${i + 1}</kbd>${o.t}</button>`).join(''); box.classList.add('show'); unlockPointer();
    const bar = box.querySelector('.bar i'); const tok = SEQ; let left = secs; G.slowmo = 0.35; sfx('sting');
    const done = v => { if (G.choiceDone) return; G.choiceDone = true; box.classList.remove('show'); G.slowmo = 1; G.choiceTick = null; window.removeEventListener('keydown', kd); res(v); };
    G.choiceDone = false; box.querySelectorAll('button').forEach(b => b.onclick = () => { sfx('pickup'); done(b.dataset.v); });
    const kd = e => { const n = +e.key; if (n >= 1 && n <= opts.length) done(opts[n - 1].v); }; window.addEventListener('keydown', kd);
    G.choiceTick = dt => { if (tok !== SEQ) { done(def); return; } left -= dt; bar.style.width = Math.max(0, left / secs * 100) + '%'; if (Math.floor(left) !== Math.floor(left + dt) && left > 0) sfx('tick'); if (left <= 0) done(def); };
  });
}
// ---------- cinematic camera ----------
const _v = new THREE.Vector3(), _l = new THREE.Vector3();
function cine(p0, l0, p1, l1, dur, ease = 'inout') {
  const pr = new Promise((res, rej) => { const tok = SEQ; G.cine = { p0: new THREE.Vector3(...p0), l0: new THREE.Vector3(...l0), p1: new THREE.Vector3(...p1), l1: new THREE.Vector3(...l1), t: 0, dur, ease, res: () => tok === SEQ ? res() : rej('cancel') }; letterbox(true); }); pr.catch(() => {}); return pr;
}
function cineEnd(lookFrom) { G.cine = null; letterbox(false); const d = new THREE.Vector3(); CAMERA.getWorldDirection(d); P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) * 0.6; }
function updCine(dt) {
  const c = G.cine; if (!c) return false; c.t += dt; let k = Math.min(1, c.t / c.dur); const e = c.ease === 'in' ? k * k : c.ease === 'out' ? 1 - (1 - k) * (1 - k) : c.ease === 'lin' ? k : k * k * (3 - 2 * k);
  CAMERA.position.lerpVectors(c.p0, c.p1, e); _l.lerpVectors(c.l0, c.l1, e); CAMERA.lookAt(_l);
  CAMERA.position.x += Math.sin(G.time * 0.7) * 0.02; CAMERA.position.y += Math.sin(G.time * 0.9) * 0.015;
  if (k >= 1 && !c.done) { c.done = true; c.res(); }
  return true;
}
// ---------- input ----------
const K = {}; let pointerLocked = false;
window.addEventListener('keydown', e => { K[e.code] = true; if (!G.started) return;
  if (e.code === 'Escape' && !G.noteOpen) togglePause(); if (G.paused) return;
  if (e.code === 'KeyF') toggleLight(); if (e.code === 'KeyE') interact(); if (e.code === 'Space') e.preventDefault(); });
window.addEventListener('keyup', e => { K[e.code] = false; });
canvas.addEventListener('click', () => { if (G.started && !G.paused && !isTouch && !G.noteOpen && !$('choice').classList.contains('show')) canvas.requestPointerLock && canvas.requestPointerLock(); auInit(); });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; if (!pointerLocked && G.started && !G.paused && !G.noteOpen && !$('choice').classList.contains('show') && !isTouch && !G.cine && !G.ended) togglePause(true); });
function relock() { if (!isTouch && G.started && !G.paused && canvas.requestPointerLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} } }
function unlockPointer() { if (document.exitPointerLock && pointerLocked) { G.ignoreUnlock = true; document.exitPointerLock(); } }
document.addEventListener('mousemove', e => { if (!pointerLocked || P.lock || G.cine || G.paused) return; P.yaw -= e.movementX * 0.0022 * SET.sens; P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - e.movementY * 0.0022 * SET.sens)); });
// touch
const TC = { mv: null, lk: null };
function tStart(e) { isTouch = true; auInit(); for (const t of e.changedTouches) { if (t.target.closest('.tbtn,button,#note,#choice')) continue; if (t.clientX < innerWidth * 0.42 && !TC.mv) TC.mv = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 }; else if (!TC.lk) TC.lk = { id: t.identifier, x: t.clientX, y: t.clientY }; } upJoy(); }
function tMove(e) { for (const t of e.changedTouches) { if (TC.mv && t.identifier === TC.mv.id) { let dx = t.clientX - TC.mv.ox, dy = t.clientY - TC.mv.oy; const d = Math.hypot(dx, dy), R = 55; if (d > R) { dx *= R / d; dy *= R / d; } TC.mv.dx = dx / R; TC.mv.dy = dy / R; } if (TC.lk && t.identifier === TC.lk.id) { if (!P.lock && !G.cine) { P.yaw -= (t.clientX - TC.lk.x) * 0.0055 * SET.sens; P.pitch = Math.max(-1.3, Math.min(1.3, P.pitch - (t.clientY - TC.lk.y) * 0.0055 * SET.sens)); } TC.lk.x = t.clientX; TC.lk.y = t.clientY; } } upJoy(); if (G.started) e.preventDefault(); }
function tEnd(e) { for (const t of e.changedTouches) { if (TC.mv && t.identifier === TC.mv.id) TC.mv = null; if (TC.lk && t.identifier === TC.lk.id) TC.lk = null; } upJoy(); }
function upJoy() { const j = $('joy'); if (TC.mv) { j.style.display = 'block'; j.style.left = (TC.mv.ox - 55) + 'px'; j.style.top = (TC.mv.oy - 55) + 'px'; j.firstElementChild.style.transform = `translate(${TC.mv.dx * 55}px,${TC.mv.dy * 55}px)`; } else j.style.display = 'none'; }
document.addEventListener('touchstart', tStart, { passive: false }); document.addEventListener('touchmove', tMove, { passive: false }); document.addEventListener('touchend', tEnd); document.addEventListener('touchcancel', tEnd);
const hold = (id, on, off) => { const b = $(id); b.addEventListener('touchstart', e => { e.preventDefault(); on(); }, { passive: false }); b.addEventListener('touchend', e => { e.preventDefault(); off && off(); }); b.addEventListener('mousedown', on); b.addEventListener('mouseup', () => off && off()); };
hold('bUse', () => interact()); hold('bLight', () => toggleLight()); hold('bRun', () => { K.TouchRun = true; }, () => { K.TouchRun = false; }); hold('bBreath', () => { K.TouchBreath = true; }, () => { K.TouchBreath = false; }); hold('bPause', () => togglePause());
function toggleLight() { if (!P.items.fener || P.lock && !P.hidden) return; P.light = !P.light; sfx('flick'); }
// ---------- interaction ----------
let focus = null;
function findFocus() {
  focus = null; if (P.lock || G.cine) return; const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); let best = 0.55;
  for (const it of W.inter) { if (!it.on) continue; _v.set(it.x - CAMERA.position.x, it.y - CAMERA.position.y, it.z - CAMERA.position.z); const d = _v.length(); if (d > it.r) continue; const a = Math.acos(Math.max(-1, Math.min(1, _v.dot(f) / d))); const score = d < 0.9 ? 0 : a; if (score < best) { best = score; focus = it; } }
  const pr = $('prompt'); if (focus) { pr.innerHTML = `<kbd>${isTouch ? '✋' : 'E'}</kbd>${focus.label}`; pr.classList.add('show'); } else pr.classList.remove('show');
  $('bUse').classList.toggle('on', !!focus);
}
function interact() { if (!focus || P.lock || G.cine) return; const id = focus.id; if (HANDLERS[id]) run(() => HANDLERS[id](focus)); }
function setInter(id, on, label) { const it = W.inter.find(i => i.id === id); if (it) { it.on = on; if (label) it.label = label; } }
function give(k, name) { P.items[k] = true; sfx('pickup'); renderInv(); if (name) caption('+ ' + name, 2); }
function renderInv() { const names = { fener: 'Fener', kibrit: 'Kibrit', odun: 'Kuru odun', kav: 'Kav', muska: 'Muska', soz: 'Söz', saat: 'Babanın saati', kol: 'Kuyu kolu' }; $('inv').innerHTML = Object.keys(P.items).filter(k => P.items[k] && names[k]).map(k => `<span>${names[k]}</span>`).join(''); }
// ---------- doors ----------
function setDoor(name, open, instant) { const d = W.doors[name]; d.open = open; d.target = open ? -1.7 : 0; d.col.on = !open; if (instant) d.ang = d.target; if (!instant) sfx('door', doorPos()); }
function doorPos() { return new THREE.Vector3(DEDE.x, W.dedeY + 1.2, DEDE.z + 4); }
// ---------- mirror ----------
let MIR = null;
function buildMirror() {
  const rt = new THREE.WebGLRenderTarget(256, 384, { type: THREE.HalfFloatType }); const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 40); cam.layers.enable(2);
  const mat = new THREE.ShaderMaterial({ uniforms: { tMirror: { value: rt.texture }, texM: { value: new THREE.Matrix4() } },
    vertexShader: 'uniform mat4 texM; varying vec4 vP; varying vec2 vUv; void main(){ vUv = uv; vP = texM * modelMatrix * vec4(position,1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tMirror; varying vec4 vP; varying vec2 vUv; float r(vec2 c){return fract(sin(dot(c,vec2(12.9,78.2)))*43758.5);} void main(){ vec3 c = texture2DProj(tMirror, vP).rgb * 0.8; float e = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x)*smoothstep(0.0,0.06,vUv.y)*smoothstep(1.0,0.94,vUv.y); c *= 0.6+0.4*e; c += (r(floor(vUv*80.0))-0.5)*0.03; c = mix(c, vec3(0.05,0.05,0.045), 0.15 + 0.25*smoothstep(0.3,0.0,vUv.y)); gl_FragColor = vec4(c,1.0); }' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.16), mat); m.position.set(W.mirrorAt.x + 0.02, W.mirrorAt.y, W.mirrorAt.z); m.rotation.y = Math.PI / 2; SCENE.add(m);
  MIR = { rt, cam, mat, m, plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), -(W.mirrorAt.x + 0.02)), frame: 0 };
}
function renderMirror() {
  if (!MIR) return; const cp = CAMERA.position; const px = MIR.m.position.x; if (!P.inside || cp.x < px || Math.hypot(cp.x - px, cp.z - MIR.m.position.z) > 7) return;
  if (++MIR.frame % 2) return;
  const d = new THREE.Vector3(); CAMERA.getWorldDirection(d); const c = MIR.cam; c.position.set(2 * px - cp.x, cp.y, cp.z); c.up.set(0, 1, 0); c.lookAt(c.position.x - d.x, c.position.y + d.y, c.position.z + d.z); c.aspect = CAMERA.aspect; c.fov = CAMERA.fov; c.updateProjectionMatrix(); c.updateMatrixWorld();
  const tm = MIR.mat.uniforms.texM.value; tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); tm.multiply(c.projectionMatrix); tm.multiply(c.matrixWorldInverse);
  MIR.m.visible = false; const fv = FL.visible; renderer.clippingPlanes = [MIR.plane]; renderer.setRenderTarget(MIR.rt); renderer.render(SCENE, c); renderer.clippingPlanes = []; MIR.m.visible = true;
}
// ---------- fx: breath vapor, fire particles, glows ----------
const FX = { puffs: [], fire: null };
const puffMat = new THREE.SpriteMaterial({ map: null, color: 0xd8e2ee, transparent: true, opacity: 0, depthWrite: false });
function buildFX() {
  puffMat.map = TEX.glow; FX.puff = new THREE.Sprite(puffMat); FX.puff.scale.set(0.5, 0.5, 0.5); SCENE.add(FX.puff); FX.puffT = 0;
  const N = 60, pos = new Float32Array(N * 3), seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = Math.random();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uS: { value: 0 }, uP: { value: W.firePos } },
    vertexShader: 'attribute float seed; uniform float uT,uS; uniform vec3 uP; varying float vA; void main(){ float t = fract(uT*0.9 + seed); vec3 p = uP + vec3((seed-0.5)*0.6*(1.0-t), t*1.0*uS, (fract(seed*7.0)-0.5)*0.3*(1.0-t)); vA = (1.0-t)*uS; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = (90.0*(1.0-t*0.6)*uS)/max(-mv.z,0.3); }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d)*vA; gl_FragColor = vec4(1.0,0.45+0.3*(1.0-d*2.0),0.12,a*0.85); }' });
  FX.fire = new THREE.Points(g, m); FX.fire.frustumCulled = false; SCENE.add(FX.fire);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); lampGlow.position.copy(W.lampLight.position); lampGlow.scale.set(0.8, 0.8, 0.8); SCENE.add(lampGlow); FX.lampGlow = lampGlow;
  moonSprite.material.map = TEX.glow; moonSprite.scale.set(40, 40, 1); SCENE.add(moonSprite);
}
// ---------- monster runtime ----------
function chaseStart(opts) { G.chase = Object.assign({ speed: 4.7, t: 0, lineT: 4, grace: 1.2 }, opts); MON.state = 'chase'; sfx('roar', MON.g.position); }
function chaseStop() { G.chase = null; MON.state = 'off'; }
async function caught() {
  if (G.dying) return; G.dying = true; const tok = SEQ; cancelAll(); chaseStop(); P.lock = true; P.hidden = false; $('hide').classList.remove('show');
  // jumpscare: face rushes the camera
  const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); MON.g.visible = true; MON.g.traverse(o => o.layers.set(0));
  f.y = 0; f.normalize(); const hp = CAMERA.position.clone().add(f.clone().multiplyScalar(1.25)); MON.g.position.set(hp.x, CAMERA.position.y - MON.faceH, hp.z); MON.g.rotation.y = Math.atan2(-f.x, -f.z); MON.reach = 1; MON.twitch = 2; G.jsCenter = { f: f.clone(), d: 0.95 };
  sfx('js_dog', null, 0.9); sfx('slam'); G.flash = 0.6; post.uniforms.uFlashCol.value.set(0.5, 0, 0); G.chroma = 1; G.shake = 1;
  playVoice('K10');
  await new Promise(r => setTimeout(r, 1200)); G.fade = 1; G.fadeTo = 1; MON.reach = 0; G.jsCenter = null; monsterHide(); hideSub();
  $('death').classList.add('show'); sfx('dead', null, 0.8); unlockPointer(); G.dying = false;
}
function retry() { $('death').classList.remove('show'); G.chroma = 0; G.flash = 0; post.uniforms.uFlashCol.value.set(1, 1, 1); loadCheckpoint(G.cp || 'c1'); }
// ---------- hiding (hold breath) ----------
function walkTo(x, z, speed, maxT = 6, gait = 0.4) { let t = 0; return until(() => { t += G.lastDt; const d = monsterChase(G.lastDt, x, z, speed); monsterAnimate(G.lastDt, gait, G.time); if (Math.random() < 0.03) sfx('mstep', MON.g.position); if (t > maxT) { MON.g.position.x = x; MON.g.position.z = z; MON.g.position.y = groundAt(x, z); return true; } return d < 0.5; }); }

async function hideSequence() {
  P.lock = true; P.hidden = true; const h = W.hutHide; P.x = h.x; P.z = h.z; CAMERA.position.set(h.x + 0.1, h.y - 0.25, h.z); P.yaw = -Math.PI / 2; P.pitch = -0.08; P.light = false;
  $('hide').classList.add('show'); FL.intensity = 0; G.hideLight = true; sfx('door', new THREE.Vector3(h.x, h.y, h.z)); await wait(2);
  // monster enters the hut
  monsterShow(HUT.x + 0.5, HUT.z + 6, Math.PI); MON.state = 'walk'; const dangerFrom = G.time + 6;
  G.hideT = { breath: 1, need: false };
  sayBg('H35');
  const path = [[HUT.x, HUT.z + 3], [HUT.x, HUT.z + 1.2], [HUT.x - 0.6, HUT.z + 0.6], [HUT.x - 1.0, HUT.z + 0.9]];
  for (const [x, z] of path) await walkTo(x, z, 1.3, 5, 0.3);
  $('hideTip').textContent = 'Geliyor… hazırlan'; await wait(1.2); monsterFace(h.x, h.z); sfx('sniff', MON.g.position); $('hideTip').textContent = 'NEFESİNİ TUT!'; G.hideT.need = true; await say('K08');
  sfx('breath', MON.g.position); await wait(1.5); await say('K09'); sfx('sniff', MON.g.position); await wait(2.2);
  G.hideT.need = false; $('hideTip').textContent = 'Bekle…';
  // leaves
  for (const [x, z] of [[HUT.x, HUT.z + 1.5], [HUT.x, HUT.z + 8], [HUT.x + 8, HUT.z + 20]]) await walkTo(x, z, 1.8, 5);
  monsterHide(); await wait(1.5); $('hide').classList.remove('show'); P.hidden = false; G.hideT = null; G.hideLight = false;
  P.x = HUT.x - 1.1; P.z = HUT.z + 0.9; P.lock = false;
}
function updHide(dt) {
  const h = G.hideT; if (!h) return; const holding = K.Space || K.TouchBreath;
  if (holding) h.breath = Math.max(0, h.breath - dt / 7); else h.breath = Math.min(1, h.breath + dt / 3);
  $('hideBar').style.width = (h.breath * 100) + '%'; $('bBreath').classList.toggle('on', true);
  P.fear = Math.max(P.fear, 0.85);
  if (h.need) h.needT = (h.needT || 0) + dt;
  if (h.need && h.needT > 1.2 && (!holding || h.breath <= 0)) { h.fail = (h.fail || 0) + dt; if (h.fail > 0.6) { G.hideT = null; run(caught); } } else if (h.fail) h.fail = Math.max(0, h.fail - dt);
}
// ---------- checkpoints ----------
function saveCP(cp) { G.cp = cp; store('hn_save', { cp, items: P.items, flags: G.flags }); }
function loadCheckpoint(cp) {
  cancelAll(); chaseStop(); monsterHide(); const s = load('hn_save', {}); P.items = Object.assign({}, s.items || {}); G.flags = Object.assign({}, s.flags || {}); renderInv();
  G.trig = []; G.fade = 1; G.fadeTo = 0; G.ended = false; P.lock = false; P.hidden = false; $('hide').classList.remove('show');
  resetWorldState();
  sanReset(cp === 'c1' || cp === 'c1b' ? 100 : 80); SAN.scares = SF.scares || 0;
  const fn = CP[cp] || CP.c1; G.cp = cp; run(fn);
}
function resetWorldState() {
  const it = P.items, f = G.flags;
  setDoor('dede', !!f.doorOpen, true); W.doors.dede.locked = false;
  W.lampLight.intensity = 0; FX.lampGlow.material.opacity = 0; W.fireLight.intensity = 0; G.fireS = 0; W.ocakWood.visible = !!f.woodPlaced;
  if (f.lampLit && !f.lampOut) { W.lampLight.intensity = 9; FX.lampGlow.material.opacity = 0.6; }
  W.dedeLantern.intensity = f.lantern ? 3 : 0;
  W.hutWood.visible = !it.odun; W.hutKav.visible = !it.kav; W.hutChestLid.rotation.x = it.muska ? -1.2 : 0;
  for (const i of W.inter) i.on = false;
  setInter('dedeDoor', true); setInter('photo', true); setInter('well', true, 'Kuyuya bak');
  if (!it.kibrit) setInter('matches', true); if (it.kibrit && !f.lampLit) setInter('lamp', true); if (f.lampLit && !f.note2) setInter('note2', true);
  if (f.note2) { if (!it.odun) setInter('wood', true); if (!it.kav) setInter('kav', true); if (!it.muska) setInter('chest', true); }
  if (it.muska && !f.grave) setInter('grave', true); if (f.grave && !it.soz) setInter('well', true, 'İpi çek');
  if (it.soz) setInter('ocak', true, 'Ocağı yak');
  for (const m of W.foot) SCENE.remove(m); W.foot.length = 0;
  if (W.halilGrave) W.halilGrave.visible = !!f.grave && !f.halilSeen;
  if (W.kolMesh) { W.kolMesh.visible = !it.kol; if (f.needKol && !it.kol) { setInter('kol', true); setInter('schoolPhoto', true); setInter('board', true); } else if (it.kol) setInter('schoolPhoto', true); }
  if (W.board) { W.board.material.map = W.boardTex[f.boardSwap ? 1 : 0]; W.board.material.needsUpdate = true; }
  if (W.desks) for (const d of W.desks) { d.rotation.y = f.desksMoved ? (d.userData.base.x * 7.1 % 1.4) - 0.7 : 0; d.position.x = d.userData.base.x; }
}
// ---------- triggers ----------
function trig(id, cond, fn, bg) { if (G.flags['t_' + id]) return; G.trig.push({ id, cond, fn, bg: !!bg }); }
function updTriggers() { if ($('phone').classList.contains('show') || $('choice').classList.contains('show') || G.trigBusy > 0 || G.stalkBusy) return; for (let i = 0; i < G.trig.length; i++) { const t = G.trig[i]; if (G.flags['t_' + t.id]) { G.trig.splice(i, 1); i--; continue; } if (!P.lock && !G.cine && t.cond()) { G.flags['t_' + t.id] = 1; G.trig.splice(i, 1); if (t.bg) { run(t.fn); continue; } G.trigBusy = (G.trigBusy || 0) + 1; const tok = SEQ; Promise.resolve().then(t.fn).catch(e => { if (e !== 'cancel') console.error(e); }).finally(() => { if (tok === SEQ) G.trigBusy = Math.max(0, G.trigBusy - 1); }); return; } } }
const near = (x, z, r) => Math.hypot(P.x - x, P.z - z) < r;
function lookingAt(x, y, z, ang = 0.35) { const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); _v.set(x - CAMERA.position.x, y - CAMERA.position.y, z - CAMERA.position.z); const d = _v.length(); return Math.acos(Math.max(-1, Math.min(1, _v.dot(f) / d))) < ang; }

// ============ SCARE TOOLKIT ============
// forward (horizontal) of the camera
function camFwd() { const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); f.y = 0; return f.normalize(); }
function killLight(s) { G.lightKill = Math.max(G.lightKill || 0, s); }
// true if the terrain doesn't hide a figure standing at (x,z) from the camera
function clearLOS(x, z) { const c = CAMERA.position, ty = groundAt(x, z) + 1.6; for (let i = 1; i < 12; i++) { const k = i / 12; const px = c.x + (x - c.x) * k, pz = c.z + (z - c.z) * k; if (heightAt(px, pz) > c.y + (ty - c.y) * k - 0.25) return false; if (blocked(px, pz, 0.15)) return false; } return !blocked(x, z, 0.6); }
function findSpot(dist, angles) { const f = camFwd(), base = Math.atan2(f.x, f.z); for (const d of [dist, dist * 0.8, dist * 0.65]) for (const a of angles) { const x = P.x + Math.sin(base + a) * d, z = P.z + Math.cos(base + a) * d; if (clearLOS(x, z)) return { x, z }; } return null; }
// the thing stands behind you; turn around and it lunges, then it's gone
async function lookBackScare(dist, timeout = 14) {
  if (G.chase || !MON.ready) return false;
  const f = camFwd(); const x = P.x - f.x * dist, z = P.z - f.z * dist; if (blocked(x, z, 0.5)) return false;
  monsterShow(x, z, 0); monsterFace(P.x, P.z); MON.state = 'stand'; sfx('breath', new THREE.Vector3(x, groundAt(x, z) + 1.8, z)); G.fear = Math.max(G.fear || 0, 0.45);
  let seen = 0, t = 0; const hy = () => groundAt(MON.g.position.x, MON.g.position.z) + MON.faceH;
  await until(() => { t += G.lastDt; monsterFace(P.x, P.z); if (lookingAt(MON.g.position.x, hy(), MON.g.position.z, 0.32)) seen += G.lastDt; return seen > 0.12 || t > timeout || G.chase; });
  if (seen > 0.12) {
    sfx('js_main'); G.flash = 0.35; post.uniforms.uFlashCol.value.set(0.45, 0, 0); G.chroma = 1; G.shake = 0.8; G.fear = 1; MON.reach = 1; MON.twitch = 0.6;
    const p0 = MON.g.position.clone(), p1 = new THREE.Vector3(P.x, 0, P.z).lerp(p0, 0.45); let k = 0;
    await until(() => { k += G.lastDt / 0.18; MON.g.position.x = p0.x + (p1.x - p0.x) * Math.min(1, k); MON.g.position.z = p0.z + (p1.z - p0.z) * Math.min(1, k); monsterFace(P.x, P.z); return k >= 1; });
    killLight(0.35); await wait(0.25); MON.reach = 0; monsterHide(); post.uniforms.uFlashCol.value.set(1, 1, 1); return true;
  }
  monsterHide(); return false;
}
// flashlight dies; when it comes back the thing is far ahead... then right in front of you
async function beamReveal(far = 7, near = 2.4) {
  if (!MON.ready) return;
  const f = camFwd(); const sp = findSpot(far, [0, 0.12, -0.12, 0.25, -0.25]) || { x: P.x + f.x * far * 0.7, z: P.z + f.z * far * 0.7 }; const x = sp.x, z = sp.z;
  P.lock = true; flicker(0.6); await wait(0.6); killLight(0.9); monsterShow(x, z, 0); monsterFace(P.x, P.z); monsterGlow(3); monsterReveal(22); MON.state = 'stand'; await wait(0.9);
  sfx('sting'); G.fear = 0.8; await wait(1.1);
  killLight(0.7); sfx('breath', MON.g.position); await wait(0.7);
  const nx = P.x + f.x * near, nz = P.z + f.z * near; MON.g.position.set(nx, groundAt(nx, nz), nz); monsterFace(P.x, P.z); MON.reach = 1; MON.twitch = 1; monsterGlow(3);
  sfx('js_impact'); sfx('js_fright', null, 0.55); G.flash = 0.4; post.uniforms.uFlashCol.value.set(0.5, 0, 0); G.chroma = 1; G.shake = 1; G.fear = 1;
  await wait(0.45); killLight(0.8); await wait(0.3); MON.reach = 0; monsterHide(); await wait(0.5); post.uniforms.uFlashCol.value.set(1, 1, 1); P.lock = false;
}
// one-frame-ish subliminal flash of the face right in front of the camera
async function subliminal(ms = 110) {
  if (!MON.ready || G.chase) return;
  const f = camFwd(); monsterShow(P.x + f.x * 1.1, P.z + f.z * 1.1, 0); monsterFace(P.x, P.z); monsterGlow(4); G.jsCenter = { f, d: 1.0, dy: 0 };
  sfx('static', null, 0.35); sfx('js_impact', null, 0.7); G.chroma = 1; await new Promise(r => setTimeout(r, ms)); G.jsCenter = null; monsterHide();
}
// a figure stands at the edge of the flashlight; holding the light on it makes it vanish
async function distantFigure(dist = 22) {
  if (G.chase || !MON.ready) return;
  const side = Math.random() < 0.5 ? -1 : 1; const sp = findSpot(dist, [side * 0.45, -side * 0.45, side * 0.25, -side * 0.25, side * 0.65, 0]); if (!sp) return; const { x, z } = sp;
  monsterShow(x, z, 0); monsterFace(P.x, P.z); monsterGlow(3); monsterReveal(18); MON.state = 'stand'; let seen = 0, t = 0;
  await until(() => { t += G.lastDt; if (lookingAt(x, groundAt(x, z) + 2, z, 0.18)) seen += G.lastDt; return seen > 0.45 || t > 16 || G.chase || Math.hypot(P.x - x, P.z - z) < 5; });
  if (seen > 0.45 || Math.hypot(P.x - x, P.z - z) < 5) { flicker(0.5); await wait(0.15); sfx('reveal', null, 0.7); G.fear = 0.7; }
  monsterHide();
}
// random stalking while walking outdoors (never during scripted moments)
function updStalker(dt) {
  if (!G.started || G.ended || G.chase || P.lock || G.cine || P.inside || G.trigBusy > 0 || G.dawn || G.stalkBusy) return;
  if (!(G.ch === 0 || G.ch === 2 || G.ch === 3) || !MON.ready || MON.g.visible) return;
  G.stalkT = (G.stalkT == null ? 70 : G.stalkT) - dt; if (G.stalkT > 0) return;
  G.stalkT = (60 + Math.random() * 60) * (0.55 + 0.45 * SAN.v / 100); G.stalkBusy = true;
  const tok = SEQ; const f = camFwd(), at = (dx, dz, y = 1.7) => new THREE.Vector3(P.x + dx, P.y + y, P.z + dz);
  // weighted pool of random encounters — different every playthrough
  const pool = [
    [3, () => distantFigure(9 + Math.random() * 2)],
    [3, () => lookBackScare(4.5, 10)],
    [2, async () => { sfx('breath', at(-f.x * 1.5, -f.z * 1.5)); G.fear = 0.6; await wait(1.4); flicker(0.4); }],
    [2, async () => { const a0 = Math.random() * 6.28; for (let i = 0; i < 8; i++) { const a = a0 + i * 0.8; sfx('mstep', at(Math.sin(a) * 6, Math.cos(a) * 6, 0.2)); await wait(0.55); } G.fear = 0.7; }],   // something circles you
    [2, async () => { sfx('creak', at(f.x * 8 + 3, f.z * 8, 4)); await wait(0.5); sfx('splash', at(f.x * 8 + 3, f.z * 8, 2)); }],                                        // a branch gives way
    [2, async () => { sfPlay('cutthroat', 0.35, at(-f.x * 40, -f.z * 40, 3)); G.fear = 0.5; }],                                                                          // a distant scream
    [1, async () => { if (VOICE.n === 0) { sfx('whisper', at(-f.x * 3, -f.z * 3)); await playVoice('E01'); } }],                                                         // Emirhan calls from behind
    [2, async () => { killLight(2.4); sfx('flick'); await wait(0.6); sfx('breath', at(f.x * 1.2, f.z * 1.2)); await wait(0.9); sfx('growl', at(f.x * 3, f.z * 3)); await wait(1.0); G.fear = 0.9; }], // light dies, it's right there
  ];
  let tot = 0; for (const [w] of pool) tot += w; let r = Math.random() * tot, pick = pool[0][1]; for (const [w, fn] of pool) { if ((r -= w) <= 0) { pick = fn; break; } }
  Promise.resolve().then(pick)
    .catch(() => {}).finally(() => { if (tok === SEQ) G.stalkBusy = false; else G.stalkBusy = false; });
}

// ============ SANITY (hallucinations only — it never kills) ============
const SAN = { v: 100, t: 25, scares: 0, el: null, bar: null, heart: null };
function sanReset(v) { SAN.v = v; SAN.t = 25; }
function updSanity(dt) {
  if (!G.started || G.ended) return;
  if (!SAN.el) { SAN.el = $('san'); SAN.bar = SAN.el.querySelector('i'); SAN.heart = SAN.el.querySelector('svg'); }
  let d = 0; const inDede = isIndoor(P.x, P.z) === W.indoorBoxes[0];
  const lampOn = W.lampLight.intensity > 1, fireOn = (G.fireS || 0) > 0.3;
  if (inDede && lampOn) d += 4; if (fireOn && Math.hypot(P.x - W.firePos.x, P.z - W.firePos.z) < 6) d += 7;
  if (W.dedeLantern.intensity > 1 && Math.hypot(P.x - DEDE.x, P.z - (DEDE.z + 4.5)) < 5) d += 2;
  if (G.dawn) d += 4;
  if (!P.light && !(inDede && lampOn)) d -= 2.5;
  if (!P.inside) d -= (G.ch === 2 && P.z < -50) ? 0.5 : 0.22; else if (inSchool && inSchool()) d -= 0.45;
  if (G.chase) d -= 1.4;
  if (MON.g.visible && lookingAt(MON.g.position.x, MON.g.position.y + MON.faceH * 0.8, MON.g.position.z, 0.4)) d -= 9;
  if ((SF.scares || 0) > SAN.scares) { SAN.v -= 10 * ((SF.scares || 0) - SAN.scares); SAN.scares = SF.scares || 0; }
  SAN.v = Math.max(0, Math.min(100, SAN.v + d * dt));
  const k = 1 - SAN.v / 100;
  SAN.bar.style.width = SAN.v + '%'; SAN.bar.style.background = k > 0.6 ? '#b3352c' : k > 0.3 ? '#c9a56a' : '#d9d2c3';
  const beat = k > 0.45 ? 1 + Math.max(0, Math.sin(G.time * (4 + k * 6))) * 0.25 * k : 1; SAN.heart.style.transform = `scale(${beat.toFixed(3)})`; SAN.heart.style.fill = SAN.bar.style.background;
  // continuous effects
  P.fear = Math.max(P.fear, k * 0.5);
  if (k > 0.5 && !G.cine) CAMERA.rotation.z += Math.sin(G.time * 0.6) * 0.025 * (k - 0.5) * 2;
  // hallucination scheduler
  if (k < 0.3 || G.cine || P.lock || G.chase || G.trigBusy > 0 || G.stalkBusy || P.hidden || $('note').classList.contains('show')) return;
  SAN.t -= dt * (0.4 + k * 1.6); if (SAN.t > 0) return; SAN.t = 18 + Math.random() * 22;
  hallucinate(k);
}
function hallucinate(k) {
  const f = camFwd(), back = new THREE.Vector3(P.x - f.x * 2, P.y + 1.6, P.z - f.z * 2), side = new THREE.Vector3(P.x - f.z * 4 * (Math.random() < 0.5 ? 1 : -1), P.y + 1.6, P.z + f.x * 4);
  const pool = [() => sfx('whisper', side), () => { for (let i = 0; i < 4; i++) setTimeout(() => sfx(P.inside ? 'stepWood' : 'step', back, 0.8), i * 420); }];
  if (k > 0.5) pool.push(() => { flicker(0.8); }, () => sfx('knock', side, 3), () => { if (!MON.g.visible && MON.ready) { G.stalkBusy = true; const a = Math.atan2(f.x, f.z) + (Math.random() < 0.5 ? 1.2 : -1.2); const x = P.x + Math.sin(a) * 7, z = P.z + Math.cos(a) * 7; if (!blocked(x, z, 0.5)) { monsterShow(x, z, 0); monsterFace(P.x, P.z); setTimeout(() => { if (MON.state !== 'chase') monsterHide(); G.stalkBusy = false; }, 650); } else G.stalkBusy = false; } });
  if (k > 0.7) pool.push(() => { if (VOICE.n === 0) playVoice('E01'); }, () => { G.chroma = 1; run(() => subliminal(110)); }, () => { showSubFake('???', 'Arkana bakma Halil.'); sfx('whisper', back); });
  if (k > 0.9) pool.push(() => { fakeDeath(); });
  pool[Math.random() * pool.length | 0]();
}
function showSubFake(sp, text) { if (VOICE.n > 0) return; showSub(sp, text); setTimeout(() => { if (VOICE.n === 0) hideSub(); }, 2600); }
async function fakeDeath() { // a death screen that isn't real
  sfx('js_dog', null, 0.8); G.flash = 0.6; post.uniforms.uFlashCol.value.set(0.5, 0, 0); $('death').classList.add('show'); $('death').style.pointerEvents = 'none';
  await new Promise(r => setTimeout(r, 650)); $('death').classList.remove('show'); $('death').style.pointerEvents = ''; post.uniforms.uFlashCol.value.set(1, 1, 1); G.flash = 0;
}
// ============ CHAPTERS ============
const CP = {};
const HANDLERS = {};
function placePlayer(x, z, yaw, pitch = 0) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch; P.vx = P.vz = 0; }
// ---- I: MEKTUP ----
CP.c1 = async () => {
  G.ch = 0; saveCP('c1'); P.items = {}; G.flags = {}; renderInv(); resetWorldState(); P.lock = true; G.storm = 1; FOG.density = 0.04; G.fadeTo = 1;
  placePlayer(0, 172, 0); G.fade = 1;
  // letter
  $('note').classList.add('letter'); const np = note('letter', true);
  // letter is read aloud; "Devam" is available from the first second and skips the reading
  let skip = false; $('noteClose').style.visibility = 'visible'; $('noteClose').textContent = isTouch ? 'DEVAM ET' : 'DEVAM ET  ·  E';
  const skipP = new Promise(r => { const go = () => { skip = true; window.removeEventListener('keydown', kd); $('noteClose').onclick = null; stopVoice(); hideSub(); r(); }; const kd = e => { if (['KeyE', 'Enter', 'Space', 'Escape'].includes(e.code)) go(); }; $('noteClose').onclick = go; window.addEventListener('keydown', kd); });
  const readP = (async () => { for (const id of ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07']) { if (skip) return; await say(id); if (skip) return; await wait(0.4); } })();
  readP.catch(() => {}); await skipP; subTok++; hideSub();
  G.noteClose(); $('note').classList.remove('letter'); $('noteClose').textContent = 'KAPAT'; relock();
  // arrival cinematic: minibus leaves the boy in the storm
  const by = heightAt(0, 178); W.bus.position.set(1.2, by, 176); W.bus.rotation.y = Math.PI; W.bus.visible = true; sfx('bus', W.bus.position);
  fadeTo(0, 2.5); const busRun = { on: true }; G.busRun = busRun;
  await cine([9, by + 3.2, 160], [1, by + 1.2, 176], [4, by + 2.2, 168], [0, by + 1.4, 178], 5);
  await wait(0.2); await cine([4, by + 2.2, 168], [0, by + 1.4, 178], [0.6, by + 1.7, 173], [0, by + 1.6, 140], 3.5);
  busRun.on = false; W.bus.visible = false; cineEnd(); P.items.fener = true; renderInv();
  await say('H08');
  await card(0); setObj('Köye doğru yürü'); P.lock = false; P.light = true; sfx('flick');
  setupC1(); saveCP('c1b');
};
CP.c1b = async () => { G.ch = 0; P.items.fener = true; renderInv(); placePlayer(0, 172, 0); P.light = true; fadeTo(0, 1.5); setObj('Köye doğru yürü'); setupC1(); };
function setupC1() {
  G.storm = 1; FOG.density = 0.04;
  trig('call1', () => P.z < 162, async () => { await phone('Furkan Başkaya', ['F01', 'H09', 'F02', 'H10', 'F03'], { static: true, cut: true }); await say('H11'); });
  trig('howl', () => P.z < 135, async () => { sfx('howl'); await wait(5.5); await say('H12'); });
  trig('figure', () => P.z < 118, async () => {
    const fx = 13, fz = 99; monsterShow(fx, fz, Math.PI * 1.1); sfx('figure', null, 0.75); MON.state = 'stand'; MON.gaitIdle = true; let seen = 0;
    await until(() => { monsterAnimate(G.lastDt, 0, G.time); if (lookingAt(fx, groundAt(fx, fz) + 1.8, fz, 0.3)) seen += G.lastDt; return seen > 0.6 || P.z < 92; });
    sfx('sting'); G.chroma = 0.8; P.light && flicker(0.6); await wait(0.25); monsterHide(); await say('H13');
  });
  trig('steps', () => P.z < 88, async () => {
    sfx('breath', new THREE.Vector3(P.x + 2, 1.5, P.z)); const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), r = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    for (let i = 0; i < 10; i++) { const p = new THREE.Vector3(P.x, 0, P.z).add(f.clone().multiplyScalar(2 + i * 0.95)).add(r.clone().multiplyScalar(1.6 + (i % 2) * 0.35)); footprint(p.x, p.z, P.yaw, true); sfx('mstep', new THREE.Vector3(p.x, 0.5, p.z)); await wait(0.45); }
    G.fear = 0.6; await say('H14');
  });
  trig('candle', () => near(-8, 34, 16), async () => { await wait(1); W.candleLight.intensity = 0; W.candleWin.glass.material.color.set(0x0a0e16); sfx('whisper', new THREE.Vector3(-8, 2, 34)); });
  trig('lookback1', () => P.z < 104, async () => { await wait(1.5); await lookBackScare(4.2, 14); });
  trig('sign', () => P.z < 64, async () => { await say('H15'); await wait(0.3); G.flags.lantern = 1; W.dedeLantern.intensity = 3; chapter2(); });
}
// ---- II: DEDEMİN EVİ ----
async function chapter2() {
  G.ch = 1; saveCP('c2'); P.lock = true;
  const y = W.dedeY; await cine([P.x, groundAt(P.x, P.z) + 1.7, P.z], [P.x, groundAt(P.x, P.z) + 1.5, P.z - 10], [DEDE.x + 9, y + 3, DEDE.z + 16], [DEDE.x, y + 1.8, DEDE.z + 3], 5);
  await card(1); cineEnd(); setupC2();
}
CP.c2 = async () => { G.ch = 1; P.items.fener = true; renderInv(); placePlayer(2, 55, 0.2); P.light = true; G.flags.lantern = 1; W.dedeLantern.intensity = 3; fadeTo(0, 1.5); setupC2(); };
function setupC2() {
  P.lock = false; setObj('Dedenin evini bul (ışık yanan ev)'); G.storm = 0.9;
  trig('enter', () => P.inside && isIndoor(P.x, P.z) === W.indoorBoxes[0], async () => { if (W.doors.dede.open) run(async () => { await wait(2.2); if (W.doors.dede.open && P.z < DEDE.z + 3) { setDoor('dede', false); G.flags.doorOpen = 0; sfx('bang', doorPos()); G.shake = 0.4; G.fear = 0.6; } }); setObj('Kibrit bul (mutfak)'); await say('H16'); await say('H17'); setInter('matches', true); });
  trig('peek', () => P.items.kibrit && P.inside && P.x > DEDE.x + 2 && P.z < DEDE.z - 0.5 && lookingAt(DEDE.x + 2.5, W.dedeY + 1.8, DEDE.z + 0.4, 0.42), async () => {
    monsterShow(DEDE.x + 2.5, DEDE.z + 0.95, Math.PI); MON.g.position.y = W.dedeY + 0.42; MON.g.scale.setScalar(0.92); MON.state = 'stand'; let t = 0;
    await until(() => { t += G.lastDt; MON.g.position.y = W.dedeY + 0.42; return t > 0.35; });
    sfx('js_main', null, 0.7); G.chroma = 0.9; G.fear = 0.9; G.shake = 0.5; flicker(0.4); await wait(0.12); monsterHide(); MON.g.scale.setScalar(1); sfx('mstep', new THREE.Vector3(DEDE.x + 2.5, W.dedeY + 1, DEDE.z + 2));
  });
  trig('mirror', () => G.flags.lampLit && P.inside && P.z > DEDE.z + 0.6 && P.x < DEDE.x - 1 && lookingAt(W.mirrorAt.x, W.mirrorAt.y, W.mirrorAt.z, 0.45), async () => {
    const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); const bx = P.x + 1.3, bz = P.z + (P.z < DEDE.z + 2 ? 0.9 : -0.9);
    sfx('over_shoulder', null, 0.8); monsterShow(Math.min(bx, DEDE.x + 1.5), bz, 0, 2); monsterFace(W.mirrorAt.x, W.mirrorAt.z); MON.g.scale.setScalar(0.85);
    await wait(0.15); sfx('reveal'); G.fear = 0.9; await wait(0.9); sfx('vanish', null, 0.7); monsterHide(); MON.g.scale.setScalar(1.05); MON.g.traverse(o => o.layers.set(0)); flicker(0.5); await say('H22');
  });
  trig('knock', () => G.flags.note2 && P.inside && P.z > DEDE.z - 0.3, knockEvent);
}
HANDLERS.dedeDoor = async () => { const d = W.doors.dede; if (d.locked) { caption('Kapıyı açmamalıyım.', 2); return; } setDoor('dede', !d.open); G.flags.doorOpen = d.open; };
HANDLERS.matches = async () => { setInter('matches', false); sfx('creak', new THREE.Vector3(DEDE.x + 4, W.dedeY + 1, DEDE.z - 2.6)); give('kibrit', 'Kibrit'); await say('H18'); setObj('Gaz lambasını yak (oturma odası)'); setInter('lamp', true); };
HANDLERS.lamp = async () => { setInter('lamp', false); sfx('match'); await wait(0.6); G.flags.lampLit = 1; W.lampLight.intensity = 9; FX.lampGlow.material.opacity = 0.6; await say('H19'); setInter('note2', true); setObj('Masadaki notu oku'); };
HANDLERS.note2 = async () => { setInter('note2', false); W.note2Mesh.visible = false; const p = note('note2'); await wait(0.3); await say('H20'); await say('H21'); await p; G.flags.note2 = 1; setObj('Evden çık'); saveCP('c2b'); };
HANDLERS.photo = async () => { if (G.flags.knocked && !G.flags.photo2) { G.flags.photo2 = 1; caption('Fotoğraftaki Emirhan\'ın yüzü... kazınmış.', 3); sfx('whisper', new THREE.Vector3(DEDE.x - 1, W.dedeY + 2, DEDE.z - 3.8)); G.fear = 0.5; } else caption('Ben ve Emirhan. Köydeki son kışımız... Sonra yollarımız ayrıldı.', 3.5); };
CP.c2b = async () => { G.ch = 1; P.items.fener = P.items.kibrit = true; G.flags.lantern = 1; G.flags.lampLit = 1; G.flags.note2 = 1; resetWorldState(); renderInv(); placePlayer(DEDE.x - 2, DEDE.z - 0.8, Math.PI); P.light = true; fadeTo(0, 1.2); setupC2(); };
async function knockEvent() {
  P.lock = true; G.flags.knocked = 1; if (W.doors.dede.open) setDoor('dede', false); W.doors.dede.locked = true;
  sfx('knock', doorPos(), 3); await wait(1.5);
  await phone('Furkan Başkaya', ['FS01', 'H23', 'FS02'], { unknown: true });
  sfx('knock', doorPos(), 5); G.fear = 0.8; await wait(1.2);
  const y = W.dedeY; await cine([CAMERA.position.x, CAMERA.position.y, CAMERA.position.z], [DEDE.x, y + 1.5, DEDE.z + 4], [DEDE.x + 0.3, y + 1.65, DEDE.z + 2.2], [DEDE.x, y + 1.5, DEDE.z + 4.2], 2);
  sfx('bang', doorPos()); const v = await choice([{ t: 'KAPIYI AÇ', v: 'open' }, { t: 'AÇMA', v: 'no' }], 6, 'no'); G.flags.c2choice = v;
  if (v === 'open') {
    setDoor('dede', true); sfx('gust'); G.flags.doorOpen = 1; W.lampLight.intensity = 0; FX.lampGlow.material.opacity = 0; G.flags.lampOut = 1;
    for (let i = 0; i < 7; i++) footprint(DEDE.x + 0.4 - (i % 2) * 0.8, DEDE.z + 5.5 + i * 1.6, Math.PI, true);
    await cine([DEDE.x + 0.3, y + 1.65, DEDE.z + 2.2], [DEDE.x, y + 1.4, DEDE.z + 6], [DEDE.x, y + 1.7, DEDE.z + 3.6], [DEDE.x + 1, y + 0.2, DEDE.z + 12], 3);
    await say('H24');
  } else {
    sfx('scratch', new THREE.Vector3(DEDE.x - 5.3, y + 2, DEDE.z - 2)); await say('H25');
    await cine([DEDE.x + 0.3, y + 1.65, DEDE.z + 2.2], [DEDE.x, y + 1.5, DEDE.z + 4.2], [DEDE.x - 3.2, y + 1.85, DEDE.z - 0.9], [DEDE.x - 5.2, y + 2.1, DEDE.z - 2], 1.8);
    monsterShow(DEDE.x - 6.0, DEDE.z - 2, Math.PI / 2); monsterAnimate(0.016, 0, G.time); { const tgt = new THREE.Vector3(DEDE.x - 5.7, 0, DEDE.z - 2.28); monsterGlow(4); const f = new THREE.Vector3(tgt.x - CAMERA.position.x, 0, tgt.z - CAMERA.position.z); const dd = f.length(); f.normalize(); G.jsCenter = { f, d: dd, dy: W.dedeY + 2.08 - CAMERA.position.y }; } sfx('js_fright'); G.flash = 0.25; G.chroma = 1; await wait(0.45); G.jsCenter = null; monsterHide();
  }
  cineEnd(); W.doors.dede.locked = false; await say('H26');
  setObj('Kuzeydeki ormanda Oduncu Rıza\'nın kulübesine git'); P.lock = false; setInter('wood', true); setInter('kav', true); setInter('chest', true); saveCP('c3');
  setupC3();
}
// ---- III: ORMAN ----
CP.c3 = async () => { G.ch = 2; P.items.fener = P.items.kibrit = true; G.flags.lantern = G.flags.lampLit = G.flags.note2 = G.flags.knocked = 1; resetWorldState(); renderInv(); placePlayer(DEDE.x, DEDE.z + 6, Math.PI * 0.9); P.light = true; fadeTo(0, 1.2); setObj("Kuzeydeki ormanda Oduncu Rıza'nın kulübesine git"); setupC3(); };
function setupC3() {
  trig('forest', () => P.z < -52, async () => { P.lock = true; G.ch = 2; const y = groundAt(P.x, P.z); await cine([P.x + 6, y + 9, P.z + 8], [P.x, y + 1, P.z - 20], [P.x, y + 1.7, P.z], [P.x - 2, y + 1.6, P.z - 15], 4); await card(2); cineEnd(); P.lock = false; await say('H27'); });
  trig('whisper', () => P.z < -68, async () => { const b = new THREE.Vector3(P.x + Math.sin(P.yaw) * 3, groundAt(P.x, P.z) + 1.7, P.z + Math.cos(P.yaw) * 3); sfx('whisper', b); await playVoice('K01'); hideSub(); G.fear = 0.6; await say('H28'); });
  trig('branch', () => P.z < -78, async () => { sfx('creak', new THREE.Vector3(P.x - 6, 4, P.z - 4)); await wait(0.6); sfx('splash', new THREE.Vector3(P.x - 6, 2, P.z - 4)); });
  trig('cross', () => P.z < -86, async () => {
    flicker(1.2); await wait(0.5); const z = P.z - 16; monsterShow(P.x - 22, z, Math.PI / 2); MON.state = 'cross';
    await walkTo(P.x + 26, z, 9, 4, 1);
    monsterHide(); G.fear = 0.8; sfx('growl', new THREE.Vector3(P.x + 25, 1, z)); await say('H29');
  });
  trig('beam', () => P.z < -93 && !P.inside, async () => { await beamReveal(7, 2.4); });
  trig('hutknock', () => P.items.kav && !P.items.muska && P.inside, async () => { await wait(1.2); for (let i = 0; i < 3; i++) { sfx('knock', new THREE.Vector3(HUT.x - 2.6, W.hutY + 1.4, HUT.z - 1), 2); await wait(0.9); } sfx('scratch', new THREE.Vector3(HUT.x - 2.6, W.hutY + 1.4, HUT.z)); flicker(0.6); G.fear = 0.8; await wait(1.5); sfx('sniff', new THREE.Vector3(HUT.x + 2.6, W.hutY + 1.6, HUT.z)); });
  trig('hut', () => near(HUT.x, HUT.z + 2.5, 3), async () => { await say('H30'); await wait(1.5); if (P.inside) { sfx('bang', new THREE.Vector3(HUT.x, W.hutY + 1, HUT.z + 2)); G.fear = 0.5; caption('[Rüzgâr kapıyı çarpıyor]', 2); } setObj('Odunu, kavı ve dedenin sandığını al'); });
  trig('ambient3', () => P.z < -60, async () => { while (true) { await wait(14 + Math.random() * 12); sfx(Math.random() < 0.5 ? 'growl' : 'howl', new THREE.Vector3(P.x + (Math.random() - 0.5) * 80, 2, P.z - 30 - Math.random() * 30)); } }, true);
}
HANDLERS.wood = async () => { setInter('wood', false); W.hutWood.visible = false; give('odun', 'Kuru odun'); await say('H31'); checkHut(); };
HANDLERS.kav = async () => { setInter('kav', false); W.hutKav.visible = false; give('kav', 'Kav'); await say('H32'); checkHut(); };
HANDLERS.chest = async () => { setInter('chest', false); W.hutChestLid.rotation.x = -1.2; sfx('creak', new THREE.Vector3(HUT.x + 1.4, W.hutY + 1, HUT.z)); give('muska', 'Muska'); await say('H33'); const p = note('note3'); await say('H34'); await p; checkHut(); };
function checkHut() { const it = P.items; if (it.odun && it.kav && it.muska) { setObj('Köye dön'); saveCP('c3b'); trig('ambush', () => !P.inside && P.z > HUT.z + 3.5, ambush); } }
CP.c3b = async () => { G.ch = 2; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1, 't_forest': 1, 't_hut': 1 }); resetWorldState(); renderInv(); placePlayer(HUT.x, HUT.z + 1, Math.PI); P.light = true; fadeTo(0, 1); setObj('Köye dön'); trig('ambush', () => !P.inside && P.z > HUT.z + 3.5, ambush); };
async function ambush() {
  P.lock = true; const y = groundAt(P.x, P.z); const mx = P.x + 2, mz = P.z + 11;
  monsterShow(mx, mz, Math.PI); MON.state = 'stand'; sfx('roar', MON.g.position); G.fear = 1;
  await cine([P.x, y + 1.65, P.z], [mx, y + 2.4, mz], [P.x + 0.2, y + 1.55, P.z - 0.4], [mx, y + 2.3, mz], 1.2);
  G.camAnim = true; await say('K02'); await say('K03'); G.camAnim = false;
  const v = await choice([{ t: 'KOŞ', v: 'run' }, { t: 'KULÜBEYE SAKLAN', v: 'hide' }], 5, 'run');
  cineEnd(); P.lock = false;
  if (v === 'run') {
    P.yaw = Math.PI * 0.85; sfx('roar', MON.g.position); setObj('KAÇ! Köye koş'); MON.g.position.set(P.x - 4, MON.g.position.y, P.z - 12);
    chaseStart({ speed: 4.6, until: () => P.z > -50, lines: ['K04', 'K05', 'K06', 'K07'] });
    await until(() => !G.chase); MON.state = 'off'; sfx('roar', MON.g.position); monsterHide(); await say('H36');
  } else {
    monsterHide(); await hideSequence(); await say('H36'); setObj('Köye dön');
    trig('stalk', () => P.z > -70, async () => { const s = new THREE.Vector3(P.x - 20, 2, P.z - 25); sfx('growl', s); });
  }
  setupC4Pre();
}
// ---- IV: KUYU ----
function setupC4Pre() { saveCP('c4'); trig('lookback2', () => P.z > -78 && P.z < -56 && !G.chase, async () => { await lookBackScare(5, 12); }); trig('village4', () => P.z > -50, chapter4); }
CP.c4 = async () => { G.ch = 3; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1 }); resetWorldState(); renderInv(); placePlayer(-12, -56, Math.PI); P.light = true; fadeTo(0, 1); setObj('Köye dön'); trig('village4', () => P.z > -50, chapter4); };
async function chapter4() {
  G.ch = 3; P.lock = true; const y = W.wellY;
  await cine([WELL.x + 10, y + 6, WELL.z - 14], [WELL.x, y + 1, WELL.z], [WELL.x + 3, y + 2.2, WELL.z - 4], [WELL.x, y + 0.8, WELL.z], 4.5);
  await card(3); cineEnd(); P.lock = false;
  await phone('Furkan Başkaya', ['F04', 'H37', 'F05', 'H38', 'F06', 'H57', 'F11', 'H39', 'F07'], { cut: true, static: true });
  setObj('Dedenin mezarını bul (caminin arkası)'); setInter('grave', true); saveCP('c4b'); setupC4();
}
CP.c4b = async () => { G.ch = 3; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1 }); resetWorldState(); renderInv(); placePlayer(-4, -40, Math.PI * 0.6); P.light = true; fadeTo(0, 1); setObj('Dedenin mezarını bul (caminin arkası)'); setupC4(); };
function setupC4() {
  trig('cem', () => near(46, -38, 9), async () => { await say('H40'); });
  trig('cemrun', () => near(44, -39, 14) && !P.items.soz, async () => { await wait(2.5); const f = camFwd(), rt = new THREE.Vector3(-f.z, 0, f.x); const sx = P.x + f.x * 10 - rt.x * 10, sz = P.z + f.z * 10 - rt.z * 10; if (blocked(sx, sz, 0.5)) return; monsterShow(sx, sz, 0); monsterGlow(3); monsterReveal(20); MON.state = 'walk'; sfx('growl', MON.g.position); await walkTo(P.x + f.x * 10 + rt.x * 11, P.z + f.z * 10 + rt.z * 11, 11, 2.4, 1); monsterHide(); sfx('sting'); G.chroma = 0.6; G.fear = 0.8; });
  trig('wellwhisper', () => near(WELL.x, WELL.z, 9) && !P.items.soz, async () => { sfx('whisper', new THREE.Vector3(WELL.x, W.wellY, WELL.z)); sfx('remember', null, 0.35); await playVoice('E01'); hideSub(); });
}
HANDLERS.grave = async () => {
  setInter('grave', false); sfx('ancestors2', null, 0.8); const p = note('grave'); await say('H41'); await p; G.flags.grave = 1; setObj('Kuyuya dön ve ipi çek'); setInter('well', true, 'İpi çek');
  // a second fresh stone appears: Halil's own name
  if (!W.halilGrave) { const c = document.createElement('canvas'); c.width = 256; c.height = 384; const g = c.getContext('2d'); g.fillStyle = '#86847e'; g.fillRect(0, 0, 256, 384); g.fillStyle = '#2a2826'; g.textAlign = 'center'; g.font = 'bold 30px Georgia'; g.fillText('HALİL', 128, 130); g.fillText('AKSU', 128, 168); g.font = '24px Georgia'; g.fillText('2005 — 2026', 128, 214); g.fillStyle = 'rgba(240,245,255,.95)'; g.fillRect(0, 0, 256, 12);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.15), [MAT.rock, MAT.rock, MAT.roof, MAT.rock, new THREE.MeshStandardMaterial({ map: tex }), MAT.rock]); const gx = 54.6, gz = -39.6; m.position.set(gx, heightAt(gx, gz) + 0.6, gz); SCENE.add(m); W.halilGrave = m;
    addInter({ id: 'halilgrave', x: gx, y: heightAt(gx, gz) + 1, z: gz + 0.2, label: 'Yeni bir taş…', r: 2.2 }); }
  W.halilGrave.visible = true; setInter('halilgrave', true);
};
HANDLERS.halilgrave = async () => { setInter('halilgrave', false); G.flags.halilSeen = 1; sfx('js_impact'); sfx('ancestors', null, 0.6); G.chroma = 1; G.fear = 1; caption('HALİL AKSU  •  24.03.2005 — 2026', 3); await wait(2.5); trig('graveGone', () => !lookingAt(W.halilGrave.position.x, W.halilGrave.position.y, W.halilGrave.position.z, 0.9), async () => { W.halilGrave.visible = false; sfx('whisper', W.halilGrave.position); }); };
HANDLERS.well = async () => {
  if (!G.flags.grave) { sfx('whisper', new THREE.Vector3(WELL.x, W.wellY, WELL.z)); caption('Aşağısı zifiri karanlık. Bir şey... nefes alıyor.', 3); return; }
  if (!P.items.kol) { // the crank has been removed: the old school keeps grandfather's tools
    setInter('well', false); P.lock = true; sfx('rope', new THREE.Vector3(WELL.x, W.wellY + 1, WELL.z)); await say('H59'); await say('H60'); P.lock = false;
    G.flags.needKol = 1; setObj('Kuyunun kolunu bul (köy okulu)'); setInter('well', true, 'İpi çek'); for (const id of ['schoolPhoto', 'kol', 'board']) setInter(id, true); saveCP('c4s'); setupSchool(); return; }
  setInter('well', false); P.lock = true; const y = W.wellY;
  await cine([CAMERA.position.x, CAMERA.position.y, CAMERA.position.z], [WELL.x, y + 0.6, WELL.z], [WELL.x + 1.4, y + 1.7, WELL.z + 0.6], [WELL.x, y + 0.3, WELL.z], 1.5);
  await playVoice('E02'); await say('H42');
  W.wellBucket.visible = true; W.wellBucket.position.y = -6;
  for (let i = 0; i < 9; i++) { sfx('rope', new THREE.Vector3(WELL.x, y + 1, WELL.z)); W.wellAxle.rotation.x -= 0.7; W.wellBucket.position.y += 0.75; await wait(0.38); }
  W.wellBucket.position.y = 0.95; give('saat'); give('soz', 'Söz'); await say('H43'); const p = note('soz'); await say('H44'); await p; saveCP('c4c');
  await wellChase();
};
CP.c4c = async () => { G.ch = 3; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1, kol: 1, soz: 1, saat: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1, grave: 1, halilSeen: 1 }); resetWorldState(); setInter('ocak', false); renderInv(); placePlayer(WELL.x + 1.4, WELL.z + 0.8, Math.PI * 0.4); P.light = true; fadeTo(0, 0.8); await wait(0.6); await wellChase(); };
async function wellChase() {
  P.lock = true; const y = W.wellY; sfx('scream'); sfx('bass'); G.shake = 1;
  monsterShow(WELL.x, WELL.z, 0); MON.g.position.y = y - 2.2; MON.reach = 1; monsterFace(P.x, P.z);
  await cine([P.x, y + 1.7, P.z], [WELL.x, y + 1.2, WELL.z], [P.x + 0.6, y + 1.6, P.z + 1.2], [WELL.x, y + 2.6, WELL.z], 1.0);
  await until(() => { MON.g.position.y = Math.min(W.wellY, MON.g.position.y + G.lastDt * 1.6); monsterAnimate(G.lastDt, 0.2, G.time); return MON.g.position.y >= W.wellY - 0.01; });
  await say('K11'); cineEnd(); MON.reach = 0; MON.g.position.y = y;
  setObj('EVE KOŞ!'); P.lock = false; P.yaw = Math.atan2(-(DEDE.x - P.x), -(DEDE.z + 5 - P.z));
  if (!W.doors.dede.open) setDoor('dede', true);
  await wait(0.9); chaseStart({ speed: 5.1, until: () => P.inside, lines: ['K12', 'K06', 'K04'] });
  await until(() => !G.chase); setDoor('dede', false); W.doors.dede.locked = true; sfx('bang', doorPos()); monsterHide(); await say('H45');
  chapter5();
}

// ---- IV b: KÖY OKULU ----
const inSchool = () => isIndoor(P.x, P.z) === W.schoolBox;
const inClassroom = () => inSchool() && P.x < SCHOOL.x + 1;
function setupSchool() {
  trig('schoolIn', () => inSchool(), async () => { await say('H61'); await wait(7); sfx('bell', W.schoolBellPos, 16); G.fear = 0.6; await wait(0.8); await say('H64'); });
  trig('boardSee', () => G.flags.boardSwap && inClassroom() && lookingAt(SCHOOL.x - 6.85, W.schoolY + 2, SCHOOL.z, 0.35), async () => {
    sfx('reveal'); G.chroma = 0.7; G.fear = 0.9; flicker(0.5); await say('H65'); sfx('whisper', new THREE.Vector3(SCHOOL.x - 3, W.schoolY + 1.5, SCHOOL.z + 2)); await playVoice('E05'); });
}
HANDLERS.schoolPhoto = async () => {
  setInter('schoolPhoto', false); P.lock = true; G.noteOpen = true; unlockPointer();
  const bp = $('bigPhoto'), im = $('bigPhotoImg'); if (window.OKUL_PHOTO && !im.src) im.src = OKUL_PHOTO; bp.classList.add('show'); sfx('pickup');
  // while your back is turned the room rearranges itself
  const first = !G.flags.desksMoved; if (first) { for (const d of W.desks) { d.rotation.y = (Math.random() - 0.5) * 1.5; d.position.x = d.userData.base.x + (Math.random() - 0.5) * 0.3; } W.board.material.map = W.boardTex[1]; W.board.material.needsUpdate = true; G.flags.desksMoved = 1; G.flags.boardSwap = 1; }
  const kd = e => { if (['KeyE', 'Escape', 'Enter', 'Space'].includes(e.code)) stopVoice(); }; window.addEventListener('keydown', kd); bp.style.pointerEvents = 'auto'; bp.onclick = () => stopVoice();
  await playVoice('OKUL', { src: 'sesler/okul_video.mp3', sub: ['', '2026  İzmir  Menteş'], est: 15.5 });
  window.removeEventListener('keydown', kd); bp.onclick = null; bp.style.pointerEvents = 'none'; bp.classList.remove('show'); G.noteOpen = false; P.lock = false; relock();
  if (!G.flags.photoSeen) { G.flags.photoSeen = 1; await wait(0.6); sfx('creak', new THREE.Vector3(SCHOOL.x - 2, W.schoolY + 1, SCHOOL.z)); await wait(0.2); sfx('bang', new THREE.Vector3(SCHOOL.x - 2, W.schoolY + 1, SCHOOL.z)); G.shake = 0.5; G.fear = 0.9; await say('H62'); }
  setInter('schoolPhoto', true);
};
HANDLERS.board = async () => { caption(G.flags.boardSwap ? 'AÇ KAPIYI HALİL' : '“HALİL + EMİRHAN — en iyi arkadaş”', 3); if (!G.flags.boardSwap) { await wait(0.3); await say('H61'); } };
HANDLERS.kol = async () => {
  setInter('kol', false); W.kolMesh.visible = false; give('kol', 'Kuyu kolu'); await say('H63'); await schoolChase();
};
async function schoolChase() {
  P.lock = true; flicker(1.4); sfx('bell', W.schoolBellPos, 24); G.shake = 0.4; await wait(1.2);
  monsterShow(SCHOOL.x + 0.2, SCHOOL.z + 2, Math.PI / 2); MON.g.position.y = W.schoolY + 0.31; MON.state = 'stand'; sfx('roar', MON.g.position); G.fear = 1;
  P.lock = false; setObj('KAÇ! Okuldan çık'); playVoice('K16');
  chaseStart({ speed: 4.4, grace: 1.6, until: () => !P.inside && Math.hypot(P.x - (SCHOOL.x + 7), P.z - (SCHOOL.z + 2)) > 24, lines: ['K05', 'K06', 'K04'] });
  await until(() => !G.chase); monsterHide(); sfx('growl', new THREE.Vector3(SCHOOL.x + 7, W.schoolY + 1, SCHOOL.z + 2));
  setObj('Kuyuya dön ve ipi çek'); saveCP('c4t');
}
CP.c4s = async () => { G.ch = 3; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1, grave: 1, halilSeen: 1, needKol: 1, t_cem: 1, t_cemrun: 1 }); resetWorldState(); renderInv(); placePlayer(WELL.x + 2, WELL.z + 2, 0.9); P.light = true; fadeTo(0, 1); setObj('Kuyunun kolunu bul (köy okulu)'); setupC4(); setupSchool(); };
CP.c4t = async () => { G.ch = 3; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1, kol: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1, grave: 1, halilSeen: 1, needKol: 1, photoSeen: 1, t_cem: 1, t_cemrun: 1 }); resetWorldState(); renderInv(); placePlayer(SCHOOL.x + 12, SCHOOL.z + 2, -Math.PI / 2 - 0.6); P.light = true; fadeTo(0, 1); setObj('Kuyuya dön ve ipi çek'); setupC4(); };
// ---- V: ZEMHERİ GECESİ ----
async function chapter5() {
  G.ch = 4; saveCP('c5'); P.lock = true; const y = W.dedeY;
  await cine([DEDE.x - 0.5, y + 2.6, DEDE.z + 2.5], [DEDE.x - 2.5, y + 0.8, DEDE.z - 3.4], [DEDE.x - 2.0, y + 1.6, DEDE.z - 0.6], [DEDE.x - 2.5, y + 0.9, DEDE.z - 3.4], 4);
  await card(4); cineEnd(); P.lock = false; await say('H46'); setObj('Ocağı yak'); setInter('ocak', true, 'Odunu yerleştir'); G.ocakStep = 0;
  run(async () => { while (G.ch === 4 && !G.ended) { await wait(5 + Math.random() * 5); if (G.ocakStep < 4) sfx(Math.random() < 0.5 ? 'scratch' : 'knock', doorPos(), 2); } });
}
CP.c5 = async () => { G.ch = 4; Object.assign(P.items, { fener: 1, kibrit: 1, odun: 1, kav: 1, muska: 1, soz: 1, saat: 1 }); Object.assign(G.flags, { lantern: 1, lampLit: 1, note2: 1, knocked: 1, grave: 1, halilSeen: 1 }); resetWorldState(); W.doors.dede.locked = true; renderInv(); placePlayer(DEDE.x, DEDE.z + 2.4, 0); P.light = true; fadeTo(0, 1); await chapter5(); };
HANDLERS.ocak = async () => {
  const s = G.ocakStep || 0; setInter('ocak', false);
  if (s === 0) { W.ocakWood.visible = true; G.flags.woodPlaced = 1; sfx('stepWood', W.firePos); await say('H47'); setInter('ocak', true, 'Kavı koy'); }
  else if (s === 1) { sfx('pickup'); await say('H48'); W.lampLight.intensity = 0; FX.lampGlow.material.opacity = 0; flicker(0.6); await wait(0.5); await subliminal(130); sfx('bang', doorPos()); G.shake = 0.6; G.fear = 1; await wait(0.8); if (!G.flags.lampOut) { W.lampLight.intensity = 8; FX.lampGlow.material.opacity = 0.6; } setInter('ocak', true, 'Kibriti çak'); }
  else if (s === 2) { sfx('match'); await say('H49'); G.fireS = 0.35; sfx('fire', W.firePos); setInter('ocak', true, 'Sözü söyle'); }
  else if (s === 3) { sfx('summoning', null, 0.7); await say('H50'); G.fireS = 1; sfx('fire', W.firePos); G.flash = 0.25; post.uniforms.uFlashCol.value.set(1, 0.6, 0.3); await finale(); return; }
  G.ocakStep = s + 1;
};
async function finale() {
  P.lock = true; G.ocakStep = 4; const y = W.dedeY; await wait(1.5); W.lampLight.intensity = 0; FX.lampGlow.material.opacity = 0; flicker(1.5);
  for (let i = 0; i < 3; i++) { sfx('bang', doorPos()); G.shake = 0.6; await wait(0.7); }
  await say('K13'); await wait(1.2);
  await cine([CAMERA.position.x, CAMERA.position.y, CAMERA.position.z], [DEDE.x, y + 1.5, DEDE.z + 4], [DEDE.x - 0.6, y + 1.6, DEDE.z + 1.6], [DEDE.x, y + 1.4, DEDE.z + 4.1], 3, 'out');
  G.fireS = 0.55; sfx('remember', null, 0.35); await playVoice('E03'); await playVoice('E04'); await say('H51');
  const v = await choice([{ t: 'KAPIYI AÇ — "Emirhan…"', v: 'open' }, { t: 'OCAĞIN BAŞINDA KAL', v: 'stay' }], 8, 'open');
  if (v === 'stay') await endingGood(); else await endingBad();
}
async function endingGood() {
  const y = W.dedeY; await cine([DEDE.x - 0.6, y + 1.6, DEDE.z + 1.6], [DEDE.x, y + 1.4, DEDE.z + 4.1], [DEDE.x - 2.1, y + 1.4, DEDE.z - 1.6], [DEDE.x - 2.5, y + 0.8, DEDE.z - 3.4], 2);
  await say('H52'); G.fireS = 2.2; G.flash = 1; post.uniforms.uFlashCol.value.set(1, 0.7, 0.4); sfx('scream'); playVoice('K14'); G.shake = 1.2;
  await wait(2.5); hideSub(); await fadeTo(1, 2); G.flash = 0;
  // dawn
  G.dawn = 1; G.storm = 0.15; FOG.density = 0.02; W.fireLight.intensity = 0; G.fireS = 0.6; setDoor('dede', true, true);
  const ey = heightAt(DEDE.x + 6, DEDE.z + 14); fadeTo(0, 3); sfx('dawn', null, 0.7);
  await cine([DEDE.x + 1, y + 1.7, DEDE.z + 5.5], [DEDE.x + 30, ey + 6, DEDE.z + 40], [DEDE.x + 6, ey + 3, DEDE.z + 14], [DEDE.x + 40, ey + 12, DEDE.z + 60], 9, 'lin');
  await phone('Furkan Başkaya', ['F08', 'H53', 'F09', 'H54', 'F12', 'H58']);
  await say('H55'); await fadeTo(1, 3); credits('SON 1', 'OCAK SÖNMEZ', 'Halil kapıyı açmadı. Ocak, yeniden yanıyor.');
}
async function endingBad() {
  const y = W.dedeY; await say('H56'); setDoor('dede', true); sfx('gust'); G.fireS = 0.1; W.fireLight.intensity = 0.3;
  monsterShow(DEDE.x, DEDE.z + 6, Math.PI); MON.g.scale.setScalar(1.05); monsterFace(P.x, P.z);
  await cine([DEDE.x - 0.6, y + 1.6, DEDE.z + 1.6], [DEDE.x, y + 1.6, DEDE.z + 6], [DEDE.x, y + 1.65, DEDE.z + 3.0], [DEDE.x, y + 2.4, DEDE.z + 6], 3, 'in');
  G.fadeTo = 0; await say('K15'); MON.reach = 1; sfx('js_blood'); sfx('kidnapped', null, 0.6); G.flash = 0.7; post.uniforms.uFlashCol.value.set(0.4, 0, 0); G.chroma = 1;
  MON.g.position.set(DEDE.x, y - 0.35, DEDE.z + 3.9); await wait(0.6); G.fade = 1; G.fadeTo = 1; MON.reach = 0; monsterHide(); await wait(2.5); G.flash = 0; G.chroma = 0;
  // morning: empty house, ringing phone, well whisper
  G.dawn = 0.6; G.storm = 0.4; G.fireS = 0; setDoor('dede', true, true); fadeTo(0, 3); sfx('spell', null, 0.5);
  await cine([DEDE.x - 3.5, y + 2.2, DEDE.z + 2.8], [DEDE.x, y + 0.5, DEDE.z + 1], [DEDE.x - 1.5, y + 1.6, DEDE.z + 2.0], [DEDE.x + 0.5, y + 0.5, DEDE.z + 3], 6, 'lin');
  await phone('Furkan Başkaya', ['F10'], {});
  await cine([WELL.x + 6, W.wellY + 4, WELL.z + 6], [WELL.x, W.wellY + 0.6, WELL.z], [WELL.x + 1.2, W.wellY + 1.4, WELL.z + 0.8], [WELL.x, W.wellY, WELL.z], 6, 'lin');
  sfx('whisper', new THREE.Vector3(WELL.x, W.wellY, WELL.z)); await say('HW01'); await fadeTo(1, 2.5);
  credits('SON 2', 'ZEMHERİ', 'Halil kapıyı açtı. Kuyudan artık onun sesi geliyor.');
}
function credits(a, b, c) { G.ended = true; letterbox(false); unlockPointer(); $('endA').textContent = a; $('endB').textContent = b; $('endC').textContent = c; $('end').classList.add('show'); store('hn_save', { cp: 'c1', items: {}, flags: {} }); const d = load('hn_done', {}); d[a] = 1; store('hn_done', d); }
// ---------- flashlight flicker ----------
function flicker(s) { G.flickT = s; }
// ============ MAIN LOOP ============
const clock = new THREE.Clock(); let stepTick = 0;
function update(dt) {
  G.time += dt; G.lastDt = dt; post.uniforms.uTime.value = G.time;
  if (G.choiceTick) G.choiceTick(dt / G.slowmo);
  if (G.phoneTimer) G.phoneTimer();
  tickTimers(dt);
  if (G.busRun && G.busRun.on) { W.bus.position.z += dt * Math.min(9, (G.busV = (G.busV || 0) + dt * 2.5)); W.bus.position.y = heightAt(1.2, W.bus.position.z); }
  // fade/flash
  G.fade += (G.fadeTo - G.fade) * Math.min(1, dt * (G.fadeSpd || 1) * 3); post.uniforms.uFade.value = G.fade;
  G.flash = Math.max(0, G.flash - dt * 1.2); post.uniforms.uFlash.value = G.flash; G.chroma = Math.max(0, G.chroma - dt * 0.8); post.uniforms.uChroma.value = G.chroma;
  // player
  const inside = isIndoor(P.x, P.z); P.inside = !!inside;
  if (!G.cine && !P.hidden) {
    let mf = 0, ms = 0;
    if (!P.lock && !G.paused) { if (K.KeyW || K.ArrowUp) mf += 1; if (K.KeyS || K.ArrowDown) mf -= 1; if (K.KeyD || K.ArrowRight) ms += 1; if (K.KeyA || K.ArrowLeft) ms -= 1; if (TC.mv) { mf = -TC.mv.dy; ms = TC.mv.dx; } }
    const l = Math.hypot(mf, ms); if (l > 1) { mf /= l; ms /= l; }
    const wantRun = (K.ShiftLeft || K.ShiftRight || K.TouchRun) && mf > 0.2 && P.stam > 0.02;
    P.run = wantRun; if (P.run) P.stam = Math.max(0, P.stam - dt / 8); else P.stam = Math.min(1, P.stam + dt / (l > 0.1 ? 10 : 5));
    const sp = (P.run ? 6.1 : 2.9) * (inside ? 0.75 : 1) * (l > 0 ? 1 : 0);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tvx = (fx * mf + rx * ms) * sp, tvz = (fz * mf + rz * ms) * sp; const k = 1 - Math.exp(-dt * 9); P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
    const p = { x: P.x + P.vx * dt, z: P.z + P.vz * dt }; resolve(p, 0.32); const moved = Math.hypot(p.x - P.x, p.z - P.z); P.x = p.x; P.z = p.z;
    const gy = groundAt(P.x, P.z); P.y += (gy - P.y) * Math.min(1, dt * 12);
    P.bob += moved * (P.run ? 2.2 : 2.6); P.stepD += moved;
    if (P.stepD > (P.run ? 1.15 : 0.85)) { P.stepD = 0; sfx(inside ? 'stepWood' : 'step', null, P.run ? 0.7 : 0.45); if (!inside && ++P.footN % 2 === 0) footprint(P.x + Math.cos(P.yaw) * (P.footN % 4 ? 0.15 : -0.15), P.z - Math.sin(P.yaw) * 0.15, P.yaw, false); }
    const bobA = Math.min(1, Math.hypot(P.vx, P.vz) / 3);
    CAMERA.position.set(P.x, P.y + P.eye + Math.sin(P.bob) * 0.045 * bobA, P.z);
    CAMERA.rotation.set(P.pitch + Math.sin(P.bob * 0.5) * 0.004 * bobA, P.yaw + Math.sin(G.time * 0.4) * 0.003, Math.sin(P.bob * 0.5) * 0.006 * bobA);
    $('stam').style.opacity = P.stam < 0.98 ? 1 : 0; $('stam').firstElementChild.style.width = (P.stam * 100) + '%';
  } else if (P.hidden) { CAMERA.rotation.set(P.pitch + Math.sin(G.time * 1.3) * 0.01, P.yaw + Math.sin(G.time * 0.7) * 0.02, 0); }
  updCine(dt);
  if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.5); CAMERA.position.x += (Math.random() - 0.5) * 0.08 * G.shake; CAMERA.position.y += (Math.random() - 0.5) * 0.06 * G.shake; CAMERA.rotation.z += (Math.random() - 0.5) * 0.03 * G.shake; }
  CAMERA.updateMatrixWorld();
  // flashlight (lags slightly behind view)
  const fon = P.light && !G.cineNoLight; let fi = fon ? (P.inside ? 10 : 46) : 0;
  if (G.lightKill > 0) { G.lightKill -= dt; fi = 0; }
  if (G.flickT > 0) { G.flickT -= dt; fi *= Math.random() < 0.5 ? 0.05 : 1; if (Math.random() < 0.1) sfx('flick'); }
  FL.intensity += (fi - FL.intensity) * Math.min(1, dt * 20);
  const off = new THREE.Vector3(0.22, -0.28, -0.1).applyQuaternion(CAMERA.quaternion); FL.position.copy(CAMERA.position).add(off);
  const tgt = new THREE.Vector3(0, 0, -6).applyQuaternion(CAMERA.quaternion).add(CAMERA.position); FL.target.position.lerp(tgt, Math.min(1, dt * 12));
  // environment
  const indoor = P.inside; const dawn = G.dawn || 0;
  FOG.density += ((indoor ? 0.022 : G.ch === 2 ? 0.05 : 0.034) * (1 - dawn * 0.6) - FOG.density) * Math.min(1, dt);
  const fogCol = new THREE.Color(0x0d131c).lerp(new THREE.Color(0x5a6676), dawn); FOG.color.copy(fogCol); SCENE.background.copy(fogCol);
  HEMI.intensity = (indoor ? 0.12 : 0.36) + dawn * 1.4; MOON.intensity = (indoor ? 0.05 : 0.6) + dawn * 1.1; post.uniforms.uExpo.value = (1.25 + (indoor ? 0.1 : 0)) * (SET.bri || 1);
  W.snow.material.uniforms.uTime.value = G.time; W.snow.material.uniforms.uCam.value.copy(CAMERA.position); W.snow.material.uniforms.uOpacity.value += ((indoor ? 0 : 0.85 * (G.storm == null ? 1 : G.storm)) - W.snow.material.uniforms.uOpacity.value) * Math.min(1, dt * 3);
  moonSprite.position.copy(CAMERA.position).add(new THREE.Vector3(-60, 90, -40).normalize().multiplyScalar(150)); moonSprite.material.opacity = 0.5 * (1 - dawn);
  // lamp + fire flicker
  if (W.lampLight.intensity > 0.1 && !G.flags.lampOut) W.lampLight.intensity = 8 + Math.sin(G.time * 11) * 0.5 + Math.random() * 0.6;
  const fs = G.fireS || 0; W.fireLight.intensity = fs > 0 ? (fs * 14 + Math.sin(G.time * 13) * fs * 2 + Math.random() * fs * 3) : 0; FX.fire.material.uniforms.uS.value = Math.min(1.6, fs); FX.fire.material.uniforms.uT.value = G.time;
  if (W.flickerPost) W.flickerPost.intensity = G.ch >= 3 && !G.dawn ? (Math.random() < 0.92 ? 6 : 0) : 0;
  if (W.dedeLantern.intensity > 0) W.dedeLantern.intensity = 2.6 + Math.random() * 0.6;
  if (G.hideLight) { W.dedeLantern.position.set(HUT.x, W.hutY + 2.2, HUT.z + 3.2); W.dedeLantern.color.set(0x7088c0); W.dedeLantern.intensity = 4; W.dedeLantern.distance = 12; } else if (W.dedeLantern.color.b > 0.6) { W.dedeLantern.color.set(0xffa860); W.dedeLantern.position.set(DEDE.x + 1, W.dedeY + 2.7, DEDE.z + 4.6); W.dedeLantern.distance = 9; W.dedeLantern.intensity = G.flags.lantern ? 3 : 0; }
  // doors
  for (const k in W.doors) { const d = W.doors[k]; d.ang += (d.target - d.ang) * Math.min(1, dt * 4); d.pivot.rotation.y = d.ang; }
  // footprints fade-in
  for (const m of W.foot) if (m.material.opacity < 0.9) m.material.opacity = Math.min(0.9, m.material.opacity + dt * 2);
  // breath vapor
  FX.puffT -= dt; if (FX.puffT <= 0 && !indoor && !G.cine) { FX.puffT = P.run ? 1.2 : 3.2; FX.puffA = 0.35; }
  FX.puffA = Math.max(0, (FX.puffA || 0) - dt * 0.35); puffMat.opacity = FX.puffA * (indoor ? 0 : 1); FX.puff.position.copy(CAMERA.position).add(new THREE.Vector3(0, -0.12, -0.55 - (0.35 - FX.puffA)).applyQuaternion(CAMERA.quaternion)); FX.puff.scale.setScalar(0.25 + (0.35 - FX.puffA) * 1.5);
  // monster chase
  let mfear = 0;
  if (G.chase) {
    const c = G.chase; c.t += dt; const g = MON.g; const d = monsterChase(c.t < c.grace ? 0 : dt, P.x, P.z, c.speed * (P.inside ? 0.6 : 1)); monsterAnimate(dt, c.t < c.grace ? 0.2 : 1, G.time);
    stepTick += dt; if (stepTick > 0.36) { stepTick = 0; sfx('mstep', g.position); }
    if (Math.random() < dt * 0.4) sfx('growl', g.position);
    c.lineT -= dt; if (c.lineT <= 0 && c.lines) { c.lineT = 6 + Math.random() * 3; const id = c.lines[(c.li = ((c.li || 0) + 1)) % c.lines.length]; playVoice(id, { ifFree: true }); }
    mfear = Math.max(0, 1 - d / 25);
    if (d < 1.25 && !G.dying) run(caught);
    else if (c.until && c.until()) { chaseStop(); }
  }
  if (MON.g.visible && !G.chase) monsterAnimate(dt, MON.state === 'walk' ? 0.4 : 0, G.time);
  if (G.jsCenter && MON.g.visible) monsterCenterHead(CAMERA.position, G.jsCenter.f, G.jsCenter.d, G.jsCenter.dy || 0);
  if (G.camAnim && MON.g.visible) { monsterFace(P.x, P.z); }
  updHide(dt); if (!P.hidden && $('hide').classList.contains('show')) $('hide').classList.remove('show');
  P.fear = Math.max(mfear, P.fear - dt * 0.25, G.fear || 0); G.fear = Math.max(0, (G.fear || 0) - dt * 0.3);
  post.uniforms.uFear.value += (P.fear - post.uniforms.uFear.value) * Math.min(1, dt * 3);
  const zone = G.ended ? 'menu' : G.dawn ? 'road' : G.ch === 4 ? 'final' : indoor ? 'house' : G.ch === 3 && (P.x > 20 || near(WELL.x, WELL.z, 14)) ? 'cemetery' : (G.ch >= 2 && P.z < -50) ? 'forest' : 'road';
  auUpdate(dt, { indoor, fear: P.fear, storm: G.storm, zone, chase: !!G.chase, hide: !!P.hidden });
  auListener(CAMERA);
  // ezan: first time the minaret comes into view from the village
  { const mx = 38.6, mz = -19.4, d = Math.hypot(P.x - mx, P.z - mz);
    if (!G.flags.ezan && G.ch >= 1 && G.ch <= 3 && !G.chase && !P.inside && d < 95 && !G.cine && lookingAt(mx, groundAt(mx, mz) + 9, mz, 0.38)) { if (sfEzan()) G.flags.ezan = 1; }
    sfEzanUpdate(d); }
  updTriggers(); updStalker(dt); updSanity(dt); findFocus(); drawCompass();
}
function render() {
  renderMirror();
  renderer.setRenderTarget(RT); renderer.render(SCENE, CAMERA);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, clock.getDelta()); G.dtScale = G.slowmo || 1;
  if (!G.started) { menuScene(dt); render(); return; }
  if (G.paused) { render(); return; }
  update(dt * (G.slowmo || 1)); render();
}

// ---------- compass strip + objective marker ----------
const CMP = { c: null, g: null, t: null };
function objTarget() {
  const o = G.flags.obj || ''; const door = { x: DEDE.x, z: DEDE.z + 5.2 }; const inter = id => { const i = W.inter.find(k => k.id === id); return i ? { x: i.x, z: i.z } : null; };
  if (G.ended || G.dawn) return null;
  if (o.startsWith('Köye doğru')) return P.z > 68 ? { x: 5, z: 62 } : door;
  if (o.startsWith('Dedenin evini')) return door;
  if (o.startsWith('Kibrit')) return inter('matches');
  if (o.startsWith('Gaz lamba')) return inter('lamp');
  if (o.startsWith('Masadaki')) return inter('note2');
  if (o.startsWith('Evden çık')) return door;
  if (o.includes('Rıza')) return P.inside && isIndoor(P.x, P.z) === W.indoorBoxes[0] ? door : { x: HUT.x, z: HUT.z + 2.6 };
  if (o.startsWith('Odunu')) { for (const id of ['wood', 'kav', 'chest']) { const i = W.inter.find(k => k.id === id && k.on); if (i) return { x: i.x, z: i.z }; } return null; }
  if (o.startsWith('Köye dön') || o.startsWith('KAÇ')) return { x: -4, z: -42 };
  if (o.startsWith('Dedenin mezar')) return { x: 52.4, z: -39.6 };
  if (o.startsWith('Kuyunun kolunu')) return inSchool() ? (W.kolMesh && W.kolMesh.visible ? { x: SCHOOL.x + 3.3, z: SCHOOL.z - 2.25 } : null) : { x: SCHOOL.x + 8, z: SCHOOL.z + 2 };
  if (o.startsWith('KAÇ! Okuldan')) return { x: SCHOOL.x + 14, z: SCHOOL.z + 2 };
  if (o.startsWith('Kuyuya')) return { x: WELL.x, z: WELL.z };
  if (o.startsWith('EVE KOŞ')) return door;
  if (o.startsWith('Ocağı')) return W.firePos ? { x: W.firePos.x, z: W.firePos.z } : null;
  return null;
}
function drawCompass() {
  if (!CMP.c) { CMP.c = $('compass'); if (!CMP.c) return; CMP.g = CMP.c.getContext('2d'); }
  const g = CMP.g, Wd = CMP.c.width, Hh = CMP.c.height; g.clearRect(0, 0, Wd, Hh);
  const f = new THREE.Vector3(); CAMERA.getWorldDirection(f); const head = Math.atan2(f.x, -f.z);
  const span = Math.PI * 0.62, px = a => { let d = a - head; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return { x: Wd / 2 + d / span * (Wd / 2), d }; };
  // fading backdrop
  const bg = g.createLinearGradient(0, 0, Wd, 0); bg.addColorStop(0, 'rgba(8,10,14,0)'); bg.addColorStop(0.18, 'rgba(8,10,14,.55)'); bg.addColorStop(0.82, 'rgba(8,10,14,.55)'); bg.addColorStop(1, 'rgba(8,10,14,0)');
  g.fillStyle = bg; g.fillRect(0, 8, Wd, 26);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 72; k++) { const a = k * Math.PI / 36, p = px(a); if (Math.abs(p.d) > span) continue; const al = 1 - Math.abs(p.d) / span;
    const major = k % 18 === 0, mid = k % 9 === 0;
    if (major || mid) { g.font = major ? '600 17px Inter, sans-serif' : '500 12px Inter, sans-serif'; g.fillStyle = `rgba(232,226,208,${(major ? 0.95 : 0.6) * al})`; g.fillText(['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'][k / 9], p.x, 21); }
    else { g.fillStyle = `rgba(232,226,208,${0.35 * al})`; g.fillRect(p.x - 0.75, k % 3 === 0 ? 14 : 17, 1.5, k % 3 === 0 ? 14 : 8); } }
  g.fillStyle = 'rgba(232,226,208,.8)'; g.beginPath(); g.moveTo(Wd / 2 - 5, 34); g.lineTo(Wd / 2 + 5, 34); g.lineTo(Wd / 2, 29); g.fill();
  const t = objTarget(); if (!t) return;
  const b = Math.atan2(t.x - P.x, -(t.z - P.z)); const p = px(b); const dist = Math.hypot(t.x - P.x, t.z - P.z);
  const pulse = 0.75 + 0.25 * Math.sin(G.time * 4);
  g.fillStyle = `rgba(214,38,32,${pulse})`; g.shadowColor = 'rgba(255,40,30,.8)'; g.shadowBlur = 8;
  if (Math.abs(p.d) <= span * 0.96) { g.beginPath(); g.arc(p.x, 5, 4.5, 0, 7); g.fill(); }
  else { const s = p.d > 0 ? 1 : -1, x = Wd / 2 + s * Wd * 0.47; g.beginPath(); g.moveTo(x + s * 7, 5); g.lineTo(x - s * 3, 0); g.lineTo(x - s * 3, 10); g.fill(); }
  g.shadowBlur = 0;
  if (dist > 4 && Math.abs(p.d) <= span * 0.96) { g.font = '500 10px Inter, sans-serif'; g.fillStyle = 'rgba(232,226,208,.55)'; g.fillText(Math.round(dist) + ' m', p.x, 41); }
}
// ---------- menu ----------
let menuT = 0;
function menuScene(dt) {
  menuT += dt; const a = menuT * 0.05; const r = 46; const x = Math.sin(a) * r, z = Math.cos(a) * r - 6; const y = heightAt(x, z) + 9 + Math.sin(menuT * 0.2) * 2;
  CAMERA.position.set(x, y, z); CAMERA.lookAt(DEDE.x * 0.5, 2, DEDE.z * 0.5); post.uniforms.uTime.value = menuT; post.uniforms.uFade.value = Math.max(0, 1 - menuT * 0.4); post.uniforms.uFear.value = 0.15;
  W.snow.material.uniforms.uTime.value = menuT; W.snow.material.uniforms.uCam.value.copy(CAMERA.position); W.dedeLantern.intensity = 2.6 + Math.random() * 0.6; moonSprite.position.copy(CAMERA.position).add(new THREE.Vector3(-60, 90, -40).normalize().multiplyScalar(150));
  if (AU.ctx) auUpdate(dt, { indoor: false, fear: 0, storm: 1, zone: 'menu' });
}
function startGame(cont) {
  auInit(); $('title').classList.remove('show'); $('hud').classList.add('show'); document.body.classList.toggle('touch', isTouch);
  G.started = true; G.fade = 1; G.fadeTo = 1; resize();
  const s = load('hn_save', {}); if (cont && s.cp) loadCheckpoint(s.cp); else { store('hn_save', { cp: 'c1', items: {}, flags: {} }); loadCheckpoint('c1'); }
  if (!isTouch) setTimeout(() => { if (!G.noteOpen) relock(); }, 50);
}
function togglePause(force) { if (!G.started || G.ended || $('death').classList.contains('show')) return; G.paused = force === true ? true : !G.paused; $('pause').classList.toggle('show', G.paused); sfPause(G.paused); if (G.paused) { unlockPointer(); if (AU.ctx) AU.ctx.suspend(); if (VOICE.cur) VOICE.cur.pause(); } else { if (AU.ctx) AU.ctx.resume(); if (VOICE.cur) VOICE.cur.play().catch(() => {}); if (!isTouch) canvas.requestPointerLock && canvas.requestPointerLock(); } }
function initUI() {
  const s = load('hn_save', {}); $('bCont').style.display = s.cp && s.cp !== 'c1' ? 'block' : 'none';
  $('bNew').onclick = () => startGame(false); $('bCont').onclick = () => startGame(true);
  $('bSet').onclick = $('bSet2').onclick = () => { $('sVol').value = SET.vol * 100; $('sAmb').value = SET.amb * 100; $('sVoice').value = SET.voice * 100; $('sJs').value = SET.js * 100; $('sBri').value = (SET.bri || 1) * 100; $('sSens').value = SET.sens * 100; $('sQ').value = SET.q; $('sSub').value = SET.subs; $('settings').classList.add('show'); };
  $('sSave').onclick = () => { SET.vol = $('sVol').value / 100; SET.amb = $('sAmb').value / 100; SET.voice = $('sVoice').value / 100; SET.js = $('sJs').value / 100; auSetMix(SET.amb, SET.voice, SET.js); SET.bri = $('sBri').value / 100; SET.sens = $('sSens').value / 100; SET.q = $('sQ').value; SET.subs = +$('sSub').value; store('hn_set', SET); auSetVol(SET.vol); document.documentElement.style.setProperty('--subs', SET.subs); resize(); $('settings').classList.remove('show'); };
  $('bResume').onclick = () => togglePause(); $('bMenu').onclick = () => location.reload(); $('bRetry').onclick = retry; $('bEndMenu').onclick = () => location.reload();
  $('sAmb').oninput = () => auSetMix($('sAmb').value / 100, $('sVoice').value / 100); $('sVoice').oninput = $('sAmb').oninput; $('sJs').onchange = () => { auSetMix($('sAmb').value / 100, $('sVoice').value / 100, $('sJs').value / 100); sfx('js_main'); }; $('sVol').oninput = () => auSetVol($('sVol').value / 100);
  $('noteClose').onclick = () => {}; document.documentElement.style.setProperty('--subs', SET.subs);
  const d = load('hn_done', {}); $('endings').textContent = (d['SON 1'] ? '◆' : '◇') + ' SON 1     ' + (d['SON 2'] ? '◆' : '◇') + ' SON 2';
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.started && !G.paused) togglePause(true); });
// ---------- boot ----------
buildWorld(); buildMonster(); buildMirror(); buildFX(); resize(); initUI(); auSetVol(SET.vol); auSetMix(SET.amb, SET.voice, SET.js);
W.bus.visible = false; frame();
window.__g = { SAN, SCHOOL, sfx, lookBackScare: (d) => run(() => lookBackScare(d)), beamReveal: () => run(() => beamReveal()), subliminal: () => run(() => subliminal(400)), distantFigure: () => run(() => distantFigure(10)), SCENE, DUCK, SF, VOICE, G, P, W, MON, CP, monsterShow, monsterFace, chaseStart, caught: () => run(caught), CAMERA, loadCheckpoint, startGame, K, HANDLERS, endingGood: () => run(endingGood), endingBad: () => run(endingBad) };
