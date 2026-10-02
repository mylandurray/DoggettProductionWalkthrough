// Wireframe model of a hand-fed booklet-making line, after Doggett's Morgana
// BM350 with its SQF squarefold and FTR face-trimmer modules. The set is laid
// on the feed table on top of the booklet maker, drawn in through a slot and
// dropped down a near-vertical pocket onto a stop. Two stitch heads staple it
// from the side, the stop drops it to the fold line and a blade pushes its
// middle into the fold rollers. The booklet then travels flat, spine first,
// through the squarefold and the trimmer and out onto the belt delivery.
// Units: 1 = 100 mm. X = length (feed → delivery), Y = up, Z = depth (+ = front).
// The model is built feeding towards +X; the page mirrors it so sets are fed
// from the right, as on Doggett's machine.
import * as THREE from 'three';
import { PathBuilder } from '../path.js';
import { Batch, SOLID, lm, solidPart, rollerObj } from '../core/batch.js';
import { PALETTES } from '../theme.js';

export const SL = 4.2;       // A3 sheet length along the feed (420 mm)
export const SW = 2.97;      // sheet width across the machine (297 mm)
export const NS = 6;         // sheets in the set → 24 pages
export const TH = 0.025;     // drawn sheet spacing (2.5 mm, ~25× real 80 gsm)
export const R_OUT = (NS - 0.5) * TH; // spine outer face ahead of the fold line
export const STAPLE_Z = [-0.74, 0.74];
// modules: booklet maker (810 × 752 × 1010 mm), squarefold, trimmer
export const MODS = { bm: [0, 8.1], sqf: [8.1, 12.6], trm: [12.6, 18.6] };
export const CAB = { x0: 0, x1: 18.6, y1: 10.1, z: 3.76 };
export const DECK_Y = CAB.y1 + 0.25; // feed table surface on top of the booklet maker
export const X_DROP = 5.6;   // the vertical stitch / fold pocket
export const YS = 7.2;       // set centre at the stitch heads
export const YF = 5.4;       // fold line, then the booklet's flat path height
export const SQF_X = 11.2;   // squarefold spine stop
export const TRIM_X = 17.6;  // trimmer book stop (spine)
export const TRIM_KEEP = 1.8; // booklet depth left after the face trim (from the spine)
export const X_KNIFE = TRIM_X - R_OUT - 0.01 - TRIM_KEEP;

// ---------------------------------------------------------------- paths
// T: the feed table on top of the booklet maker, then down through the slot
// into the pocket. The set's centre moves along it.
// P: the spine's route once folded: out of the fold rollers and flat through
// the squarefold and trimmer, then onto the belt delivery.
export function buildPaths() {
  const T = new PathBuilder(-0.2, DECK_Y, 0).toX(X_DROP - 0.6).arc(0.6, -90).toY(2.4).build();
  const P = new PathBuilder(X_DROP, YF, 0)
    .mark('slot')
    .toX(X_DROP + 0.75).mark('nip')
    .toX(SQF_X).mark('sqf')
    .toX(TRIM_X).mark('trim')
    .toX(CAB.x1 + 0.1).mark('exit')
    .arc(2.0, -4)
    .line(4.0)
    .build();
  return { T, P, TABLE_Y: DECK_Y };
}

