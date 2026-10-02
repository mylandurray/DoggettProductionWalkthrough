import * as THREE from 'three';
import {
  createBookletMaker, SL, SW, NS, TH, R_OUT, CAB, MODS, DECK_Y, X_DROP, YS, YF, SQF_X, TRIM_X, TRIM_KEEP, X_KNIFE, STAPLE_Z,
} from './machine.js';
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
const { T, P } = bm;

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const tex = makeSetTexture();
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const outlineMat = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0.55 });
const stapleMat = new THREE.MeshBasicMaterial({ color: pal.staple });
const setMat = makeSetMaterial(tex, pal);
setMat.uniforms.uFlip.value = 1;
const set = createSet(world, setMat, outlineMat, stapleMat);

// ------------------------------------------------------------------ timeline
// set centre positions: flat on the feed table, then hanging in the pocket
const SC_LOAD = T.nearest(2.4, DECK_Y);
const SC_STITCH = T.nearest(X_DROP, YS);
const SC_FOLD = T.nearest(X_DROP, YF);
// spine positions along P (the spine's outer face sits R_OUT ahead of p)
const P_CREEP = 2.5;
const P_SQF = P.marks.sqf - R_OUT - 0.01;
const P_TRIM = P.marks.trim - R_OUT - 0.01;
const P_STACK = P.total - 0.9;

const K = {
  explode: [[0, 0], [0.08, 0], [0.115, 1], [0.165, 1], [0.2, 0]],
  sc: [[0, SC_LOAD], [0.22, SC_LOAD], [0.29, SC_STITCH], [0.42, SC_STITCH], [0.46, SC_FOLD]],
  drive: [[0, 0], [0.32, 0], [0.345, 1]],
  clinch: [[0, 0], [0.35, 0], [0.37, 1]],
  backstop: [[0, 0], [0.405, 0], [0.42, 1], [0.53, 1], [0.56, 0]],
  blade: [[0, 0], [0.48, 0], [0.51, 1], [0.525, 1], [0.545, 0]],
  p: [[0, 0], [0.49, 0], [0.51, 0.5], [0.555, P_CREEP], [0.635, P_CREEP], [0.685, P_SQF], [0.775, P_SQF], [0.815, P_TRIM], [0.9, P_TRIM], [0.955, P_STACK]],
  clamp: [[0, 0], [0.695, 0], [0.705, 1], [0.76, 1], [0.77, 0]],
  qz: [[0, -2.2], [0.71, -2.2], [0.755, 2.2]],
  stop: [[0, 0], [0.762, 0], [0.775, 1]],
  tclamp: [[0, 0], [0.825, 0], [0.835, 1], [0.88, 1], [0.89, 0]],
  knife: [[0, 0], [0.84, 0], [0.855, 1], [0.872, 0]],
  cut: [[0, 0], [0.8525, 0], [0.853, 1]],
  offcut: [[0, 0], [0.856, 0], [0.885, 1]],
  tstop: [[0, 0], [0.887, 0], [0.9, 1]],
};
const T_END = 1.0;

