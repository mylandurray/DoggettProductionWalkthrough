import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { animate, stagger } from 'animejs';
import { createPress, L, L_LONG, W, BELT_W, PAPER_Y, STATIONS, MODULES, FEED_DY, FEED_Y_UPPER } from './machine.js';
import { makePrintTextures, makeBannerTextures } from './textures.js';
import { PALETTES, storedTheme, storeTheme, storedSolid, storeSolid } from './theme.js';

const MM = 100; // mm per scene unit
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

let themeName = storedTheme();
let pal = PALETTES[themeName];

const scene = new THREE.Scene();
scene.background = new THREE.Color(pal.bg);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 400);
// Shift the projection centre right so the subject clears the chapter panel.
function applyViewOffset() {
  const shift = innerWidth > 1100 ? 200 : innerWidth > 760 ? 150 : 0;
  camera.setViewOffset(innerWidth, innerHeight, -shift, 0, innerWidth, innerHeight);
}
applyViewOffset();

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.35, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ model
const press = createPress(scene, pal);
const { P0, P1, P2, P3, belt } = press;

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
const tex = makePrintTextures();
const texLong = makeBannerTextures();
tex.A.anisotropy = tex.B.anisotropy = texLong.A.anisotropy = renderer.capabilities.getMaxAnisotropy();

// ------------------------------------------------------------------ timeline
// D = distance the sheet's leading edge has travelled along P1 then P2.
const off2 = P1.total - L;
const K1 = { reg: P1.marks.reg, nip: P1.marks.nip, fuse: P1.marks.fuser };
const K2 = {
  reg: off2 + P2.marks.reg, nip: off2 + P2.marks.nip, fuse: off2 + P2.marks.fuser,
  sensor: off2 + P2.marks.sensor, end: off2 + P2.total,
};
const TRAVEL_MM = (K2.end - L) * MM;

const DKEYS = [
  [0, L], [0.09, L], [0.155, K1.reg], [0.345, K1.reg],
  [0.4, K1.nip + L + 0.25], [0.425, K1.nip + L + 0.25],
  [0.485, K1.fuse + L + 0.1], [0.505, K1.fuse + L + 0.1],
  [0.56, P1.total], [0.572, P1.total],
  [0.66, K2.reg], [0.685, K2.reg],
  [0.765, K2.fuse + L + 0.1], [0.785, K2.fuse + L + 0.1],
  [0.855, K2.sensor + L + 0.3], [0.875, K2.sensor + L + 0.3],
  [0.945, K2.end], [1, K2.end],
];
const SKEWKEYS = [[0, 1], [0.178, 1], [0.218, 0], [1, 0]];

// Epilogue (t 1 → T_END): a long sheet fed from the upper tray, simplex,
// straight through to the top tray. DL = its leading edge along P3; it starts
// resting in the tray like the A4 sheet did.
const T_END = 1.3;
const DL0 = L;
const DLKEYS = [
  [1.06, DL0], [1.115, P3.marks.reg], [1.13, P3.marks.reg],
  [1.205, P3.marks.fuser + L_LONG + 0.1], [1.22, P3.marks.fuser + L_LONG + 0.1],
  [1.29, P3.marks.finExit + L_LONG + 0.25],
];

function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0 || 1)));
    }
  }
  return keys[keys.length - 1][1];
}

// Belt travel "m". While the sheet waits at registration the belt keeps
// running so the image can be built; after release belt and sheet move together.
const T_IMG0 = 0.245, T_REL = 0.325;
const cFirst = belt.stations[0].c;
const M0 = K1.reg - L;
const mStart1 = M0 - cFirst;
const Mr = mStart1 + belt.len - (K1.nip - K1.reg);
const KM = Mr - K1.reg;
const mStart2 = K2.nip + KM - belt.len;
// epilogue: belt locked to the long sheet, its image reaching the nip with it
const mStart3 = K2.end + KM - DL0 + P3.marks.nip - belt.len;
function beltTravel(t, D) {
  if (t < T_IMG0) return D - L;
  if (t < T_REL) return lerp(M0, Mr, ease((t - T_IMG0) / (T_REL - T_IMG0)));
  return D + KM;
}

