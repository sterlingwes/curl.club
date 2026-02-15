import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CURLING â€” Grid-based ice physics engine
// Differential-friction curl, slope/fall, wear, sweep effects
// ============================================================

const PI = Math.PI;
const ROCK_RADIUS = 5;
const RESTITUTION = 0.92;
const ROCKS_PER_TEAM = 8;
const ROCKS_PER_END = ROCKS_PER_TEAM * 2;

const WORLD = {
  sheetHalfWidth: 82,
  sheetStart: 50,
  sheetEnd: -680,
  hogLine: -380,
  tLine: -540,
  backLine: -612,
  hackPos: -100,
  houseCenter: { x: -540, y: 0 },
  houseRadii: [6, 24, 48, 72],
};

// ============================================================
// ICE GRID â€” 2D grid of cells tracking physical ice properties
// ============================================================
const GRID_COLS = 48; // along sheet (x)
const GRID_ROWS = 16; // across sheet (y)
const GRID_X_MIN = WORLD.sheetEnd;
const GRID_X_MAX = WORLD.sheetStart;
const GRID_Y_MIN = -WORLD.sheetHalfWidth;
const GRID_Y_MAX = WORLD.sheetHalfWidth;
const CELL_W = (GRID_X_MAX - GRID_X_MIN) / GRID_COLS;
const CELL_H = (GRID_Y_MAX - GRID_Y_MIN) / GRID_ROWS;

// Sampling offset for differential friction (half rock width)
const CURL_SAMPLE_OFFSET = ROCK_RADIUS * 0.8;

// Physics tuning
const BASE_FRICTION = 0.08;
const PEBBLE_FRICTION_BONUS = 0.07; // full pebble adds this much
const WEAR_RATE = 0.0012; // pebble loss per rock-pass per tick
const SWEEP_WEAR_RATE = 0.003; // sweeping polishes pebble
const SWEEP_MOISTURE_RATE = 0.05; // moisture added by sweeping
const MOISTURE_EVAP_RATE = 0.008; // moisture evaporates over time
const MOISTURE_FRICTION_REDUCTION = 0.03;
const CURL_COEFFICIENT = 2.8; // multiplier for differential friction â†’ lateral force
const SLOPE_GRAVITY = 18.0; // multiplier for slope â†’ lateral/longitudinal force
const FRICTION_DECEL = 9.0; // overall deceleration multiplier
const SPEED_SCALE = 60; // world units per velocity unit per second

function createCell() {
  return {
    pebbleHeight: 1.0, // 0 = bare ice, 1 = fresh pebble
    temperature: 0, // deviation from nominal (0 = normal, negative = colder)
    moisture: 0, // surface water 0-1
    slopeX: 0, // grade along sheet (+ = tilts toward house)
    slopeY: 0, // grade across sheet (+ = tilts toward +y side)
  };
}

function cellFriction(cell) {
  const pebbleFric = BASE_FRICTION + cell.pebbleHeight * PEBBLE_FRICTION_BONUS;
  const moistureReduction = cell.moisture * MOISTURE_FRICTION_REDUCTION;
  // Colder ice is harder = slightly lower friction
  const tempEffect = cell.temperature * 0.002;
  return Math.max(0.02, pebbleFric - moistureReduction + tempEffect);
}

class IceGrid {
  constructor() {
    this.cells = [];
    for (let c = 0; c < GRID_COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        this.cells[c][r] = createCell();
      }
    }
  }

  // Get grid indices for a world position
  toGrid(wx, wy) {
    const col = Math.floor((wx - GRID_X_MIN) / CELL_W);
    const row = Math.floor((wy - GRID_Y_MIN) / CELL_H);
    return [
      Math.max(0, Math.min(GRID_COLS - 1, col)),
      Math.max(0, Math.min(GRID_ROWS - 1, row)),
    ];
  }

  // Bilinear sample of friction at a world position
  sampleFriction(wx, wy) {
    const fx = (wx - GRID_X_MIN) / CELL_W - 0.5;
    const fy = (wy - GRID_Y_MIN) / CELL_H - 0.5;
    const c0 = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
    const tx = fx - c0,
      ty = fy - r0;
    const f00 = cellFriction(this.cells[c0][r0]);
    const f10 = cellFriction(this.cells[c0 + 1][r0]);
    const f01 = cellFriction(this.cells[c0][r0 + 1]);
    const f11 = cellFriction(this.cells[c0 + 1][r0 + 1]);
    return (
      f00 * (1 - tx) * (1 - ty) +
      f10 * tx * (1 - ty) +
      f01 * (1 - tx) * ty +
      f11 * tx * ty
    );
  }

  // Bilinear sample of slope at a world position
  sampleSlope(wx, wy) {
    const fx = (wx - GRID_X_MIN) / CELL_W - 0.5;
    const fy = (wy - GRID_Y_MIN) / CELL_H - 0.5;
    const c0 = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
    const tx = fx - c0,
      ty = fy - r0;
    const lerp = (a, b, c, d) =>
      a * (1 - tx) * (1 - ty) +
      b * tx * (1 - ty) +
      c * (1 - tx) * ty +
      d * tx * ty;
    return {
      sx: lerp(
        this.cells[c0][r0].slopeX,
        this.cells[c0 + 1][r0].slopeX,
        this.cells[c0][r0 + 1].slopeX,
        this.cells[c0 + 1][r0 + 1].slopeX,
      ),
      sy: lerp(
        this.cells[c0][r0].slopeY,
        this.cells[c0 + 1][r0].slopeY,
        this.cells[c0][r0 + 1].slopeY,
        this.cells[c0 + 1][r0 + 1].slopeY,
      ),
    };
  }

  // Apply wear from a rock at position (wx, wy) over dt
  applyWear(wx, wy, dt, isSweeping) {
    const [c, r] = this.toGrid(wx, wy);
    // Affect a 3x3 neighborhood weighted by distance
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc,
          rr = r + dr;
        if (cc < 0 || cc >= GRID_COLS || rr < 0 || rr >= GRID_ROWS) continue;
        const weight = dc === 0 && dr === 0 ? 1.0 : 0.3;
        const cell = this.cells[cc][rr];
        // Rock travel wears pebble
        cell.pebbleHeight = Math.max(
          0,
          cell.pebbleHeight - WEAR_RATE * weight * dt,
        );
        if (isSweeping) {
          cell.pebbleHeight = Math.max(
            0,
            cell.pebbleHeight - SWEEP_WEAR_RATE * weight * dt,
          );
          cell.moisture = Math.min(
            1,
            cell.moisture + SWEEP_MOISTURE_RATE * weight * dt,
          );
        }
      }
    }
  }

  // Evaporate moisture globally (called each tick)
  evaporateMoisture(dt) {
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const cell = this.cells[c][r];
        if (cell.moisture > 0) {
          // Colder cells evaporate slower
          const evapRate = MOISTURE_EVAP_RATE * (1 + cell.temperature * 0.1);
          cell.moisture = Math.max(0, cell.moisture - evapRate * dt);
        }
      }
    }
  }

  // Get pebble height at a world position (for rendering)
  samplePebble(wx, wy) {
    const [c, r] = this.toGrid(wx, wy);
    return this.cells[c][r].pebbleHeight;
  }

  sampleMoisture(wx, wy) {
    const [c, r] = this.toGrid(wx, wy);
    return this.cells[c][r].moisture;
  }
}

