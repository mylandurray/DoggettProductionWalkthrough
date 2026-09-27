// A collated set of NS A3 sheets that is stitched and folded into a booklet.
//
// Every sheet is a grid: u runs along its 420 mm length (the fold is at the
// middle), v across its 297 mm width (world Z). One function places the whole
// set from a handful of numbers, so scrubbing in either direction just works:
//   sc  – set centre along the table path T (while flat)
//   p   – how far the spine has travelled along its path G (0 = still flat)
//   q   – squareness of the spine (0 round → 1 square), per Z behind the roller
//
// The fold blade pushes up from below, so the bottom sheet wraps innermost and
// the top sheet (which carries the staple crowns) becomes the cover. Once
// through the slot each sheet's two halves lie either side of G, offset by its
// wrap radius r_i. The outer sheets spend more paper going round the spine, so
// the inner pages push out further at the fore-edge — creep falls out of the
// arc-length bookkeeping rather than being faked.
import * as THREE from 'three';
import { SL, SW, NS, TH, STAPLE_Z } from './machine.js';

const NU = 96, NV = 10;
const R0 = 0.008;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- artwork
// Atlas: one row per sheet (0 = innermost), column 0 = the sheet's top face
// (the outside of the booklet), column 1 = its underside.
const CW = 600, CH = 424, PAGES = NS * 4;

function pagesOf(i) {
  const k = NS - 1 - i; // 0 = cover sheet
  return {
    top: [PAGES - 2 * k, 1 + 2 * k],
    under: [2 + 2 * k, PAGES - 1 - 2 * k],
  };
}
export { pagesOf };

const HUES = ['#0074c8', '#e0007a', '#00a3e0', '#f5a800', '#00973a', '#7a3fb0', '#e5332a'];

function drawPage(ctx, x, y, w, h, n, spreadCentre) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  // content box: wide margin on the spine side, which wraps round the fold
  const left = x < spreadCentre;
  const m = 22, mi = 52;
  const cx = left ? x + m : x + mi, cw = w - m - mi;
  const outer = left ? x + m : x + w - m; // folio on the outside corner
  if (n === 1 || n === PAGES) {
    ctx.fillStyle = '#0074c8';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    if (n === 1) {
      ctx.font = '700 15px "IBM Plex Mono", monospace';
      ctx.fillText('HOW IT’S DONE', cx, y + 44);
      ctx.font = '800 44px "Source Sans 3", sans-serif';
      ctx.fillText('The', cx, y + 150);
      ctx.fillText('booklet', cx, y + 196);
      ctx.fillText('maker', cx, y + 242);
      ctx.fillRect(cx, y + 270, 70, 5);
      ctx.font = '600 14px "Source Sans 3", sans-serif';
      ctx.fillText('Doggett Group · Creative Communications', cx, y + h - 28);
    } else {
      ctx.globalAlpha = 0.25;
      for (let k = 0; k < 7; k++) ctx.fillRect(cx, y + 60 + k * 18, w * (0.4 + ((k * 37) % 40) / 100), 6);
      ctx.globalAlpha = 1;
      ctx.font = '700 22px "Source Sans 3", sans-serif';
      ctx.fillText('doggett.group', cx, y + h - 30);
    }
    ctx.restore();
    return;
  }
  // running head
  ctx.fillStyle = '#9aa5b1';
  ctx.fillRect(cx, y + 22, cw, 2);
  // picture box
  const hue = HUES[n % HUES.length];
  const ph = n % 3 === 0 ? 190 : 130;
  ctx.fillStyle = hue;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(cx, y + 40, cw, ph);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx + cw * 0.7, y + 40 + ph * 0.45, ph * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // headline + body
  ctx.fillStyle = '#16283a';
  ctx.fillRect(cx, y + ph + 58, cw * 0.7, 12);
  ctx.fillStyle = '#6a7b8c';
  let yy = y + ph + 84;
  for (let k = 0; yy < y + h - 60; k++, yy += 12) ctx.fillRect(cx, yy, cw * (k % 5 === 4 ? 0.55 : 0.97), 5);
  // big folio
  ctx.fillStyle = '#16283a';
  ctx.font = '700 30px "IBM Plex Mono", monospace';
  ctx.textAlign = x < spreadCentre ? 'left' : 'right';
  ctx.fillText(String(n), outer, y + h - 18);
  ctx.restore();
}

