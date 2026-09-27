// Procedural "press test form" artwork for both sides of the sheet, plus a
// mask for the specialty (pink) toner station.
import * as THREE from 'three';

const W = 840, H = 1188; // A4 portrait ratio

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function regMark(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y);
  ctx.moveTo(x, y - 22); ctx.lineTo(x, y + 22);
  ctx.stroke();
  ctx.restore();
}

function colorBar(ctx, y, h = 34) {
  const inks = ['#00a3e0', '#e6007e', '#ffe600', '#1a1a1a', '#e5332a', '#00973a', '#312783'];
  const tints = [1, 0.75, 0.5, 0.25];
  const cell = (W - 120) / (inks.length * tints.length);
  let x = 60;
  for (const ink of inks) {
    for (const t of tints) {
      ctx.globalAlpha = t;
      ctx.fillStyle = ink;
      ctx.fillRect(x, y, cell - 2, h);
      x += cell;
    }
  }
  ctx.globalAlpha = 1;
}

function textLines(ctx, x, y, w, n, r, lh = 17) {
  ctx.fillStyle = '#4a5058';
  for (let i = 0; i < n; i++) {
    const last = (i + 1) % 6 === 0;
    const lw = last ? w * (0.3 + r() * 0.4) : w * (0.86 + r() * 0.14);
    ctx.fillRect(x, y + i * lh, lw, 7);
  }
}

function header(ctx, title, sub) {
  ctx.fillStyle = '#111';
  ctx.font = '700 58px "IBM Plex Sans Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, 60, 118);
  ctx.font = '500 19px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#555';
  ctx.fillText(sub, 62, 150);
}

function sideA() {
  const [c, ctx] = makeCanvas();
  const [m, mx] = makeCanvas();
  const r = rng(7);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);

  header(ctx, 'PAPER PATH / SIDE A', 'FORM 01 · 5 STATIONS · 2400 DPI · SIMPLEX PASS');

  // Hue wheel "photo" element
  const cx = 420, cy = 520, R = 255;
  const cg = ctx.createConicGradient(-Math.PI / 2, cx, cy);
  for (let i = 0; i <= 12; i++) cg.addColorStop(i / 12, `hsl(${i * 30}, 92%, 52%)`);
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  for (let k = 1; k <= 4; k++) { ctx.beginPath(); ctx.arc(cx, cy, (R * k) / 4, 0, Math.PI * 2); ctx.stroke(); }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  // Specialty ring + rule under the header
  mx.strokeStyle = '#fff'; mx.lineWidth = 20;
  mx.beginPath(); mx.arc(cx, cy, R + 26, 0, Math.PI * 2); mx.stroke();
  mx.fillStyle = '#fff'; mx.fillRect(60, 172, W - 120, 10);

  textLines(ctx, 60, 850, 340, 9, r);
  textLines(ctx, 440, 850, 340, 9, r);
  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#111';
  ctx.fillText('C  M  Y  K  R  G  B', 60, 1052);
  colorBar(ctx, 1066);

  regMark(ctx, 30, 30); regMark(ctx, W - 30, 30); regMark(ctx, 30, H - 30); regMark(ctx, W - 30, H - 30);
  return [c, m];
}

function sideB() {
  const [c, ctx] = makeCanvas();
  const [m, mx] = makeCanvas();
  const r = rng(21);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H);

  header(ctx, 'SIDE B / DUPLEX', 'FORM 01-B · INVERTED · RE-REGISTERED');

  // Landscape plate
  const x0 = 60, y0 = 190, w = W - 120, h = 420;
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, '#0b2f7a');
  sky.addColorStop(0.55, '#e0508a');
  sky.addColorStop(0.8, '#ffa53a');
  sky.addColorStop(1, '#ffe08a');
  ctx.fillStyle = sky; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.arc(x0 + w * 0.68, y0 + h * 0.62, 64, 0, Math.PI * 2); ctx.fill();
  const ridge = (base, amp, col, seed) => {
    const rr = rng(seed);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x0, y0 + h);
    for (let i = 0; i <= 24; i++) {
      const px = x0 + (w * i) / 24;
      ctx.lineTo(px, y0 + base - amp * (0.4 + rr() * 0.6) * Math.abs(Math.sin(i * 0.7 + seed)));
    }
    ctx.lineTo(x0 + w, y0 + h); ctx.closePath(); ctx.fill();
  };
  ridge(h * 0.82, 150, '#3a2d63', 3);
  ridge(h * 0.94, 110, '#1e1b3a', 9);
  ctx.fillStyle = '#0f1124'; ctx.fillRect(x0, y0 + h * 0.94, w, h * 0.06);

  // Bar chart
  const bx = 60, by = 660, bw = 330, bh = 250;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.stroke();
  const cols = ['#00a3e0', '#e6007e', '#ffe600', '#1a1a1a', '#00a3e0', '#e6007e'];
  for (let i = 0; i < 6; i++) {
    const hh = bh * (0.3 + r() * 0.65);
    ctx.fillStyle = cols[i];
    ctx.fillRect(bx + 18 + i * 52, by + bh - hh, 34, hh);
  }
  textLines(ctx, 440, 664, 340, 14, r);

  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = '#111';
  ctx.fillText('DENSITY / REGISTRATION', 60, 1052);
  colorBar(ctx, 1066);
  regMark(ctx, 30, 30); regMark(ctx, W - 30, 30); regMark(ctx, 30, H - 30); regMark(ctx, W - 30, H - 30);

  // Specialty: frame around the plate + emblem
  mx.strokeStyle = '#fff'; mx.lineWidth = 12;
  mx.strokeRect(x0 - 14, y0 - 14, w + 28, h + 28);
  mx.fillStyle = '#fff';
  mx.beginPath();
  const ex = W - 110, ey = 105;
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 22 : 52;
    mx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
  }
  mx.closePath(); mx.fill();
  return [c, m];
}

function toTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function makePrintTextures() {
  const [a, am] = sideA();
  const [b, bm] = sideB();
  return {
    A: toTex(a, true), spotA: toTex(am, false),
    B: toTex(b, true), spotB: toTex(bm, false),
  };
}