// ============================================================
// ICE PROFILES
// ============================================================
const ICE_PROFILES = {
  championship: {
    name: "Championship",
    desc: "Flat, consistent, fresh pebble. Minimal surprises.",
    init: (grid) => {
      /* default is already uniform fresh pebble */
    },
  },
  club: {
    name: "Club Ice",
    desc: "Slight dish toward center, mild wear from previous game.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          // Slight dish: friction higher at center
          const yNorm = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY = -yNorm * 0.0015;
          // Mild wear along common path (center of sheet)
          const centerDist = Math.abs(yNorm);
          if (centerDist < 0.3)
            cell.pebbleHeight -= 0.15 * (1 - centerDist / 0.3);
        }
      }
    },
  },
  arena: {
    name: "Arena Ice",
    desc: "Cold, hard ice. One brine-pipe trough. Corner slope.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          cell.temperature = -1.5; // colder overall
          // Trough: a stripe ~3ft from center on positive-y side
          const yWorld = GRID_Y_MIN + (r + 0.5) * CELL_H;
          if (Math.abs(yWorld - 25) < 8) {
            cell.temperature -= 2;
            cell.pebbleHeight -= 0.1;
            cell.slopeY = 0.001; // subtle slope within trough
          }
          // Corner slope: near house on positive-y corner, ice is thinner
          const xWorld = GRID_X_MIN + (c + 0.5) * CELL_W;
          if (xWorld < -500 && yWorld > 40) {
            cell.slopeY = -0.003;
            cell.slopeX = -0.001;
          }
        }
      }
    },
  },
  swingy: {
    name: "Swingy",
    desc: "Heavy dish, thick pebble, dramatic curl and fall.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          const yNorm = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          // Strong dish
          cell.slopeY = -yNorm * 0.004;
          // Extra pebble everywhere
          cell.pebbleHeight = 1.2;
        }
      }
    },
  },
  discovery: {
    name: "Discovery",
    desc: "Random hidden features. Read the ice as you play.",
    init: (grid) => {
      const rng = () => Math.random();
      // Random dish amount
      const dishStrength = (rng() - 0.3) * 0.004;
      // Random trough position and strength
      const troughY = (rng() - 0.5) * WORLD.sheetHalfWidth * 1.2;
      const troughWidth = 5 + rng() * 10;
      const hasTrough = rng() > 0.35;
      const troughSlope = (rng() - 0.5) * 0.003;
      // Random corner slope
      const hasCornerSlope = rng() > 0.4;
      const cornerQuadX = rng() > 0.5 ? 1 : -1;
      const cornerQuadY = rng() > 0.5 ? 1 : -1;
      const cornerStrength = 0.001 + rng() * 0.004;
      // Random warm spot
      const hasWarmSpot = rng() > 0.5;
      const warmX = GRID_X_MIN + rng() * (GRID_X_MAX - GRID_X_MIN) * 0.6;
      const warmY = (rng() - 0.5) * WORLD.sheetHalfWidth * 1.4;
      // Previous-game wear pattern (offset from center)
      const wearOffset = (rng() - 0.5) * 30;
      const wearAmount = 0.05 + rng() * 0.2;

      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          const xW = GRID_X_MIN + (c + 0.5) * CELL_W;
          const yW = GRID_Y_MIN + (r + 0.5) * CELL_H;
          const yNorm = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);

          // Dish
          cell.slopeY += -yNorm * dishStrength;

          // Trough
          if (hasTrough && Math.abs(yW - troughY) < troughWidth) {
            const troughDist = Math.abs(yW - troughY) / troughWidth;
            cell.temperature -= 1.5 * (1 - troughDist);
            cell.pebbleHeight -= 0.08 * (1 - troughDist);
            cell.slopeY += troughSlope * (1 - troughDist);
          }

          // Corner slope
          if (hasCornerSlope) {
            const inCornerX = cornerQuadX > 0 ? xW < -480 : xW > -200;
            const inCornerY = cornerQuadY > 0 ? yW > 30 : yW < -30;
            if (inCornerX && inCornerY) {
              cell.slopeY += cornerQuadY * -cornerStrength;
              cell.slopeX += cornerQuadX * -cornerStrength * 0.3;
            }
          }

          // Warm spot
          if (hasWarmSpot) {
            const dist = Math.sqrt((xW - warmX) ** 2 + (yW - warmY) ** 2);
            if (dist < 60) {
              cell.temperature += 2 * (1 - dist / 60);
            }
          }

          // Previous game wear
          const distFromWearPath = Math.abs(yW - wearOffset);
          if (distFromWearPath < 15) {
            cell.pebbleHeight -= wearAmount * (1 - distFromWearPath / 15);
          }

          cell.pebbleHeight = Math.max(0, Math.min(1.3, cell.pebbleHeight));
        }
      }
    },
  },
};

