import * as THREE from 'three';
import {
  createBinder, SPL, BW, BT, WL, HZ, H1, CW, GT, SPINE_Y, LIFT, COVER_Y, DELIV_Y,
  XL, XM, XG, XSG, XN, XD, XOUT, CZ0, CAB,
} from './machine.js';
import { makeCoverTexture, makeCoverMaterial, createBook } from './book.js';
import { PALETTES, storedTheme } from '../theme.js';
import { createStage } from '../core/stage.js';
import {
  clamp, ease, lerp, keyed, $, createChapters, createCameraRig, createLabels, bindTheme, bindSolid, runLoop,
} from '../core/story.js';

let pal = PALETTES[storedTheme()];
const { renderer, scene, camera, composer, bloom } = createStage(pal);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const pb = createBinder(scene, pal);

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const coverTex = makeCoverTexture();
coverTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const outlineMat = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0.55 });
const coverMat = makeCoverMaterial(coverTex, pal);
const book = createBook(scene, pal, { outlineMat, coverMat });

// ------------------------------------------------------------------ timeline
const X_MILLED = XM + SPL / 2 + 0.2;   // clamp stops once the spine is clear of the cutter
const X_GLUED = XSG + SPL / 2 + 0.2;   // … and of the side-glue wheels
const K = {
  // block handed in from the front, lowered between the jaws, jogged level
  bz: [[0, 5.2], [0.085, 5.2], [0.12, 0]],
  by: [[0, 2.7], [0.12, 2.7], [0.15, 0]],
  jitter: [[0, 1], [0.15, 1], [0.185, 0]],
  jog: [[0, 0], [0.148, 0], [0.156, 1], [0.18, 1], [0.19, 0]],
  gap: [[0, 0.3], [0.192, 0.3], [0.205, 0], [0.83, 0], [0.845, 0.7], [0.93, 0.7], [0.975, 0.3]],
  // clamp travel (forward), then the empty clamp heads back
  bx: [[0, XL], [0.22, XL], [0.345, X_MILLED], [0.37, X_MILLED], [0.485, X_GLUED], [0.5, X_GLUED], [0.6, XN], [0.785, XN], [0.83, XD]],
  ret: [[0, 0], [0.9, 0], [0.97, 1]],
  // cover: fed in, creased, lifted, wrapped
  cz: [[0, CZ0], [0.5, CZ0], [0.585, 0]],
  crease: [[0, 0], [0.59, 0], [0.598, 1], [0.612, 0]],
  scored: [[0, 0], [0.594, 0], [0.605, 1]],
  lift: [[0, 0], [0.645, 0], [0.67, 1], [0.765, 1], [0.785, 0]],
  jawUp: [[0, 0], [0.67, 0], [0.68, 1], [0.745, 1], [0.76, 0]],
  fold: [[0, 0], [0.682, 0], [0.72, 1]],
  jawOut: [[0, 0], [0.73, 0], [0.745, 1]],
  flare: [[0, 0], [0.7, 0], [0.72, 1], [0.845, 1], [0.875, 0]],
  // released: drops and tips onto the belt, which carries it out
  drop: [[0, 0], [0.845, 0], [0.875, 1]],
  belt: [[0, 0], [0.878, 0], [0.925, 1]],
};
const T_END = 1.0;
const T_ATTACH = 0.7;          // cover rides with the book from here on
const FLARE = (15 * Math.PI) / 180;
const JAW_D0 = WL + 0.25;      // side jaws wait just outside the flat cover

