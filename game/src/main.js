// Ridgeline Run — boot, game loop and state machine.
// One clear job: own the screens (title / flying / paused / landed / crashed),
// step the flight model, draw the frame, and stage deterministic scenes for
// screenshots (?shot=start|play|ring|land) and headless self-tests (?selftest=1).

import { GAME_TITLE, RINGS } from './config.js';
import { createRenderer } from './render.js';
import { createHud, showScreen, updateHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  RUNWAY_SURFACE_Y,
  altitudeAgl,
  autopilotInput,
  feet,
  headingDeg,
  knots,
  newFlightState,
  resetFlight,
  stepFlight,
} from './flight.js';
import { terrainHeight } from './noise.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';

const canvas = document.getElementById('game');
const hud = createHud();
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

let flight = newFlightState();
let mode = 'title'; // title | flying | paused | landed | crashed
let viewMode = 'chase'; // chase | cockpit
let orbitAngle = 0.6;
let time = 0;
let lastNow = performance.now();

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
  hud.compass.width = 420;
  hud.compass.height = 44;
  hud.speedTape.width = 90;
  hud.speedTape.height = 260;
  hud.altTape.width = 90;
  hud.altTape.height = 260;
  hud.horizon.width = 150;
  hud.horizon.height = 150;
}
window.addEventListener('resize', resize);
resize();

function headingToward(x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  return Math.atan2(-dx, -dz);
}

function stageShot() {
  if (!shot) return;
  if (shot === 'start') {
    mode = 'title';
    viewMode = 'orbit';
    showScreen(hud, 'title');
    return;
  }
  if (shot === 'play') {
    // Mid-sortie east of the runway centreline, ring one dead ahead, HUD lit.
    flight.x = 80;
    flight.y = 135;
    flight.z = 420;
    flight.heading = headingToward(80, 420, RINGS[0].x, RINGS[0].z);
    flight.pitch = 0.02;
    flight.roll = -0.08;
    flight.speed = 62;
    flight.throttle = 0.62;
    flight.fuel = 78;
    flight.ringsHit = 2;
    flight.nextRing = 2;
    flight.score = 1240;
    flight.elapsed = 47;
    flight.onGround = false;
    input.setThrottle(0.62);
    mode = 'flying';
    viewMode = 'chase';
    showScreen(hud, null);
    return;
  }
  if (shot === 'ring') {
    // Seconds from the lake ring, low over the water, ring filling the view.
    flight.x = 1290;
    flight.y = 92;
    flight.z = -760;
    flight.heading = headingToward(1290, -760, RINGS[2].x, RINGS[2].z);
    flight.pitch = 0.01;
    flight.roll = 0.12;
    flight.speed = 71;
    flight.throttle = 0.74;
    flight.fuel = 64;
    flight.ringsHit = 2;
    flight.nextRing = 2;
    flight.score = 1180;
    flight.elapsed = 83;
    flight.onGround = false;
    input.setThrottle(0.74);
    mode = 'flying';
    viewMode = 'chase';
    showScreen(hud, null);
    return;
  }
  if (shot === 'land') {
    // Sortie complete: parked on the runway, results panel up.
    flight.x = 0;
    flight.y = RUNWAY_SURFACE_Y;
    flight.z = 120;
    flight.heading = 0;
    flight.speed = 0;
    flight.throttle = 0;
    flight.fuel = 41;
    flight.ringsHit = 8;
    flight.nextRing = 0;
    flight.score = 6840;
    flight.elapsed = 198;
    flight.onGround = true;
    flight.landed = true;
    mode = 'landed';
    viewMode = 'orbit';
    showScreen(hud, 'end', {
      win: true,
      title: 'SORTIE COMPLETE',
      body:
        'All 8 rings flown · landed on runway 27<br>' +
        'Time 03:18 · Score <b>6,840</b><br>' +
        '<span class="dim">Press R to fly again</span>',
    });
  }
}

function startFlying() {
  resetFlight(flight);
  mode = 'flying';
  viewMode = 'chase';
  input.setThrottle(0.55);
  audio.resume();
  audio.click();
  showScreen(hud, null);
}

function endFlight(win, title, body) {
  mode = win ? 'landed' : 'crashed';
  showScreen(hud, 'end', { win, title, body });
}

