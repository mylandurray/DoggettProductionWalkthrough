// Wireframe model of a production digital press: high-capacity feeder,
// 5-station tandem engine with intermediate belt, fuser, inverter/duplex,
// cooling + decurl + inline sensor module and finisher.
// Units: 1 = 100 mm. X = length (feed → delivery), Y = up, Z = depth (+ = front).
import * as THREE from 'three';
import { PathBuilder, beltLoop } from './path.js';
import { Batch, SOLID, lm, solidPart, rollerObj } from './core/batch.js';
import { PALETTES } from './theme.js';

export const L = 2.97;        // sheet length (A4 SEF, 297 mm)
export const W = 2.1;         // sheet width (210 mm)
export const PAPER_Y = 5.6;   // main transport height
export const BELT_W = 2.6;

export const STATIONS = [
  { id: 'P', name: 'Specialty', ink: 'Pink', color: '#ffb0d6', x: 16.9 },
  { id: 'Y', name: 'Yellow', ink: 'Y', color: '#ffe14a', x: 15.7 },
  { id: 'M', name: 'Magenta', ink: 'M', color: '#ff4fa8', x: 14.5 },
  { id: 'C', name: 'Cyan', ink: 'C', color: '#2ec8ff', x: 13.3 },
  { id: 'K', name: 'Black', ink: 'K', color: '#aeb8c2', x: 12.1 },
];

// Housings follow the Revoria Press look: soft-cornered white cabinets on
// recessed plinths, a dark slab deck over the engine (the tallest unit), a
// lower decurler pair and a windowed stacker/finisher with a dark top tray,
// both stepping down from the engine body.
export const MODULES = [
  { id: 'hcf', name: 'High-Capacity Feeder', x0: 0, x1: 7, y1: 9.9, z: 3.5 },
  { id: 'engine', name: 'Print Engine', x0: 7, x1: 21.5, y1: 12, z: 3.8 },
  { id: 'cool', name: 'Cool / Decurl / Sense', x0: 21.5, x1: 25, y1: 9.3, z: 3.4 },
  { id: 'fin', name: 'Finisher', x0: 25, x1: 32.1, y1: 9.7, z: 3.6 },
];
export const DECK_Y = 11.2;   // underside of the engine's dark top deck
// Sheets are picked from the HCF's lower tray; FEED_DY shifts the feed head
// (designed around the upper tray at y 7.2) down to it.
export const FEED_Y = 3.38;
export const FEED_DY = FEED_Y - 7.2;
export const FEED_Y_UPPER = 7.2;
export const L_LONG = 6.6;    // long sheet (660 mm), fed from the upper tray after the main story

// ---------------------------------------------------------------- paths
export function buildPaths() {
  // shared legs: tray takeaway + riser into the engine, the transfer / fuser
  // run, and the straight-through delivery to the finisher's top tray
  const riser = (b) => b.toX(5.9).arc(0.5, 90).toY(8.1).arc(0.5, -90).toX(7.6).arc(0.5, -90).toY(6.1).arc(0.5, 90);
  const engine = (b) => b.toX(9.3).mark('reg').toX(10.2).mark('nip').toX(18.75).mark('fuser');
  const finTop = (b) => b
    .toX(21.5).mark('exit')
    .toX(22.5).mark('cool')
    .toX(23.7).mark('decurl')
    .toX(24.45).mark('sensor')
    .toX(25).mark('finEntry')
    .toX(26.1)
    .arc(0.6, 90)
    .toY(7.9)
    .arc(0.6, -90);
  const delivery = (b) => finTop(b)
    .toX(31.7).mark('exitRoll')
    .toX(32.1).mark('finExit')
    .arc(1.0, 8)
    .line(3.1);

  const P1 = engine(riser(new PathBuilder(0.8, FEED_Y, 0)))
    .toX(19.7).mark('div')
    .arc(0.7, -90)
    .toY(1.0)
    .build();

  // Upper-tray feed: joins P1's vertical riser (idle rail in the main story).
  const P0 = new PathBuilder(0.8, FEED_Y_UPPER, 0)
    .toX(5.9)
    .arc(0.5, 90)
    .build();

  const P2 = delivery(engine(new PathBuilder(20.4, 1.0, 90)
    .toY(4.0)
    .arc(0.35, 90)
    .toX(8.3)
    .arc(0.625, -180))).build();

  // Long sheet, simplex: upper tray, through the engine, straight out.
  const P3 = delivery(engine(riser(new PathBuilder(0.8, FEED_Y_UPPER, 0)))).build();

  // Production run, pass 2: as P2, but a gate on the finisher's top run drops
  // the sheet into the stacker, where it lands on the elevator tray.
  const P4 = finTop(engine(new PathBuilder(20.4, 1.0, 90)
    .toY(4.0)
    .arc(0.35, 90)
    .toX(8.3)
    .arc(0.625, -180)))
    .toX(27.5).mark('stkGate')
    .arc(0.5, -90)
    .toY(7.0)
    .arc(0.5, 90)
    .toX(28.6).mark('stkExit')
    .line(L + 0.06)
    .build();

  return { P0, P1, P2, P3, P4 };
}

