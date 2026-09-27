import * as THREE from 'three';
import {
  createPlaten, SW, SH, YH, ZH, PY, PZ, YC, ZP, ZD, ZF, AO, R, HA, CUP, FW, STEP, FOIL_RUN, DIE,
} from './machine.js';
import { makeCardTextures, makeCardMaterial, makeFoilMaterial } from './card.js';
import { PALETTES, storedTheme } from '../theme.js';
import { createStage } from '../core/stage.js';
import {
  clamp, ease, lerp, keyed, $, createChapters, createCameraRig, createLabels, bindTheme, bindSolid, runLoop,
} from '../core/story.js';

let pal = PALETTES[storedTheme()];
const { renderer, scene, camera, composer, bloom } = createStage(pal);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

const pp = createPlaten(scene, pal);
const P = pp.P;

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const tex = makeCardTextures();
for (const t of Object.values(tex)) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
const outlineMat = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0.55 });

// ------------------------------------------------------------------ timeline
const K = {
  heat: [[0, 0], [0.09, 0], [0.165, 1]],
  thread: [[0, 0], [0.2, 0], [0.25, 1]],
  explode: [[0, 0], [0.245, 0], [0.27, 1], [0.3, 1], [0.315, 0]],
  // windmill swing (arm A from the feed pile): down to the platen, back, then
  // the other way so arm B comes to the platen, and back to the delivery
  w: [[0, 0], [0.355, 0], [0.44, -90], [0.465, -90], [0.495, 0], [0.785, 0], [0.815, 90], [0.845, 90], [0.895, 0], [0.955, 0], [1, -40]],
  // arm heights above the card plane: dip to pick up / put down
  armA: [[0, HA], [0.32, HA], [0.335, CUP + 0.004], [0.35, HA], [0.44, HA], [0.455, CUP + 0.004], [0.465, HA], [0.925, HA], [0.94, CUP + 0.004], [0.955, HA]],
  armB: [[0, HA], [0.815, HA], [0.83, CUP + 0.004], [0.845, HA], [0.895, HA], [0.91, CUP + 0.008], [0.925, HA]],
  // the clamshell closes, dwells under pressure, opens
  alpha: [[0, AO], [0.5, AO], [0.555, 0], [0.625, 0], [0.685, AO]],
  adv: [[0, 0], [0.7, 0], [0.76, 1]],
};
const T_END = 1.0;
const T_PICK = 0.335, T_PLACE = 0.455, T_HIT = 0.555, T_GRAB = 0.83, T_DROP = 0.91, T_NEXT = 0.94;

