// physics-sim.js — Headless curling physics simulator
// Extracts the exact same physics as the game component.
// No React, no Canvas — pure computation.

const PI = Math.PI;
const ROCK_RADIUS = 5;

const WORLD = {
  sheetHalfWidth: 82, sheetStart: 50, sheetEnd: -680, hogLine: -380,
  tLine: -540, backLine: -612, hackPos: -100,
  houseCenter: { x: -540, y: 0 }, houseRadii: [6, 24, 48, 72],
};

const GRID_COLS = 48, GRID_ROWS = 16;
const GRID_X_MIN = WORLD.sheetEnd, GRID_X_MAX = WORLD.sheetStart;
const GRID_Y_MIN = -WORLD.sheetHalfWidth, GRID_Y_MAX = WORLD.sheetHalfWidth;
const CELL_W = (GRID_X_MAX - GRID_X_MIN) / GRID_COLS;
const CELL_H = (GRID_Y_MAX - GRID_Y_MIN) / GRID_ROWS;
const CURL_SAMPLE_OFFSET = ROCK_RADIUS * 0.8;

const DEFAULTS = {
  baseFriction: 0.08, pebbleFrictionBonus: 0.07, curlCoeff: 40,
  gradientCoeff: 8, slopeGravity: 18, frictionDecel: 5,
  speedScale: 60, wearRate: 0.0015, sweepBoost: 0.15,
};

function createCell() {
  return { pebbleHeight: 1.0, temperature: 0, moisture: 0, slopeX: 0, slopeY: 0 };
}

function cellFriction(cell, bf, pb) {
  return Math.max(0.02, bf + cell.pebbleHeight * pb - cell.moisture * 0.03 + cell.temperature * 0.002);
}

class IceGrid {
  constructor() {
    this.cells = [];
    for (let c = 0; c < GRID_COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < GRID_ROWS; r++) this.cells[c][r] = createCell();
    }
  }
  _bilinear(wx, wy, fn) {
    const fx = (wx - GRID_X_MIN) / CELL_W - 0.5, fy = (wy - GRID_Y_MIN) / CELL_H - 0.5;
    const c0 = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - c0)), ty = Math.max(0, Math.min(1, fy - r0));
    return fn(this.cells[c0][r0])*(1-tx)*(1-ty) + fn(this.cells[c0+1][r0])*tx*(1-ty) +
           fn(this.cells[c0][r0+1])*(1-tx)*ty + fn(this.cells[c0+1][r0+1])*tx*ty;
  }
  toGrid(wx, wy) {
    return [Math.max(0, Math.min(GRID_COLS-1, Math.floor((wx-GRID_X_MIN)/CELL_W))),
            Math.max(0, Math.min(GRID_ROWS-1, Math.floor((wy-GRID_Y_MIN)/CELL_H)))];
  }
  sampleFriction(wx, wy, bf, pb) { return this._bilinear(wx, wy, c => cellFriction(c, bf, pb)); }
  sampleSlope(wx, wy) {
    return { sx: this._bilinear(wx, wy, c => c.slopeX), sy: this._bilinear(wx, wy, c => c.slopeY) };
  }
  applyWear(wx, wy, dt, isSweeping, wearRate) {
    const [c, r] = this.toGrid(wx, wy);
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const cc = c+dc, rr = r+dr;
      if (cc < 0 || cc >= GRID_COLS || rr < 0 || rr >= GRID_ROWS) continue;
      const w = (dc === 0 && dr === 0) ? 1.0 : 0.3;
      const cell = this.cells[cc][rr];
      cell.pebbleHeight = Math.max(0, cell.pebbleHeight - wearRate * w * dt);
      if (isSweeping) {
        cell.pebbleHeight = Math.max(0, cell.pebbleHeight - wearRate*2.5*w*dt);
        cell.moisture = Math.min(1, cell.moisture + 0.05*w*dt);
      }
    }
  }
  evaporateMoisture(dt) {
    for (let c = 0; c < GRID_COLS; c++) for (let r = 0; r < GRID_ROWS; r++) {
      const cell = this.cells[c][r];
      if (cell.moisture > 0) cell.moisture = Math.max(0, cell.moisture - 0.008*dt);
    }
  }
}

// --- Ice profiles (same as game) ---
const ICE_PROFILES = {
  championship: { name: "Championship", init: () => {} },
  club: { name: "Club Ice", init: (grid) => {
    for (let c = 0; c < GRID_COLS; c++) for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid.cells[c][r], yN = (r - GRID_ROWS/2) / (GRID_ROWS/2);
      cell.slopeY = -yN * 0.0012;
      if (Math.abs(yN) < 0.3) cell.pebbleHeight -= 0.12 * (1 - Math.abs(yN)/0.3);
    }
  }},
  arena: { name: "Arena", init: (grid) => {
    for (let c = 0; c < GRID_COLS; c++) for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid.cells[c][r]; cell.temperature = -1.5;
      const yW = GRID_Y_MIN + (r+0.5)*CELL_H, xW = GRID_X_MIN + (c+0.5)*CELL_W;
      if (Math.abs(yW-25) < 8) { cell.temperature -= 2; cell.pebbleHeight -= 0.12; cell.slopeY = 0.0012; }
      if (xW < -500 && yW > 40) { cell.slopeY = -0.003; cell.slopeX = -0.001; }
    }
  }},
  swingy: { name: "Swingy", init: (grid) => {
    for (let c = 0; c < GRID_COLS; c++) for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid.cells[c][r], yN = (r - GRID_ROWS/2) / (GRID_ROWS/2);
      cell.slopeY = -yN * 0.003; cell.pebbleHeight = 1.2;
    }
  }},
};

