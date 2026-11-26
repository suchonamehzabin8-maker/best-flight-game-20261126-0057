// Ridgeline Run — the WebGL renderer.
// One clear job: draw the valley, the sky, the rings and the plane, and put the
// camera where a pilot would want it. No libraries: one small shader, meshes
// built from the world data, flat-shaded low-poly style throughout.

import { SKY } from './config.js';
import {
  buildClouds,
  buildRings,
  buildRunwayMesh,
  buildTerrainMesh,
  buildTreesMesh,
  buildWaterMesh,
} from './world.js';
import { forwardVector, upVector } from './flight.js';
import { terrainHeight } from './noise.js';

// ---- tiny mat4 helpers (column-major, like WebGL expects) ----

function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

function mat4LookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / len, zy / len, zz / len];
  const xx = up[1] * z[2] - up[2] * z[1];
  const xy = up[2] * z[0] - up[0] * z[2];
  const xz = up[0] * z[1] - up[1] * z[0];
  len = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / len, xy / len, xz / len];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const o = mat4Identity();
  o[0] = x[0];
  o[1] = y[0];
  o[2] = z[0];
  o[4] = x[1];
  o[5] = y[1];
  o[6] = z[1];
  o[8] = x[2];
  o[9] = y[2];
  o[10] = z[2];
  o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  return o;
}

function mat4Translate(x, y, z) {
  const o = mat4Identity();
  o[12] = x;
  o[13] = y;
  o[14] = z;
  return o;
}

function mat4RotateY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function mat4RotateX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function mat4RotateZ(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function mat4Scale(sx, sy, sz) {
  const o = mat4Identity();
  o[0] = sx;
  o[5] = sy;
  o[10] = sz;
  return o;
}

// ---- mesh building helpers ----

function newMesh() {
  return { positions: [], normals: [], colors: [] };
}

function pushTri(m, a, b, c, color) {
  m.positions.push(...a, ...b, ...c);
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  for (let i = 0; i < 3; i++) m.normals.push(nx, ny, nz);
  for (let i = 0; i < 3; i++) m.colors.push(...color);
}

function finalize(m) {
  return {
    positions: new Float32Array(m.positions),
    normals: new Float32Array(m.normals),
    colors: new Float32Array(m.colors),
    count: m.positions.length / 3,
  };
}

// A coloured box centred at (cx, cy, cz) with size (sx, sy, sz).
function addBox(m, cx, cy, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  const v = (x, y, z) => [x, y, z];
  const quad = (a, b, c, d) => {
    pushTri(m, a, b, c, color);
    pushTri(m, a, c, d, color);
  };
  quad(v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)); // top
  quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)); // bottom
  quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)); // front (-z is nose; +z face)
  quad(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)); // back
  quad(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)); // right
  quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)); // left
}

// A low-poly sphere (lat/long, few segments) centred at c with radius r.
function addSphere(m, c, r, color, latSegs = 5, longSegs = 7) {
  const pts = [];
  for (let j = 0; j <= latSegs; j++) {
    const phi = (j / latSegs) * Math.PI;
    const row = [];
    for (let i = 0; i <= longSegs; i++) {
      const theta = (i / longSegs) * Math.PI * 2;
      row.push([
        c[0] + r * Math.sin(phi) * Math.cos(theta),
        c[1] + r * Math.cos(phi),
        c[2] + r * Math.sin(phi) * Math.sin(theta),
      ]);
    }
    pts.push(row);
  }
  for (let j = 0; j < latSegs; j++) {
    for (let i = 0; i < longSegs; i++) {
      pushTri(m, pts[j][i], pts[j + 1][i], pts[j][i + 1], color);
      pushTri(m, pts[j + 1][i], pts[j + 1][i + 1], pts[j][i + 1], color);
    }
  }
}

