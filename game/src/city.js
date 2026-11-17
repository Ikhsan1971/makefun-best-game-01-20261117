// The neon skyline itself: a synthwave sun, two parallax layers of procedurally generated
// towers with lit windows, a striped ground, the perspective road with glowing edges and lane
// dashes, and roadside light posts that whip past for speed feel. Nothing here is an image —
// every pixel is drawn in code. Everything scrolls from the world's distance counter, so the
// same seed always produces the same city.
import { FIELD, PALETTE, SPAWN } from './config.js';

export const Z_MAX = SPAWN.zMax;
const ROAD_HALF_FAR = 46;
const ROAD_HALF_NEAR = FIELD.width * 0.52;
const DEPTH_EXP = 2.15;

/** 0 at the horizon, 1 at the camera plane. */
export function depthAt(z) {
  const u = 1 - z / Z_MAX;
  return Math.pow(Math.max(0, u), DEPTH_EXP);
}

export function screenYAt(z) {
  return FIELD.horizonY + (FIELD.height - FIELD.horizonY) * depthAt(z);
}

export function halfWidthAt(z) {
  const d = depthAt(z);
  return ROAD_HALF_FAR + (ROAD_HALF_NEAR - ROAD_HALF_FAR) * Math.pow(d, 0.72);
}

export function centerXAt(z, curve) {
  const d = depthAt(z);
  return FIELD.width / 2 + curve * d * d * 300;
}

/** How many screen pixels a fully-high (altitude 1) object lifts off the road at z. */
export function altLiftAt(z) {
  return depthAt(z) * 165 + 16;
}

/** Project a road-relative position to screen coordinates. */
export function project(z, x, alt, state) {
  const y = screenYAt(z) - alt * altLiftAt(z);
  return {
    x: centerXAt(z, state.curve) + x * halfWidthAt(z) * 0.92,
    y,
    scale: 0.18 + depthAt(z) * 1.35,
    halfW: halfWidthAt(z),
  };
}

function makeLayer(random, count, width, minH, maxH) {
  const buildings = [];
  let x = 0;
  for (let index = 0; index < count; index += 1) {
    const w = 70 + random() * 150;
    const h = minH + random() * (maxH - minH);
    const cols = Math.max(2, Math.floor(w / 22));
    const rows = Math.max(3, Math.floor(h / 34));
    const lit = [];
    for (let wIndex = 0; wIndex < cols * rows; wIndex += 1) lit.push(random() < 0.42);
    buildings.push({ x, w, h, cols, rows, lit, antenna: random() < 0.3, hueShift: random() });
    x += w + 12 + random() * 46;
  }
  return { buildings, width: Math.max(x, width) };
}

