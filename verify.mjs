// Offline verification for the Neon Skyline: Rescue Run entry. Node 22, standard library only.
// It does NOT need a browser and does NOT touch the network:
//   1. imports the game's logic modules (world/config/random/shots) and simulates a full run
//      headless — the 90-second clock must expire for an unkillable bike, hull or time-up must
//      end a normal run, and all state must stay finite;
//   2. parses shots.json, checks every referenced screenshot exists and is under 256 KiB,
//      and that the first name sorts as the cover (1-*);
//   3. checks the dossier inputs: game/ has the expected files, no path over 1000 bytes,
//      nothing over its 993-file / 48 MiB budget;
//   4. syntax-checks every game/src/*.js via node --check.
// Exit code 0 = all checks passed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const MAX_SHOT_BYTES = 262144; // 256 KiB, the scorer's cap
const MAX_GAME_FILES = 993;
const MAX_GAME_BYTES = 48 * 1024 * 1024;
const MAX_GAME_PATH_BYTES = 1000;

let failures = 0;
const ok = (message) => console.log(`  ok  ${message}`);
const fail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};

console.log('1. headless game simulation');
{
  const { createWorld, EVENT_OVER, EVENT_TIMEUP } = await import(pathToFileURL(join(root, 'game/src/world.js')));
  const { createRandom } = await import(pathToFileURL(join(root, 'game/src/random.js')));
  const { STEP, GAME } = await import(pathToFileURL(join(root, 'game/src/config.js')));

  // An unkillable bike must burn the 90-second clock down to EVENT_TIMEUP.
  const god = createWorld(createRandom(123));
  let events = 0;
  for (let index = 0; index < (GAME.duration + 5) / STEP && !(events & EVENT_TIMEUP); index += 1) {
    god.state.hull = 100000;
    events = god.step(STEP, { steer: 0, alt: 0, targetX: null, targetAlt: null }, false);
  }
  if (events & EVENT_TIMEUP) ok('time-up fires when the clock runs out');
  else fail('EVENT_TIMEUP never fired within 95 simulated seconds');
  if (Math.abs(god.state.timeLeft) < 0.001) ok('clock reached exactly 0');
  else fail(`timeLeft is ${god.state.timeLeft}`);

  // A normal run must end somehow, with finite numbers throughout.
  const run = createWorld(createRandom(7));
  let runEvents = 0;
  let finite = true;
  for (let index = 0; index < 120 / STEP && !(runEvents & (EVENT_OVER | EVENT_TIMEUP)); index += 1) {
    runEvents = run.step(STEP, { steer: Math.sin(index * 0.013), alt: 0, targetX: null, targetAlt: null }, false);
    const numbers = [run.state.score, run.state.distance, run.state.hull, run.state.speed, run.state.curve];
    if (numbers.some((value) => !Number.isFinite(value))) {
      finite = false;
      break;
    }
  }
  if (runEvents & (EVENT_OVER | EVENT_TIMEUP)) ok(`normal run resolved (events 0b${runEvents.toString(2)})`);
  else fail('run never resolved within 120 simulated seconds');
  if (finite) ok('score/distance/hull/speed/curve stayed finite');
  else fail('a non-finite number appeared in world state');

  // Reset must restore a pristine run.
  run.reset();
  if (run.state.score === 0 && run.state.hull === 100 && run.state.timeLeft === GAME.duration && !run.state.items.some((item) => item.active)) {
    ok('reset restores pristine state');
  } else {
    fail('reset did not restore pristine state');
  }

  // The seeded spawn pattern must be deterministic.
  const first = createWorld(createRandom(99));
  const second = createWorld(createRandom(99));
  let matches = true;
  for (let index = 0; index < 600; index += 1) {
    const a = first.step(STEP, { steer: 0, alt: 0, targetX: null, targetAlt: null }, false);
    const b = second.step(STEP, { steer: 0, alt: 0, targetX: null, targetAlt: null }, false);
    if (a !== b || Math.floor(first.state.score) !== Math.floor(second.state.score)) {
      matches = false;
      break;
    }
  }
  if (matches) ok('same seed, same run');
  else fail('seeded worlds diverged');
}

console.log('2. shots.json and screenshots');
{
  let shots = null;
  try {
    shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
    ok('shots.json parses');
  } catch (error) {
    fail(`shots.json does not parse: ${error.message}`);
  }
  if (Array.isArray(shots)) {
    if (shots.length >= 3 && shots.length <= 4) ok(`${shots.length} shots declared`);
    else fail(`expected 3–4 shots, got ${shots.length}`);
    for (const shot of shots) {
      const file = join(root, 'screenshots', shot.name);
      if (!existsSync(file)) {
        fail(`screenshots/${shot.name} is missing`);
        continue;
      }
      const bytes = statSync(file).size;
      if (bytes > MAX_SHOT_BYTES) fail(`screenshots/${shot.name} is ${bytes} bytes (cap ${MAX_SHOT_BYTES})`);
      else ok(`screenshots/${shot.name} ${(bytes / 1024).toFixed(1)} KiB`);
    }
    const cover = [...shots.map((shot) => shot.name)].sort()[0];
    if (cover?.startsWith('1-')) ok(`cover sorts first: ${cover}`);
    else fail(`cover should sort first and start with 1- (got ${cover})`);
  } else if (shots !== null) {
    fail('shots.json is not an array');
  }
}

console.log('3. game/ budget and layout');
{
  const gameDir = join(root, 'game');
  const entries = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else entries.push(full);
    }
  };
  walk(gameDir);
  if (entries.length <= MAX_GAME_FILES) ok(`${entries.length} files in game/`);
  else fail(`${entries.length} files in game/ exceeds ${MAX_GAME_FILES}`);
  const totalBytes = entries.reduce((sum, file) => sum + statSync(file).size, 0);
  if (totalBytes <= MAX_GAME_BYTES) ok(`${(totalBytes / 1024).toFixed(1)} KiB of game files`);
  else fail(`game/ is ${totalBytes} bytes`);
  const tooLong = entries.filter((file) => Buffer.byteLength(relative(root, file)) > MAX_GAME_PATH_BYTES);
  if (tooLong.length === 0) ok('no path over 1000 bytes');
  else fail(`paths over 1000 bytes: ${tooLong.join(', ')}`);
  for (const required of ['index.html', 'src/main.js', 'src/world.js', 'src/render.js', 'src/config.js']) {
    if (existsSync(join(gameDir, required))) ok(`game/${required} present`);
    else fail(`game/${required} missing`);
  }
}

console.log('4. syntax of game sources');
{
  for (const file of readdirSync(join(root, 'game/src'))) {
    if (!file.endsWith('.js')) continue;
    try {
      execFileSync(process.execPath, ['--check', join(root, 'game/src', file)]);
      ok(`game/src/${file} parses`);
    } catch {
      fail(`game/src/${file} does not parse`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nall checks passed');
