import * as THREE from 'three';
import { createBookletMaker, SL, SW, NS, TH, XS, XF, CAB, SQF_X, STAPLE_Z } from './machine.js';
import { makeSetTexture, makeSetMaterial, createSet, writeSet } from './set.js';
import { PALETTES, storedTheme } from '../theme.js';
import { createStage } from '../core/stage.js';
import {
  clamp, ease, lerp, keyed, $, createChapters, createCameraRig, createLabels, bindTheme, bindSolid, runLoop,
} from '../core/story.js';

let pal = PALETTES[storedTheme()];
const { renderer, scene, camera, composer, bloom } = createStage(pal);

// ------------------------------------------------------------------ model
// Everything is modelled feeding towards +X and mirrored here, so sets are fed
// from the right and booklets come out on the left. Scene-space helpers below
// (M, mx) apply the same mirror to camera shots, labels and the minimap.
const world = new THREE.Group();
world.scale.x = -1;
scene.add(world);
const mx = (x) => -x;
const M = (x, y, z) => new THREE.Vector3(mx(x), y, z);

const bm = createBookletMaker(world, pal);
const { T, P, TABLE_Y: ty } = bm;

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const tex = makeSetTexture();
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const outlineMat = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0.55 });
const stapleMat = new THREE.MeshBasicMaterial({ color: pal.staple });
const setMat = makeSetMaterial(tex, pal);
setMat.uniforms.uFlip.value = 1;
const set = createSet(world, setMat, outlineMat, stapleMat);

// ------------------------------------------------------------------ timeline
// set centre positions along the table
const SC_LOAD = T.nearest(-2.75, ty + 0.2);
const SC_STITCH = T.nearest(XS, ty);
const SC_FOLD = T.nearest(XF, ty);
// spine positions along P (the spine's outer face sits R_OUT ahead of p)
const R_OUT = (NS - 0.5) * TH;
const P_CREEP = 3.6;
const P_SQF = P.marks.sqf - R_OUT - 0.01;
const P_STACK = P.total - 0.9;

const K = {
  explode: [[0, 0], [0.08, 0], [0.115, 1], [0.165, 1], [0.2, 0]],
  sc: [[0, SC_LOAD], [0.23, SC_LOAD], [0.29, SC_STITCH], [0.44, SC_STITCH], [0.49, SC_FOLD]],
  drive: [[0, 0], [0.33, 0], [0.36, 1]],
  clinch: [[0, 0], [0.365, 0], [0.39, 1]],
  backstop: [[0, 0], [0.42, 0], [0.435, 1], [0.56, 1], [0.6, 0]],
  blade: [[0, 0], [0.515, 0], [0.55, 1], [0.565, 1], [0.585, 0]],
  p: [[0, 0], [0.525, 0], [0.55, 0.5], [0.6, P_CREEP], [0.705, P_CREEP], [0.78, P_SQF], [0.885, P_SQF], [0.95, P_STACK]],
  clamp: [[0, 0], [0.795, 0], [0.807, 1], [0.865, 1], [0.875, 0]],
  qz: [[0, -2.2], [0.812, -2.2], [0.858, 2.2]],
  stop: [[0, 0], [0.866, 0], [0.88, 1]],
};
const T_END = 1.0;