// ------------------------------------------------------------------ chapters
const CH = [
  {
    t0: 0, kicker: 'How it’s done', title: 'From loose pages to a paperback',
    body: 'Perfect binding is how most paperbacks, catalogues and reports are made: the pages are glued into a wraparound cover instead of stapled. This binder does it one book at a time, carrying each block along in a clamp past every station. Scroll to open it up.',
    specs: [['Books per hour', 'up to 450'], ['Book thickness', 'up to 50 mm'], ['Glue', 'EVA hot melt'], ['Cover feed', 'automatic']],
  },
  {
    t0: 0.075, kicker: 'The book block', title: 'Knocked up and clamped',
    body: 'The printed pages are collated in order into a book block. The operator drops it spine-down between the open clamp jaws, where a vibrating plate jogs every sheet down level and back against the stop. Then the clamp closes and holds the block tight for the rest of the ride.',
    specs: [['Block', '200 leaves · 400 pp'], ['Thickness', '20 mm'], ['Jogging', 'vibrating spine plate'], ['Clamp', 'single, travelling']],
  },
  {
    t0: 0.21, kicker: 'Milling', title: 'Roughing up the spine',
    body: 'The clamp carries the block over a spinning milling cutter that shaves a couple of millimetres off the spine. That leaves every page as its own leaf with a fresh, fibrous edge, roughened so the glue has something to bite into. The dust is sucked away.',
    specs: [['Removes', '1 – 3 mm'], ['Cutter', 'spinning disc'], ['Spine', 'rough, notched'], ['Waste', 'extracted']],
  },
  {
    t0: 0.36, kicker: 'Gluing', title: 'A film of hot melt',
    body: 'Next the spine runs over a roller turning in a tank of melted glue. It lays an even film across the milled edge, and a spinner just behind wipes off the excess. Two small side wheels then run a thin line of glue up each side, for the cover’s hinges to stick to.',
    specs: [['Glue', 'EVA hot melt'], ['Tank', 'heated, ~170 °C'], ['Spine', 'roller + spinner'], ['Sides', 'side-glue wheels']],
  },
  {
    t0: 0.495, kicker: 'The cover', title: 'Fed in and scored',
    body: 'Meanwhile a cover is pulled in from the tray at the front, printed side down, and stopped centred under the clamp. Creasing bars press two score lines into it, one either side of the spine, so it folds cleanly round the block without cracking.',
    specs: [['Feed', 'automatic, from the front'], ['Cover', 'up to 350 gsm'], ['Scores', '2, at the spine edges'], ['Printed side', 'down']],
  },
  {
    t0: 0.625, kicker: 'Nipping', title: 'Pressed onto the spine',
    body: 'The nipping table rises and presses the cover up against the glued spine. Side jaws sweep in and fold the cover up round the block, squeezing the hinges onto the side glue so the spine comes out square and tight. They hold for a moment while the glue grabs.',
    specs: [['Table', 'lifts the cover'], ['Side jaws', 'fold + press the hinges'], ['Spine', 'square'], ['Dwell', 'a second or two']],
  },
  {
    t0: 0.775, kicker: 'Delivery', title: 'Released and carried out',
    body: 'The clamp carries the covered book on past the nipper and opens. The book drops onto the delivery belt, falls onto its back and rides out of the end of the machine, while the empty clamp heads back to the start for the next block.',
    specs: [['Delivery', 'belt, out of the end'], ['Glue', 'fully sets in minutes'], ['Clamp', 'returns to load']],
  },
  {
    t0: 0.93, kicker: 'Summary', title: 'A perfect-bound book',
    body: 'Clamped, milled, glued, covered and nipped in a few seconds. Once the glue has cured the book is normally trimmed on three sides for clean, flush edges. The result is a flat, square spine that can carry a printed title.',
    specs: [['Pages', '400'], ['Binding', 'perfect (glued)'], ['Spine', 'square, printable'], ['Next step', 'three-knife trim']],
  },
];
const CH_SUMMARY = CH.length - 1;
const INTRO = 0.1;
const chapters = createChapters({ CH, tEnd: T_END, intro: INTRO });

