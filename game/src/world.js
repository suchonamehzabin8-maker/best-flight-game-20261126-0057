// Ridgeline Run — the valley itself: terrain mesh, water, runway, rings, clouds.
// One clear job: turn the height function into the meshes the renderer draws,
// and answer "how high is the ground here?" for the flight model.

import { AIRFIELD, CLOUDS, LAKE, RINGS, RUNWAY, WATER_LEVEL, WORLD_HALF } from './config.js';
import { fbm, makeRng, terrainHeight } from './noise.js';

// Colour the ground by height and slope: sand at the shore, grass on the valley
// floor, dark forest on the slopes, grey rock high up, snow on the peaks.
// A patch of noise breaks the grass into fields so the valley reads from the air.
export function groundColor(x, z, h, slope) {
  const patch = 0.86 + 0.28 * (fbm(x * 0.0011, z * 0.0011, 41, 2) * 0.5 + 0.5);
  const shade = (c) => [c[0] * patch, c[1] * patch, c[2] * patch];
  if (h < 2.5) return shade([0.76, 0.70, 0.52]); // beach sand
  if (h < 26) return shade([0.42, 0.58, 0.30]); // valley grass
  if (h < 90) return shade(slope > 0.55 ? [0.36, 0.42, 0.26] : [0.28, 0.46, 0.24]); // forest
  if (h < 150) return shade([0.45, 0.44, 0.40]); // rock
  return shade([0.92, 0.93, 0.96]); // snow
}

function pushTriangle(out, a, b, c) {
  out.positions.push(...a.p, ...b.p, ...c.p);
  out.colors.push(...a.c, ...b.c, ...c.c);
  // Flat-shaded normal from the winding.
  const ux = b.p[0] - a.p[0];
  const uy = b.p[1] - a.p[1];
  const uz = b.p[2] - a.p[2];
  const vx = c.p[0] - a.p[0];
  const vy = c.p[1] - a.p[1];
  const vz = c.p[2] - a.p[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  for (let i = 0; i < 3; i++) out.normals.push(nx, ny, nz);
}

function newMesh() {
  return { positions: [], normals: [], colors: [] };
}

function finalizeMesh(m) {
  return {
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    colors: new Float32Array(m.colors),
    count: m.positions.length / 3,
  };
}

// A 150x150 grid over the whole valley, coloured by height and slope.
export function buildTerrainMesh() {
  const N = 150;
  const step = (WORLD_HALF * 2) / N;
  const mesh = newMesh();
  const grid = [];
  for (let j = 0; j <= N; j++) {
    const row = [];
    for (let i = 0; i <= N; i++) {
      const x = -WORLD_HALF + i * step;
      const z = -WORLD_HALF + j * step;
      row.push(terrainHeight(x, z));
    }
    grid.push(row);
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = -WORLD_HALF + i * step;
      const z0 = -WORLD_HALF + j * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      const h00 = grid[j][i];
      const h10 = grid[j][i + 1];
      const h01 = grid[j + 1][i];
      const h11 = grid[j + 1][i + 1];
      const slope = Math.abs(h10 - h00) / step + Math.abs(h01 - h00) / step;
      const v = (x, z, h) => ({ p: [x, h, z], c: groundColor(x, z, h, slope) });
      pushTriangle(mesh, v(x0, z0, h00), v(x1, z0, h10), v(x0, z1, h01));
      pushTriangle(mesh, v(x1, z0, h10), v(x1, z1, h11), v(x0, z1, h01));
    }
  }
  return finalizeMesh(mesh);
}

// One flat quad of water over the lake basin, slightly transparent.
export function buildWaterMesh() {
  const mesh = newMesh();
  const x0 = LAKE.x - LAKE.radius - 60;
  const x1 = LAKE.x + LAKE.radius + 60;
  const z0 = LAKE.z - LAKE.radius - 60;
  const z1 = LAKE.z + LAKE.radius + 60;
  const y = WATER_LEVEL;
  const c = [0.16, 0.42, 0.62];
  const v = (x, z) => ({ p: [x, y, z], c });
  pushTriangle(mesh, v(x0, z0), v(x1, z0), v(x0, z1));
  pushTriangle(mesh, v(x1, z0), v(x1, z1), v(x0, z1));
  return finalizeMesh(mesh);
}

