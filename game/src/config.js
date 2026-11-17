// Neon Skyline: Rescue Run — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, horizonY: 300, roadBottomY: 720 };

/** Where the bike is drawn, and how far it slides/lifts per road-unit/altitude-unit. */
export const BIKE = { baseY: 636, altPx: 148, spread: 572 };

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;

export const GAME = {
  duration: 90,          // seconds on the clock
  baseSpeed: 140,        // metres per second at level 1
  speedPerLevel: 26,
  maxSpeed: 320,
  levelEvery: 15,        // seconds per difficulty level
  maxLevel: 6,
};

export const PLAYER = {
  /** Lateral position in road-relative units: -1 is the left edge, +1 the right edge. */
  xMin: -1.05,
  xMax: 1.05,
  steerSpeed: 1.9,       // road-units per second
  altMin: 0,
  altMax: 1,
  altSpeed: 1.6,         // altitude units per second
  hull: 100,
  hitDamage: 30,
  invulnerable: 1.6,     // seconds of blink after a hit
};

export const SPAWN = {
  hazardInterval: 1.05,  // seconds between hazard spawns at level 1
  hazardScale: 0.86,     // multiplied per level
  minHazardInterval: 0.34,
  cellInterval: 0.9,     // energy cells
  podInterval: 4.2,      // rescue pods
  repairInterval: 11,    // hull repair pickups
  zMax: 900,             // spawn distance ahead (metres)
  cellPoints: 50,
  podPoints: 400,
  repairPoints: 150,
  distancePoints: 1,     // per metre travelled
  comboMax: 8,
};

/** How many world entities can exist at once; the pool is allocated once at boot. */
export const POOL_SIZE = 96;

export const PALETTE = {
  backdrop: '#05060f',
  skyTop: '#0b0620',
  skyMid: '#241040',
  skyLow: '#4b1a5e',
  sunCore: '#ffd76a',
  sunMid: '#ff7a3c',
  sunEdge: '#ff3d7f',
  roadNear: '#1a1030',
  roadFar: '#241640',
  roadEdge: '#00e5ff',
  lane: '#ff3df0',
  buildingFar: '#191030',
  buildingNear: '#241640',
  windowLit: '#ffd76a',
  windowCool: '#59f2ff',
  player: '#37f5ff',
  playerHot: '#ff9dff',
  hazardBarrier: '#ff3d5e',
  hazardDrone: '#ffb03a',
  hazardMine: '#ff3df0',
  cell: '#4dff9d',
  pod: '#ffe14d',
  repair: '#ff6ad5',
  text: '#f2f6ff',
  muted: '#8f9ac4',
  panel: 'rgba(10, 8, 32, 0.94)',
  good: '#4dff9d',
  warn: '#ffb03a',
  bad: '#ff3d5e',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'neon-skyline-rescue.best';
export const RESCUED_KEY = 'neon-skyline-rescue.rescued';