// ---------------------------------------------------------------- build
export function createBookletMaker(scene, pal = PALETTES.light) {
  const { T, P } = buildPaths();
  const root = new THREE.Group();
  scene.add(root);

  const LINE_MATS = {
    shell: 0.5, panel: 0.38, mech: 0.78, mechDim: 0.5, guide: 0.42, stack: 0.55, grid: 1, gridMajor: 1,
    dim: 0.75, sensor: 0.9, belt: 0.7, beltCross: 0.55,
  };
  const mats = {};
  for (const k in LINE_MATS) mats[k] = lm(pal[k], LINE_MATS[k]);
  const fillMat = new THREE.MeshBasicMaterial({ color: pal.fill, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const solidMat = (color, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  mats.solids = pal.solids.map((c) => solidMat(c, THREE.FrontSide));
  mats.cavity = solidMat(pal.cavity, THREE.BackSide);
  mats.doorSolid = solidMat(pal.doorSolid);
  mats.door = lm(pal.door, 0.75);

  // lit materials for the optional solid internals
  const solidCache = new Map();
  const sm = (key) => {
    if (!solidCache.has(key)) {
      solidCache.set(key, new THREE.MeshLambertMaterial({
        color: pal[key], transparent: true, opacity: 0, visible: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      }));
    }
    return solidCache.get(key);
  };
  const solidKeyOf = (mat) => (mat === mats.mechDim ? 'sDim' : mat === mats.sensor ? 'sFuser' : 'sMech');
  root.add(new THREE.HemisphereLight('#ffffff', '#b4bfcb', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.1);
  sun.position.set(-6, 14, 10);
  root.add(sun);

  const shell = new Batch(), panel = new Batch(), mech = new Batch(), mechDim = new Batch(),
    guide = new Batch(), grid = new Batch(), gridMajor = new Batch(), dim = new Batch();
  const guideTris = [];
  const q = [0, 0, 0, 0];

  // rotors turn with a named travel: 'sc' (set on the table) or 'p' (spine along its path)
  const rotors = [];
  const addRotor = (x, y, r, len, { mat = mats.mech, src = 'p', sign = 1, parent = root } = {}) => {
    const o = rollerObj(r, len, mat, sm(solidKeyOf(mat)));
    o.position.set(x, y, 0);
    parent.add(o);
    rotors.push({ obj: o, r, src, sign });
    return o;
  };
  const pairAt = (path, s, r, len = 2.6, gap = 0.012) => {
    path.sample(s, q);
    const nx = -q[3], ny = q[2];
    addRotor(q[0] + nx * (r + gap), q[1] + ny * (r + gap), r, len, { sign: 1 });
    addRotor(q[0] - nx * (r + gap), q[1] - ny * (r + gap), r, len, { sign: -1 });
  };
  const guides = (path, s0, s1, off = 0.2, z = 1.6) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.08));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      path.sample(s, q);
      const nx = -q[3], ny = q[2];
      const cur = [[q[0] + nx * off, q[1] + ny * off], [q[0] - nx * off, q[1] - ny * off]];
      if (prev) {
        for (let k = 0; k < 2; k++) {
          for (const zz of [-z, z]) guide.seg(prev[k][0], prev[k][1], zz, cur[k][0], cur[k][1], zz);
          const a = prev[k], b = cur[k];
          guideTris.push(a[0], a[1], -z, b[0], b[1], -z, b[0], b[1], z, a[0], a[1], -z, b[0], b[1], z, a[0], a[1], z);
        }
      }
      if (i === 0 || i === n || i % 10 === 0) for (let k = 0; k < 2; k++) guide.seg(cur[k][0], cur[k][1], -z, cur[k][0], cur[k][1], z);
      prev = cur;
    }
  };
  const sAt = (x) => P.nearest(x, YF);
  // a moving part: its own line batch (+ solid) in a group
  const part = (fn, mat = mats.mech, parent = root) => {
    const b = new Batch();
    fn(b);
    const o = b.build(mat, sm(solidKeyOf(mat)));
    const g = new THREE.Group();
    g.add(o);
    parent.add(g);
    return g;
  };

  // ============================================================ floor + dims
  for (let x = -6; x <= 26; x += 1) (x % 5 === 0 ? gridMajor : grid).seg(x, 0, -8, x, 0, 8);
  for (let z = -8; z <= 8; z += 1) (z % 5 === 0 ? gridMajor : grid).seg(-6, 0, z, 26, 0, z);
  const { x0, x1, y1, z } = CAB;
  {
    // booklet maker width along the front, overall height at the feed end
    const dz = z + 1.4, [b0, b1] = MODS.bm;
    dim.seg(b0, 0.01, dz, b1, 0.01, dz);
    for (const x of [b0, b1]) { dim.seg(x, 0.01, dz - 0.35, x, 0.01, dz + 0.35); dim.seg(x, 0.01, z, x, 0.01, dz - 0.35); }
    const hx = x0 - 1.2;
    dim.seg(hx, 0, z, hx, y1, z);
    dim.seg(hx - 0.3, 0, z, hx + 0.3, 0, z);
    dim.seg(hx - 0.3, y1, z, hx + 0.3, y1, z);
  }

  // ============================================================ cabinets
  const f = z + 0.01;
  for (const [a, b] of Object.values(MODS)) {
    shell.roundBox(a + 0.02, 0.4, -z, b - 0.02, y1, z, 0.18);
    const m = new THREE.Mesh(new THREE.BoxGeometry(b - a - 0.04, y1 - 0.4, 2 * z), fillMat);
    m.position.set((a + b) / 2, (y1 + 0.4) / 2, 0);
    m.renderOrder = -1;
    root.add(m);
    // lift-off top with a finger recess
    shell.roundBox(a + 0.02, y1, -z + 0.05, b - 0.02, y1 + 0.12, z - 0.05, 0.15);
    panel.rectY((a + b) / 2 - 0.45, -0.25, (a + b) / 2 + 0.45, 0.25, y1 + 0.125);
    // casters
    for (const cx of [a + 0.5, b - 0.5]) for (const cz of [-z + 0.5, z - 0.5]) {
      mechDim.circleZ(cx, 0.2, cz, 0.18, 14);
      mechDim.box(cx - 0.12, 0.34, cz - 0.1, cx + 0.12, 0.4, cz + 0.1);
    }
  }

  // solid skin with door openings (faded away after the intro reveal)
  const holes = [];
  const doors = [];
  const door = (dx0, dy0, dx1, dy1, open, extra) => {
    holes.push([dx0, dy0, dx1, dy1]);
    const hx = open === 'R' ? dx1 : dx0;
    const X = (x) => x - hx;
    const g = new THREE.Group();
    g.position.set(hx, 0, f);
    const b = new Batch();
    b.box(X(dx0), dy0, -0.08, X(dx1), dy1, 0);
    if (extra) extra(b, X);
    const dm = { line: mats.door.clone(), solid: mats.doorSolid.clone() };
    const lines = b.build(dm.line);
    lines.renderOrder = SOLID + 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dx1 - dx0, dy1 - dy0), dm.solid);
    m.position.set(X((dx0 + dx1) / 2), (dy0 + dy1) / 2, 0);
    m.renderOrder = SOLID;
    g.add(m, lines);
    root.add(g);
    doors.push({ g, open, mod: doors.length, mats: dm });
  };
  // booklet maker: one door below the control panel / badge, hinged at the feed end
  door(0.25, 0.6, 7.85, 7.9, 'L', (b, X) => {
    b.rectZ(X(7.2), 4.6, X(7.35), 6.2, 0);
    b.rectZ(X(0.7), 6.9, X(1.2), 7.4, 0.005); // service label
  });
  door(MODS.sqf[0] + 0.2, 0.6, MODS.sqf[1] - 0.2, 9.9, 'L', (b, X) => {
    b.rectZ(X(MODS.sqf[1] - 0.6), 4.6, X(MODS.sqf[1] - 0.45), 6.2, 0);
    b.rectZ(X(MODS.sqf[0] + 0.5), 8.9, X(MODS.sqf[0] + 1.0), 9.4, 0.005);
  });
  door(MODS.trm[0] + 0.2, 0.6, MODS.trm[1] - 0.2, 9.9, 'R', (b, X) => {
    b.rectZ(X(MODS.trm[0] + 0.45), 4.6, X(MODS.trm[0] + 0.6), 6.2, 0);
    b.rectZ(X(MODS.trm[1] - 1.4), 8.9, X(MODS.trm[1] - 0.9), 9.4, 0.005);
  });
  // booklet maker control panel with the maker's slash badge (slanted so it
  // reads / / once the page mirrors the model) and the model plate
  for (let k = 0; k < 2; k++) panel.poly([[6.25 + k * 0.3, 8.55, f + 0.01], [5.95 + k * 0.3, 9.45, f + 0.01]]);
  panel.rectZ(5.6, 8.3, 7.2, 9.7, f + 0.005);
  panel.rectZ(0.6, 9.3, 1.5, 9.7, f + 0.005);
  const plane = (geo, mat, px, py, pz, rx = 0, ry = 0, passes = [[mat, SOLID], [mats.cavity, -2]]) => {
    for (const [m, order] of passes) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.rotation.set(rx, ry, 0);
      o.renderOrder = order;
      root.add(o);
    }
  };
  {
    const [front, top, side] = mats.solids;
    const y0 = 0.4, H = Math.PI / 2;
    const s = new THREE.Shape().moveTo(x0, y0).lineTo(x1, y0).lineTo(x1, y1).lineTo(x0, y1).lineTo(x0, y0);
    for (const [a, b, c, d] of holes) s.holes.push(new THREE.Path().moveTo(a, b).lineTo(c, b).lineTo(c, d).lineTo(a, d).lineTo(a, b));
    plane(new THREE.ShapeGeometry(s), front, 0, 0, z);
    const w = x1 - x0, h = y1 - y0, d = 2 * z, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    plane(new THREE.PlaneGeometry(w, h), side, cx, cy, -z, 0, Math.PI);
    plane(new THREE.PlaneGeometry(w, d), top, cx, y1, 0, -H);
    plane(new THREE.PlaneGeometry(w, d), side, cx, y0, 0, H);
    plane(new THREE.PlaneGeometry(d, h), side, x0, cy, 0, 0, -H);
    plane(new THREE.PlaneGeometry(d, h), side, x1, cy, 0, 0, H);
  }

  // ============================================================ feed table (on top of the booklet maker)
  {
    const zt = SW / 2 + 0.35, xs = X_DROP - 0.6;
    // deck plate up to the slot, with a front lip
    mech.rectY(-0.2, -zt, xs, zt, DECK_Y - 0.02);
    mechDim.rectY(-0.2, -zt, xs, zt, DECK_Y - 0.14);
    mech.box(-0.28, DECK_Y - 0.14, -zt, -0.2, DECK_Y + 0.12, zt);
    for (const zz of [-zt, zt]) mechDim.seg(xs, DECK_Y - 0.14, zz, xs, y1 + 0.12, zz);
    // raised hood over the back of the table (sloping up to the rear)
    const zb = -(SW / 2 + 0.15);
    for (const xx of [-0.1, X_DROP + 0.4]) shell.poly([[xx, y1 + 0.12, zb], [xx, DECK_Y + 0.55, zb], [xx, DECK_Y + 1.3, -z + 0.1], [xx, y1 + 0.12, -z + 0.1]], true);
    for (const [yy, zz] of [[DECK_Y + 0.55, zb], [DECK_Y + 1.3, -z + 0.1]]) shell.seg(-0.1, yy, zz, X_DROP + 0.4, yy, zz);
    // side guide along the hood: the operator butts the set against it
    mech.box(0.2, DECK_Y - 0.02, zb - 0.06, xs - 0.2, DECK_Y + 0.3, zb + 0.04);
    // slot in the top through to the pocket
    panel.rectY(xs, -SW / 2 - 0.2, X_DROP + 0.45, SW / 2 + 0.2, y1 + 0.125);
  }

  // ============================================================ pocket, stitcher, fold
  const heads = [];
  let backstop, blade;
  {
    // pocket back plate (the set's inner side), split at the fold slot
    for (const [a, b] of [[2.9, YF - 0.06], [YF + 0.06, 9.6]]) {
      mechDim.rectX(X_DROP - 0.01, a, -SW / 2 - 0.25, b, SW / 2 + 0.25);
    }
    // front guide plate above the heads
    mechDim.rectX(X_DROP + 0.4, YS + 0.6, -SW / 2 - 0.25, 9.6, SW / 2 + 0.25);
    // feed rollers under the deck, then down the pocket
    for (const x of [0.6, 3.6]) addRotor(x, DECK_Y - 0.12, 0.1, 2.4, { src: 'sc', mat: mats.mechDim });
    for (const zz of [-1.05, 1.05]) for (const yy of [DECK_Y - 0.02, DECK_Y - 0.22]) mech.seg(0.5, yy, zz, 3.7, yy, zz);
    for (const y of [9.1, 8.3]) addRotor(X_DROP - 0.11, y, 0.1, 2.4, { src: 'sc', mat: mats.mechDim, sign: -1 });

    // stitch heads on the front of the set, clinchers behind the pocket plate
    for (const zc of STAPLE_Z) {
      mech.box(X_DROP + 1.05, YS - 0.38, zc - 0.3, X_DROP + 2.35, YS + 0.38, zc + 0.3, true);
      mech.box(X_DROP + 2.35, YS - 0.3, zc - 0.22, X_DROP + 2.8, YS + 0.3, zc + 0.22);   // staple cartridge
      mechDim.seg(X_DROP + 2.8, YS, zc, X_DROP + 3.3, YS, zc);
      const drv = part((b) => {
        b.box(0, YS - 0.2, zc - 0.16, 0.9, YS + 0.2, zc + 0.16);
        b.box(-0.05, YS - 0.06, zc - 0.14, 0, YS + 0.06, zc + 0.14);
      }, mats.mech);
      heads.push(drv);
      mech.box(X_DROP - 0.62, YS - 0.3, zc - 0.25, X_DROP - 0.08, YS + 0.3, zc + 0.25);
      mechDim.rectX(X_DROP - 0.08, YS - 0.08, zc - 0.14, YS + 0.08, zc + 0.14);
    }
    mech.box(X_DROP + 3.3, YS - 0.2, -1.6, X_DROP + 3.55, YS + 0.2, 1.6);
    mechDim.box(X_DROP - 0.9, YS - 0.4, -1.4, X_DROP - 0.62, YS + 0.4, 1.4);

    // stitch stop under the set, hinged on the pocket side, swings down to let it drop
    backstop = part((b) => {
      for (const zz of [-0.9, 0, 0.9]) b.box(0, -0.06, zz - 0.12, 0.7, 0, zz + 0.12);
      b.seg(0, 0, -1.2, 0, 0, 1.2);
    });
    backstop.position.set(X_DROP - 0.35, YS - SL / 2 - 0.03, 0);
    // fixed stop at the fold position
    for (const zz of [-0.9, 0.9]) mech.box(X_DROP - 0.3, YF - SL / 2 - 0.09, zz - 0.12, X_DROP + 0.35, YF - SL / 2 - 0.03, zz + 0.12);

    // fold blade behind the pocket, on a crank
    blade = part((b) => {
      b.box(-0.7, -0.025, -1.7, 0, 0.025, 1.7);
      b.seg(-0.7, 0, 0, -1.3, 0, 0);
      b.box(-1.4, -0.3, -0.3, -1.3, 0.3, 0.3);
    });
    blade.position.set(X_DROP - 0.25, YF, 0);
    mechDim.circleZ(X_DROP - 2.3, YF, 0, 0.35, 20);
    mechDim.box(X_DROP - 2.9, YF - 1.2, -1.2, X_DROP - 2.75, YF + 1.2, 1.2);

    // fold rollers (thickness-set nip) and frame
    pairAt(P, P.marks.nip, 0.28, 3.1);
    for (const zz of [-1.7, 1.7]) mechDim.rectZ(X_DROP + 0.35, YF - 0.75, X_DROP + 1.2, YF + 0.75, zz);
    guides(P, P.marks.nip + 0.45, sAt(SQF_X - 1.7), 0.22);
    pairAt(P, sAt(7.6), 0.16, 2.8);
    pairAt(P, sAt(8.7), 0.16, 2.8);
  }

  // ============================================================ squarefold
  const sqf = {};
  {
    mechDim.box(SQF_X - 1.6, YF - 1.1, -2.2, SQF_X + 1.0, YF + 1.1, 2.2, true);
    for (const zz of [-2.2, 2.2]) mechDim.seg(SQF_X - 1.6, YF, zz, SQF_X + 1.0, YF, zz);
    // clamp jaws either side of the booklet, near the spine
    sqf.clamps = [1, -1].map((sgn) => {
      const g = part((b) => {
        b.box(SQF_X - 1.3, 0, -1.8, SQF_X - 0.05, sgn * 0.14, 1.8);
        b.seg(SQF_X - 0.7, sgn * 0.14, 0, SQF_X - 0.7, sgn * 0.6, 0);
        b.box(SQF_X - 0.9, sgn * 0.6, -0.3, SQF_X - 0.5, sgn * 0.75, 0.3);
      });
      g.userData.sgn = sgn;
      return g;
    });
    // spine stop (retracts upward once the spine is formed)
    sqf.stop = part((b) => {
      b.box(0, -0.35, -1.6, 0.06, 0.35, 1.6);
      b.seg(0.03, 0.35, 0, 0.03, 0.9, 0);
    });
    sqf.stop.position.set(SQF_X + 0.02, YF, 0);
    // forming roller: vertical axis, travels the length of the spine
    sqf.roller = part((b) => {
      const n = 22, r = 0.14, h = 0.5;
      for (const yy of [-h / 2, h / 2]) {
        const pts = [];
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([r * Math.cos(a), yy, r * Math.sin(a)]); }
        b.poly(pts, true);
      }
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; b.seg(r * Math.cos(a), -h / 2, r * Math.sin(a), r * Math.cos(a), h / 2, r * Math.sin(a)); }
      b.seg(0, -h / 2 - 0.2, 0, 0, h / 2 + 0.2, 0);
      b.box(-0.08, h / 2 + 0.2, -0.12, 0.3, h / 2 + 0.35, 0.12);
    }, mats.sensor);
    mech.box(SQF_X + 0.15, YF + 0.6, -2.1, SQF_X + 0.35, YF + 0.7, 2.1);
    guides(P, P.marks.sqf + 0.35, sAt(MODS.trm[0] + 0.1), 0.2);
    pairAt(P, sAt(12.2), 0.16, 2.8);
  }

  // ============================================================ face trimmer
  const trim = {};
  {
    pairAt(P, sAt(MODS.trm[0] + 0.45), 0.16, 2.8);
    // bed under the booklet, open in front of the knife so the strip can fall
    mechDim.rectY(MODS.trm[0] + 0.1, -SW / 2 - 0.25, X_KNIFE - 0.5, SW / 2 + 0.25, YF - 0.17);
    mechDim.rectY(X_KNIFE + 0.08, -SW / 2 - 0.25, TRIM_X + 0.6, SW / 2 + 0.25, YF - 0.17);
    // cutting stick under the knife
    mech.box(X_KNIFE - 0.08, YF - 0.42, -2.0, X_KNIFE + 0.08, YF - 0.3, 2.0);
    // knife columns, crosshead and drive
    for (const zz of [-2.35, 2.35]) mech.box(X_KNIFE - 0.12, YF - 0.6, zz - 0.1, X_KNIFE + 0.12, YF + 2.6, zz + 0.1);
    mech.box(X_KNIFE - 0.3, YF + 2.6, -2.5, X_KNIFE + 0.3, YF + 2.85, 2.5);
    mechDim.circleZ(X_KNIFE, YF + 3.4, 0, 0.4, 20);
    mechDim.seg(X_KNIFE, YF + 2.85, 0, X_KNIFE, YF + 3.0, 0);
    // knife: a vertical blade spanning the booklet, bevel on its lower edge
    trim.knife = part((b) => {
      b.box(-0.02, 0.12, -2.2, 0.02, 0.9, 2.2);
      b.poly([[0.02, 0.12, -2.2], [-0.02, 0, -2.2], [-0.02, 0, 2.2], [0.02, 0.12, 2.2]]);
      b.seg(-0.02, 0, -2.2, -0.02, 0.12, -2.2);
      b.seg(-0.02, 0, 2.2, -0.02, 0.12, 2.2);
      b.box(-0.1, 0.9, -1.0, 0.1, 1.1, 1.0);
    }, mats.sensor);
    trim.knife.position.set(X_KNIFE, YF + 0.9, 0);
    // clamp bar: holds the booklet flat just behind the cut
    trim.clamp = part((b) => {
      b.box(X_KNIFE + 0.08, 0, -2.0, X_KNIFE + 1.1, 0.12, 2.0);
      for (const zz of [-1.2, 1.2]) b.seg(X_KNIFE + 0.6, 0.12, zz, X_KNIFE + 0.6, 0.9, zz);
    });
    trim.clamp.position.y = YF + 0.6;
    // book stop at the spine (lifts to let the booklet out)
    trim.stop = part((b) => {
      b.box(0, -0.35, -1.6, 0.06, 0.35, 1.6);
      b.seg(0.03, 0.35, 0, 0.03, 0.9, 0);
    });
    trim.stop.position.set(TRIM_X + 0.02, YF, 0);
    // waste bin under the knife
    mechDim.box(X_KNIFE - 1.3, 0.6, -2.6, X_KNIFE + 0.5, 2.4, 2.6, true);
    for (const zz of [-2.6, 2.6]) mechDim.seg(X_KNIFE - 0.5, YF - 0.17, zz, X_KNIFE - 1.3, 2.4, zz);
    // out of the trimmer
    guides(P, sAt(TRIM_X + 0.4), P.marks.exit - 0.25, 0.2);
    pairAt(P, P.marks.exit - 0.3, 0.16, 2.8);
  }

  // ============================================================ belt delivery
  {
    // two belts on a tray cantilevered off the trimmer, end stop at the far end
    const b0 = P.marks.exit + 0.15, b1 = P.total;
    const bp = [];
    for (let i = 0; i <= 12; i++) { P.sample(b0 + ((b1 - b0) * i) / 12, q); bp.push([q[0], q[1] - 0.16]); }
    for (const zz of [-0.9, 0.9]) {
      mech.poly(bp.map(([x, y]) => [x, y, zz - 0.25]));
      mech.poly(bp.map(([x, y]) => [x, y, zz + 0.25]));
      mech.poly(bp.map(([x, y]) => [x, y - 0.2, zz]));
    }
    for (const [x, y] of [bp[0], bp.at(-1)]) addRotor(x, y - 0.1, 0.1, 2.3, { mat: mats.mechDim });
    const e = bp.at(-1);
    mechDim.box(bp[0][0], bp[0][1] - 0.35, -1.7, e[0], e[1] - 0.25, 1.7, true);
    mech.box(e[0] + 0.1, e[1] - 0.35, -1.7, e[0] + 0.2, e[1] + 0.6, 1.7);
    for (const zz of [-1.5, 1.5]) mechDim.seg(x1, YF - 1.4, zz, bp[4][0], bp[4][1] - 0.35, zz);
    // deflector hood over the exit
    for (const zz of [-1.9, 1.9]) shell.poly([[x1, YF + 0.35, zz], [x1, YF + 1.9, zz], [x1 + 1.1, YF + 0.75, zz], [x1 + 1.1, YF + 0.35, zz]], true);
    shell.seg(x1 + 1.1, YF + 0.75, -1.9, x1 + 1.1, YF + 0.75, 1.9);
    shell.seg(x1, YF + 1.9, -1.9, x1, YF + 1.9, 1.9);
    panel.rectX(x1, YF - 0.3, -SW / 2 - 0.2, YF + 0.3, SW / 2 + 0.2);
  }

  // ============================================================ assemble
  const layers = [
    [shell, mats.shell], [panel, mats.panel], [mech, mats.mech], [mechDim, mats.mechDim],
    [guide, mats.guide], [grid, mats.grid], [gridMajor, mats.gridMajor], [dim, mats.dim],
  ];
  const layerSolid = new Map([[mech, 'sMech'], [mechDim, 'sDim']]);
  for (const [b, m] of layers) {
    const key = layerSolid.get(b);
    const o = root.add(b.build(m, key && sm(key))).children.at(-1);
    if (b === shell || b === panel) o.renderOrder = SOLID + 1;
  }
  {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(guideTris, 3));
    gg.computeVertexNormals();
    const gm = sm('sGuide');
    gm.depthWrite = false;
    gm.userData.maxOpacity = 0.35;
    root.add(solidPart(gg, gm));
  }

  function setSolid(k) {
    for (const m of solidCache.values()) {
      const max = m.userData.maxOpacity ?? 1;
      m.opacity = k * max;
      m.visible = k > 0.001;
      if (max === 1) m.depthWrite = k > 0.5;
    }
  }

  function setTheme(p) {
    for (const k in LINE_MATS) mats[k].color.set(p[k]);
    mats.solids.forEach((m, i) => m.color.set(p.solids[i]));
    mats.cavity.color.set(p.cavity);
    mats.doorSolid.color.set(p.doorSolid);
    mats.door.color.set(p.door);
    fillMat.color.set(p.fill);
    for (const d of doors) { d.mats.line.color.set(p.door); d.mats.solid.color.set(p.doorSolid); }
    for (const [key, m] of solidCache) m.color.set(p[key]);
  }

  return {
    setTheme, setSolid, root, T, P, TABLE_Y: DECK_Y, mats, rotors, doors, heads, backstop, blade, sqf, trim,
  };
}