export function makeSetTexture() {
  const c = document.createElement('canvas');
  c.width = CW * 2;
  c.height = CH * NS;
  const ctx = c.getContext('2d');
  for (let i = 0; i < NS; i++) {
    const pg = pagesOf(i);
    for (const [col, [l, r]] of [[0, pg.top], [1, pg.under]]) {
      const x = col * CW, y = i * CH, mid = x + CW / 2;
      drawPage(ctx, x, y, CW / 2, CH, l, mid);
      drawPage(ctx, mid, y, CW / 2, CH, r, mid);
      // the centre spread gets one picture running across the fold
      if ((l === PAGES / 2 && r === PAGES / 2 + 1)) {
        ctx.fillStyle = '#0074c8';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x + 22, y + 40, CW - 44, 190);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 34px "Source Sans 3", sans-serif';
        ctx.fillText('Centre spread', x + 44, y + 150);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(mid - 0.5, y, 1, CH);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- material
export function makeSetMaterial(tex, pal) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uTex: { value: tex },
      uAlpha: { value: 1 },
      uFlip: { value: 0 },
      uPaper: { value: new THREE.Color(pal.paper) },
      uGain: { value: pal.paperGain },
    },
    vertexShader: /* glsl */ `
      attribute float aSheet;
      varying vec2 vUv;
      varying float vSheet;
      void main() {
        vUv = uv; vSheet = aSheet;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform float uAlpha, uGain, uFlip;
      uniform vec3 uPaper;
      varying vec2 vUv;
      varying float vSheet;
      void main() {
        // front faces are the sheet's top (outside) face → atlas column 0
        float col = gl_FrontFacing ? 0.0 : 1.0;
        // the underside is seen mirrored along the length (and everything is
        // when the model is mirrored)
        float x = uFlip > 0.5 ? 1.0 - vUv.x : vUv.x;
        float u = gl_FrontFacing ? x : 1.0 - x;
        vec2 a = vec2((col + u) * 0.5, (vSheet + vUv.y) / ${NS.toFixed(1)});
        vec3 c = texture2D(uTex, vec2(a.x, 1.0 - a.y)).rgb * uPaper;
        float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        c *= 0.88 + 0.12 * smoothstep(0.0, 0.015, e);
        gl_FragColor = vec4(c * uGain, uAlpha);
      }`,
  });
}

// ---------------------------------------------------------------- staples
// Built in a local frame: x along the spine (world Z), y outward from the
// set, crown at y = 0, legs down to -LEG, then clinched inward.
export const CROWN = 0.24, LEG = NS * TH + 0.035;
function makeStaple(mat) {
  const g = new THREE.Group();
  const t = 0.014;
  const box = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const crown = box(CROWN, t, t);
  g.add(crown);
  const legs = [], clinch = [];
  for (const s of [-1, 1]) {
    const leg = box(t, LEG, t);
    leg.position.set((s * CROWN) / 2, -LEG / 2, 0);
    g.add(leg);
    const pivot = new THREE.Group();
    pivot.position.set((s * CROWN) / 2, -LEG, 0);
    const c = box(CROWN * 0.36, t, t);
    c.position.set((-s * CROWN * 0.36) / 2, 0, 0);
    // before clinching the leg carries straight on
    pivot.add(c);
    pivot.userData.s = s;
    g.add(pivot);
    legs.push(leg);
    clinch.push(pivot);
  }
  g.userData.clinch = clinch;
  for (const m of g.children) m.renderOrder = 7;
  return g;
}