// ------------------------------------------------------------------ chapters
const CH = [
  {
    t0: 0, kicker: 'How it’s done', title: 'Hot foil blocking',
    body: 'Foil blocking presses a hot metal die through a ribbon of metallic foil, bonding the foil onto the sheet wherever the die is raised. This press is a converted letterpress platen, the classic windmill, which feeds, foils and delivers a card every couple of seconds. Scroll to look inside.',
    specs: [['Press', 'clamshell platen'], ['Sheet', 'up to 260 × 380 mm'], ['Die temperature', '100 – 130 °C'], ['Foil work', '~2,000 sheets / hour']],
  },
  {
    t0: 0.075, kicker: 'The die', title: 'A hot, mirror-image die',
    body: 'The artwork is etched into a magnesium plate so the parts to be foiled stand proud, reading backwards like a rubber stamp. It is locked onto a honeycomb base on the heated bed at the back of the press and brought up to temperature before the run starts.',
    specs: [['Die', 'etched magnesium'], ['Relief', '~1 mm'], ['Mounting', 'honeycomb base'], ['Set point', '120 °C']],
  },
  {
    t0: 0.185, kicker: 'The foil', title: 'A ribbon of metal on film',
    body: 'Foil is threaded from a reel on the left, across the face of the die a few millimetres clear of it, to draw rollers and a take-up reel on the right. It is a stack of coatings on a clear polyester film: a wax release layer, a coloured lacquer, a trace of vacuum-deposited aluminium and a heat-activated adhesive facing the card. Gold is yellow lacquer over silver aluminium.',
    specs: [['Carrier', '12 µm polyester'], ['Metal', 'vacuum aluminium'], ['Colour', 'tinted lacquer'], ['Adhesive', 'heat activated']],
  },
  {
    t0: 0.315, kicker: 'Feeding', title: 'Picked up by the windmill',
    body: 'Two gripper arms swing like a windmill between the feed pile, the platen and the delivery. Suction cups lift the top card off the pile on the right and carry it a quarter turn round onto the open platen, dropping it against the lays so every card lands in exactly the same spot under the die.',
    specs: [['Feed', 'windmill gripper arms'], ['Pick-up', 'suction'], ['Registration', 'bottom + side lays'], ['Card', '200 × 140 mm, 350 gsm']],
  },
  {
    t0: 0.475, kicker: 'Impression', title: 'Heat and pressure',
    body: 'The platen swings shut like a clamshell, pressing card and foil hard against the hot die. For a split second the heat activates the adhesive and softens the release layer, but only where the die is raised. Everywhere else the foil barely touches the card.',
    specs: [['Dwell', 'a fraction of a second'], ['Die', '120 °C'], ['Contact', 'raised areas only'], ['Pressure', 'several tonnes']],
  },
  {
    t0: 0.625, kicker: 'Release', title: 'Stripped clean',
    body: 'As the platen opens, the card peels away from the carrier film. Wherever the die touched, the metal and colour stay bonded to the card; everywhere else they stay on the film. The draw rollers then step the foil on by one image, so fresh foil sits over the die and the spent window heads for the take-up reel.',
    specs: [['Transfer', 'die areas only'], ['Foil step', '180 mm'], ['Waste', 'spent film, rewound'], ['Setting', 'instant, no drying']],
  },
  {
    t0: 0.775, kicker: 'Delivery', title: 'Out to the pile',
    body: 'The second arm swings in, lifts the finished card off the platen and carries it round to the delivery pile on the left, while the first arm heads back to the feed pile for the next card. On a running press this whole cycle repeats every couple of seconds.',
    specs: [['Delivery', 'left-hand pile'], ['Arms', '2, working alternately'], ['Cycle', '~2 s']],
  },
  {
    t0: 0.935, kicker: 'Summary', title: 'A foil-blocked card',
    body: 'A hot die, a ribbon of foil and a hard press: the result is a crisp, bright metallic image that sits right in the surface of the card, something ink alone can’t match. Foil comes in golds, silvers, colours, matt and holographic, and is often combined with embossing.',
    specs: [['Process', 'hot foil blocking'], ['Foils', 'metallic, pigment, holo'], ['Often with', 'embossing'], ['Stock', 'board, paper, leather']],
  },
];
const CH_SUMMARY = CH.length - 1;
const INTRO = 0.1;
const chapters = createChapters({ CH, tEnd: T_END, intro: INTRO });

// ------------------------------------------------------------------ die face
{
  const x0 = (0.5 - DIE.u0) * SW, x1 = (0.5 - DIE.u1) * SW;
  const y0 = YC + (DIE.v0 - 0.5) * SH, y1 = YC + (DIE.v1 - 0.5) * SH;
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), y1 - y0).translate(0, (y0 + y1) / 2, ZD + 0.001);
  // card UV at each point of the bed: the die is the card's mirror image
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 - p.getX(i) / SW, 0.5 + (p.getY(i) - YC) / SH);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex.die }));
  scene.add(m);
}

// ------------------------------------------------------------------ cards
const cardGeo = new THREE.PlaneGeometry(SW, SH);
const cardEdge = new THREE.EdgesGeometry(cardGeo);
const cardMats = [];
function makeCard(parent, foiled) {
  const mat = makeCardMaterial(tex, pal, foiled);
  cardMats.push(mat);
  const m = new THREE.Mesh(cardGeo, mat);
  m.add(new THREE.LineSegments(cardEdge, outlineMat));
  m.renderOrder = 5;
  parent.add(m);
  return m;
}
const card = makeCard(pp.plane, 0);
// the next card on the feed pile, and the last one delivered
const [nextCard] = [[-1, 0, -0.002], [1, 1, 0.002]].map(([s, foiled, z]) => {
  const c = makeCard(pp.plane, foiled);
  c.position.set(s * R, R, z);
  c.rotation.z = (s * Math.PI) / 2;
  return c;
});

