// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. The city
// backdrop, road, entities, bike, particles, HUD and menu panels are all generated in code —
// no image or font files anywhere. Text that holds a number is rebuilt only when the number
// changes, so a frame allocates almost nothing.
import { BIKE, FIELD, FONT, GAME, PALETTE, SPAWN } from './config.js';
import { createCity } from './city.js';
import {
  KIND_BARRIER,
  KIND_CELL,
  KIND_DRONE,
  KIND_MINE,
  KIND_POD,
  KIND_REPAIR,
} from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 132, line: 32, bottom: 64 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

const ENTITY_WIDTH = {
  [KIND_BARRIER]: 0.36,
  [KIND_DRONE]: 0.3,
  [KIND_MINE]: 0.2,
  [KIND_CELL]: 0.16,
  [KIND_POD]: 0.26,
  [KIND_REPAIR]: 0.16,
};

export function createRenderer(canvas, random) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const city = createCity(random);
  const scoreLabel = cachedLabel('SCORE ');
  const comboLabel = cachedLabel('COMBO x');
  const levelLabel = cachedLabel('LVL ');
  const finalScoreLabel = cachedLabel('SCORE  ');
  const bestScoreLabel = cachedLabel('BEST  ');
  const rescuedLabel = cachedLabel('RESCUED  ');
  const timeLabels = new Map();
  const particles = [];
  const drawOrder = [];
  const bikePosNow = { x: FIELD.width / 2, y: BIKE.baseY };
  let lastTime = 0;
  let vignette = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
    vignette = null;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight ?? 700} ${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ?? 700} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function timeText(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    if (!timeLabels.has(whole)) {
      timeLabels.set(whole, `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`);
    }
    return timeLabels.get(whole);
  }

  function spawnParticle(x, y, vx, vy, life, size, color, gravity = 240) {
    if (particles.length > 240) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity });
  }

  function burst(kind, x, y) {
    const palette = {
      hit: ['#ff3d5e', '#ffb03a', PALETTE.player],
      pod: [PALETTE.pod, '#ffffff', PALETTE.good],
      cell: [PALETTE.cell, '#d8ffe9', PALETTE.cell],
      repair: [PALETTE.repair, '#ffd7f0', PALETTE.repair],
    }[kind] ?? ['#ffffff'];
    const count = kind === 'pod' ? 26 : 14;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 40, 0.55 + Math.random() * 0.5, 1.5 + Math.random() * 3.5, palette[index % palette.length]);
    }
  }

  function updateParticles(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles[index] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
    }
  }

  function drawParticles() {
    for (const particle of particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function bikeScreenPos(state) {
    return {
      x: FIELD.width / 2 + state.player.x * BIKE.spread,
      y: BIKE.baseY - state.player.alt * BIKE.altPx + Math.sin(state.elapsed * 5.2) * 2.4,
    };
  }

  function drawBike(state, time, screen) {
    const { x, y } = bikeScreenPos(state);
    const player = state.player;
    // Blink while invulnerable after a hit (but never on the game-over screen).
    const dead = state.hull <= 0;
    const hidden = !dead && screen !== SCREEN_OVER && player.invulnerable > 0 && Math.floor(player.invulnerable * 9) % 2 === 0;
    // Road shadow, drawn unscaled on the road plane; shrinks as the bike climbs.
    const altitudeRatio = player.alt;
    context.save();
    context.globalAlpha = 0.35 * (1 - altitudeRatio * 0.55);
    context.fillStyle = '#000000';
    context.beginPath();
    context.ellipse(FIELD.width / 2 + state.player.x * BIKE.spread, BIKE.baseY + 28, 64 - altitudeRatio * 26, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.translate(x, y);
    context.scale(1.55, 1.55);
    if (dead) context.rotate(0.3);
    context.translate(-x, -y);
    if (hidden) context.globalAlpha = 0.25;
    if (dead) {
      // Dead stick: no hover glow, no thrusters — a burnt husk trailing smoke.
      for (let index = 0; index < 3; index += 1) {
        if (Math.random() < 0.6) {
          spawnParticle(
            x + (Math.random() - 0.5) * 30,
            y + 8,
            (Math.random() - 0.5) * 40,
            -60 - Math.random() * 70,
            0.7 + Math.random() * 0.6,
            5 + Math.random() * 6,
            Math.random() < 0.5 ? '#3a3a46' : '#23222e',
            25,
          );
        }
      }
    } else {
      const glow = context.createRadialGradient(x, y + 12, 2, x, y + 12, 52);
      glow.addColorStop(0, 'rgba(55, 245, 255, 0.55)');
      glow.addColorStop(1, 'rgba(55, 245, 255, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(x, y + 12, 52, 14, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Thruster flames (alive only).
    const flicker = 0.75 + 0.45 * Math.sin(time * 31) + 0.2 * Math.sin(time * 47 + 1);
    if (!dead)
    for (const side of [-1, 1]) {
      const flameLength = 26 * flicker;
      const flame = context.createLinearGradient(0, y + 16, 0, y + 16 + flameLength);
      flame.addColorStop(0, '#ffffff');
      flame.addColorStop(0.35, PALETTE.playerHot);
      flame.addColorStop(1, 'rgba(255, 61, 240, 0)');
      context.fillStyle = flame;
      context.beginPath();
      context.moveTo(x + side * 22 - 6, y + 16);
      context.lineTo(x + side * 22 + 6, y + 16);
      context.lineTo(x + side * 22, y + 18 + flameLength);
      context.closePath();
      context.fill();
    }
    // Hull: a sleek wedge, cyan armour with a hot rim — or a burnt husk.
    const hull = context.createLinearGradient(x, y - 28, x, y + 20);
    if (dead) {
      hull.addColorStop(0, '#565a66');
      hull.addColorStop(0.4, '#33363f');
      hull.addColorStop(1, '#131419');
    } else {
      hull.addColorStop(0, '#bffbff');
      hull.addColorStop(0.28, PALETTE.player);
      hull.addColorStop(1, '#0e6d8a');
    }
    context.fillStyle = hull;
    context.shadowColor = dead ? '#000000' : PALETTE.player;
    context.shadowBlur = dead ? 0 : 20;
    context.beginPath();
    context.moveTo(x, y - 28);
    context.lineTo(x + 40, y + 2);
    context.lineTo(x + 54, y + 14);
    context.lineTo(x + 24, y + 22);
    context.lineTo(x - 24, y + 22);
    context.lineTo(x - 54, y + 14);
    context.lineTo(x - 40, y + 2);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    // Side engine pods.
    context.fillStyle = '#0e5a72';
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(x + side * 44, y + 11, 9, 6.5, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 1.6;
      context.stroke();
    }
    // Dorsal fin.
    context.fillStyle = '#1899b8';
    context.beginPath();
    context.moveTo(x - 7, y - 4);
    context.lineTo(x, y - 27);
    context.lineTo(x + 7, y - 4);
    context.closePath();
    context.fill();
    // Cockpit canopy.
    if (dead) {
      context.fillStyle = '#1c1c22';
      context.beginPath();
      context.ellipse(x, y - 7, 14, 10.5, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      const canopy = context.createLinearGradient(x, y - 22, x, y + 2);
      canopy.addColorStop(0, '#ffd7fb');
      canopy.addColorStop(1, '#c227a8');
      context.fillStyle = canopy;
      context.beginPath();
      context.ellipse(x, y - 7, 14, 10.5, 0, 0, Math.PI * 2);
      context.fill();
    }
    // Tail light (dead bikes go dark).
    if (!dead) {
      context.fillStyle = '#ff2d4a';
      context.shadowColor = '#ff2d4a';
      context.shadowBlur = 14;
      context.fillRect(x - 12, y + 19, 24, 4.4);
      context.shadowBlur = 0;
    }
    context.restore();
    return { x, y };
  }

  function drawEntities(state, time) {
    const items = state.items;
    drawOrder.length = 0;
    for (let index = 0; index < items.length; index += 1) {
      if (items[index].active) drawOrder.push(index);
    }
    drawOrder.sort((a, b) => items[b].z - items[a].z);
    for (const index of drawOrder) {
      const item = items[index];
      const projected = city.project(item.z, item.x, item.alt, state);
      const halfW = projected.halfW;
      const w = ENTITY_WIDTH[item.kind] * halfW * 0.92;
      const { x, y, scale } = projected;
      if (item.kind === KIND_BARRIER) {
        const h = Math.max(10, w * 0.5);
        context.save();
        context.shadowColor = PALETTE.hazardBarrier;
        context.shadowBlur = 16 * scale;
        const grad = context.createLinearGradient(x, y - h, x, y);
        grad.addColorStop(0, '#ff7a6a');
        grad.addColorStop(0.5, PALETTE.hazardBarrier);
        grad.addColorStop(1, '#a3122c');
        context.fillStyle = grad;
        context.beginPath();
        context.moveTo(x - w * 0.5, y);
        context.lineTo(x - w * 0.36, y - h);
        context.lineTo(x + w * 0.36, y - h);
        context.lineTo(x + w * 0.5, y);
        context.closePath();
        context.fill();
        context.shadowBlur = 0;
        // Diagonal hazard chevrons.
        context.fillStyle = '#1a0510';
        const stripeW = w * 0.16;
        for (let s = -1; s <= 1; s += 1) {
          context.beginPath();
          context.moveTo(x + s * w * 0.3 - stripeW * 0.4, y - 2);
          context.lineTo(x + s * w * 0.3 + stripeW * 0.4, y - 2);
          context.lineTo(x + s * w * 0.3 + stripeW * 0.9, y - h + 2);
          context.lineTo(x + s * w * 0.3 + stripeW * 0.1, y - h + 2);
          context.closePath();
          context.fill();
        }
        // Warning beacons.
        const blink = 0.5 + 0.5 * Math.sin(time * 9 + item.wobble);
        context.fillStyle = `rgba(255, 214, 90, ${0.4 + 0.6 * blink})`;
        context.beginPath();
        context.arc(x - w * 0.34, y - h - 3, Math.max(1.5, 4 * scale), 0, Math.PI * 2);
        context.arc(x + w * 0.34, y - h - 3, Math.max(1.5, 4 * scale), 0, Math.PI * 2);
        context.fill();
        context.restore();
      } else if (item.kind === KIND_DRONE) {
        const bob = Math.sin(item.wobble * 2.1) * 5 * scale;
        context.save();
        context.translate(x, y + bob - 8 * scale);
        context.shadowColor = PALETTE.hazardDrone;
        context.shadowBlur = 18 * scale;
        context.fillStyle = '#3a2408';
        context.beginPath();
        context.ellipse(0, 0, w * 0.55, w * 0.22, 0, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = PALETTE.hazardDrone;
        context.beginPath();
        context.ellipse(0, -w * 0.1, w * 0.42, w * 0.13, 0, 0, Math.PI * 2);
        context.fill();
        // Spinning rotors.
        context.strokeStyle = '#ffd98a';
        context.lineWidth = Math.max(1, 2 * scale);
        const spin = Math.sin(time * 34 + item.wobble) * w * 0.34;
        for (const side of [-1, 1]) {
          context.beginPath();
          context.moveTo(side * w * 0.62 - spin * side, -w * 0.16);
          context.lineTo(side * w * 0.62 + spin * side, -w * 0.16);
          context.stroke();
        }
        // Hostile eye.
        context.fillStyle = '#ff2d2d';
        context.shadowColor = '#ff2d2d';
        context.shadowBlur = 10;
        context.beginPath();
        context.arc(0, 0, Math.max(1.6, 5 * scale), 0, Math.PI * 2);
        context.fill();
        context.restore();
      } else if (item.kind === KIND_MINE) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 6 + item.wobble);
        context.save();
        context.translate(x, y - 6 * scale);
        context.rotate(item.wobble * 0.35);
        context.shadowColor = PALETTE.hazardMine;
        context.shadowBlur = 16 * scale * pulse;
        context.fillStyle = '#3d0a3a';
        for (let spike = 0; spike < 8; spike += 1) {
          context.rotate(Math.PI / 4);
          context.beginPath();
          context.moveTo(0, -w * 0.12);
          context.lineTo(-w * 0.1, -w * 0.34 * pulse);
          context.lineTo(w * 0.1, -w * 0.34 * pulse);
          context.closePath();
          context.fill();
        }
        context.beginPath();
        context.arc(0, 0, w * 0.24, 0, Math.PI * 2);
        context.fillStyle = PALETTE.hazardMine;
        context.fill();
        context.fillStyle = '#ffd9fb';
        context.beginPath();
        context.arc(0, 0, w * 0.1 * pulse, 0, Math.PI * 2);
        context.fill();
        context.restore();
      } else if (item.kind === KIND_CELL) {
        const pulse = 0.72 + 0.28 * Math.sin(time * 7 + item.wobble);
        context.save();
        context.translate(x, y - 14 * scale + Math.sin(item.wobble) * 3 * scale);
        context.shadowColor = PALETTE.cell;
        context.shadowBlur = 16 * scale * pulse;
        context.fillStyle = '#0a3d22';
        context.beginPath();
        context.arc(0, 0, w * 0.52, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.cell;
        context.lineWidth = Math.max(1.2, 2.4 * scale);
        context.stroke();
        // Lightning bolt.
        context.fillStyle = PALETTE.cell;
        const b = w * 0.34 * pulse;
        context.beginPath();
        context.moveTo(b * 0.28, -b);
        context.lineTo(-b * 0.42, b * 0.16);
        context.lineTo(-b * 0.02, b * 0.16);
        context.lineTo(-b * 0.28, b);
        context.lineTo(b * 0.42, -b * 0.16);
        context.lineTo(b * 0.02, -b * 0.16);
        context.closePath();
        context.fill();
        context.restore();
      } else if (item.kind === KIND_POD) {
        const bob = Math.sin(item.wobble * 1.6) * 3 * scale;
        context.save();
        context.translate(x, y - 12 * scale + bob);
        context.shadowColor = PALETTE.pod;
        context.shadowBlur = 20 * scale;
        // Beacon blinking overhead.
        const blink = 0.5 + 0.5 * Math.sin(time * 10 + item.wobble);
        context.fillStyle = `rgba(255, 80, 80, ${0.35 + 0.65 * blink})`;
        context.beginPath();
        context.arc(0, -w * 0.42, Math.max(1.6, 4.6 * scale), 0, Math.PI * 2);
        context.fill();
        // Capsule body.
        const grad = context.createLinearGradient(0, -w * 0.34, 0, w * 0.3);
        grad.addColorStop(0, '#fff6b0');
        grad.addColorStop(0.5, PALETTE.pod);
        grad.addColorStop(1, '#a8760a');
        context.fillStyle = grad;
        context.beginPath();
        context.ellipse(0, 0, w * 0.62, w * 0.36, 0, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        // Rescue cross.
        context.fillStyle = '#5a3200';
        context.fillRect(-w * 0.09, -w * 0.2, w * 0.18, w * 0.4);
        context.fillRect(-w * 0.2, -w * 0.09, w * 0.4, w * 0.18);
        context.restore();
      } else if (item.kind === KIND_REPAIR) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 6.4 + item.wobble);
        context.save();
        context.translate(x, y - 14 * scale + Math.sin(item.wobble * 1.3) * 3 * scale);
        context.shadowColor = PALETTE.repair;
        context.shadowBlur = 16 * scale * pulse;
        context.fillStyle = '#3d0a2e';
        context.beginPath();
        context.arc(0, 0, w * 0.52, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.repair;
        context.lineWidth = Math.max(1.2, 2.4 * scale);
        context.stroke();
        context.fillStyle = '#ffd7f0';
        const a = w * 0.32;
        context.fillRect(-a * 0.32, -a, a * 0.64, a * 2);
        context.fillRect(-a, -a * 0.32, a * 2, a * 0.64);
        context.restore();
      }
    }
  }

  function drawHud(state, meta, time) {
    context.textBaseline = 'top';
    text(scoreLabel(Math.floor(state.score)), 26, 20, 30, PALETTE.text, 'left');
    const mult = Math.min(SPAWN.comboMax, 1 + Math.floor(state.combo / 4));
    if (state.combo >= 4) {
      const pulse = 1 + 0.12 * Math.sin(time * 8);
      text(comboLabel(mult), 26, 56, Math.round(22 * pulse), PALETTE.good, 'left');
      // Streak pips toward the next tier.
      const pips = state.combo % 4;
      for (let pip = 0; pip < 4; pip += 1) {
        context.fillStyle = pip < pips ? PALETTE.good : 'rgba(255,255,255,0.28)';
        context.beginPath();
        context.arc(30 + pip * 16, 92, 4.5, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      text(`STREAK ${state.combo}`, 26, 56, 18, PALETTE.muted, 'left');
    }
    // The clock, front and centre — red and pulsing in the last ten seconds.
    const urgent = state.timeLeft <= 10 && state.timeLeft > 0;
    const clockSize = urgent ? 54 + Math.round(6 * Math.sin(time * 10)) : 46;
    text(timeText(state.timeLeft), FIELD.width / 2, 14, clockSize, urgent ? PALETTE.bad : PALETTE.text, 'center', 800);
    if (urgent) text('FINAL SECONDS', FIELD.width / 2, 66, 15, PALETTE.bad, 'center');
    // Hull bar and rescues, top right.
    const barW = 210;
    const barH = 16;
    const barX = FIELD.width - 26 - barW;
    const barY = 24;
    text('HULL', barX - 12, barY + 1, 17, PALETTE.muted, 'right');
    context.fillStyle = 'rgba(255,255,255,0.1)';
    context.fillRect(barX, barY, barW, barH);
    const ratio = state.hull / 100;
    const hullColor = ratio > 0.55 ? PALETTE.good : ratio > 0.28 ? PALETTE.warn : PALETTE.bad;
    context.fillStyle = hullColor;
    context.shadowColor = hullColor;
    context.shadowBlur = 10;
    context.fillRect(barX, barY, Math.max(0, barW * ratio), barH);
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 1.5;
    context.strokeRect(barX, barY, barW, barH);
    text(`${Math.ceil(state.hull)}`, barX + barW / 2, barY + 1, 11, ratio > 0.35 ? 'rgba(5,6,15,0.9)' : '#f2f6ff', 'center');
    // Rescue pod icon + count.
    const podY = barY + 36;
    context.fillStyle = PALETTE.pod;
    context.beginPath();
    context.ellipse(barX + 12, podY + 8, 13, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#5a3200';
    context.fillRect(barX + 10, podY + 3.5, 4, 9);
    context.fillRect(barX + 7.5, podY + 6, 9, 4);
    text(`× ${state.rescued}`, barX + 32, podY - 2, 24, PALETTE.pod, 'left');
    // Level + progress to next level, bottom left.
    text(levelLabel(state.level), 26, FIELD.height - 42, 20, PALETTE.muted, 'left');
    const levelProgress = (state.elapsed % GAME.levelEvery) / GAME.levelEvery;
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(26, FIELD.height - 16, 130, 4);
    context.fillStyle = PALETTE.lane;
    context.fillRect(26, FIELD.height - 16, 130 * levelProgress, 4);
    if (meta.muted) text('MUTED (M)', FIELD.width - 26, FIELD.height - 34, 15, PALETTE.muted, 'right');
    else text('M — SOUND', FIELD.width - 26, FIELD.height - 34, 15, PALETTE.muted, 'right');
  }

  function drawPanel(title, titleColor, lines, prompt, promptColor, time) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.shadowColor = PALETTE.roadEdge;
    context.shadowBlur = 26;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(0, 229, 255, 0.6)';
    context.lineWidth = 1.6;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    context.shadowColor = titleColor;
    context.shadowBlur = 22;
    text(title, FIELD.width / 2, y + 66, 44, titleColor, 'center', 800);
    context.shadowBlur = 0;
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.text, 'center', 400);
    }
    const blink = 0.55 + 0.45 * Math.sin(time * 4.4);
    context.globalAlpha = blink;
    text(prompt, FIELD.width / 2, y + height - 26, 23, promptColor, 'center', 800);
    context.globalAlpha = 1;
    context.restore();
  }

  function drawVigente() {
    if (!vignette) {
      vignette = context.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.42,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.72,
      );
      vignette.addColorStop(0, 'rgba(5,6,15,0)');
      vignette.addColorStop(1, 'rgba(5,6,15,0.55)');
    }
    context.fillStyle = vignette;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Paint one frame. `meta` carries { best, bestRescued, isNewBest, muted, endReason }. */
  function draw(state, screen, meta) {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, lastTime ? now - lastTime : 1 / 60);
    lastTime = now;
    updateParticles(dt);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    city.drawScenery(context, state, now);
    drawEntities(state, now);

    const bikePos = drawBike(state, now, screen);
    bikePosNow.x = bikePos.x;
    bikePosNow.y = bikePos.y;
    if (screen === SCREEN_PLAY && state.flash <= 0.01) {
      // Exhaust sparks trailing the bike while flying.
      for (let index = 0; index < 2; index += 1) {
        spawnParticle(
          bikePos.x + (Math.random() - 0.5) * 16,
          bikePos.y + 18,
          (Math.random() - 0.5) * 70,
          130 + Math.random() * 90,
          0.4 + Math.random() * 0.3,
          1.6 + Math.random() * 2.4,
          Math.random() < 0.5 ? PALETTE.player : PALETTE.lane,
        );
      }
    }
    drawParticles();

    // Hit flash: a hard red wash that fades.
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 45, 74, ${state.flash * 0.38})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    // Rescue flash: a golden frame pulse.
    if (state.podFlash > 0) {
      context.strokeStyle = `rgba(255, 225, 77, ${state.podFlash * 0.85})`;
      context.lineWidth = 10 * state.podFlash + 2;
      context.strokeRect(0, 0, FIELD.width, FIELD.height);
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    drawVigente();
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    if (screen === SCREEN_TITLE) {
      const lines = [
        'R E S C U E   R U N',
        '',
        '90 seconds. One bike. As many souls as the highway hides.',
        '← → / A D  steer      ↑ ↓ / W S  hover height',
        'Dodge barriers & drones  ·  grab energy cells  ·  rescue SOS pods',
        'Chain pickups to raise your combo. Getting hit wipes it.',
      ];
      if (meta.best > 0) lines.push(`BEST SCORE ${meta.best}   ·   BEST RESCUED ${meta.bestRescued}`);
      drawPanel('NEON SKYLINE', PALETTE.roadEdge, lines, 'PRESS SPACE OR TAP TO LAUNCH', PALETTE.lane, now);
      return;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, meta, now);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', PALETTE.roadEdge, ['The city waits. The pods do not.'], 'P / ESC — RESUME', PALETTE.text, now);
    } else if (screen === SCREEN_OVER) {
      const title = meta.endReason === 'hull' ? 'BIKE DOWN' : 'SHIFT COMPLETE';
      const lines = [
        meta.isNewBest ? '★ NEW BEST SCORE ★' : `SCORE ${Math.floor(state.score)}`,
        `RESCUED ${state.rescued} POD${state.rescued === 1 ? '' : 'S'}   ·   BEST COMBO ${state.bestCombo}   ·   DISTANCE ${Math.floor(state.distance)} m`,
        meta.isNewBest ? `SCORE ${Math.floor(state.score)}` : `BEST ${meta.best}   ·   BEST RESCUED ${meta.bestRescued}`,
      ];
      drawPanel(title, meta.endReason === 'hull' ? PALETTE.bad : PALETTE.good, lines, 'SPACE / TAP — FLY AGAIN', PALETTE.lane, now);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Burst particles at the bike's last drawn position (call after draw). */
    burst(kind) {
      burst(kind, bikePosNow.x, bikePosNow.y);
    },
  };
}
