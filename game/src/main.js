// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens — title, play, paused, game over — with sound, localStorage bests
// and a live region for screen readers.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|late|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, GAME, RESCUED_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  EVENT_CELL,
  EVENT_COMBO,
  EVENT_HIT,
  EVENT_OVER,
  EVENT_POD,
  EVENT_REPAIR,
  EVENT_TIMEUP,
  createWorld,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Announce the last-seconds warning once per run. */
const TIME_WARN_AT = 10;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, createRandom(seed ^ 0x9e3779b9));
const audio = createAudio();

function readBest(key) {
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be off (private windows): bests then last this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.meta);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest(BEST_KEY);
  let bestRescued = readBest(RESCUED_KEY);
  let isNewBest = false;
  let endReason = 'time';
  let warned = false;
  let lastWholeSecond = -1;
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear screen changes and key events.
  function announce(message) {
    status.textContent = message;
  }

  function meta() {
    return { best, bestRescued, isNewBest, muted, endReason };
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    isNewBest = false;
    endReason = 'time';
    warned = false;
    lastWholeSecond = -1;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.engineStart();
    audio.engineLevel(1);
    audio.start();
    announce(`Shift started. ${GAME.duration} seconds. Rescue as many pods as you can.`);
  }

  function endGame(reason) {
    screen = SCREEN_OVER;
    endReason = reason;
    audio.engineStop();
    const finalScore = Math.floor(world.state.score);
    if (finalScore > best) {
      best = finalScore;
      isNewBest = true;
      saveBest(BEST_KEY, best);
    }
    if (world.state.rescued > bestRescued) {
      bestRescued = world.state.rescued;
      saveBest(RESCUED_KEY, bestRescued);
    }
    if (reason === 'hull') audio.over();
    else audio.timeUp();
    announce(`${reason === 'hull' ? 'Bike down' : 'Time up'}. Score ${finalScore}. Rescued ${world.state.rescued}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.engineStop();
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      audio.engineStart();
      announce('Playing.');
    }
  }

  function control() {
    const pointer = input.pointerTarget();
    return { steer: input.steer(), alt: input.altitude(), targetX: pointer.targetX, targetAlt: pointer.targetAlt };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the highway scrolls by with nothing to hit.
      world.step(STEP, { steer: Math.sin(world.state.elapsed * 0.7) * 0.5, alt: 0, targetX: null, targetAlt: null }, true);
      return;
    }
    const events = world.step(STEP, control(), false);
    if (events & EVENT_HIT) {
      audio.hit();
      renderer.burst('hit');
      announce(world.state.hull > 34 ? 'Hit. Hull damaged. Combo lost.' : 'Critical hull damage.');
    }
    if (events & EVENT_CELL) {
      audio.pickup();
      if (events & EVENT_COMBO) {
        audio.comboUp(Math.min(8, 1 + Math.floor(world.state.combo / 4)));
        announce(`Combo raised. Multiplier x${Math.min(8, 1 + Math.floor(world.state.combo / 4))}.`);
      }
    }
    if (events & EVENT_POD) {
      audio.pod();
      renderer.burst('pod');
      announce(`Pod rescued. ${world.state.rescued} total.`);
    }
    if (events & EVENT_REPAIR) {
      audio.repair();
      announce('Hull repaired.');
    }
    if (events & EVENT_OVER) endGame('hull');
    else if (events & EVENT_TIMEUP) endGame('time');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
        // The ten-second warning fires once per run.
        const whole = Math.ceil(world.state.timeLeft);
        if (!warned && screen === SCREEN_PLAY && whole <= TIME_WARN_AT && whole > 0 && whole !== lastWholeSecond) {
          audio.timeWarn();
          if (whole === TIME_WARN_AT) {
            announce('Ten seconds left.');
            warned = true;
          }
        }
        lastWholeSecond = whole;
      }
      if (screen === SCREEN_PLAY) audio.engineLevel(world.state.level);
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, meta());
  }

  // Leaving the tab pauses a running game rather than letting the bike fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      audio.engineStop();
      announce('Paused.');
    }
  });

  announce('Neon Skyline Rescue Run. Press Space or tap to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
