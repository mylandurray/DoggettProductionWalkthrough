// 2D path helpers (x = machine length, y = height). The paper path lives in
// the XY plane; sheet width extends along Z.

export class Polyline {
  constructor(pts, markIdx = {}, closed = false) {
    this.closed = closed;
    this.pts = closed ? [...pts, pts[0]] : pts;
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1];
      const [bx, by] = this.pts[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    this.total = this.cum[this.cum.length - 1];
    this.marks = {};
    for (const k in markIdx) this.marks[k] = this.cum[markIdx[k]];
  }

  // Returns [x, y, tx, ty]. Open paths extrapolate straight past either end.
  sample(s, out = [0, 0, 0, 0]) {
    const T = this.total;
    const p = this.pts;
    if (this.closed) s = ((s % T) + T) % T;
    if (!this.closed && s <= 0) {
      const [ax, ay] = p[0], [bx, by] = p[1];
      const l = Math.hypot(bx - ax, by - ay);
      const tx = (bx - ax) / l, ty = (by - ay) / l;
      out[0] = ax + tx * s; out[1] = ay + ty * s; out[2] = tx; out[3] = ty;
      return out;
    }
    if (!this.closed && s >= T) {
      const n = p.length;
      const [ax, ay] = p[n - 2], [bx, by] = p[n - 1];
      const l = Math.hypot(bx - ax, by - ay);
      const tx = (bx - ax) / l, ty = (by - ay) / l;
      out[0] = bx + tx * (s - T); out[1] = by + ty * (s - T); out[2] = tx; out[3] = ty;
      return out;
    }
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1e-9;
    const f = (s - this.cum[lo]) / seg;
    const [ax, ay] = p[lo], [bx, by] = p[hi];
    out[0] = ax + (bx - ax) * f;
    out[1] = ay + (by - ay) * f;
    out[2] = (bx - ax) / seg;
    out[3] = (by - ay) / seg;
    return out;
  }

  // Index of the last vertex at or before arc length s.
  indexAt(s) {
    if (s <= 0) return 0;
    if (s >= this.total) return this.pts.length - 1;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid;
    }
    return lo;
  }

  nearest(x, y) {
    let best = Infinity, bestS = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy || 1e-9;
      let f = ((x - ax) * dx + (y - ay) * dy) / l2;
      f = Math.max(0, Math.min(1, f));
      const px = ax + dx * f, py = ay + dy * f;
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) { best = d; bestS = this.cum[i - 1] + Math.sqrt(l2) * f; }
    }
    return bestS;
  }
}

// Turtle-style builder: straight runs and constant-radius turns.
export class PathBuilder {
  constructor(x, y, headingDeg) {
    this.x = x; this.y = y;
    this.h = (headingDeg * Math.PI) / 180;
    this.pts = [[x, y]];
    this.markIdx = {};
  }
  _push(x, y) { this.x = x; this.y = y; this.pts.push([x, y]); }
  line(len) {
    if (len < 1e-6) return this;
    const n = Math.max(1, Math.ceil(len / 0.1));
    const x0 = this.x, y0 = this.y, c = Math.cos(this.h), s = Math.sin(this.h);
    for (let i = 1; i <= n; i++) this._push(x0 + (c * len * i) / n, y0 + (s * len * i) / n);
    return this;
  }
  toX(x) { return this.line((x - this.x) / Math.cos(this.h)); }
  toY(y) { return this.line((y - this.y) / Math.sin(this.h)); }
  // Positive degrees turn left (counter-clockwise).
  arc(r, deg) {
    const d = Math.sign(deg), th = (Math.abs(deg) * Math.PI) / 180;
    const cx = this.x + r * Math.cos(this.h + (d * Math.PI) / 2);
    const cy = this.y + r * Math.sin(this.h + (d * Math.PI) / 2);
    const a0 = this.h - (d * Math.PI) / 2;
    const n = Math.max(4, Math.ceil((th * r) / 0.03));
    for (let i = 1; i <= n; i++) {
      const a = a0 + (d * th * i) / n;
      this._push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    this.h += d * th;
    return this;
  }
  mark(name) { this.markIdx[name] = this.pts.length - 1; return this; }
  build() { return new Polyline(this.pts, this.markIdx); }
}

// Closed belt wrapped around circles given in counter-clockwise order.
export function beltLoop(circles) {
  const n = circles.length;
  const tan = [];
  for (let i = 0; i < n; i++) {
    const a = circles[i], b = circles[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
    const ux = dx / dist, uy = dy / dist;
    const rx = uy, ry = -ux; // right-hand normal = outward for a CCW loop
    const sinT = (a.r - b.r) / dist, cosT = Math.sqrt(1 - sinT * sinT);
    const nx = rx * cosT + ux * sinT, ny = ry * cosT + uy * sinT;
    tan.push({ ang: Math.atan2(ny, nx), p0: [a.x + a.r * nx, a.y + a.r * ny], p1: [b.x + b.r * nx, b.y + b.r * ny] });
  }
  const pts = [];
  for (let j = 0; j < n; j++) {
    const c = circles[j];
    let aIn = tan[(j - 1 + n) % n].ang, aOut = tan[j].ang;
    while (aOut < aIn) aOut += Math.PI * 2;
    const steps = Math.max(3, Math.ceil(((aOut - aIn) * c.r) / 0.03));
    for (let k = 0; k <= steps; k++) {
      const a = aIn + ((aOut - aIn) * k) / steps;
      pts.push([c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a)]);
    }
    const [x0, y0] = tan[j].p0, [x1, y1] = tan[j].p1;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = Math.max(1, Math.ceil(len / 0.1));
    for (let k = 1; k < m; k++) pts.push([x0 + ((x1 - x0) * k) / m, y0 + ((y1 - y0) * k) / m]);
  }
  return new Polyline(pts, {}, true);
}