// ------------------------------------------------------------------ chapters
const CH = [
  {
    t0: 0, kicker: 'How it’s done', title: 'From press to finished piece',
    body: 'Ever wondered what happens between hitting print and holding the finished job? Follow one double-sided sheet through a production digital press, from the paper feeder to the finished stack. Scroll to open it up.',
    specs: [['Main sections', '4'], ['Colour stations', '5'], ['Sheet size', 'A4'], ['Distance travelled', `${Math.round(TRAVEL_MM).toLocaleString()} mm`]],
  },
  {
    t0: 0.07, kicker: 'Paper feeder', title: 'Picking up one sheet',
    body: 'It starts with a tall stack of your chosen paper. A stream of air fluffs up the top few sheets so they don’t cling together, then a suction belt lifts just the top one and passes it into the press.',
    specs: [['Holds', 'about 2,000 sheets'], ['Keeps sheets apart', 'air + suction'], ['Double-sheet check', 'automatic']],
  },
  {
    t0: 0.16, kicker: 'Lining up', title: 'Straightened to the millimetre',
    body: 'Paper rarely arrives perfectly square. Sensors spot any tilt or drift, and a pair of rollers nudges the sheet straight, then holds it for a split second so it meets the image at exactly the right moment.',
    specs: [['Checks', 'tilt + side position'], ['Why it matters', 'front and back line up'], ['Timing', 'matched to the image']],
  },
  {
    t0: 0.23, kicker: 'Building the image', title: 'Five colours, one pass',
    body: 'Lasers draw your artwork onto five drums, one per colour: black, cyan, magenta and yellow, plus a specialty pink. Each colour is laid onto a moving belt, so the full image builds up layer by layer.',
    specs: [['Colours', 'up to 5 at once'], ['Detail', '2400 dpi class'], ['Specialty ink', 'pink']],
  },
  {
    t0: 0.33, kicker: 'Onto the paper', title: 'Image meets paper',
    body: 'The belt and the sheet meet between two rollers, and an electrical charge pulls the whole image across onto the paper in one go. At this point it’s a fine powder held on only by static, so it could still smudge.',
    specs: [['How', 'static charge'], ['Colours moved', 'all at once'], ['State', 'loose powder']],
  },
  {
    t0: 0.41, kicker: 'Making it permanent', title: 'Heat and pressure',
    body: 'Next the sheet passes between a hot roller and a soft pressure roller. The heat melts the toner into the paper so it won’t rub off, and gives the print its finish. The sheet comes out warm, with a slight curl.',
    specs: [['Temperature', 'around 180 °C'], ['Result', 'permanent, smudge-proof'], ['Finish', 'sets the gloss']],
  },
  {
    t0: 0.49, kicker: 'Printing both sides', title: 'Flipping the sheet',
    body: 'For double-sided work, a small gate sends the sheet down instead of out. Once it’s fully inside, the rollers reverse and send it back the other way, turning it over ready for its second side.',
    specs: [['Used for', 'double-sided jobs'], ['How', 'stop, then reverse'], ['Next up', 'the back']],
  },
  {
    t0: 0.58, kicker: 'Printing both sides', title: 'The trip back round',
    body: 'The flipped sheet travels back underneath the imaging section, loops up and returns to the lining-up rollers, which straighten it again so the back matches the front.',
    specs: [['Route', 'under the press'], ['Alignment', 'checked again for the back']],
  },
  {
    t0: 0.67, kicker: 'Second side', title: 'Printing the back',
    body: 'While the sheet was on its way round, the press had already built the back-side image on the belt. It’s transferred at the same point as before, and the sheet goes through the heat rollers a second time.',
    specs: [['Image', 'the back of your job'], ['Trips through the heat', 'front × 2 · back × 1']],
  },
  {
    t0: 0.77, kicker: 'Quality control', title: 'Cool, flatten, check',
    body: 'Straight out of the heat, the sheet is cooled so the toner sets and pages won’t stick together. Rollers take out any curl so it lies flat, and a built-in colour sensor reads a test strip to keep every sheet in the run consistent.',
    specs: [['Cooling', 'belt, heat sinks + fan'], ['Flattening', 'adjustable rollers'], ['Colour check', 'throughout the run']],
  },
  {
    t0: 0.86, kicker: 'Finishing', title: 'Onto the stack',
    body: 'Finally the sheet rises to the top of the finisher, and the exit rollers lay it neatly on the stack with the rest of your job. The same unit can also staple, hole-punch or fold booklets.',
    specs: [['Delivery', 'top tray'], ['Options', 'staple · punch · booklet']],
  },
  {
    t0: 0.95, kicker: 'Summary', title: 'The whole journey',
    body: 'In a matter of seconds, one sheet is fed, lined up, printed on both sides, heat-set, cooled, colour-checked and stacked. Repeat that thousands of times and you have your print run.',
    specs: [['Distance travelled', `${Math.round(TRAVEL_MM).toLocaleString()} mm`], ['Trips through the heat', '2'], ['Sides printed', '2']],
  },
  {
    t0: 1.0, kicker: 'Long sheets', title: 'Going beyond A4',
    body: 'The same press can run long sheets for banners, book covers and wraps. A 660 mm sheet sits in the upper tray, with an extension pulled out to carry the overhang, and is picked up just like any other sheet.',
    specs: [['Sheet length', '660 mm'], ['Fed from', 'upper tray'], ['Overhang', 'tray extension']],
  },
  {
    t0: 1.12, kicker: 'Long sheets', title: 'One long pass',
    body: 'The belt builds an image as long as the sheet, and the whole length is transferred and heat-set in one continuous run. This job is single-sided, so the gate stays up and the sheet carries straight on instead of flipping.',
    specs: [['Image length', '660 mm'], ['Sides printed', '1'], ['Diverter gate', 'straight through']],
  },
  {
    t0: 1.215, kicker: 'Long sheets', title: 'Out onto the extension',
    body: 'It’s cooled, flattened and colour-checked like every other sheet, then the exit rollers feed it onto the top tray, where a pull-out extension catches the extra length.',
    specs: [['Delivery', 'top tray + extension'], ['Distance travelled', `${Math.round((P3.marks.finExit + L_LONG + 0.25 - DL0) * MM).toLocaleString()} mm`]],
  },
];
const CH_IMAGE = CH.findIndex((c) => c.kicker === 'Building the image');
const CH_SUMMARY = CH.findIndex((c) => c.kicker === 'Summary');
const chapterAt = (t) => {
  let i = 0;
  for (let k = 0; k < CH.length; k++) if (t >= CH[k].t0) i = k;
  return i;
};

// ------------------------------------------------------------------ paper path lines
const railMatBase = new THREE.LineDashedMaterial({ color: pal.rail, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.55 });
const trailMat = new THREE.LineBasicMaterial({ color: pal.trail, transparent: true, opacity: 1 });
const trailMat2 = new THREE.LineBasicMaterial({ color: pal.trail2, transparent: true, opacity: 1 });
const trails = [];
// P3 runs over rails already drawn for P0 / P1 / P2, so it only gets a trail
for (const [path, mat, rail] of [[P1, trailMat, true], [P2, trailMat2, true], [P3, trailMat, false]]) {
  for (const z of [-(W / 2 + 0.12), W / 2 + 0.12]) {
    const pts = path.pts.map(([x, y]) => new THREE.Vector3(x, y, z));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    if (rail) {
      const base = new THREE.Line(g, railMatBase);
      base.computeLineDistances();
      scene.add(base);
    }
    const tr = new THREE.Line(g.clone(), mat);
    tr.frustumCulled = false;
    scene.add(tr);
    trails.push({ path, line: tr });
  }
}
// idle upper-tray feed path: dashed rail only, never trailed
for (const z of [-(W / 2 + 0.12), W / 2 + 0.12]) {
  const base = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P0.pts.map(([x, y]) => new THREE.Vector3(x, y, z))), railMatBase);
  base.computeLineDistances();
  scene.add(base);
}

// ------------------------------------------------------------------ ribbons
function makeRibbon(N, material, attrs) {
  const g = new THREE.BufferGeometry();
  const V = (N + 1) * 2;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V * 2), 2));
  for (const [name, size] of Object.entries(attrs)) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(V * size), size));
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  return mesh;
}