function handleEvent(ev) {
  if (ev === 'ring') {
    audio.ring();
  } else if (ev === 'refuel') {
    audio.click();
  } else if (ev === 'landed') {
    audio.land();
    endFlight(
      true,
      'SORTIE COMPLETE',
      `All ${RINGS.length} rings flown · landed on the runway<br>` +
        `Time ${formatClock(flight.elapsed)} · Score <b>${flight.score}</b><br>` +
        '<span class="dim">Press R to fly again</span>',
    );
  } else if (ev === 'crashed') {
    audio.crash();
    endFlight(
      false,
      'CRASHED — ' + flight.crashReason.toUpperCase(),
      `Rings ${flight.ringsHit} / ${RINGS.length} · Score <b>${flight.score}</b><br>` +
        '<span class="dim">Press R to fly again</span>',
    );
  }
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function handleKeys() {
  for (const key of input.takePressed()) {
    if (key === 'enter' || key === ' ') {
      if (mode === 'title' || mode === 'landed' || mode === 'crashed') startFlying();
    }
    if (key === 'r' && mode !== 'title') startFlying();
    if ((key === 'p' || key === 'escape') && (mode === 'flying' || mode === 'paused')) {
      mode = mode === 'flying' ? 'paused' : 'flying';
      showScreen(hud, mode === 'paused' ? 'pause' : null);
      audio.click();
    }
    if (key === 'c' && mode === 'flying') {
      viewMode = viewMode === 'chase' ? 'cockpit' : 'chase';
    }
    if (key === 'm') {
      const muted = audio.toggleMute();
      flight.message = muted ? 'SOUND OFF' : 'SOUND ON';
      flight.messageUntil = flight.elapsed + 1.5;
    }
  }
}

function frame(now) {
  const rawDt = Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000));
  lastNow = now;
  time += rawDt;

  handleKeys();
  if (mode === 'title' && input.anyKey()) {
    startFlying();
  }

  // Shot modes stage a frozen scene: no physics, no autopilot, the camera
  // snapped to its target — the screenshot is the staged state, exactly.
  const frozen = shot !== null && shot !== undefined && shot !== '';
  if (frozen) {
    renderer.snapCamera(flight, mode === 'title' || mode === 'landed' ? 'orbit' : viewMode, orbitAngle);
  }

  // Physics in fixed 60 Hz substeps so the feel is the same at any frame rate.
  const steps = Math.max(1, Math.ceil(rawDt / (1 / 60)));
  const dt = rawDt / steps;
  for (let i = 0; i < steps && !frozen; i++) {
    if (mode === 'title') {
      const ap = autopilotInput(flight, dt);
      const ev = stepFlight(flight, ap, dt);
      if (ev === 'crashed' || ev === 'landed') resetFlight(flight);
      if (ev === 'ring') {
        flight.ringsHit = 0;
        flight.nextRing = 0;
      }
    } else if (mode === 'flying') {
      const ev = stepFlight(flight, input.read(), dt);
      if (ev) handleEvent(ev);
    }
  }
  if (mode === 'title') orbitAngle += rawDt * 0.12;

  audio.update(flight.throttle, flight.speed, mode === 'flying');
  updateHud(hud, flight, mode, time);
  renderer.draw(
    {
      flight,
      time,
      mode: mode === 'title' || mode === 'landed' ? 'orbit' : viewMode,
      orbitAngle,
    },
    rawDt,
  );
  requestAnimationFrame(frame);
}

// Headless self-test: fly the autopilot for 15 simulated seconds and report
// whether the plane stayed airborne, above the terrain, and found a ring.
// The result lands in #selftest and in the document title for the test runner.
function runSelfTest() {
  const f = newFlightState();
  let minAgl = Infinity;
  let maxAgl = 0;
  let rings = 0;
  let crashed = false;
  let steps = 0;
  f.throttle = 0.62;
  for (let i = 0; i < 900; i++) {
    const ev = stepFlight(f, autopilotInput(f, 1 / 60), 1 / 60);
    if (ev === 'ring') rings++;
    if (ev === 'crashed') {
      crashed = true;
      break;
    }
    const agl = altitudeAgl(f);
    if (agl < minAgl) minAgl = agl;
    if (agl > maxAgl) maxAgl = agl;
    steps++;
  }
  const result = {
    steps,
    crashed,
    rings,
    minAgl: Math.round(minAgl * 10) / 10,
    maxAgl: Math.round(maxAgl),
    speed: Math.round(f.speed),
    pos: [Math.round(f.x), Math.round(f.y), Math.round(f.z)],
    headingDeg: headingDeg(f),
    knots: knots(f),
    feetAgl: feet(altitudeAgl(f)),
  };
  const text = 'SELFTEST ' + JSON.stringify(result);
  hud.selftest.textContent = text;
  document.title = text;
  // Also draw one frame so a screenshot shows the staged scene.
  updateHud(hud, f, 'flying', 0);
  renderer.draw({ flight: f, time: 0, mode: 'chase', orbitAngle: 0 }, 0.016);
}

stageShot();
if (selftest) {
  resize();
  runSelfTest();
} else {
  if (!shot) showScreen(hud, 'title'); // shot modes stage their own screen
  requestAnimationFrame(frame);
}

// Debug handle: the play-tester can read the live state from the console.
window.__game = { flight, get mode() { return mode; }, terrainHeight };