// ------------------------------------------------------------------ foil ribbon
// A strip along the run in (x, z), extruded ±FW/2 about the die centre in Y.
const foilMat = makeFoilMaterial(tex);
const RUN_N = 7;
const foilGeo = new THREE.BufferGeometry();
foilGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RUN_N * 2 * 3), 3));
foilGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(RUN_N * 2 * 3), 3));
foilGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(RUN_N * 2 * 2), 2));
{
  const idx = [];
  for (let i = 0; i < RUN_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  foilGeo.setIndex(idx);
}
const foil = new THREE.Mesh(foilGeo, foilMat);
foil.frustumCulled = false;
foil.renderOrder = 4;
scene.add(foil);

function foilRun(zm) {
  const { x0, guide, press, draw, x1 } = FOIL_RUN;
  const xs = [x0, -guide, -press, press, guide, draw, x1];
  const zs = [ZF, ZF, zm, zm, ZF, ZF, ZF];
  const s = [0];
  for (let i = 1; i < RUN_N; i++) s.push(s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
  // run position of x = 0 (the die centre)
  const s0 = s[2] + press;
  return { xs, zs, s, s0 };
}
const FOIL_LEN = foilRun(ZF).s.at(-1);
function writeFoil(run) {
  const p = foilGeo.attributes.position, n = foilGeo.attributes.normal, uv = foilGeo.attributes.uv;
  const { xs, zs, s } = run;
  for (let i = 0; i < RUN_N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(RUN_N - 1, i + 1);
    const dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz);
    for (let j = 0; j < 2; j++) {
      const y = (j ? 1 : -1) * FW / 2;
      p.setXYZ(i * 2 + j, xs[i], YC + y, zs[i]);
      n.setXYZ(i * 2 + j, -dz / l, 0, dx / l);
      uv.setXY(i * 2 + j, s[i], y);
    }
  }
  p.needsUpdate = n.needsUpdate = uv.needsUpdate = true;
}

// ------------------------------------------------------------------ foil layers (exploded)
const LAYERS = [
  ['POLYESTER CARRIER', 'clear film, 12 µm', '#cfe2f0', 0.35],
  ['RELEASE LAYER', 'wax, lets go when hot', '#efe6c8', 0.45],
  ['COLOUR LACQUER', 'the gold tint', '#e9b43c', 0.7],
  ['ALUMINIUM', 'vacuum deposited', '#c8cdd3', 0.92],
  ['ADHESIVE', 'heat-activated size', '#f1ead6', 0.55],
];
const LAYER_AT = V(-1.3, YC - 0.2, ZF + 0.02), LAYER_DIR = V(0, 1, 0.35).normalize();
const layerObjs = LAYERS.map(([, , c, o], i) => {
  const g = new THREE.PlaneGeometry(0.8, 0.8);
  const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(g, mat);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0 }));
  m.add(edge);
  m.renderOrder = 6 + i;
  m.userData = { o, mat, edge };
  scene.add(m);
  return m;
});
// fanned out upwards and towards the viewer, carrier (die side) at the bottom
const layerPos = (i, e) => LAYER_AT.clone().addScaledVector(V(-0.3, 0.2, 1), 0.9 * e).addScaledVector(LAYER_DIR, e * i * 0.3);