const makeSheetMat = (texA, spotA, texB, spotB) => new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: true,
  uniforms: {
    uTexA: { value: texA }, uTexB: { value: texB },
    uSpotA: { value: spotA }, uSpotB: { value: spotB },
    uPass: { value: 0 },
    uAlpha: { value: 1 },
    uPaper: { value: new THREE.Color(pal.paper) },
    uGrid: { value: new THREE.Color(pal.paperGrid) },
    uGain: { value: pal.paperGain },
    uPink: { value: new THREE.Color('#ff6fb5') },
    uHeat: { value: new THREE.Color('#ff6a2a') },
  },
  vertexShader: /* glsl */ `
    attribute vec4 aFront;
    attribute vec4 aBack;
    varying vec2 vUv;
    varying vec4 vFront;
    varying vec4 vBack;
    void main() {
      vUv = uv; vFront = aFront; vBack = aBack;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uTexA, uTexB, uSpotA, uSpotB;
    uniform float uPass, uGain, uAlpha;
    uniform vec3 uPaper, uGrid, uPink, uHeat;
    varying vec2 vUv;
    varying vec4 vFront;
    varying vec4 vBack;
    void main() {
      bool f = gl_FrontFacing;
      vec4 st = f ? vFront : vBack;
      bool sideA = f ? (uPass < 0.5) : (uPass > 0.5);
      // vUv.x = across (0..1), vUv.y = material position from original leading edge
      vec2 tuv = sideA ? vec2(vUv.x, 1.0 - vUv.y) : vec2(vUv.x, vUv.y);
      vec3 ink = sideA ? texture2D(uTexA, tuv).rgb : texture2D(uTexB, tuv).rgb;
      float spot = sideA ? texture2D(uSpotA, tuv).r : texture2D(uSpotB, tuv).r;
      vec3 printed = mix(ink, uPink, spot * 0.92);

      // unfused toner: matte, lighter, grainy
      vec2 g = tuv * vec2(210.0, 297.0) * 0.9;
      float grain = fract(sin(dot(floor(g), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 powder = mix(printed, uPaper, 0.28) * (0.86 + 0.18 * grain);
      vec3 toner = mix(powder, printed, st.y);

      // blank paper shows a faint 10 mm grid
      vec2 mm = tuv * vec2(21.0, 29.7);
      vec2 gl = abs(fract(mm) - 0.5);
      float line = 1.0 - smoothstep(0.44, 0.5, max(gl.x, gl.y));
      vec3 blank = mix(uPaper, uGrid, (1.0 - line) * 0.35);

      vec3 col = mix(blank, toner, st.x);
      col = mix(col, uHeat, st.z * 0.55);
      float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      col *= 0.9 + 0.1 * smoothstep(0.0, 0.02, e);
      gl_FragColor = vec4(col * uGain, 0.97 * uAlpha);
    }`,
});
function makeSheet(N, mat) {
  const mesh = makeRibbon(N, mat, { aFront: 4, aBack: 4 });
  mesh.renderOrder = 5;
  scene.add(mesh);
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
  const outline = new THREE.LineLoop(og, new THREE.LineBasicMaterial({ color: pal.outline, transparent: true }));
  outline.frustumCulled = false;
  outline.renderOrder = 6;
  scene.add(outline);
  return { N, mesh, mat, outline };
}
// the long sheet's back stays blank (simplex), so side B's maps are just placeholders
const sheets = [
  makeSheet(110, makeSheetMat(tex.A, tex.spotA, tex.B, tex.spotB)),
  makeSheet(260, makeSheetMat(texLong.A, texLong.spotA, tex.B, tex.spotB)),
];
const [sheetA4, sheetLong] = sheets;

const beltImgMat = (texMap, spotMap) => new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTex: { value: texMap }, uSpot: { value: spotMap },
    uPink: { value: new THREE.Color('#ff6fb5') },
  },
  vertexShader: /* glsl */ `
    attribute float aLayers;
    varying vec2 vUv;
    varying float vLayers;
    void main() {
      vUv = uv; vLayers = aLayers;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uTex, uSpot;
    uniform vec3 uPink;
    varying vec2 vUv;
    varying float vLayers;
    void main() {
      if (vLayers < 0.5) discard;
      vec2 tuv = vec2(vUv.x, vUv.y);
      vec3 lin = texture2D(uTex, tuv).rgb;
      vec3 rgb = pow(lin, vec3(1.0 / 2.2));
      float spot = texture2D(uSpot, tuv).r;
      float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
      vec3 cmy = (1.0 - rgb - k) / max(1.0 - k, 1e-3);
      float S1 = step(0.5, vLayers), Y = step(1.5, vLayers), M = step(2.5, vLayers);
      float C = step(3.5, vLayers), K = step(4.5, vLayers);
      vec3 col = vec3(1.0);
      col.b *= 1.0 - cmy.z * Y;
      col.g *= 1.0 - cmy.y * M;
      col.r *= 1.0 - cmy.x * C;
      col *= 1.0 - k * K;
      col = pow(col, vec3(2.2));
      float cov = max(max(cmy.x * C, cmy.y * M), max(cmy.z * Y, k * K));
      col = mix(col, uPink, spot * S1);
      cov = max(cov, spot * S1);
      if (cov < 0.03) discard;
      gl_FragColor = vec4(col * 0.95, min(1.0, cov * 1.1));
    }`,
});
const BN = 90;
const beltImgs = [
  { mesh: makeRibbon(BN, beltImgMat(tex.A, tex.spotA), { aLayers: 1 }), mStart: mStart1 },
  { mesh: makeRibbon(BN, beltImgMat(tex.B, tex.spotB), { aLayers: 1 }), mStart: mStart2 },
  { mesh: makeRibbon(200, beltImgMat(texLong.A, texLong.spotA), { aLayers: 1 }), mStart: mStart3, len: L_LONG, long: true },
];
for (const b of beltImgs) { b.mesh.renderOrder = 4; scene.add(b.mesh); }

// ------------------------------------------------------------------ state
function computeState(t) {
  const D = keyed(DKEYS, t);
  const DL = keyed(DLKEYS, t);
  const dl = DL - DL0; // epilogue travel; belt + rollers keep turning with it
  const m = beltTravel(t, D) + dl;
  const skew = keyed(SKEWKEYS, t);
  const pass = D <= P1.total ? 0 : 1;
  const path = pass ? P2 : P1;
  const head = pass ? D - off2 : D;
  const ch = chapterAt(t);
  const long = t >= 1;
  // the sheet the camera, HUD and machine react to
  const act = long ? { path: P3, head: DL, len: L_LONG } : { path, head, len: L };
  return {
    t, D, DL, roll: D + dl, m, skew, pass, path, head, ch, long, act,
    feedExt: ease((t - 1.015) / 0.03), longA: clamp((t - 1.04) / 0.015), outExt: ease((t - 1.215) / 0.03),
  };
}

const q = [0, 0, 0, 0];
// Lay a sheet of length len along path with its leading edge at head. `lift`
// raises it off the path (the long sheet lands on top of the A4 one).
function writeSheet(sh, path, head, len, pass, skew = 0, lift = 0) {
  const { N, mesh } = sh;
  const pos = mesh.geometry.attributes.position.array;
  const uv = mesh.geometry.attributes.uv.array;
  const af = mesh.geometry.attributes.aFront.array;
  const ab = mesh.geometry.attributes.aBack.array;
  const ol = sh.outline.geometry.attributes.position.array;
  const nip = path.marks.nip, fus = path.marks.fuser;
  const skewA = skew * 0.07, lat = skew * 0.14;
  for (let i = 0; i <= N; i++) {
    const a = i / N;
    const s = head - a * len;
    path.sample(s, q);
    const x = q[0] - q[3] * lift, y = q[1] + q[2] * lift;
    const zo = lat - skewA * a * len;
    const m = pass ? 1 - a : a;
    const printed = clamp((s - nip) / 0.03 + 0.5);
    const fused = clamp((s - fus) / 0.03 + 0.5);
    const heat = fused > 0 ? Math.exp(-(s - fus) / 1.4) * fused : 0;
    for (let k = 0; k < 2; k++) {
      const v = 2 * i + k;
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = (k ? W / 2 : -W / 2) + zo;
      uv[v * 2] = k;
      uv[v * 2 + 1] = m;
      af.set([printed, fused, heat, 0], v * 4);
      if (pass === 0) ab.set([0, 0, heat, 0], v * 4);
      else ab.set([1, 1, heat, 0], v * 4);
      const oi = k === 0 ? i : 2 * N + 1 - i;
      ol[oi * 3] = x;
      ol[oi * 3 + 1] = y;
      ol[oi * 3 + 2] = (k ? W / 2 : -W / 2) + zo;
    }
  }
  sh.mat.uniforms.uPass.value = pass;
  for (const n of ['position', 'uv', 'aFront', 'aBack']) mesh.geometry.attributes[n].needsUpdate = true;
  sh.outline.geometry.attributes.position.needsUpdate = true;
}