// ------------------------------------------------------------------ chapters
const CH = [
  {
    t0: 0, kicker: 'How it’s done', title: 'From loose sheets to a booklet',
    body: 'Printed sheets come off the press flat and loose. This machine turns them into a finished booklet in one go: it staples the set down the middle, folds it in half, squares off the spine and stacks it. Scroll to open it up.',
    specs: [['Sets per hour', 'up to 1,800'], ['Stitch heads', '2'], ['Sheet sizes', 'A5 to SRA3'], ['Booklet sizes', 'A6 to A4']],
  },
  {
    t0: 0.07, kicker: 'The set', title: 'Six sheets, twenty-four pages',
    body: 'A booklet is made from sheets printed with two pages on each side. Stacked in order and folded down the middle, each sheet nests inside the one above it, so the top sheet carries the covers and the bottom sheet the centre spread.',
    specs: [['Sheets', `${NS} × A3`], ['Pages', `${NS * 4}`], ['Top sheet', 'pages 1 · 2 · 23 · 24'], ['Bottom sheet', 'centre spread 12 · 13']],
  },
  {
    t0: 0.19, kicker: 'Hand feeding', title: 'Squared up and fed in',
    body: 'The operator lays the collated set on the feed table, butted up against the fixed side guide to keep it square. Belts under the table carry it into the machine until its leading edge meets the back stop, putting the centre line exactly under the stitch heads.',
    specs: [['Feeding', 'by hand'], ['Set up to', '22 sheets · 80 gsm'], ['Paper weight', '60 – 250 gsm']],
  },
  {
    t0: 0.3, kicker: 'Stitching', title: 'Two staples down the spine',
    body: 'Two stitch heads come down on the centre line together and drive a staple through the whole set. Underneath, the clinchers bend the legs flat so they grip the sheets and won’t snag.',
    specs: [['Heads', '2'], ['Staples', 'cartridge · chisel point'], ['Also does', 'corner + edge stapling']],
  },
  {
    t0: 0.41, kicker: 'Into position', title: 'Lined up with the fold',
    body: 'The back stop drops out of the way and the belts carry the stapled set on until it stops again, this time with the staples sitting right over the fold blade.',
    specs: [['Staples', 'on the fold line'], ['Stop', 'fixed at half the sheet length']],
  },
  {
    t0: 0.5, kicker: 'The fold', title: 'Pushed into the rollers',
    body: 'A thin blade rises through a slot in the table and pushes the set’s centre up into the gap between two fold rollers. The rollers grab the spine and pull the whole set through, folding it cleanly in half.',
    specs: [['Fold', 'blade + roller nip'], ['Spine', 'leads the way'], ['Staple crowns', 'end up outside']],
  },
  {
    t0: 0.61, kicker: 'Creep', title: 'Why the middle pages stick out',
    body: 'Each sheet has to wrap around the ones inside it, so the outer sheets use up a little more paper going round the spine. The result is that the centre pages push out further at the open edge. It’s usually trimmed off afterwards.',
    specs: [['Called', 'creep or push-out'], ['Grows with', 'page count + paper thickness'], ['Fix', 'trim the fore-edge']],
  },
  {
    t0: 0.7, kicker: 'Transport', title: 'Over and down to the squarefold',
    body: 'Pairs of rollers carry the folded booklet over the top of the machine and down the far side to the square-back unit, where it stops with its spine against a stop plate.',
    specs: [['Leading edge', 'the spine'], ['Stops at', 'spine stop'], ['Spine', 'round (folded)']],
  },
  {
    t0: 0.79, kicker: 'Square back', title: 'Pressing the spine flat',
    body: 'Clamps close on the booklet just behind the spine to hold it. Then a roller runs along the length of the spine, pressing the rounded fold into a flat, square edge.',
    specs: [['Holds', 'clamp jaws'], ['Forms', 'one roller pass'], ['Result', 'flat, square spine']],
  },
  {
    t0: 0.88, kicker: 'Delivery', title: 'Onto the stacker',
    body: 'The clamps open, the stop lifts and the booklet carries on out onto the belt stacker, where finished booklets build up in a neat overlapping row.',
    specs: [['Delivery', 'belt stacker'], ['Spine', 'square']],
  },
  {
    t0: 0.955, kicker: 'Summary', title: 'A square-backed booklet',
    body: 'Fed, stapled, folded, squared and stacked in a couple of seconds. The flat spine makes the booklet lie flatter, stack neatly and look more like a perfect-bound book, with the strength of staples.',
    specs: [['Pages', `${NS * 4}`], ['Binding', 'saddle stitch'], ['Spine', 'square'], ['Sets per hour', 'up to 1,800']],
  },
];
const CH_SUMMARY = CH.length - 1;
const INTRO = 0.08;
const chapters = createChapters({ CH, tEnd: T_END, intro: INTRO });

