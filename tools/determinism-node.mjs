#!/usr/bin/env node
/*
  tools/determinism-node.mjs

  Headless determinism harness for SwarmSystemLab/app_rebuild.js.

  What it proves:
    1. The same seed, run twice, produces an identical state hash.
       (If it does not, something still reads unseeded entropy.)
    2. Two different seeds produce different hashes.
       (Guards against the hash being constant, which would make (1) vacuous.)
    3. How far the same seed diverges at 1x versus 3x simSpeed, and in what.

  What it cannot prove: FPS or heap. There is no renderer and no
  performance.memory in Node. Those must be measured in a real browser.

  Usage:
    node tools/determinism-node.mjs
    node tools/determinism-node.mjs --seeds 12345,67890 --ticks 600 --frames 600
    node tools/determinism-node.mjs --json

  No dependencies, no build step. Just Node 18+.
*/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { installDomShim } from './dom-shim.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(here, '..', 'SwarmSystemLab', 'app_rebuild.js');

function parseArgs(argv) {
  const out = { seeds: [12345, 67890], ticks: 600, frames: 600, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--seeds') out.seeds = argv[++i].split(',').map(s => Number(s.trim()) >>> 0);
    else if (a === '--ticks') out.ticks = Number(argv[++i]);
    else if (a === '--frames') out.frames = Number(argv[++i]);
  }
  return out;
}

// Load the engine. app_rebuild.js is an IIFE with no imports or exports, so
// it runs fine as a plain script; it publishes itself on window.SWARM_LAB.
// Running it in a vm context (rather than eval in this module) keeps the
// shimmed globals out of the harness's own scope.
function loadEngine() {
  const source = readFileSync(ENGINE, 'utf8');
  const sandbox = {};
  const context = vm.createContext(sandbox);
  installDomShim(sandbox);
  sandbox.console = console;
  sandbox.performance = { now: () => Number(process.hrtime.bigint() / 1000000n) };
  vm.runInContext(source, context, { filename: ENGINE });
  if (!sandbox.SWARM_LAB) throw new Error('engine did not expose window.SWARM_LAB');
  return sandbox.SWARM_LAB;
}

function diffColonies(a, b) {
  const rows = [];
  const n = Math.max(a.colonies.length, b.colonies.length);
  for (let i = 0; i < n; i++) {
    const ca = a.colonies[i];
    const cb = b.colonies[i];
    rows.push({
      colony: i,
      team: (ca && ca.team) ?? (cb && cb.team),
      food: [ca ? ca.food : null, cb ? cb.food : null],
      tunnels: [ca ? ca.tunnels : null, cb ? cb.tunnels : null]
    });
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const lab = loadEngine();
  const [seedA, seedB] = args.seeds;

  // --- 1 & 2: determinism and seed sensitivity -------------------------
  const a1 = lab.determinismCheck(seedA, args.ticks);
  const a2 = lab.determinismCheck(seedA, args.ticks);
  const b1 = lab.determinismCheck(seedB, args.ticks);

  const sameSeedIdentical = a1.hash === a2.hash;
  const differentSeedsDiffer = a1.hash !== b1.hash;

  // --- 3: 1x vs 3x over the same wall-clock window ---------------------
  const s1 = lab.speedCheck(seedA, args.frames, 1.0);
  const s3 = lab.speedCheck(seedA, args.frames, 3.0);

  const result = {
    engine: 'SwarmSystemLab/app_rebuild.js',
    ticks: args.ticks,
    frames: args.frames,
    seeds: { a: seedA, b: seedB },
    determinism: {
      sameSeedRun1: a1,
      sameSeedRun2: a2,
      differentSeed: b1,
      sameSeedIdentical,
      differentSeedsDiffer
    },
    speed: {
      x1: s1,
      x3: s3,
      hashesDiffer: s1.hash !== s3.hash,
      stepsRatio: s1.ticks ? +(s3.ticks / s1.ticks).toFixed(3) : null,
      population: [s1.ants, s3.ants],
      resources: [s1.resources, s3.resources],
      colonies: diffColonies(s1, s3)
    },
    notMeasured: {
      fps: 'not measured — no renderer in Node',
      heap: 'not measured — performance.memory is Chromium-only'
    }
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const L = [];
    L.push('=== DETERMINISM ===');
    L.push(`engine        : ${result.engine}`);
    L.push(`fixed ticks   : ${args.ticks}`);
    L.push(`seed ${seedA} run 1 : hash=${a1.hash} ants=${a1.ants} res=${a1.resources}`);
    L.push(`seed ${seedA} run 2 : hash=${a2.hash} ants=${a2.ants} res=${a2.resources}`);
    L.push(`seed ${seedB}       : hash=${b1.hash} ants=${b1.ants} res=${b1.resources}`);
    L.push(`same seed  -> identical hash : ${sameSeedIdentical ? 'PASS' : 'FAIL'}`);
    L.push(`diff seeds -> different hash : ${differentSeedsDiffer ? 'PASS' : 'FAIL'}`);
    L.push('');
    L.push(`=== SPEED DIVERGENCE (seed ${seedA}, ${args.frames} frames of 1/60 s) ===`);
    L.push(`1x : hash=${s1.hash} steps=${s1.ticks} ants=${s1.ants} res=${s1.resources}`);
    L.push(`3x : hash=${s3.hash} steps=${s3.ticks} ants=${s3.ants} res=${s3.resources}`);
    L.push(`steps ratio 3x/1x : ${result.speed.stepsRatio}`);
    for (const r of result.speed.colonies) {
      L.push(`  colony ${r.colony} (team ${r.team}) food ${r.food[0]} -> ${r.food[1]} | tunnels ${r.tunnels[0]} -> ${r.tunnels[1]}`);
    }
    L.push('');
    L.push('=== NOT MEASURED ===');
    L.push(`fps  : ${result.notMeasured.fps}`);
    L.push(`heap : ${result.notMeasured.heap}`);
    process.stdout.write(L.join('\n') + '\n');
  }

  process.exitCode = (sameSeedIdentical && differentSeedsDiffer) ? 0 : 1;
}

main();
