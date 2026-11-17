# makefun-best-game-01-20261117

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Ikhsan1971/makefun-best-game-01-20261117/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Ikhsan1971/makefun-best-game-01-20261117/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

A 90-second neon hover-bike rescue runner for the browser. Dodge road hazards, thread energy
cells, and pluck SOS rescue pods out of a procedural synthwave city — all in one canvas, offline,
no network requests, no assets, no libraries.

You fly a courier bike down an elevated highway through a neon skyline. The sun never sets,
the pods keep calling, and the clock is always losing.

## Run it

Requires Node 22 (standard library only) and a modern browser.

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open http://localhost:8080. Or open `game/index.html` over any static server — the game
itself is plain HTML/CSS/JS under `game/` and works fully offline (e.g. from a `file://` mirror
via any local server; ES modules need HTTP, not `file://`).

## How to play

- **← →** or **A / D** — steer
- **↑ ↓** or **W / S** — hover height (climb / descend)
- **Drag** with mouse or finger — absolute position (horizontal = lateral, vertical = altitude)
- **Space / Enter / click / tap** — launch, restart, or dismiss a panel
- **P / Esc** — pause and resume
- **M** — mute / unmute sound

The run lasts exactly **90 seconds**. Difficulty ramps every 15 seconds (level 1–6): the bike
gets faster and hazards spawn more often.

### What is on the road

| Object | Look | Effect |
| --- | --- | --- |
| Barrier | wide red/black chevron block on the road | −30 hull; dodge laterally or climb over it |
| Drone | amber saucer hovering high | −30 hull; drop low to slip under |
| Mine | magenta spiked ball on the asphalt | −30 hull; thread between them |
| Energy cell | green lightning bolt | +50 × combo tier, +1 streak |
| SOS rescue pod | yellow capsule with a cross | +400 × combo tier, +1 rescued |
| Repair kit | pink cross | +150 × combo tier, +35 hull (cap 100) |

Every 4 consecutive pickups (no hit) raises the combo multiplier, up to **×8**. Getting hit
wipes the streak and costs 30 hull of 100. Hull at 0 = bike down. Clock at 0 = shift complete.
Best score and best rescue count are stored in `localStorage` under
`neon-skyline-rescue.best` / `neon-skyline-rescue.rescued`.

### Screens and feedback

Title (attract mode, instant launch — it is the tutorial), play, pause (auto-pauses when the
tab hides), and game over (BIKE DOWN / SHIFT COMPLETE) with score, rescued, best combo,
distance and bests. A visually hidden live region (`role="status"`) announces screen changes,
hits, rescues, combo-tier ups and the ten-second warning for screen readers.

## Layout

```
game/index.html      canvas + live region
game/src/config.js   every tuning number and colour
game/src/world.js    rules: spawning, collisions, score/combo, hull, clock (no DOM)
game/src/city.js     procedural skyline, sun, parallax towers, perspective road
game/src/render.js   drawing: entities, bike, particles, HUD, panels
game/src/input.js    keyboard + pointer/touch
game/src/audio.js    Web Audio synthesized SFX (no audio files)
game/src/shots.js    ?shot=start|play|late|end staged scenes (autopilot)
game/src/main.js     boot, fixed 1/60 s step loop, screens
capture.mjs          headless screenshot capture (Node 22 stdlib + google-chrome-stable)
verify.mjs           headless verification (Node 22 stdlib)
shots.json           the screenshots and their ?shot= stages
```

`world.js` is DOM-free and deterministic per seed; the same `?seed=N` always spawns the same
pattern, which is what makes the staged screenshots reproducible.

## Verify

```sh
node verify.mjs        # headless logic/budget/syntax checks, no browser needed
```

It simulates a full run (an unkillable bike must expire the 90 s clock; a normal run must
resolve; state stays finite; `reset()` is pristine; seeds are deterministic), validates
`shots.json` and the ≤256 KiB screenshots, the `game/` budget, and `node --check`s every
source file.

## Screenshots

`screenshots/1-start.jpg`, `2-play.jpg`, `3-end.jpg` (1280×720, JPEG) capture the title,
mid-run action (seed 8) and the bike-down game-over (seed 8). Reproduce them with the local
server running:

```sh
node serve.ts --port 8080 &
node capture.mjs "shot=start&seed=8" screenshots/1-start.jpg
node capture.mjs "shot=play&seed=8"  screenshots/2-play.jpg
node capture.mjs "shot=end&seed=8"   screenshots/3-end.jpg
```

`capture.mjs` launches headless Chrome over CDP, waits for the staged scene to paint twice
(`window.__shotReady`), and captures via `Page.captureScreenshot`. The staged scenes play the
real rules forward steered by an autopilot, so they are honest frames of real gameplay. The
`end` stage is seeded to demonstrate the NEW BEST panel state.

## Dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # writes out/dossier.json
```

## Testing notes (honest)

- Logic simulated headlessly in Node (`verify.mjs`): clock expiry, run resolution, determinism.
- Rendered and screenshotted in headless google-chrome-stable 157 via CDP (`capture.mjs`),
  including a live input smoke test (Space launches, P pauses/resumes, M mutes; status
  live region updates; zero console errors observed in that session).
- Not tested: real touch-hardware feel, audio output on every browser, `file://` loading of
  ES modules (needs HTTP), browsers other than Chrome.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ajkq5baq&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
