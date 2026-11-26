// Ridgeline Run — the flight model and the mission.
// One clear job: take pilot input and turn it into a plane that flies, stalls,
// lands, crashes, and scores rings — arcade-simple, but with real consequences.

import { AIRFIELD, FLIGHT, RINGS, RUNWAY, WATER_LEVEL } from './config.js';
import { landableGround, overRunway, terrainHeight } from './world.js';

const DEG = Math.PI / 180;

// The runway slab sits 0.8 m proud of the flattened airfield (see world.js);
// the plane rests with its wheels on it, not sunk into it.
export const RUNWAY_SURFACE_Y = AIRFIELD.height + 0.8 + 1.35;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// A fresh sortie: parked on the runway, engine idling, full tank.
export function newFlightState() {
  return {
    x: RUNWAY.x,
    y: RUNWAY_SURFACE_Y,
    z: RUNWAY.zEnd - 60,
    heading: 0, // radians, 0 = north (-z)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: FLIGHT.fuelMax,
    ringsHit: 0,
    nextRing: 0,
    score: 0,
    elapsed: 0,
    landed: false,
    crashed: false,
    crashReason: '',
    verticalSpeed: 0,
    onGround: true,
    message: '',
    messageUntil: 0,
  };
}

export function forwardVector(f) {
  const ch = Math.cos(f.heading);
  const sh = Math.sin(f.heading);
  const cp = Math.cos(f.pitch);
  return [-sh * cp, Math.sin(f.pitch), -ch * cp];
}

export function upVector(f) {
  const ch = Math.cos(f.heading);
  const sh = Math.sin(f.heading);
  const sr = Math.sin(f.roll);
  const cr = Math.cos(f.roll);
  const sp = Math.sin(f.pitch);
  const cp = Math.cos(f.pitch);
  return [sh * sp * cr + ch * sr, cp * cr, ch * sp * cr - sh * sr];
}

// One physics step. input: { pitch, roll, throttle, brake } each -1..1 (throttle 0..1).
// Returns an event string ('ring', 'landed', 'crashed', 'fuel-low', '') when
// something worth telling the pilot happened.
export function stepFlight(f, input, dt) {
  if (f.crashed || f.landed) return '';
  f.elapsed += dt;

  // Throttle: the lever moves toward the target, the engine spools up slowly.
  f.throttle = clamp(f.throttle + (input.throttle - f.throttle) * Math.min(1, dt * 1.6), 0, 1);

  // Speed chases the throttle's target speed, with drag pulling it back.
  const targetSpeed = f.throttle * FLIGHT.maxSpeed;
  const accel = f.onGround ? 14 : 9;
  f.speed += clamp(targetSpeed - f.speed, -accel * dt * 1.4, accel * dt);
  if (input.brake) f.speed = Math.max(0, f.speed - 26 * dt);

  // Bank and pitch ease toward the stick, then the nose follows the bank.
  const targetRoll = input.roll * FLIGHT.maxBankDeg * DEG;
  const targetPitch = input.pitch * FLIGHT.maxPitchDeg * DEG;
  const rollAuthority = f.speed > FLIGHT.stallSpeed ? 1 : 0.45;
  f.roll += clamp(targetRoll - f.roll, -FLIGHT.rollRate * rollAuthority * dt, FLIGHT.rollRate * rollAuthority * dt);
  f.pitch += clamp(targetPitch - f.pitch, -FLIGHT.pitchRate * rollAuthority * dt, FLIGHT.pitchRate * rollAuthority * dt);
  f.heading = wrapAngle(f.heading - Math.sin(f.roll) * FLIGHT.turnAuthority * (f.speed / FLIGHT.maxSpeed) * dt);

  // Climb and sink: the wing lifts with speed; below stall speed it gives up
  // and the nose drops.
  const stalled = f.speed < FLIGHT.stallSpeed && !f.onGround;
  let vy = Math.sin(f.pitch) * f.speed * FLIGHT.climbFactor;
  if (stalled) {
    vy -= (FLIGHT.stallSpeed - f.speed) * 0.55;
    f.pitch += (-0.22 - f.pitch) * dt * 0.8;
  }
  if (f.onGround) {
    vy = 0;
    f.pitch = 0;
    f.roll *= 1 - Math.min(1, dt * 4);
  }

  const fwd = forwardVector(f);
  const prevY = f.y;
  f.x += fwd[0] * f.speed * dt;
  f.y += vy * dt;
  f.z += fwd[2] * f.speed * dt;
  f.verticalSpeed = (f.y - prevY) / Math.max(dt, 1e-6);

  // Takeoff roll: fast enough and pulling up lifts off the runway.
  if (f.onGround && f.speed > 34 && input.pitch > 0.15) {
    f.onGround = false;
    f.y += 0.6;
  }

  // Fuel: the tank drains with the throttle open; empty means a dead stick.
  f.fuel -= FLIGHT.fuelDrainPerSec * (0.35 + f.throttle) * dt;
  if (f.fuel <= 0) {
    f.fuel = 0;
    f.throttle = 0;
  }

  // Ring check: crossing the ring's plane inside its radius scores it.
  const ring = RINGS[f.nextRing];
  if (ring) {
    const dx = f.x - ring.x;
    const dy = f.y - ring.y;
    const dz = f.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ring.r) {
      f.ringsHit += 1;
      f.nextRing = (f.nextRing + 1) % RINGS.length;
      const timeBonus = Math.max(0, 120 - Math.floor(f.elapsed)) * FLIGHT.timeBonusPerSec;
      f.score += FLIGHT.ringScore + timeBonus;
      f.fuel = Math.min(FLIGHT.fuelMax, f.fuel + FLIGHT.ringFuelBonus);
      f.message = `RING ${f.ringsHit} / ${RINGS.length}  +${FLIGHT.ringScore + timeBonus}`;
      f.messageUntil = f.elapsed + 2.5;
      return 'ring';
    }
  }

  // Ground and water contact.
  const ground = terrainHeight(f.x, f.z);
  const agl = f.y - ground;
  const inWater = ground < WATER_LEVEL && f.y <= WATER_LEVEL + 0.6;
  if (inWater) {
    return crashFlight(f, 'Ditched in the lake');
  }
  if (agl <= 0.4) {
    const gentle = Math.abs(f.verticalSpeed) < 6 && Math.abs(f.roll) < 0.35 && f.speed < 62;
    if (landableGround(f.x, f.z) && gentle) {
      return landFlight(f);
    }
    if (landableGround(f.x, f.z) && f.speed < 20 && Math.abs(f.verticalSpeed) < 2) {
      return landFlight(f);
    }
    return crashFlight(f, agl <= 0.4 && f.speed > 60 ? 'Flew into the ridge' : 'Hard impact');
  }
  if (f.fuel <= 0 && f.elapsed > 5) {
    f.message = 'FUEL EMPTY — find the runway';
    f.messageUntil = f.elapsed + 2;
  }
  return '';
}

