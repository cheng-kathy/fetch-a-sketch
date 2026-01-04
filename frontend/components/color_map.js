// components/color_map.js
const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const toCssRGB = (r, g, b) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;



// legend gradient
const TURBO_STOPS = [
  { t: 0.00, c: [ 30,   0,  70] },  // deeper purple
  { t: 0.20, c: [ 20, 110, 200] },  // brighter blue
  { t: 0.40, c: [  0, 190, 140] },  // strong teal/green
  { t: 0.60, c: [190, 210,  40] },  // vivid yellow-green
  { t: 0.80, c: [255, 160,  10] },  // punchy orange
  { t: 1.00, c: [235,   0,   0] },  // saturated red
];

export function turboGradient(t) {
  t = clamp01(t);
  let i = 0;
  while (i < TURBO_STOPS.length - 1 && t > TURBO_STOPS[i + 1].t) i++;
  const a = TURBO_STOPS[i];
  const b = TURBO_STOPS[Math.min(i + 1, TURBO_STOPS.length - 1)];
  const u = (t - a.t) / Math.max(1e-9, b.t - a.t);
  const r = lerp(a.c[0], b.c[0], u);
  const g = lerp(a.c[1], b.c[1], u);
  const bVal = lerp(a.c[2], b.c[2], u);
  return toCssRGB(r, g, bVal);
}

// Map dependencies using the new turbo-like gradient
export function colorForDependencies(value, min, max) {
  const denom = Math.max(1e-9, max - min);
  const t = clamp01((value - min) / denom);   // 0..1
  return turboGradient(t);
}
