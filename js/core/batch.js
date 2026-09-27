// Shared line-work helpers for the wireframe machines.
// Units: 1 = 100 mm. X = length, Y = up, Z = depth (+ = front).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Line batches also record box / cylinder volumes so the internals can be
// shown as solid parts; pass `hollow` for housings that enclose other parts.
export class Batch {
  constructor() { this.v = []; this.solids = []; }
  seg(ax, ay, az, bx, by, bz) { this.v.push(ax, ay, az, bx, by, bz); }
  poly(pts, closed = false) {
    for (let i = 1; i < pts.length; i++) this.seg(...pts[i - 1], ...pts[i]);
    if (closed) this.seg(...pts[pts.length - 1], ...pts[0]);
  }
  box(x0, y0, z0, x1, y1, z1, hollow = false) {
    if (!hollow) this.solids.push(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    const s = (a, b, c, d, e, f) => this.seg(a, b, c, d, e, f);
    for (const z of [z0, z1]) {
      s(x0, y0, z, x1, y0, z); s(x1, y0, z, x1, y1, z); s(x1, y1, z, x0, y1, z); s(x0, y1, z, x0, y0, z);
    }
    s(x0, y0, z0, x0, y0, z1); s(x1, y0, z0, x1, y0, z1); s(x1, y1, z0, x1, y1, z1); s(x0, y1, z0, x0, y1, z1);
  }
  rectZ(x0, y0, x1, y1, z) { this.poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], true); }
  rectY(x0, z0, x1, z1, y) { this.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], true); }
  rectX(x, y0, z0, y1, z1) { this.poly([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], true); }
  circleZ(cx, cy, z, r, n = 32) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); }
    this.poly(pts, true);
  }
  circleY(cx, y, cz, r, n = 32) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    this.poly(pts, true);
  }
  // Rounded rectangle in the XZ plane, extruded along Y (soft vertical corners).
  roundBox(x0, y0, z0, x1, y1, z1, r, n = 5) {
    const c = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, 90], [x0 + r, z0 + r, 180], [x1 - r, z0 + r, 270]];
    const pts = [], ends = [];
    for (const [cx, cz, a0] of c) {
      for (let i = 0; i <= n; i++) {
        const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
        pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
        if (i === 0 || i === n) ends.push(pts.length - 1);
      }
    }
    for (const y of [y0, y1]) this.poly(pts.map(([x, z]) => [x, y, z]), true);
    for (const i of ends) this.seg(pts[i][0], y0, pts[i][1], pts[i][0], y1, pts[i][1]);
  }
  // YZ profile extruded along X; `rails` picks which profile vertices get long edges.
  extrudeX(x0, x1, prof, rails) {
    for (const x of [x0, x1]) this.poly(prof.map(([y, z]) => [x, y, z]), true);
    for (const i of rails) this.seg(x0, prof[i][0], prof[i][1], x1, prof[i][0], prof[i][1]);
  }
  cylZ(cx, cy, r, len, n = 28, axial = 4) {
    this.solids.push(new THREE.CylinderGeometry(r, r, len, n).rotateX(Math.PI / 2).translate(cx, cy, 0));
    this.circleZ(cx, cy, -len / 2, r, n);
    this.circleZ(cx, cy, len / 2, r, n);
    for (let k = 0; k < axial; k++) {
      const a = (k / axial) * Math.PI * 2 + Math.PI / 4;
      this.seg(cx + r * Math.cos(a), cy + r * Math.sin(a), -len / 2, cx + r * Math.cos(a), cy + r * Math.sin(a), len / 2);
    }
  }
  build(mat, solidMat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.v, 3));
    const o = new THREE.LineSegments(g, mat);
    o.frustumCulled = false;
    if (solidMat && this.solids.length) o.add(solidPart(mergeGeometries(this.solids), solidMat));
    return o;
  }
}

export const SOLID = 10; // render order for intro solids: after internals + sheet

export const lm = (color, opacity) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

// Solid internals draw after the cavity (-2) and before the line work, with a
// polygon offset so edges drawn on their faces stay visible.
export function solidPart(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function rollerObj(r, len, mat, solidMat) {
  const b = new Batch();
  const n = Math.max(16, Math.round(r * 70));
  b.circleZ(0, 0, -len / 2, r, n);
  b.circleZ(0, 0, len / 2, r, n);
  for (const z of [-len / 2, len / 2]) {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      b.seg(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22, z, Math.cos(a) * r, Math.sin(a) * r, z);
    }
    b.circleZ(0, 0, z, r * 0.22, 10);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    b.seg(Math.cos(a) * r, Math.sin(a) * r, -len / 2, Math.cos(a) * r, Math.sin(a) * r, len / 2);
  }
  b.seg(0, 0, -len / 2 - 0.18, 0, 0, len / 2 + 0.18);
  const o = b.build(mat);
  o.add(solidPart(new THREE.CylinderGeometry(r, r, len, n).rotateX(Math.PI / 2), solidMat));
  return o;
}
