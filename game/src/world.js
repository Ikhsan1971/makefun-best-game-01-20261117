// The game's rules and state, with no drawing and no browser in it: the hover-bike, the pool of
// hazards and pickups ahead on the road, spawning, collisions, score/combo, hull and the 90-second
// clock. step() advances one fixed step and returns what happened as bit flags, so the caller can
// react without the world knowing about screens or sound. Nothing here allocates after createWorld
// returns.
import { GAME, PLAYER, POOL_SIZE, SPAWN } from './config.js';

export const KIND_BARRIER = 0;   // ground hazard, wide — swerve or go over it
export const KIND_DRONE = 1;     // high hazard — drop low to slip under
export const KIND_MINE = 2;      // ground hazard, narrow — thread between them
export const KIND_CELL = 3;      // energy cell (either altitude): score + combo
export const KIND_POD = 4;       // rescue pod on the road surface: big score, count rescued
export const KIND_REPAIR = 5;    // hull repair pickup (either altitude)

export const EVENT_HIT = 1;
export const EVENT_CELL = 2;
export const EVENT_POD = 4;
export const EVENT_REPAIR = 8;
export const EVENT_OVER = 16;    // hull destroyed
export const EVENT_TIMEUP = 32;  // the 90 seconds ran out
export const EVENT_COMBO = 64;   // combo tier went up

/** Width of an entity in road-relative units. */
const WIDTH = { [KIND_BARRIER]: 0.34, [KIND_DRONE]: 0.3, [KIND_MINE]: 0.2, [KIND_CELL]: 0.16, [KIND_POD]: 0.26, [KIND_REPAIR]: 0.18 };
/** The altitude an entity spawns at, or -1 for random. */
const ALT = { [KIND_BARRIER]: 0, [KIND_DRONE]: 1, [KIND_MINE]: 0, [KIND_CELL]: -1, [KIND_POD]: 0, [KIND_REPAIR]: -1 };
const HIT_Z = 42;                // collision window, metres ahead of the camera plane
const ALT_BAND = 0.45;           // pickups collect when this close in altitude
const HELI_BAND = 0.5;           // hazards hit when this close in altitude

