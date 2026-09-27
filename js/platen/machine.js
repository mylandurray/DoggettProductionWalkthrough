// Wireframe model of a hot-foil platen press, after the Heidelberg "windmill"
// platen fitted with a foil attachment: a cast frame on a pedestal base, a
// vertical heated bed at the back carrying the die, a clamshell platen hinged
// below it, a foil ribbon run across the die from an unwind reel (left) to
// draw rollers and a take-up reel (right), and the two-armed windmill feeding
// cards from the feed pile (right) to the platen and on to the delivery (left).
// Units: 1 = 100 mm. X = left → right (seen by the operator), Y = up, Z = depth (+ = front).
import * as THREE from 'three';
import { Batch, SOLID, lm, solidPart, rollerObj } from '../core/batch.js';
import { PALETTES } from '../theme.js';

// card: 200 × 140 mm, landscape on the platen
export const SW = 2.0, SH = 1.4;
// platen: hinged along X below the bed; face centre (PY, PZ) in the hinge frame
export const YH = 7.4, ZH = -0.44;
export const PY = 3.1, PZ = -0.6;
export const YC = YH + PY;        // card / die centre height with the platen shut
export const ZP = ZH + PZ;        // platen face, shut
export const ZD = ZP - 0.02;      // die face
export const ZF = ZD + 0.09;      // foil ribbon at rest, held just clear of the die
export const AO = (62 * Math.PI) / 180; // platen open angle
// windmill: arm length, idle arm height above the card plane, arm → card while held
export const R = 3.2, HA = 0.36, CUP = 0.176;
// foil: ribbon width, advance per impression, and its run in (x, z) past the die
export const FW = 0.9, STEP = 1.8;
export const FOIL_RUN = { x0: -3.0, guide: 2.2, press: 1.75, draw: 2.6, x1: 3.1 };
export const REEL = { unwind: 0.4, rewind: 0.2 };
// die area, in card UV (the artwork's foil sits in v 0.3–0.7)
export const DIE = { u0: 0.1, u1: 0.9, v0: 0.28, v1: 0.72 };

