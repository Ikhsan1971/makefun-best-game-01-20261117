// best-game-01copies game/ and screenshots/ into the output dir,
// writes dossier.json via the kit's vendored buildDossier. MAKEFUN_OUTPUT_DIR stands in for /output.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DossierError } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const fatal = (m: string) => { console.error(`main.ts: error: ${m}`); process.exit(1); };
const needDir = (p: string, what: string) => {
  if (!existsSync(p) || !statSync(p).isDirectory()) fatal(`${what} missing or not a directory: ${p}`);
};
const stage = (n: string) => { // fresh copy of an owned artifact
  const d = join(outDir, n);
  rmSync(d, { recursive: true, force: true });
  return d;
};
const walk = (dir: string) => {
  let files = 0, bytes = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { const s = walk(full); files += s.files; bytes += s.bytes; }
    else { files += 1; bytes += statSync(full).size; }
  }
  return { files, bytes };
};
try {
  needDir(join(repoRoot, 'game'), 'game/');
  needDir(join(repoRoot, 'screenshots'), 'screenshots/');
  if (!existsSync(join(repoRoot, 'game', 'index.html'))) fatal('game/index.html is missing');
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), stage('game'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), stage('screenshots'), { recursive: true });
  if (existsSync(join(repoRoot, 'LICENSE'))) cpSync(join(repoRoot, 'LICENSE'), stage('LICENSE'));
  const dossierPath = join(outDir, 'dossier.json');
  rmSync(dossierPath, { force: true });
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(dossierPath, dossier);
  const game = walk(join(outDir, 'game'));
  const shots = walk(join(outDir, 'screenshots'));
  const names = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
  const lic = existsSync(join(outDir, 'LICENSE'));
  console.log('make.fun best-game-01 entry');
  console.log(`output:       ${outDir}`);
  console.log(`game/:        ${game.files} entries, ${game.bytes} B`);
  console.log(`screenshots/: ${shots.files} files [${names.join(', ')}], cover ${names[0] ?? 'none'}`);
  console.log(`dossier.json: ${dossier.length} B (makefun/dossier/v1, cap 163840)`);
  console.log(`artifacts:    game/, screenshots/, dossier.json${lic ? ', LICENSE' : ''}`);
  console.log('gate summary: staged within caps; dossier via vendor/makefun-game.ts');
} catch (e) {
  if (e instanceof DossierError) fatal(`buildDossier refused (${e.limit ?? 'input'}): ${e.message}`);
  fatal(e instanceof Error ? e.message : String(e));
}