// ============================================================
// ROCK
// ============================================================
function createRock(team, id) {
  return {
    id,
    team,
    x: 0,
    y: 0,
    angle: 0,
    velocity: 0,
    curl: 0,
    spin: 1, // spin: +1 or -1 (handle direction)
    paperTurns: 1.0, // running surface roughness (more = more curl potential)
    inPlay: false,
    active: false,
    stopped: false,
    hasContacted: false,
  };
}

// ============================================================
// GAME COMPONENT
// ============================================================
export default function CurlingGame() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const iceGridRef = useRef(new IceGrid());

  const [phase, setPhase] = useState("title");
  const [currentEnd, setCurrentEnd] = useState(1);
  const [totalEnds] = useState(8);
  const [currentTeam, setCurrentTeam] = useState(0);
  const [rockNum, setRockNum] = useState(0);
  const [scores, setScores] = useState([[], []]);
  const [endScoreDisplay, setEndScoreDisplay] = useState(null);
  const [message, setMessage] = useState("");
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [curlDir, setCurlDir] = useState(1);
  const [vertical, setVertical] = useState(false);
  const [iceProfile, setIceProfile] = useState("club");
  const [showIceOverlay, setShowIceOverlay] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  const rocksRef = useRef([]);
  const deliveryRockRef = useRef(null);
  const sweepingRef = useRef(false);

  const initIce = useCallback((profileKey) => {
    const grid = new IceGrid();
    const profile = ICE_PROFILES[profileKey];
    if (profile) profile.init(grid);
    iceGridRef.current = grid;
  }, []);

  const initEnd = useCallback(() => {
    rocksRef.current = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < ROCKS_PER_TEAM; i++) {
        const r = createRock(t, t * ROCKS_PER_TEAM + i);
        r.x = 200 + i * 20;
        r.y = t === 0 ? -60 : 60;
        rocksRef.current.push(r);
      }
    }
  }, []);

  const resolveCollisions = useCallback((rocks) => {
    for (let i = 0; i < rocks.length; i++) {
      const a = rocks[i];
      if (!a.inPlay || a.velocity <= 0.05) continue;
      for (let j = 0; j < rocks.length; j++) {
        if (i === j) continue;
        const b = rocks[j];
        if (!b.inPlay) continue;
        const dx = a.x - b.x,
          dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ROCK_RADIUS * 2;
        if (dist < minDist && dist > 0) {
          const nx = (b.x - a.x) / dist,
            ny = (b.y - a.y) / dist;
          const avx = Math.cos(a.angle) * a.velocity,
            avy = Math.sin(a.angle) * a.velocity;
          const bvx = Math.cos(b.angle) * b.velocity,
            bvy = Math.sin(b.angle) * b.velocity;
          const relVel = (avx - bvx) * nx + (avy - bvy) * ny;
          if (relVel > 0) {
            const imp = relVel * RESTITUTION;
            const nax = avx - imp * nx,
              nay = avy - imp * ny;
            const nbx = bvx + imp * nx,
              nby = bvy + imp * ny;
            a.velocity = Math.sqrt(nax * nax + nay * nay);
            b.velocity = Math.sqrt(nbx * nbx + nby * nby);
            if (a.velocity > 0.01) a.angle = Math.atan2(nay, nax);
            if (b.velocity > 0.01) b.angle = Math.atan2(nby, nbx);
          }
          const ol = minDist - dist;
          a.x += (dx / dist) * ol * 0.5;
          a.y += (dy / dist) * ol * 0.5;
          b.x -= (dx / dist) * ol * 0.5;
          b.y -= (dy / dist) * ol * 0.5;
          b.inPlay = true;
          b.active = true;
          b.stopped = false;
          a.hasContacted = true;
          b.hasContacted = true;
        }
      }
    }
  }, []);

  const removeRock = (rock) => {
    rock.inPlay = false;
    rock.active = false;
    rock.velocity = 0;
    rock.x = 800;
  };

  // ============================================================
  // PHYSICS TICK â€” grid-based
  // ============================================================
  const physicsTick = useCallback(
    (dt) => {
      const rocks = rocksRef.current;
      const grid = iceGridRef.current;
      let anyMoving = false;

      // Evaporate moisture globally
      grid.evaporateMoisture(dt);

      for (const rock of rocks) {
        if (!rock.inPlay || rock.velocity <= 0.02) {
          if (rock.inPlay) rock.stopped = true;
          continue;
        }
        anyMoving = true;
        rock.stopped = false;

        const isSweeping =
          sweepingRef.current && rock === deliveryRockRef.current;

        // --- Sample grid at rock position ---
        const friction = grid.sampleFriction(rock.x, rock.y);
        const slope = grid.sampleSlope(rock.x, rock.y);

        // --- Deceleration from friction ---
        rock.velocity = Math.max(
          0,
          rock.velocity - friction * FRICTION_DECEL * dt,
        );

        // --- Sweep effect: reduce effective friction (already in grid via moisture),
        //     plus a small direct velocity boost ---
        if (isSweeping && rock.velocity > 0.3) {
          rock.velocity += dt * 0.25;
        }

        // --- Curl: two independent components ---

        // 1) SPIN CURL â€” from the running band's interaction with the ice.
        //    A spinning rock has one side of its annular contact patch moving
        //    against the direction of travel (more grip) and one side moving with
        //    it (less grip). This asymmetry creates a lateral force whose
        //    direction depends on spin, and whose magnitude depends on:
        //    - local friction (more pebble = more grip = more curl)
        //    - velocity (slower = running band bites harder = more curl)
        //    - paperTurns (rougher running surface = more curl)
        //    This works identically on uniform ice â€” no grid differential needed.
        const localFriction = grid.sampleFriction(rock.x, rock.y);
        const velocityFactor = 1.0 / (rock.velocity + 0.4);
        const spinCurl =
          rock.spin *
          rock.paperTurns *
          localFriction *
          CURL_COEFFICIENT *
          velocityFactor;

        // 2) GRADIENT DRIFT â€” from friction variation across the rock's width.
        //    If friction is higher on one side, that side decelerates more,
        //    pulling the rock toward the higher-friction zone. Independent of spin.
        //    This produces: trough trapping, dished-ice funneling, worn-path effects.
        const perpX = -Math.sin(rock.angle) * CURL_SAMPLE_OFFSET;
        const perpY = Math.cos(rock.angle) * CURL_SAMPLE_OFFSET;
        const fricLeft = grid.sampleFriction(rock.x + perpX, rock.y + perpY);
        const fricRight = grid.sampleFriction(rock.x - perpX, rock.y - perpY);
        const fricGradient = fricLeft - fricRight;
        // Drift toward the higher-friction side (perpendicular to travel)
        const gradientDrift =
          fricGradient * CURL_COEFFICIENT * 0.5 * velocityFactor;

        // --- Slope force (gravity, always present, independent of spin) ---
        const slopeForceX = slope.sx * SLOPE_GRAVITY;
        const slopeForceY = slope.sy * SLOPE_GRAVITY;

        // --- Apply lateral forces ---
        rock.y += spinCurl * dt;
        rock.y += gradientDrift * dt;
        rock.y += slopeForceY * dt;

        // Longitudinal slope: speeds up or slows down
        rock.velocity += slopeForceX * dt * 0.5;
        rock.velocity = Math.max(0, rock.velocity);

        // --- Move along trajectory ---
        rock.x += Math.cos(rock.angle) * rock.velocity * dt * SPEED_SCALE;
        rock.y += Math.sin(rock.angle) * rock.velocity * dt * SPEED_SCALE;

        // --- Apply wear to the grid ---
        grid.applyWear(rock.x, rock.y, dt, isSweeping);

        // --- Boundary rules ---
        if (rock.x - ROCK_RADIUS < WORLD.backLine) {
          removeRock(rock);
          continue;
        }
        if (Math.abs(rock.y) + ROCK_RADIUS > WORLD.sheetHalfWidth) {
          removeRock(rock);
          continue;
        }
        if (
          rock.velocity <= 0.02 &&
          rock.x > WORLD.hogLine - ROCK_RADIUS &&
          !rock.hasContacted
        ) {
          removeRock(rock);
          continue;
        }
      }
      resolveCollisions(rocks);
      return anyMoving;
    },
    [resolveCollisions],
  );

  const scoreEnd = useCallback(() => {
    const rocks = rocksRef.current.filter((r) => r.inPlay);
    const hx = WORLD.houseCenter.x,
      hy = WORLD.houseCenter.y;
    const maxR = WORLD.houseRadii[3] + ROCK_RADIUS;
    const dists = [[], []];
    for (const r of rocks) {
      const d = Math.sqrt((r.x - hx) ** 2 + (r.y - hy) ** 2);
      if (d <= maxR) dists[r.team].push(d);
    }
    dists[0].sort((a, b) => a - b);
    dists[1].sort((a, b) => a - b);
    let scoringTeam = -1,
      pts = 0;
    if (!dists[0].length && !dists[1].length) {
      /* blank */
    } else if (!dists[1].length) {
      scoringTeam = 0;
      pts = dists[0].length;
    } else if (!dists[0].length) {
      scoringTeam = 1;
      pts = dists[1].length;
    } else if (dists[0][0] < dists[1][0]) {
      scoringTeam = 0;
      pts = dists[0].filter((d) => d < dists[1][0]).length;
    } else {
      scoringTeam = 1;
      pts = dists[1].filter((d) => d < dists[0][0]).length;
    }
    return { scoringTeam, pts };
  }, []);

  const deliverRock = useCallback(() => {
    const teamIdx = currentTeam;
    const rockIdx = Math.floor(rockNum / 2);
    const rock = rocksRef.current.find(
      (r) => r.team === teamIdx && r.id === teamIdx * ROCKS_PER_TEAM + rockIdx,
    );
    if (!rock) return;
    rock.x = WORLD.hackPos;
    rock.y = aimAngle;
    rock.angle = PI + (aimAngle / WORLD.sheetHalfWidth) * 0.08;
    rock.velocity = power * 0.12 + 1.8;
    rock.spin = curlDir;
    rock.paperTurns = 0.8 + Math.random() * 0.4; // slight variation per rock
    rock.inPlay = true;
    rock.active = true;
    rock.stopped = false;
    rock.hasContacted = false;
    deliveryRockRef.current = rock;
  }, [currentTeam, rockNum, aimAngle, power, curlDir]);

  // Game loop
  useEffect(() => {
    if (phase !== "running") return;
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      if (!physicsTick(dt)) {
        sweepingRef.current = false;
        deliveryRockRef.current = null;
        const next = rockNum + 1;
        if (next >= ROCKS_PER_END) {
          const result = scoreEnd();
          setEndScoreDisplay(result);
          setScores((prev) => {
            const n = [prev[0].slice(), prev[1].slice()];
            if (result.scoringTeam >= 0) {
              n[result.scoringTeam].push(result.pts);
              n[1 - result.scoringTeam].push(0);
            } else {
              n[0].push(0);
              n[1].push(0);
            }
            return n;
          });
          setPhase("scoring");
        } else {
          setRockNum(next);
          setCurrentTeam(next % 2 === 0 ? 0 : 1);
          setPhase("aiming");
          setAimAngle(0);
          setPower(0);
          setMessage("");
        }
        return;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, physicsTick, rockNum, scoreEnd]);

  useEffect(() => {
    if (phase !== "aiming") return;
    let t = 0;
    const maxAim = WORLD.sheetHalfWidth - ROCK_RADIUS - 2;
    const iv = setInterval(() => {
      t += 0.03;
      setAimAngle(Math.sin(t) * maxAim);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "power") return;
    let t = 0,
      dir = 1;
    const iv = setInterval(() => {
      t += dir * 2.5;
      if (t >= 100) dir = -1;
      if (t <= 0) dir = 1;
      setPower(t);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  // ============================================================
  // RENDERING
  // ============================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const W = canvas.width,
      H = canvas.height;
    const isV = vertical;

    const worldXRange = WORLD.sheetStart - WORLD.sheetEnd;
    const worldYRange = WORLD.sheetHalfWidth * 2;
    const screenLong = isV ? H : W,
      screenShort = isV ? W : H;
    const uScale = Math.min(
      (screenLong * 0.92) / worldXRange,
      (screenShort * 0.92) / worldYRange,
    );
    const wcx = (WORLD.sheetStart + WORLD.sheetEnd) / 2;

    const toScreen = (wx, wy) => {
      if (isV) return [W / 2 + wy * uScale, H / 2 + (wx - wcx) * uScale];
      return [W / 2 - (wx - wcx) * uScale, H / 2 - wy * uScale];
    };
    const r2s = (wr) => wr * uScale;

    const draw = () => {
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, W, H);

      const e = WORLD.sheetHalfWidth;
      const tl = toScreen(WORLD.sheetStart, e),
        br = toScreen(WORLD.sheetEnd, -e);
      const sL = Math.min(tl[0], br[0]),
        sT = Math.min(tl[1], br[1]);
      const sW = Math.abs(br[0] - tl[0]),
        sH = Math.abs(br[1] - tl[1]);

      // Ice surface base
      const gr = isV
        ? ctx.createLinearGradient(sL, sT, sL, sT + sH)
        : ctx.createLinearGradient(sL, sT, sL + sW, sT);
      gr.addColorStop(0, "#dce9f2");
      gr.addColorStop(0.4, "#eaf4fa");
      gr.addColorStop(0.7, "#e4f0f6");
      gr.addColorStop(1, "#d8e8f0");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(sL, sT, sW, sH, 5);
      ctx.fill();

      // Ice overlay: show pebble wear and moisture as color variation
      const grid = iceGridRef.current;
      if (showIceOverlay || phase === "running" || phase === "scoring") {
        for (let c = 0; c < GRID_COLS; c++) {
          for (let r = 0; r < GRID_ROWS; r++) {
            const cell = grid.cells[c][r];
            const wx = GRID_X_MIN + (c + 0.5) * CELL_W;
            const wy = GRID_Y_MIN + (r + 0.5) * CELL_H;
            const [sx, sy] = toScreen(wx, wy);
            const cellScreenW = Math.abs(r2s(CELL_W)) + 1;
            const cellScreenH = Math.abs(r2s(CELL_H)) + 1;

            // Wear: darker where pebble is gone
            const wear = 1 - cell.pebbleHeight;
            if (wear > 0.03) {
              ctx.fillStyle = `rgba(140,165,185,${wear * 0.35})`;
              if (isV)
                ctx.fillRect(
                  sx - cellScreenH / 2,
                  sy - cellScreenW / 2,
                  cellScreenH,
                  cellScreenW,
                );
              else
                ctx.fillRect(
                  sx - cellScreenW / 2,
                  sy - cellScreenH / 2,
                  cellScreenW,
                  cellScreenH,
                );
            }

            // Moisture: blue sheen
            if (cell.moisture > 0.01) {
              ctx.fillStyle = `rgba(100,160,220,${cell.moisture * 0.3})`;
              if (isV)
                ctx.fillRect(
                  sx - cellScreenH / 2,
                  sy - cellScreenW / 2,
                  cellScreenH,
                  cellScreenW,
                );
              else
                ctx.fillRect(
                  sx - cellScreenW / 2,
                  sy - cellScreenH / 2,
                  cellScreenW,
                  cellScreenH,
                );
            }

            // Slope indicators (only in full overlay mode)
            if (
              showIceOverlay &&
              (Math.abs(cell.slopeX) > 0.0005 || Math.abs(cell.slopeY) > 0.0005)
            ) {
              const mag = Math.sqrt(cell.slopeX ** 2 + cell.slopeY ** 2);
              const alpha = Math.min(0.5, mag * 120);
              ctx.fillStyle = `rgba(255,180,60,${alpha})`;
              ctx.beginPath();
              ctx.arc(sx, sy, 1.5, 0, PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // Pebble dots
      ctx.fillStyle = "rgba(180,200,215,0.08)";
      let seed = 42;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 350; i++) {
        ctx.beginPath();
        ctx.arc(sL + rnd() * sW, sT + rnd() * sH, 0.4 + rnd() * 0.3, 0, PI * 2);
        ctx.fill();
      }

      // Lines
      const drawWL = (wx, color, w = 1.5) => {
        const [x1, y1] = toScreen(wx, -e),
          [x2, y2] = toScreen(wx, e);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      drawWL(WORLD.hogLine, "#cc2233", 2.5);
      drawWL(WORLD.tLine, "#33446688", 1.5);
      drawWL(WORLD.backLine, "#44557799", 2);
      ctx.strokeStyle = "#33446630";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...toScreen(WORLD.sheetStart, 0));
      ctx.lineTo(...toScreen(WORLD.sheetEnd, 0));
      ctx.stroke();

      // House
      const rings = [
        { r: 72, f: "rgba(30,90,180,0.18)", s: "rgba(30,90,180,0.35)" },
        { r: 48, f: "rgba(225,232,242,0.35)", s: "rgba(180,190,200,0.25)" },
        { r: 24, f: "rgba(200,40,40,0.18)", s: "rgba(200,40,40,0.30)" },
        { r: 6, f: "rgba(225,232,242,0.40)", s: "rgba(180,190,200,0.35)" },
      ];
      const [hcx2, hcy2] = toScreen(WORLD.houseCenter.x, WORLD.houseCenter.y);
      for (const ring of rings) {
        const rs = r2s(ring.r);
        ctx.fillStyle = ring.f;
        ctx.strokeStyle = ring.s;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hcx2, hcy2, rs, 0, PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.arc(hcx2, hcy2, Math.max(2, r2s(1.2)), 0, PI * 2);
      ctx.fill();

      // Hack
      const [hkx, hky] = toScreen(WORLD.hackPos, 0);
      const hs = r2s(3);
      ctx.fillStyle = "#222";
      if (isV) ctx.fillRect(hkx - hs * 2, hky - hs / 2, hs * 4, hs);
      else ctx.fillRect(hkx - hs / 2, hky - hs * 2, hs, hs * 4);

      // Rocks
      const tcArr = [
        { f: "#f0c830", s: "#b8941e", g: "rgba(240,200,48,0.28)" },
        { f: "#d03030", s: "#8b1a1a", g: "rgba(208,48,48,0.28)" },
      ];
      for (const rock of rocksRef.current) {
        if (!rock.inPlay) continue;
        const [rx, ry] = toScreen(rock.x, rock.y);
        const rr = r2s(ROCK_RADIUS) * 1.05;
        const c = tcArr[rock.team];
        if (rock.velocity > 0.1) {
          ctx.fillStyle = c.g;
          ctx.beginPath();
          ctx.arc(rx, ry, rr + 3, 0, PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.arc(rx + 1, ry + 1, rr, 0, PI * 2);
        ctx.fill();
        const rg = ctx.createRadialGradient(
          rx - rr * 0.3,
          ry - rr * 0.3,
          rr * 0.1,
          rx,
          ry,
          rr,
        );
        rg.addColorStop(0, "#fff");
        rg.addColorStop(0.35, c.f);
        rg.addColorStop(1, c.s);
        ctx.fillStyle = rg;
        ctx.strokeStyle = c.s;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ry, rr * 0.4, 0, PI * 2);
        ctx.stroke();
      }

      // Remaining rocks
      for (let t = 0; t < 2; t++) {
        const rem = rocksRef.current.filter(
          (r) => r.team === t && !r.inPlay && r.x >= 200,
        ).length;
        for (let i = 0; i < rem; i++) {
          const py = (t === 0 ? -1 : 1) * (e + 10 + i * ROCK_RADIUS * 2.4);
          const [px2, py2] = toScreen(WORLD.hackPos + 30, py);
          const pr = r2s(ROCK_RADIUS) * 0.6;
          ctx.fillStyle = tcArr[t].f + "45";
          ctx.strokeStyle = tcArr[t].s + "25";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(px2, py2, pr, 0, PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Aim
      if (phase === "aiming" || phase === "power") {
        const [ax, ay] = toScreen(WORLD.hackPos, aimAngle);
        const [tx2, ty2] = toScreen(WORLD.houseCenter.x, aimAngle);
        const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
        ctx.strokeStyle = `rgba(${col},0.35)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(tx2, ty2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${col},0.7)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx2, ty2, 7, 0, PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx2 - 10, ty2);
        ctx.lineTo(tx2 + 10, ty2);
        ctx.moveTo(tx2, ty2 - 10);
        ctx.lineTo(tx2, ty2 + 10);
        ctx.stroke();
      }

      // Sweep
      if (
        phase === "running" &&
        deliveryRockRef.current?.inPlay &&
        sweepingRef.current
      ) {
        const dr = deliveryRockRef.current;
        const [sx2, sy2] = toScreen(dr.x, dr.y);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("ðŸ§¹ SWEEP!", sx2, sy2 - r2s(ROCK_RADIUS) - 7);
        ctx.textAlign = "start";
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, aimAngle, currentTeam, vertical, showIceOverlay]);

  // Click handler
  const handleAction = useCallback(() => {
    if (phase === "title") {
      initIce(iceProfile);
      initEnd();
      setPhase("aiming");
      setCurrentTeam(0);
      setRockNum(0);
      setScores([[], []]);
      setCurrentEnd(1);
      setMessage("");
      setEndScoreDisplay(null);
      return;
    }
    if (phase === "aiming") {
      setPhase("power");
      return;
    }
    if (phase === "power") {
      deliverRock();
      setPhase("running");
      sweepingRef.current = false;
      return;
    }
    if (phase === "running") {
      sweepingRef.current = !sweepingRef.current;
      return;
    }
    if (phase === "scoring") {
      if (currentEnd >= totalEnds) {
        setPhase("gameover");
      } else {
        setCurrentEnd((e) => e + 1);
        const nf =
          endScoreDisplay?.scoringTeam >= 0
            ? endScoreDisplay.scoringTeam
            : currentTeam;
        setCurrentTeam(nf);
        setRockNum(0);
        setAimAngle(0);
        setPower(0);
        setEndScoreDisplay(null);
        initEnd();
        setPhase("aiming");
      }
      return;
    }
    if (phase === "gameover") {
      setPhase("title");
      return;
    }
  }, [
    phase,
    initIce,
    iceProfile,
    initEnd,
    deliverRock,
    currentEnd,
    totalEnds,
    endScoreDisplay,
    currentTeam,
  ]);

  const toggleCurl = useCallback(() => setCurlDir((d) => d * -1), []);
  const totalScore = (t) => scores[t].reduce((a, b) => a + b, 0);
  const tn = (t) => (t === 0 ? "Yellow" : "Red");
  const tCol = (t) => (t === 0 ? "#f0c830" : "#d03030");

  const [dims, setDims] = useState({ w: 900, h: 500 });
  useEffect(() => {
    const resize = () => {
      const mw = Math.min(window.innerWidth - 24, 1100),
        mh = window.innerHeight - 260;
      if (vertical) {
        const w = Math.min(mw, 400),
          h = Math.min(mh, w * 2.4);
        setDims({ w: Math.max(260, w), h: Math.max(380, h) });
      } else {
        const w = Math.min(mw, 1100),
          h = Math.min(w * 0.36, mh);
        setDims({ w: Math.max(460, w), h: Math.max(180, h) });
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [vertical]);

  const rockLabel = `${Math.floor(rockNum / 2) + 1}/${ROCKS_PER_TEAM}`;
  const btnStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 3,
    padding: "2px 8px",
    color: "#8ab4f8",
    fontSize: 9,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg,#070b14 0%,#0d1525 40%,#111d33 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
        color: "#c8d8e8",
        padding: "10px 14px",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 5,
          width: "100%",
          maxWidth: dims.w,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              background: "linear-gradient(135deg,#e8f0ff,#8ab4f8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CURLING
          </h1>
          <span style={{ fontSize: 8, color: "#4a6080" }}>
            grid ice physics
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {phase !== "title" && phase !== "gameover" && (
            <>
              <span>
                End <b>{currentEnd}</b>/{totalEnds}
              </span>
              <span>
                Rock <b>{rockLabel}</b>
              </span>
            </>
          )}
          <button onClick={() => setVertical((v) => !v)} style={btnStyle}>
            {vertical ? "âŸ·" : "âŸ³"}
          </button>
          <button
            onClick={() => setShowIceOverlay((v) => !v)}
            style={{
              ...btnStyle,
              color: showIceOverlay ? "#f0c830" : "#8ab4f8",
            }}
          >
            ðŸ§Š
          </button>
          <button
            onClick={() => setShowProfilePicker((v) => !v)}
            style={btnStyle}
          >
            âš™
          </button>
        </div>
      </div>

      {/* Ice profile picker */}
      {showProfilePicker && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 6,
            flexWrap: "wrap",
            width: "100%",
            maxWidth: dims.w,
          }}
        >
          {Object.entries(ICE_PROFILES).map(([key, prof]) => (
            <button
              key={key}
              onClick={() => {
                setIceProfile(key);
                setShowProfilePicker(false);
              }}
              style={{
                ...btnStyle,
                padding: "4px 10px",
                color: iceProfile === key ? "#f0c830" : "#8ab4f8",
                borderColor:
                  iceProfile === key ? "#f0c83040" : "rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 9 }}>{prof.name}</div>
              <div style={{ fontSize: 7, color: "#4a6080", marginTop: 1 }}>
                {prof.desc}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Scoreboard */}
      {phase !== "title" && (
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 5,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 5,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
            fontSize: 10,
            width: "100%",
            maxWidth: dims.w,
          }}
        >
          {[0, 1].map((t) => (
            <div
              key={t}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                padding: "4px 8px",
                background:
                  currentTeam === t &&
                  phase !== "scoring" &&
                  phase !== "gameover"
                    ? `${tCol(t)}15`
                    : "transparent",
                borderLeft:
                  t === 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: tCol(t),
                  marginRight: 6,
                  boxShadow: `0 0 4px ${tCol(t)}60`,
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  marginRight: 8,
                  minWidth: 36,
                  fontSize: 9,
                }}
              >
                {tn(t)}
              </span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {scores[t].map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "0 3px",
                      borderRadius: 2,
                      fontWeight: s > 0 ? 700 : 400,
                      color: s > 0 ? tCol(t) : "#4a6080",
                      fontSize: 9,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  fontWeight: 800,
                  fontSize: 13,
                  color: tCol(t),
                }}
              >
                {totalScore(t)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          onClick={handleAction}
          style={{
            borderRadius: 8,
            cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "block",
          }}
        />

        {phase === "title" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(7,11,20,0.88)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div
              style={{
                fontSize: 42,
                fontWeight: 900,
                letterSpacing: "-2px",
                background: "linear-gradient(135deg,#f0c830,#d03030)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: 4,
              }}
            >
              CURLING
            </div>
            <div style={{ fontSize: 9, color: "#6a8aaa", marginBottom: 4 }}>
              Grid-based ice physics engine
            </div>
            <div style={{ fontSize: 8, color: "#4a6080", marginBottom: 14 }}>
              Ice:{" "}
              <b style={{ color: "#8ab4f8" }}>
                {ICE_PROFILES[iceProfile].name}
              </b>{" "}
              â€” {ICE_PROFILES[iceProfile].desc}
            </div>
            <div
              style={{
                padding: "8px 28px",
                background:
                  "linear-gradient(135deg,rgba(240,200,48,0.15),rgba(208,48,48,0.15))",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "1px",
              }}
            >
              TAP TO START
            </div>
          </div>
        )}

        {phase === "scoring" && endScoreDisplay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(7,11,20,0.75)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div style={{ fontSize: 12, color: "#6a8aaa", marginBottom: 4 }}>
              End {currentEnd}
            </div>
            {endScoreDisplay.scoringTeam >= 0 ? (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: tCol(endScoreDisplay.scoringTeam),
                }}
              >
                {tn(endScoreDisplay.scoringTeam)} scores {endScoreDisplay.pts}!
              </div>
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#6a8aaa" }}>
                Blank end
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 9, color: "#4a6080" }}>
              Tap to continue
            </div>
          </div>
        )}

        {phase === "gameover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(7,11,20,0.85)",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div style={{ fontSize: 12, color: "#6a8aaa", marginBottom: 4 }}>
              Final Score
            </div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              {[0, 1].map((t) => (
                <div key={t} style={{ textAlign: "center" }}>
                  <div
                    style={{ fontSize: 28, fontWeight: 900, color: tCol(t) }}
                  >
                    {totalScore(t)}
                  </div>
                  <div style={{ fontSize: 10, color: "#6a8aaa" }}>{tn(t)}</div>
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color:
                  totalScore(0) > totalScore(1)
                    ? tCol(0)
                    : totalScore(1) > totalScore(0)
                      ? tCol(1)
                      : "#6a8aaa",
              }}
            >
              {totalScore(0) > totalScore(1)
                ? "Yellow Wins!"
                : totalScore(1) > totalScore(0)
                  ? "Red Wins!"
                  : "Draw!"}
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: "#4a6080" }}>
              Tap to play again
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          width: "100%",
          maxWidth: dims.w,
          minHeight: 36,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 3,
            background: `${tCol(currentTeam)}18`,
            border: `1px solid ${tCol(currentTeam)}30`,
            color: tCol(currentTeam),
            minWidth: 58,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {phase === "aiming"
            ? "Aim"
            : phase === "power"
              ? "Power"
              : phase === "running"
                ? "Sweep"
                : phase}
        </div>
        {phase === "power" && (
          <div
            style={{
              flex: 1,
              minWidth: 80,
              height: 12,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 3,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.06)",
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${power}%`,
                background:
                  power < 40
                    ? "rgba(100,200,100,0.4)"
                    : power < 75
                      ? "rgba(240,200,48,0.4)"
                      : "rgba(208,48,48,0.4)",
                borderRadius: 3,
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                fontSize: 7,
                fontWeight: 700,
                color: "#c8d8e8",
              }}
            >
              {Math.round(power)}%
            </span>
          </div>
        )}
        {(phase === "aiming" || phase === "power") && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCurl();
            }}
            style={{ ...btnStyle, color: "#c8d8e8" }}
          >
            Curl: {curlDir > 0 ? "â†’ In" : "â† Out"}
          </button>
        )}
        {phase === "running" && (
          <div
            style={{
              fontSize: 9,
              color: sweepingRef.current ? "#8ef" : "#4a6080",
              fontWeight: sweepingRef.current ? 700 : 400,
            }}
          >
            {sweepingRef.current ? "ðŸ§¹ SWEEPING" : "Tap to sweep"}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 8,
          color: "#2a3a50",
          marginTop: 4,
          textAlign: "center",
          maxWidth: 420,
          lineHeight: 1.4,
        }}
      >
        {phase === "aiming" &&
          "Tap to lock aim. Curl direction affects how the rock bends on the ice."}
        {phase === "power" && "Tap to set delivery weight."}
        {phase === "running" &&
          "Tap to sweep â€” melts pebble, reduces friction, keeps the rock moving."}
      </div>
    </div>
  );
}