// The plane the windmill works in: the open platen's face, extended.
// Basis (−X, up the open platen, face normal) so that local +Z faces away from
// the platen and a card's printed side (+Z) points the same way.
export function openPlane() {
  const c = Math.cos(AO), s = Math.sin(AO);
  const O = new THREE.Vector3(0, YH + PY * c - PZ * s, ZH + PY * s + PZ * c);
  const ex = new THREE.Vector3(-1, 0, 0), ev = new THREE.Vector3(0, c, s), en = new THREE.Vector3(0, s, -c);
  const m = new THREE.Matrix4().makeBasis(ex, ev, en).setPosition(O);
  return { O, ex, ev, en, m, at: (x, y, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(m) };
}

// ---------------------------------------------------------------- build
export function createPlaten(scene, pal = PALETTES.light) {
  const root = new THREE.Group();
  scene.add(root);

  const LINE_MATS = {
    shell: 0.5, panel: 0.38, mech: 0.78, mechDim: 0.5, guide: 0.42, stack: 0.55, grid: 1, gridMajor: 1,
    fuser: 0.9, lamp: 0.8, laser: 0.95, foil: 0.9,
  };
  const mats = {};
  for (const k in LINE_MATS) mats[k] = lm(pal[k], LINE_MATS[k]);
  const fillMat = new THREE.MeshBasicMaterial({ color: pal.fill, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const solidMat = (color, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  // skins over the cast frame (fade in the intro) and the pedestal base (stay)
  mats.solids = pal.solids.map((c) => solidMat(c, THREE.FrontSide));
  mats.base = pal.solids.map((c) => solidMat(c, THREE.FrontSide));
  mats.plate = solidMat(pal.doorSolid);
  mats.foilFill = new THREE.MeshBasicMaterial({ color: pal.foil, transparent: true, opacity: 0.85 });
  mats.filmFill = new THREE.MeshBasicMaterial({ color: pal.glassFill, transparent: true, opacity: 0.35, depthWrite: false });
  mats.paperFill = new THREE.MeshBasicMaterial({ color: pal.paper, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

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
  const solidKeyOf = (mat) => (mat === mats.mechDim ? 'sDim' : mat === mats.fuser ? 'sFuser' : 'sMech');
  root.add(new THREE.HemisphereLight('#ffffff', '#b4bfcb', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.1);
  sun.position.set(6, 16, 12);
  root.add(sun);

  const shell = new Batch(), panel = new Batch(), mech = new Batch(), mechDim = new Batch(),
    guide = new Batch(), stack = new Batch(), grid = new Batch(), gridMajor = new Batch(),
    fuser = new Batch(), lamp = new Batch(), estop = new Batch(), foil = new Batch();

  const part = (fn, mat = mats.mech, parent = root) => {
    const b = new Batch();
    fn(b);
    const o = b.build(mat, sm(solidKeyOf(mat)));
    const g = new THREE.Group();
    g.add(o);
    parent.add(g);
    return g;
  };
  // a roller whose axis runs along Y (or X): spin the returned group about that axis
  const rollerY = (x, y, z, r, len, mat = mats.mech, parent = root) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const o = rollerObj(r, len, mat, sm(solidKeyOf(mat)));
    o.rotation.x = Math.PI / 2;
    g.add(o);
    parent.add(g);
    return g;
  };
  const rollerX = (x, y, z, r, len, mat = mats.mech, parent = root) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const o = rollerObj(r, len, mat, sm(solidKeyOf(mat)));
    o.rotation.y = Math.PI / 2;
    g.add(o);
    parent.add(g);
    return g;
  };
  const skin = (geo, mat, order = SOLID) => {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    root.add(m);
    return m;
  };
  const boxGeo = (x0, y0, z0, x1, y1, z1) =>
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

  // ============================================================ floor
  for (let x = -10; x <= 10; x += 1) (x % 5 === 0 ? gridMajor : grid).seg(x, 0, -8, x, 0, 12);
  for (let z = -8; z <= 12; z += 1) (z % 5 === 0 ? gridMajor : grid).seg(-10, 0, z, 10, 0, z);

  // ============================================================ pedestal base
  {
    const x0 = -2.0, x1 = 2.0, y0 = 0.35, y1 = 5.2, z0 = -2.6, z1 = 1.3;
    shell.roundBox(x0, y0, z0, x1, y1, z1, 0.15);
    panel.rectZ(x0 + 0.4, 0.8, x1 - 0.4, 2.2, z1 + 0.01);           // drawer
    panel.rectZ(-0.4, 1.4, 0.4, 1.6, z1 + 0.02);                    // handle
    panel.rectZ(x0 + 0.4, 2.6, x1 - 0.4, 4.8, z1 + 0.01);           // door
    estop.rectZ(1.2, 3.9, 1.5, 4.3, z1 + 0.02);                     // switch
    for (const cx of [x0 + 0.3, x1 - 0.3]) for (const cz of [z0 + 0.3, z1 - 0.3]) mechDim.box(cx - 0.2, 0, cz - 0.2, cx + 0.2, y0, cz + 0.2);
    // pallet-style skid under it, as in the photo
    for (const zz of [z0 - 0.3, (z0 + z1) / 2, z1 + 0.3]) mechDim.box(-3.0, 0, zz - 0.25, 3.0, 0.3, zz + 0.25);
    const g = boxGeo(x0, y0, z0, x1, y1, z1);
    skin(g, mats.base[0], 0);
    // drive motor inside the base
    mechDim.box(0.9, 1.0, -2.3, 1.8, 2.1, -1.3);
    mechDim.circleZ(1.35, 1.55, -2.35, 0.3, 16);
  }

  // ============================================================ cast frame
  // two side frames (profile in (y, z)) joined by the bed casting at the back
  const PROF = [[5.2, -2.8], [5.2, 1.5], [6.4, 1.5], [7.9, 0.3], [9.0, -1.55], [12.9, -1.55], [13.5, -2.1], [13.5, -2.8]];
  for (const [xa, xb] of [[2.1, 2.35], [-2.35, -2.1]]) {
    shell.extrudeX(xa, xb, PROF, PROF.map((_, i) => i));
    const sh = new THREE.Shape(PROF.map(([y, z]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: xb - xa, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(xb, 0, 0);
    skin(g, mats.solids[2]);
  }
  // bed casting + top housing (the inking gear, idle for foil work)
  mech.box(-2.1, 8.4, -2.4, 2.1, 12.7, -1.55);
  shell.box(-2.35, 12.7, -2.8, 2.35, 13.5, -1.55);
  skin(boxGeo(-2.1, 8.4, -2.4, 2.1, 12.7, -1.55), mats.solids[1]);
  skin(boxGeo(-2.35, 12.7, -2.8, 2.35, 13.5, -1.55), mats.solids[1]);
  {
    // ink disc on top, with its drive boss
    const cy = 13.55;
    for (const r of [1.05, 0.95, 0.2]) mechDim.circleY(0, cy, -1.3, r, 40);
    mechDim.seg(0, 13.5, -1.3, 0, cy, -1.3);
    // name plate
    shell.box(-1.6, 13.6, -2.35, 1.6, 14.35, -2.2);
    panel.rectZ(-1.45, 13.72, 1.45, 14.23, -2.19);
    for (const yy of [13.9, 14.05]) panel.seg(-1.1, yy, -2.185, 1.1, yy, -2.185);
    skin(boxGeo(-1.6, 13.6, -2.35, 1.6, 14.35, -2.2), mats.plate);
  }

  // ============================================================ heated bed + die
  const bed = {};
  {
    // heating plate with a honeycomb face the die locks onto
    const hx = 1.6, hy0 = YC - 1.2, hy1 = YC + 1.2, hz0 = -1.55, hz1 = ZD - 0.1;
    fuser.box(-hx, hy0, hz0, hx, hy1, hz1);
    const r = 0.1, dx = r * 1.5, dy = r * Math.sqrt(3);
    for (let i = 0; ; i++) {
      const cx = -hx + 0.14 + i * dx;
      if (cx > hx - 0.12) break;
      for (let cy = hy0 + 0.14 + (i % 2) * (dy / 2); cy < hy1 - 0.1; cy += dy) {
        const pts = [];
        for (let k = 0; k < 6; k++) pts.push([cx + r * 0.8 * Math.cos((k * Math.PI) / 3), cy + r * 0.8 * Math.sin((k * Math.PI) / 3), hz1 + 0.002]);
        mechDim.poly(pts, true);
      }
    }
    // element zig-zag inside the plate
    const zig = [];
    for (let i = 0; i <= 16; i++) zig.push([-hx + 0.15 + ((2 * hx - 0.3) * i) / 16, i % 2 ? hy1 - 0.15 : hy0 + 0.15, (hz0 + hz1) / 2]);
    bed.heater = lm(pal.lamp, 0.3);
    const hb = new Batch();
    hb.poly(zig);
    root.add(hb.build(bed.heater));
    // magnesium die: the face itself is textured in main.js
    const x0 = (DIE.u0 - 0.5) * SW, y0 = YC + (DIE.v0 - 0.5) * SH, y1 = YC + (DIE.v1 - 0.5) * SH;
    mech.box(x0, y0, hz1, -x0, y1, ZD);
    // temperature controller on top of the bed, wired to the plate
    mech.box(-2.2, 12.75, -2.3, -1.1, 13.4, -1.75);
    lamp.rectZ(-2.05, 12.95, -1.55, 13.25, -1.74);
    mechDim.poly([[-1.65, 12.75, -1.8], [-1.65, 12.3, -1.62], [-1.2, hy1, -1.5]]);
  }

  // ============================================================ platen (clamshell)
  const platen = new THREE.Group();
  platen.position.set(0, YH, ZH);
  root.add(platen);
  {
    const fy0 = PY - 1.55, fy1 = PY + 1.55;
    part((b) => {
      b.box(-1.7, fy0, PZ, 1.7, fy1, PZ + 0.22);
      // ribs across the back
      for (const x of [-1.1, 0, 1.1]) b.seg(x, fy0, PZ + 0.22, x, fy1, PZ + 0.22);
      for (const y of [fy0 + 1.0, fy1 - 1.0]) b.seg(-1.7, y, PZ + 0.22, 1.7, y, PZ + 0.22);
      // arms down to the hinge bosses
      for (const s of [-1, 1]) {
        b.poly([[s * 1.7, fy0 + 0.6, PZ + 0.22], [s * 1.95, 0.3, 0.12], [s * 1.95, -0.3, -0.12], [s * 1.7, fy0, PZ]], true);
        b.seg(s * 1.7, fy0 + 0.6, PZ + 0.22, s * 1.7, fy0, PZ);
        b.box(s * 1.95 - 0.12, -0.3, -0.3, s * 1.95 + 0.12, 0.3, 0.3);
      }
    }, mats.mech, platen);
    // tympan (packing sheet) and lays on the face
    const t = new Batch();
    t.rectZ(-1.55, PY - 1.4, 1.55, PY + 1.4, PZ - 0.002);
    const ly = PY - SH / 2;
    for (const x of [-0.55, 0.55]) t.box(x - 0.12, ly - 0.07, PZ - 0.04, x + 0.12, ly - 0.004, PZ);
    t.box(SW / 2 + 0.004, PY - 0.15, PZ - 0.04, SW / 2 + 0.07, PY + 0.15, PZ);
    platen.add(t.build(mats.guide));
  }
  rollerX(0, YH, ZH, 0.12, 4.7, mats.mechDim); // hinge shaft (static)

  // ============================================================ drive
  // flywheel on the right, belted to the motor in the base; handwheel on the left
  const flywheel = rollerX(2.75, 7.2, -1.6, 1.6, 0.2, mats.mech);
  mechDim.poly([[2.75, 1.6, -2.1], [2.75, 7.2, -3.2]]);
  mechDim.poly([[2.75, 1.6, -1.6], [2.75, 7.2, 0.0]]);
  mechDim.circleZ(2.75, 1.6, -1.85, 0.25, 12);
  rollerX(-2.6, 6.2, 0.6, 0.5, 0.08, mats.mech);
  mech.seg(-2.66, 6.2, 1.1, -2.95, 6.2, 1.1);

  // ============================================================ foil unit
  const reels = [];
  {
    const { x0, guide: gx, draw: dx, x1 } = FOIL_RUN;
    const ya = YC - FW / 2 - 0.08, yb = YC + FW / 2 + 0.08;
    // rails top + bottom, bolted to the bed sides
    for (const y of [ya - 0.08, yb + 0.08]) {
      mech.box(x0 - 0.5, y - 0.04, ZD - 0.12, x1 + 0.45, y + 0.04, ZD - 0.06);
      for (const s of [-1, 1]) mechDim.seg(s * 2.4, y, ZD - 0.12, s * 2.1, y, -1.9);
    }
    // unwind reel: full roll of foil
    const u = rollerY(x0, YC, ZF + REEL.unwind, 0.08, FW + 0.3, mats.mechDim);
    const rollGeo = new THREE.CylinderGeometry(REEL.unwind, REEL.unwind, FW, 40, 1, true);
    u.add(new THREE.Mesh(rollGeo, mats.foilFill));
    const ub = new Batch();
    for (const y of [-FW / 2, FW / 2]) ub.circleY(0, y, 0, REEL.unwind, 40);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; ub.seg(REEL.unwind * Math.cos(a), -FW / 2, REEL.unwind * Math.sin(a), REEL.unwind * Math.cos(a), FW / 2, REEL.unwind * Math.sin(a)); }
    u.add(ub.build(mats.foil));
    reels.push({ obj: u, k: -1 / REEL.unwind });
    // guide rollers either side of the die, and the draw rollers that pull the foil on
    for (const x of [-gx, gx]) reels.push({ obj: rollerY(x, YC, ZF - 0.05, 0.05, FW + 0.2, mats.mech), k: 1 / 0.05 });
    reels.push({ obj: rollerY(dx, YC, ZF - 0.07, 0.07, FW + 0.2, mats.mech), k: 1 / 0.07 });
    reels.push({ obj: rollerY(dx, YC, ZF + 0.07, 0.07, FW + 0.2, mats.mech), k: -1 / 0.07 });
    mech.box(dx - 0.2, yb + 0.16, ZF - 0.2, dx + 0.2, yb + 0.5, ZF + 0.2);   // step motor
    mechDim.seg(dx, yb + 0.16, ZF - 0.07, dx, yb + 0.02, ZF - 0.07);
    // take-up reel: the spent carrier film
    const w = rollerY(x1, YC, ZF + REEL.rewind, 0.08, FW + 0.3, mats.mechDim);
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(REEL.rewind, REEL.rewind, FW, 32, 1, true), mats.filmFill));
    const wb = new Batch();
    for (const y of [-FW / 2, FW / 2]) wb.circleY(0, y, 0, REEL.rewind, 28);
    w.add(wb.build(mats.guide));
    reels.push({ obj: w, k: -1 / REEL.rewind });
  }

  // ============================================================ windmill + piles
  // built in the open platen's plane (see openPlane); the hub sits R up the slope
  const P = openPlane();
  const plane = new THREE.Group();
  plane.matrixAutoUpdate = false;
  plane.matrix.copy(P.m);
  root.add(plane);
  const arms = [];
  {
    // hub, and the goose-neck bracket that carries it from the base
    const hub = part((b) => {
      b.circleZ(0, 0, 0, 0.3, 24);
      b.circleZ(0, 0, HA + 0.1, 0.3, 24);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.seg(0.3 * Math.cos(a), 0.3 * Math.sin(a), 0, 0.3 * Math.cos(a), 0.3 * Math.sin(a), HA + 0.1); }
      b.seg(0, 0, -1.2, 0, 0, HA + 0.2);
    }, mats.mech, plane);
    hub.position.set(0, R, 0);
    const h = P.at(0, R, -1.2);
    for (const dx of [-0.12, 0.12]) mechDim.poly([[dx, h.y, h.z], [dx, 7.0, h.z - 0.5], [dx, 5.6, 1.3]]);
    // two arms, half a turn apart: a bar out to a cross-head with suction cups
    for (let i = 0; i < 2; i++) {
      const g = part((b) => {
        b.box(0.3, -0.06, 0, R - 0.1, 0.06, 0.08);
        b.box(R - 0.1, -0.62, 0, R + 0.06, 0.62, 0.06);
        for (const y of [-0.45, 0.45]) {
          for (const z of [0, -CUP + 0.006]) b.circleZ(R - 0.02, y, z, 0.06, 12);
          for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; b.seg(R - 0.02 + 0.06 * Math.cos(a), y + 0.06 * Math.sin(a), 0, R - 0.02 + 0.06 * Math.cos(a), y + 0.06 * Math.sin(a), -CUP + 0.006); }
        }
      }, mats.mech, plane);
      g.position.set(0, R, HA);
      arms.push(g);
    }
    // feed pile (world right = local −X) and delivery pile, cards turned a quarter
    for (const s of [-1, 1]) {
      const cx = s * R, cy = R;
      const b = new Batch();
      const hx = SH / 2, hy = SW / 2;
      b.box(cx - hx - 0.2, cy - hy - 0.25, -0.4, cx + hx + 0.2, cy + hy + 0.25, -0.34);
      for (const sx of [-1, 1]) b.box(cx + sx * (hx + 0.01), cy - hy - 0.1, -0.34, cx + sx * (hx + 0.05), cy + hy + 0.1, 0.12);
      b.box(cx - hx, cy - hy - 0.05, -0.34, cx + hx, cy - hy - 0.01, 0.12); // back stop (downhill end)
      plane.add(b.build(mats.mech, sm('sMech')));
      const st = new Batch();
      for (let k = 1; k <= 8; k++) st.rectZ(cx - hx, cy - hy, cx + hx, cy + hy, -0.34 * (k / 8));
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) st.seg(cx + a * hx, cy + c * hy, -0.34, cx + a * hx, cy + c * hy, -0.002);
      plane.add(st.build(mats.stack));
      const m = new THREE.Mesh(boxGeo(cx - hx, cy - hy, -0.34, cx + hx, cy + hy, -0.004), mats.paperFill);
      plane.add(m);
      // legs down to the frame
      const top = P.at(cx, cy, -0.4);
      mechDim.poly([[top.x, top.y, top.z], [top.x, top.y - 1.2, top.z - 0.5], [Math.sign(top.x) * 2.35, 8.2, 0.2]]);
    }
  }

  // ============================================================ assemble
  const layers = [
    [shell, mats.shell], [panel, mats.panel], [mech, mats.mech], [mechDim, mats.mechDim],
    [guide, mats.guide], [stack, mats.stack], [grid, mats.grid], [gridMajor, mats.gridMajor],
    [fuser, mats.fuser], [lamp, mats.lamp], [estop, mats.laser], [foil, mats.foil],
  ];
  const layerSolid = new Map([[mech, 'sMech'], [mechDim, 'sDim'], [fuser, 'sFuser']]);
  for (const [b, m] of layers) {
    if (!b.v.length) continue;
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
    mats.plate.color.set(p.doorSolid);
    mats.foilFill.color.set(p.foil);
    mats.filmFill.color.set(p.glassFill);
    mats.paperFill.color.set(p.paper).multiplyScalar(p.paperGain);
    bed.heater.color.set(p.lamp);
    fillMat.color.set(p.fill);
    for (const [key, m] of solidCache) m.color.set(p[key]);
  }

  return { setTheme, setSolid, root, mats, plane, P, platen, arms, reels, flywheel, bed };
}