// ---------------------------------------------------------------- set
export function createSet(scene, mat, outlineMat, stapleMat) {
  const V = (NU + 1) * (NV + 1);
  const sheets = [];
  for (let i = 0; i < NS; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    const uv = new Float32Array(V * 2), sheet = new Float32Array(V);
    const idx = [];
    for (let a = 0; a <= NU; a++) {
      for (let b = 0; b <= NV; b++) {
        const k = a * (NV + 1) + b;
        uv[k * 2] = a / NU;
        uv[k * 2 + 1] = b / NV;
        sheet[k] = i;
        if (a < NU && b < NV) {
          const k1 = k + NV + 1;
          idx.push(k, k + 1, k1, k + 1, k1 + 1, k1);
        }
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aSheet', new THREE.BufferAttribute(sheet, 1));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    scene.add(mesh);
    // outline: the four edges of the grid
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(new Float32Array((2 * NU + 2 * NV) * 3), 3));
    const outline = new THREE.LineLoop(og, outlineMat);
    outline.frustumCulled = false;
    outline.renderOrder = 6;
    scene.add(outline);
    sheets.push({ mesh, outline });
  }
  const staples = STAPLE_Z.map(() => {
    const s = makeStaple(stapleMat);
    scene.add(s);
    return s;
  });
  return { sheets, staples, mat, spine: new THREE.Vector3(), foreEdge: new THREE.Vector3(), visible: true };
}

const qT = [0, 0, 0, 0], qG = [0, 0, 0, 0];
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Zv = new THREE.Vector3(), M = new THREE.Matrix4();

// st: { T, G, sc, p, q, qz (roller z, squared behind it), explode, drive, clinch, alpha }
export function writeSet(set, st) {
  const { T, G, sc, p } = st;
  const vis = st.alpha > 0.001;
  for (const s of set.sheets) s.mesh.visible = s.outline.visible = vis;
  for (const s of set.staples) s.visible = vis && st.drive > 0.001;
  if (!vis) return;
  set.mat.uniforms.uAlpha.value = st.alpha;

  const kf = clamp(p / 0.35);
  G.sample(p, qG);
  const gx = qG[0], gy = qG[1], gtx = qG[2], gty = qG[3];
  const rOut = (NS - 0.5) * TH * kf + R0;
  set.spine.set(gx + gtx * rOut, gy + gty * rOut, 0);

  for (let i = 0; i < NS; i++) {
    const r = ((i + 0.5) * TH) * kf + R0 * kf;
    const arcSp = (Math.PI / 2) * r;
    const lift = (i + 0.5) * TH;
    const ex = st.explode * (i * 0.42 + 0.2);
    const eMin = 0.62 - (0.5 * i) / (NS - 1); // outer sheets square up hardest
    const pos = set.sheets[i].mesh.geometry.attributes.position.array;
    const ol = set.sheets[i].outline.geometry.attributes.position.array;
    for (let a = 0; a <= NU; a++) {
      const u = (a / NU) * SL - SL / 2;
      const h = u < 0 ? -1 : 1;
      const au = Math.abs(u);
      let px, py;
      // spine region needs a z-dependent profile; the rest is the same along z
      const inSpine = au < arcSp && r > 1e-5;
      if (!inSpine) {
        const a2 = au - arcSp;
        if (p > 0 && a2 <= p) {
          G.sample(p - a2, qT);
          px = qT[0] + qT[3] * h * r;
          py = qT[1] - qT[2] * h * r;
        } else {
          T.sample(sc + h * (a2 - p), qT);
          px = qT[0] - qT[3] * lift;
          py = qT[1] + qT[2] * lift + ex;
        }
      }
      for (let b = 0; b <= NV; b++) {
        const z = (b / NV) * SW - SW / 2;
        let x = px, y = py;
        if (inSpine) {
          const th = au / r;
          const qz = st.q * clamp((st.qz - z) / 0.35 + 0.5);
          const e = 1 + (eMin - 1) * qz;
          const fo = r * Math.pow(Math.cos(th), e), so = h * r * Math.pow(Math.sin(th), e);
          x = gx + gtx * fo + gty * so;
          y = gy + gty * fo - gtx * so;
        }
        const k = (a * (NV + 1) + b) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      }
    }
    set.sheets[i].mesh.geometry.attributes.position.needsUpdate = true;
    // outline walk: v=0 edge along u, u=NU edge along v, v=NV back, u=0 back
    let o = 0;
    const put = (a, b) => {
      const k = (a * (NV + 1) + b) * 3;
      ol[o++] = pos[k]; ol[o++] = pos[k + 1]; ol[o++] = pos[k + 2];
    };
    for (let a = 0; a < NU; a++) put(a, 0);
    for (let b = 0; b < NV; b++) put(NU, b);
    for (let a = NU; a > 0; a--) put(a, NV);
    for (let b = NV; b > 0; b--) put(0, b);
    set.sheets[i].outline.geometry.attributes.position.needsUpdate = true;
    if (i === 0) {
      // innermost sheet's fore-edge (right half end), for the camera + labels
      const k = (NU * (NV + 1) + NV / 2) * 3;
      set.foreEdge.set(pos[k], pos[k + 1], pos[k + 2]);
    }
  }

  // staples: blend from the flat frame (on the table, crown up) to the folded
  // frame (crown on the spine, pointing along G)
  if (st.drive <= 0.001) return;
  T.sample(sc, qT);
  const top = NS * TH + 0.004;
  const fx = -qT[3], fy = qT[2];
  const drop = (1 - st.drive) * 0.95;
  const flatX = qT[0] + fx * (top + drop), flatY = qT[1] + fy * (top + drop) + st.explode * (NS * 0.42);
  const foldX = gx + gtx * (rOut + 0.004), foldY = gy + gty * (rOut + 0.004);
  const ox = flatX + (foldX - flatX) * kf, oy = flatY + (foldY - flatY) * kf;
  Y.set(fx + (gtx - fx) * kf, fy + (gty - fy) * kf, 0).normalize();
  X.set(0, 0, 1);
  Zv.crossVectors(X, Y);
  M.makeBasis(X, Y, Zv);
  set.staples.forEach((s, j) => {
    s.position.set(ox, oy, STAPLE_Z[j]);
    s.quaternion.setFromRotationMatrix(M);
    // clinch: legs fold in under the set (drawn straight on until then)
    for (const pv of s.userData.clinch) pv.rotation.z = pv.userData.s * (Math.PI / 2) * (1 - st.clinch);
  });
}
