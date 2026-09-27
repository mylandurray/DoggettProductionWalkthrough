// Wireframe model of a single-clamp perfect binder with automatic cover feed:
// a long cabinet with arched end covers and a lift-up lid, a clamp carriage
// running on a rail along the back wall, and the stations below it in order —
// load + jog, milling cutter, hot-melt glue pot, then the nipping station fed
// by the cover tray at the front, and a belt delivery out of the right end.
// Units: 1 = 100 mm. X = clamp travel (left → right), Y = up, Z = depth (+ = front).
import * as THREE from 'three';
import { Batch, SOLID, lm, solidPart, rollerObj } from '../core/batch.js';
import { PALETTES } from '../theme.js';

// book block (A4 portrait, spine along X)
export const SPL = 2.97;     // spine length (297 mm)
export const BW = 2.1;       // page width, spine → fore-edge (210 mm)
export const BT = 0.2;       // block thickness (20 mm)
export const NL = 20;        // drawn leaves (each stands for 10)
export const MILL_D = 0.03;  // milled off the spine (3 mm, drawn a little deep)
export const GT = 0.012;     // glue film under the spine
// cover
export const HZ = BT / 2 + 0.004; // hinge (score) lines either side of the spine
export const WL = BW + GT;        // wing length, score → fore-edge
export const H1 = 0.15;           // part of each wing pressed flat by the side jaws
export const CW = 2 * (HZ + WL);  // flat cover width
// heights
export const SPINE_Y = 8.6;  // milled spine line while clamped
export const LIFT = 0.5;     // nipping table stroke
export const COVER_Y = SPINE_Y - GT - LIFT; // cover on the tray / lowered table
export const DELIV_Y = 7.5;  // delivery belt top, just above the base
// stations along X
export const XL = 2.6, XM = 6.2, XG = 9.6, XSG = 10.5, XN = 14.2, XD = 17.4, XOUT = 21.0;
export const CZ0 = 6.9;      // cover centre on the feed tray
export const CAB = { x0: 0, x1: 19.4, yb: 7.4, y1: 12.4, z: 3.6 };
// clamp jaws (relative to the spine line)
export const JAW = { y0: 0.45, y1: 1.75, t: 0.06, len: 3.4 };