// ---------------------------------------------------------------- build
export function createPress(scene, pal = PALETTES.light) {
  const { P0, P1, P2, P3, P4 } = buildPaths();
  const root = new THREE.Group();
  scene.add(root);

  const LINE_MATS = {
    shell: 0.5, panel: 0.38, mech: 0.78, mechDim: 0.5, guide: 0.42, stack: 0.55, grid: 1, gridMajor: 1,
    dim: 0.75, fuser: 0.9, lamp: 1, sensor: 0.9, belt: 0.7, beltCross: 0.55, air: 0.8, deck: 0.62, glass: 0.4,
  };
  const mats = { laser: [] };
  for (const k in LINE_MATS) mats[k] = lm(pal[k], LINE_MATS[k]);
  const fillMat = new THREE.MeshBasicMaterial({ color: pal.fill, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  // Solid surfaces for the closed-up intro. They draw after the internals
  // (renderOrder SOLID) so fading them dims what's behind smoothly; polygon
  // offset keeps the housing lines drawn on their faces visible.
  const solidMat = (color, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  mats.solids = pal.solids.map((c) => solidMat(c, THREE.FrontSide)); // front, top, ends/back
  mats.cavity = solidMat(pal.cavity, THREE.BackSide);
  mats.doorSolid = solidMat(pal.doorSolid);
  mats.door = lm(pal.door, 0.75);
  // dark deck / top tray and stacker glass
  mats.deckFill = solidMat(pal.deckFill);
  mats.deckFill.opacity = 0.97;
  mats.glassFill = new THREE.MeshBasicMaterial({ color: pal.glassFill, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });

  // Lit materials for the optional solid internals (keys into the palette;
  // 'st:<id>' = a tinted imaging-station colour).
  const solidCache = new Map();
  const tint = (p, key) => {
    if (!key.startsWith('st:')) return new THREE.Color(p[key]);
    const [c, k] = p.stationTint;
    return new THREE.Color(p.stations[key.slice(3)]).lerp(new THREE.Color(c), k);
  };
  const sm = (key) => {
    if (!solidCache.has(key)) {
      solidCache.set(key, new THREE.MeshLambertMaterial({
        color: tint(pal, key), transparent: true, opacity: 0, visible: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
      }));
    }
    return solidCache.get(key);
  };
  const solidKeyOf = (mat) => mat === mats.mechDim ? 'sDim' : mat === mats.fuser ? 'sFuser'
    : mat.userData.st ? 'st:' + mat.userData.st : 'sMech';
  const guideTris = [];
  root.add(new THREE.HemisphereLight('#ffffff', '#b4bfcb', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.1);
  sun.position.set(-6, 14, 10);
  root.add(sun);

  const shell = new Batch(), panel = new Batch(), mech = new Batch(), mechDim = new Batch(),
    guide = new Batch(), stack = new Batch(), grid = new Batch(), gridMajor = new Batch(), dim = new Batch(),
    deck = new Batch();

  const rotors = [];
  const feedExt = new THREE.Group();
  const addRotor = (x, y, r, len, { mat = mats.mech, src = 'D', sign = 1, parent = root } = {}) => {
    const o = rollerObj(r, len, mat, sm(solidKeyOf(mat)));
    o.position.set(x, y, 0);
    parent.add(o);
    rotors.push({ obj: o, r, src, sign });
    return o;
  };

  const q = [0, 0, 0, 0];
  const pairAt = (path, s, r, len = 2.5, mat = mats.mech) => {
    path.sample(s, q);
    const nx = -q[3], ny = q[2];
    addRotor(q[0] + nx * (r + 0.012), q[1] + ny * (r + 0.012), r, len, { mat, sign: 1 });
    addRotor(q[0] - nx * (r + 0.012), q[1] - ny * (r + 0.012), r, len, { mat, sign: -1 });
  };

  const guides = (path, s0, s1, off = 0.15, z = 1.4) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.08));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      path.sample(s, q);
      const nx = -q[3], ny = q[2];
      const cur = [
        [q[0] + nx * off, q[1] + ny * off],
        [q[0] - nx * off, q[1] - ny * off],
      ];
      if (prev) {
        for (let k = 0; k < 2; k++) {
          for (const zz of [-z, z]) guide.seg(prev[k][0], prev[k][1], zz, cur[k][0], cur[k][1], zz);
          const a = prev[k], b = cur[k];
          guideTris.push(a[0], a[1], -z, b[0], b[1], -z, b[0], b[1], z, a[0], a[1], -z, b[0], b[1], z, a[0], a[1], z);
        }
      }
      if (i === 0 || i === n || i % 10 === 0) {
        for (let k = 0; k < 2; k++) guide.seg(cur[k][0], cur[k][1], -z, cur[k][0], cur[k][1], z);
      }
      prev = cur;
    }
  };

  const fillBox = (x0, y0, z0, x1, y1, z1, mat = fillMat, order = -1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.renderOrder = order;
    root.add(m);
    return m;
  };
  const shellBox = (x0, y0, z0, x1, y1, z1) => {
    shell.roundBox(x0, y0, z0, x1, y1, z1, 0.28);
    fillBox(x0, y0, z0, x1, y1, z1);
  };
  const deckMeshes = [];
  const deckBox = (...a) => deckMeshes.push(fillBox(...a, mats.deckFill, SOLID));

  // Solid cabinet skin; the front face has an opening behind every door.
  let holes = [], modIdx = 0;
  // Every skin face points outward and is single-sided; a back-faced copy in
  // the dark cavity material draws first (before the internals), so looking
  // through an open doorway shows the mechanism against the inside of the
  // cabinet rather than the far wall painted over it.
  const plane = (geo, mat, x, y, z, rx = 0, ry = 0, passes = [[mat, SOLID], [mats.cavity, -2]]) => {
    for (const [m, order] of passes) {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, 0);
      o.renderOrder = order;
      root.add(o);
    }
  };
  const solidBody = (x0, y0, z0, x1, y1, z1) => {
    const [front, top, side] = mats.solids;
    const s = new THREE.Shape().moveTo(x0, y0).lineTo(x1, y0).lineTo(x1, y1).lineTo(x0, y1).lineTo(x0, y0);
    for (const [a, b, c, d] of holes) s.holes.push(new THREE.Path().moveTo(a, b).lineTo(c, b).lineTo(c, d).lineTo(a, d).lineTo(a, b));
    plane(new THREE.ShapeGeometry(s), front, 0, 0, z1);
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const H = Math.PI / 2;
    plane(new THREE.PlaneGeometry(w, h), side, cx, cy, z0, 0, Math.PI);
    plane(new THREE.PlaneGeometry(w, d), top, cx, y1, cz, -H);
    plane(new THREE.PlaneGeometry(w, d), side, cx, y0, cz, H);
    // End walls shared with a neighbouring module get no cavity copy below
    // the neighbour's top, otherwise looking across the joint (e.g. from the
    // decurler back into the inverter) the wall paints over the next unit.
    for (const [x, ry] of [[x0, -H], [x1, H]]) {
      plane(new THREE.PlaneGeometry(d, h), side, x, cy, cz, 0, ry, [[side, SOLID]]);
      const nb = MODULES.find((m) => m.x0 !== x0 && (m.x0 === x || m.x1 === x));
      const yc = nb ? Math.max(y0, nb.id === 'engine' ? DECK_Y : nb.y1) : y0;
      if (y1 - yc > 1e-3) plane(new THREE.PlaneGeometry(d, y1 - yc), null, x, (yc + y1) / 2, cz, 0, ry, [[mats.cavity, -2]]);
    }
    holes = [];
    modIdx++;
  };

  // recessed toe-kick plinth instead of exposed casters
  const plinth = (x0, x1, z) => {
    mechDim.box(x0 + 0.2, 0, -z + 0.35, x1 - 0.2, 0.4, z - 0.35, true);
    mechDim.seg(x0 + 0.2, 0.2, z - 0.35, x1 - 0.2, 0.2, z - 0.35);
  };

  // Door / drawer front with a recessed finger-pull slot, built in its own
  // group around the hinge so the intro can swing it open. `open`: 'L' / 'R'
  // hinge side, 'S' slides out like a drawer.
  const doors = [];
  const door = (x0, y0, x1, y1, f, pull = 'top', open, extra) => {
    open = open || { top: 'S', right: 'L', left: 'R' }[pull] || 'L';
    holes.push([x0, y0, x1, y1]);
    const hx = open === 'R' ? x1 : x0;
    const X = (x) => x - hx;
    const g = new THREE.Group();
    g.position.set(hx, 0, f);
    const b = new Batch();
    b.box(X(x0), y0, -0.08, X(x1), y1, 0);
    const cx = (x0 + x1) / 2, w = Math.min(0.9, (x1 - x0) * 0.3);
    if (pull === 'top') b.rectZ(X(cx - w / 2), y1 - 0.34, X(cx + w / 2), y1 - 0.2, 0);
    else if (pull === 'bottom') b.rectZ(X(cx - w / 2), y0 + 0.2, X(cx + w / 2), y0 + 0.34, 0);
    else if (pull === 'right') b.rectZ(X(x1 - 0.32), (y0 + y1) / 2 - 0.6, X(x1 - 0.2), (y0 + y1) / 2 + 0.6, 0);
    else if (pull === 'left') b.rectZ(X(x0 + 0.2), (y0 + y1) / 2 - 0.6, X(x0 + 0.32), (y0 + y1) / 2 + 0.6, 0);
    if (extra) extra(b, X);
    // own material copies so each door can fade on its own as it opens
    const dm = { line: mats.door.clone(), solid: mats.doorSolid.clone() };
    const lines = b.build(dm.line);
    lines.renderOrder = SOLID + 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), dm.solid);
    m.position.set(X(cx), (y0 + y1) / 2, 0);
    m.renderOrder = SOLID;
    g.add(m, lines);
    root.add(g);
    const d = { g, open, f, mod: modIdx, mats: dm };
    doors.push(d);
    return { g, X, d };
  };

  const sideVents = (x, y0, rows, z0, z1) => {
    for (let i = 0; i < rows; i++) panel.seg(x, y0 + i * 0.16, z0, x, y0 + i * 0.16, z1);
  };

  const paperStack = (x0, y0, y1) => {
    stack.box(x0, y0, -W / 2, x0 + L, y1, W / 2);
    for (let y = y0 + 0.12; y < y1 - 0.02; y += 0.12) {
      stack.seg(x0, y, W / 2, x0 + L, y, W / 2);
      stack.seg(x0 + L, y, -W / 2, x0 + L, y, W / 2);
    }
  };

  // ============================================================ floor + dims
  for (let x = -6; x <= 40; x += 1) (x % 5 === 0 ? gridMajor : grid).seg(x, 0, -10, x, 0, 10);
  for (let z = -10; z <= 10; z += 1) (z % 5 === 0 ? gridMajor : grid).seg(-6, 0, z, 40, 0, z);

  const dimZ = 6.2;
  dim.seg(0, 0.01, dimZ, 35.2, 0.01, dimZ);
  for (const x of [0, 7, 21.5, 25, 32.1, 35.2]) {
    dim.seg(x, 0.01, dimZ - 0.35, x, 0.01, dimZ + 0.35);
    dim.seg(x, 0.01, 3.6, x, 0.01, dimZ - 0.35);
  }
  dim.seg(-1.4, 0, 3.8, -1.4, 12, 3.8);
  dim.seg(-1.75, 0, 3.8, -1.05, 0, 3.8);
  dim.seg(-1.75, 12, 3.8, -1.05, 12, 3.8);
  dim.seg(-1.05, 12, 3.8, 7, 12, 3.8);
  // depth dimension on the right end
  dim.seg(33.2, 0.01, -3.6, 33.2, 0.01, 3.6);
  dim.seg(32.1, 0.01, -3.6, 33.5, 0.01, -3.6);
  dim.seg(32.1, 0.01, 3.6, 33.5, 0.01, 3.6);

  // ============================================================ HCF
  {
    const z = 3.5;
    const y1 = MODULES[0].y1;
    shellBox(0, 0.4, -z, 7, y1, z);
    plinth(0, 7, z);
    const f = z + 0.01;
    // two full-width tray drawers under a slim top band
    door(0.3, 0.6, 6.7, 4.75, f);
    door(0.3, 4.85, 6.7, 9.3, f);
    panel.seg(0.3, 9.45, f, 6.7, 9.45, f);
    sideVents(-0.01, 5.6, 12, -2.2, 2.2);
    solidBody(0, 0.4, -z, 7, y1, z);

    for (const [ty, sy0, sy1] of [[5.0, 5.2, 7.17], [1.0, 1.2, 3.35]]) {
      mechDim.rectY(0.5, -1.55, 5.0, 1.55, ty);
      mechDim.rectX(0.62, ty, -1.3, ty + 2.5, 1.3);
      for (const zz of [-1.13, 1.13]) mechDim.rectZ(1.1, ty, 3.4, ty + 2.5, zz);
      mech.rectY(0.7, -1.2, 4.0, 1.2, sy0 - 0.03);
      paperStack(0.8, sy0, sy1);
      // lift cables
      mechDim.seg(0.9, sy0 - 0.03, -1.2, 0.9, ty + 2.9, -1.2);
      mechDim.seg(3.8, sy0 - 0.03, -1.2, 3.8, ty + 2.9, -1.2);
    }

    // vacuum feed head + air knife over each tray (the sheet uses the lower one)
    for (const d of [0, FEED_DY]) {
      addRotor(3.1, 7.62 + d, 0.17, 2.3);
      addRotor(4.75, 7.62 + d, 0.17, 2.3);
      for (const zz of [-0.95, 0.95]) {
        mech.seg(3.1, 7.45 + d, zz, 4.75, 7.45 + d, zz);
        mech.seg(3.1, 7.79 + d, zz, 4.75, 7.79 + d, zz);
      }
      mech.box(3.35, 7.5 + d, -0.85, 4.5, 7.74 + d, 0.85);
      mech.seg(3.9, 7.74 + d, 0, 3.9, 8.4 + d, 0);
      mech.box(3.7, 8.4 + d, -0.3, 4.1, 8.7 + d, 0.3);
      // air knife
      mech.box(4.0, 6.5 + d, -1.25, 4.4, 7.05 + d, 1.25);
      mech.poly([[4.0, 6.95 + d, -1.2], [3.86, 7.0 + d, -1.2], [3.86, 7.0 + d, 1.2], [4.0, 6.95 + d, 1.2]]);
      mechDim.seg(4.2, 6.5 + d, 0, 4.2, 5.6 + d, 0);
      mechDim.box(4.0, 5.2 + d, -0.4, 4.6, 5.6 + d, 0.4);
    }

    // takeaway, then up the vertical riser past the upper tray
    guides(P1, 4.3, P1.nearest(7.0, 8.6));
    pairAt(P1, P1.nearest(5.5, FEED_Y), 0.13);
    pairAt(P1, P1.nearest(6.4, 5.6), 0.13);
    pairAt(P1, P1.nearest(6.4, 7.85), 0.13);
    // upper-tray takeaway
    guides(P0, 4.3, P0.total);
    pairAt(P0, P0.nearest(5.5, FEED_Y_UPPER), 0.13);
    pairAt(P1, P1.nearest(6.95, 8.6), 0.13);

    // long-sheet extension behind the upper tray: slides out of the back
    // wall to carry a long sheet's overhang (retracted + hidden until used)
    const eb = new Batch(), ey = FEED_Y_UPPER - 0.06;
    eb.rectY(-3.3, -1.3, 0.3, 1.3, ey);
    eb.rectX(-3.3, ey, -1.3, ey + 0.2, 1.3);
    for (const zz of [-1.2, 1.2]) eb.seg(-2.9, ey, zz, -0.05, ey - 1.1, zz);
    for (const zz of [-(W / 2 + 0.1), W / 2 + 0.1]) eb.rectZ(-2.4, ey, -0.6, ey + 0.16, zz);
    feedExt.add(eb.build(mats.mech));
    const ef = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6).rotateX(-Math.PI / 2), fillMat);
    ef.position.set(-1.5, ey - 0.005, 0);
    ef.renderOrder = -1;
    feedExt.add(ef);
    feedExt.visible = false;
    root.add(feedExt);
  }

  // ============================================================ ENGINE
  const belt = {};
  const lasers = [], stationMats = [];
  let polygonMirror, diverter, fuserObjs = [];
  {
    const z = 3.8, f = z + 0.01;
    const top = MODULES[1].y1;
    shellBox(7, 0.4, -z, 21.5, DECK_Y, z);
    plinth(7, 21.5, z);

    // dark slab deck: overhangs the body, soft rounded front edge
    {
      const zb = -z - 0.08, zf = z + 0.18, r = 0.34, n = 5;
      const prof = [[DECK_Y, zb], [top, zb]];
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI / 2) * (1 - i / n);
        prof.push([top - r + r * Math.sin(a), zf - r + r * Math.cos(a)]);
      }
      prof.push([DECK_Y + 0.12, zf], [DECK_Y, zf - 0.12]);
      deck.extrudeX(6.85, 21.65, prof, [0, 1, 2, 2 + n, 4 + n]);
      deckBox(6.85, DECK_Y, zb, 21.65, top, zf);
      // raised hood over the fuser end of the deck
      deck.roundBox(17.4, top, -z + 0.4, 21.3, top + 0.24, z - 0.3, 0.2);
      deckBox(17.4, top, -z + 0.4, 21.3, top + 0.24, z - 0.3);
    }

    // front: three upper doors (toner + imaging access), three tray drawers,
    // tall right-hand door over fuser / inverter
    door(7.3, 4.45, 11.9, 10.95, f, 'bottom', 'L', (b, X) => b.rectZ(X(7.55), 10.45, X(8.75), 10.7, 0));   // maker badge
    door(12.0, 4.45, 16.6, 10.95, f, 'bottom', 'L');
    door(16.7, 4.45, 21.2, 10.95, f, 'bottom', 'R', (b, X) => b.rectZ(X(19.35), 10.45, X(20.95), 10.7, 0));   // model badge
    for (let k = 0; k < 3; k++) door(7.3, 0.6 + k * 1.25, 17.95, 1.78 + k * 1.25, f);
    door(18.05, 0.6, 21.2, 4.35, f, 'left');
    sideVents(21.51, 5.0, 10, -2.8, 2.8);
    solidBody(7, 0.4, -z, 21.5, DECK_Y, z);

    // UI tablet on a short post at the front-left of the deck
    deck.seg(8.1, top, 3.1, 8.1, top + 0.75, 3.3);
    deck.box(7.9, top, 2.9, 8.3, top + 0.06, 3.3);
    const ui = new Batch();
    ui.box(-0.95, -0.6, -0.06, 0.95, 0.6, 0.06);
    ui.rectZ(-0.85, -0.5, 0.85, 0.5, 0.07);
    const uiObj = ui.build(mats.deck);
    uiObj.position.set(8.1, top + 1.05, 3.45);
    uiObj.rotation.x = -0.55;
    uiObj.renderOrder = SOLID + 1;
    root.add(uiObj);

    // internal paper trays
    for (let k = 0; k < 3; k++) {
      const y0 = 0.7 + k * 1.2;
      mechDim.box(8.8, y0, -1.6, 17.8, y0 + 0.9, 1.6, true);
      stack.box(9.3, y0 + 0.08, -W / 2, 9.3 + L, y0 + 0.62 - k * 0.12, W / 2);
      for (let yy = y0 + 0.2; yy < y0 + 0.6 - k * 0.12; yy += 0.12) stack.seg(9.3, yy, W / 2, 9.3 + L, yy, W / 2);
    }

    // entry + transport guides, registration
    guides(P1, P1.nearest(7.05, 8.6), P1.marks.reg - 0.35);
    pairAt(P1, P1.nearest(8.1, 7.3), 0.14);
    pairAt(P1, P1.marks.reg, 0.19, 2.7);
    // edge / skew sensors
    for (const zz of [-1, 1]) {
      const zc = zz * 1.05;
      mech.box(8.78, 5.86, zc - 0.16, 9.02, 6.08, zc + 0.16);
      mats.sensorEdge = mats.sensorEdge || lm(pal.sensor, 0.55);
    }
    const edge = new Batch();
    for (const zz of [-1.05, 1.05]) { edge.seg(8.9, 5.86, zz, 8.9, 5.3, zz); edge.seg(8.84, 5.86, zz, 8.96, 5.3, zz); }
    root.add(edge.build(mats.sensorEdge));

    // intermediate transfer belt
    const A = { x: 10.2, y: PAPER_Y + 0.4, r: 0.4 };
    const Dr = { x: 17.2, y: 6.9, r: 0.3 };
    const C = { x: 17.6, y: 7.9, r: 0.4 };
    const B = { x: 10.35, y: 7.9, r: 0.3 };
    const loop = beltLoop([A, Dr, C, B]);
    const s0 = loop.nearest(A.x, A.y - A.r);
    belt.loop = loop;
    belt.s0 = s0;
    belt.len = loop.total;
    belt.sample = (c, out) => loop.sample(c + s0, out);
    const bl = new Batch();
    for (const zz of [-BELT_W / 2, BELT_W / 2]) bl.poly(loop.pts.map(([x, y]) => [x, y, zz]));
    root.add(bl.build(mats.belt));
    {
      const bp = [], h = BELT_W / 2;
      for (let i = 1; i < loop.pts.length; i++) {
        const [ax, ay] = loop.pts[i - 1], [bx, by] = loop.pts[i];
        bp.push(ax, ay, -h, bx, by, -h, bx, by, h, ax, ay, -h, bx, by, h, ax, ay, h);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      bg.computeVertexNormals();
      root.add(solidPart(bg, sm('sBelt')));
    }
    for (const c of [A, Dr, C, B]) addRotor(c.x, c.y, c.r - 0.02, BELT_W + 0.2, { src: 'm', sign: 1 });
    // 2nd transfer roll
    addRotor(10.2, PAPER_Y - 0.36, 0.34, BELT_W + 0.2, { src: 'm', sign: -1, mat: mats.mech });
    mechDim.box(9.75, PAPER_Y - 0.85, -1.5, 10.65, PAPER_Y - 0.72, 1.5);
    // belt cleaner at the left end
    mech.box(9.55, 7.3, -1.4, 9.95, 7.75, 1.4);

    // moving cross-lines on the belt
    const nCross = Math.floor(belt.len / 0.4);
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nCross * 6), 3));
    const cross = new THREE.LineSegments(crossGeo, mats.beltCross);
    cross.frustumCulled = false;
    root.add(cross);
    belt.cross = cross;
    belt.nCross = nCross;

    // top-run height at x
    const topPts = loop.pts.filter(([, y]) => y > 7.6);
    const topY = (x) => {
      let best = topPts[0];
      for (const p of topPts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
      return best[1];
    };

    // imaging stations
    const ros = { x0: 11.5, x1: 17.6, y0: 9.7, y1: 10.5 };
    mech.box(ros.x0, ros.y0, -1.5, ros.x1, ros.y1, 1.5, true);
    mechDim.rectY(ros.x0 + 0.2, -1.2, ros.x1 - 0.2, 1.2, ros.y0 + 0.1);
    for (let i = 0; i < 6; i++) mechDim.seg(ros.x0 + 0.4, ros.y0 + 0.25 + i * 0.07, 0, ros.x1 - 0.4, ros.y0 + 0.25 + i * 0.07, 0);
    {
      const pm = new Batch();
      const hex = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; hex.push([Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]); }
      pm.poly(hex, true);
      pm.poly(hex.map(([x, , z]) => [x, 0.14, z]), true);
      for (const [x, , z] of hex) pm.seg(x, 0, z, x, 0.14, z);
      polygonMirror = pm.build(mats.mech);
      polygonMirror.position.set(14.0, 10.03, 0);
      root.add(polygonMirror);
    }

    belt.stations = [];
    for (const s of STATIONS) {
      const ty = topY(s.x);
      const yc = ty + 0.38 + 0.015;
      const drumMat = lm(pal.stations[s.id], 0.9);
      const dimMat = lm(pal.stations[s.id], 0.45);
      drumMat.userData.st = dimMat.userData.st = s.id;
      stationMats.push({ id: s.id, drumMat, dimMat });
      addRotor(s.x, yc, 0.38, 3.0, { mat: drumMat, src: 'm', sign: -1 });
      addRotor(s.x, ty - 0.14, 0.12, BELT_W, { src: 'm', sign: 1, mat: mats.mechDim });
      addRotor(s.x + 0.497, yc + 0.133, 0.13, 2.9, { src: 'm', sign: 1, mat: dimMat });
      addRotor(s.x - 0.369, yc + 0.258, 0.07, 2.9, { src: 'm', sign: 1, mat: mats.mechDim });
      const hb = new Batch();
      hb.box(s.x + 0.42, yc - 0.12, -1.5, s.x + 0.76, yc + 0.72, 1.5);
      hb.box(s.x - 0.3, yc + 0.44, -1.45, s.x - 0.05, yc + 0.62, 1.45);
      // toner bottle + hopper pipe
      hb.cylZ(s.x, 11.05, 0.24, 3.4, 24, 4);
      hb.seg(s.x, 10.81, -1.9, s.x, 10.2, -1.9);
      hb.seg(s.x, 10.2, -1.9, s.x + 0.6, yc + 0.72, -1.9);
      hb.seg(s.x + 0.6, yc + 0.72, -1.9, s.x + 0.6, yc + 0.72, -1.5);
      root.add(hb.build(dimMat, sm('st:' + s.id)));

      // laser scan fan
      const lb = new Batch();
      const tx = s.x + 0.13, tyy = yc + 0.357;
      lb.seg(tx, ros.y0, 0, tx, tyy, 0);
      lb.seg(tx, ros.y0, 0, tx, tyy, -1.3);
      lb.seg(tx, ros.y0, 0, tx, tyy, 1.3);
      lb.seg(tx, tyy, -1.3, tx, tyy, 1.3);
      const lmat = lm(pal.laser, 0);
      const lo = lb.build(lmat);
      root.add(lo);
      lasers.push(lmat);

      const c = (loop.nearest(s.x, ty) - s0 + belt.len) % belt.len;
      belt.stations.push({ ...s, c, drumY: yc, beltY: ty });
    }
    belt.stations.sort((a, b) => a.c - b.c);

    // transport under belt, fuser
    guides(P1, P1.marks.nip + 0.55, P1.marks.fuser - 0.85, 0.15);
    for (const x of [12.0, 14.0, 16.0]) mechDim.rectY(x - 0.6, -1.3, x + 0.6, 1.3, PAPER_Y - 0.17);
    {
      const fx = 18.75;
      mech.box(18.05, 4.4, -1.8, 19.45, 7.0, 1.8, true);
      fuserObjs.push(addRotor(fx, PAPER_Y + 0.56, 0.55, 3.2, { mat: mats.fuser, sign: 1 }));
      addRotor(fx, PAPER_Y - 0.51, 0.5, 3.2, { sign: -1 });
      const lamp = new Batch();
      for (const [dx, dy] of [[-0.14, 0.08], [0.14, 0.08], [0, -0.14]]) lamp.seg(fx + dx, PAPER_Y + 0.56 + dy, -1.5, fx + dx, PAPER_Y + 0.56 + dy, 1.5);
      root.add(lamp.build(mats.lamp));
      mech.box(fx - 0.12, PAPER_Y + 1.12, -0.2, fx + 0.12, PAPER_Y + 1.3, 0.2);
      mechDim.box(fx - 0.9, PAPER_Y - 0.03, -1.5, fx - 0.62, PAPER_Y + 0.03, 1.5);
    }

    // diverter gate
    {
      const d = new Batch();
      const tri = [[0.02, 0], [-0.42, 0.1], [-0.42, -0.1]];
      for (const zz of [-1.35, 1.35]) d.poly(tri.map(([x, y]) => [x, y, zz]), true);
      for (const [x, y] of tri) d.seg(x, y, -1.35, x, y, 1.35);
      diverter = d.build(mats.mech);
      diverter.position.set(19.9, PAPER_Y, 0);
      root.add(diverter);
    }

    // inverter + duplex
    guides(P1, P1.marks.div + 0.1, P1.total, 0.15);
    pairAt(P1, P1.nearest(20.4, 4.3), 0.15);
    pairAt(P1, P1.nearest(20.4, 2.0), 0.15);
    mechDim.box(20.1, 0.55, -1.4, 20.7, 0.8, 1.4);
    guides(P2, P2.nearest(20.05, 4.35), P2.marks.reg - 0.35, 0.14);
    for (const x of [18.0, 15.0, 12.0, 9.3]) pairAt(P2, P2.nearest(x, 4.35), 0.14);
    pairAt(P2, P2.nearest(7.675, 4.975), 0.14);
    guides(P2, P2.marks.fuser + 0.75, P2.marks.exit - 0.2, 0.15);
    pairAt(P2, P2.nearest(21.15, PAPER_Y), 0.15);
  }

  // ============================================================ COOL / DECURL / SENSE
  let fan, sensorMat;
  {
    const z = MODULES[2].z, f = z + 0.01;
    // low interface unit stepping down from the engine: a narrow cooling
    // door on the left, a wider decurl / sensor bay split upper + lower
    const y1 = MODULES[2].y1;
    shellBox(21.5, 0.4, -z, 25, y1, z);
    plinth(21.5, 25, z);
    door(21.7, 0.6, 23.1, 8.55, f, 'right', 'L', (b, X) => {
      for (let i = 0; i < 6; i++) b.seg(X(21.95), 1.0 + i * 0.16, 0, X(22.85), 1.0 + i * 0.16, 0);
    });
    door(23.2, 4.1, 24.8, 8.55, f, 'left', 'R');
    door(23.2, 0.6, 24.8, 4.0, f, 'left', 'R');
    panel.seg(21.5, 8.75, f, 25, 8.75, f);
    panel.rectZ(21.9, 8.9, 22.9, 9.1, f);     // status lamp strip
    solidBody(21.5, 0.4, -z, 25, y1, z);

    for (const y of [PAPER_Y + 0.33, PAPER_Y - 0.33]) {
      addRotor(21.95, y, 0.31, 2.6, { sign: y > PAPER_Y ? 1 : -1 });
      addRotor(23.05, y, 0.31, 2.6, { sign: y > PAPER_Y ? 1 : -1 });
      for (const zz of [-1.25, 1.25]) {
        mech.seg(21.95, y + 0.31, zz, 23.05, y + 0.31, zz);
        mech.seg(21.95, y - 0.31, zz, 23.05, y - 0.31, zz);
      }
    }
    for (let x = 22.0; x <= 23.01; x += 0.1) {
      for (const [y0, y1] of [[6.35, 7.2], [4.0, 4.85]]) {
        mechDim.seg(x, y0, -1.5, x, y1, -1.5);
        mechDim.seg(x, y0, 1.5, x, y1, 1.5);
        mechDim.seg(x, y1, -1.5, x, y1, 1.5);
      }
    }
    mech.rectY(21.9, -1.6, 23.1, 1.6, 7.2);
    mech.rectY(21.9, -1.6, 23.1, 1.6, 4.0);
    mech.circleY(22.5, 7.35, 0, 0.5, 32);
    mech.box(21.9, 7.2, -0.6, 23.1, 7.5, 0.6, true);
    {
      const fb = new Batch();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        fb.poly([[0, 0, 0], [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [Math.cos(a + 0.5) * 0.4, 0, Math.sin(a + 0.5) * 0.4], [0, 0, 0]]);
      }
      fan = fb.build(mats.mech);
      fan.position.set(22.5, 7.38, 0);
      root.add(fan);
    }
    guides(P2, P2.marks.cool + 0.9, P2.marks.decurl - 0.35, 0.15);
    pairAt(P2, P2.marks.decurl, 0.2, 2.6);
    addRotor(23.95, PAPER_Y + 0.42, 0.12, 2.4, { mat: mats.mechDim });
    mechDim.seg(23.95, PAPER_Y + 0.54, 0, 23.95, PAPER_Y + 1.2, 0);
    mechDim.box(23.8, PAPER_Y + 1.2, -0.25, 24.1, PAPER_Y + 1.45, 0.25);
    // inline sensor
    const sx = P2.sample(P2.marks.sensor, q)[0];
    mech.box(sx - 0.25, 5.95, -1.6, sx + 0.25, 6.75, 1.6);
    mech.rectY(sx - 0.12, -1.35, sx + 0.12, 1.35, 5.95);
    sensorMat = lm(pal.sensor, 0.25);
    const sb = new Batch();
    for (const zz of [-1.3, 1.3]) { sb.seg(sx, 5.95, zz, sx, PAPER_Y + 0.02, zz); }
    sb.seg(sx, PAPER_Y + 0.02, -1.3, sx, PAPER_Y + 0.02, 1.3);
    sb.seg(sx, 5.95, 0, sx, PAPER_Y + 0.02, 0);
    root.add(sb.build(sensorMat));
    mechDim.rectY(sx - 0.2, -1.2, sx + 0.2, 1.2, PAPER_Y - 0.25);
    guides(P2, P2.marks.decurl + 0.35, P2.marks.sensor - 0.3, 0.15);
    guides(P2, P2.marks.sensor + 0.3, P2.marks.finEntry + 0.6, 0.15);
    pairAt(P2, P2.marks.finEntry - 0.2, 0.14);
  }

  // ============================================================ FINISHER
  const out = {};
  {
    const z = 3.6, f = z + 0.01;
    const y1 = MODULES[3].y1;
    shellBox(25, 0.4, -z, 32.1, y1, z);
    plinth(25, 28.3, z); // open bay on the right for the stacker trolley
    // left service door, right-hand stack window under an upper panel
    door(25.3, 0.6, 27.9, 9.4, f, 'right');
    door(28.0, 6.95, 31.8, 9.4, f, 'bottom', 'R');
    {
      // windowed front door over the stack
      const { g: wd, X, d: wdd } = door(28.0, 0.6, 31.8, 6.85, f, null, 'R');
      const gx0 = X(28.3), gx1 = X(31.5), gy0 = 0.95, gy1 = 6.55, gz = 0.005;
      const gb = new Batch();
      gb.rectZ(gx0, gy0, gx1, gy1, gz);
      gb.rectZ(gx0 + 0.1, gy0 + 0.1, gx1 - 0.1, gy1 - 0.1, gz - 0.07);
      for (const [a, b] of [[0.4, 1.6], [0.9, 2.3]]) gb.seg(gx0 + a, gy1 - 0.3, gz, gx0 + b, gy1 - 1.9, gz);
      wdd.mats.glass = mats.glass.clone();
      wdd.mats.glassFill = mats.glassFill.clone();
      const gl = gb.build(wdd.mats.glass);
      gl.renderOrder = SOLID + 2;
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - gx0, gy1 - gy0), wdd.mats.glassFill);
      gm.position.set((gx0 + gx1) / 2, (gy0 + gy1) / 2, gz);
      gm.renderOrder = SOLID + 1;
      wd.add(gm, gl);
      // cut the window out of the solid door so the stack shows through
      const [, y0d, x1d, y1d] = [0, 0.6, X(28.0), 6.85];
      const ds = new THREE.Shape().moveTo(x1d, y0d).lineTo(0, y0d).lineTo(0, y1d).lineTo(x1d, y1d).lineTo(x1d, y0d);
      ds.holes.push(new THREE.Path().moveTo(gx0, gy0).lineTo(gx1, gy0).lineTo(gx1, gy1).lineTo(gx0, gy1).lineTo(gx0, gy0));
      const dm = wd.children[0];
      dm.geometry.dispose();
      dm.geometry = new THREE.ShapeGeometry(ds);
      dm.position.set(0, 0, 0);
    }
    // dark recessed top tray on the lid
    deck.rectY(28.2, -3.25, 31.85, 3.25, y1 + 0.01);
    deck.rectY(28.4, -3.05, 31.65, 3.05, y1 - 0.12);
    deck.box(31.65, y1, -3.25, 31.85, y1 + 0.3, 3.25);
    deckBox(28.2, y1 - 0.12, -3.25, 31.85, y1 + 0.01, 3.25);
    sideVents(24.99, 1.2, 8, -2.4, 2.4);
    solidBody(25, 0.4, -z, 32.1, y1, z);

    guides(P2, P2.marks.finEntry + 0.6, P2.marks.exitRoll - 0.25, 0.15);
    pairAt(P2, P2.nearest(26.7, 7.4), 0.14);
    pairAt(P2, P2.nearest(28.9, 8.5), 0.14);
    pairAt(P2, P2.marks.exitRoll, 0.18, 2.7);

    // punch unit
    mech.box(27.8, 8.8, -1.6, 28.4, 9.3, 1.6);

    // high-capacity stacker behind the window: a gate on the top run drops
    // sheets to the stacker exit rolls; they land on an elevator tray that
    // starts high and steps down as the stack grows, then lowers right down
    // onto a trolley that is wheeled out of the front
    const sy = P4.sample(P4.marks.stkExit, q)[1];
    guides(P4, P4.marks.stkGate + 0.15, P4.marks.stkExit - 0.3, 0.15);
    pairAt(P4, P4.marks.stkExit - 0.15, 0.14);
    // gate flap where the stacker route leaves the top run
    mech.seg(27.45, 8.5, -1.3, 27.45, 8.5, 1.3);
    // trailing-edge wall under the exit rolls + elevator posts at the back
    mechDim.rectX(28.5, sy - 0.75, -1.3, sy - 0.12, 1.3);
    for (const x of [28.9, 31.3]) mechDim.box(x - 0.06, 0.6, -1.86, x + 0.06, sy, -1.74);
    const stk = {};
    const SX0 = 28.5, SX1 = 31.8;
    {
      // carriage: rides up and down the posts, arms reaching under the tray
      const g = new THREE.Group(), b = new Batch();
      for (const x of [28.9, 31.3]) b.box(x - 0.05, -0.08, -1.74, x + 0.05, 0, 1.0);
      b.seg(28.9, -0.04, -1.74, 31.3, -0.04, -1.74);
      g.add(b.build(mats.mech, sm('sMech')));
      root.add(g);
      stk.carriage = g;
    }
    {
      // tray plate: its top is at the group's y
      const g = new THREE.Group(), b = new Batch();
      b.box(SX0, -0.06, -1.35, SX1, 0, 1.35);
      g.add(b.build(mats.mech, sm('sMech')));
      root.add(g);
      stk.plate = g;
    }
    {
      // trolley: deck on four castors with a push handle at the front
      const g = new THREE.Group(), b = new Batch();
      const top = 0.86;
      b.box(SX0 - 0.1, top - 0.1, -1.5, SX1 + 0.1, top, 1.5);
      for (const x of [SX0 + 0.15, SX1 - 0.15]) for (const z of [-1.3, 1.3]) {
        b.seg(x, top - 0.1, z, x, 0.34, z);
        const n = 10;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
          b.seg(x + 0.16 * Math.cos(a0), 0.17 + 0.16 * Math.sin(a0), z, x + 0.16 * Math.cos(a1), 0.17 + 0.16 * Math.sin(a1), z);
        }
      }
      for (const x of [SX0 + 0.2, SX1 - 0.2]) b.seg(x, top, 1.5, x, 2.1, 1.75);
      b.seg(SX0 + 0.2, 2.1, 1.75, SX1 - 0.2, 2.1, 1.75);
      g.add(b.build(mats.mech, sm('sMech')));
      root.add(g);
      stk.cart = g;
      stk.low = top + 0.06; // tray top when it sits on the trolley
    }
    // side joggers, fixed at the top of the stack
    stk.joggers = [-1, 1].map((side) => {
      const g = new THREE.Group(), b = new Batch();
      b.rectZ(28.95, sy - 0.5, 31.2, sy - 0.04, 0);
      b.seg(28.95, sy - 0.12, 0, 31.2, sy - 0.12, 0);
      g.add(b.build(mats.mech));
      g.userData.side = side;
      root.add(g);
      return g;
    });
    stk.y = sy;
    out.stk = stk;

    // output tray
    const e = P2.total;
    const mid = P2.sample(e - L / 2, [0, 0, 0, 0]);
    const ang = Math.atan2(mid[3], mid[2]);
    const tray = new THREE.Group();
    tray.position.set(mid[0], mid[1], 0);
    tray.rotation.z = ang;
    root.add(tray);
    const tb = new Batch();
    tb.rectY(-L / 2 - 0.35, -1.45, L / 2 + 0.25, 1.45, -0.34);
    tb.rectY(-L / 2 - 0.35, -1.45, L / 2 + 0.25, 1.45, -0.44);
    tray.add(tb.build(mats.mech));
    // end stop on its own hinge so it can fold flat for a long sheet
    const stop = new THREE.Group();
    stop.position.set(L / 2 + 0.25, -0.44, 0);
    const stb = new Batch();
    stb.rectX(0, 0, -1.2, 0.49, 1.2);
    stop.add(stb.build(mats.mech));
    tray.add(stop);
    // pull-out extension for long sheets (retracted + hidden until used)
    const ext = new THREE.Group();
    const xb = new Batch(), e0 = L / 2 + 0.1, e1 = e0 + 3.6;
    xb.rectY(e0, -1.3, e1, 1.3, -0.38);
    xb.rectX(e1, -0.38, -1.1, -0.2, 1.1);
    ext.add(xb.build(mats.mech));
    ext.visible = false;
    tray.add(ext);
    out.stop = stop;
    out.ext = ext;
    out.extLen = 3.6;
    const sb = new Batch();
    sb.box(-L / 2, -0.33, -W / 2, L / 2, -0.03, W / 2);
    for (let y = -0.23; y < -0.03; y += 0.1) sb.seg(-L / 2, y, W / 2, L / 2, y, W / 2);
    tray.add(sb.build(mats.stack, sm('sPaper')));
    out.tray = tray;
  }

  // ============================================================ assemble
  const layers = [
    [shell, mats.shell], [panel, mats.panel], [mech, mats.mech], [mechDim, mats.mechDim],
    [guide, mats.guide], [stack, mats.stack], [grid, mats.grid], [gridMajor, mats.gridMajor], [dim, mats.dim],
    [deck, mats.deck],
  ];
  const layerSolid = new Map([[mech, 'sMech'], [mechDim, 'sDim'], [stack, 'sPaper']]);
  for (const [b, m] of layers) {
    const key = layerSolid.get(b);
    const o = root.add(b.build(m, key && sm(key))).children.at(-1);
    // housing lines sit on the solid skins, so draw them after
    if (b === shell || b === panel || b === deck) o.renderOrder = SOLID + 1;
  }

  // translucent paper guides: the sheet always draws over them
  {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(guideTris, 3));
    gg.computeVertexNormals();
    const gm = sm('sGuide');
    gm.depthWrite = false;
    gm.userData.maxOpacity = 0.35;
    root.add(solidPart(gg, gm));
  }

  // Fade the solid internals in (k = 1) or out (k = 0).
  function setSolid(k) {
    for (const m of solidCache.values()) {
      const max = m.userData.maxOpacity ?? 1;
      m.opacity = k * max;
      m.visible = k > 0.001;
      if (max === 1) m.depthWrite = k > 0.5;
    }
  }

  // air-knife streaks (animated)
  const nAir = 14;
  const airGeo = new THREE.BufferGeometry();
  airGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nAir * 6), 3));
  const air = new THREE.LineSegments(airGeo, mats.air);
  air.frustumCulled = false;
  root.add(air);

  // Recolour everything in place for a theme switch (materials are shared,
  // and each door owns clones so its fade stays independent).
  function setTheme(p) {
    for (const k in LINE_MATS) mats[k].color.set(p[k]);
    mats.solids.forEach((m, i) => m.color.set(p.solids[i]));
    mats.cavity.color.set(p.cavity);
    mats.doorSolid.color.set(p.doorSolid);
    mats.door.color.set(p.door);
    mats.deckFill.color.set(p.deckFill);
    mats.glassFill.color.set(p.glassFill);
    fillMat.color.set(p.fill);
    for (const d of doors) {
      d.mats.line.color.set(p.door);
      d.mats.solid.color.set(p.doorSolid);
      if (d.mats.glass) { d.mats.glass.color.set(p.glass); d.mats.glassFill.color.set(p.glassFill); }
    }
    if (mats.sensorEdge) mats.sensorEdge.color.set(p.sensor);
    sensorMat.color.set(p.sensor);
    for (const l of lasers) l.color.set(p.laser);
    for (const st of stationMats) { st.drumMat.color.set(p.stations[st.id]); st.dimMat.color.set(p.stations[st.id]); }
    for (const [key, m] of solidCache) m.color.copy(tint(p, key));
  }

  return {
    setTheme, setSolid, root, P0, P1, P2, P3, P4, feedExt, mats, rotors, doors, deckMeshes, belt, lasers, polygonMirror, diverter, fan, sensorMat, air, nAir, out,
  };
}