// The bush plane: cream fuselage, red stripe and wingtips, blue canopy,
// spinning prop, and glowing nav lights. Nose points -z, up is +y.
function buildPlaneMesh() {
  const m = newMesh();
  const cream = [0.93, 0.89, 0.78];
  const red = [0.82, 0.18, 0.12];
  const dark = [0.16, 0.16, 0.18];
  const glass = [0.14, 0.26, 0.42];
  const silver = [0.75, 0.76, 0.78];
  addBox(m, 0, 0, -1.2, 1.5, 1.3, 4.6, cream); // cabin fuselage
  addBox(m, 0, -0.05, -3.9, 1.0, 1.0, 1.6, cream); // nose
  addBox(m, 0, 0.05, 1.6, 1.1, 1.0, 3.4, cream); // tail cone
  addBox(m, 0, -0.15, -1.2, 1.54, 0.28, 4.4, red); // red cheatline stripe
  addBox(m, 0, 0.72, -1.0, 1.0, 0.55, 1.8, glass); // canopy
  addBox(m, 0, 0.1, -0.6, 11.0, 0.16, 1.7, cream); // main wing
  addBox(m, -5.3, 0.1, -0.6, 0.9, 0.18, 1.7, red); // left wingtip
  addBox(m, 5.3, 0.1, -0.6, 0.9, 0.18, 1.7, red); // right wingtip
  addBox(m, 0, 0.15, 3.1, 3.6, 0.14, 1.0, cream); // tailplane
  addBox(m, 0, 0.7, 3.1, 0.14, 1.3, 1.1, red); // vertical fin
  addBox(m, 0, -0.75, -1.6, 0.5, 0.9, 0.5, dark); // nose gear leg
  addBox(m, 0, -1.15, -1.6, 0.7, 0.5, 0.5, dark); // nose wheel
  addBox(m, -0.55, -0.8, 0.4, 0.16, 0.7, 0.16, silver); // left main leg
  addBox(m, 0.55, -0.8, 0.4, 0.16, 0.7, 0.16, silver); // right main leg
  addBox(m, -0.55, -1.1, 0.4, 0.5, 0.5, 0.3, dark); // left wheel
  addBox(m, 0.55, -1.1, 0.4, 0.5, 0.5, 0.3, dark); // right wheel
  return finalize(m);
}

// Propeller: spinner + two slim blades, spun by its own model matrix each frame.
function buildPropMesh() {
  const m = newMesh();
  const blade = [0.32, 0.32, 0.36];
  const silver = [0.8, 0.8, 0.82];
  addSphere(m, [0, 0, -0.15], 0.32, silver, 4, 6);
  addBox(m, 0, 1.5, 0, 0.14, 2.8, 0.08, blade);
  addBox(m, 0, -1.5, 0, 0.14, 2.8, 0.08, blade);
  return finalize(m);
}

// Nav lights as tiny emissive boxes, drawn with the emissive uniform.
function buildNavLightMesh() {
  const m = newMesh();
  addBox(m, -5.75, 0.1, -0.6, 0.2, 0.2, 0.2, [1, 0.1, 0.1]); // left red
  addBox(m, 5.75, 0.1, -0.6, 0.2, 0.2, 0.2, [0.1, 1, 0.2]); // right green
  addBox(m, 0, 0.15, 3.35, 0.2, 0.2, 0.2, [1, 1, 0.9]); // tail white
  return finalize(m);
}

// Sky dome: a hemisphere whose vertex colours fade from zenith blue to a pale
// horizon, drawn unlit and unfogged around the camera.
function buildSkyDome() {
  const m = newMesh();
  const R = 5600;
  const rings = 8;
  const segs = 24;
  const zen = SKY.zenith;
  const hor = SKY.horizon;
  const ringPts = [];
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * (Math.PI / 2);
    const row = [];
    for (let i = 0; i <= segs; i++) {
      const theta = (i / segs) * Math.PI * 2;
      const y = Math.sin(phi);
      const r = Math.cos(phi);
      const p = [r * Math.cos(theta) * R, y * R - 80, r * Math.sin(theta) * R];
      const t = Math.min(1, y * 1.6);
      const c = [
        hor[0] + (zen[0] - hor[0]) * t,
        hor[1] + (zen[1] - hor[1]) * t,
        hor[2] + (zen[2] - hor[2]) * t,
      ];
      row.push({ p, c });
    }
    ringPts.push(row);
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = ringPts[j][i];
      const b = ringPts[j][i + 1];
      const c = ringPts[j + 1][i];
      const d = ringPts[j + 1][i + 1];
      const tri = (p, q, r2) => {
        m.positions.push(...p.p, ...q.p, ...r2.p);
        m.colors.push(...p.c, ...q.c, ...r2.c);
        for (let k = 0; k < 3; k++) m.normals.push(0, 1, 0);
      };
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  return finalize(m);
}