function drawLayer(ctx, layer, offsetPx, baseY, color, windowColor, windowAlpha, time) {
  const offset = offsetPx % layer.width;
  for (const pass of [-1, 0]) {
    for (const b of layer.buildings) {
      const bx = b.x - offset + pass * layer.width;
      if (bx + b.w < -20 || bx > FIELD.width + 20) continue;
      const top = baseY - b.h;
      ctx.fillStyle = color;
      ctx.fillRect(bx, top, b.w, b.h);
      if (b.antenna) {
        ctx.fillRect(bx + b.w / 2 - 1.5, top - 26, 3, 26);
        ctx.fillStyle = windowColor;
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 2.4 + b.x);
        ctx.beginPath();
        ctx.arc(bx + b.w / 2, top - 28, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
      }
      // Windows: a static lit pattern, a few of them flickering slowly.
      const cellW = b.w / b.cols;
      const cellH = b.h / b.rows;
      for (let row = 1; row < b.rows; row += 1) {
        for (let col = 0; col < b.cols; col += 1) {
          const i = row * b.cols + col;
          if (!b.lit[i]) continue;
          const flicker = Math.sin(time * 0.9 + i * 2.13 + b.x * 0.01) > 0.92;
          if (flicker) continue;
          ctx.globalAlpha = windowAlpha * (0.55 + 0.45 * ((Math.sin(i * 12.9898 + b.x) * 43758.5453) % 1 + 1) % 1);
          ctx.fillStyle = (i * 7 + Math.floor(b.x)) % 3 === 0 ? PALETTE.windowCool : windowColor;
          ctx.fillRect(bx + col * cellW + cellW * 0.28, top + row * cellH + cellH * 0.3, cellW * 0.42, cellH * 0.36);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function createCity(random) {
  const far = makeLayer(random, 46, 3000, 60, 210);
  const near = makeLayer(random, 30, 3400, 110, 340);
  const stars = [];
  for (let index = 0; index < 90; index += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * (FIELD.horizonY - 120), r: 0.4 + random() * 1.4, phase: random() * Math.PI * 2 });
  }

  function drawSky(ctx, time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.horizonY + 40);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.horizonY + 40);
    for (const star of stars) {
      ctx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.7 + star.phase));
      ctx.fillStyle = '#dfe8ff';
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }
    ctx.globalAlpha = 1;
    // The synthwave sun, half-drowned by the skyline.
    const sunX = FIELD.width / 2;
    const sunY = FIELD.horizonY - 6;
    const radius = 128;
    const sunGradient = ctx.createLinearGradient(0, sunY - radius, 0, sunY + radius);
    sunGradient.addColorStop(0, PALETTE.sunCore);
    sunGradient.addColorStop(0.55, PALETTE.sunMid);
    sunGradient.addColorStop(1, PALETTE.sunEdge);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = sunGradient;
    ctx.shadowColor = PALETTE.sunEdge;
    ctx.shadowBlur = 46;
    ctx.fill();
    ctx.restore();
    // Slats cut out of the sun near the horizon, widest gaps lowest.
    ctx.fillStyle = PALETTE.skyLow;
    const slats = [[-36, 4], [-24, 6], [-13, 8], [-4, 10]];
    for (const [offset, thickness] of slats) {
      ctx.fillRect(sunX - radius, sunY + offset, radius * 2, thickness);
    }
    // Atmospheric haze melting the horizon into the sun.
    const haze = ctx.createLinearGradient(0, FIELD.horizonY - 90, 0, FIELD.horizonY + 8);
    haze.addColorStop(0, 'rgba(255, 122, 60, 0)');
    haze.addColorStop(1, 'rgba(255, 122, 60, 0.38)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, FIELD.horizonY - 90, FIELD.width, 100);
  }

  function drawGround(ctx) {
    ctx.fillStyle = '#0d081f';
    ctx.fillRect(0, FIELD.horizonY, FIELD.width, FIELD.height - FIELD.horizonY);
  }

  function drawRoad(ctx, state) {
    // Rows from the horizon down to the camera, shaded by travel stripes.
    const step = 5;
    for (let y = FIELD.horizonY + 1; y < FIELD.height + step; y += step) {
      const depth = (y - FIELD.horizonY) / (FIELD.height - FIELD.horizonY);
      const z = Z_MAX * (1 - Math.pow(Math.min(1, depth), 1 / DEPTH_EXP));
      const stripe = Math.floor((state.distance + z) / 26) % 2 === 0;
      const center = centerXAt(z, state.curve);
      const half = halfWidthAt(z);
      ctx.fillStyle = stripe ? PALETTE.roadNear : PALETTE.roadFar;
      ctx.fillRect(center - half, y, half * 2, step + 1);
      // Lane dashes rush toward the viewer.
      if (Math.floor((state.distance + z) / 22) % 2 === 0) {
        ctx.fillStyle = PALETTE.lane;
        ctx.globalAlpha = 0.85;
        const dashW = Math.max(3, half * 0.028);
        ctx.fillRect(center - dashW / 2, y, dashW, step + 1);
        const sideW = Math.max(2, half * 0.02);
        ctx.fillRect(center - half * 0.52 - sideW / 2, y, sideW, step + 1);
        ctx.fillRect(center + half * 0.52 - sideW / 2, y, sideW, step + 1);
        ctx.globalAlpha = 1;
      }
    }
    // Glowing road edges as two stroked polylines.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      for (let y = FIELD.horizonY + 1; y <= FIELD.height; y += 8) {
        const depth = (y - FIELD.horizonY) / (FIELD.height - FIELD.horizonY);
        const z = Z_MAX * (1 - Math.pow(Math.min(1, depth), 1 / DEPTH_EXP));
        const x = centerXAt(z, state.curve) + side * halfWidthAt(z);
        if (y === FIELD.horizonY + 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = PALETTE.roadEdge;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Roadside light posts, whipping past at intervals.
    const spacing = 46;
    const first = Math.ceil(state.distance / spacing) * spacing;
    for (let index = 0; index < 14; index += 1) {
      const worldZ = first + index * spacing - state.distance;
      if (worldZ < 6 || worldZ > Z_MAX) continue;
      const y = screenYAt(worldZ);
      const half = halfWidthAt(worldZ);
      const center = centerXAt(worldZ, state.curve);
      const postH = depthAt(worldZ) * 120 + 6;
      for (const side of [-1, 1]) {
        const x = center + side * (half + 14);
        ctx.strokeStyle = '#2b1b4d';
        ctx.lineWidth = Math.max(1.5, depthAt(worldZ) * 5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - postH);
        ctx.stroke();
        ctx.fillStyle = side < 0 ? PALETTE.windowCool : PALETTE.lane;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(x, y - postH, Math.max(1.2, depthAt(worldZ) * 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Paint sky → far towers → near towers → ground → road. Called once per frame. */
  function drawScenery(ctx, state, time) {
    drawSky(ctx, time);
    drawLayer(ctx, far, state.distance * 0.16, FIELD.horizonY + 4, PALETTE.buildingFar, PALETTE.windowLit, 0.5, time);
    drawLayer(ctx, near, state.distance * 0.42, FIELD.horizonY + 6, PALETTE.buildingNear, PALETTE.windowLit, 0.8, time);
    drawGround(ctx);
    drawRoad(ctx, state);
  }

  return { drawScenery, project };
}