// ------------------------------------------------------------------ path lines
// the clamp's run along the machine, and the cover's run in from the tray
const railMat = new THREE.LineDashedMaterial({ color: pal.rail, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.55 });
const trailMat = new THREE.LineBasicMaterial({ color: pal.trail, transparent: true });
const trail2Mat = new THREE.LineBasicMaterial({ color: pal.trail2, transparent: true });
const dashed = (pts) => {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), railMat);
  l.computeLineDistances();
  scene.add(l);
};
const RUN_Y = SPINE_Y - 0.06;
for (const z of [-(BT / 2 + 0.14), BT / 2 + 0.14]) dashed([V(XL, RUN_Y, z), V(XD, RUN_Y, z)]);
dashed([V(XN, COVER_Y - 0.004, CZ0), V(XN, COVER_Y - 0.004, 0)]);
const trails = [-(BT / 2 + 0.14), BT / 2 + 0.14].map((z) => {
  const g = new THREE.BufferGeometry().setFromPoints([V(XL, RUN_Y, z), V(XL, RUN_Y, z)]);
  const l = new THREE.Line(g, trailMat);
  l.frustumCulled = false;
  scene.add(l);
  return l;
});
const coverTrail = (() => {
  const g = new THREE.BufferGeometry().setFromPoints([V(XN, COVER_Y, CZ0), V(XN, COVER_Y, CZ0)]);
  const l = new THREE.Line(g, trail2Mat);
  l.frustumCulled = false;
  scene.add(l);
  return l;
})();

// ------------------------------------------------------------------ milling dust
const CHIPS = 180;
const chipGeo = new THREE.BufferGeometry();
chipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CHIPS * 3), 3));
const chipMat = new THREE.PointsMaterial({ color: pal.stack, size: 0.035, transparent: true, opacity: 0, depthWrite: false });
const chips = new THREE.Points(chipGeo, chipMat);
chips.frustumCulled = false;
scene.add(chips);
const seed = (i, k) => { const s = Math.sin(i * 91.7 + k * 47.3) * 24634.6345; return s - Math.floor(s); };

// ------------------------------------------------------------------ state
function computeState(t) {
  const k = {};
  for (const n in K) k[n] = keyed(K[n], t);
  const unmilled = clamp(XM - k.bx + SPL / 2, 0, SPL);
  const glued = clamp(k.bx + SPL / 2 - XG, 0, SPL);
  const sideGlued = clamp(k.bx + SPL / 2 - XSG, 0, SPL);
  // side jaws sweep in from outside the cover; the wing rides up over their top edge
  const d = lerp(JAW_D0, 0, k.fold);
  const a1 = Math.atan2(H1, d) * clamp((WL - d) / 0.4);
  return {
    t, ch: chapters.at(t), ...k, unmilled, glued, sideGlued,
    carriageX: lerp(k.bx, XL, k.ret),
    jawD: lerp(d, JAW_D0, k.jawOut),
    a1,
    milling: unmilled > 0 && unmilled < SPL ? 1 : 0,
  };
}

// ------------------------------------------------------------------ book pose
const pivotLocal = V(0, -GT, -HZ);
const bookQ = new THREE.Quaternion(), tmp = new THREE.Vector3();
function updateBook(st, time) {
  const r = book.root;
  const vib = st.jog * 0.012 * Math.sin(time * 90);
  if (st.drop <= 0) {
    r.position.set(st.bx, SPINE_Y + st.by, st.bz);
    r.rotation.set(0, 0, 0);
  } else {
    // tip backwards about the back-bottom edge while falling onto the belt
    const w = V(lerp(XD, XOUT, st.belt), lerp(SPINE_Y - GT, DELIV_Y, st.drop), -HZ);
    r.rotation.set(-st.drop * (Math.PI / 2), 0, 0);
    bookQ.setFromEuler(r.rotation);
    tmp.copy(pivotLocal).applyQuaternion(bookQ);
    r.position.copy(w.sub(tmp));
  }
  const local = st.t < T_ATTACH ? V(XN, COVER_Y + LIFT * st.lift, st.cz).sub(r.position) : null;
  book.write({
    jitter: st.jitter, vib, unmilled: st.unmilled, glued: st.glued, sideGlued: st.sideGlued,
    cover: { local, fold: st.a1, flare: st.flare * FLARE, scored: st.scored },
  });
  pb.jog.position.y = vib;
}

