// The card, the die and the foil: canvas artwork for the printed card, a mask
// of the foil areas (shared by the card, the die face and the holes left in
// the spent foil), and the shaders that draw the metallic gold.
import * as THREE from 'three';
import { SW, SH } from './machine.js';

const PX = 500; // canvas pixels per unit (100 mm)
const W = SW * PX, H = SH * PX;

// Everything that gets foiled, in one colour: a double frame, the wordmark and
// a rule with a diamond. Kept inside the die area (see DIE in machine.js).
function drawFoil(ctx, col) {
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = col;
  ctx.lineWidth = 5;
  ctx.strokeRect(135, 222, 730, 256);
  ctx.lineWidth = 2;
  ctx.strokeRect(152, 239, 696, 222);
  ctx.font = 'italic 700 132px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Doggett', W / 2, 330);
  ctx.fillRect(330, 418, 130, 4);
  ctx.fillRect(540, 418, 130, 4);
  ctx.beginPath();
  ctx.moveTo(500, 404); ctx.lineTo(514, 420); ctx.lineTo(500, 436); ctx.lineTo(486, 420);
  ctx.fill();
  ctx.restore();
}

const canvas = () => {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return [c, c.getContext('2d')];
};
const tex = (c, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

export function makeCardTextures() {
  // printed card: navy board with white type; the foil areas are left bare
  const [a, ctx] = canvas();
  ctx.fillStyle = '#132b44';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let k = 0; k < 900; k++) ctx.fillRect((k * 331) % W, (k * 197) % H, 2, 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fbde6';
  ctx.font = '600 26px "IBM Plex Mono", monospace';
  ctx.fillText('H O W   I T ’ S   D O N E', W / 2, 140);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 38px "Source Sans 3", sans-serif';
  ctx.fillText('Hot foil blocking', W / 2, 568);
  ctx.fillStyle = '#8fa6bd';
  ctx.font = '500 22px "Source Sans 3", sans-serif';
  ctx.fillText('Doggett Group · Creative Communications', W / 2, 612);

  // foil mask: white where the die is raised
  const [m, mctx] = canvas();
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, W, H);
  drawFoil(mctx, '#fff');

  // die face: bright raised relief with a cast shadow on the etched floor.
  // Mapped through mirrored UVs, so it reads backwards on the bed.
  const [d, dctx] = canvas();
  dctx.fillStyle = '#6e767e';
  dctx.fillRect(0, 0, W, H);
  dctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let k = 0; k < 1400; k++) dctx.fillRect((k * 173) % W, (k * 89) % H, 3, 1);
  dctx.save();
  dctx.translate(5, 6);
  drawFoil(dctx, '#3b4148');
  dctx.restore();
  drawFoil(dctx, '#e3e8ec');

  return { art: tex(a), mask: tex(m, false), die: tex(d) };
}

// Fake-metal shading: the reflection vector looks up a banded "environment"
// so bright and dark streaks slide across the foil as the camera moves.
const FOIL_GLSL = /* glsl */ `
  vec3 foilShade(vec3 N, vec3 V, vec3 base, vec3 w) {
    vec3 R = reflect(-V, N);
    float e = 0.5 + 0.5 * sin(R.x * 7.0 + R.y * 4.0 + R.z * 2.0 + dot(w, vec3(0.9, 0.5, 0.3)));
    float brush = 0.05 * sin(dot(w, vec3(40.0, 3.0, 11.0)));
    return base * (0.35 + 0.95 * e + brush) + vec3(1.0, 0.94, 0.78) * pow(e, 10.0) * 0.7;
  }`;
const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN, vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const GOLD = '#d7a53a';

export function makeCardMaterial({ art, mask }, pal, foiled = 0) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTex: { value: art },
      uMask: { value: mask },
      uFoil: { value: foiled },
      uGold: { value: new THREE.Color(GOLD) },
      uPaper: { value: new THREE.Color(pal.paper) },
      uGain: { value: pal.paperGain },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex, uMask;
      uniform float uFoil, uGain;
      uniform vec3 uGold, uPaper;
      varying vec2 vUv;
      varying vec3 vN, vW;
      ${FOIL_GLSL}
      void main() {
        vec3 N = gl_FrontFacing ? vN : -vN;
        vec3 V = normalize(cameraPosition - vW);
        // front: the printed side; back: plain board
        vec3 c = (gl_FrontFacing ? texture2D(uTex, vUv).rgb : vec3(0.9)) * uPaper * uGain;
        float m = gl_FrontFacing ? texture2D(uMask, vUv).r * uFoil : 0.0;
        gl_FragColor = vec4(mix(c, foilShade(N, V, uGold, vW), m), 1.0);
      }`,
  });
}

// The foil ribbon. uv.x = distance along the run, uv.y = height about the die
// centre. The one impression in the story leaves a die-shaped window in the
// metal (just clear carrier film) that travels on as the foil steps.
export function makeFoilMaterial({ mask }) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: {
      uMask: { value: mask },
      uGold: { value: new THREE.Color(GOLD) },
      uFilm: { value: new THREE.Color('#c9dbe8') },
      uHit: { value: 0 },      // run position of the die-centre when stamped
      uAdv: { value: 0 },      // how far the foil has stepped on since
      uStamped: { value: 0 },
      uThread: { value: 1e3 }, // threaded length (the ribbon ends here)
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform vec3 uGold, uFilm;
      uniform float uHit, uAdv, uStamped, uThread;
      varying vec2 vUv;
      varying vec3 vN, vW;
      ${FOIL_GLSL}
      void main() {
        if (vUv.x > uThread) discard;
        float hole = 0.0;
        if (uStamped > 0.5) {
          // the ribbon is mirror-image to the card (it faces it), hence 0.5 − x
          vec2 c = vec2(0.5 - (vUv.x - uHit - uAdv) / ${SW.toFixed(3)}, 0.5 + vUv.y / ${SH.toFixed(3)});
          if (c.x > 0.0 && c.x < 1.0 && c.y > 0.0 && c.y < 1.0) hole = texture2D(uMask, c).r;
        }
        vec3 N = gl_FrontFacing ? vN : -vN;
        vec3 V = normalize(cameraPosition - vW);
        vec3 gold = foilShade(N, V, uGold, vW);
        gl_FragColor = vec4(mix(gold, uFilm, hole), mix(1.0, 0.28, hole));
      }`,
  });
}