function updateSheets(st) {
  writeSheet(sheetA4, st.path, st.head, L, st.pass, st.skew);
  const vis = st.longA > 0.001;
  sheetLong.mesh.visible = sheetLong.outline.visible = vis;
  if (!vis) return;
  writeSheet(sheetLong, P3, st.DL, L_LONG, 0, 0, 0.03);
  sheetLong.mat.uniforms.uAlpha.value = st.longA;
  sheetLong.outline.material.opacity = st.longA;
}

const stationC = belt.stations.map((s) => s.c);
const laserActive = new Array(stationC.length).fill(0);
function updateBeltImages(st) {
  laserActive.fill(0);
  for (const b of beltImgs) {
    const h = st.m - b.mStart, len = b.len || L;
    const g = b.mesh.geometry;
    const pos = g.attributes.position.array, uv = g.attributes.uv.array, la = g.attributes.aLayers.array;
    const visible = h > cFirst && h - len < belt.len && (!b.long || st.long);
    b.mesh.visible = visible;
    if (!visible) continue;
    for (let k = 0; k < stationC.length; k++) if (stationC[k] <= h && stationC[k] >= h - len) laserActive[k] = 1;
    const n = la.length / 2 - 1;
    for (let i = 0; i <= n; i++) {
      const a = i / n;
      const c = h - a * len;
      belt.sample(c, q);
      const nx = q[3], ny = -q[2];
      let layers = 0;
      if (c >= belt.len) layers = 0;
      else for (let k = 0; k < stationC.length; k++) if (c > stationC[k]) layers = k + 1;
      for (let k = 0; k < 2; k++) {
        const v = 2 * i + k;
        pos[v * 3] = q[0] + nx * 0.03;
        pos[v * 3 + 1] = q[1] + ny * 0.03;
        pos[v * 3 + 2] = k ? W / 2 : -W / 2;
        uv[v * 2] = k;
        uv[v * 2 + 1] = 1 - a;
        la[v] = layers;
      }
    }
    g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.aLayers.needsUpdate = true;
  }
}

function updateTrails(st) {
  for (const tr of trails) {
    let s = -1;
    // the epilogue's long sheet gets a fresh trail
    if (st.long) s = tr.path === P3 ? st.DL : -1;
    else if (tr.path === P1) s = st.pass === 0 ? st.head : P1.total;
    else if (tr.path === P2) s = st.pass === 1 ? st.head : -1;
    const n = s < 0 ? 0 : tr.path.indexAt(s) + 1;
    tr.line.geometry.setDrawRange(0, n);
  }
}

const fuserBase = new THREE.Color(pal.fuser);
function updateMechanics(st, time) {
  for (const r of press.rotors) {
    const d = r.src === 'm' ? st.m : st.roll;
    r.obj.rotation.z = (-d / r.r) * r.sign;
  }
  // belt cross lines
  const cp = belt.cross.geometry.attributes.position.array;
  const sp = 0.4, off = ((st.m % sp) + sp) % sp;
  for (let i = 0; i < belt.nCross; i++) {
    belt.sample(i * sp + off, q);
    const nx = q[3] * 0.012, ny = -q[2] * 0.012;
    cp.set([q[0] + nx, q[1] + ny, -BELT_W / 2, q[0] + nx, q[1] + ny, BELT_W / 2], i * 6);
  }
  belt.cross.geometry.attributes.position.needsUpdate = true;

  press.polygonMirror.rotation.y = time * 9;
  press.fan.rotation.y = time * 6;

  // lasers flicker while the station is writing
  press.lasers.forEach((mat, i) => {
    const k = belt.stations.findIndex((s) => s.id === STATIONS[i].id);
    const on = laserActive[k];
    mat.opacity = on ? 0.55 + 0.45 * Math.abs(Math.sin(time * 37 + i * 1.7)) : 0.06;
  });

  // diverter: down for pass 1, flat for pass 2
  const gate = st.pass === 0 ? -0.42 : 0.12;
  press.diverter.rotation.z += (gate - press.diverter.rotation.z) * 0.15;

  // fuser glow when the sheet is in the nip
  const fx = 18.75;
  const { path: ap, head: ah, len: al } = st.act;
  const inFuser = ap.sample(ah, q)[0] > fx - 0.3 && ap.sample(ah - al, q)[0] < fx + 0.3 && Math.abs(q[1] - PAPER_Y) < 0.5;
  const glow = 0.75 + (inFuser ? 0.6 : 0) + 0.1 * Math.sin(time * 3);
  press.mats.fuser.color.copy(fuserBase).multiplyScalar(glow);
  press.mats.lamp.opacity = 0.6 + (inFuser ? 0.4 : 0);

  // inline sensor beam
  const sx = P2.sample(P2.marks.sensor, q)[0];
  let sensing = false;
  if (st.pass === 1 || st.long) {
    const h = ap.sample(ah, q)[0];
    const tl = ap.sample(ah - al, q)[0];
    sensing = h > sx && tl < sx && Math.abs(q[1] - PAPER_Y) < 0.5;
  }
  press.sensorMat.opacity = sensing ? 0.7 + 0.3 * Math.sin(time * 20) : 0.18;

  // air knife streaks, over whichever tray is feeding
  const airP = press.air.geometry.attributes.position.array;
  const feeding = st.long ? st.feedExt > 0.99 && st.DL < P3.marks.reg - 1 : st.D < K1.reg - 1;
  press.mats.air.opacity = 0.75 * (feeding ? 1 : 0.15);
  const airY = 6.9 + (st.long ? 0 : FEED_DY);
  for (let i = 0; i < press.nAir; i++) {
    const ph = (time * 1.4 + i * 0.37) % 1;
    const z = -1.0 + (2.0 * ((i * 7) % press.nAir)) / (press.nAir - 1);
    const y = airY + ((i * 3) % 5) * 0.06;
    const x = 3.84 - ph * 0.9;
    airP.set([x, y, z, x - 0.18, y + 0.02, z], i * 6);
  }
  press.air.geometry.attributes.position.needsUpdate = true;

  // long-sheet extensions: feed side slides out of the HCF, delivery side
  // pulls out of the top tray as its end stop folds flat
  press.feedExt.position.x = lerp(3.4, 0, st.feedExt);
  press.feedExt.visible = st.feedExt > 0.001;
  press.out.ext.position.x = -press.out.extLen * (1 - st.outExt);
  press.out.ext.visible = st.outExt > 0.001;
  press.out.stop.rotation.z = (-st.outExt * Math.PI) / 2;
}

