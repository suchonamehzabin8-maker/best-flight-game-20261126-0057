// Ridgeline Run — shared tuning constants.
// One clear job: every number the flight model, the world and the HUD agree on.

export const GAME_TITLE = 'Ridgeline Run';
export const GAME_TAGLINE = 'A bush-plane ring run over a mountain lake valley';

// World dimensions (metres). x east, z south, y up. Terrain spans -3000..3000.
export const WORLD_HALF = 3000;
export const WATER_LEVEL = 0;

// Airfield: flattened plateau around the runway.
export const AIRFIELD = { x: 0, z: 150, radius: 520, height: 8 };
export const RUNWAY = {
  x: 0,
  zStart: -220,
  zEnd: 520,
  width: 36,
  headingDeg: 0, // runway runs north-south
};

// The lake east of the airfield.
export const LAKE = { x: 1450, z: 550, radius: 720, depth: 9 };

// Flight model.
export const FLIGHT = {
  maxSpeed: 96, // m/s, about 187 kt at full throttle
  cruiseSpeed: 62,
  stallSpeed: 30, // below this the wing stops flying
  maxBankDeg: 62,
  maxPitchDeg: 32,
  pitchRate: 0.85, // rad/s at full deflection
  rollRate: 1.9, // rad/s at full deflection
  turnAuthority: 1.05, // how much bank turns the nose
  climbFactor: 0.92,
  gravity: 9.81,
  fuelMax: 100,
  fuelDrainPerSec: 0.5, // at cruise; rings and landings top it up
  ringFuelBonus: 14,
  ringScore: 500,
  landingScore: 1000,
  timeBonusPerSec: 4,
};

// The ring circuit: a tour of the valley, the lake and the mountain pass.
export const RINGS = [
  { x: 0, y: 70, z: -650, r: 30 },
  { x: 760, y: 95, z: -1250, r: 30 },
  { x: 1560, y: 80, z: -450, r: 30 },
  { x: 1650, y: 130, z: 700, r: 30 },
  { x: 950, y: 165, z: 1550, r: 30 },
  { x: -650, y: 195, z: 1450, r: 30 },
  { x: -1450, y: 150, z: 350, r: 30 },
  { x: -850, y: 90, z: -550, r: 30 },
];

// Sky, sun and fog.
export const SKY = {
  zenith: [0.16, 0.38, 0.72],
  horizon: [0.72, 0.85, 0.95],
  sunDir: [0.55, 0.42, -0.55],
  fogColor: [0.74, 0.84, 0.93],
  fogNear: 1400,
  fogFar: 6500,
};

// Clouds drift slowly across the valley.
export const CLOUDS = [
  { x: -900, y: 420, z: -800, s: 340 },
  { x: 400, y: 470, z: -1600, s: 420 },
  { x: 1700, y: 430, z: 300, s: 380 },
  { x: -1800, y: 500, z: 900, s: 460 },
  { x: 200, y: 440, z: 1900, s: 360 },
  { x: -300, y: 480, z: 300, s: 300 },
];