// ------------------------------------------------------------------ mechanics
function updateMechanics(st, time) {
  pb.carriage.position.x = st.carriageX;
  for (const j of pb.jaws) j.position.z = j.userData.sgn * (HZ + 0.001 + st.gap);
  pb.mill.rotation.y = time * 9;
  for (const r of pb.rotors) {
    const d = r.src === 'belt' ? st.belt * (XOUT - XD) : r.src === 'cover' ? CZ0 - st.cz : time * r.rate;
    r.obj.rotation.z = (-d / (r.src === 'time' ? 1 : r.r)) * r.sign;
  }
  for (const g of pb.glue.side) g.rotation.y = time * 6;
  // nipping station
  pb.nip.table.position.y = LIFT * st.lift;
  for (const s of pb.nip.scores) s.position.y = COVER_Y - 0.002 + 0.02 * st.crease;
  for (const j of pb.nip.jaws) {
    j.position.y = COVER_Y - 0.002 - (H1 + 0.03) * (1 - st.jawUp);
    j.position.z = j.userData.sgn * (HZ + 0.002 + st.jawD);
  }
}

// milling dust: a stateless spray (phase from the clock) while the cutter is under the spine
function updateChips(st, time) {
  const on = st.milling;
  chipMat.opacity += ((on ? 0.9 : 0) - chipMat.opacity) * 0.2;
  chips.visible = chipMat.opacity > 0.01;
  if (!chips.visible) return;
  const a = chipGeo.attributes.position.array;
  for (let i = 0; i < CHIPS; i++) {
    const ph = (time * 1.6 + seed(i, 1)) % 1;
    const ang = seed(i, 2) * Math.PI * 2;
    const sp = 0.6 + seed(i, 3) * 1.4;
    a[i * 3] = XM + (seed(i, 4) - 0.5) * 0.3 + Math.cos(ang) * sp * ph;
    a[i * 3 + 1] = SPINE_Y - 0.03 - ph * ph * 1.6 + seed(i, 5) * 0.2 * ph;
    a[i * 3 + 2] = (seed(i, 6) - 0.5) * BT + Math.sin(ang) * sp * ph;
  }
  chipGeo.attributes.position.needsUpdate = true;
}

function updateTrails(st) {
  const x = st.drop > 0 ? XD : st.bx;
  for (const tr of trails) {
    const p = tr.geometry.attributes.position;
    p.setX(1, x);
    p.needsUpdate = true;
  }
  const c = coverTrail.geometry.attributes.position;
  c.setZ(1, st.cz);
  c.needsUpdate = true;
}