// ------------------------------------------------------------------ path lines
const railMat = new THREE.LineDashedMaterial({ color: pal.rail, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.55 });
const trailMat = new THREE.LineBasicMaterial({ color: pal.trail, transparent: true });
const trails = [];
for (const z of [-(SW / 2 + 0.14), SW / 2 + 0.14]) {
  const g = new THREE.BufferGeometry().setFromPoints(P.pts.map(([x, y]) => new THREE.Vector3(x, y, z)));
  const base = new THREE.Line(g, railMat);
  base.computeLineDistances();
  world.add(base);
  const tr = new THREE.Line(g.clone(), trailMat);
  tr.frustumCulled = false;
  world.add(tr);
  trails.push(tr);
}

// ------------------------------------------------------------------ state
function computeState(t) {
  const k = {};
  for (const n in K) k[n] = keyed(K[n], t);
  return {
    t, ch: chapters.at(t), ...k,
    // what writeSet needs
    set: {
      T, G: P, sc: k.sc, p: k.p, q: 1, qz: k.qz, explode: k.explode, drive: k.drive, clinch: k.clinch, alpha: 1,
    },
  };
}

// ------------------------------------------------------------------ mechanics
const q = [0, 0, 0, 0];
function updateMechanics(st) {
  // table rollers turn with the set; path rollers with the spine
  for (const r of bm.rotors) {
    const d = r.src === 'sc' ? st.sc : st.p;
    r.obj.rotation.z = (-d / r.r) * r.sign;
  }
  // stitch drivers come down to the top of the set, then lift as the clinchers finish
  const stroke = st.drive * (1 - st.clinch);
  for (const h of bm.heads) h.position.y = lerp(ty + 1.1, ty + NS * TH + 0.02, stroke);
  bm.backstop.rotation.z = -st.backstop * 1.45;
  bm.blade.position.y = ty - 0.25 + st.blade * 0.95;
  // squarefold
  const gap = lerp(0.42, R_OUT + 0.03, st.clamp);
  for (const c of bm.sqf.clamps) c.position.y = 3.3 + c.userData.sgn * gap;
  bm.sqf.stop.position.y = 3.3 + st.stop * 0.9;
  bm.sqf.roller.position.set(SQF_X + R_OUT + 0.15, 3.3, clamp(st.qz, -2.0, 2.0));
  bm.sqf.roller.children[0].rotation.y = -st.qz / 0.14;
}

function updateTrails(st) {
  const s = st.p > 0.01 ? st.p + R_OUT : -1;
  for (const tr of trails) tr.geometry.setDrawRange(0, s < 0 ? 0 : P.indexAt(s) + 1);
}

// ------------------------------------------------------------------ intro reveal
function updateReveal(r) {
  const open = (d) => ease((r - 0.06 - d.mod * 0.1) / 0.34);
  const doorsA = 1 - ease((r - 0.6) / 0.25);
  const solid = 1 - ease((r - 0.62) / 0.33);
  for (const d of bm.doors) {
    const k = open(d);
    d.g.rotation.y = (d.open === 'L' ? -1 : 1) * k * 1.7;
    d.g.visible = doorsA > 0.001;
    const a = doorsA * lerp(1, 0.14, k);
    d.mats.solid.opacity = a;
    d.mats.solid.depthWrite = a > 0.6;
    d.mats.line.opacity = 0.75 * doorsA * lerp(1, 0.4, k);
  }
  const m = bm.mats;
  const cav = pal.keepCavity ? 1 : solid;
  m.cavity.opacity = cav;
  m.cavity.depthWrite = cav > 0.5;
  m.cavity.visible = cav > 0.001;
  for (const s of m.solids) {
    s.opacity = solid;
    s.depthWrite = solid > 0.5;
    s.visible = solid > 0.001;
  }
}