// ------------------------------------------------------------------ state
const tipOf = (beta) => [R * Math.cos(beta), R + R * Math.sin(beta)];
// card placement: in the windmill plane (x, y, off along the face normal, turn γ) or on the platen
function cardPlace(k, t) {
  const w = k.w * DEG;
  const A = { beta: Math.PI - w, gamma: -Math.PI / 2 - w };
  const B = { beta: -w, gamma: Math.PI / 2 - w };
  const on = (arm, off) => { const [x, y] = tipOf(arm.beta); return { on: 'plane', x, y, off, gamma: arm.gamma }; };
  if (t < T_PICK) return on(A, 0.004);
  if (t < T_PLACE) return on(A, k.armA - CUP);
  if (t < T_GRAB) return { on: 'platen' };
  if (t < T_DROP) return on(B, k.armB - CUP);
  return on(B, 0.008);
}
// platen-frame point → world, for any opening angle
const platenPt = (y, z, a, x = 0) => V(x, YH + y * Math.cos(a) - z * Math.sin(a), ZH + y * Math.sin(a) + z * Math.cos(a));
const cardCentre = (pl, a) => (pl.on === 'platen' ? platenPt(PY, PZ - 0.004, a) : P.at(pl.x, pl.y, pl.off));

function computeState(t) {
  const k = {};
  for (const n in K) k[n] = keyed(K[n], t);
  // the foil is pushed back onto the die as the platen face reaches it
  const faceZ = platenPt(PY, PZ, k.alpha).z;
  const zm = Math.min(ZF, faceZ - 0.012);
  return { t, ch: chapters.at(t), ...k, zm, stamped: t >= T_HIT, place: cardPlace(k, t) };
}

// ------------------------------------------------------------------ updates
function updateCard(st) {
  const pl = st.place;
  if (pl.on === 'platen') {
    if (card.parent !== pp.platen) pp.platen.add(card);
    card.position.set(0, PY, PZ - 0.004);
    card.rotation.set(0, Math.PI, 0);
  } else {
    if (card.parent !== pp.plane) pp.plane.add(card);
    card.position.set(pl.x, pl.y, pl.off);
    card.rotation.set(0, 0, pl.gamma);
  }
  card.material.uniforms.uFoil.value = st.stamped ? 1 : 0;
  // …and arm A is already away with the next card
  const w = st.w * DEG, carried = st.t >= T_NEXT;
  const [x, y] = tipOf(Math.PI - w);
  nextCard.position.set(x, y, carried ? st.armA - CUP : -0.002);
  nextCard.rotation.z = -Math.PI / 2 - w;
}

function updateMechanics(st, time) {
  pp.platen.rotation.x = st.alpha;
  const w = st.w * DEG;
  pp.arms[0].rotation.z = Math.PI - w;
  pp.arms[0].position.z = st.armA;
  pp.arms[1].rotation.z = -w;
  pp.arms[1].position.z = st.armB;
  const adv = st.adv * STEP;
  for (const r of pp.reels) r.obj.rotation.y = r.k * adv;
  pp.flywheel.rotation.x = -st.t * 60;
  // element glows with the heat, a touch brighter while the die is working
  pp.bed.heater.opacity = 0.15 + 0.75 * st.heat;

  const run = foilRun(st.zm);
  writeFoil(run);
  const u = foilMat.uniforms;
  u.uHit.value = run.s0;
  u.uAdv.value = adv;
  u.uStamped.value = st.stamped ? 1 : 0;
  u.uThread.value = st.thread >= 1 ? 1e3 : st.thread * FOIL_LEN;
  foil.visible = st.thread > 0;

  layerObjs.forEach((m, i) => {
    m.position.copy(layerPos(i, st.explode));
    const a = clamp(st.explode * 1.4);
    m.userData.mat.opacity = m.userData.o * a;
    m.userData.edge.material.opacity = 0.9 * a;
    m.visible = a > 0.01;
  });
}

// ------------------------------------------------------------------ intro reveal
function updateReveal(r) {
  // the cast frame's skins fade away to leave the line work
  const solid = 1 - ease((r - 0.1) / 0.7);
  for (const s of pp.mats.solids) {
    s.opacity = solid;
    s.depthWrite = solid > 0.5;
    s.visible = solid > 0.001;
  }
}