// ------------------------------------------------------------------ intro reveal
function updateReveal(r) {
  // the lid lifts (and stays up, as in the photo); the upper housing's skins fade
  const k = ease((r - 0.06) / 0.4);
  const solid = 1 - ease((r - 0.62) / 0.33);
  for (const d of pb.doors) {
    d.g.rotation.x = -k * 1.85;
    const a = lerp(1, 0.12, k);
    d.mats.solid.opacity = a;
    d.mats.solid.depthWrite = a > 0.6;
    d.mats.line.opacity = 0.75 * lerp(1, 0.45, k);
  }
  const m = pb.mats;
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
const CAMS = [
  () => ({ p: V(2, 21, 37), t: V(10.5, 7.8, 1.5) }),                                  // overview
  () => ({ p: V(XL + 5.8, SPINE_Y + 4.6, 12.5), t: V(XL + 0.6, SPINE_Y + 1.0, 0.4) }),  // load
  () => ({ p: V(XM + 3.6, SPINE_Y - 0.1, 9.2), t: V(XM + 0.6, SPINE_Y + 0.3, 0) }),    // milling
  () => ({ p: V(XG + 4.2, SPINE_Y + 0.1, 8.8), t: V(XG + 1.0, SPINE_Y + 0.1, 0) }),    // glue
  () => ({ p: V(XN + 4.5, SPINE_Y + 5.2, 15), t: V(XN, COVER_Y + 0.2, 3.4) }),          // cover feed
  () => ({ p: V(XN + 7.2, SPINE_Y + 1.9, 1.6), t: V(XN, SPINE_Y + 0.6, 0) }),           // nip, along the spine
  () => ({ p: V(XD + 5.5, SPINE_Y + 4.2, 9.5), t: V(XD + 1.2, DELIV_Y + 0.6, -0.6) }),  // delivery
  () => ({ p: V(XOUT + 6.5, DELIV_Y + 7, 4.5), t: V(XOUT - 1.2, DELIV_Y + 0.3, -1.1) }), // summary
];
const rig = createCameraRig(camera, { CH, CAMS, tEnd: T_END });
function updateCamera(st, dt) {
  rig(st.t, st.ch, dt);
  const sh = st.ch === 0 || st.ch === CH_SUMMARY ? 0.5 : 0.2;
  pb.mats.shell.opacity += (sh - pb.mats.shell.opacity) * 0.1;
  pb.mats.panel.opacity += (sh * 0.7 - pb.mats.panel.opacity) * 0.1;
}

// ------------------------------------------------------------------ HUD
const ro = { zone: $('#ro-zone'), clamp: $('#ro-clamp'), spine: $('#ro-spine'), cover: $('#ro-cover') };
const pct = (k) => `${Math.round(k * 100)}%`;
function zoneOf(st) {
  if (st.bz > 0.05 || st.by > 0.05) return 'OPERATOR';
  if (st.drop > 0) return st.belt >= 1 ? 'OUT TRAY' : 'DELIVERY';
  const x = st.bx;
  if (x < XM - SPL / 2) return 'LOAD + JOG';
  if (x < XM + SPL / 2) return 'MILLING';
  if (x < XG - SPL / 2) return 'TO GLUE POT';
  if (x < XSG + SPL / 2) return 'GLUE POT';
  if (x < XN - 0.01) return 'TO NIPPER';
  if (x <= XN + 0.01) return 'NIPPING STATION';
  return 'TO DELIVERY';
}
function clampOf(st) {
  if (st.ret > 0 && st.ret < 1) return 'RETURNING';
  if (st.gap < 0.005) return 'CLOSED';
  return st.gap > 0.29 ? 'OPEN' : st.t < 0.5 ? 'CLOSING' : 'OPENING';
}
function spineOf(st) {
  if (st.a1 > 0.01) return st.a1 > 1.55 ? 'SQUARE · BOUND' : 'COVERING';
  if (st.glued > 0) return st.glued < SPL ? `GLUING ${pct(st.glued / SPL)}` : 'GLUED';
  if (st.unmilled < SPL) return st.unmilled > 0 ? `MILLING ${pct(1 - st.unmilled / SPL)}` : 'MILLED';
  return st.jitter > 0.01 ? 'LOOSE' : 'JOGGED';
}
function coverOf(st) {
  if (st.a1 > 0.01) return st.a1 > 1.55 ? 'WRAPPED' : 'WRAPPING';
  if (st.lift > 0.01) return 'LIFTING';
  if (st.scored > 0.5) return 'SCORED';
  if (st.cz >= CZ0 - 0.01) return 'IN TRAY';
  return st.cz > 0.01 ? 'FEEDING' : 'IN POSITION';
}
let lastRO = '';
function updateHUD(st) {
  chapters.show(st.ch);
  const v = [zoneOf(st), clampOf(st), spineOf(st), coverOf(st)];
  const key = v.join('|');
  if (key === lastRO) return;
  lastRO = key;
  [ro.zone.textContent, ro.clamp.textContent, ro.spine.textContent, ro.cover.textContent] = v;
}

// ------------------------------------------------------------------ callouts
let cur = null;
const LABELS = [
  { t: 'CLAMP', s: 'travels along the rail', at: () => [cur.carriageX + 2.0, 11.7, -CAB.z + 0.9], d: [40, -40], ch: [0] },
  { t: 'MILLING CUTTER', at: [XM, SPINE_Y - 0.1, 0.75], d: [-40, 50], ch: [0, 2] },
  { t: 'GLUE POT', s: 'hot melt', at: [XG + 0.4, SPINE_Y - 0.4, 0.8], d: [40, 55], ch: [0] },
  { t: 'COVER FEED', at: [XN - SPL / 2 - 0.2, COVER_Y, 8.6], d: [-50, 40], ch: [0, 4] },
  { t: 'DELIVERY', at: [XOUT, DELIV_Y, 0.25], d: [40, 40], ch: [0] },
  { t: '1,940', cls: 'dim', at: [CAB.x1 / 2, 0, 11], d: [0, 14], ch: [0] },
  { t: '1,240', cls: 'dim', at: [-1.2, CAB.y1 / 2, CAB.z], d: [-16, 0], ch: [0] },

  { t: 'BOOK BLOCK', s: '200 leaves', at: () => [book.root.position.x + 1.2, book.root.position.y + BW, book.root.position.z + BT / 2], d: [40, -40], ch: [1] },
  { t: 'CLAMP JAWS', at: () => [cur.carriageX - 1.2, SPINE_Y + 1.1, HZ + cur.gap + 0.06], d: [-50, -30], ch: [1] },
  { t: 'JOGGER', s: 'vibrates the spine level', at: [XL + 1.2, SPINE_Y - 0.07, 0.4], d: [50, 40], ch: [1] },
  { t: 'STOP', at: [XL - SPL / 2 - 0.07, SPINE_Y + 0.3, 0.5], d: [-40, -40], ch: [1] },

  { t: 'MILLED SPINE', s: 'rough, every leaf exposed', at: () => [book.root.position.x + SPL / 2 - 0.2, SPINE_Y, BT / 2], d: [40, -45], ch: [2] },
  { t: 'DUST EXTRACTION', at: [XM + 1.2, SPINE_Y - 0.32, 0.25], d: [50, 30], ch: [2] },

  { t: 'GLUE ROLLER', at: [XG - 0.2, SPINE_Y - 0.4, 0.55], d: [-50, 40], ch: [3] },
  { t: 'SPINNER', s: 'wipes off the excess', at: [XG + 0.55, SPINE_Y - 0.1, 0.5], d: [20, 60], ch: [3] },
  { t: 'SIDE GLUE', at: [XSG, SPINE_Y + 0.05, HZ + 0.09], d: [40, -50], ch: [3] },
  { t: 'HOT-MELT FILM', at: () => [book.root.position.x + SPL / 2 - 0.1, SPINE_Y - GT, BT / 2], d: [-40, -55], ch: [3] },

  { t: 'COVER', s: 'printed side down', at: () => [XN + SPL / 2, COVER_Y, cur.cz + CW / 2 - 0.3], d: [50, 30], ch: [4] },
  { t: 'FEED ROLLERS', at: [XN - SPL / 2, COVER_Y + 0.9, CAB.z + 1.7], d: [-50, -30], ch: [4] },
  { t: 'CREASING BARS', at: [XN + SPL / 2 - 0.1, COVER_Y, HZ], d: [50, -40], ch: [4] },

  { t: 'NIPPING TABLE', at: () => [XN + 1.4, COVER_Y + LIFT * cur.lift - 0.05, 2.4], d: [-60, 30], ch: [5] },
  { t: 'SIDE JAWS', at: () => [XN + 1.5, COVER_Y + LIFT * cur.lift + 0.1, HZ + cur.jawD + 0.1], d: [-70, 20], ch: [5] },
  { t: 'SQUARE SPINE', at: [XN + SPL / 2, SPINE_Y - GT, 0], d: [70, 40], ch: [5] },

  { t: 'DELIVERY BELT', at: [XD - 1.3, DELIV_Y, -0.35], d: [-40, 40], ch: [6] },
  { t: 'CLAMP', s: 'back for the next block', at: () => [cur.carriageX, SPINE_Y + 1.2, 0.2], d: [-40, -50], ch: [6] },

  { t: 'PERFECT-BOUND BOOK', s: '400 pp · square spine', at: [XOUT, DELIV_Y + BT + 0.02, -0.2], d: [-40, -50], ch: [7] },
];
const updateLabels = createLabels(LABELS, camera);

// ------------------------------------------------------------------ minimap
// plan view from above: front of the machine at the bottom
const svgNS = 'http://www.w3.org/2000/svg';
const mm = $('#minimap');
mm.setAttribute('viewBox', '-0.8 -4.4 24.4 14.4');
mm.setAttribute('preserveAspectRatio', 'xMidYMid meet');
{
  const add = (tag, attrs) => {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.setAttribute('vector-effect', 'non-scaling-stroke');
    mm.appendChild(e);
    return e;
  };
  const hx = SPL / 2 + 0.25;
  add('rect', { x: 0.3, y: -CAB.z, width: CAB.x1 - 0.6, height: 2 * CAB.z, class: 'mm-module' });
  add('rect', { x: XN - hx, y: CAB.z, width: 2 * hx, height: CZ0 + CW / 2 + 0.3 - CAB.z, class: 'mm-module' });
  add('rect', { x: CAB.x1 - 0.2, y: -2.5, width: XOUT + SPL / 2 + 0.6 - CAB.x1, height: 2.75, class: 'mm-module' });
  add('circle', { cx: XM, cy: 0, r: 0.75, class: 'mm-belt' });
  add('rect', { x: XG - 0.7, y: -0.8, width: XSG + 0.45 - XG + 0.7, height: 1.6, class: 'mm-belt' });
  add('rect', { x: XN - 1.6, y: -2.45, width: 3.2, height: 4.9, class: 'mm-belt' });
  add('line', { x1: XL, y1: 0, x2: XD, y2: 0, class: 'mm-path' });
  add('line', { x1: XN, y1: CZ0, x2: XN, y2: 0, class: 'mm-path' });
  mm.trail = add('polyline', { points: '', class: 'mm-trail' });
  mm.cover = add('polygon', { points: '', class: 'mm-trail2' });
  mm.book = add('polygon', { points: '', class: 'mm-sheet' });
}
let mmKey = '';
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
function updateMinimap(st) {
  const bx = book.root.position.x;
  const key = `${bx.toFixed(2)}|${st.bz.toFixed(2)}|${st.cz.toFixed(2)}|${st.drop.toFixed(2)}|${st.t < T_ATTACH}`;
  if (key === mmKey) return;
  mmKey = key;
  const x = st.drop > 0 ? XD : st.bx;
  mm.trail.setAttribute('points', st.bx > XL + 0.01 ? `${XL},0 ${x.toFixed(2)},0` : '');
  const cx = st.drop > 0 ? lerp(XD, XOUT, st.belt) : st.bx;
  // standing in the clamp it's a thin strip; lying on its back it spreads towards the back
  const z0 = lerp(-BT / 2, -HZ - WL, st.drop) + st.bz, z1 = lerp(BT / 2, -HZ, st.drop) + st.bz;
  mm.book.setAttribute('points', rect(cx - SPL / 2, z0, cx + SPL / 2, z1));
  mm.cover.setAttribute('points', st.t < T_ATTACH ? rect(XN - SPL / 2, st.cz - CW / 2, XN + SPL / 2, st.cz + CW / 2) : '');
}

// ------------------------------------------------------------------ theme
function applyTheme(name) {
  pal = PALETTES[name];
  scene.background.set(pal.bg);
  bloom.enabled = pal.bloom;
  pb.setTheme(pal);
  book.setTheme(pal);
  railMat.color.set(pal.rail);
  trailMat.color.set(pal.trail);
  trail2Mat.color.set(pal.trail2);
  outlineMat.color.set(pal.outline);
  chipMat.color.set(pal.stack);
  coverMat.uniforms.uPaper.value.set(pal.paper);
  coverMat.uniforms.uGain.value = pal.paperGain;
}
bindTheme(applyTheme);

const solidOn = bindSolid();
let solidK = solidOn() ? 1 : 0;

// ------------------------------------------------------------------ loop
runLoop({
  intro: INTRO, tEnd: T_END, composer, playSeconds: 50,
  frame({ t, reveal, dt, time }) {
    const st = computeState(t);
    cur = st;
    updateReveal(reveal);
    updateBook(st, time);
    const solidTarget = solidOn() ? 1 : 0;
    solidK += (solidTarget - solidK) * (1 - Math.exp(-dt * 5));
    if (Math.abs(solidK - solidTarget) < 1e-3) solidK = solidTarget;
    pb.setSolid(solidK);
    updateMechanics(st, time);
    updateChips(st, time);
    updateTrails(st);
    updateCamera(st, dt);
    updateHUD(st);
    updateLabels(st.ch);
    updateMinimap(st);
  },
});