// ------------------------------------------------------------------ intro reveal
// The first INTRO of the scroll happens before the story starts: the press is
// closed up and solid, the doors swing / slide open module by module, then the
// doors and skins fade to leave the wireframe.
const INTRO = 0.08;
let deckOpen = 0.6;
function updateReveal(r) {
  const open = (d) => ease((r - 0.06 - d.mod * 0.08) / 0.34);
  const doorsA = 1 - ease((r - 0.6) / 0.25);
  const solid = 1 - ease((r - 0.62) / 0.33);
  for (const d of press.doors) {
    const k = open(d);
    if (d.open === 'S') d.g.position.z = d.f + k * 1.6;
    else d.g.rotation.y = (d.open === 'L' ? -1 : 1) * k * 1.8;
    d.g.visible = doorsA > 0.001;
    // fade as it opens so the internals behind stay readable
    const a = doorsA * lerp(1, 0.14, k), dm = d.mats;
    dm.solid.opacity = a;
    dm.solid.depthWrite = a > 0.6;
    dm.line.opacity = 0.75 * doorsA * lerp(1, 0.4, k);
    if (dm.glass) {
      dm.glass.opacity = 0.45 * a;
      dm.glassFill.opacity = 0.2 * a;
    }
  }
  const m = press.mats;
  // light theme keeps the pale cabinet interior as a backdrop for the dark
  // linework once the skins are gone; the page background is dimmer instead
  const cav = pal.keepCavity ? 1 : solid;
  m.cavity.opacity = cav;
  m.cavity.depthWrite = cav > 0.5;
  m.cavity.visible = cav > 0.001;
  for (const s of m.solids) {
    s.opacity = solid;
    s.depthWrite = solid > 0.5;
    s.visible = solid > 0.001;
  }
  // deck: solid black while closed, then the usual translucent slab
  m.deckFill.opacity = lerp(deckOpen, 0.97, solid);
  m.deckFill.depthWrite = solid > 0.5;
  for (const o of press.deckMeshes) o.renderOrder = solid > 0.001 ? 10 : -1;
}

// ------------------------------------------------------------------ camera
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const headPoint = new THREE.Vector3();
const CAMS = [
  () => ({ p: V(4, 17, 45), t: V(17.8, 5.2, 0) }),
  () => ({ p: V(0.2, 10.6, 16.5), t: V(4.8, 5.4, 0) }),
  () => ({ p: V(7.0, 8.4, 8.2), t: V(9.4, 6.0, 0) }),
  () => ({ p: V(11.6, 13.6, 14.2), t: V(13.8, 7.9, 0) }),
  () => ({ p: V(8.0, 7.6, 8.8), t: V(11.0, 6.2, 0) }),
  () => ({ p: V(21.0, 8.9, 9.4), t: V(18.6, 6.0, 0) }),
  () => ({ p: V(25.2, 7.4, 11.8), t: V(19.8, 3.8, 0) }),
  () => {
    // aim between the duplex path and the belt above it, so the back-side
    // image being built stays in frame alongside the returning sheet
    const t = V(14, 7.6, 0).lerp(headPoint, 0.4);
    return { p: t.clone().add(V(-2.5, 5.2, 15)), t };
  },
  () => ({ p: V(9.8, 10.6, 16.5), t: V(14.0, 6.6, 0) }),
  () => ({ p: V(26.6, 8.6, 10.6), t: V(23.4, 5.9, 0) }),
  () => ({ p: V(38.5, 13.8, 15.5), t: V(31.2, 8.2, 0) }),
  () => ({ p: V(38, 20, 44), t: V(17.8, 5.2, 0) }),
  () => ({ p: V(-4.5, 13.8, 22.5), t: V(2.4, 6.6, 0) }),
  () => {
    // ride along with the long sheet through the engine
    const t = V(14, 6.6, 0).lerp(headPoint, 0.55);
    return { p: t.clone().add(V(-1.5, 6.2, 19)), t };
  },
  () => ({ p: V(38.5, 15.5, 23), t: V(34.2, 8.6, 0) }),
];
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
});
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
let camInit = false;
function updateCamera(st, dt) {
  st.act.path.sample(st.act.head - st.act.len / 2, q);
  headPoint.set(q[0], q[1], 0);
  const i = st.ch;
  const t0 = CH[i].t0, t1 = i + 1 < CH.length ? CH[i + 1].t0 : T_END;
  const p = (st.t - t0) / (t1 - t0);
  const cur = CAMS[i]();
  let pos = cur.p, tgt = cur.t;
  if (i > 0) {
    const prev = CAMS[i - 1]();
    const w = ease(p / 0.32);
    pos = prev.p.clone().lerp(cur.p, w);
    tgt = prev.t.clone().lerp(cur.t, w);
  }
  // narrow screens: pull back
  const aspect = innerWidth / innerHeight;
  if (aspect < 1.2) {
    const k = 1 + (1.2 - aspect) * 1.6;
    pos = tgt.clone().add(pos.clone().sub(tgt).multiplyScalar(k));
    tgt = tgt.clone().add(V(0, -1.2 * (k - 1), 0));
  }
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const right = V(1, 0, 0), dist = pos.distanceTo(tgt);
  pos.addScaledVector(right, mouse.sx * dist * 0.03).add(V(0, -mouse.sy * dist * 0.02, 0));
  if (!camInit) { camPos.copy(pos); camTgt.copy(tgt); camInit = true; }
  const k = 1 - Math.exp(-dt * 7);
  camPos.lerp(pos, k);
  camTgt.lerp(tgt, k);
  camera.position.copy(camPos);
  camera.lookAt(camTgt);

  // housings recede while we're looking inside
  const sh = i === 0 || i === CH_SUMMARY ? 0.5 : 0.2;
  press.mats.shell.opacity += (sh - press.mats.shell.opacity) * 0.1;
  press.mats.panel.opacity += (sh * 0.7 - press.mats.panel.opacity) * 0.1;
  press.mats.deck.opacity += (sh * 1.24 - press.mats.deck.opacity) * 0.1;
  deckOpen += (sh * 1.2 - deckOpen) * 0.1;
}

// ------------------------------------------------------------------ HUD
const $ = (s) => document.querySelector(s);
const panel = {
  num: $('.ch-num'), kicker: $('.ch-kicker'), title: $('.ch-title'), body: $('.ch-body'), specs: $('.ch-specs'),
};
const ro = { pos: $('#ro-pos'), zone: $('#ro-zone'), side: $('#ro-side'), toner: $('#ro-toner') };

