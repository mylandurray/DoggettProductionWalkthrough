// Scroll-story plumbing shared by every explainer page: easing + keyframes,
// the chapter panel and rail, the camera rig, SVG callouts, the theme / solid /
// play toggles and the frame loop that maps scroll to story time.
import * as THREE from 'three';
import { animate, stagger } from 'animejs';
import { storedTheme, storeTheme, storedSolid, storeSolid } from '../theme.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const $ = (s) => document.querySelector(s);

// Piecewise-eased keyframes: [[t, value], ...] sorted by t.
export function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0 || 1)));
    }
  }
  return keys[keys.length - 1][1];
}

// Story time t ↔ page scroll fraction. The first `intro` of the scroll is the
// door-opening reveal; the rest maps linearly onto t ∈ [0, tEnd].
const scrollToStory = (t, intro, tEnd) => (t <= 0 ? 0 : intro + (t / tEnd) * (1 - intro));

// ------------------------------------------------------------------ chapters
export function createChapters({ CH, tEnd, intro }) {
  const panel = {
    num: $('.ch-num'), kicker: $('.ch-kicker'), title: $('.ch-title'), body: $('.ch-body'), specs: $('.ch-specs'),
  };
  const rail = $('.rail');
  CH.forEach((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="lbl">${String(i).padStart(2, '0')} ${c.title}</span><span class="tick"></span>`;
    b.setAttribute('aria-label', c.title);
    b.addEventListener('click', () => go(i));
    rail.appendChild(b);
  });
  const railBtns = [...rail.children];

  // Jump to the start of chapter i with an eased scroll slow enough to watch
  // the machine move (longer jumps take longer, up to 3 s). While it runs the
  // panel still shows the old chapter, so `pending` lets repeated arrow clicks
  // step on from the chapter already requested. Wheel / touch cancels it.
  let pending = null, tween = 0;
  function go(i) {
    i = Math.max(0, Math.min(CH.length - 1, i));
    const max = document.documentElement.scrollHeight - innerHeight;
    const next = i + 1 < CH.length ? CH[i + 1].t0 : tEnd;
    const tt = i === 0 ? 0 : i === CH.length - 1 ? tEnd : CH[i].t0 + (next - CH[i].t0) * 0.02;
    const from = scrollY, to = scrollToStory(tt, intro, tEnd) * max;
    const dur = clamp(0.8 + (Math.abs(to - from) / max) * 14, 0.8, 3) * 1000;
    pending = i;
    syncNav();
    cancelAnimationFrame(tween);
    const start = performance.now();
    const step = (now) => {
      const k = clamp((now - start) / dur);
      scrollTo(0, lerp(from, to, ease(k)));
      if (k < 1) tween = requestAnimationFrame(step);
      else pending = null;
    };
    tween = requestAnimationFrame(step);
  }
  const cur = () => pending ?? shown;
  const cancel = () => { cancelAnimationFrame(tween); pending = null; };
  for (const ev of ['wheel', 'touchstart']) addEventListener(ev, cancel, { passive: true });
  $('.play-toggle').addEventListener('click', cancel);

  const prevBtn = $('.ch-prev'), nextBtn = $('.ch-next');
  function syncNav() {
    prevBtn.disabled = cur() <= 0;
    nextBtn.disabled = cur() >= CH.length - 1;
  }
  prevBtn.addEventListener('click', () => go(cur() - 1));
  nextBtn.addEventListener('click', () => go(cur() + 1));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur() + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur() - 1); }
  });

  let shown = -1;
  function show(i) {
    if (i === shown) return;
    shown = i;
    const c = CH[i];
    panel.num.textContent = String(i).padStart(2, '0') + ' / ' + String(CH.length - 1).padStart(2, '0');
    panel.kicker.textContent = c.kicker;
    panel.title.innerHTML = c.title
      .split(' ')
      .map((w) => `<span class="w">${[...w].map((ch) => `<span class="c">${ch}</span>`).join('')}</span>`)
      .join(' ');
    panel.body.textContent = c.body;
    panel.specs.innerHTML = c.specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    railBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    syncNav();

    animate(panel.title.querySelectorAll('.c'), {
      opacity: [0, 1], translateY: ['0.4em', '0em'], duration: 520, delay: stagger(16), ease: 'outExpo',
    });
    animate([panel.body, panel.kicker], { opacity: [0, 1], translateY: [8, 0], duration: 600, delay: stagger(60, { start: 120 }), ease: 'outQuart' });
    animate(panel.specs.children, { opacity: [0, 1], translateX: [-6, 0], duration: 420, delay: stagger(35, { start: 220 }), ease: 'outQuart' });
  }

  const at = (t) => {
    let i = 0;
    for (let k = 0; k < CH.length; k++) if (t >= CH[k].t0) i = k;
    return i;
  };
  return { at, show };
}

// ------------------------------------------------------------------ camera
// One shot per chapter ({p, t} from a function so shots can follow moving
// parts); each chapter eases in from the previous shot over its first third.
export function createCameraRig(camera, { CH, CAMS, tEnd }) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
  });
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  let init = false;
  return function update(t, i, dt) {
    const t0 = CH[i].t0, t1 = i + 1 < CH.length ? CH[i + 1].t0 : tEnd;
    const p = (t - t0) / (t1 - t0);
    const cur = CAMS[i]();
    let pos = cur.p, tgt = cur.t;
    if (i > 0) {
      const prev = CAMS[i - 1]();
      const w = ease(p / 0.32);
      pos = prev.p.clone().lerp(cur.p, w);
      tgt = prev.t.clone().lerp(cur.t, w);
    }
    // narrow screens: pull back
    const aspect = innerWidth / innerHeight;
    if (aspect < 1.2) {
      const k = 1 + (1.2 - aspect) * 1.6;
      pos = tgt.clone().add(pos.clone().sub(tgt).multiplyScalar(k));
      tgt = tgt.clone().add(V(0, -1.2 * (k - 1), 0));
    }
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
    const dist = pos.distanceTo(tgt);
    pos.addScaledVector(V(1, 0, 0), mouse.sx * dist * 0.03).add(V(0, -mouse.sy * dist * 0.02, 0));
    if (!init) { camPos.copy(pos); camTgt.copy(tgt); init = true; }
    const k = 1 - Math.exp(-dt * 7);
    camPos.lerp(pos, k);
    camTgt.lerp(tgt, k);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
  };
}

// ------------------------------------------------------------------ callouts
// Each label: { t, s?, cls?, at: [x,y,z] | () => [x,y,z] | null, d: [dx,dy] px, ch: [chapter indices] }.
// An `at` function may return null to hide the label for now.
export function createLabels(LABELS, camera) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const leaders = $('#leaders');
  const labelsEl = $('#labels');
  for (const l of LABELS) {
    const el = document.createElement('div');
    el.className = 'callout' + (l.cls ? ' ' + l.cls : '');
    el.innerHTML = `<div class="t">${l.t}</div>${l.s ? `<div class="s">${l.s}</div>` : ''}`;
    labelsEl.appendChild(el);
    l.el = el;
    l.v = typeof l.at === 'function' ? new THREE.Vector3() : new THREE.Vector3(...l.at);
    if (l.cls !== 'dim') {
      l.line = document.createElementNS(svgNS, 'polyline');
      l.dot = document.createElementNS(svgNS, 'circle');
      l.dot.setAttribute('r', 3);
      leaders.append(l.line, l.dot);
    }
  }
  const pv = new THREE.Vector3();
  return function update(ch) {
    const w = innerWidth, h = innerHeight;
    const small = w < 760;
    for (const l of LABELS) {
      let on = l.ch.includes(ch) && !(small && l.s === undefined && l.cls === 'dim');
      if (on && typeof l.at === 'function') {
        const p = l.at();
        if (p) l.v.set(...p);
        else on = false;
      }
      pv.copy(l.v).project(camera);
      const vis = on && pv.z < 1 && Math.abs(pv.x) < 1.2 && Math.abs(pv.y) < 1.2;
      l.el.classList.toggle('on', vis);
      if (l.line) { l.line.classList.toggle('on', vis); l.dot.classList.toggle('on', vis); }
      if (!vis && !l.el._wasVis) continue;
      l.el._wasVis = vis;
      const ax = (pv.x * 0.5 + 0.5) * w, ay = (-pv.y * 0.5 + 0.5) * h;
      const [dx, dy] = l.d;
      const ex = ax + dx, ey = ay + dy;
      const dir = dx < 0 ? -1 : 1;
      if (l.line) {
        const tx = ex + dir * 14;
        l.line.setAttribute('points', `${ax},${ay} ${ex},${ey} ${tx},${ey}`);
        l.dot.setAttribute('cx', ax);
        l.dot.setAttribute('cy', ay);
        l.el.style.transform = `translate(${tx + dir * 4}px, ${ey}px) translate(${dir < 0 ? '-100%' : '0'}, -50%)`;
      } else {
        l.el.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
      }
    }
  };
}

// ------------------------------------------------------------------ toggles
// Theme: `apply(name)` recolours the page's scene; the button and storage live here.
export function bindTheme(apply) {
  const toggle = $('.theme-toggle');
  let name = storedTheme();
  const set = (n) => {
    name = n;
    document.documentElement.dataset.theme = n;
    apply(n);
    const next = n === 'light' ? 'dark' : 'light';
    toggle.setAttribute('aria-label', `Switch to ${next} mode`);
    toggle.title = `Switch to ${next} mode`;
  };
  toggle.addEventListener('click', () => {
    const n = name === 'light' ? 'dark' : 'light';
    storeTheme(n);
    set(n);
  });
  set(name);
}

// Solid internals: returns a getter for the button state.
export function bindSolid() {
  const btn = $('.solid-toggle');
  let on = storedSolid();
  const sync = () => {
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Show internal parts as wireframe' : 'Show internal parts as solids';
  };
  sync();
  btn.addEventListener('click', () => {
    on = !on;
    storeSolid(on);
    sync();
  });
  return () => on;
}

// Autoplay: scrolls the page at a steady rate from the frame loop; any manual
// scroll input (wheel, touch, keys, clicks elsewhere) hands control back. The
// speed button cycles the rate and is remembered per browser.
const SPEEDS = [1, 1.5, 2, 3];
function createPlayer(seconds) {
  const btn = $('.play-toggle'), speedBtn = $('.speed-toggle');
  let playing = false, pos = 0;
  let speed = 1;
  try { speed = SPEEDS.includes(+localStorage.getItem('dg-speed')) ? +localStorage.getItem('dg-speed') : 1; } catch (e) {}
  const syncSpeed = () => {
    speedBtn.textContent = `${speed}×`;
    speedBtn.title = `Playback speed ${speed}× (click to change)`;
    speedBtn.setAttribute('aria-label', `Playback speed ${speed} times`);
  };
  syncSpeed();
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    try { localStorage.setItem('dg-speed', String(speed)); } catch (e) {}
    syncSpeed();
  });
  function set(on) {
    playing = on;
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('span').textContent = on ? 'Pause' : 'Play';
    btn.title = on ? 'Pause the tour' : 'Play the tour automatically';
    if (!on) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    pos = scrollY >= max - 1 ? 0 : scrollY; // replay from the top when finished
    if (pos === 0) scrollTo(0, 0);
  }
  btn.addEventListener('click', () => set(!playing));
  const stop = (e) => { if (playing && !btn.contains(e.target) && !speedBtn.contains(e.target)) set(false); };
  for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(ev, stop, { passive: true });
  return function step(dt) {
    if (!playing) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    pos = Math.min(max, pos + (max / seconds) * speed * dt);
    scrollTo(0, pos);
    if (pos >= max) set(false);
  };
}

// ------------------------------------------------------------------ loop
// Calls frame({ t, reveal, dt, time }) every animation frame, where `t` is
// story time and `reveal` runs 0 → 1 over the intro, then renders.
export function runLoop({ intro, tEnd, composer, playSeconds, frame }) {
  const hint = $('.scroll-hint');
  const progress = $('.progress i');
  const stepPlay = createPlayer(playSeconds);
  const scrollT = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? clamp(scrollY / max) : 0;
  };
  // #t=<story time> deep-links straight to a moment (e.g. #t=0.6)
  const deep = /[#&]t=([\d.]+)/.exec(location.hash);
  if (deep) scrollTo(0, scrollToStory(+deep[1], intro, tEnd) * (document.documentElement.scrollHeight - innerHeight));
  let tView = scrollT();
  let last = performance.now();
  const clock0 = last;
  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    stepPlay(dt);
    const target = scrollT();
    tView += (target - tView) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - tView) < 1e-5) tView = target;
    frame({ t: clamp((tView - intro) / (1 - intro)) * tEnd, reveal: tView / intro, dt, time: (now - clock0) / 1000 });
    hint.classList.toggle('gone', target > 0.01);
    progress.style.transform = `scaleX(${tView})`;
    composer.render();
    requestAnimationFrame(tick);
  }
  animate('.brandbar, .panel, .readout, .rail, .minimap', {
    opacity: [0, 1], translateY: [10, 0], duration: 900, delay: stagger(90, { start: 150 }), ease: 'outExpo',
  });
  requestAnimationFrame(tick);
}
