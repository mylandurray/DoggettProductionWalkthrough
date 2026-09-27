// The book: a block of loose leaves that is jogged, milled, glued and wrapped
// in a scored cover.
//
// Book-local frame: origin at the centre of the milled spine line, X along the
// spine (−X = head), Y up the page towards the fore-edge, Z through the block
// (+Z = front cover). Everything below is driven by a few numbers per frame, so
// scrubbing either way just works.
import * as THREE from 'three';
import { SPL, BW, BT, NL, MILL_D, GT, HZ, WL, H1, CW } from './machine.js';

const LT = BT / NL;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- cover art
// One canvas for the whole cover laid flat, outside up, head at the top:
// back cover | spine | front cover.
const PX = 300;
export function makeCoverTexture() {
  const W = Math.round(CW * PX), H = Math.round(SPL * PX);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const xs0 = Math.round(WL * PX), xs1 = W - xs0; // spine
  // back
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, xs0, H);
  ctx.fillStyle = '#0074c8';
  ctx.fillRect(0, 0, xs0, 150);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px "Source Sans 3", sans-serif';
  ctx.fillText('How it’s done', 60, 92);
  ctx.fillStyle = '#16283a';
  ctx.fillRect(60, 220, 380, 16);
  ctx.fillStyle = '#6a7b8c';
  for (let k = 0, y = 270; y < 620; k++, y += 24) ctx.fillRect(60, y, (xs0 - 120) * (k % 5 === 4 ? 0.55 : 1), 9);
  // barcode
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(xs0 - 290, H - 190, 230, 130);
  ctx.fillStyle = '#16283a';
  for (let x = xs0 - 280, k = 0; x < xs0 - 72; k++) {
    const w = 2 + ((k * 7) % 5);
    if (k % 2 === 0) ctx.fillRect(x, H - 180, w, 92);
    x += w + 1;
  }
  ctx.font = '500 16px "IBM Plex Mono", monospace';
  ctx.fillText('9 780000 000000', xs0 - 276, H - 70);
  // spine
  ctx.fillStyle = '#003e6b';
  ctx.fillRect(xs0, 0, xs1 - xs0, H);
  ctx.save();
  ctx.translate((xs0 + xs1) / 2, 0);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px "Source Sans 3", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('PERFECT BINDING', 70, 0);
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('DOGGETT', H - 60, 0);
  ctx.restore();
  // front
  const fx = xs1;
  ctx.fillStyle = '#0074c8';
  ctx.fillRect(fx, 0, W - fx, H);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px "IBM Plex Mono", monospace';
  ctx.fillText('HOW IT’S DONE', fx + 60, 100);
  ctx.font = '800 112px "Source Sans 3", sans-serif';
  ctx.fillText('Perfect', fx + 56, 330);
  ctx.fillText('binding', fx + 56, 440);
  ctx.fillRect(fx + 60, 490, 130, 9);
  // a fan of pages
  ctx.globalAlpha = 0.28;
  for (let k = 0; k < 7; k++) {
    ctx.save();
    ctx.translate(fx + 470, H - 120);
    ctx.rotate(-0.5 + k * 0.1);
    ctx.fillRect(0, -300, 12, 300);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.font = '600 24px "Source Sans 3", sans-serif';
  ctx.fillText('Doggett Group · Creative Communications', fx + 60, H - 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// milled spine: rough, notched fibres
function makeRoughTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 32);
  ctx.strokeStyle = '#7b8794';
  ctx.lineWidth = 2;
  for (let x = 4; x < 64; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, 32); ctx.stroke(); }
  ctx.fillStyle = '#b8c1ca';
  for (let k = 0; k < 40; k++) ctx.fillRect((k * 37) % 64, (k * 13) % 32, 2, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeCoverMaterial(tex, pal) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTex: { value: tex },
      uPaper: { value: new THREE.Color(pal.paper) },
      uGain: { value: pal.paperGain },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex;
      uniform vec3 uPaper;
      uniform float uGain;
      varying vec2 vUv;
      void main() {
        // front faces are the printed outside; the inside is plain board
        vec3 c = gl_FrontFacing ? texture2D(uTex, vUv).rgb : vec3(0.96);
        gl_FragColor = vec4(c * uPaper * uGain, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- build
export function createBook(scene, pal, { outlineMat, coverMat }) {
  const root = new THREE.Group();
  scene.add(root);
  const paperCol = () => new THREE.Color(pal.paper).multiplyScalar(pal.paperGain);
  const paperMat = new THREE.MeshBasicMaterial({ color: paperCol(), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const leafLine = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0.4 });
  const glueMat = new THREE.MeshBasicMaterial({ color: pal.glue });
  const roughTex = makeRoughTexture();
  const roughMat = new THREE.MeshBasicMaterial({ map: roughTex, color: paperCol(), side: THREE.DoubleSide });

  const withEdges = (geo, mat, line) => {
    const m = new THREE.Mesh(geo, mat);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), line));
    for (const o of [m, m.children[0]]) { o.frustumCulled = false; o.renderOrder = 5; }
    return m;
  };

  // leaves, each with the strip of stock the miller takes off below it
  const leafGeo = new THREE.BoxGeometry(SPL, BW, LT * 0.9).translate(0, BW / 2, 0);
  const stockGeo = new THREE.BoxGeometry(1, MILL_D, LT * 0.9).translate(0.5, -MILL_D / 2, 0);
  const rnd = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  const leaves = [];
  for (let i = 0; i < NL; i++) {
    const g = new THREE.Group();
    const outer = i === 0 || i === NL - 1;
    g.add(withEdges(leafGeo, paperMat, outer ? outlineMat : leafLine));
    const stock = withEdges(stockGeo, paperMat, leafLine);
    stock.position.x = -SPL / 2;
    g.add(stock);
    g.userData = { z: -BT / 2 + (i + 0.5) * LT, dx: rnd(i, 1) * 0.12, dy: rnd(i, 2) * 0.11, stock };
    root.add(g);
    leaves.push(g);
  }

  // milled texture, spine glue film and side-glue lines: all grow from the
  // leading (+X) end, so they are unit boxes scaled along X
  const rough = new THREE.Mesh(new THREE.PlaneGeometry(1, BT).rotateX(Math.PI / 2).translate(0.5, -0.001, 0), roughMat);
  const spineGlue = new THREE.Mesh(new THREE.BoxGeometry(1, GT, BT + 0.004).translate(0.5, -GT / 2, 0), glueMat);
  const sideGlue = [1, -1].map((s) => new THREE.Mesh(new THREE.BoxGeometry(1, 0.07, 0.003).translate(0.5, 0.035, s * (BT / 2 + 0.0015)), glueMat));
  for (const m of [rough, spineGlue, ...sideGlue]) { m.frustumCulled = false; m.renderOrder = 5; root.add(m); }

  // ---------------------------------------------------------------- cover
  // Hinged panels: spine, then each wing = a short strip the side jaws press
  // flat against the block + the rest, which can flare out while clamped.
  const cover = new THREE.Group();
  root.add(cover);
  const uvOf = (x, s) => [(s + CW / 2) / CW, 1 - (x + SPL / 2) / SPL];
  // quad in its local XZ plane (y = 0) with the printed face towards −Y
  const quad = (parent, za, zb, sOf) => {
    const z0 = Math.min(za, zb), z1 = Math.max(za, zb), x0 = -SPL / 2, x1 = SPL / 2;
    const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const pos = [], uv = [];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(P[k][0], 0, P[k][1]);
      uv.push(...uvOf(P[k][0], sOf(P[k][1])));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, coverMat);
    const og = new THREE.BufferGeometry().setFromPoints(P.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const ol = new THREE.LineLoop(og, outlineMat);
    for (const o of [m, ol]) { o.frustumCulled = false; o.renderOrder = 5; parent.add(o); }
  };
  quad(cover, -HZ, HZ, (z) => z);
  const wings = [1, -1].map((sgn) => {
    const hinge = new THREE.Group();
    hinge.position.z = sgn * HZ;
    cover.add(hinge);
    quad(hinge, 0, sgn * H1, (z) => sgn * (HZ + Math.abs(z)));
    const rest = new THREE.Group();
    rest.position.z = sgn * H1;
    hinge.add(rest);
    quad(rest, 0, sgn * (WL - H1), (z) => sgn * (HZ + H1 + Math.abs(z)));
    return { sgn, hinge, rest };
  });
  // score lines, pressed in by the creasing bars
  const scoreMat = new THREE.LineBasicMaterial({ color: pal.outline, transparent: true, opacity: 0 });
  for (const s of [-1, 1]) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-SPL / 2, 0.003, s * HZ), new THREE.Vector3(SPL / 2, 0.003, s * HZ),
    ]), scoreMat);
    l.renderOrder = 6;
    cover.add(l);
  }

  function setTheme(p) {
    pal = p;
    paperMat.color.copy(paperCol());
    roughMat.color.copy(paperCol());
    leafLine.color.set(p.outline);
    glueMat.color.set(p.glue);
    scoreMat.color.set(p.outline);
  }

  const lastRough = { len: -1 };
  // st: { jitter, vib, unmilled, glued, sideGlued, cover: { local: Vector3 | null, fold, flare, scored } }
  function write(st) {
    for (const g of leaves) {
      const u = g.userData;
      g.position.set(u.dx * st.jitter, u.dy * st.jitter + st.vib, u.z);
      u.stock.visible = st.unmilled > 0.001;
      u.stock.scale.x = Math.max(st.unmilled, 1e-4);
    }
    const milled = SPL - st.unmilled;
    const grow = (m, len) => {
      m.visible = len > 0.001;
      m.scale.x = Math.max(len, 1e-4);
      m.position.x = SPL / 2 - m.scale.x;
    };
    grow(rough, milled);
    if (Math.abs(milled - lastRough.len) > 1e-4) { roughTex.repeat.set(Math.max(milled, 1e-4) / 0.12, 1); lastRough.len = milled; }
    grow(spineGlue, st.glued);
    for (const m of sideGlue) grow(m, st.sideGlued);

    const c = st.cover;
    if (c.local) cover.position.copy(c.local);
    else cover.position.set(0, -GT, 0);
    for (const w of wings) {
      w.hinge.rotation.x = -w.sgn * c.fold;
      w.rest.rotation.x = w.sgn * c.flare;
    }
    scoreMat.opacity = 0.9 * c.scored;
  }

  return { root, cover, write, setTheme };
}