// ------------------------------------------------------------------ chapters
const CH = [
  {
    t0: 0, kicker: 'How it’s done', title: 'From loose sheets to a booklet',
    body: 'Printed sheets come off the press flat and loose. Our Morgana BM350 line turns them into a finished booklet in one pass: the booklet maker staples the set down the middle and folds it, the squarefold flattens the spine, and the trimmer cuts the open edge clean. Scroll to open it up.',
    specs: [['Booklet maker', 'Morgana BM350'], ['Modules', 'squarefold · face trimmer'], ['Sets', '2 – 35 sheets · 80 gsm'], ['Booklets', 'up to 140 pages']],
  },
  {
    t0: 0.07, kicker: 'The set', title: 'Six sheets, twenty-four pages',
    body: 'A booklet is made from sheets printed with two pages on each side. Stacked in order and folded down the middle, each sheet nests inside the one above it, so the top sheet carries the covers and the bottom sheet the centre spread.',
    specs: [['Sheets', `${NS} × A3`], ['Pages', `${NS * 4}`], ['Top sheet', 'pages 1 · 2 · 23 · 24'], ['Bottom sheet', 'centre spread 12 · 13']],
  },
  {
    t0: 0.19, kicker: 'Hand feeding', title: 'Laid on top, dropped in',
    body: 'The operator lays the collated set on the feed table on top of the booklet maker, butted against the side guide to keep it square. Rollers draw it in through the slot and it drops down an upright pocket until its edge lands on the stitch stop, with the centre line level with the stitch heads.',
    specs: [['Feeding', 'by hand'], ['Sheet size', '206 × 275 to 320 × 457 mm'], ['Paper weight', '64 – 300 gsm']],
  },
  {
    t0: 0.3, kicker: 'Stitching', title: 'Two staples down the spine',
    body: 'Two stitch heads drive a staple through the whole set at once, from the front. Behind the pocket the clinchers bend the legs flat so they grip the sheets and won’t snag.',
    specs: [['Heads', '2'], ['Cartridge', '5,000 staples'], ['Staple position', 'set from the sheet size']],
  },
  {
    t0: 0.4, kicker: 'Into position', title: 'Dropped to the fold line',
    body: 'The stitch stop swings away and the stapled set drops onto a lower stop, which puts the staples level with the fold blade and the gap between the fold rollers. The machine measures the book’s thickness and sets the roller pressure to suit.',
    specs: [['Staples', 'on the fold line'], ['Fold rollers', 'set by book thickness']],
  },
  {
    t0: 0.475, kicker: 'The fold', title: 'Pushed into the rollers',
    body: 'A thin blade pushes the middle of the set out of the pocket and into the gap between two fold rollers. The rollers grab the spine and pull the whole set through, folding it in half and laying it flat, spine first.',
    specs: [['Fold', 'blade + roller nip'], ['Spine', 'leads the way'], ['Staple crowns', 'end up outside']],
  },
  {
    t0: 0.555, kicker: 'Creep', title: 'Why the middle pages stick out',
    body: 'Each sheet has to wrap around the ones inside it, so the outer sheets use up a little more paper going round the spine. The result is that the centre pages push out further at the open edge. The trimmer will cut it off.',
    specs: [['Called', 'creep or push-out'], ['Grows with', 'page count + paper thickness'], ['Fix', 'trim the fore-edge']],
  },
  {
    t0: 0.635, kicker: 'Transport', title: 'Into the squarefold',
    body: 'Pairs of rollers carry the folded booklet flat out of the booklet maker and into the squarefold module, where it stops with its spine against a stop plate.',
    specs: [['Leading edge', 'the spine'], ['Stops at', 'spine stop'], ['Spine', 'round (folded)']],
  },
  {
    t0: 0.69, kicker: 'Square back', title: 'Pressing the spine flat',
    body: 'Clamps close on the booklet just behind the spine to hold it. Then a roller runs along the length of the spine, pressing the rounded fold into a flat, square edge.',
    specs: [['Holds', 'clamp jaws'], ['Forms', 'one roller pass'], ['Result', 'flat, square spine']],
  },
  {
    t0: 0.78, kicker: 'Face trim', title: 'Cutting the creep off',
    body: 'In the trimmer the booklet runs up to a book stop, which puts the knife just inside the shortest page. A clamp holds it flat, the knife comes down and cuts the open edge clean in one stroke. The strip drops into the waste bin underneath.',
    specs: [['Cuts', 'the fore-edge'], ['Trim', '1 – 16 mm'], ['Waste', 'bin under the knife']],
  },
  {
    t0: 0.895, kicker: 'Delivery', title: 'Onto the belt tray',
    body: 'The book stop lifts and the booklet carries on out of the trimmer onto the belt delivery, where finished booklets build up in a neat overlapping row.',
    specs: [['Delivery', 'belt tray'], ['Spine', 'square'], ['Fore-edge', 'trimmed']],
  },
  {
    t0: 0.955, kicker: 'Summary', title: 'A square-backed, trimmed booklet',
    body: 'Fed, stapled, folded, squared, trimmed and stacked in a few seconds. The flat spine lets the booklet lie flatter and stack neatly, and the clean fore-edge means it’s ready to go with no trip to the guillotine.',
    specs: [['Pages', `${NS * 4}`], ['Binding', 'saddle stitch'], ['Spine', 'square'], ['Fore-edge', 'trimmed']],
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
      T, G: P, sc: k.sc, p: k.p, q: 1, qz: k.qz, trim: k.cut > 0.5 ? TRIM_KEEP : Infinity,
      explode: k.explode, drive: k.drive, clinch: k.clinch, alpha: 1,
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
  // stitch drivers come in to the face of the set, then pull back as the clinchers finish
  const stroke = st.drive * (1 - st.clinch);
  for (const h of bm.heads) h.position.x = lerp(X_DROP + 1.1, X_DROP + NS * TH + 0.02, stroke);
  bm.backstop.rotation.z = -st.backstop * 1.45;
  bm.blade.position.x = X_DROP - 0.25 + st.blade * 0.95;
  // squarefold
  const gap = lerp(0.42, R_OUT + 0.03, st.clamp);
  for (const c of bm.sqf.clamps) c.position.y = YF + c.userData.sgn * gap;
  bm.sqf.stop.position.y = YF + st.stop * 0.9;
  bm.sqf.roller.position.set(SQF_X + R_OUT + 0.15, YF, clamp(st.qz, -2.0, 2.0));
  bm.sqf.roller.children[0].rotation.y = -st.qz / 0.14;
  // trimmer
  bm.trim.clamp.position.y = lerp(YF + 0.6, YF + R_OUT + 0.02, st.tclamp);
  bm.trim.knife.position.y = lerp(YF + 0.9, YF - 0.3, st.knife);
  bm.trim.stop.position.y = YF + st.tstop * 0.9;
  updateOffcuts(st);
}

// the trimmed-off strips: one per half-sheet, from the cut back to its fore-edge,
// falling into the waste bin once the knife has been through
const offcutMat = new THREE.MeshBasicMaterial({ color: pal.paper, transparent: true, side: THREE.DoubleSide });
const offcuts = new THREE.Group();
world.add(offcuts);
for (let i = 0; i < NS; i++) {
  const r = (i + 0.5) * TH + 0.008;
  const len = SL / 2 - (Math.PI / 2) * r - TRIM_KEEP;
  for (const h of [-1, 1]) {
    const geo = new THREE.BoxGeometry(len, 0.006, SW);
    const m = new THREE.Mesh(geo, offcutMat);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), outlineMat));
    m.userData = { x: X_KNIFE - len / 2, y: YF - h * r, spin: h * (0.4 + i * 0.12) };
    m.renderOrder = 5;
    offcuts.add(m);
  }
}
function updateOffcuts(st) {
  offcuts.visible = st.cut > 0.5 && st.offcut < 1;
  if (!offcuts.visible) return;
  const k = st.offcut;
  for (const m of offcuts.children) {
    const u = m.userData;
    m.position.set(u.x - k * 0.5, u.y - k * k * (YF - 1.0), 0);
    m.rotation.z = k * u.spin;
  }
  offcutMat.opacity = 1 - clamp((k - 0.8) / 0.2);
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
  () => ({ p: M(7, 16, 39), t: M(10, 5.4, 0) }),                              // overview
  () => ({ p: M(-6, 18.5, 14.5), t: M(1.4, 11.2, 0) }),                       // exploded set
  () => ({ p: M(-3.5, 15.5, 13), t: M(4.2, 8.6, 0) }),                        // feed in
  () => ({ p: M(X_DROP + 7.5, YS + 2.4, 9.5), t: M(X_DROP + 1.0, YS - 0.3, 0) }), // stitching
  () => ({ p: M(X_DROP + 6.5, 7.4, 11.5), t: M(X_DROP + 0.4, 5.4, 0) }),       // into position
  () => ({ p: M(X_DROP + 3.8, YF + 2.2, 6.8), t: M(X_DROP + 0.7, YF, 0) }),    // fold
  () => ({ p: M(4.2, YF + 2.0, 6.0), t: M(6.6, YF, 0.4) }),                   // creep
  () => ({ p: M(10.5, 10, 13), t: M(10, 5.4, 0) }),                           // into the squarefold
  () => ({ p: M(SQF_X + 3.2, YF + 2.3, 5.4), t: M(SQF_X, YF, 0.2) }),         // pressing
  () => ({ p: M(X_KNIFE + 0.8, YF + 2.6, 8.8), t: M(X_KNIFE, YF - 0.9, 0) }),     // trim
  () => ({ p: M(26, 10.5, 12.5), t: M(20, 5.0, 0) }),                         // delivery
  () => ({ p: M(24, 17.5, 35), t: M(10.4, 5.4, 0) }),                         // summary
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
    if (st.sc < SC_FOLD - 0.05) return 'DROPPING';
    return 'FOLD POSITION';
  }
  if (st.p < P.marks.nip + 0.6) return 'FOLD ROLLERS';
  if (st.p < P_SQF - 0.05) return 'TRANSPORT';
  if (st.p < P_SQF + 0.2) return 'SQUAREFOLD';
  if (st.p < P_TRIM - 0.05) return 'TRANSPORT';
  if (st.p < P_TRIM + 0.2) return st.cut > 0.5 ? 'TRIMMED' : 'FACE TRIMMER';
  return 'BELT DELIVERY';
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
  { t: 'BOOKLET MAKER', s: 'BM350', at: L(1.6, CAB.y1, CAB.z), d: [30, -50], ch: [0, 11] },
  { t: 'SQUAREFOLD', at: L((MODS.sqf[0] + MODS.sqf[1]) / 2, CAB.y1, CAB.z), d: [0, -60], ch: [0, 11] },
  { t: 'FACE TRIMMER', at: L((MODS.trm[0] + MODS.trm[1]) / 2, CAB.y1, CAB.z), d: [-20, -50], ch: [0, 11] },
  { t: 'BELT DELIVERY', at: L(21.2, YF - 0.25, 1.2), d: [-30, 50], ch: [0, 10, 11] },
  { t: 'FEED TABLE', at: L(1.0, DECK_Y + 0.1, SW / 2 + 0.35), d: [40, 50], ch: [0, 2] },
  { t: '810', cls: 'dim', at: L((MODS.bm[0] + MODS.bm[1]) / 2, 0, CAB.z + 1.4), d: [0, 14], ch: [0, 11] },
  { t: '1,010', cls: 'dim', at: L(CAB.x0 - 1.2, CAB.y1 / 2, CAB.z), d: [16, 0], ch: [0, 11] },

  ...Array.from({ length: NS }, (_, i) => sheetLabel(i)),

  { t: 'SIDE GUIDE', s: 'keeps the set square', at: L(3.0, DECK_Y + 0.3, -(SW / 2 + 0.15)), d: [50, -40], ch: [2] },
  { t: 'FEED ROLLERS', at: L(3.6, DECK_Y - 0.12, 1.2), d: [40, 50], ch: [2] },
  { t: 'STITCH STOP', at: L(X_DROP + 0.3, YS - SL / 2 - 0.03, 0.9), d: [-50, 40], ch: [2, 4] },

  { t: 'STITCH HEADS', s: '× 2', at: L(X_DROP + 1.7, YS + 0.38, STAPLE_Z[1]), d: [-40, -50], ch: [3] },
  { t: 'STAPLE CARTRIDGE', at: L(X_DROP + 2.6, YS + 0.3, STAPLE_Z[0] - 0.2), d: [-30, -50], ch: [3] },
  { t: 'CLINCHER', s: 'bends the legs', at: L(X_DROP - 0.35, YS - 0.3, STAPLE_Z[1] + 0.25), d: [50, 40], ch: [3] },

  { t: 'FOLD STOP', at: L(X_DROP + 0.3, YF - SL / 2 - 0.06, 0.9), d: [-40, 40], ch: [4] },
  { t: 'FOLD BLADE', at: L(X_DROP - 0.6, YF, 1.7), d: [50, 40], ch: [4, 5] },
  { t: 'FOLD ROLLERS', at: L(X_DROP + 0.75, YF + 0.57, 1.55), d: [-40, -50], ch: [4, 5] },
  { t: 'STAPLES', s: 'crown outside', at: () => L(set.spine.x, set.spine.y, STAPLE_Z[1]), d: [-50, -40], ch: [5] },

  { t: 'CREEP', s: 'inner pages stick out', at: () => L(set.foreEdge.x, set.foreEdge.y, SW / 2), d: [50, 40], ch: [6] },
  { t: 'COVER SHEET', at: () => L(set.spine.x - 1.0, YF + R_OUT, SW / 2), d: [-40, -50], ch: [6] },

  { t: 'SPINE STOP', at: L(SQF_X + 0.05, YF + 0.6, 1.6), d: [-40, -50], ch: [7, 8] },
  { t: 'CLAMP JAWS', at: L(SQF_X - 0.7, YF + 0.45, 1.8), d: [50, -40], ch: [8] },
  { t: 'FORMING ROLLER', s: 'runs the spine', at: () => L(bm.sqf.roller.position.x, YF + 0.25, bm.sqf.roller.position.z), d: [-50, -40], ch: [8] },

  { t: 'KNIFE', at: () => L(X_KNIFE, bm.trim.knife.position.y + 0.9, -2.2), d: [40, -50], ch: [9] },
  { t: 'CLAMP', at: () => L(X_KNIFE + 1.1, bm.trim.clamp.position.y + 0.12, 2.0), d: [-50, -30], ch: [9] },
  { t: 'BOOK STOP', at: L(TRIM_X + 0.05, YF + 0.6, 1.6), d: [-40, -50], ch: [9] },
  { t: 'WASTE BIN', at: L(X_KNIFE - 0.4, 2.4, 2.6), d: [40, 40], ch: [9] },

  { t: 'SQUARE SPINE', at: () => L(set.spine.x, set.spine.y, 0.6), d: [-40, -50], ch: [10, 11] },
];
const updateLabels = createLabels(LABELS, camera);

// ------------------------------------------------------------------ minimap
// side elevation, mirrored to match: feed on the right
const svgNS = 'http://www.w3.org/2000/svg';
const mm = $('#minimap');
mm.setAttribute('viewBox', '-24.6 -11.6 25.6 12.1');
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
  add('line', { x1: -0.8, y1: 0, x2: 24.4, y2: 0, class: 'mm-ground' });
  for (const [a, b] of Object.values(MODS)) add('rect', { x: a, y: 0.4, width: b - a, height: CAB.y1 - 0.4, class: 'mm-module' });
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
  offcutMat.color.set(pal.paper);
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
