import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// WINCURL REIMPLEMENTATION â€” Physics reverse-engineered from
// the original VB3 source. Canvas2D rendering (maps to Skia).
// ============================================================

// --- Constants from the original WinCurl source ---
const PI = 3.14159;
const SHEET_LENGTH = 1620; // gc0D76 â€” total coordinate length
const HOUSE_OFFSET = 756; // gc0D7C â€” house center offset
const CURL_ZONE = 66; // gc0D62 â€” curl zone boundary
const CURL_INNER = 8.4; // gc0D64 â€” reduced curl inner zone
const ROCK_RADIUS = 5; // collision radius ~5 units
const FRICTION_COEFF = 64; // from velocityÂ²/(64*friction)
const RESTITUTION = [0.92, 0.85, 0.78]; // rock condition coefficients

// --- Physics types mirroring T2ABE ---
function createRock(team, id) {
  return {
    id,
    team, // 0 = home (yellow), 1 = away (red)
    x: 0, // M2ACB â€” along-sheet position
    y: 0, // M2AD0 â€” cross-sheet position
    angle: 0, // M2AE9 â€” direction of travel
    velocity: 0, // M2ADD â€” current speed
    friction: 0.12, // M2B81 â€” friction coefficient
    curl: 0, // M2B73 â€” curl amount (+ = clockwise)
    spin: 1, // M2B65 â€” spin direction
    inPlay: false, // M2B47
    active: false, // M2BD4
    stopped: false,
  };
}

// --- Curl deflection (fn0349) ---
function calcCurl(posAlongSheet, distanceTraveled, curlAmount, curlSign) {
  if (posAlongSheet >= CURL_ZONE) return 0;
  const distInZone =
    distanceTraveled > CURL_ZONE
      ? CURL_ZONE - posAlongSheet
      : distanceTraveled - posAlongSheet;
  if (distInZone <= 0) return 0;

  const ratio = distInZone / CURL_ZONE;
  const deflection = ratio * curlAmount;
  if (Math.abs(deflection) <= 0) return 0;

  let result = -curlSign * deflection;
  if (posAlongSheet < CURL_INNER && distanceTraveled > CURL_INNER) {
    result *=
      (2 - (CURL_INNER - posAlongSheet) / (distInZone + 0.00000001)) / 2;
  } else if (posAlongSheet < CURL_INNER) {
    result /= 2;
  }
  return result;
}

// --- Angle between two points (fn045A) ---
function angleBetween(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let a = Math.atan2(dy, dx + 0.0000001);
  if (dx < 0) a = PI + Math.atan2(dy, dx + 0.0000001);
  else if (dy < 0) a = 2 * PI + a;
  return a;
}

// --- Angle difference (fn03E6) ---
function angleDiff(a, b) {
  let d = a - b;
  if (d > PI) d -= 2 * PI;
  else if (d < -PI) d += 2 * PI;
  return d;
}

// --- Safe sqrt (fn043E) ---
function safeSqrt(v) {
  return Math.sqrt(Math.abs(v));
}

// --- Arcsine approx (fn0244) ---
function safeAsin(v) {
  const clamped = Math.max(-1, Math.min(1, v));
  return Math.asin(clamped);
}

// --- Game dimensions (in "world" units, rendered to canvas) ---
const WORLD = {
  sheetWidth: 160, // cross-sheet (y range roughly -80 to 80)
  sheetLength: 900, // along-sheet visible length
  hogLine: -380, // hog line position
  tLine: -540, // tee line
  backLine: -600, // back line
  hackPos: -100, // hack (delivery) position
  houseCenter: { x: -540, y: 0 },
  houseRadii: [6, 24, 48, 72], // button, 4ft, 8ft, 12ft rings
};