export function createWorld(random) {
  const player = { x: 0, alt: 0.35, hull: PLAYER.hull, invulnerable: 0 };
  const items = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    items.push({ active: false, kind: KIND_CELL, x: 0, alt: 0, z: 0, wobble: 0 });
  }
  const state = {
    player, items,
    score: 0, combo: 0, bestCombo: 0, rescued: 0,
    hull: PLAYER.hull, level: 1, elapsed: 0, timeLeft: GAME.duration, distance: 0,
    speed: GAME.baseSpeed, curve: 0,
    hazardTimer: 1.2, cellTimer: 0.6, podTimer: 2.5, repairTimer: SPAWN.repairInterval,
    flash: 0,           // red flash timer after a hit (renderer reads this)
    podFlash: 0,        // golden pulse after a rescue
  };

  function reset() {
    player.x = 0;
    player.alt = 0.35;
    player.hull = PLAYER.hull;
    player.invulnerable = 0;
    for (const item of items) item.active = false;
    state.score = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.rescued = 0;
    state.hull = PLAYER.hull;
    state.level = 1;
    state.elapsed = 0;
    state.timeLeft = GAME.duration;
    state.distance = 0;
    state.speed = GAME.baseSpeed;
    state.curve = 0;
    state.hazardTimer = 1.2;
    state.cellTimer = 0.6;
    state.podTimer = 2.5;
    state.repairTimer = SPAWN.repairInterval;
    state.flash = 0;
    state.podFlash = 0;
  }

  function freeItem() {
    for (let index = 0; index < items.length; index += 1) if (!items[index].active) return items[index];
    return null;
  }

  function spawn(kind) {
    const item = freeItem();
    if (item === null) return;
    item.active = true;
    item.kind = kind;
    item.x = (random() * 2 - 1) * 0.72;
    item.alt = ALT[kind] === -1 ? (random() < 0.5 ? 0 : 1) : ALT[kind];
    item.z = SPAWN.zMax;
    item.wobble = random() * Math.PI * 2;
  }

  function spawnHazard() {
    const roll = random();
    if (roll < 0.42) spawn(KIND_BARRIER);
    else if (roll < 0.72) spawn(KIND_DRONE);
    else spawn(KIND_MINE);
  }

  function hazardInterval() {
    return Math.max(SPAWN.minHazardInterval, SPAWN.hazardInterval * SPAWN.hazardScale ** (state.level - 1));
  }

  function comboMultiplier() {
    return Math.min(SPAWN.comboMax, 1 + Math.floor(state.combo / 4));
  }

  function addPickup(points) {
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const mult = comboMultiplier();
    state.score += points * mult;
    return mult;
  }

  /**
   * One fixed step. `control` is { steer: -1..1, alt: -1..1, targetX?: number|null, targetAlt?: number|null }.
   * With `harmless` set (the title backdrop) the world scrolls but nothing can hit or score.
   */
  function step(dt, control, harmless) {
    let events = 0;
    const steer = control.steer ?? 0;
    const altAxis = control.alt ?? 0;

    state.elapsed += dt;
    state.timeLeft = Math.max(0, GAME.duration - state.elapsed);
    state.level = Math.min(GAME.maxLevel, 1 + Math.floor(state.elapsed / GAME.levelEvery));
    state.speed = Math.min(GAME.maxSpeed, GAME.baseSpeed + GAME.speedPerLevel * (state.level - 1));
    state.distance += state.speed * dt;
    state.curve = Math.sin(state.distance * 0.0038) * 0.85 + Math.sin(state.distance * 0.0013 + 1.7) * 0.6;
    if (!harmless) state.score += state.speed * dt * SPAWN.distancePoints;

    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.podFlash > 0) state.podFlash = Math.max(0, state.podFlash - dt);

    // Steering: pointer/touch absolute targets take priority over digital steer.
    if (control.targetX != null) {
      const dx = control.targetX - player.x;
      const stepSize = PLAYER.steerSpeed * 1.5 * dt;
      player.x += Math.abs(dx) < stepSize ? dx : Math.sign(dx) * stepSize;
    } else {
      player.x += steer * PLAYER.steerSpeed * dt;
    }
    if (control.targetAlt != null) {
      const dy = control.targetAlt - player.alt;
      const stepSize = PLAYER.altSpeed * 1.5 * dt;
      player.alt += Math.abs(dy) < stepSize ? dy : Math.sign(dy) * stepSize;
    } else {
      player.alt += altAxis * PLAYER.altSpeed * dt;
    }
    player.x = Math.min(PLAYER.xMax, Math.max(PLAYER.xMin, player.x));
    player.alt = Math.min(PLAYER.altMax, Math.max(PLAYER.altMin, player.alt));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    state.hazardTimer -= dt;
    if (state.hazardTimer <= 0) {
      spawnHazard();
      state.hazardTimer += hazardInterval();
    }
    state.cellTimer -= dt;
    if (state.cellTimer <= 0) {
      spawn(KIND_CELL);
      state.cellTimer += SPAWN.cellInterval + random() * 0.5;
    }
    state.podTimer -= dt;
    if (state.podTimer <= 0) {
      spawn(KIND_POD);
      state.podTimer += SPAWN.podInterval + random() * 1.6;
    }
    state.repairTimer -= dt;
    if (state.repairTimer <= 0) {
      spawn(KIND_REPAIR);
      state.repairTimer += SPAWN.repairInterval + random() * 5;
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      item.z -= state.speed * dt;
      item.wobble += dt * 2.4;
      if (item.z < -30) {
        item.active = false;
        continue;
      }
      if (harmless || item.z > HIT_Z || item.z < -HIT_Z) continue;
      const dx = Math.abs(item.x - player.x);
      const halfWidth = (WIDTH[item.kind] + 0.16) / 2 + 0.06;
      if (dx > halfWidth) continue;
      const altGap = Math.abs(item.alt - player.alt);
      const isHazard = item.kind <= KIND_MINE;
      if (isHazard) {
        if (altGap > HELI_BAND) continue;
        if (player.invulnerable > 0) continue;
        item.active = false;
        state.hull = Math.max(0, state.hull - PLAYER.hitDamage);
        state.flash = 0.45;
        state.combo = 0;
        player.invulnerable = PLAYER.invulnerable;
        events |= EVENT_HIT;
        if (state.hull === 0) {
          state.player.hull = 0;
          events |= EVENT_OVER;
          break;
        }
      } else {
        if (altGap > ALT_BAND) continue;
        item.active = false;
        if (item.kind === KIND_CELL) {
          const tierBefore = Math.floor(state.combo / 4);
          addPickup(SPAWN.cellPoints);
          if (Math.floor(state.combo / 4) > tierBefore) events |= EVENT_COMBO;
          events |= EVENT_CELL;
        } else if (item.kind === KIND_POD) {
          addPickup(SPAWN.podPoints);
          state.rescued += 1;
          state.podFlash = 0.6;
          events |= EVENT_POD;
        } else if (item.kind === KIND_REPAIR) {
          addPickup(SPAWN.repairPoints);
          state.hull = Math.min(PLAYER.hull, state.hull + 35);
          events |= EVENT_REPAIR;
        }
      }
    }

    if (!harmless && state.timeLeft === 0) events |= EVENT_TIMEUP;
    return events;
  }

  reset();
  return { state, reset, step, comboMultiplier };
}
