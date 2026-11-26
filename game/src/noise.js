// Ridgeline Run — deterministic random numbers and the terrain height function.
// One clear job: the same numbers drive the mesh, the collision test and the
// screenshots, so what you see is always what you can land on.

import { AIRFIELD, LAKE, WORLD_HALF } from './config.js';

// mulberry32: a tiny seeded PRNG, so every run builds the same valley.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Value noise in [-1, 1], bilinearly smoothed.
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Fractal brownian motion: several octaves of value noise.
export function fbm(x, z, seed, octaves) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Distance from the airfield centre, 0 at the runway, 1 at the plateau edge.
function airfieldBlend(x, z) {
  const dx = x - AIRFIELD.x;
  const dz = z - AIRFIELD.z;
  const d = Math.sqrt(dx * dx + dz * dz) / AIRFIELD.radius;
  return clamp01(1 - smooth(clamp01(d)));
}

function lakeBlend(x, z) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const d = Math.sqrt(dx * dx + dz * dz) / LAKE.radius;
  return clamp01(1 - smooth(clamp01(d)));
}

// The one height function: rolling hills, a ring of mountains near the map edge,
// a flat airfield plateau, and a lake basin to the east.
export function terrainHeight(x, z) {
  const hills = fbm(x * 0.00042, z * 0.00042, 11, 4) * 80;
  const ridge = Math.pow(Math.max(0, fbm(x * 0.00016 + 7.3, z * 0.00016 + 3.1, 23, 3)), 1.5) * 550;
  const peaks = Math.pow(Math.max(0, fbm(x * 0.0006 + 1.7, z * 0.0006 + 9.4, 31, 3)), 3) * 500;
  const edge = Math.max(0, (Math.hypot(x, z) - 1700) / 1300);
  let h = 34 + hills + (ridge + peaks) * (0.25 + 0.75 * edge * edge);
  // Carve the lake basin below the water line.
  h -= lakeBlend(x, z) * (h + LAKE.depth + 4);
  // Flatten the airfield plateau over the top.
  const ab = airfieldBlend(x, z);
  h = h * (1 - ab) + AIRFIELD.height * ab;
  return h;
}

// True when the point is inside the map the game will fly over.
export function insideWorld(x, z) {
  return Math.abs(x) <= WORLD_HALF && Math.abs(z) <= WORLD_HALF;
}