// ============================================================
// MAIN GAME COMPONENT
// ============================================================
export default function CurlingGame() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const animRef = useRef(null);

  // --- Game state ---
  const [phase, setPhase] = useState("title"); // title | aiming | power | sweeping | running | scoring | gameover
  const [currentEnd, setCurrentEnd] = useState(1);
  const [totalEnds] = useState(8);
  const [currentTeam, setCurrentTeam] = useState(0);
  const [rockNum, setRockNum] = useState(0); // 0-7 per end (alternating)
  const [scores, setScores] = useState([[], []]);
  const [endScoreDisplay, setEndScoreDisplay] = useState(null);
  const [message, setMessage] = useState("");
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [curlDir, setCurlDir] = useState(1);
  const [sweepAmount, setSweepAmount] = useState(0);

  const rocksRef = useRef([]);
  const deliveryRockRef = useRef(null);
  const sweepingRef = useRef(false);

  // --- Initialize rocks for an end ---
  const initEnd = useCallback(() => {
    rocksRef.current = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < 4; i++) {
        const r = createRock(t, t * 4 + i);
        // Park off-sheet
        r.x = 200 + i * 20;
        r.y = t === 0 ? -60 : 60;
        r.inPlay = false;
        r.active = false;
        rocksRef.current.push(r);
      }
    }
  }, []);

  // --- Collision detection & resolution (fn0299) ---
  const resolveCollisions = useCallback((rocks) => {
    for (let i = 0; i < rocks.length; i++) {
      const a = rocks[i];
      if (!a.inPlay || a.velocity <= 0.05) continue;

      for (let j = 0; j < rocks.length; j++) {
        if (i === j) continue;
        const b = rocks[j];
        if (!b.inPlay) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ROCK_RADIUS * 2;

        if (dist < minDist && dist > 0) {
          // Collision angle
          const collAngle = Math.atan2(b.y - a.y, b.x - a.x);
          const relAngle = Math.abs(Math.sin(collAngle - a.angle));
          const parAngle = Math.abs(Math.cos(collAngle - a.angle));
          const restitution = RESTITUTION[0];

          // Transfer velocity
          b.velocity = a.velocity * parAngle * restitution;
          a.velocity = a.velocity * relAngle * restitution;

          b.angle = collAngle;
          if (a.angle < PI / 2 && collAngle > (3 * PI) / 2) {
            a.angle = collAngle + PI / 2;
          } else if (a.angle > collAngle) {
            a.angle = collAngle + PI / 2;
          } else {
            a.angle = collAngle - PI / 2;
          }
          if (a.angle > 2 * PI) a.angle -= 2 * PI;
          if (a.angle < 0) a.angle += 2 * PI;

          // Separate overlapping rocks
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x += nx * overlap * 0.5;
          a.y += ny * overlap * 0.5;
          b.x -= nx * overlap * 0.5;
          b.y -= ny * overlap * 0.5;

          b.inPlay = true;
          b.active = true;
          b.stopped = false;
          b.friction = a.friction;
        }
      }
    }
  }, []);

  // --- Physics tick (reimplemented adjust_world) ---
  const physicsTick = useCallback(
    (dt) => {
      const rocks = rocksRef.current;
      let anyMoving = false;

      for (const rock of rocks) {
        if (!rock.inPlay || rock.velocity <= 0.02) {
          if (rock.inPlay) rock.stopped = true;
          continue;
        }
        anyMoving = true;
        rock.stopped = false;

        // Deceleration from friction
        const decel = rock.friction * FRICTION_COEFF * dt;
        rock.velocity = Math.max(0, rock.velocity - decel * 0.15);

        // Sweep effect â€” reduces friction
        if (
          sweepingRef.current &&
          rock === deliveryRockRef.current &&
          rock.velocity > 0.5
        ) {
          rock.velocity += dt * 0.3; // sweeping preserves speed slightly
        }

        // Curl deflection
        const curlDeflect = calcCurl(
          Math.abs(rock.x),
          Math.abs(rock.velocity),
          Math.abs(rock.curl) * 0.0008,
          Math.sign(rock.curl),
        );
        rock.y += curlDeflect * dt * 30;

        // Move along trajectory
        const moveX = Math.cos(rock.angle) * rock.velocity * dt * 60;
        const moveY = Math.sin(rock.angle) * rock.velocity * dt * 60;
        rock.x += moveX;
        rock.y += moveY;

        // Boundary checks â€” out of play if past back line or off sides
        if (rock.x < WORLD.backLine - 80) {
          rock.inPlay = false;
          rock.active = false;
          rock.velocity = 0;
          rock.x = 800; // park off screen
        }
        if (Math.abs(rock.y) > 75) {
          // Bounce off side boards gently
          rock.y = Math.sign(rock.y) * 74;
          rock.angle = PI - rock.angle + PI;
          rock.velocity *= 0.4;
        }
        // Through the house without stopping
        if (rock.x < WORLD.backLine - 20 && rock.velocity > 0.1) {
          rock.inPlay = false;
          rock.active = false;
          rock.velocity = 0;
          rock.x = 800;
        }
      }

      resolveCollisions(rocks);
      return anyMoving;
    },
    [resolveCollisions],
  );

  // --- Score an end ---
  const scoreEnd = useCallback(() => {
    const rocks = rocksRef.current.filter((r) => r.inPlay);
    const hx = WORLD.houseCenter.x;
    const hy = WORLD.houseCenter.y;
    const maxR = WORLD.houseRadii[3] + ROCK_RADIUS;

    // Find closest rock to button for each team
    const dists = [[], []];
    for (const r of rocks) {
      const d = Math.sqrt((r.x - hx) ** 2 + (r.y - hy) ** 2);
      if (d <= maxR) {
        dists[r.team].push(d);
      }
    }
    dists[0].sort((a, b) => a - b);
    dists[1].sort((a, b) => a - b);

    let scoringTeam = -1;
    let pts = 0;

    if (dists[0].length === 0 && dists[1].length === 0) {
      // Blank end
      scoringTeam = -1;
      pts = 0;
    } else if (dists[1].length === 0) {
      scoringTeam = 0;
      pts = dists[0].length;
    } else if (dists[0].length === 0) {
      scoringTeam = 1;
      pts = dists[1].length;
    } else {
      // Team with closest rock scores
      if (dists[0][0] < dists[1][0]) {
        scoringTeam = 0;
        const threshold = dists[1][0];
        pts = dists[0].filter((d) => d < threshold).length;
      } else {
        scoringTeam = 1;
        const threshold = dists[0][0];
        pts = dists[1].filter((d) => d < threshold).length;
      }
    }

    return { scoringTeam, pts };
  }, []);

  // --- Deliver a rock ---
  const deliverRock = useCallback(() => {
    const teamIdx = currentTeam;
    const rockIdx = Math.floor(rockNum / 2);
    const rock = rocksRef.current.find(
      (r) => r.team === teamIdx && r.id === teamIdx * 4 + rockIdx,
    );
    if (!rock) return;

    rock.x = WORLD.hackPos;
    rock.y = aimAngle * 40; // map aim to cross-sheet position
    rock.angle = PI + aimAngle * 0.08; // slight angle from aim
    rock.velocity = power * 0.14 + 2;
    rock.curl = curlDir * (6 + Math.random() * 2);
    rock.spin = curlDir;
    rock.friction = 0.12;
    rock.inPlay = true;
    rock.active = true;
    rock.stopped = false;

    deliveryRockRef.current = rock;
  }, [currentTeam, rockNum, aimAngle, power, curlDir]);

  // --- Game loop ---
  useEffect(() => {
    if (phase !== "running" && phase !== "sweeping") return;

    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const moving = physicsTick(dt);

      if (!moving) {
        // All rocks stopped
        sweepingRef.current = false;
        deliveryRockRef.current = null;

        const nextRock = rockNum + 1;
        if (nextRock >= 8) {
          // End is over â€” score it
          const result = scoreEnd();
          setEndScoreDisplay(result);

          setScores((prev) => {
            const next = [prev[0].slice(), prev[1].slice()];
            if (result.scoringTeam >= 0) {
              next[result.scoringTeam].push(result.pts);
              next[1 - result.scoringTeam].push(0);
            } else {
              next[0].push(0);
              next[1].push(0);
            }
            return next;
          });

          setPhase("scoring");
        } else {
          setRockNum(nextRock);
          setCurrentTeam(nextRock % 2 === 0 ? 0 : 1);
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

  // --- Aim oscillation ---
  useEffect(() => {
    if (phase !== "aiming") return;
    let t = 0;
    const interval = setInterval(() => {
      t += 0.04;
      setAimAngle(Math.sin(t) * 1.2);
    }, 30);
    return () => clearInterval(interval);
  }, [phase]);

  // --- Power bar ---
  useEffect(() => {
    if (phase !== "power") return;
    let t = 0;
    let dir = 1;
    const interval = setInterval(() => {
      t += dir * 2.5;
      if (t >= 100) dir = -1;
      if (t <= 0) dir = 1;
      setPower(t);
    }, 30);
    return () => clearInterval(interval);
  }, [phase]);

  // --- Canvas rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;

    const W = canvas.width;
    const H = canvas.height;

    // World-to-screen transform (top-down view of the sheet)
    // Sheet runs left-to-right on screen, x = along sheet, y = across
    const toScreen = (wx, wy) => {
      const sx =
        W * 0.5 + (wx - WORLD.houseCenter.x) * (W / (WORLD.sheetLength * 0.9));
      const sy = H * 0.5 + wy * (H / WORLD.sheetWidth) * 0.7;
      return [sx, sy];
    };
    const worldScale = W / (WORLD.sheetLength * 0.9);

    const draw = () => {
      // --- Background ---
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, W, H);

      // --- Ice surface ---
      const sheetLeft = toScreen(-700, -78);
      const sheetRight = toScreen(100, 78);
      const gradient = ctx.createLinearGradient(
        sheetLeft[0],
        0,
        sheetRight[0],
        0,
      );
      gradient.addColorStop(0, "#d8e8f0");
      gradient.addColorStop(0.3, "#e4f0f6");
      gradient.addColorStop(0.7, "#eaf4fa");
      gradient.addColorStop(1, "#dce9f2");
      ctx.fillStyle = gradient;

      const tlSheet = toScreen(-680, -74);
      const brSheet = toScreen(50, 74);
      const shW = brSheet[0] - tlSheet[0];
      const shH = brSheet[1] - tlSheet[1];
      ctx.beginPath();
      const rad = 8;
      ctx.roundRect(tlSheet[0], tlSheet[1], shW, shH, rad);
      ctx.fill();

      // Pebble texture
      ctx.fillStyle = "rgba(180,200,215,0.15)";
      const rng = (seed) => {
        let s = seed;
        return () => {
          s = (s * 16807 + 0) % 2147483647;
          return s / 2147483647;
        };
      };
      const rand = rng(42);
      for (let i = 0; i < 600; i++) {
        const px = tlSheet[0] + rand() * shW;
        const py = tlSheet[1] + rand() * shH;
        ctx.beginPath();
        ctx.arc(px, py, 0.8 + rand() * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- Lines ---
      const drawLine = (wx, color, width = 1.5) => {
        const [sx1, sy1] = toScreen(wx, -74);
        const [sx2, sy2] = toScreen(wx, 74);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      };

      // Hog lines
      drawLine(WORLD.hogLine, "#cc2233", 2.5);
      drawLine(-WORLD.hogLine - 760, "#cc2233", 2.5); // far hog

      // Tee line
      drawLine(WORLD.tLine, "#334466", 1.5);

      // Back line
      drawLine(WORLD.backLine, "#334466", 1.5);

      // Center line
      const [clStart] = toScreen(-680, 0);
      const [clEnd] = toScreen(50, 0);
      const clY = toScreen(0, 0)[1];
      ctx.strokeStyle = "#334466";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(toScreen(-680, 0)[0], clY);
      ctx.lineTo(toScreen(50, 0)[0], clY);
      ctx.stroke();

      // --- House (rings) ---
      const houseColors = [
        {
          r: WORLD.houseRadii[3],
          fill: "rgba(30,90,180,0.25)",
          stroke: "rgba(30,90,180,0.5)",
        },
        {
          r: WORLD.houseRadii[2],
          fill: "rgba(220,230,240,0.5)",
          stroke: "rgba(180,190,200,0.4)",
        },
        {
          r: WORLD.houseRadii[1],
          fill: "rgba(200,40,40,0.25)",
          stroke: "rgba(200,40,40,0.45)",
        },
        {
          r: WORLD.houseRadii[0],
          fill: "rgba(220,230,240,0.6)",
          stroke: "rgba(180,190,200,0.5)",
        },
      ];
      for (const ring of houseColors) {
        const [cx, cy] = toScreen(WORLD.houseCenter.x, WORLD.houseCenter.y);
        const rScreen = ring.r * worldScale;
        ctx.fillStyle = ring.fill;
        ctx.strokeStyle = ring.stroke;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rScreen, rScreen * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Button dot
      const [bx, by] = toScreen(WORLD.houseCenter.x, WORLD.houseCenter.y);
      ctx.fillStyle = "#1a1a2e";
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();

      // --- Hack ---
      const [hackX, hackY] = toScreen(WORLD.hackPos, 0);
      ctx.fillStyle = "#222";
      ctx.fillRect(hackX - 3, hackY - 8, 6, 16);

      // --- Rocks ---
      const teamColors = [
        { fill: "#f0c830", stroke: "#b8941e", glow: "rgba(240,200,48,0.35)" },
        { fill: "#d03030", stroke: "#8b1a1a", glow: "rgba(208,48,48,0.35)" },
      ];

      for (const rock of rocksRef.current) {
        if (!rock.inPlay) continue;
        const [rx, ry] = toScreen(rock.x, rock.y);
        const rr = ROCK_RADIUS * worldScale * 1.1;
        const tc = teamColors[rock.team];

        // Glow for moving rocks
        if (rock.velocity > 0.1) {
          ctx.fillStyle = tc.glow;
          ctx.beginPath();
          ctx.ellipse(rx, ry, rr + 4, (rr + 4) * 0.7, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(rx + 2, ry + 1.5, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rock body
        const rockGrad = ctx.createRadialGradient(
          rx - rr * 0.3,
          ry - rr * 0.2,
          rr * 0.1,
          rx,
          ry,
          rr,
        );
        rockGrad.addColorStop(0, "#fff");
        rockGrad.addColorStop(0.35, tc.fill);
        rockGrad.addColorStop(1, tc.stroke);
        ctx.fillStyle = rockGrad;
        ctx.strokeStyle = tc.stroke;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Handle
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr * 0.45, rr * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- Aiming indicator ---
      if (phase === "aiming" || phase === "power") {
        const [ax, ay] = toScreen(WORLD.hackPos, aimAngle * 40);
        const targetX = WORLD.houseCenter.x;
        const targetY = aimAngle * 40;
        const [tx, ty] = toScreen(targetX, targetY);

        ctx.strokeStyle =
          currentTeam === 0 ? "rgba(240,200,48,0.5)" : "rgba(208,48,48,0.5)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        // Crosshair at target
        ctx.strokeStyle = currentTeam === 0 ? "#f0c830" : "#d03030";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - 12, ty);
        ctx.lineTo(tx + 12, ty);
        ctx.moveTo(tx, ty - 10);
        ctx.lineTo(tx, ty + 10);
        ctx.stroke();
      }

      // --- Sweep indicator ---
      if (
        (phase === "running" || phase === "sweeping") &&
        deliveryRockRef.current?.inPlay
      ) {
        const dr = deliveryRockRef.current;
        if (sweepingRef.current) {
          const [sx, sy] = toScreen(dr.x + 8, dr.y);
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.font = "bold 11px monospace";
          ctx.fillText("ðŸ§¹ SWEEP!", sx, sy - 12);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, aimAngle, currentTeam]);

  // --- Handle click/tap ---
  const handleAction = useCallback(() => {
    if (phase === "title") {
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
        // Team that didn't score gets hammer (first rock advantage inverted)
        const lastScore = endScoreDisplay;
        const nextFirst =
          lastScore && lastScore.scoringTeam >= 0
            ? lastScore.scoringTeam
            : currentTeam;
        setCurrentTeam(nextFirst);
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
    initEnd,
    deliverRock,
    currentEnd,
    totalEnds,
    endScoreDisplay,
    currentTeam,
  ]);

  // --- Curl toggle ---
  const toggleCurl = useCallback(() => {
    setCurlDir((d) => d * -1);
  }, []);

  // --- Calculate totals ---
  const totalScore = (team) => scores[team].reduce((a, b) => a + b, 0);

  // --- Responsive canvas size ---
  const [dims, setDims] = useState({ w: 900, h: 500 });
  useEffect(() => {
    const resize = () => {
      const w = Math.min(window.innerWidth - 32, 1100);
      const h = Math.min(w * 0.52, window.innerHeight - 260);
      setDims({ w: Math.max(600, w), h: Math.max(300, h) });
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const teamName = (t) => (t === 0 ? "Yellow" : "Red");
  const teamColor = (t) => (t === 0 ? "#f0c830" : "#d03030");

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #070b14 0%, #0d1525 40%, #111d33 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        color: "#c8d8e8",
        padding: "12px 16px",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 8,
          width: "100%",
          maxWidth: dims.w,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              background: "linear-gradient(135deg, #e8f0ff, #8ab4f8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CURLING
          </h1>
          <span style={{ fontSize: 10, color: "#4a6080", fontWeight: 500 }}>
            reimagined from WinCurl 2.0
          </span>
        </div>

        {phase !== "title" && phase !== "gameover" && (
          <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
            <span>
              End <strong>{currentEnd}</strong>/{totalEnds}
            </span>
            <span>
              Rock <strong>{Math.floor(rockNum / 2) + 1}</strong>/4
            </span>
          </div>
        )}
      </div>

      {/* Scoreboard */}
      {phase !== "title" && (
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 8,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
            fontSize: 11,
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
                padding: "6px 10px",
                background:
                  currentTeam === t &&
                  phase !== "scoring" &&
                  phase !== "gameover"
                    ? `${teamColor(t)}15`
                    : "transparent",
                borderLeft:
                  t === 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: teamColor(t),
                  marginRight: 8,
                  boxShadow: `0 0 6px ${teamColor(t)}60`,
                }}
              />
              <span style={{ fontWeight: 700, marginRight: 12, minWidth: 50 }}>
                {teamName(t)}
              </span>
              <div style={{ display: "flex", gap: 3 }}>
                {scores[t].map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      padding: "1px 5px",
                      borderRadius: 3,
                      fontWeight: s > 0 ? 700 : 400,
                      color: s > 0 ? teamColor(t) : "#4a6080",
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
                  fontSize: 16,
                  color: teamColor(t),
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
          }}
        />

        {/* Title overlay */}
        {phase === "title" && (
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
            }}
          >
            <div
              style={{
                fontSize: 52,
                fontWeight: 900,
                letterSpacing: "-2px",
                background: "linear-gradient(135deg, #f0c830, #d03030)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: 8,
              }}
            >
              CURLING
            </div>
            <div style={{ fontSize: 11, color: "#4a6080", marginBottom: 24 }}>
              Physics engine reimplemented from WinCurl 2.0 (c.2000)
            </div>
            <div
              style={{
                padding: "10px 32px",
                background:
                  "linear-gradient(135deg, rgba(240,200,48,0.15), rgba(208,48,48,0.15))",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "1px",
              }}
            >
              CLICK TO START
            </div>
          </div>
        )}

        {/* Scoring overlay */}
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
            }}
          >
            <div style={{ fontSize: 14, color: "#6a8aaa", marginBottom: 6 }}>
              End {currentEnd} Result
            </div>
            {endScoreDisplay.scoringTeam >= 0 ? (
              <>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: teamColor(endScoreDisplay.scoringTeam),
                  }}
                >
                  {teamName(endScoreDisplay.scoringTeam)} scores{" "}
                  {endScoreDisplay.pts}!
                </div>
              </>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 700, color: "#6a8aaa" }}>
                Blank end
              </div>
            )}
            <div
              style={{
                marginTop: 16,
                fontSize: 11,
                color: "#4a6080",
              }}
            >
              Click to continue
            </div>
          </div>
        )}

        {/* Game over overlay */}
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
            }}
          >
            <div style={{ fontSize: 14, color: "#6a8aaa", marginBottom: 6 }}>
              Final Score
            </div>
            <div style={{ display: "flex", gap: 32, marginBottom: 16 }}>
              {[0, 1].map((t) => (
                <div key={t} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: teamColor(t),
                    }}
                  >
                    {totalScore(t)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6a8aaa" }}>
                    {teamName(t)}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color:
                  totalScore(0) > totalScore(1)
                    ? teamColor(0)
                    : totalScore(1) > totalScore(0)
                      ? teamColor(1)
                      : "#6a8aaa",
              }}
            >
              {totalScore(0) > totalScore(1)
                ? "Yellow Wins!"
                : totalScore(1) > totalScore(0)
                  ? "Red Wins!"
                  : "Draw!"}
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "#4a6080" }}>
              Click to play again
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginTop: 10,
          width: "100%",
          maxWidth: dims.w,
          minHeight: 48,
        }}
      >
        {/* Phase indicator */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 4,
            background: `${teamColor(currentTeam)}18`,
            border: `1px solid ${teamColor(currentTeam)}30`,
            color: teamColor(currentTeam),
            minWidth: 80,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {phase === "aiming"
            ? "Aim"
            : phase === "power"
              ? "Set Power"
              : phase === "running"
                ? "Tap to Sweep"
                : phase}
        </div>

        {/* Power bar */}
        {phase === "power" && (
          <div
            style={{
              flex: 1,
              height: 18,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 4,
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
                transition: "background 0.1s",
                borderRadius: 4,
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                fontSize: 10,
                fontWeight: 700,
                color: "#c8d8e8",
              }}
            >
              {Math.round(power)}%
            </span>
          </div>
        )}

        {/* Curl toggle */}
        {(phase === "aiming" || phase === "power") && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCurl();
            }}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 4,
              padding: "4px 14px",
              color: "#c8d8e8",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Curl: {curlDir > 0 ? "â†’ In-turn" : "â† Out-turn"}
          </button>
        )}

        {/* Sweep indicator */}
        {phase === "running" && (
          <div
            style={{
              fontSize: 11,
              color: sweepingRef.current ? "#8ef" : "#4a6080",
              fontWeight: sweepingRef.current ? 700 : 400,
            }}
          >
            {sweepingRef.current ? "ðŸ§¹ SWEEPING" : "Click/Tap to sweep"}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div
        style={{
          fontSize: 10,
          color: "#2a3a50",
          marginTop: 8,
          textAlign: "center",
          maxWidth: 500,
          lineHeight: 1.5,
        }}
      >
        {phase === "aiming" &&
          "Click when the aim line is where you want â€” then set power."}
        {phase === "power" && "Click to release at the desired power level."}
        {phase === "running" &&
          "Click to toggle sweeping â€” it helps the rock travel farther and straighter."}
      </div>
    </div>
  );
}
