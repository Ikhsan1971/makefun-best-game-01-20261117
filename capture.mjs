// Reproducible screenshot capture for the Neon Skyline: Rescue Run entry.
// Node 22 standard library only (global WebSocket + http). It launches google-chrome-stable
// headless with a devtools port, points it at the local server (default
// http://127.0.0.1:8080, override with CAPTURE_BASE), waits for the game's window.__shotReady
// flag (set after the staged scene has painted twice), then saves a PNG/JPEG via CDP.
//
// Usage: node capture.mjs <html?shot=...-query> <outfile.jpg>
// e.g.   node capture.mjs "shot=start&seed=3" screenshots/1-start.jpg
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import http from 'node:http';

const query = process.argv[2] ?? 'shot=start&seed=3';
const outFile = resolve(process.argv[3] ?? 'screenshots/out.jpg');
const base = process.env.CAPTURE_BASE ?? 'http://127.0.0.1:8080';
const url = `${base}/?${query}`;
const width = Number(process.env.CAPTURE_WIDTH ?? 1280);
const height = Number(process.env.CAPTURE_HEIGHT ?? 720);

function httpJson(path) {
  return new Promise((resolvePromise, reject) => {
    http
      .get({ host: '127.0.0.1', port: 9222, path }, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          try {
            resolvePromise(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const chrome = spawn(
  'google-chrome-stable',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--mute-audio',
    `--window-size=${width},${height}`,
    '--remote-debugging-port=9222',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let exitCode = 1;
try {
  // Wait for the devtools endpoint and open the target.
  let targets = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try {
      targets = await httpJson('/json/list');
      if (targets.length > 0) break;
    } catch {
      // Chrome not up yet.
    }
  }
  if (!targets || targets.length === 0) throw new Error('chrome devtools endpoint never came up');
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('no page target in devtools endpoint');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) {
      events.push(message);
    }
  };
  await new Promise((resolvePromise, reject) => {
    ws.onopen = resolvePromise;
    ws.onerror = reject;
  });
  const send = (method, params = {}) =>
    new Promise((resolvePromise, reject) => {
      messageId += 1;
      pending.set(messageId, (message) => (message.error ? reject(new Error(JSON.stringify(message.error))) : resolvePromise(message.result)));
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });

  // Wait until the staged scene has painted (window.__shotReady) or 12 s pass; for a plain
  // page load just settle briefly, then capture.
  const expectsShot = /(^|&)shot=/.test(query);
  const maxAttempts = expectsShot ? 120 : 30;
  let ready = !expectsShot;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(100);
    const result = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    if (result?.result?.value === true) {
      ready = true;
      break;
    }
  }
  if (!ready) console.warn('warning: __shotReady never set; capturing whatever is on screen');

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${outFile} for ${url}`);
  ws.close();
  exitCode = 0;
} catch (error) {
  console.error('capture failed:', error.message);
} finally {
  chrome.kill('SIGTERM');
}
process.exit(exitCode);