/**
 * Simulate a single rock delivery.
 *
 * @param {Object} opts
 * @param {number} opts.aim       - Starting y position (-82 to +82)
 * @param {number} opts.power     - Power percentage (0-100)
 * @param {number} opts.spin      - Spin direction: +1 (CW) or -1 (CCW)
 * @param {string} opts.profile   - Ice profile key
 * @param {number} [opts.paperTurns=1.0] - Running band roughness
 * @param {boolean} [opts.sweep=false]   - Sweep the entire delivery
 * @param {Object} [opts.tune]    - Tuning overrides (merged with DEFAULTS)
 * @param {number} [opts.dt=0.016] - Physics timestep
 *
 * @returns {{ trace: Array, summary: Object }}
 */
function simulate(opts) {
  const {
    aim = 0, power = 45, spin = 1, profile = "championship",
    paperTurns = 1.0, sweep = false, tune: tuneOverrides = {}, dt = 0.016,
  } = opts;

  const T = { ...DEFAULTS, ...tuneOverrides };

  // Init ice
  const grid = new IceGrid();
  if (ICE_PROFILES[profile]) ICE_PROFILES[profile].init(grid);

  // Init rock
  const rock = {
    x: WORLD.hackPos, y: aim, angle: PI,
    velocity: 1.8 + 2.6 * Math.pow(power / 100, 0.5),
    spin, paperTurns, inPlay: true, hasContacted: false,
  };

  const trace = [];
  let tick = 0;
  let removed = false;
  let removeReason = null;

  while (rock.inPlay && rock.velocity > 0.02 && tick < 10000) {
    grid.evaporateMoisture(dt);

    const friction = grid.sampleFriction(rock.x, rock.y, T.baseFriction, T.pebbleFrictionBonus);
    const slope = grid.sampleSlope(rock.x, rock.y);

    // Deceleration
    rock.velocity = Math.max(0, rock.velocity - friction * T.frictionDecel * dt);
    if (sweep && rock.velocity > 0.3) rock.velocity += dt * T.sweepBoost;

    // Spin curl
    const v = rock.velocity;
    const vFactor = Math.max(0.3, Math.sqrt(v / 2));
    const spinCurl = rock.spin * rock.paperTurns * friction * T.curlCoeff * vFactor;

    // Gradient drift
    const perpX = -Math.sin(rock.angle) * CURL_SAMPLE_OFFSET;
    const perpY = Math.cos(rock.angle) * CURL_SAMPLE_OFFSET;
    const fL = grid.sampleFriction(rock.x + perpX, rock.y + perpY, T.baseFriction, T.pebbleFrictionBonus);
    const fR = grid.sampleFriction(rock.x - perpX, rock.y - perpY, T.baseFriction, T.pebbleFrictionBonus);
    const gradDrift = (fL - fR) * T.gradientCoeff * vFactor;

    // Slope
    const slopeScale = Math.min(1, v * 2);
    const slopeYF = slope.sy * T.slopeGravity * slopeScale;
    const slopeXF = slope.sx * T.slopeGravity * slopeScale;

    // Record BEFORE applying forces (position at start of tick)
    trace.push({
      tick, x: rock.x, y: rock.y, velocity: v, angle: rock.angle,
      spinCurl, gradDrift, slopeY: slopeYF, friction, vFactor, fL, fR,
    });

    // Apply
    rock.y += (spinCurl + gradDrift + slopeYF) * dt;
    rock.velocity = Math.max(0, rock.velocity + slopeXF * dt * 0.5);
    rock.x += Math.cos(rock.angle) * rock.velocity * dt * T.speedScale;
    rock.y += Math.sin(rock.angle) * rock.velocity * dt * T.speedScale;

    grid.applyWear(rock.x, rock.y, dt, sweep, T.wearRate);

    // Boundary checks
    if (rock.x - ROCK_RADIUS < WORLD.backLine) { removed = true; removeReason = "back_line"; rock.inPlay = false; }
    if (Math.abs(rock.y) + ROCK_RADIUS > WORLD.sheetHalfWidth) { removed = true; removeReason = "sideboard"; rock.inPlay = false; }
    if (rock.velocity <= 0.02 && rock.x > WORLD.hogLine - ROCK_RADIUS && !rock.hasContacted) { removed = true; removeReason = "hog_line"; rock.inPlay = false; }

    tick++;
  }

  // Final position
  const last = trace[trace.length - 1];
  const hx = WORLD.houseCenter.x, hy = WORLD.houseCenter.y;
  const distToButton = last ? Math.sqrt((last.x - hx) ** 2 + (last.y - hy) ** 2) : Infinity;
  const inHouse = distToButton <= WORLD.houseRadii[3] + ROCK_RADIUS;
  const totalCurl = last ? last.y - aim : 0;

  const summary = {
    name: opts.name || "unnamed",
    aim, power, spin, profile, paperTurns, sweep,
    tune: T,
    finalX: last?.x, finalY: last?.y,
    totalCurl: +totalCurl.toFixed(2),
    distToButton: +distToButton.toFixed(1),
    inHouse, removed, removeReason,
    ticks: tick,
    duration: +(tick * dt).toFixed(2),
  };

  return { trace, summary };
}

module.exports = { simulate, WORLD, ROCK_RADIUS, DEFAULTS, ICE_PROFILES };