// ---------------------------------------------------------------- build
export function createBinder(scene, pal = PALETTES.light) {
  const root = new THREE.Group();
  scene.add(root);

  const LINE_MATS = {
    shell: 0.5, panel: 0.38, mech: 0.78, mechDim: 0.5, guide: 0.42, stack: 0.55, grid: 1, gridMajor: 1,
    dim: 0.75, fuser: 0.9, lamp: 0.8, laser: 0.95, belt: 0.7, sensor: 0.9,
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
  mats.glueFill = new THREE.MeshBasicMaterial({ color: pal.glue, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });

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
  const solidKeyOf = (mat) => (mat === mats.mechDim ? 'sDim' : mat === mats.fuser || mat === mats.sensor ? 'sFuser' : 'sMech');
  root.add(new THREE.HemisphereLight('#ffffff', '#b4bfcb', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.1);
  sun.position.set(-6, 16, 12);
  root.add(sun);

  const shell = new Batch(), panel = new Batch(), mech = new Batch(), mechDim = new Batch(),
    guide = new Batch(), stack = new Batch(), grid = new Batch(), gridMajor = new Batch(), dim = new Batch(),
    fuser = new Batch(), lamp = new Batch(), estop = new Batch(), belt = new Batch();

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
  // rollers that turn: `src` names what drives them ('time' or 'belt')
  const rotors = [];
  const addRotor = (x, y, r, len, { mat = mats.mech, src = 'time', sign = 1, rate = 1, parent = root } = {}) => {
    const o = rollerObj(r, len, mat, sm(solidKeyOf(mat)));
    o.position.set(x, y, 0);
    parent.add(o);
    rotors.push({ obj: o, r, src, sign, rate });
    return o;
  };

  // ============================================================ floor + dims
  for (let x = -6; x <= 26; x += 1) (x % 5 === 0 ? gridMajor : grid).seg(x, 0, -8, x, 0, 12);
  for (let z = -8; z <= 12; z += 1) (z % 5 === 0 ? gridMajor : grid).seg(-6, 0, z, 26, 0, z);
  {
    const dz = 11;
    dim.seg(0, 0.01, dz, CAB.x1, 0.01, dz);
    for (const x of [0, CAB.x1]) { dim.seg(x, 0.01, dz - 0.35, x, 0.01, dz + 0.35); dim.seg(x, 0.01, CAB.z, x, 0.01, dz - 0.35); }
    dim.seg(-1.2, 0, CAB.z, -1.2, CAB.y1, CAB.z);
    dim.seg(-1.5, 0, CAB.z, -0.9, 0, CAB.z);
    dim.seg(-1.5, CAB.y1, CAB.z, -0.9, CAB.y1, CAB.z);
  }

  // ============================================================ base cabinet
  const { x1, yb, y1, z } = CAB;
  const bx0 = 0.3, bx1 = x1 - 0.3, y0 = 0.4;
  shell.roundBox(bx0, y0, -z, bx1, yb, z, 0.2);
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bx1 - bx0, yb - y0, 2 * z), fillMat);
    m.position.set((bx0 + bx1) / 2, (yb + y0) / 2, 0);
    m.renderOrder = -1;
    root.add(m);
  }
  for (const cx of [bx0 + 0.5, bx1 - 0.5]) for (const cz of [-z + 0.5, z - 0.5]) {
    mechDim.circleZ(cx, 0.2, cz, 0.18, 14);
    mechDim.box(cx - 0.12, 0.34, cz - 0.1, cx + 0.12, 0.4, cz + 0.1);
  }
  // delivery slot in the right-hand end cover
  panel.rectX(x1 - 0.02, DELIV_Y - 0.1, -2.6, DELIV_Y + 0.5, 0.3);

  // The base is just a closed cabinet (nothing of interest inside), so its
  // doors are drawn on and its skin stays solid; only the upper housing opens.
  for (const [dx0, dx1, hx] of [[0.6, 9.5, 9.0], [9.9, 18.8, 10.2]]) {
    panel.rectZ(dx0, 0.7, dx1, 7.6, z + 0.01);
    panel.rectZ(hx, 3.4, hx + 0.2, 5.0, z + 0.02);
  }
  const doors = []; // just the lid
  mats.base = pal.solids.map((c) => solidMat(c, THREE.FrontSide));

  const plane = (geo, mat, px, py, pz, rx = 0, ry = 0, passes = [[mat, SOLID], [mats.cavity, -2]]) => {
    for (const [m, order] of passes) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.rotation.set(rx, ry, 0);
      o.renderOrder = order;
      root.add(o);
    }
  };
  const [sFront, sTop, sSide] = mats.solids;
  {
    const H = Math.PI / 2;
    const [bFront, bTop, bSide] = mats.base;
    const solidOnly = (m) => [[m, 0]];
    const w = bx1 - bx0, h = yb - y0, d = 2 * z, cx = (bx0 + bx1) / 2, cy = (yb + y0) / 2;
    plane(new THREE.PlaneGeometry(w, h), bFront, cx, cy, z, 0, 0, solidOnly(bFront));
    plane(new THREE.PlaneGeometry(w, h), bSide, cx, cy, -z, 0, Math.PI, solidOnly(bSide));
    plane(new THREE.PlaneGeometry(w, d), bTop, cx, yb, 0, -H, 0, solidOnly(bTop));
    plane(new THREE.PlaneGeometry(d, h), bSide, bx0, cy, 0, 0, -H, solidOnly(bSide));
    plane(new THREE.PlaneGeometry(d, h), bSide, bx1, cy, 0, 0, H, solidOnly(bSide));
  }

  // ============================================================ upper housing
  // arched end covers (as in the photo), a back wall with the cooling fan,
  // a sloped control panel at the front left and a lid hinged at the back
  const XC0 = 1.3, XC1 = x1 - 1.3;
  const arch = (sgn, xin) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push([xin - sgn * 1.3 * Math.cos(a), yb + (y1 - yb) * Math.sin(a)]);
    }
    return pts;
  };
  for (const [sgn, xin] of [[1, XC0], [-1, XC1]]) {
    const pts = arch(sgn, xin);
    for (const zz of [-z, z]) shell.poly(pts.map(([x, y]) => [x, y, zz]));
    for (const i of [0, 8, 16]) shell.seg(pts[i][0], pts[i][1], -z, pts[i][0], pts[i][1], z);
    for (const zz of [-z, z]) panel.seg(xin, yb, zz, xin, y1, zz);
    // skins: flat end faces + the curved top strip
    const sh = new THREE.Shape();
    sh.moveTo(xin, yb);
    for (const [x, y] of pts) sh.lineTo(x, y);
    sh.lineTo(xin, yb);
    plane(new THREE.ShapeGeometry(sh), sSide, 0, 0, z);
    plane(new THREE.ShapeGeometry(sh), sSide, 0, 0, -z, 0, 0, [[sSide, SOLID], [mats.cavity, -2]]);
    const v = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      v.push(ax, ay, -z, bx, by, -z, bx, by, z, ax, ay, -z, bx, by, z, ax, ay, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    plane(g, sTop, 0, 0, 0);
  }
  // long edges + back wall
  shell.seg(XC0, y1, -z, XC1, y1, -z);
  shell.seg(XC0, y1, z, XC1, y1, z);
  panel.rectZ(XC0, yb, XC1, y1, -z + 0.01);
  plane(new THREE.PlaneGeometry(XC1 - XC0, y1 - yb), sSide, (XC0 + XC1) / 2, (yb + y1) / 2, -z, 0, Math.PI);
  {
    // cooling fan in the back wall
    const fx = 10.6, fy = 11.0, zf = -z + 0.02;
    mechDim.rectZ(fx - 0.5, fy - 0.5, fx + 0.5, fy + 0.5, zf);
    for (const r of [0.44, 0.3, 0.16]) mechDim.circleZ(fx, fy, zf, r, 24);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      mechDim.seg(fx, fy, zf, fx + 0.44 * Math.cos(a), fy + 0.44 * Math.sin(a), zf);
    }
  }
  // control panel: sloped front at the left end
  {
    const px0 = XC0, px1 = 7.6, zt = z - 0.7, yt = 10.2;
    shell.poly([[px0, yb, z], [px1, yb, z], [px1, yt, zt], [px0, yt, zt]], true);
    shell.poly([[px1, yb, z], [px1, yb, -z + 0.6], [px1, yt, -z + 0.6], [px1, yt, zt]]);
    shell.seg(px0, yt, zt, px0, yt, -z + 0.6);
    shell.seg(px0, yt, -z + 0.6, px1, yt, -z + 0.6);
    // on the slope: display, badge, lamp, e-stop
    const onSlope = (x, u) => [x, yb + (yt - yb) * u, z + (zt - z) * u + 0.01];
    const rectS = (b, xa, xb, ua, ub) => b.poly([onSlope(xa, ua), onSlope(xb, ua), onSlope(xb, ub), onSlope(xa, ub)], true);
    rectS(panel, 1.5, 3.1, 0.62, 0.86);
    rectS(panel, 3.5, 4.4, 0.62, 0.86);
    for (let k = 0; k < 3; k++) panel.poly([onSlope(1.6, 0.35 - k * 0.1), onSlope(6.9 - k * 0.7, 0.35 - k * 0.1)]);
    const circ = (b, cx, u, r, n = 18) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = onSlope(cx + r * Math.cos(a), u + (r * Math.sin(a)) / (yt - yb) * 0.95);
        pts.push(p);
      }
      b.poly(pts, true);
    };
    circ(mech, 5.1, 0.72, 0.13);
    circ(estop, 6.4, 0.72, 0.24, 22);
    circ(estop, 6.4, 0.72, 0.14, 16);
    const g = new THREE.BufferGeometry();
    const P = [onSlope(px0, 0), onSlope(px1, 0), onSlope(px1, 1), onSlope(px0, 1)];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]], 3));
    plane(g, sFront, 0, 0, 0);
  }

  // lid, hinged along the back top edge (opens in the intro)
  {
    const g = new THREE.Group();
    g.position.set(0, y1, -z);
    const b = new Batch();
    b.box(XC0, 0, 0, XC1, 0.08, 2 * z);
    b.rectY(XC0 + 0.4, 0.4, XC1 - 0.4, 2 * z - 0.4, 0.09);
    const dm = { line: mats.door.clone(), solid: mats.doorSolid.clone() };
    const lines = b.build(dm.line);
    lines.renderOrder = SOLID + 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(XC1 - XC0, 2 * z), dm.solid);
    m.rotation.x = -Math.PI / 2;
    m.position.set((XC0 + XC1) / 2, 0.08, z);
    m.renderOrder = SOLID;
    g.add(m, lines);
    root.add(g);
    doors.push({ g, mats: dm });
  }

  // ============================================================ clamp rail + carriage
  mech.box(XC0, 11.5, -z + 0.1, XC1, 11.9, -z + 0.5);
  for (const yy of [11.58, 11.82]) mechDim.seg(XC0 + 0.3, yy, -z + 0.52, XC1 - 0.3, yy, -z + 0.52);
  for (const x of [XC0 + 0.3, XC1 - 0.3]) mechDim.circleZ(x, 11.7, -z + 0.52, 0.12, 14);

  const carriage = new THREE.Group();
  root.add(carriage);
  const jaws = [];
  {
    const ytop = SPINE_Y + BW + 0.3; // bridge clears the top of the block
    part((b) => {
      b.box(-2.0, 11.45, -z + 0.5, 2.0, 11.95, -z + 0.9);
      for (const sx of [-1.8, 1.8]) {
        b.box(sx - 0.07, ytop, -z + 0.5, sx + 0.07, ytop + 0.14, 0.9);
        b.box(sx - 0.07, ytop + 0.14, -z + 0.55, sx + 0.07, 11.45, -z + 0.8);
      }
    }, mats.mech, carriage);
    // jaws: plate + end posts up to the bridge; `sgn` = +1 front, -1 back
    for (const sgn of [1, -1]) {
      const j = part((b) => {
        const { y0: a, y1: c, t, len } = JAW;
        const za = 0, zb = sgn * t;
        b.box(-len / 2, SPINE_Y + a, Math.min(za, zb), len / 2, SPINE_Y + c, Math.max(za, zb));
        for (const sx of [-1.8, 1.8]) b.box(sx - 0.05, SPINE_Y + c - 0.2, Math.min(za, zb), sx + 0.05, ytop, Math.max(za, zb));
        b.seg(-len / 2, SPINE_Y + c - 0.1, zb, len / 2, SPINE_Y + c - 0.1, zb);
      }, mats.mech, carriage);
      j.userData.sgn = sgn;
      jaws.push(j);
    }
  }

  // ============================================================ load: jog plate + stop
  const jog = part((b) => {
    const yt = SPINE_Y - MILL_D - 0.002;
    b.box(XL - 1.7, yt - 0.06, -0.4, XL + 1.7, yt, 0.4);
    b.box(XL - 0.2, yb, -0.2, XL + 0.2, yt - 0.06, 0.2);
  }, mats.mech);
  mechDim.box(XL - 0.5, yb - 0.6, -0.4, XL + 0.5, yb, 0.4);
  mech.box(XL - SPL / 2 - 0.1, SPINE_Y - 0.15, -0.5, XL - SPL / 2 - 0.04, SPINE_Y + 0.4, 0.5);
  mechDim.seg(XL - SPL / 2 - 0.07, SPINE_Y - 0.15, 0, XL - SPL / 2 - 0.07, yb, 0);

  // ============================================================ milling cutter
  const mill = part((b) => {
    const r = 0.75, t = 0.08;
    b.circleY(0, 0, 0, r, 40);
    b.circleY(0, -t, 0, r, 40);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      b.seg(c * 0.18, 0, s * 0.18, c * r, 0, s * r);
      b.seg(c * r, 0, s * r, c * (r - 0.05) - s * 0.06, 0.012, s * (r - 0.05) + c * 0.06); // tooth
      b.seg(c * r, 0, s * r, c * r, -t, s * r);
    }
    b.circleY(0, 0, 0, 0.18, 16);
  }, mats.mech);
  mill.position.set(XM, SPINE_Y - 0.012, 0);
  // spindle, motor, dust hood
  mechDim.seg(XM, SPINE_Y - 0.1, 0, XM, yb - 0.2, 0);
  for (const yy of [yb - 0.2, yb - 1.4]) mechDim.circleY(XM, yy, 0, 0.35, 20);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; mechDim.seg(XM + 0.35 * Math.cos(a), yb - 0.2, 0.35 * Math.sin(a), XM + 0.35 * Math.cos(a), yb - 1.4, 0.35 * Math.sin(a)); }
  mechDim.roundBox(XM - 0.95, SPINE_Y - 0.55, -0.95, XM + 0.95, SPINE_Y - 0.06, 0.95, 0.3);
  mechDim.box(XM + 0.95, SPINE_Y - 0.45, -0.25, XM + 1.3, SPINE_Y - 0.2, 0.25);
  mechDim.seg(XM + 1.3, SPINE_Y - 0.32, 0, XM + 1.3, SPINE_Y - 0.32, -z + 0.3);

  // ============================================================ glue pot
  const glue = {};
  {
    const gx0 = XG - 0.7, gx1 = XSG + 0.45, gy0 = SPINE_Y - 1.15, gy1 = SPINE_Y - 0.3;
    fuser.box(gx0, gy0, -0.8, gx1, gy1, 0.8, true);
    fuser.rectY(gx0 + 0.08, -0.72, gx1 - 0.08, 0.72, gy1 - 0.02);
    // heater element under the pot
    const zig = [];
    for (let i = 0; i <= 14; i++) zig.push([gx0 + 0.15 + ((gx1 - gx0 - 0.3) * i) / 14, gy0 + 0.08, i % 2 ? -0.55 : 0.55]);
    lamp.poly(zig);
    // molten glue surface
    const s = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - gx0 - 0.16, 1.44), mats.glueFill);
    s.rotation.x = -Math.PI / 2;
    s.position.set((gx0 + gx1) / 2, SPINE_Y - 0.62, 0);
    s.renderOrder = 1;
    root.add(s);
    // main glue roller, spinner behind it, then the side-glue wheels
    const rr = 0.32;
    glue.roller = addRotor(XG, SPINE_Y - GT - rr - 0.004, rr, 1.1, { mat: mats.fuser, rate: 1.2 });
    glue.spinner = addRotor(XG + 0.55, SPINE_Y - GT - 0.14 - 0.01, 0.14, 1.0, { mat: mats.mech, sign: -1, rate: 2.6 });
    glue.side = [1, -1].map((sgn) => part((b) => {
      const r = 0.09;
      for (const yy of [-0.03, 0.09]) b.circleY(0, yy, 0, r, 16);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; b.seg(r * Math.cos(a), -0.03, r * Math.sin(a), r * Math.cos(a), 0.09, r * Math.sin(a)); }
      b.seg(0, -0.03, 0, 0, -0.6, 0);
    }, mats.fuser));
    glue.side.forEach((g, i) => g.position.set(XSG, SPINE_Y, (i ? -1 : 1) * (HZ + 0.09)));
  }

  // ============================================================ nipping station
  const nip = {};
  {
    const yt = COVER_Y - 0.002;
    nip.table = part((b) => {
      b.box(XN - 1.6, yt - 0.08, -2.45, XN + 1.6, yt, 2.45);
      for (const zz of [-HZ, HZ]) b.seg(XN - 1.55, yt + 0.001, zz, XN + 1.55, yt + 0.001, zz);
      b.box(XN - 0.25, yt - 1.1, -0.25, XN + 0.25, yt - 0.08, 0.25);
    }, mats.mech);
    // lift cylinder (fixed)
    mechDim.box(XN - 0.4, 5.6, -0.4, XN + 0.4, yt - 1.1 - 0.02, 0.4);
    // creasing bars in the table: pop up to score the cover
    nip.scores = [1, -1].map((sgn) => {
      const g = part((b) => b.box(XN - 1.5, -0.08, -0.015, XN + 1.5, 0, 0.015), mats.mech, nip.table);
      g.position.set(0, yt, sgn * HZ);
      return g;
    });
    // side jaws: rise out of the table, then sweep in to fold the wings
    nip.jaws = [1, -1].map((sgn) => {
      const g = part((b) => {
        b.box(XN - 1.5, 0, 0, XN + 1.5, H1, sgn * 0.1);
        b.box(XN - 0.15, -0.35, sgn * 0.1, XN + 0.15, 0.05, sgn * 0.5);
      }, mats.mech, nip.table);
      g.userData.sgn = sgn;
      return g;
    });
  }

  // ============================================================ cover feed tray (front)
  {
    const ty = COVER_Y - 0.08, hx = SPL / 2 + 0.25;
    mech.box(XN - hx, ty - 0.06, z, XN + hx, ty, CZ0 + CW / 2 + 0.3);
    for (const sx of [-1, 1]) mech.box(XN + sx * hx, ty, z, XN + sx * (hx + 0.06), ty + 0.3, CZ0 + CW / 2 + 0.3);
    // bridge between the tray and the nipping table
    mechDim.rectY(XN - hx, 2.5, XN + hx, z, COVER_Y - 0.004);
    // hood over the feed rollers where the tray enters the machine
    shell.roundBox(XN - hx - 0.2, ty, z, XN + hx + 0.2, ty + 1.25, z + 1.7, 0.12);
    panel.rectZ(XN - hx - 0.2, ty + 0.25, XN + hx + 0.2, ty + 0.9, z + 1.71);
    // stack of covers waiting underneath the top one (printed side down)
    for (let k = 1; k <= 5; k++) stack.rectY(XN - SPL / 2, CZ0 - CW / 2, XN + SPL / 2, CZ0 + CW / 2, COVER_Y - 0.012 * k);
    // feed rollers inside the hood
    for (const dy of [0.16, -0.16]) {
      const o = addRotor(XN, COVER_Y + dy + (dy > 0 ? 0 : -0.05), 0.14, SPL, { mat: mats.mechDim, src: 'cover', sign: dy > 0 ? 1 : -1 });
      o.rotation.y = Math.PI / 2;
      o.position.z = z + 0.8;
    }
    // legs under the tray
    for (const sx of [-1, 1]) mechDim.seg(XN + sx * hx, ty - 0.06, CZ0 + CW / 2 + 0.2, XN + sx * hx, yb - 1.4, z);
  }

  // ============================================================ delivery
  {
    const dx0 = 15.9, dx1 = x1 - 0.05, zz0 = -2.5, zz1 = 0.25;
    for (const zz of [-2.0, -0.35]) {
      belt.seg(dx0, DELIV_Y, zz, dx1, DELIV_Y, zz);
      belt.seg(dx0, DELIV_Y - 0.2, zz, dx1, DELIV_Y - 0.2, zz);
    }
    for (const x of [dx0, dx1]) {
      const o = addRotor(x, DELIV_Y - 0.1, 0.1, 2.9, { mat: mats.mechDim, src: 'belt' });
      o.position.z = (zz0 + zz1) / 2;
    }
    
    // catch tray outside the right-hand end
    const ox1 = XOUT + SPL / 2 + 0.4;
    mech.box(dx1 + 0.05, DELIV_Y - 0.06, zz0, ox1, DELIV_Y - 0.01, zz1);
    mech.box(ox1, DELIV_Y - 0.06, zz0, ox1 + 0.06, DELIV_Y + 0.35, zz1);
    for (const zz of [zz0 + 0.2, zz1 - 0.2]) {
      mechDim.seg(ox1 - 0.2, DELIV_Y - 0.06, zz, ox1 - 0.2, 0, zz);
      mechDim.seg(ox1 - 0.2, DELIV_Y - 3.5, zz, x1 - 0.2, DELIV_Y - 4.2, zz);
    }
  }

  // ============================================================ assemble
  const layers = [
    [shell, mats.shell], [panel, mats.panel], [mech, mats.mech], [mechDim, mats.mechDim],
    [guide, mats.guide], [stack, mats.stack], [grid, mats.grid], [gridMajor, mats.gridMajor], [dim, mats.dim],
    [fuser, mats.fuser], [lamp, mats.lamp], [estop, mats.laser], [belt, mats.belt],
  ];
  const layerSolid = new Map([[mech, 'sMech'], [mechDim, 'sDim'], [fuser, 'sFuser']]);
  for (const [b, m] of layers) {
    const key = layerSolid.get(b);
    const o = root.add(b.build(m, key && sm(key))).children.at(-1);
    if (b === shell || b === panel || b === estop) o.renderOrder = SOLID + 1;
  }

  function setSolid(k) {
    for (const m of solidCache.values()) {
      m.opacity = k;
      m.visible = k > 0.001;
      m.depthWrite = k > 0.5;
    }
  }

  function setTheme(p) {
    for (const k in LINE_MATS) mats[k].color.set(p[k]);
    mats.solids.forEach((m, i) => m.color.set(p.solids[i]));
    mats.base.forEach((m, i) => m.color.set(p.solids[i]));
    mats.cavity.color.set(p.cavity);
    mats.doorSolid.color.set(p.doorSolid);
    mats.door.color.set(p.door);
    mats.glueFill.color.set(p.glue);
    fillMat.color.set(p.fill);
    for (const d of doors) { d.mats.line.color.set(p.door); d.mats.solid.color.set(p.doorSolid); }
    for (const [key, m] of solidCache) m.color.set(p[key]);
  }

  return {
    setTheme, setSolid, root, mats, rotors, doors, carriage, jaws, jog, mill, glue, nip,
  };
}
