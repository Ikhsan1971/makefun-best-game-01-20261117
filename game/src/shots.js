// The screenshot scenes behind ?shot=start|play|late|end. Each one plays the real rules forward
// from a fresh world, steered by an autopilot that scores candidate moves by safety and reward,
// so the frame is what a short game really looks like, and the same seed always gives the frame.
import { GAME, STEP } from './config.js';
import {
  EVENT_OVER,
  EVENT_TIMEUP,
  KIND_BARRIER,
  KIND_CELL,
  KIND_DRONE,
  KIND_MINE,
  KIND_POD,
} from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 30;
const LATE_SECONDS = 66;
const CANDIDATE_X = [-0.85, -0.55, -0.28, 0, 0.28, 0.55, 0.85];
const CANDIDATE_ALT = [0, 1];

/** Smooth danger of sitting at (x, alt) once the hazards currently on the road arrive. */
function dangerAt(state, x, alt) {
  let danger = 0;
  for (const item of state.items) {
    if (!item.active || item.kind > KIND_MINE) continue;
    const secondsOut = item.z / Math.max(1, state.speed);
    if (secondsOut < 0 || secondsOut > 1.7) continue;
    const width = item.kind === KIND_BARRIER ? 0.36 : item.kind === KIND_DRONE ? 0.3 : 0.2;
    if (Math.abs(item.alt - alt) > 0.5) continue;
    const overlap = 1 - Math.abs(item.x - x) / (width / 2 + 0.24);
    if (overlap > 0) {
      const urgency = 1 / (0.28 + secondsOut);
      danger += overlap * urgency * urgency;
    }
  }
  return danger;
}

/** Appeal of sitting at (x, alt): rescue pods beat cells, nearer is better. */
function rewardAt(state, x, alt) {
  let reward = 0;
  for (const item of state.items) {
    if (!item.active) continue;
    if (item.kind !== KIND_CELL && item.kind !== KIND_POD) continue;
    const dx = Math.abs(item.x - x);
    const altGap = Math.abs(item.alt - alt);
    if (altGap > 0.5) continue;
    const secondsOut = Math.max(0.1, item.z / Math.max(1, state.speed));
    const base = item.kind === KIND_POD ? 6 : 1.6;
    reward += (base * Math.max(0, 1 - dx / 0.55)) / (0.4 + secondsOut);
  }
  return reward;
}

/** Pick this step's control: the safest cell on the grid, richest loot as tiebreak. */
function autopilot(state, greed) {
  const player = state.player;
  let bestX = player.x;
  let bestAlt = player.alt;
  let bestScore = -Infinity;
  for (const x of CANDIDATE_X) {
    for (const alt of CANDIDATE_ALT) {
      let score = rewardAt(state, x, alt) * greed - dangerAt(state, x, alt) * 5.2;
      // Prefer small moves so the bike does not weave needlessly.
      score -= Math.abs(x - player.x) * 0.22 + Math.abs(alt - player.alt) * 0.18;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestAlt = alt;
      }
    }
  }
  const dx = bestX - player.x;
  const dy = bestAlt - player.alt;
  return {
    steer: Math.abs(dx) < 0.07 ? 0 : Math.sign(dx),
    alt: Math.abs(dy) < 0.12 ? 0 : Math.sign(dy),
    targetX: null,
    targetAlt: null,
  };
}

/**
 * Set `world` to the named scene and return the screen to draw over it plus the meta object the
 * renderer wants. Names: start (title), play (mid-run), late (deep in the run, faster), end
 * (simulated until the run resolves). Unknown names fall back to start.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play' || name === 'late' || name === 'end') {
    const horizonSeconds = name === 'end' ? GAME.duration + 5 : name === 'late' ? LATE_SECONDS : PLAY_SECONDS;
    const greed = name === 'end' ? 0.55 : 0.85;
    let events = 0;
    for (let index = 0; index < (horizonSeconds / STEP); index += 1) {
      events = world.step(STEP, autopilot(world.state, greed), false);
      if (events & (EVENT_OVER | EVENT_TIMEUP)) break;
    }
    const over = world.state.hull === 0 || world.state.timeLeft === 0;
    return {
      screen: over ? SCREEN_OVER : SCREEN_PLAY,
      meta: {
        best: Math.floor(world.state.score),
        bestRescued: world.state.rescued,
        // The staged frame demonstrates the NEW BEST state, as a returning-record run looks.
        isNewBest: over,
        muted: false,
        endReason: world.state.hull === 0 ? 'hull' : 'time',
      },
    };
  }
  // Title: the city scrolls by with no danger, as an attract mode.
  for (let index = 0; index < START_SECONDS / STEP; index += 1) {
    world.step(STEP, { steer: Math.sin(index * 0.008) * 0.6, alt: 0, targetX: null, targetAlt: null }, true);
  }
  return {
    screen: SCREEN_TITLE,
    meta: { best: 0, bestRescued: 0, isNewBest: false, muted: false, endReason: 'time' },
  };
}