// A soft dark ellipse that follows the plane on the ground — the shadow that
// makes landings readable.
function buildShadowMesh() {
  const m = newMesh();
  const segs = 20;
  const c = [0.05, 0.08, 0.05];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const v = (a) => ({ p: [Math.cos(a) * 7, 0, Math.sin(a) * 4.5], c });
    const p0 = v(a0);
    const p1 = v(a1);
    m.positions.push(0, 0, 0, ...p0.p, ...p1.p);
    m.colors.push(...c, ...p0.c, ...p1.c);
    for (let k = 0; k < 3; k++) m.normals.push(0, 1, 0);
  }
  return finalize(m);
}

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform vec3 uCamPos;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDist;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vColor = aColor;
  vNormal = mat3(uModel) * aNormal;
  vDist = distance(world.xyz, uCamPos);
  gl_Position = uProj * uView * world;
}
`;

const FRAG = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uUnlit;
uniform float uAlpha;
uniform float uEmissive;
varying vec3 vColor;
varying vec3 vNormal;
varying float vDist;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 col = vColor * (0.45 + 0.55 * diff);
  if (uUnlit > 0.5) col = vColor;
  col += vColor * uEmissive;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  if (uUnlit > 0.5) f = 0.0;
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, uAlpha);
}
`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function uploadMesh(gl, mesh) {
  const buffers = {};
  for (const [name, data] of [
    ['positions', mesh.positions],
    ['normals', mesh.normals],
    ['colors', mesh.colors],
  ]) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    buffers[name] = b;
  }
  return { ...mesh, buffers };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL is not available in this browser');
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('program: ' + gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);
  const loc = {};
  for (const name of ['aPos', 'aNormal', 'aColor']) loc[name] = gl.getAttribLocation(program, name);
  for (const name of [
    'uProj',
    'uView',
    'uModel',
    'uCamPos',
    'uSunDir',
    'uFogColor',
    'uFogNear',
    'uFogFar',
    'uUnlit',
    'uAlpha',
    'uEmissive',
  ]) {
    loc[name] = gl.getUniformLocation(program, name);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(SKY.horizon[0], SKY.horizon[1], SKY.horizon[2], 1);

  const meshes = {
    terrain: uploadMesh(gl, buildTerrainMesh()),
    trees: uploadMesh(gl, buildTreesMesh()),
    water: uploadMesh(gl, buildWaterMesh()),
    runway: uploadMesh(gl, buildRunwayMesh()),
    sky: uploadMesh(gl, buildSkyDome()),
    plane: uploadMesh(gl, buildPlaneMesh()),
    prop: uploadMesh(gl, buildPropMesh()),
    nav: uploadMesh(gl, buildNavLightMesh()),
    shadow: uploadMesh(gl, buildShadowMesh()),
  };
  const rings = buildRings().map((r) => ({
    ...r,
    tube: uploadMesh(gl, r.meshes.tube),
    disc: uploadMesh(gl, r.meshes.disc),
  }));
  const clouds = buildClouds().map((c) => {
    const m = newMesh();
    const white = [0.98, 0.98, 1.0];
    addSphere(m, [0, 0, 0], c.size * 0.5, white, 4, 6);
    addSphere(m, [c.size * 0.35, -c.size * 0.06, 0], c.size * 0.36, white, 4, 6);
    addSphere(m, [-c.size * 0.35, -c.size * 0.05, c.size * 0.05], c.size * 0.34, white, 4, 6);
    return { ...c, mesh: uploadMesh(gl, finalize(m)) };
  });
  // The sun is a bright sphere far away — a sphere needs no billboarding.
  const sunMesh = (() => {
    const m = newMesh();
    addSphere(m, [0, 0, 0], 220, [1.0, 0.93, 0.62], 6, 10);
    return uploadMesh(gl, finalize(m));
  })();

  let camPos = [0, 60, 300];
  let camTarget = [0, 20, 0];
  let propAngle = 0;

  function drawMesh(mesh, model, opts = {}) {
    gl.uniformMatrix4fv(loc.uModel, false, model);
    gl.uniform1f(loc.uUnlit, opts.unlit ? 1 : 0);
    gl.uniform1f(loc.uAlpha, opts.alpha ?? 1);
    gl.uniform1f(loc.uEmissive, opts.emissive ?? 0);
    for (const [attr, buf] of [
      ['aPos', mesh.buffers.positions],
      ['aNormal', mesh.buffers.normals],
      ['aColor', mesh.buffers.colors],
    ]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc[attr]);
      gl.vertexAttribPointer(loc[attr], 3, gl.FLOAT, false, 0, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  function resize(w, h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  // Draw one frame. view: { flight, ringsHit, time, mode: 'chase'|'cockpit'|'orbit', orbitAngle }
  function draw(view, dt) {
    const f = view.flight;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const proj = mat4Perspective((62 * Math.PI) / 180, aspect, 0.5, 12000);
    const fwd = forwardVector(f);
    const up = upVector(f);

    let eye;
    let target;
    if (view.mode === 'cockpit') {
      eye = [f.x + fwd[0] * 1.6 + up[0] * 1.0, f.y + fwd[1] * 1.6 + up[1] * 1.0, f.z + fwd[2] * 1.6 + up[2] * 1.0];
      target = [f.x + fwd[0] * 60, f.y + fwd[1] * 60, f.z + fwd[2] * 60];
    } else if (view.mode === 'orbit') {
      const a = view.orbitAngle;
      eye = [f.x + Math.sin(a) * 26, f.y + 9, f.z + Math.cos(a) * 26];
      target = [f.x, f.y + 1, f.z];
    } else {
      const dist = 15;
      const height = 5.2;
      const wantEye = [
        f.x - fwd[0] * dist + up[0] * height,
        f.y - fwd[1] * dist + up[1] * height,
        f.z - fwd[2] * dist + up[2] * height,
      ];
      const wantTarget = [f.x + fwd[0] * 26, f.y + fwd[1] * 26 + 1, f.z + fwd[2] * 26];
      const k = 1 - Math.exp(-dt * 5);
      for (let i = 0; i < 3; i++) {
        camPos[i] += (wantEye[i] - camPos[i]) * k;
        camTarget[i] += (wantTarget[i] - camTarget[i]) * k;
      }
      // Never let the camera sink into the hillside.
      const ground = terrainHeight(camPos[0], camPos[2]);
      if (camPos[1] < ground + 2.5) camPos[1] = ground + 2.5;
      eye = camPos;
      target = camTarget;
    }
    const viewMat = mat4LookAt(eye, target, [0, 1, 0]);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, viewMat);
    gl.uniform3fv(loc.uCamPos, eye);
    gl.uniform3fv(loc.uSunDir, SKY.sunDir);
    gl.uniform3fv(loc.uFogColor, SKY.fogColor);
    gl.uniform1f(loc.uFogNear, SKY.fogNear);
    gl.uniform1f(loc.uFogFar, SKY.fogFar);

    const ident = mat4Identity();
    // Sky dome first, depth off so it never hides the world.
    gl.disable(gl.DEPTH_TEST);
    drawMesh(meshes.sky, mat4Translate(eye[0], eye[1], eye[2]), { unlit: true });
    gl.enable(gl.DEPTH_TEST);

    // Sun sphere, far away in the sun's direction.
    const sunPos = [
      eye[0] + SKY.sunDir[0] * 4800,
      eye[1] + SKY.sunDir[1] * 4800,
      eye[2] + SKY.sunDir[2] * 4800,
    ];
    drawMesh(sunMesh, mat4Translate(...sunPos), { unlit: true });

    drawMesh(meshes.terrain, ident);
    drawMesh(meshes.trees, ident);
    drawMesh(meshes.runway, ident);
    drawMesh(meshes.water, ident, { alpha: 0.82 });

    // Rings: the next ring glows brighter than the rest.
    rings.forEach((ring, i) => {
      const isNext = f.ringsHit < 8 && i === f.nextRing;
      const done = i < f.ringsHit;
      const pulse = 0.45 + 0.3 * Math.sin(view.time * 3);
      drawMesh(ring.tube, ident, { emissive: isNext ? pulse + 0.35 : 0.15 });
      if (isNext) drawMesh(ring.disc, ident, { alpha: 0.14, unlit: true });
      if (done) drawMesh(ring.tube, ident, { emissive: 0, alpha: 0.35 });
    });

    // The plane itself, pitched and banked the way the flight model says.
    const planeModel = mat4Multiply(
      mat4Translate(f.x, f.y, f.z),
      mat4Multiply(mat4RotateY(f.heading), mat4Multiply(mat4RotateX(f.pitch), mat4RotateZ(-f.roll))),
    );
    drawMesh(meshes.plane, planeModel);
    drawMesh(meshes.nav, planeModel, { emissive: 1.2 });
    propAngle += dt * (4 + f.throttle * 42);
    const propModel = mat4Multiply(
      planeModel,
      mat4Multiply(mat4Translate(0, -0.05, -4.75), mat4RotateZ(propAngle)),
    );
    drawMesh(meshes.prop, propModel);

    // Ground shadow under the plane, fading with height.
    const ground = terrainHeight(f.x, f.z);
    const agl = Math.max(0, f.y - ground);
    const shadowAlpha = Math.max(0, 0.34 - agl * 0.0011);
    if (shadowAlpha > 0.02 && !f.onGround) {
      const s = 1 + agl * 0.004;
      drawMesh(
        meshes.shadow,
        mat4Multiply(mat4Translate(f.x, ground + 0.4, f.z), mat4Scale(s, 1, s)),
        { alpha: shadowAlpha, unlit: true },
      );
    }

    // Clouds drift slowly eastward.
    for (const c of clouds) {
      const cx = c.x + view.time * c.drift;
      drawMesh(
        c.mesh,
        mat4Translate(((cx + 3000) % 6000) - 3000, c.y, c.z),
        { unlit: true, alpha: 0.85 },
      );
    }
  }

  // Snap the chase/orbit camera to its target at once — screenshots stage a
  // frozen scene, so the camera must not need seconds to settle.
  function snapCamera(f, mode, orbitAngle) {
    const fwd = forwardVector(f);
    const up = upVector(f);
    if (mode === 'cockpit') {
      camPos = [f.x + fwd[0] * 1.6 + up[0] * 1.0, f.y + fwd[1] * 1.6 + up[1] * 1.0, f.z + fwd[2] * 1.6 + up[2] * 1.0];
      camTarget = [f.x + fwd[0] * 60, f.y + fwd[1] * 60, f.z + fwd[2] * 60];
    } else if (mode === 'orbit') {
      camPos = [f.x + Math.sin(orbitAngle) * 26, f.y + 9, f.z + Math.cos(orbitAngle) * 26];
      camTarget = [f.x, f.y + 1, f.z];
    } else {
      camPos = [
        f.x - fwd[0] * 15 + up[0] * 5.2,
        f.y - fwd[1] * 15 + up[1] * 5.2,
        f.z - fwd[2] * 15 + up[2] * 5.2,
      ];
      camTarget = [f.x + fwd[0] * 26, f.y + fwd[1] * 26 + 1, f.z + fwd[2] * 26];
    }
  }

  return { resize, draw, snapCamera, gl };
}
