// Scene palettes for the light (default) and dark themes. Page chrome colours
// live in styles.css as tokens; these are the WebGL / SVG-side equivalents.
// Brand: Doggett blue #0074C8, silver-grey #797774.

export const BRAND = { blue: '#0074c8', grey: '#797774' };

export const PALETTES = {
  light: {
    bg: '#d5dee7',
    bloom: false,
    keepCavity: true,
    // housing + mechanism line colours
    shell: '#4f7ba5', panel: '#8aa6c0', mech: '#17446f', mechDim: '#56799b', guide: '#6c8cab',
    stack: '#a88a4e', grid: '#c8d3de', gridMajor: '#b8c6d4', dim: '#8ba1b6',
    fuser: '#e0561b', lamp: '#ff7a2e', sensor: '#0092c4', belt: '#234d78', beltCross: '#7c97b1',
    air: '#2c98d4', deck: '#8995a1', glass: '#3f97cf', laser: '#e3342b', door: '#6a88a4',
    // solid skins: front, top, ends/back; the cabinet interior (kept near-white
    // so dark internals read clearly against it); doors; dark deck
    solids: ['#ffffff', '#edf1f5', '#dae2ea'], cavity: '#fafbfc', doorSolid: '#f9fbfc',
    deckFill: '#2b333d', glassFill: '#a9d2ee', fill: '#c3d1df',
    // paper path + sheet
    rail: '#8ea4ba', trail: BRAND.blue, trail2: BRAND.grey, outline: BRAND.blue,
    paper: '#ffffff', paperGrid: '#a9bccd', paperGain: 0.96, staple: '#4d5963',
    // minimap
    mmGround: '#c6d2dd', mmModule: '#9fb3c6', mmPath: '#c0ccd8', mmBelt: '#8ba3ba', mmSheet: '#0b2f52',
    stations: { P: '#ee7fb6', Y: '#dcb000', M: '#e0007a', C: '#0098dc', K: '#2a2c2e' },
    // optional solid internals (lit, so these are base colours)
    sMech: '#b3c3d3', sDim: '#d3dde6', sPaper: '#fbf9f3', sBelt: '#d6dee6', sGuide: '#8fa7be', sFuser: '#f0915c',
    stationTint: ['#ffffff', 0.3],
  },
  dark: {
    bg: '#0a1420',
    bloom: true,
    shell: '#6f9dc8', panel: '#547ba1', mech: '#a8c8e6', mechDim: '#7b9bbb', guide: '#7a9cc0',
    stack: '#e3d4b0', grid: '#112236', gridMajor: '#1a3049', dim: '#6a8fb3',
    fuser: '#ff7a3d', lamp: '#ffb070', sensor: '#7fe8ff', belt: '#c6d9ec', beltCross: '#88a6c4',
    air: '#9ad8ff', deck: '#c9d9e8', glass: '#8fd0f5', laser: '#ff5b5b', door: '#b4cde6',
    solids: ['#1b2d42', '#243a52', '#14233a'], cavity: '#08111c', doorSolid: '#213751',
    deckFill: '#05080b', glassFill: '#2a5a7a', fill: '#1a2a3d',
    rail: '#2d5e8c', trail: '#3d9bea', trail2: '#b9bec4', outline: '#6fb6f2',
    paper: '#d7dee6', paperGrid: '#7f97ad', paperGain: 0.8, staple: '#e4ecf3',
    mmGround: '#243449', mmModule: '#35506c', mmPath: '#2c4661', mmBelt: '#44617f', mmSheet: '#e4f1ff',
    stations: { P: '#ffb0d6', Y: '#ffe14a', M: '#ff4fa8', C: '#2ec8ff', K: '#aeb8c2' },
    sMech: '#3a5572', sDim: '#2a3f57', sPaper: '#d9d3c4', sBelt: '#263749', sGuide: '#4d6d8e', sFuser: '#c65a2c',
    stationTint: ['#0a1420', 0.35],
  },
};

const KEY = 'dg-theme';

export function storedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'light';
}

export function storeTheme(name) {
  try { localStorage.setItem(KEY, name); } catch {}
}

export function storedSolid() {
  try { return localStorage.getItem('dg-solid') === '1'; } catch { return false; }
}

export function storeSolid(on) {
  try { localStorage.setItem('dg-solid', on ? '1' : '0'); } catch {}
}
