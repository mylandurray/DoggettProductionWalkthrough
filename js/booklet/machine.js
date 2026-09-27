// Wireframe model of a hand-fed booklet maker with an in-line square-back unit
// (after the Morgana BM60 + Squarefold 104): side feed table, two stitch heads
// over clinchers, a fold blade pushing up into a fold-roller nip, then a route
// over and down to the squarefold and out onto a belt stacker.
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
export const XS = 2.4;       // stitch line
export const XF = 5.6;       // fold line
export const STAPLE_Z = [-0.74, 0.74];
export const CAB = { x0: 0, x1: 13, y1: 10.2, z: 2.6 };
export const SQF_X = 11.2;   // squarefold spine stop

// ---------------------------------------------------------------- paths
// T: the table, from the outside feed tray (sloping gently down into the
// machine) through the stitch and fold positions. The set's centre moves along it.
// P: the spine's route once folded. It starts at the fold slot, rises through
// the fold rollers, runs over the top and down the back of the cabinet to the
// squarefold, then out onto the belt stacker.
export function buildPaths() {
  const T = new PathBuilder(-5.0, 6.594, -4).toX(-0.9).arc(2.5, 4).toX(10).build();
  const ty = T.pts.at(-1)[1];
  const P = new PathBuilder(XF, ty, 90)
    .mark('slot')
    .toY(ty + 0.75).mark('nip')
    .toY(9.0)
    .arc(0.7, -90).mark('top')
    .toX(8.4).mark('down')
    .arc(0.7, -90)
    .toY(4.0)
    .arc(0.7, 90)
    .toX(SQF_X).mark('sqf')
    .toX(12.9).mark('exit')
    .arc(2.0, -5)
    .line(4.2)
    .build();
  return { T, P, TABLE_Y: ty };
}

