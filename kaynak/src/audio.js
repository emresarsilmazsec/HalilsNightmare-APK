// ================= AUDIO: synthesized ambience + Karakoncolos sounds, recorded voice playback =================
const AU = { ambVol: 0.5, jsVol: 1, ctx: null, master: null, sfxBus: null, ambBus: null, vol: 0.85, noise: null, pink: null, wind: null, heart: null, drone: null, voiceVol: 1 };
function auInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const C = AU.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.connect(C.destination);
    AU.master = C.createGain(); AU.master.gain.value = AU.vol; AU.master.connect(comp);
    // reverb (generated impulse) for interior/forest space
    const ir = C.createBuffer(2, C.sampleRate * 2.6, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2); }
    AU.verb = C.createConvolver(); AU.verb.buffer = ir; AU.verbGain = C.createGain(); AU.verbGain.gain.value = 0.35; AU.verb.connect(AU.verbGain); AU.verbGain.connect(AU.master);
    AU.sfxBus = C.createGain(); AU.sfxBus.connect(AU.master); AU.sfxBus.connect(AU.verb);
    AU.ambBus = C.createGain(); AU.ambBus.gain.value = 0.9; AU.ambBus.connect(AU.master);
    const len = C.sampleRate * 3; const b = C.createBuffer(1, len, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; AU.noise = b;
    const pb = C.createBuffer(1, len, C.sampleRate), pd = pb.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; } AU.pink = pb;
    startAmbience(); sfLoad();
  } catch (e) { AU.ctx = null; }
}
function auSetMix(amb, voice, js) { AU.ambVol = amb; AU.voiceVol = voice; if (js != null) AU.jsVol = js; if (VOICE.cur) VOICE.cur.volume = Math.min(1, AU.vol * voice * 1.25); }
function auSetVol(v) { AU.vol = v; if (AU.master) AU.master.gain.value = v; }
function loopNoise(buf, type, f, q, gain, dest) {
  const C = AU.ctx, s = C.createBufferSource(); s.buffer = buf; s.loop = true;
  const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = C.createGain(); g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(dest); s.start();
  return { s, fl, g };
}
function startAmbience() {
  const C = AU.ctx;
  // howling wind: two band-passed pink noise layers with slow LFO on cutoff
  AU.wind = [loopNoise(AU.pink, 'bandpass', 400, 0.8, 0.5, AU.ambBus), loopNoise(AU.pink, 'bandpass', 900, 3, 0.18, AU.ambBus), loopNoise(AU.noise, 'highpass', 5000, 0.5, 0.02, AU.ambBus)];
  AU.indoor = 0; AU.windT = 0;
  // low dread drone
  const o1 = C.createOscillator(), o2 = C.createOscillator(), dg = C.createGain(), lp = C.createBiquadFilter();
  o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 43; o2.frequency.value = 43.6; lp.type = 'lowpass'; lp.frequency.value = 160; dg.gain.value = 0.0;
  o1.connect(lp); o2.connect(lp); lp.connect(dg); dg.connect(AU.master); o1.start(); o2.start(); AU.drone = { g: dg, lp };
  // heartbeat scheduler state
  AU.heartRate = 0; AU.heartNext = 0;
}
// call every frame: wind gusts, indoor muffling, fear drone, heartbeat
function auUpdate(dt, st) {
  sfUpdate(dt, st);
  if (!AU.ctx || !AU.wind) return; const C = AU.ctx, t = C.currentTime;
  AU.windT += dt; const gust = 0.5 + 0.35 * Math.sin(AU.windT * 0.23) + 0.25 * Math.sin(AU.windT * 0.61 + 1) + 0.15 * Math.sin(AU.windT * 1.7);
  const ind = st.indoor ? 1 : 0; AU.indoor += (ind - AU.indoor) * Math.min(1, dt * 2);
  const storm = st.storm == null ? 1 : st.storm;
  AU.wind[0].fl.frequency.setTargetAtTime(Math.max(90, 250 + gust * 500 - AU.indoor * 150), t, 0.3); AU.wind[0].g.gain.setTargetAtTime((0.1 + gust * 0.12) * (1 - AU.indoor * 0.85) * storm, t, 0.3);
  AU.wind[1].fl.frequency.setTargetAtTime(Math.max(200, 600 + gust * 900), t, 0.4); AU.wind[1].g.gain.setTargetAtTime(gust * 0.04 * (1 - AU.indoor * 0.9) * storm, t, 0.4);
  AU.wind[2].g.gain.setTargetAtTime(0.004 * (1 - AU.indoor) * storm, t, 0.5);
  AU.drone.g.gain.setTargetAtTime(st.fear * 0.08 * AU.ambVol * (0.3 + 0.7 * DUCK.v), t, 0.2); AU.drone.lp.frequency.setTargetAtTime(120 + st.fear * 300, t, 0.5);
  AU.verbGain.gain.setTargetAtTime(st.indoor ? 0.18 : 0.38, t, 0.5);
  // heartbeat
  const bpm = st.fear > 0.15 ? 70 + st.fear * 90 : 0;
  if (bpm && !sfHas('heartbeat') && t > AU.heartNext) { heartbeat(Math.min(1, st.fear + 0.2)); AU.heartNext = t + 60 / bpm; }
}
function out(pos, gain = 1, dry) {
  const C = AU.ctx, g = C.createGain(); g.gain.value = gain;
  if (pos && window.CAMERA) {
    const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'exponential'; p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 200;
    p.positionX ? (p.positionX.value = pos.x, p.positionY.value = pos.y, p.positionZ.value = pos.z) : p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p); p.connect(dry ? AU.master : AU.sfxBus);
  } else g.connect(dry ? AU.master : AU.sfxBus);
  return g;
}
function auListener(cam) {
  if (!AU.ctx) return; const L = AU.ctx.listener, p = cam.position; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
  else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
}
function nz(t, dur, vol, dest, type, f, q = 1, f2, buf) {
  const C = AU.ctx, s = C.createBufferSource(); s.buffer = buf || AU.noise; const fl = C.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05); return g;
}
function osc(t, dur, vol, dest, type, f, f2, att = 0.01) {
  const C = AU.ctx, o = C.createOscillator(), g = C.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
}
// formant-filtered growl: buzz through vocal-tract-like bandpasses (sounds throat-like, inhuman)
function growl(t, dur, vol, dest, f0 = 55, f1 = 42, vowel = [400, 900, 2400]) {
  const C = AU.ctx, src = C.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(f0, t); src.frequency.linearRampToValueAtTime(f1, t + dur);
  const lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = 23 + Math.random() * 9; lg.gain.value = f0 * 0.35; lfo.connect(lg); lg.connect(src.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
  const mix = C.createGain(); mix.gain.value = 1;
  const env = C.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(vol, t + 0.08); env.gain.setValueAtTime(vol, t + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const f of vowel) { const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; src.connect(bp); bp.connect(mix); }
  const n = C.createBufferSource(); n.buffer = AU.noise; const nf = C.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 0.7; const ng = C.createGain(); ng.gain.value = 0.6; n.connect(nf); nf.connect(ng); ng.connect(mix); n.start(t); n.stop(t + dur + 0.1);
  mix.connect(env); env.connect(dest); src.start(t); src.stop(t + dur + 0.1);
}
function heartbeat(v) { const t = AU.ctx.currentTime, d = AU.master; osc(t, 0.14, 0.5 * v, d, 'sine', 62, 40); osc(t + 0.17, 0.12, 0.35 * v, d, 'sine', 58, 38); }
// ---- named sound effects ----
function sfx(name, pos, opt) {
  if (!AU.ctx) return; const t = AU.ctx.currentTime;
  if (sfFile(name, pos, opt)) return;
  switch (name) {
    case 'step': { const o = out(pos, opt || 0.5); nz(t, 0.16, 0.35, o, 'bandpass', 1400 + Math.random() * 600, 0.9, 500); nz(t + 0.03, 0.12, 0.25, o, 'highpass', 3000); break; }       // snow crunch
    case 'stepWood': { const o = out(pos, opt || 0.6); nz(t, 0.09, 0.4, o, 'lowpass', 500); osc(t, 0.08, 0.15, o, 'triangle', 140 + Math.random() * 40, 90); if (Math.random() < 0.15) osc(t + 0.05, 0.4, 0.05, o, 'sawtooth', 300, 220, 0.1); break; }
    case 'mstep': { const o = out(pos, 1.3); nz(t, 0.25, 0.7, o, 'lowpass', 380); osc(t, 0.2, 0.5, o, 'sine', 70, 40); break; }   // monster heavy step
    case 'howl': { const o = out(pos, 0.5); const g = AU.ctx.createGain(); g.connect(o); osc(t, 3.2, 0.25, g, 'sine', 520, 380, 0.6); osc(t + 0.1, 3, 0.08, g, 'sine', 1040, 760, 0.6); break; }
    case 'sting': { const d = AU.master; nz(t, 1.6, 0.9, d, 'highpass', 1800, 0.5); osc(t, 1.4, 0.35, d, 'sawtooth', 1200, 1900); osc(t, 1.4, 0.3, d, 'sawtooth', 1270, 2050); osc(t, 1.4, 0.3, d, 'square', 61, 45); break; } // violin-like screech hit
    case 'jumpscare': { const d = AU.master; nz(t, 1.8, 1, d, 'bandpass', 2600, 0.6, 900); growl(t, 1.6, 1, d, 140, 70, [700, 1600, 3200]); osc(t, 1.5, 0.5, d, 'sawtooth', 1500, 2400); osc(t, 1.5, 0.5, d, 'sawtooth', 1580, 2600); osc(t, 0.6, 0.8, d, 'sine', 50, 30); break; }
    case 'roar': { const o = out(pos, 2.2); growl(t, 2.4, 1, o, 70, 38, [350, 800, 2100]); nz(t, 2.2, 0.5, o, 'lowpass', 900, 0.5, 200); break; }
    case 'growl': { const o = out(pos, 1.4); growl(t, 1.6 + Math.random(), 0.8, o, 48 + Math.random() * 15, 38, [300 + Math.random() * 200, 750, 2300]); break; }
    case 'breath': { const o = out(pos, 1); nz(t, 1.1, 0.35, o, 'bandpass', 900, 1.5, 600, AU.pink); nz(t + 1.2, 1.4, 0.3, o, 'bandpass', 650, 1.5, 400, AU.pink); break; }
    case 'sniff': { const o = out(pos, 1.1); for (let i = 0; i < 4; i++) nz(t + i * 0.18, 0.13, 0.4, o, 'bandpass', 2400, 3); break; }
    case 'whisper': { const o = out(pos, 1.2); for (let i = 0; i < 6; i++) nz(t + i * 0.22 + Math.random() * 0.1, 0.3, 0.25, o, 'bandpass', 2500 + Math.random() * 2500, 4, 3000, AU.pink); break; }
    case 'knock': { const o = out(pos, 1.8); for (let i = 0; i < (opt || 3); i++) { nz(t + i * 0.32, 0.12, 0.9, o, 'lowpass', 450); osc(t + i * 0.32, 0.1, 0.6, o, 'sine', 110, 60); } break; }
    case 'bang': { const o = out(pos, 2.5); nz(t, 0.35, 1, o, 'lowpass', 600); osc(t, 0.3, 0.9, o, 'sine', 80, 35); nz(t, 0.15, 0.5, o, 'highpass', 2000); break; }
    case 'scratch': { const o = out(pos, 1.4); for (let i = 0; i < 4; i++) nz(t + i * 0.35, 0.3, 0.4, o, 'bandpass', 3500 + i * 300, 6, 1800); break; }
    case 'creak': { const o = out(pos, 1); osc(t, 1.2, 0.08, o, 'sawtooth', 180, 120, 0.2); osc(t, 1.2, 0.05, o, 'square', 260, 210, 0.2); break; }
    case 'door': { const o = out(pos, 1); osc(t, 0.9, 0.08, o, 'sawtooth', 220, 140, 0.1); nz(t + 0.8, 0.2, 0.5, o, 'lowpass', 400); break; }
    case 'pickup': { const o = out(null, 0.6); nz(t, 0.12, 0.3, o, 'bandpass', 2000, 1); osc(t, 0.15, 0.1, o, 'sine', 600, 900); break; }
    case 'match': { const o = out(null, 0.7); nz(t, 0.25, 0.6, o, 'highpass', 2500, 0.7, 6000); nz(t + 0.2, 0.8, 0.25, o, 'bandpass', 800, 0.6); break; }
    case 'fire': { const o = out(pos, 1); nz(t, 2.5, 0.25, o, 'bandpass', 600, 0.4); for (let i = 0; i < 6; i++) nz(t + Math.random() * 2.4, 0.04, 0.5, o, 'highpass', 3000); break; }
    case 'flick': { const o = out(null, 0.5); nz(t, 0.03, 0.4, o, 'highpass', 4000); osc(t, 0.04, 0.1, o, 'square', 1800, 1200); break; }
    case 'ring': { const o = out(null, 0.5); for (let i = 0; i < 2; i++) { osc(t + i * 0.45, 0.35, 0.18, o, 'sine', 880, 880); osc(t + i * 0.45, 0.35, 0.12, o, 'sine', 1320, 1320); } break; }
    case 'static': { const o = out(null, 0.6); nz(t, opt || 1.2, 0.25, o, 'highpass', 1500, 0.4); break; }
    case 'bus': { const o = out(pos, 1.8); osc(t, 6, 0.25, o, 'sawtooth', 52, 40, 0.5); nz(t, 6, 0.3, o, 'lowpass', 300, 0.5, 150); break; }
    case 'rope': { const o = out(pos, 1); osc(t, 0.6, 0.06, o, 'sawtooth', 300 + Math.random() * 80, 240, 0.05); nz(t, 0.5, 0.2, o, 'bandpass', 1200, 2); break; }
    case 'splash': { const o = out(pos, 1); nz(t, 0.8, 0.5, o, 'lowpass', 1200, 0.5, 300); break; }
    case 'gust': { const o = out(null, 1); nz(t, 2.5, 0.7, o, 'bandpass', 500, 0.6, 1400, AU.pink); break; }
    case 'boom': { const d = AU.master; osc(t, 2.5, 0.9, d, 'sine', 45, 25, 0.02); nz(t, 2.5, 0.6, d, 'lowpass', 300, 0.5, 60); break; }
    case 'scream': { const d = AU.master; growl(t, 2.5, 1, d, 220, 90, [900, 1900, 3600]); nz(t, 2.5, 0.7, d, 'bandpass', 3000, 0.7, 700); break; }
    case 'clock': { const o = out(pos, 0.5); osc(t, 0.03, 0.3, o, 'square', 2200, 2200); break; }
    case 'bell': { const o = out(pos, 1.6); for (let i = 0; i < (opt || 14); i++) { osc(t + i * 0.11, 0.45, 0.22, o, 'square', 1880, 1860, 0.002); osc(t + i * 0.11, 0.6, 0.12, o, 'sine', 3760, 3700, 0.002); } break; }
    case 'tick': { const o = out(null, 0.4); osc(t, 0.03, 0.2, o, 'square', 1500, 1500); break; }
  }
}

// ================= RECORDED SOUND PACK (sesler/sfx/*.mp3) =================
// HTMLAudio elements: they play from file:// (PC double-click) and Android WebView alike.
const SF = { el: {}, ok: {}, loops: {}, vol: {}, tgt: {}, loaded: false, paused: false, nextAmbient: 25 };
const SF_KEYS = ['js_1','js_2','js_3','sting','sting2','boom','bass','subbass','figure','over_shoulder','reveal','whisper','growl','grumble','static_1','static_2','static_3','signal','vanish','ancestors','ancestors2','remember','ouija','summoning','kidnapped','spell','slam','dead','cutthroat','bang_1','bang_2','hitverb','dawn','chimes','scratchchord','piano_1','piano_2','piano_3','piano_4','piano_5','piano_6','signs','lostsouls','revelation','howl','ezan','js_dog','js_blood','js_impact','js_fright','js_main'];
const SF_LOOPS = { amb_road: 0.4, amb_forest: 0.42, amb_house: 0.34, amb_cemetery: 0.4, amb_final: 0.42, amb_menu: 0.5, amb_hide: 0.6, mus_chase: 0.6, heartbeat: 0.6 };
// ducking: while a voice line plays everything else drops so dialogue stays clear
const DUCK = { v: 1, loops: 0.15, bus: 0.25, sfx: 0.35 };
// game sfx name -> pack files (random pick) and gain
const SF_MAP = { jumpscare: [['js_1', 'js_2', 'js_3', 'js_main', 'js_main'], 1], sting: [['sting', 'sting2', 'scratchchord'], 0.8], boom: [['boom'], 0.9], roar: [['grumble'], 1], growl: [['growl'], 0.9], whisper: [['whisper'], 0.8], static: [['static_1', 'static_2', 'static_3'], 0.5], bang: [['bang_1', 'bang_2'], 1], scream: [['js_blood'], 1], howl: [['howl'], 0.75] };
function sfLoad() {
  if (SF.loaded) return; SF.loaded = true;
  const mk = (k, loop) => { try { const a = new Audio(); a.preload = 'auto'; a.loop = !!loop; a.addEventListener('canplaythrough', () => { SF.ok[k] = 1; }, { once: true }); a.addEventListener('error', () => {}); a.src = 'sesler/sfx/' + k + '.mp3'; SF.el[k] = a; } catch (e) {} };
  SF_KEYS.forEach(k => mk(k)); for (const k in SF_LOOPS) { mk(k, true); SF.vol[k] = 0; SF.tgt[k] = 0; }
}
function sfDist(pos) { if (!pos || !window.CAMERA) return 1; const d = Math.hypot(pos.x - CAMERA.position.x, pos.y - CAMERA.position.y, pos.z - CAMERA.position.z); return Math.max(0.08, Math.min(1, 3 / (d + 0.5))); }
// play a pack file once; returns false if not available (caller falls back to synth)
function sfPlay(k, gain = 1, pos) {
  const a = SF.el[k]; if (!a || !SF.ok[k] || SF.paused) return false;
  try { const c = a.cloneNode(); c.volume = Math.min(1, gain * sfDist(pos) * AU.vol * (DUCK.sfx + (1 - DUCK.sfx) * DUCK.v)); c.play().catch(() => {}); } catch (e) { return false; }
  return true;
}
// jumpscares: the loudest thing in the game. Everything else cuts out for a moment, a sub-bass hit and a
// synthesized shriek are layered underneath, and dialogue ducking never touches them.
function isScare(name) { return name === 'jumpscare' || name === 'scream' || name.startsWith('js_'); }
function scareHit(k, gain) {
  const a = SF.el[k]; if (!a || !SF.ok[k] || SF.paused) return false;
  SF.scareMute = 1.6; DUCK.v = 1; SF.scares = (SF.scares || 0) + 1;
  try { const c = a.cloneNode(); c.volume = Math.min(1, gain * AU.jsVol * Math.min(1, AU.vol / 0.85)); c.play().catch(() => {}); } catch (e) { return false; }
  if (AU.ctx && gain > 0.5) { const t = AU.ctx.currentTime, d = AU.master, j = Math.min(1.2, AU.jsVol);
    osc(t, 0.9, 0.9 * j, d, 'sine', 58, 28, 0.004); nz(t, 0.5, 0.6 * j, d, 'lowpass', 220, 0.7, 60);
    osc(t, 0.7, 0.18 * j, d, 'sawtooth', 1700, 2600); osc(t, 0.7, 0.16 * j, d, 'sawtooth', 1790, 2750); }
  return true;
}
function sfFile(name, pos, opt) {
  if (isScare(name)) { const ks = SF_MAP[name] ? SF_MAP[name][0] : [name]; return scareHit(ks[Math.random() * ks.length | 0], typeof opt === 'number' ? opt : 1); }
  if (SF_MAP[name]) { const [ks, g] = SF_MAP[name]; return sfPlay(ks[Math.random() * ks.length | 0], g, pos); }
  if (SF.el[name] && !SF_LOOPS[name]) return sfPlay(name, typeof opt === 'number' ? opt : 1, pos);
  return false;
}
// zone ambience: st.zone in road|forest|house|cemetery|final|menu ; st.chase, st.hide, st.fear
function sfUpdate(dt, st) {
  const talking = (VOICE.n > 0 || VOICE.pending > 0 || performance.now() - (VOICE.lastEnd || 0) < 700) && !SF.paused; const dt2 = talking ? 6 : 1.2; DUCK.v += ((talking ? 0 : 1) - DUCK.v) * Math.min(1, dt * dt2);
  if (AU.ctx && AU.ambBus) { const t = AU.ctx.currentTime, k = DUCK.bus + (1 - DUCK.bus) * DUCK.v; AU.ambBus.gain.setTargetAtTime(SF.scareMute > 0.25 ? 0 : 0.9 * k * AU.ambVol, t, SF.scareMute > 0.25 ? 0.01 : 0.05); AU.sfxBus.gain.setTargetAtTime(DUCK.sfx + (1 - DUCK.sfx) * DUCK.v, t, 0.05); }
  if (!SF.loaded) return;
  for (const k in SF_LOOPS) SF.tgt[k] = 0;
  if (SF.scareMute > 0) SF.scareMute -= dt;
  const z = st.zone || 'road'; if (SF_LOOPS['amb_' + z] != null) SF.tgt['amb_' + z] = SF_LOOPS['amb_' + z] * (st.chase ? 0.35 : 1);
  if (st.chase) SF.tgt.mus_chase = SF_LOOPS.mus_chase;
  if (st.hide) { SF.tgt.amb_hide = SF_LOOPS.amb_hide; SF.tgt['amb_' + z] *= 0.4; }
  SF.tgt.heartbeat = st.fear > 0.2 ? Math.min(1, (st.fear - 0.2) * 1.4) * SF_LOOPS.heartbeat : 0;
  for (const k in SF_LOOPS) {
    const a = SF.el[k]; if (!a) continue; const t = SF.paused ? 0 : SF.tgt[k];
    SF.vol[k] += (t - SF.vol[k]) * Math.min(1, dt * (t > SF.vol[k] ? 0.8 : 1.5));
    if (SF.scareMute > 0.25) SF.vol[k] = 0;
    const v = SF.vol[k] * AU.vol * (k === 'mus_chase' || k === 'heartbeat' ? Math.min(1, AU.ambVol * 1.6) : AU.ambVol) * (DUCK.loops + (1 - DUCK.loops) * DUCK.v);
    if (v > 0.005) { if (a.paused && SF.ok[k]) a.play().catch(() => {}); a.volume = Math.min(1, v); }
    else if (!a.paused) a.pause();
  }
  // sparse dread stingers: detuned piano strings, distant signs
  if (z !== 'menu' && !st.chase && !SF.paused && !(VOICE.n > 0)) { SF.nextAmbient -= dt; if (SF.nextAmbient <= 0) { SF.nextAmbient = 35 + Math.random() * 50; const pool = st.fear > 0.3 ? ['signs', 'lostsouls', 'subbass'] : ['piano_1', 'piano_2', 'piano_3', 'piano_4', 'piano_5', 'piano_6', 'signs']; sfPlay(pool[Math.random() * pool.length | 0], 0.4 * AU.ambVol * 2); } }
}
// distant call to prayer: one tracked element so distance, ambience slider and dialogue ducking keep applying while it plays
function sfEzan() { const a = SF.el.ezan; if (!a || !SF.ok.ezan) return false; try { const c = a.cloneNode(); c.volume = 0; c.play().catch(() => {}); SF.ezanEl = c; c.addEventListener('ended', () => { SF.ezanEl = null; }); } catch (e) { return false; } return true; }
function sfEzanUpdate(dist) { const c = SF.ezanEl; if (!c) return; const g = Math.max(0.25, Math.min(0.85, 1.1 - dist / 140)); c.volume = SF.paused ? 0 : Math.min(1, g * AU.vol * Math.min(1, AU.ambVol * 1.8) * (0.35 + 0.65 * DUCK.v)); if (SF.paused && !c.paused) c.pause(); else if (!SF.paused && c.paused && !c.ended && c.currentTime > 0) c.play().catch(() => {}); }
function sfPause(on) { SF.paused = on; if (on) for (const k in SF_LOOPS) { const a = SF.el[k]; if (a && !a.paused) a.pause(); } }
function sfHas(k) { return !!SF.ok[k]; }
// ---- voice: recorded file if present, otherwise subtitle-only with estimated duration ----
const VOICE = { cur: null, cache: {}, act: new Set(), get n() { return this.act.size; } };
// all voice lines go through ONE queue: a line never starts while another is playing,
// its subtitle appears only when its audio starts, and stopVoice() drops everything still waiting.
VOICE.q = Promise.resolve(); VOICE.gen = 0; VOICE.pending = 0; VOICE.subId = null;
function playVoice(id, opt) {
  opt = opt || {};
  if (opt.ifFree && (VOICE.n > 0 || VOICE.pending > 0)) return Promise.resolve(false);   // chase taunts: skip, never stack
  const gen = VOICE.gen; VOICE.pending++;
  const p = VOICE.q.then(() => { VOICE.pending = Math.max(0, VOICE.pending - 1); if (gen !== VOICE.gen) return false; return playVoiceNow(id, opt).then(() => new Promise(r => setTimeout(r, 200))).then(() => true); });
  VOICE.q = p.catch(() => {});
  return p;
}
function playVoiceNow(id, opt) {
  opt = opt || {};
  return new Promise(res => {
    const L = opt.sub || ((typeof LINES !== 'undefined') ? LINES[id] : null);
    const est = opt.est || Math.max(1.6, (L ? L[1].length : 20) * 0.062 + 0.7);
    let done = false; const tk = {}; VOICE.act.add(tk);
    if (L && typeof showSub === 'function') { showSub(L[0], L[1]); VOICE.subId = id; }
    const fin = () => { if (!done) { done = true; VOICE.act.delete(tk); VOICE.lastEnd = performance.now(); if (VOICE.subId === id && typeof hideSub === 'function') { hideSub(); VOICE.subId = null; } res(); } };
    let a; try { a = new Audio(opt.src || ('sesler/' + id + '.mp3')); } catch (e) { setTimeout(fin, est * 1000); return; }
    a.volume = Math.min(1, AU.vol * AU.voiceVol * 1.25);
    let started = false;
    a.addEventListener('ended', () => setTimeout(fin, 150));
    a.addEventListener('error', () => { if (!started) setTimeout(fin, est * 1000); });
    a.play().then(() => { started = true; VOICE.cur = a; VOICE.curFin = fin; }).catch(() => { if (!started) setTimeout(fin, est * 1000); });
    setTimeout(() => { if (!started) { try { a.pause(); } catch (e) {} setTimeout(fin, Math.max(0, est * 1000 - 1500)); } }, 1500);
    setTimeout(fin, Math.max(30000, (opt.est || 0) * 1000 + 3000));
  });
}
function stopVoice() { VOICE.gen++; if (VOICE.cur) { try { VOICE.cur.pause(); } catch (e) {} VOICE.cur = null; } if (VOICE.curFin) { const f = VOICE.curFin; VOICE.curFin = null; f(); } VOICE.act.clear(); }