// The runway: a dark strip with white edge lines and a centreline, plus a
// threshold bar at each end. Built flat at the airfield height.
export function buildRunwayMesh() {
  const mesh = newMesh();
  const y = AIRFIELD.height + 0.8;
  const hw = RUNWAY.width / 2;
  const z0 = RUNWAY.zStart;
  const z1 = RUNWAY.zEnd;
  const x = RUNWAY.x;
  const asphalt = [0.16, 0.16, 0.18];
  const white = [0.92, 0.92, 0.90];
  const quad = (ax, az, bx, bz, c) => {
    const v = (px, pz) => ({ p: [px, y, pz], c });
    pushTriangle(mesh, v(ax, az), v(bx, az), v(ax, bz));
    pushTriangle(mesh, v(bx, az), v(bx, bz), v(ax, bz));
  };
  // Asphalt slab.
  quad(x - hw, z0, x + hw, z1, asphalt);
  // Edge lines.
  quad(x - hw + 1, z0, x - hw + 3, z1, white);
  quad(x + hw - 3, z0, x + hw - 1, z1, white);
  // Centreline dashes.
  for (let z = z0 + 30; z < z1 - 30; z += 60) {
    quad(x - 1.2, z, x + 1.2, z + 28, white);
  }
  // Threshold bars at both ends.
  for (const tz of [z0 + 8, z1 - 26]) {
    for (let k = -3; k <= 3; k++) {
      quad(x + k * 4 - 1.4, tz, x + k * 4 + 1.4, tz + 18, white);
    }
  }
  // Big runway numbers, drawn as blocky 2 and 7 at the south threshold.
  const digit = (ox, oz, segments) => {
    for (const [sx, sz, w, h] of segments) quad(ox + sx, oz + sz, ox + sx + w, oz + sz + h, white);
  };
  digit(x - 14, z1 - 90, [[0, 0, 10, 3], [7, 3, 3, 9], [0, 9, 10, 3], [0, 12, 3, 9], [0, 18, 10, 3]]);
  digit(x + 4, z1 - 90, [[0, 0, 10, 3], [0, 0, 3, 21], [0, 9, 10, 3]]);
  return finalizeMesh(mesh);
}

// A glowing ring: a tube around a circle plus a faint translucent disc, so the
// pilot can read the target from far away and through it up close.
export function buildRingMesh(cx, cy, cz, radius, headingDeg) {
  const tube = newMesh();
  const disc = newMesh();
  const segs = 28;
  const tubeR = 2.2;
  const heading = (headingDeg * Math.PI) / 180;
  // Ring plane faces along the flight direction: rotate the circle so its
  // normal points along the heading.
  const ux = Math.cos(heading);
  const uz = -Math.sin(heading);
  const vx = 0;
  const vy = 1;
  const vz = 0;
  const point = (a, rr) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return [
      cx + (ux * ca + vx * sa) * rr,
      cy + (0 * ca + vy * sa) * rr,
      cz + (uz * ca + vz * sa) * rr,
    ];
  };
  const glow = [1.0, 0.72, 0.12];
  const rim = [1.0, 0.45, 0.05];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // Flat glowing band: a quad between the inner and outer edge of the ring,
    // lying in the ring plane so it reads cleanly from any angle.
    const inner0 = point(a0, radius - tubeR);
    const outer0 = point(a0, radius + tubeR);
    const inner1 = point(a1, radius - tubeR);
    const outer1 = point(a1, radius + tubeR);
    const v = (p, col) => ({ p, c: col });
    pushTriangle(tube, v(inner0, glow), v(outer0, rim), v(inner1, glow));
    pushTriangle(tube, v(outer0, rim), v(outer1, rim), v(inner1, glow));
    // Disc fan, faint amber.
    const c0 = point(a0, radius);
    const c1 = point(a1, radius);
    const dc = [1.0, 0.8, 0.35];
    pushTriangle(disc, v([cx, cy, cz], dc), v(c0, dc), v(c1, dc));
  }
  return { tube: finalizeMesh(tube), disc: finalizeMesh(disc) };
}