const rail = $('.rail');
CH.forEach((c, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span class="lbl">${String(i).padStart(2, '0')} ${c.title}</span><span class="tick"></span>`;
  b.setAttribute('aria-label', c.title);
  b.addEventListener('click', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const next = i + 1 < CH.length ? CH[i + 1].t0 : T_END;
    const tt = i === 0 ? 0 : i === CH.length - 1 ? T_END : c.t0 + (next - c.t0) * 0.02;
    const target = i === 0 ? 0 : INTRO + (tt / T_END) * (1 - INTRO);
    scrollTo({ top: target * max, behavior: 'smooth' });
  });
  rail.appendChild(b);
});
const railBtns = [...rail.children];

let shownCh = -1;
function showChapter(i) {
  if (i === shownCh) return;
  shownCh = i;
  const c = CH[i];
  panel.num.textContent = String(i).padStart(2, '0') + ' / ' + String(CH.length - 1).padStart(2, '0');
  panel.kicker.textContent = c.kicker;
  panel.title.innerHTML = c.title
    .split(' ')
    .map((w) => `<span class="w">${[...w].map((ch) => `<span class="c">${ch}</span>`).join('')}</span>`)
    .join(' ');
  panel.body.textContent = c.body;
  panel.specs.innerHTML = c.specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  railBtns.forEach((b, k) => b.classList.toggle('on', k === i));

  animate(panel.title.querySelectorAll('.c'), {
    opacity: [0, 1], translateY: ['0.4em', '0em'], duration: 520, delay: stagger(16), ease: 'outExpo',
  });
  animate([panel.body, panel.kicker], { opacity: [0, 1], translateY: [8, 0], duration: 600, delay: stagger(60, { start: 120 }), ease: 'outQuart' });
  animate(panel.specs.children, { opacity: [0, 1], translateX: [-6, 0], duration: 420, delay: stagger(35, { start: 220 }), ease: 'outQuart' });
}

// shared tail of every route: from the transfer nip to the top tray
function zoneFromNip(M, h) {
  if (h < M.nip + 0.4) return '2ND TRANSFER';
  if (h < M.fuser - 0.6) return 'TRANSPORT';
  if (h < M.exit) return 'FUSER';
  if (h < M.decurl - 0.3) return 'COOLING';
  if (h < M.sensor - 0.1) return 'DECURLER';
  if (h < M.finEntry) return 'INLINE SENSOR';
  if (h < M.finExit) return 'FINISHER';
  return 'OUTPUT TRAY';
}

function zoneOf(st) {
  const { path, head } = st.act;
  path.sample(head, q);
  const [x, y] = q;
  if (st.long) {
    if (x < 7) return 'UPPER TRAY FEED';
    if (head <= P3.marks.reg + 0.02) return x < 8.8 ? 'ENGINE ENTRY' : 'REGISTRATION';
    return zoneFromNip(P3.marks, head);
  }
  if (st.pass === 0) {
    if (x < 7) return 'HCF FEED';
    if (head <= P1.marks.reg + 0.02) return x < 8.8 ? 'ENGINE ENTRY' : 'REGISTRATION';
    if (head < P1.marks.nip + 0.4) return '2ND TRANSFER';
    if (head < P1.marks.fuser - 0.6) return 'TRANSPORT';
    if (head < P1.marks.div) return 'FUSER';
    return 'INVERTER';
  }
  if (x > 19.9 && y < 4.4) return 'INVERTER';
  if (y < 5.3 && x > 7.5) return 'DUPLEX RETURN';
  if (head <= P2.marks.reg + 0.02) return 'REGISTRATION';
  return zoneFromNip(P2.marks, head);
}

function tonerOf(st) {
  if (st.long) {
    if (st.DL < P3.marks.nip) return st.m - mStart3 > cFirst ? 'ON BELT' : 'NONE';
    if (st.DL - L_LONG < P3.marks.fuser) return 'A · POWDER';
    return 'A · FUSED';
  }
  if (st.pass === 0) {
    if (st.head < P1.marks.nip) return st.m - mStart1 > cFirst ? 'ON BELT' : 'NONE';
    if (st.head - L < P1.marks.fuser) return 'A · POWDER';
    return 'A · FUSED';
  }
  if (st.head < P2.marks.nip) return 'A · FUSED';
  if (st.head - L < P2.marks.fuser) return 'B · POWDER';
  return 'A+B · FUSED';
}

let lastRO = '';
function updateHUD(st) {
  showChapter(st.ch);
  const travelled = st.long ? (st.DL - DL0) * MM : Math.max(0, st.D - L) * MM;
  const side = st.long ? '1 · SIMPLEX' : st.pass === 0 ? '1 · SIDE A' : '2 · SIDE B';
  const zone = zoneOf(st), toner = tonerOf(st);
  const key = `${travelled.toFixed(0)}|${zone}|${side}|${toner}`;
  if (key !== lastRO) {
    lastRO = key;
    ro.pos.textContent = travelled.toLocaleString(undefined, { maximumFractionDigits: 0 });
    ro.zone.textContent = zone;
    ro.side.textContent = side;
    ro.toner.textContent = toner;
  }
}

// ------------------------------------------------------------------ callouts
const outTray = press.out.tray.position;
const beltTopMid = belt.stations.find((s) => s.id === 'M');
const LABELS = [
  { t: 'HIGH-CAPACITY FEEDER', at: [3.5, MODULES[0].y1, 3.5], d: [-30, -46], ch: [0, 11] },
  { t: 'PRINT ENGINE', s: '5-station tandem', at: [14.2, 12, 3.8], d: [-10, -44], ch: [0, 11] },
  { t: 'COOL · DECURL · SENSE', at: [23.2, MODULES[2].y1, MODULES[2].z], d: [20, -52], ch: [0, 11] },
  { t: 'FINISHER', at: [26.6, MODULES[3].y1, 3.6], d: [30, -38], ch: [0, 11] },
  { t: 'OUTPUT TRAY', at: [outTray.x + 1, outTray.y - 0.4, 1.4], d: [40, 40], ch: [10, 11] },
  { t: '3,520', cls: 'dim', at: [17.6, 0, 6.2], d: [0, 14], ch: [0, 11] },
  { t: '1,200', cls: 'dim', at: [-1.4, 6, 3.8], d: [-12, 0], ch: [0, 11] },

  { t: 'AIR KNIFE', s: 'floats the top sheets', at: [4.2, 6.6 + FEED_DY, 1.25], d: [56, 44], ch: [1] },
  { t: 'VACUUM FEED BELT', at: [3.9, 7.79 + FEED_DY, 0.95], d: [-30, -64], ch: [1] },
  { t: 'TAKEAWAY ROLLS', at: [5.5, 7.35 + FEED_DY, 1.25], d: [60, -46], ch: [1] },
  { t: 'PAPER STACK', s: '~2,000 sheets', at: [1.4, 6.3 + FEED_DY, 1.05], d: [-50, 40], ch: [1] },

  { t: 'REGISTRATION ROLLS', at: [9.3, 5.8, 1.35], d: [-50, 60], ch: [2, 4] },
  { t: 'EDGE SENSORS', s: 'skew + lateral', at: [8.9, 6.08, 1.2], d: [-40, -60], ch: [2] },
  { t: 'SHEET', s: 'skewed on arrival', at: [7.6, PAPER_Y + 0.3, -1.05], d: [-40, -40], ch: [2] },

  ...belt.stations.map((s) => ({
    t: s.id, s: s.ink, at: [s.x, s.drumY + 0.38, 1.5], d: [0, -40], ch: [3], cls: 'station', station: s.id,
  })),
  { t: 'LASER SCANNER', s: 'polygon mirror', at: [11.2, 10.5, 1.5], d: [-40, -40], ch: [3] },
  { t: 'INTERMEDIATE BELT', s: 'image builds here', at: [beltTopMid.x + 0.6, beltTopMid.beltY, 1.3], d: [30, 70], ch: [3, 4] },

  { t: '2ND TRANSFER ROLL', at: [10.2, PAPER_Y - 0.7, 1.4], d: [40, 60], ch: [4] },
  { t: 'TRANSFER NIP', at: [10.2, PAPER_Y, 1.05], d: [-60, -50], ch: [4] },

  { t: 'HEAT ROLL', s: '~180 °C', at: [18.75, PAPER_Y + 1.11, 1.6], d: [-50, -50], ch: [5] },
  { t: 'PRESSURE ROLL', at: [18.75, PAPER_Y - 1.01, 1.6], d: [-50, 50], ch: [5] },
  { t: 'FUSER NIP', at: [18.75, PAPER_Y, 1.05], d: [70, -10], ch: [5] },

  { t: 'DIVERTER GATE', at: [19.8, PAPER_Y, 1.35], d: [60, -44], ch: [6] },
  { t: 'INVERTER', s: 'stop + reverse', at: [20.4, 2.4, 1.3], d: [70, 20], ch: [6] },

  { t: 'DUPLEX RETURN', at: [14.5, 4.35, 1.3], d: [10, 60], ch: [7] },
  { t: 'U-TURN', s: 'side B now up', at: [7.675, 4.975, 1.3], d: [-60, 40], ch: [7] },

  { t: 'SIDE B IMAGE', s: 'on belt', at: [beltTopMid.x, beltTopMid.beltY, 1.3], d: [30, -70], ch: [8] },
  { t: '2ND TRANSFER', at: [10.2, PAPER_Y, 1.05], d: [-50, 50], ch: [8] },
  { t: 'FUSER', at: [18.75, 7.0, 1.8], d: [40, -50], ch: [8] },

  { t: 'COOLING BELT', at: [22.5, PAPER_Y + 0.64, 1.25], d: [-50, -60], ch: [9] },
  { t: 'HEAT SINK', at: [22.5, 4.4, 1.5], d: [-50, 40], ch: [9] },
  { t: 'DECURLER', at: [23.7, PAPER_Y - 0.4, 1.3], d: [10, 64], ch: [9] },
  { t: 'INLINE SENSOR', s: 'colour + registration', at: [24.45, 6.75, 1.6], d: [50, -50], ch: [9] },

  { t: 'EXIT ROLLS', at: [31.7, 8.7, 1.35], d: [-40, -50], ch: [10] },
  { t: 'BOOKLET MAKER', at: [29.4, 3.1, 1.3], d: [50, 40], ch: [10] },

  { t: 'LONG-SHEET EXTENSION', at: [-1.6, FEED_Y_UPPER - 0.06, 1.3], d: [-40, 50], ch: [12] },
  { t: 'UPPER TRAY', s: 'long sheets', at: [1.4, FEED_Y_UPPER - 0.9, 1.05], d: [-50, 60], ch: [12] },
  { t: 'VACUUM FEED BELT', at: [3.9, 7.79, 0.95], d: [-20, -64], ch: [12] },
  { t: 'IMAGE ON BELT', s: '660 mm long', at: [beltTopMid.x, beltTopMid.beltY, 1.3], d: [30, -70], ch: [13] },
  { t: 'DIVERTER GATE', s: 'up: straight through', at: [19.8, PAPER_Y, 1.35], d: [60, -44], ch: [13] },
  { t: 'TRAY EXTENSION', at: [outTray.x + 3.2, outTray.y + 0.1, 1.3], d: [40, 50], ch: [14] },
  { t: 'EXIT ROLLS', at: [31.7, 8.7, 1.35], d: [30, -60], ch: [14] },
];

const svgNS = 'http://www.w3.org/2000/svg';
const leaders = $('#leaders');
const labelsEl = $('#labels');
for (const l of LABELS) {
  const el = document.createElement('div');
  el.className = 'callout' + (l.cls ? ' ' + l.cls : '');
  el.innerHTML = `<div class="t">${l.t}</div>${l.s ? `<div class="s">${l.s}</div>` : ''}`;
  labelsEl.appendChild(el);
  l.el = el;
  l.v = new THREE.Vector3(...l.at);
  if (l.cls !== 'dim') {
    l.line = document.createElementNS(svgNS, 'polyline');
    l.dot = document.createElementNS(svgNS, 'circle');
    l.dot.setAttribute('r', 3);
    leaders.append(l.line, l.dot);
  }
}
const pv = new THREE.Vector3();
function updateLabels(st) {
  const w = innerWidth, h = innerHeight;
  const small = w < 760;
  for (const l of LABELS) {
    const on = l.ch.includes(st.ch) && !(small && l.s === undefined && l.cls === 'dim');
    pv.copy(l.v).project(camera);
    const vis = on && pv.z < 1 && Math.abs(pv.x) < 1.2 && Math.abs(pv.y) < 1.2;
    l.el.classList.toggle('on', vis);
    if (l.line) { l.line.classList.toggle('on', vis); l.dot.classList.toggle('on', vis); }
    if (!vis && !l.el._wasVis) continue;
    l.el._wasVis = vis;
    const ax = (pv.x * 0.5 + 0.5) * w, ay = (-pv.y * 0.5 + 0.5) * h;
    const [dx, dy] = l.d;
    const ex = ax + dx, ey = ay + dy;
    const dir = dx < 0 ? -1 : 1;
    if (l.line) {
      const tx = ex + dir * 14;
      l.line.setAttribute('points', `${ax},${ay} ${ex},${ey} ${tx},${ey}`);
      l.dot.setAttribute('cx', ax);
      l.dot.setAttribute('cy', ay);
      l.el.style.transform = `translate(${tx + dir * 4}px, ${ey}px) translate(${dir < 0 ? '-100%' : '0'}, -50%)`;
    } else {
      l.el.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
    }
  }
}

// ------------------------------------------------------------------ minimap
const mm = $('#minimap');
mm.setAttribute('viewBox', '-0.6 -13.4 36.4 13.9');
mm.setAttribute('preserveAspectRatio', 'xMidYMid meet');
{
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('transform', 'scale(1,-1)');
  const add = (tag, attrs) => {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    e.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(e);
    return e;
  };
  add('line', { x1: -0.5, y1: 0, x2: 35.8, y2: 0, class: 'mm-ground' });
  for (const m of MODULES) add('rect', { x: m.x0, y: 0.4, width: m.x1 - m.x0, height: m.y1 - 0.4, class: 'mm-module' });
  add('polyline', { points: P0.pts.map((p) => p.join(',')).join(' '), class: 'mm-path' });
  add('polyline', { points: P1.pts.map((p) => p.join(',')).join(' '), class: 'mm-path' });
  add('polyline', { points: P2.pts.map((p) => p.join(',')).join(' '), class: 'mm-path' });
  add('polyline', { points: belt.loop.pts.map((p) => p.join(',')).join(' '), class: 'mm-belt' });
  mm.trail1 = add('polyline', { points: '', class: 'mm-trail' });
  mm.trail2 = add('polyline', { points: '', class: 'mm-trail2' });
  mm.trail3 = add('polyline', { points: '', class: 'mm-trail' });
  mm.sheet = add('polyline', { points: '', class: 'mm-sheet' });
  mm.appendChild(g);
}
let mmKey = '';
function updateMinimap(st) {
  const key = st.D.toFixed(2) + '|' + st.DL.toFixed(2);
  if (key === mmKey) return;
  mmKey = key;
  const pts = (path, s1) => {
    const n = path.indexAt(s1);
    const arr = path.pts.slice(0, n + 1).map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2));
    path.sample(s1, q);
    arr.push(q[0].toFixed(2) + ',' + q[1].toFixed(2));
    return arr.join(' ');
  };
  mm.trail1.setAttribute('points', st.long ? '' : pts(P1, st.pass === 0 ? st.head : P1.total));
  mm.trail2.setAttribute('points', !st.long && st.pass === 1 ? pts(P2, st.head) : '');
  mm.trail3.setAttribute('points', st.long ? pts(P3, st.DL) : '');
  const { path, head, len } = st.act;
  const sp = [];
  for (let i = 0; i <= 24; i++) {
    path.sample(head - (i / 24) * len, q);
    sp.push(q[0].toFixed(2) + ',' + q[1].toFixed(2));
  }
  mm.sheet.setAttribute('points', sp.join(' '));
}

// ------------------------------------------------------------------ theme
const toggle = $('.theme-toggle');
function applyTheme(name) {
  themeName = name;
  pal = PALETTES[name];
  document.documentElement.dataset.theme = name;
  scene.background.set(pal.bg);
  bloom.enabled = pal.bloom;
  press.setTheme(pal);
  railMatBase.color.set(pal.rail);
  trailMat.color.set(pal.trail);
  trailMat2.color.set(pal.trail2);
  for (const sh of sheets) {
    sh.outline.material.color.set(pal.outline);
    sh.mat.uniforms.uPaper.value.set(pal.paper);
    sh.mat.uniforms.uGrid.value.set(pal.paperGrid);
    sh.mat.uniforms.uGain.value = pal.paperGain;
  }
  fuserBase.set(pal.fuser);
  for (const l of LABELS) {
    if (!l.station) continue;
    const c = pal.stations[l.station];
    l.el.querySelector('.t').style.color = c;
    l.line.style.stroke = c;
    l.dot.style.stroke = c;
  }
  const next = name === 'light' ? 'dark' : 'light';
  toggle.setAttribute('aria-label', `Switch to ${next} mode`);
  toggle.title = `Switch to ${next} mode`;
}
toggle.addEventListener('click', () => {
  const next = themeName === 'light' ? 'dark' : 'light';
  storeTheme(next);
  applyTheme(next);
});
applyTheme(themeName);

// solid internals toggle: fades lit solids in under the wireframe edges
const solidBtn = $('.solid-toggle');
let solidOn = storedSolid(), solidK = solidOn ? 1 : 0;
const setSolidBtn = () => {
  solidBtn.setAttribute('aria-pressed', String(solidOn));
  solidBtn.title = solidOn ? 'Show internal parts as wireframe' : 'Show internal parts as solids';
};
setSolidBtn();
solidBtn.addEventListener('click', () => {
  solidOn = !solidOn;
  storeSolid(solidOn);
  setSolidBtn();
});

// autoplay: scrolls the page at a steady rate from the frame loop; any manual
// scroll input (wheel, touch, keys, clicks elsewhere) hands control back
const PLAY_SECONDS = 110; // full top-to-bottom run
const playBtn = $('.play-toggle');
let playing = false, playPos = 0;
function setPlaying(on) {
  playing = on;
  playBtn.setAttribute('aria-pressed', String(on));
  playBtn.querySelector('span').textContent = on ? 'Pause' : 'Play';
  playBtn.title = on ? 'Pause the tour' : 'Play the tour automatically';
  if (!on) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  playPos = scrollY >= max - 1 ? 0 : scrollY; // replay from the top when finished
  if (playPos === 0) scrollTo(0, 0);
}
playBtn.addEventListener('click', () => setPlaying(!playing));
const stopPlay = (e) => { if (playing && !playBtn.contains(e.target)) setPlaying(false); };
for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown']) addEventListener(ev, stopPlay, { passive: true });
function stepPlay(dt) {
  if (!playing) return;
  const max = document.documentElement.scrollHeight - innerHeight;
  playPos = Math.min(max, playPos + (max / PLAY_SECONDS) * dt);
  scrollTo(0, playPos);
  if (playPos >= max) setPlaying(false);
}

// ------------------------------------------------------------------ loop
const hint = $('.scroll-hint');
const progress = $('.progress i');
let tView = 0;
const scrollT = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? clamp(scrollY / max) : 0;
};
tView = scrollT();

let last = performance.now();
const clock0 = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const time = (now - clock0) / 1000;
  stepPlay(dt);
  const target = scrollT();
  tView += (target - tView) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - tView) < 1e-5) tView = target;

  const st = computeState(clamp((tView - INTRO) / (1 - INTRO)) * T_END);
  updateReveal(tView / INTRO);
  updateSheets(st);
  updateBeltImages(st);
  // solids hide the belt while toner is laid down (both the front image and
  // the back-side build during the duplex trip), so fade them out then
  const solidTarget = solidOn && st.ch !== CH_IMAGE && !laserActive.includes(1) ? 1 : 0;
  solidK += (solidTarget - solidK) * (1 - Math.exp(-dt * 5));
  if (Math.abs(solidK - solidTarget) < 1e-3) solidK = solidTarget;
  press.setSolid(solidK);
  updateTrails(st);
  updateMechanics(st, time);
  updateCamera(st, dt);
  updateHUD(st);
  updateLabels(st);
  updateMinimap(st);
  hint.classList.toggle('gone', target > 0.01);
  progress.style.transform = `scaleX(${tView})`;

  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  applyViewOffset();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// intro
animate('.brandbar, .panel, .readout, .rail, .minimap', {
  opacity: [0, 1], translateY: [10, 0], duration: 900, delay: stagger(90, { start: 150 }), ease: 'outExpo',
});
requestAnimationFrame(frame);