// ------------------------------------------------------------------ camera
// shots are written in model space (feeding towards +X) and mirrored by M()
const CAMS = [
  () => ({ p: M(-3, 15, 30), t: M(5.5, 5.2, 0) }),                    // overview
  () => ({ p: M(-8.5, 13.8, 12.5), t: M(-2.4, 7.2, 0) }),              // exploded set
  () => ({ p: M(-4.2, 11.2, 9.8), t: M(0.8, 6.4, 0) }),               // feed in
  () => ({ p: M(4.4, ty + 2.4, 7.2), t: M(XS, ty + 1.0, 0) }),             // stitching
  () => ({ p: M(2.2, 10.8, 9.0), t: M(4.6, ty + 0.4, 0) }),           // into position
  () => ({ p: M(9.2, 8.6, 6.2), t: M(XF, ty + 0.9, 0) }),             // fold
  () => ({ p: M(XF + 2.2, ty + 1.6, 7.0), t: M(XF - 0.2, ty + 2.0, 0.4) }),   // creep
  () => ({ p: M(17.5, 12.5, 14.5), t: M(8.8, 6.0, 0) }),              // over and down
  () => ({ p: M(14.4, 5.6, 5.4), t: M(SQF_X, 3.3, 0.2) }),            // pressing
  () => ({ p: M(19.5, 9.5, 11.5), t: M(13.8, 3.6, 0) }),              // stacker
  () => ({ p: M(21, 15, 24), t: M(8, 5.4, 0) }),                      // summary
];
const rig = createCameraRig(camera, { CH, CAMS, tEnd: T_END });
function updateCamera(st, dt) {
  rig(st.t, st.ch, dt);
  const sh = st.ch === 0 || st.ch === CH_SUMMARY ? 0.5 : 0.2;
  bm.mats.shell.opacity += (sh - bm.mats.shell.opacity) * 0.1;
  bm.mats.panel.opacity += (sh * 0.7 - bm.mats.panel.opacity) * 0.1;
}

// ------------------------------------------------------------------ HUD
const ro = { set: $('#ro-set'), zone: $('#ro-zone'), staples: $('#ro-staples'), spine: $('#ro-spine') };
function zoneOf(st) {
  if (st.p < 0.01) {
    if (st.explode > 0.05) return 'COLLATED SET';
    if (st.sc < SC_LOAD + 0.3) return 'FEED TABLE';
    if (st.sc < SC_STITCH + 0.05) return st.drive > 0 ? 'STITCHING' : 'TO STITCH';
    return 'FOLD POSITION';
  }
  if (st.p < P.marks.nip + 0.6) return 'FOLD ROLLERS';
  if (st.p < P_SQF - 0.05) return 'TRANSPORT';
  if (st.p < P_SQF + 0.2) return 'SQUAREFOLD';
  return 'BELT STACKER';
}
function spineOf(st) {
  if (st.p < 0.01) return 'FLAT';
  if (st.p < 0.5) return `FOLDING ${Math.round((st.p / 0.5) * 100)}%`;
  if (st.qz > -2) {
    const k = clamp((st.qz + 1.5) / 3);
    return k >= 1 ? 'SQUARE' : `SQUARING ${Math.round(k * 100)}%`;
  }
  return 'ROUND';
}
let lastRO = '';
function updateHUD(st) {
  chapters.show(st.ch);
  const staples = st.drive < 1 ? '0 / 2' : st.clinch >= 1 ? '2 / 2 · CLINCHED' : '2 / 2';
  const zone = zoneOf(st), spine = spineOf(st);
  const key = `${zone}|${staples}|${spine}`;
  if (key === lastRO) return;
  lastRO = key;
  ro.set.textContent = `${NS} SH · ${NS * 4} PP`;
  ro.zone.textContent = zone;
  ro.staples.textContent = staples;
  ro.spine.textContent = spine;
}