// Rings in flight order, each facing the next ring so the circuit reads as a path.
export function buildRings() {
  return RINGS.map((ring, i) => {
    const next = RINGS[(i + 1) % RINGS.length];
    const dx = next.x - ring.x;
    const dz = next.z - ring.z;
    const headingDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
    return { ...ring, headingDeg, meshes: buildRingMesh(ring.x, ring.y, ring.z, ring.r, headingDeg) };
  });
}

// Soft billboard clouds: positions and sizes, the renderer draws the sprite.
export function buildClouds() {
  const rng = makeRng(99);
  return CLOUDS.map((c) => ({
    x: c.x + (rng() - 0.5) * 200,
    y: c.y,
    z: c.z + (rng() - 0.5) * 200,
    size: c.s,
    drift: 1.5 + rng() * 2,
  }));
}

// Scattered low-poly pines on the grass and lower forest, kept clear of the
// runway, the lake and the ring line so they never block a landing.
export function buildTreesMesh() {
  const mesh = newMesh();
  const rng = makeRng(7);
  const trunk = [0.35, 0.22, 0.12];
  const greens = [
    [0.16, 0.34, 0.16],
    [0.2, 0.4, 0.18],
    [0.14, 0.3, 0.2],
  ];
  let placed = 0;
  let tries = 0;
  while (placed < 150 && tries < 3000) {
    tries++;
    const x = (rng() - 0.5) * 5200;
    const z = (rng() - 0.5) * 5200;
    const h = terrainHeight(x, z);
    if (h < 10 || h > 95) continue;
    if (Math.hypot(x - AIRFIELD.x, z - AIRFIELD.z) < 620) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + 80) continue;
    const s = 0.8 + rng() * 0.9;
    const green = greens[Math.floor(rng() * greens.length)];
    const cone = (cx, cy, cz, r, hh, col) => {
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r];
        const p1 = [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r];
        const tip = [cx, cy + hh, cz];
        pushTriangle(mesh, { p: tip, c: col }, { p: p0, c: col }, { p: p1, c: col });
      }
    };
    const box = (cx, cy, cz, sx, sy, sz, col) => {
      const x0 = cx - sx / 2;
      const x1 = cx + sx / 2;
      const y0 = cy - sy / 2;
      const y1 = cy + sy / 2;
      const z0 = cz - sz / 2;
      const z1 = cz + sz / 2;
      const v = (px, py, pz) => ({ p: [px, py, pz], c: col });
      pushTriangle(mesh, v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0));
      pushTriangle(mesh, v(x0, y1, z1), v(x1, y1, z0), v(x0, y1, z0));
      pushTriangle(mesh, v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1));
      pushTriangle(mesh, v(x0, y0, z0), v(x1, y0, z1), v(x0, y0, z1));
      pushTriangle(mesh, v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1));
      pushTriangle(mesh, v(x0, y0, z1), v(x1, y1, z1), v(x0, y1, z1));
      pushTriangle(mesh, v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0));
      pushTriangle(mesh, v(x1, y0, z0), v(x0, y1, z0), v(x1, y1, z0));
      pushTriangle(mesh, v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0));
      pushTriangle(mesh, v(x1, y0, z1), v(x1, y1, z0), v(x1, y1, z1));
      pushTriangle(mesh, v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1));
      pushTriangle(mesh, v(x0, y0, z0), v(x0, y1, z1), v(x0, y1, z0));
    };
    box(x, h + 2.5 * s, z, 1.2 * s, 5 * s, 1.2 * s, trunk);
    cone(x, h + 5 * s, z, 4.2 * s, 7 * s, green);
    cone(x, h + 9 * s, z, 3.0 * s, 6 * s, green);
    placed++;
  }
  return finalizeMesh(mesh);
}

// True when the point is over the runway strip (for landing checks).
export function overRunway(x, z) {
  return (
    Math.abs(x - RUNWAY.x) <= RUNWAY.width / 2 - 2 && z >= RUNWAY.zStart + 4 && z <= RUNWAY.zEnd - 4
  );
}

// True when the point is on ground a bush plane can land on: the runway, or
// the flat grass of the airfield plateau around it. The ridges and the lake
// are not landable — touching down there is a crash.
export function landableGround(x, z) {
  if (overRunway(x, z)) return true;
  const dx = x - AIRFIELD.x;
  const dz = z - AIRFIELD.z;
  return Math.hypot(dx, dz) < 460;
}

export { terrainHeight };
