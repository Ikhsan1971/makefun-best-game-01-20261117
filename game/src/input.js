// Keyboard and pointer/touch input. Held keys give steering and hover axes; one-shot presses
// (launch/restart, pause, mute) are queued as bit flags and taken once by the loop. Dragging on
// the canvas with mouse or finger sets an absolute position target: horizontal for the bike's
// lateral position on the road, vertical for its hover height. A tap (pointerdown) also confirms,
// so menus and the game-over screen work with a click or a tap.
import { BIKE, FIELD, PLAYER } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  let dragging = false;
  let targetX = null;
  let targetAlt = null;

  function fieldPoint(event) {
    const rect = target.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return {
      x: ((event.clientX - rect.left - offsetX) / scale - FIELD.width / 2) / BIKE.spread,
      y: (BIKE.baseY - (event.clientY - rect.top - offsetY) / scale) / BIKE.altPx,
    };
  }

  function updateTarget(event) {
    const point = fieldPoint(event);
    targetX = Math.min(PLAYER.xMax, Math.max(PLAYER.xMin, point.x));
    targetAlt = Math.min(PLAYER.altMax, Math.max(PLAYER.altMin, point.y));
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    dragging = false;
    targetX = null;
    targetAlt = null;
  });
  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    actions |= ACTION_CONFIRM;
    updateTarget(event);
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nicety, not a requirement.
    }
    event.preventDefault();
  });
  target.addEventListener('pointermove', (event) => {
    if (dragging) updateTarget(event);
  });
  const release = () => {
    dragging = false;
    targetX = null;
    targetAlt = null;
  };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);

  return {
    /** -1 left, 1 right, 0 still. */
    steer() {
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** -1 descend, 1 climb, 0 hold altitude. */
    altitude() {
      return (up ? 1 : 0) - (down ? 1 : 0);
    },
    /** Absolute drag targets in road/altitude units, or null when not dragging. */
    pointerTarget() {
      return dragging ? { targetX, targetAlt } : { targetX: null, targetAlt: null };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