// ------------------------------------------------------------------ callouts
// positions in model space, mirrored for display
let lastExplode = 0;
const L = (x, y, z) => [mx(x), y, z];
const sheetLabel = (i) => {
  const k = NS - 1 - i;
  const pp = [NS * 4 - 2 * k, 1 + 2 * k, 2 + 2 * k, NS * 4 - 1 - 2 * k].sort((a, b) => a - b);
  return {
    t: i === NS - 1 ? 'COVER SHEET' : i === 0 ? 'CENTRE SHEET' : `SHEET ${k + 1}`,
    s: `pages ${pp.join(' · ')}`,
    at: () => { T.sample(SC_LOAD, q); return L(q[0] - 2.1, q[1] + (i + 0.5) * TH + lastExplode * (i * 0.42 + 0.2), SW / 2); },
    d: [60, 0], ch: [1],
  };
};
const LABELS = [
  { t: 'FEED TABLE', at: L(-3.4, ty + 0.3, SW / 2 + 0.35), d: [40, 50], ch: [0, 2] },
  { t: 'STITCH HEADS', s: '× 2', at: L(XS, ty + 2.4, 1.1), d: [30, -50], ch: [0, 3] },
  { t: 'FOLD ROLLERS', at: L(XF + 0.3, ty + 1.05, 1.6), d: [-40, -50], ch: [0, 5] },
  { t: 'SQUAREFOLD', at: L(10.6, 4.4, 2.2), d: [-50, 40], ch: [0, 7] },
  { t: 'BELT STACKER', at: L(15.6, 3.0, 1.2), d: [-30, 50], ch: [0, 9, 10] },
  { t: '1,300', cls: 'dim', at: L(CAB.x1 / 2, 0, 4.2), d: [0, 14], ch: [0, 10] },
  { t: '1,020', cls: 'dim', at: L(CAB.x1 + 1.2, CAB.y1 / 2, CAB.z), d: [-16, 0], ch: [0, 10] },

  ...Array.from({ length: NS }, (_, i) => sheetLabel(i)),

  { t: 'SIDE GUIDES', s: 'fixed, keep the set square', at: L(-2.75, ty + 0.45, -(SW / 2 + 0.3)), d: [50, -40], ch: [2] },
  { t: 'BACK STOP', at: L(XS + SL / 2 + 0.03, ty + 0.4, 0.9), d: [-40, -50], ch: [2, 4] },
  { t: 'TRANSPORT BELTS', at: L(1.8, ty - 0.12, 1.05), d: [40, 50], ch: [2] },

  { t: 'STITCH HEAD', at: L(XS, ty + 2.0, STAPLE_Z[1] + 0.3), d: [-50, -40], ch: [3] },
  { t: 'STAPLE CARTRIDGE', at: L(XS, ty + 2.6, STAPLE_Z[0] - 0.2), d: [50, -40], ch: [3] },
  { t: 'CLINCHER', s: 'bends the legs', at: L(XS + 0.3, ty - 0.35, STAPLE_Z[1] + 0.2), d: [-50, 40], ch: [3] },

  { t: 'FOLD STOP', at: L(XF + SL / 2 + 0.06, ty + 0.4, 0.9), d: [-40, -40], ch: [4] },
  { t: 'FOLD BLADE', at: L(XF, ty - 0.5, 1.7), d: [-50, 40], ch: [4, 5] },

  { t: 'FOLD NIP', at: L(XF, ty + 0.75, 1.55), d: [60, -40], ch: [5] },
  { t: 'STAPLES', s: 'crown outside', at: () => L(set.spine.x, set.spine.y, STAPLE_Z[1]), d: [-50, -40], ch: [5] },

  { t: 'CREEP', s: 'inner pages stick out', at: () => L(set.foreEdge.x, set.foreEdge.y, SW / 2), d: [-50, 30], ch: [6] },
  { t: 'COVER SHEET', at: () => L(XF + R_OUT + 0.02, set.foreEdge.y + 0.5, SW / 2), d: [-60, -40], ch: [6] },

  { t: 'SPINE STOP', at: L(SQF_X + 0.05, 3.9, 1.6), d: [-40, -50], ch: [7, 8] },
  { t: 'CLAMP JAWS', at: L(10.5, 3.75, 1.8), d: [50, -40], ch: [8] },
  { t: 'FORMING ROLLER', s: 'runs the spine', at: () => L(bm.sqf.roller.position.x, 3.55, bm.sqf.roller.position.z), d: [-50, -40], ch: [8] },
  { t: 'SQUARE SPINE', at: () => L(set.spine.x, set.spine.y, 0.6), d: [-40, -50], ch: [9, 10] },
];
const updateLabels = createLabels(LABELS, camera);

