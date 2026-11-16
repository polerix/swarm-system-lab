# tools/

Headless test harness for `SwarmSystemLab/app_rebuild.js`. No dependencies, no
build step, no framework. Node 18+ only.

## Files

| File | What it is |
|---|---|
| `determinism-node.mjs` | The runner. Loads the engine and reports determinism and speed divergence. |
| `dom-shim.mjs` | The minimum browser surface the engine touches. Stub elements, no-op canvas, no-op `requestAnimationFrame`. |

## Run it

```bash
node tools/determinism-node.mjs
node tools/determinism-node.mjs --seeds 12345,67890 --ticks 3600 --frames 3600
node tools/determinism-node.mjs --json
```

Exit code is `0` when both determinism assertions pass, `1` otherwise — so it
drops into CI unchanged if you ever want it there.

## What it proves

1. **Same seed, run twice → identical state hash.** If this fails, something in
   the engine still reads unseeded entropy.
2. **Two different seeds → different hashes.** Without this, assertion 1 would
   pass trivially on a constant hash.
3. **Same seed at 1× versus 3× `simSpeed`**, over the same number of rAF frames.
   `simSpeed` is an accumulator rate, so 3× runs three times as many fixed steps
   in the same wall-clock window. The hashes are *expected* to differ; the point
   is to see the size of the divergence (population, resources, per-colony food
   and tunnels) rather than discover it later.

   At 1× with 60 Hz frames the accumulator produces exactly one 1/60 s step per
   frame and the resulting hash is **identical** to the pure fixed-tick path for
   the same step count. That is the check that 1× did not change behaviour.

The state hash is FNV-1a over: ant count, resource count, every ant's
`x, y, hp, role`, every resource's `x, y, kind`, and each colony's `team`,
`foodStore`, `tunnelsDugCount`. Floats are quantised to 1e-3 so numerical dust
does not read as divergence while a real behavioural difference still does.

## What it cannot prove

**FPS and heap are not measurable here.** There is no renderer, and
`performance.memory` is Chromium-only. The runner prints both as
`not measured` rather than substituting a tick-rate proxy. Those numbers have to
come from a real browser with `performance.memory` available.

Headless Chromium was tried first (puppeteer, in a scratch directory outside the
repo) and would not launch: `libXdamage.so.1: cannot open shared object file`,
with no root available to install the missing libraries.

## Note on GitHub Pages

`.github/workflows/static.yml` uploads the **repository root** as the Pages
artifact, so `tools/` is published alongside the game. It is a few KB of
harmless `.mjs` and `.md` text — no secrets, not executable from a browser, and
nothing links to it. Saying so here so nobody has to rediscover it. If that ever
becomes unwanted, narrow the upload path in the workflow rather than moving this
directory.

## Engine hooks used

The harness only calls what the engine already exposes on `window.SWARM_LAB`:

- `determinismCheck(seed, ticks)` — reset with the seed, run N fixed ticks
  headless, return the state hash.
- `speedCheck(seed, frames, speed)` — drive the real accumulator for N frames at
  the given `simSpeed`, return the state hash.
- `setSeed(n)` / `getSeed()`

The engine stays an IIFE for the browser path and gained no exports, no module
syntax and no build step.
