/*
  app_rebuild.js
  Swarm System Lab - Autonomous Ant Farm Simulator
  Features:
  - Multi-colony expansion via Nuptial Flights (Virgin Queens + Male Ants)
  - Structured Tunnel Array & Ant Hill Chamber Architecture
  - Underground Mushroom Farming (cultivating leaves into fungal gardens 🍄)
  - Aphid Tending & Honeydew Milk Farming (🥛 high-energy milk droplets)
  - Balance Lab & Automated Fast-Forward Simulation Engine
  - Modern Glassmorphism UI & Responsive Renderer
*/

(() => {
  "use strict";

  /* =========================================================
     0) Utilities
  ========================================================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const irand = (a, b) => a + ((Math.random() * (b - a + 1)) | 0);
  const choice = (arr) => arr[(Math.random() * arr.length) | 0];

  /* =========================================================
     1) Game Time & Weather
  ========================================================= */
  const GAME_SECONDS_PER_REAL_SECOND = 72;
  const GAME_DAY_SECONDS = 24 * 60 * 60;
  const GAME_YEAR_DAYS = 365;
  const GAME_YEAR_SECONDS = GAME_YEAR_DAYS * GAME_DAY_SECONDS;

  const DAY_PHASE = {
    sunrise: 0.075,
    day: 0.50,
    sunset: 0.075,
    night: 0.35
  };

  let gameSeconds = 0;
  let simSpeed = 1.0; // speed multiplier for simulation

  const WEATHER = { CLEAR: 'clear', WINDY: 'windy', RAIN: 'rain', SUNNY: 'sunny' };
  const weather = { kind: WEATHER.CLEAR, untilGS: 0 };

  function getDayPhase(tDayFrac) {
    const a = DAY_PHASE.sunrise;
    const b = a + DAY_PHASE.day;
    const c = b + DAY_PHASE.sunset;

    if (tDayFrac < a) {
      const k = tDayFrac / a;
      return { name: 'sunrise', isDay: true, isNight: false, light: 0.30 + 0.70 * k };
    }
    if (tDayFrac < b) {
      return { name: 'day', isDay: true, isNight: false, light: 1.0 };
    }
    if (tDayFrac < c) {
      const k = (tDayFrac - b) / DAY_PHASE.sunset;
      return { name: 'sunset', isDay: true, isNight: false, light: 1.0 - 0.70 * k };
    }
    return { name: 'night', isDay: false, isNight: true, light: 0.30 };
  }

  function dayFracFromGameSeconds(gs) {
    const d = ((gs % GAME_DAY_SECONDS) + GAME_DAY_SECONDS) % GAME_DAY_SECONDS;
    return d / GAME_DAY_SECONDS;
  }

  function currentPhase() {
    return getDayPhase(dayFracFromGameSeconds(gameSeconds));
  }

  /* =========================================================
     2) World Grid & Constants
  ========================================================= */
  const W = 260; // World Width (expanded to allow multi-colony spreading)
  const H = 150; // World Height
  const surfaceY = 34;
  const SURFACE_WALK_Y = surfaceY;

  const wrapX = (x) => ((x % W) + W) % W;
  const idx = (x, y) => wrapX(x) + y * W;
  const inb = (x, y) => y >= 0 && y < H;

  const TILE = {
    AIR: 0,
    SOIL: 1,
    TUNNEL: 2,
    ROCKS: 3,
    ROCKM: 4,
    ROCKL: 5,
    ROOT_DIRT: 6,
    MUSHROOM_FARM: 7,
    APHID_FARM: 8
  };

  const tile = new Uint8Array(W * H);
  const moisture = new Float32Array(W * H);
  const water = new Float32Array(W * H);
  const rootMass = new Float32Array(W * H);
  const fertility = new Float32Array(W * H);

  const tileAt = (x, y) => tile[idx(wrapX(x), y)];
  const setTile = (x, y, t) => tile[idx(wrapX(x), y)] = t;
  const isSoil = (x, y) => inb(x, y) && (tileAt(x, y) === TILE.SOIL || tileAt(x, y) === TILE.ROOT_DIRT);

  const EMOJI = {
    ANT: '🐜',
    QUEEN: '👑',
    VIRGIN_QUEEN: '👑✨',
    MALE_ANT: '🐜♂',
    BEETLE: '🪲',
    WORM: '🪱',
    SPIDER: '🕷️',
    APHID: '🫛',
    LEAF: '🍃',
    MUSHROOM: '🍄',
    MILK: '🥛',
    PROTEIN: '🍖',
    SPORE: '🦠'
  };

  /* =========================================================
     3) Castes & Roles
  ========================================================= */
  const CASTE = {
    QUEEN: 0,
    EGG: 1,
    NANITIC: 2,
    WORKER: 3,
    EXPLORER: 4,
    WARRIOR: 5,
    MALE: 6,
    VIRGIN_QUEEN: 7
  };

  const ROLE = {
    IDLE: 0,
    FORAGE: 1,
    DIG: 2,
    HAUL_DIRT: 3,
    FEED_QUEEN: 4,
    FARM_MUSHROOM: 5,
    MILK_APHID: 6,
    DEFEND: 7,
    SCOUT: 8,
    NUPTIAL_FLIGHT: 9
  };

  const PHASE = {
    FOUNDING: 0,
    NANITIC: 1,
    GROWING: 2,
    MATURE: 3,
    EXPANDING: 4
  };

  const STAGE = { EGG: 'egg', JUV: 'juvenile', ADULT: 'adult' };

  // Fix 1: Stage combat multipliers (adults stronger than juveniles)
  const STAGE_MULT = {
    [STAGE.JUV]:   { atk: 0.85, def: 0.85 },
    [STAGE.ADULT]: { atk: 1.25, def: 1.25 }
  };

  let nextId = 1;
  const ants = [];
  const mobs = [];
  const resources = [];
  const plants = [];
  const trees = [];
  const colonies = [];

  const pherFood = new Float32Array(W * H);
  function addPherFood(x, y, v) {
    if (!inb(x, y)) return;
    pherFood[idx(wrapX(x), y)] = clamp(pherFood[idx(wrapX(x), y)] + v, 0, 1000);
  }
  function pherAt(x, y) {
    if (!inb(x, y)) return 0;
    return pherFood[idx(wrapX(x), y)];
  }

  // Fix 4: mob population caps
  const MOB_CAP = { beetles: 8, worms: 12 };

  const GS_HOUR = 60 * 60;
  const GS_DAY = GAME_DAY_SECONDS;
  const GS_WEEK = 7 * GS_DAY;
  const GS_MONTH = 30 * GS_DAY;
  const GS_YEAR = GAME_YEAR_SECONDS;

  /* =========================================================
     4) Tunable Balance Parameters (Managed by Balance Lab)
  ========================================================= */
  const CFG = {
    scoutFrac: 0.15,
    diggerFrac: 0.35,
    farmerFrac: 0.25,
    milkerFrac: 0.25,
    mushYieldRate: 1.2,
    milkYieldRate: 1.5,
    queenEggRate: 1.5,
    nuptialSurplusReq: 35,
    maxColonies: 6,
    foodPerMushroom: 8,
    foodPerMilk: 12
  };

  /* =========================================================
     5) Colony Architecture Planner
     - Defines structured shaft, chambers, & galleries
  ========================================================= */
  function getColonyArchitecturePlan(colony) {
    const plan = []; // {x, y, type: 'shaft'|'royal'|'nursery'|'mushroom'|'milk'|'pantry'}
    const hx = colony.homeX;
    const hy = colony.homeY;

    // 1) Main Vertical Shaft
    for (let y = SURFACE_WALK_Y + 1; y <= hy + 5; y++) {
      plan.push({ x: hx, y, type: 'shaft' });
    }

    // 2) Royal Chamber (Bottom)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        plan.push({ x: wrapX(hx + dx), y: hy + dy, type: 'royal' });
      }
    }

    // 3) Nursery Chamber (Mid-Deep)
    const nurseryY = hy - 12;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        plan.push({ x: wrapX(hx + dx), y: nurseryY + dy, type: 'nursery' });
      }
    }
    // Gallery connecting shaft to nursery
    for (let x = Math.min(hx, hx - 4); x <= Math.max(hx, hx + 4); x++) {
      plan.push({ x: wrapX(x), y: nurseryY, type: 'gallery' });
    }

    // 4) Mushroom Farm Chamber (Left Wing)
    const mushY = hy - 24;
    const mushX = wrapX(hx - 8);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -5; dx <= 0; dx++) {
        plan.push({ x: wrapX(mushX + dx), y: mushY + dy, type: 'mushroom' });
      }
    }
    // Lateral gallery from main shaft to Mushroom chamber
    for (let x = wrapX(hx - 13); x <= hx; x++) {
      plan.push({ x: wrapX(x), y: mushY, type: 'gallery' });
    }

    // 5) Aphid Milk Farm Chamber (Right Wing)
    const milkY = hy - 24;
    const milkX = wrapX(hx + 8);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = 0; dx <= 5; dx++) {
        plan.push({ x: wrapX(milkX + dx), y: milkY + dy, type: 'milk' });
      }
    }
    // Lateral gallery from main shaft to Milk chamber
    for (let x = hx; x <= wrapX(hx + 13); x++) {
      plan.push({ x: wrapX(x), y: milkY, type: 'gallery' });
    }

    // 6) Food Pantry / Granary (Upper Subsurface)
    const pantryY = hy - 34;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        plan.push({ x: wrapX(hx + dx), y: pantryY + dy, type: 'pantry' });
      }
    }
    // Gallery
    for (let x = wrapX(hx - 4); x <= wrapX(hx + 4); x++) {
      plan.push({ x: wrapX(x), y: pantryY, type: 'gallery' });
    }

    return plan;
  }

  function getNextDigTargetForAnt(a, colony) {
    const plan = getColonyArchitecturePlan(colony);
    let best = null;
    let bestDist = 9999;

    for (const p of plan) {
      if (isSoil(p.x, p.y)) {
        const d = wrappedDist(a.x, a.y, p.x, p.y);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
    }
    return best;
  }

  /* =========================================================
     6) Multi-Colony Management
  ========================================================= */
  const TEAM_COLORS = [
    "#ff8a3c", // 0: Orange
    "#4de2ff", // 1: Cyan
    "#a3ff5f", // 2: Lime Green
    "#ff5fe1", // 3: Magenta
    "#ffd25f", // 4: Yellow
    "#c75fff"  // 5: Purple
  ];

  function teamColor(team) {
    return TEAM_COLORS[team % TEAM_COLORS.length];
  }

  function createColony(team, homeX, homeY) {
    const c = {
      id: colonies.length + 1,
      team,
      homeX: wrapX(homeX),
      homeY: clamp(homeY, surfaceY + 25, H - 10),
      queenId: -1,
      phase: PHASE.FOUNDING,
      foodStore: 15,
      mushroomStore: 0,
      milkStore: 0,
      tunnelsDugCount: 0,
      chambersBuilt: 0,
      alatesProduced: 0,
      foreignFed: 0,
      nuptialFlights: 0,
      eggTimer: 0,
      naniticCount: 0,
      workerCount: 0,
      respawnAtGS: 0,
      founding: { entranceX: wrapX(homeX), entranceY: SURFACE_WALK_Y, sealed: false, dugToY: SURFACE_WALK_Y },
      mushFarmTiles: [],
      aphidFarmTiles: []
    };
    colonies.push(c);
    return c;
  }

  function allocTeam() {
    let t = 0;
    while (colonies.some(c => c.team === t)) t++;
    return t;
  }

  function respawnColony(team) {
    let c = colonies.find(cc => cc.team === team);
    if (!c) c = createColony(team, team === 0 ? W * 0.25 : W * 0.75, surfaceY + 45);
    if (c.queenId !== -1) return;

    c.founding.entranceX = c.homeX;
    c.founding.entranceY = SURFACE_WALK_Y;
    c.founding.sealed = false;
    c.founding.dugToY = SURFACE_WALK_Y;

    const q = spawnAnt(team, CASTE.QUEEN, c.homeX, SURFACE_WALK_Y);
    q.mem.wingsChewed = true;
    q.mem.founding = true;

    c.queenId = q.id;
    c.phase = PHASE.FOUNDING;
    c.foodStore = 15;
    c.eggTimer = 0;
    c.naniticCount = 0;
    c.workerCount = 0;
    c.respawnAtGS = 0;
  }

  /* =========================================================
     7) Simulation Logic & Spawning
  ========================================================= */
  function wrappedDist(x1, y1, x2, y2) {
    let dx = Math.abs(wrapX(x1) - wrapX(x2));
    dx = Math.min(dx, W - dx);
    return dx + Math.abs(y1 - y2);
  }

  function passableForAnt(x, y) {
    if (!inb(x, y)) return false;
    if (y === SURFACE_WALK_Y) return true;
    const t = tileAt(wrapX(x), y);
    return t === TILE.TUNNEL || t === TILE.MUSHROOM_FARM || t === TILE.APHID_FARM;
  }

  function spawnAnt(team, caste, x, y) {
    const a = {
      id: nextId++, team, caste, x: wrapX(x), y,
      hp: 100, hpMax: 100, e: 100, eMax: 100,
      atk: 6, def: 6,
      role: ROLE.IDLE, carried: null, carriedKind: null,
      moveT: 0, age: 0, hatchTime: 0,
      life: 2000 + Math.random() * 500,
      bornAtGS: gameSeconds,
      dieAtGS: gameSeconds + (45 * GS_DAY),
      mem: {}
    };

    if (caste === CASTE.QUEEN) {
      a.hpMax = 5000; a.hp = 5000; a.life = 999999;
      a.atk = 6; a.def = 18;
      a.dieAtGS = gameSeconds + (9999 * GS_YEAR);
    } else if (caste === CASTE.EGG) {
      a.hp = 20; a.hpMax = 20;
      a.hatchTime = 6 + Math.random() * 4;
      a.willBe = CASTE.NANITIC;
      a.dieAtGS = gameSeconds + (5 * GS_DAY);
    } else if (caste === CASTE.NANITIC) {
      a.hp = 60; a.hpMax = 60;
      a.role = ROLE.FORAGE;
      a.dieAtGS = gameSeconds + (20 * GS_DAY);
    } else if (caste === CASTE.WORKER) {
      a.hp = 100; a.hpMax = 100;
      a.role = ROLE.IDLE;
      a.dieAtGS = gameSeconds + (35 * GS_DAY);
    } else if (caste === CASTE.EXPLORER) {
      a.hp = 85; a.hpMax = 85;
      a.role = ROLE.SCOUT;
      a.dieAtGS = gameSeconds + (30 * GS_DAY);
    } else if (caste === CASTE.WARRIOR) {
      a.hp = 160; a.hpMax = 160;
      a.atk = 18; a.def = 18;
      a.role = ROLE.DEFEND;
      a.dieAtGS = gameSeconds + (25 * GS_DAY);
    } else if (caste === CASTE.MALE) {
      a.hp = 50; a.hpMax = 50;
      a.atk = 3; a.def = 3;
      a.role = ROLE.IDLE;
      a.dieAtGS = gameSeconds + (15 * GS_DAY);
    } else if (caste === CASTE.VIRGIN_QUEEN) {
      a.hp = 300; a.hpMax = 300;
      a.atk = 8; a.def = 12;
      a.role = ROLE.IDLE;
      a.dieAtGS = gameSeconds + (60 * GS_DAY);
    }

    ants.push(a);
    return a;
  }

  function spawnMob(type, x, y, opts = {}) {
    const base = (
      type === 'aphid' ? { hp: 40, atk: 0, def: 2, food: 8, life: 30 * GS_DAY } :
      type === 'worm' ? { hp: 120, atk: 6, def: 10, food: 12, life: 40 * GS_DAY } :
      type === 'mealworm' ? { hp: 55, atk: 5, def: 9, food: 10, life: 25 * GS_DAY } :
      type === 'beetle' ? { hp: 75, atk: 10, def: 10, food: 16, life: 18 * GS_DAY } :
      type === 'spider' ? { hp: 90, atk: 16, def: 8, food: 14, life: 22 * GS_DAY } :
      { hp: 50, atk: 10, def: 10, food: 10, life: 20 * GS_DAY }
    );

    const m = {
      id: nextId++,
      type,
      x: wrapX(x),
      y,
      stage: opts.stage || STAGE.ADULT,
      hp: base.hp,
      hpMax: base.hp,
      atk: base.atk,
      def: base.def,
      foodValue: base.food,
      moveT: 0,
      dead: false,
      e: 100,
      // stage multiplier applied below
      bornAtGS: gameSeconds,
      dieAtGS: gameSeconds + (opts.lifespanGS ?? base.life),
      milkTimer: 0
    };

    // Fix 1: apply stage multiplier (adults stronger)
    const sm = STAGE_MULT[m.stage] || STAGE_MULT[STAGE.ADULT];
    m.atk = Math.round(m.atk * sm.atk);
    m.def = Math.round(m.def * sm.def);

    mobs.push(m);
    return m;
  }

  function addRes(kind, x, y, extra = {}) {
    resources.push({ id: nextId++, kind, x: wrapX(x), y, amt: 10, dead: false, carried: false, ...extra });
  }

  /* =========================================================
     8) Simulation Step Engine
  ========================================================= */
  let mushGrowthTimer = 0;
  let aphidMilkTimer = 0;

  function tickSimulation(dt) {
    const gsdt = dt * GAME_SECONDS_PER_REAL_SECOND * simSpeed;
    gameSeconds += gsdt;

    const ph = currentPhase();

    // Pheromone Decay
    for (let x = 0; x < W; x++) {
      const i = idx(x, SURFACE_WALK_Y);
      pherFood[i] = Math.max(0, pherFood[i] - dt * 1.5);
    }

    // 1) Mushroom Farm Cultivation & Growth Engine 🍄
    mushGrowthTimer += dt * simSpeed;
    if (mushGrowthTimer >= 3.0) {
      mushGrowthTimer = 0;
      for (const c of colonies) {
        const plan = getColonyArchitecturePlan(c);
        const mushTiles = plan.filter(p => p.type === 'mushroom' && tileAt(p.x, p.y) === TILE.MUSHROOM_FARM);
        c.mushFarmTiles = mushTiles;

        for (const t of mushTiles) {
          if (Math.random() < 0.35 * CFG.mushYieldRate) {
            const hasMush = resources.some(r => !r.dead && !r.carried && r.kind === 'mushroom' && r.x === t.x && r.y === t.y);
            if (!hasMush) {
              addRes('mushroom', t.x, t.y);
            }
          }
        }
      }
    }

    // 2) Aphid Tending & Milk Production Engine 🥛
    aphidMilkTimer += dt * simSpeed;
    if (aphidMilkTimer >= 4.0) {
      aphidMilkTimer = 0;
      for (const m of mobs) {
        if (m.type === 'aphid' && !m.dead) {
          m.milkTimer += 1;
          if (m.milkTimer >= 2) {
            m.milkTimer = 0;
            const hasMilk = resources.some(r => !r.dead && !r.carried && r.kind === 'milk' && r.x === m.x && r.y === m.y);
            if (!hasMilk) {
              addRes('milk', m.x, m.y);
            }
          }
        }
      }
    }

    // 3) Ants Update Loop
    for (const a of ants) {
      if (a.hp <= 0) continue;
      if (a.dieAtGS && gameSeconds >= a.dieAtGS) { a.dead = true; continue; }

      a.moveT += dt * simSpeed;
      if (a.moveT > 0.12) {
        a.moveT = 0;
        stepAnt(a);
      }

      a.e -= dt * 0.2 * simSpeed;
      if (a.e <= 0) {
        a.hp -= dt * 1.5 * simSpeed;
      }
      if (a.hp <= 0) a.dead = true;
    }

    // Clean dead ants
    for (let i = ants.length - 1; i >= 0; i--) {
      if (ants[i].dead) {
        const dAnt = ants[i];
        addRes('corpse', dAnt.x, dAnt.y, { team: dAnt.team });
        ants.splice(i, 1);
      }
    }

    // 4) Mobs Update Loop
    for (const m of mobs) {
      if (m.hp <= 0) continue;
      m.moveT += dt * simSpeed;
      if (m.moveT > 0.20) {
        m.moveT = 0;
        stepMob(m);
      }
      // Fix 3: beetle energy drain framerate-independent
      if (m.type === 'beetle') m.e -= 0.6 * dt;
      if (m.hp <= 0) m.dead = true;
    }
    for (let i = mobs.length - 1; i >= 0; i--) {
      if (mobs[i].dead) {
        addRes('corpse', mobs[i].x, mobs[i].y);
        mobs.splice(i, 1);
      }
    }

    // Fix 4: enforce mob population caps
    let _bc = 0, _wc = 0;
    for (const m of mobs) { if (m.type === 'beetle') _bc++; if (m.type === 'worm') _wc++; }
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      if (m.type === 'beetle' && _bc > MOB_CAP.beetles) { mobs.splice(i, 1); _bc--; }
      else if (m.type === 'worm' && _wc > MOB_CAP.worms) { mobs.splice(i, 1); _wc--; }
    }

    // 5) Spawners: Trees, Plants, Aphids, Leaves
    if (Math.random() < 0.08 * simSpeed) {
      if (resources.filter(r => r.kind === 'leaf').length < 35) {
        addRes('leaf', irand(5, W - 5), SURFACE_WALK_Y);
      }
      if (mobs.filter(m => m.type === 'aphid').length < 15) {
        spawnMob('aphid', irand(10, W - 10), SURFACE_WALK_Y);
      }
    }

    // Fix 6: mealworm breeding — cap at 12
    if (Math.random() < 0.02 * simSpeed) {
      const mealworms = mobs.filter(m => m.type === 'mealworm' && !m.dead);
      if (mealworms.length < 12) {
        spawnMob('mealworm', irand(5, W - 5), SURFACE_WALK_Y + irand(2, 8));
      }
    }
  }

  /* =========================================================
     9) Individual Ant Behavior Machine
  ========================================================= */
  function stepAnt(a) {
    const c = colonies.find(cc => cc.team === a.team);
    if (!c) return;

    // === EGG: Hatching ===
    if (a.caste === CASTE.EGG) {
      a.age += 0.15 * simSpeed;
      if (a.age >= a.hatchTime) {
        a.caste = a.willBe || CASTE.WORKER;
        a.age = 0;
        if (a.caste === CASTE.WORKER) c.workerCount++;
        else if (a.caste === CASTE.NANITIC) c.naniticCount++;
      }
      return;
    }

    // === QUEEN: Laying Eggs & Managing Phases ===
    if (a.caste === CASTE.QUEEN) {
      c.eggTimer += 0.15 * simSpeed * CFG.queenEggRate;

      // Founding Shaft & Seal
      if (a.mem.founding) {
        const ex = c.founding.entranceX;
        if (a.y < c.homeY) {
          const ny = a.y + 1;
          setTile(ex, ny, TILE.TUNNEL);
          a.x = ex; a.y = ny;
          c.founding.dugToY = ny;
          return;
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setTile(wrapX(ex + dx), c.homeY + dy, TILE.TUNNEL);
          }
        }
        a.x = ex; a.y = c.homeY;
        a.mem.founding = false;
      }

      // Laying logic based on colony phase
      if (c.phase === PHASE.FOUNDING) {
        if (c.eggTimer > 2.5 && c.foodStore >= 1) {
          const egg = spawnAnt(a.team, CASTE.EGG, a.x, a.y);
          egg.willBe = CASTE.NANITIC;
          c.foodStore -= 1;
          c.eggTimer = 0;
        }
        if (c.naniticCount >= 2) c.phase = PHASE.NANITIC;
      } else if (c.phase === PHASE.NANITIC) {
        if (c.foodStore >= 12) {
          c.phase = PHASE.GROWING;
        }
      } else if (c.phase === PHASE.GROWING) {
        if (c.eggTimer > 2.0 && c.foodStore >= 2) {
          const egg = spawnAnt(a.team, CASTE.EGG, a.x, a.y);
          egg.willBe = CASTE.WORKER;
          c.foodStore -= 2;
          c.eggTimer = 0;
        }
        if (c.workerCount >= 8) {
          // Spawn Explorers
          for (let k = 0; k < 3; k++) spawnAnt(a.team, CASTE.EXPLORER, a.x, a.y);
          c.phase = PHASE.MATURE;
        }
      } else if (c.phase === PHASE.MATURE || c.phase === PHASE.EXPANDING) {
        // Lay Workers, Warriors, Virgin Queens & Male Alates
        if (c.eggTimer > 1.8 && c.foodStore >= 2) {
          const egg = spawnAnt(a.team, CASTE.EGG, a.x, a.y);

          // Fix 5: warrior unlock — foreignFed > 0 OR colony >= 60 OR elapsed >= 300s
          const _colSize = ants.filter(a2 => a2.team === a.team).length;
          const _canWarrior = c.foreignFed > 0 || _colSize >= 60 || gameSeconds >= 300;

          // Produce Alates (Virgin Queens & Males) when food surplus > nuptialSurplusReq
          if (c.foodStore > CFG.nuptialSurplusReq && Math.random() < 0.25) {
            if (Math.random() < 0.5) {
              egg.willBe = CASTE.VIRGIN_QUEEN;
            } else {
              egg.willBe = CASTE.MALE;
            }
            c.alatesProduced++;
          } else if (_canWarrior && c.foodStore > 20 && Math.random() < 0.12) {
            egg.willBe = CASTE.WARRIOR;
          } else {
            egg.willBe = CASTE.WORKER;
          }
          c.foodStore -= 2;
          c.eggTimer = 0;
        }
      }
      return;
    }

    // === VIRGIN QUEEN & MALE: Nuptial Flight & Founding New Colony ===
    if (a.caste === CASTE.VIRGIN_QUEEN || a.caste === CASTE.MALE) {
      const ph = currentPhase();

      // Step 1: Head to surface for Nuptial Flight during clear daytime
      if (a.role !== ROLE.NUPTIAL_FLIGHT) {
        if (ph.isDay && weather.kind === WEATHER.CLEAR) {
          a.role = ROLE.NUPTIAL_FLIGHT;
        } else {
          // Wander near pantry/nursery
          moveToward(a, c.homeX, c.homeY - 10);
          return;
        }
      }

      if (a.role === ROLE.NUPTIAL_FLIGHT) {
        // Fly up to surface / sky
        if (a.y > SURFACE_WALK_Y - 5) {
          a.y -= 1;
          a.x = wrapX(a.x + choice([-1, 1]));
          return;
        }

        // Mid-Air Nuptial Flight & Mating
        if (a.caste === CASTE.VIRGIN_QUEEN) {
          // Look for male ant on surface/sky
          const maleNearby = ants.find(m => m.team === a.team && m.caste === CASTE.MALE && Math.abs(wrapX(m.x) - wrapX(a.x)) < 5);
          if (maleNearby) {
            // Mating Successful!
            maleNearby.dead = true; // Male fulfilled destiny

            // Fly across world to establish NEW COLONY
            let newX = wrapX(a.x + irand(40, 80));
            // Ensure distance from existing colonies
            while (colonies.some(cc => wrappedDist(newX, SURFACE_WALK_Y, cc.homeX, SURFACE_WALK_Y) < 30)) {
              newX = wrapX(newX + 20);
            }

            // Create New Colony!
            const newTeam = allocTeam();
            const newCol = createColony(newTeam, newX, surfaceY + 45);

            // Convert Virgin Queen into Queen of New Colony
            a.caste = CASTE.QUEEN;
            a.team = newTeam;
            a.x = newX;
            a.y = SURFACE_WALK_Y;
            a.mem.founding = true;
            newCol.queenId = a.id;
            c.nuptialFlights++;
            return;
          }
        } else if (a.caste === CASTE.MALE) {
          // Male flies around searching for virgin queen
          a.x = wrapX(a.x + choice([-1, 1]));
          if (Math.random() < 0.05) a.dead = true;
        }
      }
      return;
    }

    // === NANITIC / WORKER: Digging, Hauling, Mushroom & Milk Farming ===
    if (a.caste === CASTE.WORKER || a.caste === CASTE.NANITIC) {
      stepWorkerOrNanitic(a, c);
      return;
    }

    // === EXPLORER: Scouting & Pheromone Trails ===
    if (a.caste === CASTE.EXPLORER) {
      stepExplorer(a, c);
      return;
    }

    // === WARRIOR: Defense ===
    if (a.caste === CASTE.WARRIOR) {
      stepWarrior(a, c);
      return;
    }
  }

  function stepWorkerOrNanitic(a, c) {
    // 1) Role Assignment when Idle
    if (a.role === ROLE.IDLE) {
      // Dynamic Caste Allocation based on Colony Needs
      const plan = getColonyArchitecturePlan(c);
      const unDugTarget = getNextDigTargetForAnt(a, c);
      const foodNeed = c.foodStore < 15;
      const mushChambersDug = plan.some(p => p.type === 'mushroom' && tileAt(p.x, p.y) === TILE.TUNNEL);
      const milkChambersDug = plan.some(p => p.type === 'milk' && tileAt(p.x, p.y) === TILE.TUNNEL);

      if (foodNeed) {
        // High priority: Forage / Harvest Mushrooms / Milk Aphids
        if (mushChambersDug && Math.random() < 0.4) {
          a.role = ROLE.FARM_MUSHROOM;
        } else if (milkChambersDug && Math.random() < 0.4) {
          a.role = ROLE.MILK_APHID;
        } else {
          a.role = ROLE.FORAGE;
        }
      } else if (unDugTarget && Math.random() < CFG.diggerFrac) {
        // Dig Tunnel Array
        a.role = ROLE.DIG;
      } else if (mushChambersDug && Math.random() < CFG.farmerFrac) {
        a.role = ROLE.FARM_MUSHROOM;
      } else if (milkChambersDug && Math.random() < CFG.milkerFrac) {
        a.role = ROLE.MILK_APHID;
      } else {
        a.role = ROLE.FORAGE;
      }
    }

    // 2) Role Execution
    if (a.role === ROLE.DIG) {
      const target = getNextDigTargetForAnt(a, c);
      if (target) {
        moveToward(a, target.x, target.y);
        if (wrappedDist(a.x, a.y, target.x, target.y) <= 1) {
          // Convert soil to tunnel
          if (target.type === 'mushroom') {
            setTile(target.x, target.y, TILE.MUSHROOM_FARM); // Mushroom Garden Tile!
          } else if (target.type === 'milk') {
            setTile(target.x, target.y, TILE.APHID_FARM); // Aphid Farm Tile!
          } else {
            setTile(target.x, target.y, TILE.TUNNEL);
          }

          c.tunnelsDugCount++;
          addRes('dirt', a.x, a.y);
          a.role = ROLE.HAUL_DIRT;
          const dirtRes = resources.find(r => r.kind === 'dirt' && r.x === a.x && r.y === a.y && !r.carried);
          if (dirtRes) pickUp(a, dirtRes);
        }
      } else {
        a.role = ROLE.IDLE;
      }
      return;
    }

    if (a.role === ROLE.HAUL_DIRT) {
      if (!a.carried) {
        a.role = ROLE.IDLE;
        return;
      }
      // Haul dirt to surface to build Ant Hill Mound
      if (a.y <= SURFACE_WALK_Y) {
        dropCarried(a);
        a.role = ROLE.IDLE;
      } else {
        moveToward(a, c.homeX, SURFACE_WALK_Y);
      }
      return;
    }

    if (a.role === ROLE.FARM_MUSHROOM) {
      // Bring leaves to mushroom farm tiles OR harvest grown mushrooms 🍄
      if (a.carried) {
        if (a.carriedKind === 'leaf') {
          // Carry leaf to Mushroom Chamber
          const plan = getColonyArchitecturePlan(c);
          const mushTile = plan.find(p => p.type === 'mushroom');
          const tx = mushTile ? mushTile.x : c.homeX;
          const ty = mushTile ? mushTile.y : c.homeY;
          moveToward(a, tx, ty);
          if (wrappedDist(a.x, a.y, tx, ty) <= 2) {
            setTile(a.x, a.y, TILE.MUSHROOM_FARM);
            dropCarried(a);
            c.foodStore += 4;
            a.role = ROLE.IDLE;
          }
        } else if (a.carriedKind === 'mushroom') {
          // Carry mushroom to Pantry / Queen
          moveToward(a, c.homeX, c.homeY);
          if (wrappedDist(a.x, a.y, c.homeX, c.homeY) <= 2) {
            c.foodStore += CFG.foodPerMushroom;
            c.mushroomStore += 1;
            dropCarried(a);
            a.role = ROLE.IDLE;
          }
        } else {
          dropCarried(a);
          a.role = ROLE.IDLE;
        }
      } else {
        // Look for grown mushrooms first
        const mush = resources.find(r => !r.dead && !r.carried && r.kind === 'mushroom');
        if (mush) {
          moveToward(a, mush.x, mush.y);
          if (a.x === mush.x && a.y === mush.y) pickUp(a, mush);
        } else {
          // Get leaves from surface to build more mushroom beds
          const leaf = findNearestResource(a, ['leaf']);
          if (leaf) {
            moveToward(a, leaf.x, leaf.y);
            if (a.x === leaf.x && a.y === leaf.y) pickUp(a, leaf);
          } else {
            a.role = ROLE.FORAGE;
          }
        }
      }
      return;
    }

    if (a.role === ROLE.MILK_APHID) {
      // Harvest milk droplets 🥛 from aphids
      if (a.carried) {
        if (a.carriedKind === 'milk') {
          moveToward(a, c.homeX, c.homeY);
          if (wrappedDist(a.x, a.y, c.homeX, c.homeY) <= 2) {
            c.foodStore += CFG.foodPerMilk;
            c.milkStore += 1;
            dropCarried(a);
            a.role = ROLE.IDLE;
          }
        } else {
          dropCarried(a);
          a.role = ROLE.IDLE;
        }
      } else {
        const milk = resources.find(r => !r.dead && !r.carried && r.kind === 'milk');
        if (milk) {
          moveToward(a, milk.x, milk.y);
          if (a.x === milk.x && a.y === milk.y) pickUp(a, milk);
        } else {
          // Visit nearest aphid
          const aphid = mobs.find(m => m.type === 'aphid' && !m.dead);
          if (aphid) {
            moveToward(a, aphid.x, aphid.y);
          } else {
            a.role = ROLE.FORAGE;
          }
        }
      }
      return;
    }

    if (a.role === ROLE.FORAGE) {
      if (a.carried) {
        moveToward(a, c.homeX, c.homeY);
        if (wrappedDist(a.x, a.y, c.homeX, c.homeY) <= 2) {
          c.foodStore += 6;
          dropCarried(a);
          a.role = ROLE.IDLE;
        }
      } else {
        const food = findNearestResource(a, ['leaf', 'protein', 'corpse', 'apple', 'mushroom', 'milk']);
        if (food) {
          moveToward(a, food.x, food.y);
          if (a.x === food.x && a.y === food.y) pickUp(a, food);
        } else {
          if (a.y > SURFACE_WALK_Y) moveToward(a, a.x, SURFACE_WALK_Y);
          else wanderSurface(a);
        }
      }
      return;
    }
  }

  function stepExplorer(a, c) {
    if (a.carried) {
      addPherFood(a.x, a.y, 8.0);
      moveToward(a, c.homeX, c.homeY);
      if (wrappedDist(a.x, a.y, c.homeX, c.homeY) <= 2) {
        c.foodStore += 6;
        dropCarried(a);
      }
    } else {
      const food = findNearestResource(a, ['leaf', 'protein', 'corpse', 'apple']);
      if (food) {
        moveToward(a, food.x, food.y);
        if (a.x === food.x && a.y === food.y) pickUp(a, food);
      } else {
        wanderSurface(a);
      }
    }
  }

  function stepWarrior(a, c) {
    // Defend colony and attack hostile mobs
    const enemyMob = mobs.find(m => !m.dead && wrappedDist(a.x, a.y, m.x, m.y) < 6);
    if (enemyMob) {
      moveToward(a, enemyMob.x, enemyMob.y);
      if (a.x === enemyMob.x && a.y === enemyMob.y) {
        // Fix 2: symmetric combat formulas
        enemyMob.hp -= Math.max(1, a.atk - enemyMob.def * 0.1);
        a.hp -= Math.max(0, enemyMob.atk - a.def * 0.1);
      }
    } else {
      moveToward(a, c.homeX, SURFACE_WALK_Y);
    }
  }

  function moveToward(a, tx, ty) {
    let dx = tx - a.x;
    if (Math.abs(dx) > W / 2) dx = dx > 0 ? dx - W : dx + W;

    const dirs = [];
    if (dx > 0) dirs.push([1, 0]);
    else if (dx < 0) dirs.push([-1, 0]);
    if (ty > a.y) dirs.push([0, 1]);
    else if (ty < a.y) dirs.push([0, -1]);

    if (dirs.length === 0) return;

    for (const d of dirs) {
      const nx = wrapX(a.x + d[0]);
      const ny = a.y + d[1];
      if (passableForAnt(nx, ny)) {
        a.x = nx; a.y = ny;
        return;
      } else if (isSoil(nx, ny) && a.caste === CASTE.WORKER && Math.random() < 0.25) {
        setTile(nx, ny, TILE.TUNNEL);
        a.x = nx; a.y = ny;
        return;
      }
    }

    // Random fallback step
    const d = choice([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    const nx = wrapX(a.x + d[0]);
    const ny = a.y + d[1];
    if (passableForAnt(nx, ny)) {
      a.x = nx; a.y = ny;
    }
  }

  function wanderSurface(a) {
    const dir = choice([-1, 1]);
    const nx = wrapX(a.x + dir);
    a.x = nx;
    a.y = SURFACE_WALK_Y;
  }

  function findNearestResource(a, kinds) {
    let best = null;
    let bestDist = 99999;
    for (const r of resources) {
      if (r.dead || r.carried) continue;
      if (!kinds.includes(r.kind)) continue;
      const d = wrappedDist(a.x, a.y, r.x, r.y);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return best;
  }

  function pickUp(a, r) {
    if (a.carried || r.carried) return;
    a.carried = r;
    a.carriedKind = r.kind;
    r.carried = true;
  }

  function dropCarried(a) {
    if (!a.carried) return;
    const r = a.carried;
    r.carried = false;
    r.x = a.x;
    r.y = a.y;
    const idxRes = resources.indexOf(r);
    if (idxRes > -1) resources.splice(idxRes, 1);
    a.carried = null;
    a.carriedKind = null;
  }

  function stepMob(m) {
    if (m.type === 'aphid') {
      // Aphids wander on plants/soil and produce honeydew milk
      if (Math.random() < 0.3) m.x = wrapX(m.x + choice([-1, 1]));
    } else {
      m.x = wrapX(m.x + choice([-1, 1]));
    }
  }

  /* =========================================================
     10) Auto-Balance & Respawn Logic
  ========================================================= */
  let balanceTimer = 0;
  function autoBalance(dt) {
    balanceTimer += dt;
    if (balanceTimer < 2.0) return;
    balanceTimer = 0;

    // Fix 7: only rebalance/respawn if total ants below 2000 (raised from 500)
    const totalAnts = ants.length;
    if (totalAnts >= 2000) return;

    for (const c of colonies) {
      if (c.queenId !== -1) {
        const qAlive = ants.some(a => a.id === c.queenId && a.caste === CASTE.QUEEN);
        if (!qAlive) {
          c.queenId = -1;
          if (!c.respawnAtGS) c.respawnAtGS = gameSeconds + GAME_DAY_SECONDS;
        }
      }
      if (c.queenId === -1 && gameSeconds >= (c.respawnAtGS || 0)) {
        respawnColony(c.team);
      }
    }
  }

  function resetWorld() {
    ants.length = 0;
    mobs.length = 0;
    resources.length = 0;
    plants.length = 0;
    trees.length = 0;
    colonies.length = 0;
    genWorld();
  }

  function genWorld() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let i = idx(x, y);
        tile[i] = (y < surfaceY) ? TILE.AIR : TILE.SOIL;
        moisture[i] = (y < surfaceY) ? 0 : 0.5;
        water[i] = 0;
        rootMass[i] = 0;
        fertility[i] = 0;
        if (y > surfaceY + 12 && Math.random() < 0.04) tile[i] = TILE.ROCKS;
      }
    }

    // Initial 2 Colonies
    createColony(0, W * 0.25, surfaceY + 45);
    createColony(1, W * 0.75, surfaceY + 45);

    respawnColony(0);
    respawnColony(1);

    // Surface flora
    for (let x = 0; x < W; x += 5) {
      if (Math.random() < 0.6) plants.push({ x, e: 10 });
    }
  }

  /* =========================================================
     11) Balance Lab Simulation & Report Runner
  ========================================================= */
  function runBalanceLabSimulation(numRuns = 3, stepsPerRun = 5000) {
    const report = {
      timestamp: new Date().toLocaleTimeString(),
      runs: numRuns,
      stepsPerRun,
      avgTunnelsDug: 0,
      avgMushroomsHarvested: 0,
      avgMilkHarvested: 0,
      avgAlatesProduced: 0,
      avgNuptialFlights: 0,
      totalColoniesFounded: 0,
      stabilityScore: 0
    };

    let totalTunnels = 0;
    let totalMush = 0;
    let totalMilk = 0;
    let totalAlates = 0;
    let totalFlights = 0;

    for (let r = 0; r < numRuns; r++) {
      resetWorld();
      for (let s = 0; s < stepsPerRun; s++) {
        tickSimulation(0.05);
      }

      for (const c of colonies) {
        totalTunnels += c.tunnelsDugCount;
        totalMush += c.mushroomStore;
        totalMilk += c.milkStore;
        totalAlates += c.alatesProduced;
        totalFlights += c.nuptialFlights;
      }
    }

    report.avgTunnelsDug = Math.round(totalTunnels / numRuns);
    report.avgMushroomsHarvested = Math.round(totalMush / numRuns);
    report.avgMilkHarvested = Math.round(totalMilk / numRuns);
    report.avgAlatesProduced = Math.round(totalAlates / numRuns);
    report.avgNuptialFlights = Math.round(totalFlights / numRuns);
    report.totalColoniesFounded = colonies.length;
    report.stabilityScore = Math.min(100, Math.round((report.avgMushroomsHarvested + report.avgMilkHarvested + report.avgNuptialFlights * 10) * 1.5));

    // Auto-tune parameters based on results
    if (report.avgTunnelsDug < 30) CFG.diggerFrac = Math.min(0.6, CFG.diggerFrac + 0.05);
    if (report.avgMushroomsHarvested < 5) CFG.mushYieldRate = Math.min(3.0, CFG.mushYieldRate + 0.3);
    if (report.avgMilkHarvested < 5) CFG.milkYieldRate = Math.min(3.0, CFG.milkYieldRate + 0.3);

    return report;
  }

  /* =========================================================
     12) Canvas Renderer
  ========================================================= */
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  let DPR = 1;
  function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(innerWidth * DPR);
    canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  const camera = {
    x: W / 2, y: H / 2,
    scale: 8.0,
    minScale: 3.5,
    maxScale: 25.0
  };

  function worldToScreen(wx, wy) {
    const sx = (wx - camera.x) * camera.scale + innerWidth * 0.5;
    const sy = (wy - camera.y) * camera.scale + innerHeight * 0.5;
    return { sx, sy };
  }

  let draggingCam = false;
  let lastMX = 0, lastMY = 0;
  canvas.addEventListener("mousedown", (e) => {
    draggingCam = true;
    lastMX = e.clientX; lastMY = e.clientY;
  });
  addEventListener("mouseup", () => draggingCam = false);
  addEventListener("mousemove", (e) => {
    if (!draggingCam) return;
    const dx = e.clientX - lastMX;
    const dy = e.clientY - lastMY;
    lastMX = e.clientX; lastMY = e.clientY;
    camera.x -= dx / camera.scale;
    camera.y -= dy / camera.scale;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    camera.scale = clamp(camera.scale * factor, camera.minScale, camera.maxScale);
  }, { passive: false });

  function draw() {
    const ph = currentPhase();
    ctx.fillStyle = ph.isNight ? "#060914" : "#4ba3e3";
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    const startX = Math.floor(camera.x - (innerWidth / camera.scale) / 2) - 2;
    const endX = Math.floor(camera.x + (innerWidth / camera.scale) / 2) + 2;
    const startY = Math.floor(camera.y - (innerHeight / camera.scale) / 2) - 20;
    const endY = Math.floor(camera.y + (innerHeight / camera.scale) / 2) + 20;

    // 1) Terrain Render
    for (let y = Math.max(0, startY); y < Math.min(H, endY); y++) {
      for (let x = startX; x <= endX; x++) {
        let t = tileAt(x, y);
        if (t === TILE.AIR) continue;

        let s = worldToScreen(x, y);
        if (s.sx < -50 || s.sx > innerWidth + 50 || s.sy < -50 || s.sy > innerHeight + 50) continue;

        if (t === TILE.SOIL) ctx.fillStyle = "#3b2b20";
        else if (t === TILE.TUNNEL) ctx.fillStyle = "#150e09";
        else if (t === TILE.MUSHROOM_FARM) ctx.fillStyle = "#2a1c2b"; // Dark fungal purple
        else if (t === TILE.APHID_FARM) ctx.fillStyle = "#1b2a20"; // Dark aphid green
        else if (t >= TILE.ROCKS) ctx.fillStyle = "#4a4a52";

        ctx.fillRect(Math.floor(s.sx), Math.floor(s.sy), Math.ceil(camera.scale), Math.ceil(camera.scale));
      }
    }

    // 2) Entities Render
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.floor(camera.scale * 1.5)}px sans-serif`;

    // Plants & Surface Flora
    for (const p of plants) {
      const s = worldToScreen(p.x, SURFACE_WALK_Y);
      if (s.sx >= -50 && s.sx <= innerWidth + 50) ctx.fillText("🌿", s.sx, s.sy - camera.scale);
    }

    // Resources
    for (const r of resources) {
      const s = worldToScreen(r.x, r.y);
      if (s.sx < -50 || s.sx > innerWidth + 50) continue;
      let char = "❓";
      if (r.kind === 'leaf') char = EMOJI.LEAF;
      else if (r.kind === 'mushroom') char = EMOJI.MUSHROOM;
      else if (r.kind === 'milk') char = EMOJI.MILK;
      else if (r.kind === 'protein') char = EMOJI.PROTEIN;
      else if (r.kind === 'corpse') char = "💀";
      else if (r.kind === 'dirt') char = "🪨";
      ctx.fillText(char, s.sx, s.sy);
    }

    // Mobs (Aphids, Beetles, Worms)
    for (const m of mobs) {
      const s = worldToScreen(m.x, m.y);
      if (s.sx < -50 || s.sx > innerWidth + 50) continue;
      if (m.type === 'aphid') ctx.fillText(EMOJI.APHID, s.sx, s.sy);
      else if (m.type === 'beetle') ctx.fillText(EMOJI.BEETLE, s.sx, s.sy);
      else if (m.type === 'worm') ctx.fillText(EMOJI.WORM, s.sx, s.sy);
      else if (m.type === 'spider') ctx.fillText(EMOJI.SPIDER, s.sx, s.sy);
    }

    // Ants & Colony Markers
    for (const a of ants) {
      const s = worldToScreen(a.x, a.y);
      if (s.sx < -50 || s.sx > innerWidth + 50) continue;

      if (a.caste === CASTE.QUEEN) {
        ctx.font = `${Math.floor(camera.scale * 2.2)}px sans-serif`;
        ctx.fillText(EMOJI.ANT, s.sx, s.sy);
        ctx.fillText("👑", s.sx, s.sy - camera.scale * 1.1);
        ctx.font = `${Math.floor(camera.scale * 1.5)}px sans-serif`;
      } else if (a.caste === CASTE.VIRGIN_QUEEN) {
        ctx.font = `${Math.floor(camera.scale * 1.8)}px sans-serif`;
        ctx.fillText(EMOJI.ANT, s.sx, s.sy);
        ctx.fillText("👑✨", s.sx, s.sy - camera.scale);
        ctx.font = `${Math.floor(camera.scale * 1.5)}px sans-serif`;
      } else if (a.caste === CASTE.MALE) {
        ctx.fillText(EMOJI.ANT, s.sx, s.sy);
        ctx.fillText("♂️", s.sx + camera.scale * 0.4, s.sy - camera.scale * 0.4);
      } else if (a.caste === CASTE.EGG) {
        ctx.fillStyle = teamColor(a.team);
        ctx.beginPath();
        ctx.arc(s.sx, s.sy, camera.scale * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillText(EMOJI.ANT, s.sx, s.sy);
      }

      // Team Indicator
      if (a.caste !== CASTE.EGG) {
        ctx.beginPath();
        ctx.fillStyle = teamColor(a.team);
        ctx.arc(s.sx + camera.scale * 0.4, s.sy + camera.scale * 0.4, camera.scale * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* =========================================================
     13) UI Status & Report Updates
  ========================================================= */
  function updateUI() {
    const totalAnts = ants.filter(a => a.caste !== CASTE.EGG).length;
    const totalEggs = ants.filter(a => a.caste === CASTE.EGG).length;
    const activeColoniesCount = colonies.length;
    const totalMushrooms = resources.filter(r => r.kind === 'mushroom').length;
    const totalMilk = resources.filter(r => r.kind === 'milk').length;
    const activeAlates = ants.filter(a => a.caste === CASTE.VIRGIN_QUEEN || a.caste === CASTE.MALE).length;

    // Update Status Bar
    const stColonies = document.getElementById('stat_colonies');
    const stAnts = document.getElementById('stat_orange');
    const stMush = document.getElementById('diag_food');
    const stTunnel = document.getElementById('diag_tunnel');

    if (stAnts) stAnts.textContent = `Ants: ${totalAnts} (${totalEggs}🥚) | Colonies: ${activeColoniesCount}`;
    if (stMush) stMush.textContent = `🍄 ${totalMushrooms} | 🥛 ${totalMilk}`;
    if (stTunnel) stTunnel.textContent = `Alates: ${activeAlates}`;

    if (stColonies) {
      const colonyDetails = colonies.map(c => {
        const pop = ants.filter(a => a.team === c.team && a.caste !== CASTE.EGG).length;
        return `Colony #${c.id} (Team ${c.team}): Pop ${pop} | Food ${Math.floor(c.foodStore)} | 🍄 ${c.mushroomStore} | 🥛 ${c.milkStore} | Nuptial Flights: ${c.nuptialFlights}`;
      }).join('\n');
      stColonies.textContent = colonyDetails;
    }
  }

  /* =========================================================
     14) Main Application Loop & Bindings
  ========================================================= */
  let lastT = 0;
  function loop(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;

    try {
      tickSimulation(dt);
      autoBalance(dt);
      draw();
      updateUI();
    } catch (e) {
      console.error("Simulation error:", e);
    }

    requestAnimationFrame(loop);
  }

  // Initialize Simulation & Expose Lab Interface
  genWorld();
  requestAnimationFrame(loop);

  window.SWARM_LAB = {
    runSimulation: (runs, steps) => runBalanceLabSimulation(runs, steps),
    reset: () => resetWorld(),
    setSpeed: (spd) => { simSpeed = spd; },
    getColonies: () => colonies
  };

})();