// ------------------------------------------------------------------ minimap
// side elevation, mirrored to match: feed on the right
const svgNS = 'http://www.w3.org/2000/svg';
const mm = $('#minimap');
mm.setAttribute('viewBox', '-18.4 -11.2 24 11.7');
mm.setAttribute('preserveAspectRatio', 'xMidYMid meet');
{
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('transform', 'scale(-1,-1)');
  const add = (tag, attrs) => {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(e);
    return e;
  };
  add('line', { x1: -5.5, y1: 0, x2: 18.3, y2: 0, class: 'mm-ground' });
  add('rect', { x: CAB.x0, y: 0.4, width: CAB.x1 - CAB.x0, height: CAB.y1 - 0.4, class: 'mm-module' });
  add('rect', { x: 9.6, y: 2.2, width: 2.6, height: 2.2, class: 'mm-module' });
  add('polyline', { points: T.pts.filter((_, i) => i % 3 === 0).map((p) => p.join(',')).join(' '), class: 'mm-path' });
  add('polyline', { points: P.pts.map((p) => p.join(',')).join(' '), class: 'mm-path' });
  mm.trail = add('polyline', { points: '', class: 'mm-trail' });
  mm.set = add('polyline', { points: '', class: 'mm-sheet' });
  mm.appendChild(g);
}
let mmKey = '';
function updateMinimap(st) {
  const key = `${st.sc.toFixed(2)}|${st.p.toFixed(2)}`;
  if (key === mmKey) return;
  mmKey = key;
  const f = () => q[0].toFixed(2) + ',' + q[1].toFixed(2);
  const s1 = st.p + R_OUT;
  let trail = '';
  if (st.p > 0.01) {
    const n = P.indexAt(s1);
    trail = P.pts.slice(0, n + 1).map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
    P.sample(s1, q);
    trail += ' ' + f();
  }
  mm.trail.setAttribute('points', trail);
  // the set in side view: flat on the table, or its folded length behind the spine
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    if (st.p < 0.01) T.sample(st.sc - SL / 2 + (i / 16) * SL, q);
    else P.sample(s1 - (i / 16) * Math.min(s1, SL / 2), q);
    pts.push(f());
  }
  mm.set.setAttribute('points', pts.join(' '));
}

// ------------------------------------------------------------------ theme
function applyTheme(name) {
  pal = PALETTES[name];
  scene.background.set(pal.bg);
  bloom.enabled = pal.bloom;
  bm.setTheme(pal);
  railMat.color.set(pal.rail);
  trailMat.color.set(pal.trail);
  outlineMat.color.set(pal.outline);
  stapleMat.color.set(pal.staple);
  setMat.uniforms.uPaper.value.set(pal.paper);
  setMat.uniforms.uGain.value = pal.paperGain;
}
bindTheme(applyTheme);

const solidOn = bindSolid();
let solidK = solidOn() ? 1 : 0;

// ------------------------------------------------------------------ loop
runLoop({
  intro: INTRO, tEnd: T_END, composer, playSeconds: 80,
  frame({ t, reveal, dt }) {
    const st = computeState(t);
    lastExplode = st.explode;
    updateReveal(reveal);
    writeSet(set, st.set);
    const solidTarget = solidOn() ? 1 : 0;
    solidK += (solidTarget - solidK) * (1 - Math.exp(-dt * 5));
    if (Math.abs(solidK - solidTarget) < 1e-3) solidK = solidTarget;
    bm.setSolid(solidK);
    updateMechanics(st);
    updateTrails(st);
    updateCamera(st, dt);
    updateHUD(st);
    updateLabels(st.ch);
    updateMinimap(st);
  },
});