// ------------------------------------------------------------------ camera
const FEED = P.at(-R, R), DELIV = P.at(R, R), HUB = P.at(0, R, HA);
const CAMS = [
  () => ({ p: V(12, 16.5, 25), t: V(0, 8.4, 0.5) }),                    // overview
  () => ({ p: V(-3.2, 12.6, 5.2), t: V(0, YC, -1.1) }),                 // die
  () => ({ p: V(-6.4, 12.4, 4.6), t: V(-1.5, YC + 0.1, -0.5) }),        // foil
  () => ({ p: V(1.5, 24.5, 11), t: V(0.3, 10.0, 3.2) }),                // feeding, down onto the windmill
  () => ({ p: V(12.5, 12, 2.5), t: V(0, 9.6, 0) }),                     // impression, side on
  () => ({ p: V(-2.5, 16.5, 9.5), t: V(0.3, 9.7, 0.6) }),               // release
  () => ({ p: V(-8, 15.8, 11.5), t: V(-2.0, 10.4, 3.4) }),              // delivery
  () => ({ p: DELIV.clone().add(V(-2.6, 3.0, 0.5)), t: DELIV.clone() }), // summary: text reads along +X
];
const rig = createCameraRig(camera, { CH, CAMS, tEnd: T_END });
function updateCamera(st, dt) {
  rig(st.t, st.ch, dt);
  const sh = st.ch === 0 || st.ch === CH_SUMMARY ? 0.5 : 0.22;
  pp.mats.shell.opacity += (sh - pp.mats.shell.opacity) * 0.1;
  pp.mats.panel.opacity += (sh * 0.7 - pp.mats.panel.opacity) * 0.1;
}

// ------------------------------------------------------------------ HUD
const ro = { platen: $('#ro-platen'), die: $('#ro-die'), foil: $('#ro-foil'), card: $('#ro-card') };
function platenOf(st) {
  if (st.alpha >= AO - 0.005) return 'OPEN';
  if (st.alpha < 0.002) return 'IMPRESSION';
  return st.t < T_HIT ? 'CLOSING' : 'OPENING';
}
function foilOf(st) {
  if (st.thread <= 0) return 'NOT THREADED';
  if (st.thread < 1) return 'THREADING';
  if (!st.stamped) return st.zm < ZF - 0.001 ? 'PRESSED' : 'READY';
  if (st.alpha < 0.002) return 'TRANSFERRING';
  if (st.adv > 0) return st.adv < 1 ? 'ADVANCING' : 'STEPPED 180 mm';
  return 'STRIPPED';
}
function cardOf(st) {
  const t = st.t;
  if (t < T_PICK) return 'ON FEED PILE';
  if (t < T_PLACE) return 'FEEDING';
  if (t < T_GRAB) return !st.stamped ? 'ON THE LAYS' : st.alpha < 0.002 ? 'UNDER PRESSURE' : 'FOILED';
  if (t < T_DROP) return 'DELIVERING';
  return 'DELIVERED';
}
let lastRO = '';
function updateHUD(st) {
  chapters.show(st.ch);
  const v = [platenOf(st), `${Math.round(lerp(20, 120, st.heat))} °C`, foilOf(st), cardOf(st)];
  const key = v.join('|');
  if (key === lastRO) return;
  lastRO = key;
  [ro.platen.textContent, ro.die.textContent, ro.foil.textContent, ro.card.textContent] = v;
}

