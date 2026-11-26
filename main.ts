// Ridgeline Run — the hand-in program (Node 22, standard library only).
// It copies this repository's game/ and screenshots/ into the grader's output
// directory and writes dossier.json, the summary the judge reads, using the
// vendored make.fun library. It runs twice in the grader and both runs must
// write the same bytes, so it does nothing but copy and summarise.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so a stale file from an earlier run can
// never leak into the entry; the grader gives us a fresh one, this is for local runs.
mkdirSync(outputDir, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outputDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps, so main.ts refuses an entry the scorer would refuse:
// at most 4 screenshots, each at most 256 KiB; game/ at most 993 files and
// 48 MiB in all, no path over 1000 bytes; the dossier text at most 160 KiB.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
