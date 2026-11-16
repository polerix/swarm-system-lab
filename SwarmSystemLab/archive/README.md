# Archive — dead engine variants

These four files are **dead**. They are kept only as a parts bin. Nothing in the live
page loads them, and nothing should.

| File | Lines | What it was |
|---|---|---|
| `app_fixed.js` | 2685 | The older, larger engine. Superseded by `app_rebuild.js`. |
| `index_fixed.html` | 221 | Page shell for `app_fixed.js`. |
| `index2.html` | 766 | Standalone earlier prototype page. |
| `index3.html` | 2239 | Standalone earlier prototype page. |

## The only live engine

`SwarmSystemLab/app_rebuild.js` (1419 lines) is the **only** live engine.

The live path is:

```
/index.html  →  /SwarmSystemLab/index.html  →  <script type="module" src="./app_rebuild.js">
```

`SwarmSystemLab/index.html` references exactly one script. No archived file is
referenced from either `index.html`.

## Why this archive exists — the incident

Commit **`9c77d48`** — *"Balance pass: apply 13 balance fixes to app_rebuild.js and
app_fixed.js"* — applied the same thirteen balance fixes **twice, in parallel, to both
engines**. That is the cost of keeping a second engine alive: every change has to be
paid for twice, and the two copies drift the moment one payment is missed.

Naming that commit here is the point of this file. A future session that finds
`app_fixed.js` and sees working weather in it must not resurrect it as a second engine.
These are **harvest candidates, not a parallel codebase** — port the idea into
`app_rebuild.js`, do not re-enable the file.

## Harvest candidates in `app_fixed.js`

Things `app_fixed.js` has that `app_rebuild.js` lacks:

- **Working weather.** `tickSky` (`:455`) drifts wrapped clouds; `cloudCoverAtX`
  gives a Gaussian cover per column; `tickRain` (`:476`) runs a rain state machine
  (cooldown → active with duration and intensity → cooldown);
  `surfaceLight01AtX` folds sun, cloud cover and rain into one light value.
  `app_rebuild.js` has a `weather` object that is read but never advanced — its
  `kind` is permanently `clear`.
- **`rainLeach`** (`:1515`) — a per-column `Float32Array(W)` that accumulates
  rainfall soak and decays, then scales with depth to tint and wet soil
  (`:1525`, `:1537`, `:1555`).
- **Moisture and nutrient fields via `tickFields`** (`:1828`) — rain adds
  moisture to the top soil band, sun and dryness evaporate it, nutrients decay
  slowly. `app_rebuild.js` allocates `moisture`, `water`, `rootMass` and
  `fertility` and then never updates any of them.
- **Richer pheromones.** `pher` (`:365`) is **two teams × three channels**
  (`HOME`, `FOOD`, `DANGER`), each a full `Float32Array(W * H)`, with exponential
  half-life decay over the whole grid (`decayPher`, `:376`) and a UI-tunable
  half-life. *Correction to the brief:* these are **not** double-buffered and
  there is **no diffusion pass** in `app_fixed.js` — `grep` for `diffus`/`blur`/
  `neighbo` returns nothing. The live engine by contrast has a single
  `pherFood` array decayed **only along the surface row**, linearly.
- **`antOcc`** (`:331`) — a `Uint8Array(W * H)` occupancy grid rebuilt each tick
  (`:2631`) and consulted before a move (`:1564`), enforcing one ant per tile.
  The live engine lets ants stack.
- **Win/lose conditions.** `checkWinLose` (`:2025`): a colony loses when its queen
  dies; it wins at population ≥ 70, ≥ 2 active galleries and edible stores past
  `CFG.queenSurplusGate`. An end code is minted for both teams. The live engine
  has no terminal state at all.

## Rules

- Do not edit the contents of any file in this directory.
- Do not add a reference to any of them from a live page.
- To use something here, port it into `app_rebuild.js` and delete nothing from here.