// ---------------------------------------------------------------- build
export function createBookletMaker(scene, pal = PALETTES.light) {
  const { T, P, TABLE_Y: ty } = buildPaths();
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
  for (let x = -8; x <= 20; x += 1) (x % 5 === 0 ? gridMajor : grid).seg(x, 0, -8, x, 0, 8);
  for (let z = -8; z <= 8; z += 1) (z % 5 === 0 ? gridMajor : grid).seg(-8, 0, z, 20, 0, z);
  {
    const dz = 4.2;
    dim.seg(0, 0.01, dz, CAB.x1, 0.01, dz);
    for (const x of [0, CAB.x1]) { dim.seg(x, 0.01, dz - 0.35, x, 0.01, dz + 0.35); dim.seg(x, 0.01, CAB.z, x, 0.01, dz - 0.35); }
    dim.seg(CAB.x1 + 1.2, 0, CAB.z, CAB.x1 + 1.2, CAB.y1, CAB.z);
    dim.seg(CAB.x1 + 0.9, 0, CAB.z, CAB.x1 + 1.5, 0, CAB.z);
    dim.seg(CAB.x1 + 0.9, CAB.y1, CAB.z, CAB.x1 + 1.5, CAB.y1, CAB.z);
  }

  // ============================================================ cabinet
  const { x0, x1, y1, z } = CAB;
  const f = z + 0.01;
  shell.roundBox(x0, 0.4, -z, x1, y1, z, 0.22);
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - 0.4, 2 * z), fillMat);
    m.position.set((x0 + x1) / 2, (y1 + 0.4) / 2, 0);
    m.renderOrder = -1;
    root.add(m);
  }
  // raised top cover over the feed / stitch end, a lipped lid on the right
  shell.roundBox(-0.05, y1, -z + 0.1, 4.3, y1 + 0.25, z - 0.05, 0.15);
  shell.roundBox(10.4, y1, -z + 0.1, x1 + 0.05, y1 + 0.18, z - 0.05, 0.12);
  panel.rectY(4.6, -z + 0.4, 10.1, z - 0.4, y1 + 0.005);
  panel.rectY(5.0, -1.4, 9.7, 1.4, y1 + 0.005);
  // casters
  for (const cx of [0.5, x1 - 0.5]) for (const cz of [-z + 0.5, z - 0.5]) {
    mechDim.circleZ(cx, 0.2, cz, 0.18, 14);
    mechDim.box(cx - 0.12, 0.34, cz - 0.1, cx + 0.12, 0.4, cz + 0.1);
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
  door(0.25, 0.6, 4.2, 9.95, 'L', (b, X) => b.rectZ(X(3.8), 4.4, X(3.95), 6.0, 0));
  door(4.3, 0.6, 12.75, 9.95, 'R', (b, X) => {
    b.rectZ(X(4.6), 4.4, X(4.75), 6.0, 0);
    // maker's slash badge (slanted so it reads / / / once the page mirrors the model)
    for (let k = 0; k < 3; k++) b.poly([[X(5.7 + k * 0.28), 8.5, 0.01], [X(5.4 + k * 0.28), 9.25, 0.01]]);
    b.rectZ(X(5.15), 8.35, X(6.55), 9.4, 0.005);
    b.rectZ(X(12.1), 9.2, X(12.4), 9.5, 0.005);
  });
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

  // ============================================================ feed table (outside, left)
  {
    // tray plate following T, with a raised back plate at the machine wall
    const s0 = 0, s1 = T.nearest(-0.02, ty);
    const zt = SW / 2 + 0.35;
    const pts = [];
    for (let i = 0; i <= 12; i++) { T.sample(s0 + ((s1 - s0) * i) / 12, q); pts.push([q[0], q[1] - 0.03]); }
    for (const zz of [-zt, zt]) mech.poly(pts.map(([x, y]) => [x, y, zz]));
    for (const [x, y] of [pts[0], pts.at(-1)]) mech.seg(x, y, -zt, x, y, zt);
    mechDim.poly(pts.map(([x, y]) => [x, y - 0.12, zt]));
    mechDim.seg(pts[0][0], pts[0][1], zt, pts[0][0], pts[0][1] - 0.12, zt);
    // tray front lip + bracket to the cabinet
    T.sample(0, q);
    mech.box(q[0] - 0.08, q[1] - 0.03, -zt, q[0], q[1] + 0.3, zt);
    for (const zz of [-zt + 0.2, zt - 0.2]) mechDim.seg(-1.6, ty - 0.15, zz, 0, ty - 1.4, zz);
    // raised hood where the tray meets the cabinet (as on the real machine)
    shell.poly([[-0.9, ty + 0.35, -zt], [-0.9, ty + 1.55, -zt], [0, ty + 2.05, -zt], [0, ty + 0.35, -zt]], true);
    shell.poly([[-0.9, ty + 0.35, zt], [-0.9, ty + 1.55, zt], [0, ty + 2.05, zt], [0, ty + 0.35, zt]], true);
    shell.seg(-0.9, ty + 1.55, -zt, -0.9, ty + 1.55, zt);
    shell.seg(-0.9, ty + 0.35, -zt, -0.9, ty + 0.35, zt);
    // feed slot in the cabinet wall
    panel.rectX(0, ty - 0.1, -SW / 2 - 0.2, ty + 0.4, SW / 2 + 0.2);
    // fixed side guides either side of the set
    for (const sgn of [-1, 1]) {
      const zg = sgn * (SW / 2 + 0.07);
      T.sample(T.nearest(-2.75, ty), q);
      mech.box(-4.3, q[1] + 0.02, zg - 0.05, -1.2, q[1] + 0.32, zg + 0.05);
      mech.seg(-2.75, q[1] + 0.02, zg, -2.75, q[1] - 0.23, zg);
    }
  }

  // ============================================================ table, transport, stitcher
  const heads = [];
  let backstop, blade;
  {
    // table plate from the wall to past the fold stop, split at the fold slot
    for (const [a, b] of [[0, XF - 0.06], [XF + 0.06, 8.1]]) {
      mechDim.rectY(a, -SW / 2 - 0.25, b, SW / 2 + 0.25, ty - 0.01);
    }
    // transport belts under the table (drive the set in)
    for (const zz of [-1.05, 1.05]) {
      for (const yy of [ty - 0.02, ty - 0.22]) mech.seg(0.2, yy, zz, 7.9, yy, zz);
    }
    for (const x of [0.3, 3.4, 7.8]) addRotor(x, ty - 0.12, 0.1, 2.4, { src: 'sc', mat: mats.mechDim });

    // stitch heads above, clinchers below
    for (const zc of STAPLE_Z) {
      mech.box(XS - 0.38, ty + 1.05, zc - 0.3, XS + 0.38, ty + 2.35, zc + 0.3, true);
      mech.box(XS - 0.3, ty + 2.35, zc - 0.22, XS + 0.3, ty + 2.8, zc + 0.22);   // staple cartridge
      mechDim.seg(XS, ty + 2.8, zc, XS, ty + 3.3, zc);
      const drv = part((b) => {
        b.box(XS - 0.2, 0, zc - 0.16, XS + 0.2, 0.9, zc + 0.16);
        b.box(XS - 0.06, -0.05, zc - 0.14, XS + 0.06, 0, zc + 0.14);
      }, mats.mech);
      heads.push(drv);
      // clincher
      mech.box(XS - 0.3, ty - 0.62, zc - 0.25, XS + 0.3, ty - 0.08, zc + 0.25);
      mechDim.rectY(XS - 0.08, zc - 0.14, XS + 0.08, zc + 0.14, ty - 0.08);
    }
    // head beam
    mech.box(XS - 0.2, ty + 3.3, -1.6, XS + 0.2, ty + 3.55, 1.6);
    mechDim.box(XS - 0.4, ty - 0.9, -1.4, XS + 0.4, ty - 0.62, 1.4);

    // back stop fingers at the stitch position (hinged below the table)
    backstop = part((b) => {
      for (const zz of [-0.9, 0, 0.9]) b.box(-0.03, 0, zz - 0.12, 0.03, 0.4, zz + 0.12);
      b.seg(0, 0, -1.2, 0, 0, 1.2);
    });
    backstop.position.set(XS + SL / 2 + 0.03, ty - 0.02, 0);
    // fixed stop at the fold position
    for (const zz of [-0.9, 0.9]) mech.box(XF + SL / 2 + 0.03, ty, zz - 0.12, XF + SL / 2 + 0.09, ty + 0.4, zz + 0.12);

    // fold blade below the slot, on a crank
    blade = part((b) => {
      b.box(-0.025, -0.7, -1.7, 0.025, 0, 1.7);
      b.seg(0, -0.7, 0, 0, -1.3, 0);
      b.box(-0.1, -1.4, -0.3, 0.1, -1.3, 0.3);
    });
    blade.position.set(XF, ty - 0.25, 0);
    mechDim.circleZ(XF, ty - 2.3, 0, 0.35, 20);
    mechDim.box(XF - 0.6, ty - 2.9, -1.2, XF + 0.6, ty - 2.75, 1.2);
  }

  // ============================================================ fold rollers + riser + top run
  {
    pairAt(P, P.marks.nip, 0.28, 3.1);
    guides(P, P.marks.nip + 0.45, P.marks.down + 0.4, 0.22);
    pairAt(P, P.nearest(XF, 8.4), 0.16, 2.8);
    pairAt(P, P.nearest(7.4, 9.7), 0.16, 2.8);
    // fold-roller frame
    for (const zz of [-1.7, 1.7]) mechDim.rectZ(XF - 0.75, ty + 0.35, XF + 0.75, ty + 1.2, zz);
  }

  // ============================================================ down + squarefold
  const sqf = {};
  {
    guides(P, P.marks.down + 0.4, P.marks.sqf - 1.4, 0.2);
    pairAt(P, P.nearest(9.1, 6.4), 0.16, 2.8);
    pairAt(P, P.nearest(10.0, 3.3), 0.16, 2.8);
    // squarefold frame
    mechDim.box(9.6, 2.2, -2.2, 12.2, 4.4, 2.2, true);
    for (const zz of [-2.2, 2.2]) mechDim.seg(9.6, 3.3, zz, 12.2, 3.3, zz);
    // clamp jaws either side of the booklet, near the spine
    sqf.clamps = [1, -1].map((sgn) => {
      const g = part((b) => {
        b.box(9.9, 0, -1.8, SQF_X - 0.05, sgn * 0.14, 1.8);
        b.seg(10.5, sgn * 0.14, 0, 10.5, sgn * 0.6, 0);
        b.box(10.3, sgn * 0.6, -0.3, 10.7, sgn * 0.75, 0.3);
      });
      g.userData.sgn = sgn;
      return g;
    });
    // spine stop (retracts upward once the spine is formed)
    sqf.stop = part((b) => {
      b.box(0, -0.35, -1.6, 0.06, 0.35, 1.6);
      b.seg(0.03, 0.35, 0, 0.03, 0.9, 0);
    });
    sqf.stop.position.set(SQF_X + 0.02, 3.3, 0);
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
    // roller carriage rail
    mech.box(SQF_X + 0.15, 3.3 + 0.6, -2.1, SQF_X + 0.35, 3.3 + 0.7, 2.1);
    guides(P, P.marks.sqf + 0.35, P.marks.exit - 0.2, 0.2);
    pairAt(P, P.marks.exit - 0.2, 0.18, 2.8);
  }

  // ============================================================ deliveries
  {
    // belt stacker: two belts on a stand, booklets shingle along it
    const b0 = P.marks.exit + 0.3, b1 = P.total;
    const bp = [];
    for (let i = 0; i <= 12; i++) { P.sample(b0 + ((b1 - b0) * i) / 12, q); bp.push([q[0], q[1] - 0.16]); }
    for (const zz of [-0.9, 0.9]) {
      mech.poly(bp.map(([x, y]) => [x, y, zz - 0.25]));
      mech.poly(bp.map(([x, y]) => [x, y, zz + 0.25]));
      mech.poly(bp.map(([x, y]) => [x, y - 0.2, zz]));
    }
    for (const [x, y] of [bp[0], bp.at(-1)]) addRotor(x, y - 0.1, 0.1, 2.3, { mat: mats.mechDim });
    mechDim.box(bp[0][0], bp[0][1] - 0.35, -1.3, bp.at(-1)[0], bp.at(-1)[1] - 0.25, 1.3, true);
    for (const [x] of [bp[2], bp.at(-2)]) for (const zz of [-1.1, 1.1]) mechDim.seg(x, bp[2][1] - 0.35, zz, x, 0, zz);
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
    setTheme, setSolid, root, T, P, TABLE_Y: ty, mats, rotors, doors, heads, backstop, blade, sqf,
  };
}