function landFlight(f) {
  f.onGround = true;
  f.y = overRunway(f.x, f.z) ? RUNWAY_SURFACE_Y : terrainHeight(f.x, f.z) + 1.5;
  f.speed = Math.max(0, f.speed - 12);
  f.pitch = 0;
  if (f.ringsHit >= RINGS.length) {
    f.landed = true;
    const bonus = FLIGHT.landingScore + Math.max(0, 240 - Math.floor(f.elapsed)) * 2;
    f.score += bonus;
    f.message = `SORTIE COMPLETE  +${bonus}`;
    f.messageUntil = f.elapsed + 6;
    return 'landed';
  }
  // Touch-and-go: refuel, keep flying.
  f.fuel = FLIGHT.fuelMax;
  f.message = 'TOUCH-AND-GO — tank refilled';
  f.messageUntil = f.elapsed + 2.5;
  return 'refuel';
}

function crashFlight(f, reason) {
  f.crashed = true;
  f.crashReason = reason;
  f.message = reason;
  f.messageUntil = f.elapsed + 6;
  return 'crashed';
}

// Height above the ground right now, for the HUD.
export function altitudeAgl(f) {
  return Math.max(0, f.y - terrainHeight(f.x, f.z));
}

// Knots and feet, the way a pilot reads them.
export function knots(f) {
  return Math.round(f.speed * 1.944);
}

export function feet(msl) {
  return Math.round(msl * 3.281);
}

export function headingDeg(f) {
  return ((Math.round((-f.heading / DEG) % 360) + 360) % 360);
}

// A gentle autopilot: hold level flight in a wide circle, for the title screen
// and for screenshots. It flies the plane, the pilot can take over any time.
export function autopilotInput(f, dt) {
  const targetAlt = 130;
  const altErr = targetAlt - f.y;
  const pitch = clamp(altErr * 0.012, -0.5, 0.5);
  const roll = 0.35; // steady bank, circling the valley
  return { pitch, roll, throttle: 0.62, brake: false };
}

export function resetFlight(f) {
  const fresh = newFlightState();
  Object.assign(f, fresh);
}