// ------------------------------------------------------------------ callouts
let cur = null;
const armTip = (i, dz = 0) => {
  const w = cur.w * DEG;
  const [x, y] = tipOf(i ? -w : Math.PI - w);
  return P.at(x, y, (i ? cur.armB : cur.armA) + dz).toArray();
};
const cardAt = () => cardCentre(cur.place, cur.alpha).toArray();
const LABELS = [
  { t: 'HEATED BED', s: 'die + honeycomb base', at: [-1.6, YC + 1.1, -1.4], d: [-50, -50], ch: [0] },
  { t: 'PLATEN', s: 'hinged clamshell', at: () => platenPt(PY + 0.6, PZ + 0.2, cur.alpha, -1.7).toArray(), d: [-40, 60], ch: [0] },
  { t: 'WINDMILL', s: 'two gripper arms', at: HUB.toArray(), d: [30, -60], ch: [0] },
  { t: 'FEED PILE', at: FEED.toArray(), d: [50, 30], ch: [0] },
  { t: 'DELIVERY', at: DELIV.toArray(), d: [-50, 30], ch: [0] },
  { t: 'FLYWHEEL', at: [2.8, 8.8, -1.6], d: [50, -30], ch: [0] },

  { t: 'DIE', s: 'raised areas, reading backwards', at: [0.3, YC + 0.2, ZD], d: [60, -60], ch: [1] },
  { t: 'HONEYCOMB BASE', at: [-1.35, YC - 0.9, ZD - 0.1], d: [-50, 40], ch: [1] },
  { t: 'HEATER', s: 'inside the bed', at: [1.2, YC + 1.05, -1.3], d: [50, -40], ch: [1] },
  { t: 'TEMPERATURE CONTROL', at: [-1.65, 13.4, -2.0], d: [-40, -40], ch: [1] },

  { t: 'FOIL REEL', at: [FOIL_RUN.x0, YC + FW / 2, ZF + 0.4], d: [-50, -40], ch: [2] },
  { t: 'GUIDE ROLLER', at: [FOIL_RUN.guide, YC - FW / 2 - 0.05, ZF - 0.05], d: [40, 50], ch: [2] },
  { t: 'DRAW ROLLERS', s: 'step the foil on', at: [FOIL_RUN.draw, YC + FW / 2 + 0.3, ZF], d: [40, -40], ch: [2, 5] },
  { t: 'TAKE-UP REEL', at: [FOIL_RUN.x1, YC - FW / 2, ZF + 0.2], d: [50, 30], ch: [2] },
  ...LAYERS.map(([t, s], i) => ({ t, s, at: () => layerPos(i, cur.explode).add(V(-0.4, 0.4, 0)).toArray(), d: [-50, 0], ch: [2] })),

  { t: 'SUCTION CUPS', at: () => armTip(0, -CUP / 2), d: [50, -40], ch: [3] },
  { t: 'FEED PILE', at: FEED.toArray(), d: [60, 40], ch: [3] },
  { t: 'LAYS', s: 'bottom + side stops', at: () => platenPt(PY - SH / 2 - 0.04, PZ, cur.alpha, 0.55).toArray(), d: [60, 40], ch: [3] },
  { t: 'CARD', s: '350 gsm, printed', at: cardAt, d: [-60, -40], ch: [3] },

  { t: 'PLATEN', s: 'swings shut', at: () => platenPt(PY + 1.55, PZ + 0.22, cur.alpha, 1.7).toArray(), d: [50, -40], ch: [4] },
  { t: 'HOT DIE', at: [0, YC - 0.3, ZD - 0.05], d: [-40, 60], ch: [4] },
  { t: 'FOIL', s: 'squeezed between them', at: [-1.5, YC + FW / 2, ZF], d: [-50, -40], ch: [4] },
  { t: 'HINGE', at: [1.95, YH, ZH], d: [50, 30], ch: [4] },

  { t: 'FOILED CARD', at: cardAt, d: [60, 40], ch: [5] },
  { t: 'SPENT FOIL', s: 'the die’s image, stripped out', at: () => [cur.adv * STEP - 0.3, YC + 0.25, ZF], d: [-60, -50], ch: [5] },

  { t: 'SECOND ARM', at: () => armTip(1), d: [-50, -40], ch: [6] },
  { t: 'DELIVERY PILE', at: DELIV.toArray(), d: [-50, 40], ch: [6] },

  { t: 'FOIL-BLOCKED CARD', s: 'gold on navy board', at: P.at(R - SH / 2, R, 0.01).toArray(), d: [-50, -40], ch: [7] },
];
const updateLabels = createLabels(LABELS, camera);

// ------------------------------------------------------------------ minimap
// front elevation (X right, Y up): boards, bed, foil run, platen and the card
const svgNS = 'http://www.w3.org/2000/svg';
const mm = $('#minimap');
mm.setAttribute('viewBox', '-5.4 -12.9 10.8 4.7');
mm.setAttribute('preserveAspectRatio', 'xMidYMid meet');
const pts = (arr) => arr.map((p) => `${p.x.toFixed(2)},${(-p.y).toFixed(2)}`).join(' ');
{
  const add = (tag, attrs) => {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.setAttribute('vector-effect', 'non-scaling-stroke');
    mm.appendChild(e);
    return e;
  };
  add('rect', { x: -2.35, y: -13.5, width: 4.7, height: 5.1, class: 'mm-module' });
  for (const s of [-1, 1]) {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => P.at(s * R + a * (SH / 2 + 0.2), R + b * (SW / 2 + 0.25)));
    add('polygon', { points: pts(c), class: 'mm-module' });
  }
  add('line', { x1: FOIL_RUN.x0, y1: -YC, x2: FOIL_RUN.x1, y2: -YC, class: 'mm-path' });
  for (const [x, r] of [[FOIL_RUN.x0, 0.4], [FOIL_RUN.x1, 0.2]]) add('rect', { x: x - r, y: -YC - FW / 2, width: 2 * r, height: FW, class: 'mm-belt' });
  mm.platen = add('polygon', { points: '', class: 'mm-belt' });
  mm.trail = add('polyline', { points: '', class: 'mm-trail' });
  mm.spent = add('rect', { x: 0, y: -YC - 0.3, width: 1.6, height: 0.6, class: 'mm-trail2' });
  mm.card = add('polygon', { points: '', class: 'mm-sheet' });
}
// the card's route, sampled once
const ROUTE = [];
for (let i = 0; i <= 300; i++) {
  const t = i / 300;
  const k = {};
  for (const n in K) k[n] = keyed(K[n], t);
  ROUTE.push([t, cardCentre(cardPlace(k, t), k.alpha)]);
}
let mmKey = '';
const corners = [[-SW / 2, -SH / 2], [SW / 2, -SH / 2], [SW / 2, SH / 2], [-SW / 2, SH / 2]].map(([x, y]) => V(x, y, 0));
function updateMinimap(st) {
  const key = `${st.t.toFixed(4)}`;
  if (key === mmKey) return;
  mmKey = key;
  const route = ROUTE.filter(([t]) => t <= st.t).map(([, p]) => p);
  route.push(cardCentre(st.place, st.alpha));
  mm.trail.setAttribute('points', pts(route));
  card.updateWorldMatrix(true, false);
  mm.card.setAttribute('points', pts(corners.map((c) => c.clone().applyMatrix4(card.matrixWorld))));
  const a = st.alpha;
  mm.platen.setAttribute('points', pts([[-1.7, PY - 1.55], [1.7, PY - 1.55], [1.7, PY + 1.55], [-1.7, PY + 1.55]].map(([x, y]) => platenPt(y, PZ, a, x))));
  mm.spent.style.display = st.stamped ? '' : 'none';
  mm.spent.setAttribute('x', (st.adv * STEP - 0.8).toFixed(2));
}

// ------------------------------------------------------------------ theme
function applyTheme(name) {
  pal = PALETTES[name];
  scene.background.set(pal.bg);
  bloom.enabled = pal.bloom;
  pp.setTheme(pal);
  outlineMat.color.set(pal.outline);
  for (const m of cardMats) {
    m.uniforms.uPaper.value.set(pal.paper);
    m.uniforms.uGain.value = pal.paperGain;
  }
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
    const solidTarget = solidOn() ? 1 : 0;
    solidK += (solidTarget - solidK) * (1 - Math.exp(-dt * 5));
    if (Math.abs(solidK - solidTarget) < 1e-3) solidK = solidTarget;
    pp.setSolid(solidK);
    updateMechanics(st, time);
    updateCard(st);
    updateCamera(st, dt);
    updateHUD(st);
    updateLabels(st.ch);
    updateMinimap(st);
  },
});
