import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// WINCURL REIMPLEMENTATION â€” Physics reverse-engineered from
// the original VB3 source. Canvas2D rendering (maps to Skia).
// ============================================================

const PI = Math.PI;
const ROCK_RADIUS = 5;
const FRICTION_COEFF = 64;
const RESTITUTION = [0.92, 0.85, 0.78];
const CURL_ZONE = 66;
const CURL_INNER = 8.4;
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

function createRock(team, id) {
  return {
    id, team, x: 0, y: 0, angle: 0, velocity: 0,
    friction: 0.12, curl: 0, spin: 1,
    inPlay: false, active: false, stopped: false, hasContacted: false,
  };
}

function calcCurl(posAlongSheet, distanceTraveled, curlAmount, curlSign) {
  if (posAlongSheet >= CURL_ZONE) return 0;
  const distInZone = distanceTraveled > CURL_ZONE
    ? CURL_ZONE - posAlongSheet : distanceTraveled - posAlongSheet;
  if (distInZone <= 0) return 0;
  const ratio = distInZone / CURL_ZONE;
  const deflection = ratio * curlAmount;
  if (Math.abs(deflection) <= 0) return 0;
  let result = -curlSign * deflection;
  if (posAlongSheet < CURL_INNER && distanceTraveled > CURL_INNER) {
    result *= (2 - (CURL_INNER - posAlongSheet) / (distInZone + 1e-8)) / 2;
  } else if (posAlongSheet < CURL_INNER) {
    result /= 2;
  }
  return result;
}

export default function CurlingGame() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

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

  const rocksRef = useRef([]);
  const deliveryRockRef = useRef(null);
  const sweepingRef = useRef(false);

  const initEnd = useCallback(() => {
    rocksRef.current = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < ROCKS_PER_TEAM; i++) {
        const r = createRock(t, t * ROCKS_PER_TEAM + i);
        r.x = 200 + i * 20; r.y = t === 0 ? -60 : 60;
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
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = ROCK_RADIUS * 2;
        if (dist < minDist && dist > 0) {
          const nx = (b.x - a.x) / dist, ny = (b.y - a.y) / dist;
          const avx = Math.cos(a.angle) * a.velocity, avy = Math.sin(a.angle) * a.velocity;
          const bvx = Math.cos(b.angle) * b.velocity, bvy = Math.sin(b.angle) * b.velocity;
          const relVel = (avx - bvx) * nx + (avy - bvy) * ny;
          if (relVel > 0) {
            const imp = relVel * RESTITUTION[0];
            const nax = avx - imp * nx, nay = avy - imp * ny;
            const nbx = bvx + imp * nx, nby = bvy + imp * ny;
            a.velocity = Math.sqrt(nax * nax + nay * nay);
            b.velocity = Math.sqrt(nbx * nbx + nby * nby);
            if (a.velocity > 0.01) a.angle = Math.atan2(nay, nax);
            if (b.velocity > 0.01) b.angle = Math.atan2(nby, nbx);
          }
          const ol = minDist - dist;
          a.x += (dx / dist) * ol * 0.5; a.y += (dy / dist) * ol * 0.5;
          b.x -= (dx / dist) * ol * 0.5; b.y -= (dy / dist) * ol * 0.5;
          b.inPlay = true; b.active = true; b.stopped = false; b.friction = a.friction;
          a.hasContacted = true; b.hasContacted = true;
        }
      }
    }
  }, []);

  const removeRock = (rock) => {
    rock.inPlay = false; rock.active = false; rock.velocity = 0; rock.x = 800;
  };

  const physicsTick = useCallback((dt) => {
    const rocks = rocksRef.current;
    let anyMoving = false;
    for (const rock of rocks) {
      if (!rock.inPlay || rock.velocity <= 0.02) {
        if (rock.inPlay) rock.stopped = true;
        continue;
      }
      anyMoving = true; rock.stopped = false;
      rock.velocity = Math.max(0, rock.velocity - rock.friction * FRICTION_COEFF * dt * 0.15);
      if (sweepingRef.current && rock === deliveryRockRef.current && rock.velocity > 0.5)
        rock.velocity += dt * 0.3;
      rock.y += calcCurl(Math.abs(rock.x), Math.abs(rock.velocity),
        Math.abs(rock.curl) * 0.0008, Math.sign(rock.curl)) * dt * 30;
      rock.x += Math.cos(rock.angle) * rock.velocity * dt * 60;
      rock.y += Math.sin(rock.angle) * rock.velocity * dt * 60;
      if (rock.x - ROCK_RADIUS < WORLD.backLine) { removeRock(rock); continue; }
      if (Math.abs(rock.y) + ROCK_RADIUS > WORLD.sheetHalfWidth) { removeRock(rock); continue; }
      if (rock.velocity <= 0.02 && rock.x > WORLD.hogLine - ROCK_RADIUS && !rock.hasContacted) {
        removeRock(rock); continue;
      }
    }
    resolveCollisions(rocks);
    return anyMoving;
  }, [resolveCollisions]);

  const scoreEnd = useCallback(() => {
    const rocks = rocksRef.current.filter(r => r.inPlay);
    const hx = WORLD.houseCenter.x, hy = WORLD.houseCenter.y;
    const maxR = WORLD.houseRadii[3] + ROCK_RADIUS;
    const dists = [[], []];
    for (const r of rocks) {
      const d = Math.sqrt((r.x - hx) ** 2 + (r.y - hy) ** 2);
      if (d <= maxR) dists[r.team].push(d);
    }
    dists[0].sort((a, b) => a - b); dists[1].sort((a, b) => a - b);
    let scoringTeam = -1, pts = 0;
    if (dists[0].length === 0 && dists[1].length === 0) { /* blank */ }
    else if (dists[1].length === 0) { scoringTeam = 0; pts = dists[0].length; }
    else if (dists[0].length === 0) { scoringTeam = 1; pts = dists[1].length; }
    else if (dists[0][0] < dists[1][0]) { scoringTeam = 0; pts = dists[0].filter(d => d < dists[1][0]).length; }
    else { scoringTeam = 1; pts = dists[1].filter(d => d < dists[0][0]).length; }
    return { scoringTeam, pts };
  }, []);

  const deliverRock = useCallback(() => {
    const teamIdx = currentTeam;
    const rockIdx = Math.floor(rockNum / 2);
    const rock = rocksRef.current.find(r => r.team === teamIdx && r.id === teamIdx * ROCKS_PER_TEAM + rockIdx);
    if (!rock) return;
    rock.x = WORLD.hackPos; rock.y = aimAngle * 30;
    rock.angle = PI + aimAngle * 0.08;
    rock.velocity = power * 0.14 + 2;
    rock.curl = curlDir * (6 + Math.random() * 2);
    rock.spin = curlDir; rock.friction = 0.12;
    rock.inPlay = true; rock.active = true; rock.stopped = false; rock.hasContacted = false;
    deliveryRockRef.current = rock;
  }, [currentTeam, rockNum, aimAngle, power, curlDir]);

  // Game loop
  useEffect(() => {
    if (phase !== "running" && phase !== "sweeping") return;
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
      if (!physicsTick(dt)) {
        sweepingRef.current = false; deliveryRockRef.current = null;
        const next = rockNum + 1;
        if (next >= ROCKS_PER_END) {
          const result = scoreEnd(); setEndScoreDisplay(result);
          setScores(prev => {
            const n = [prev[0].slice(), prev[1].slice()];
            if (result.scoringTeam >= 0) { n[result.scoringTeam].push(result.pts); n[1 - result.scoringTeam].push(0); }
            else { n[0].push(0); n[1].push(0); }
            return n;
          });
          setPhase("scoring");
        } else {
          setRockNum(next); setCurrentTeam(next % 2 === 0 ? 0 : 1);
          setPhase("aiming"); setAimAngle(0); setPower(0); setMessage("");
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
    const iv = setInterval(() => { t += 0.04; setAimAngle(Math.sin(t) * 1.2); }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  useEffect(() => {
    if (phase !== "power") return;
    let t = 0, dir = 1;
    const iv = setInterval(() => { t += dir * 2.5; if (t >= 100) dir = -1; if (t <= 0) dir = 1; setPower(t); }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  // ========== RENDERING ==========
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const W = canvas.width, H = canvas.height;
    const isV = vertical;

    const worldXRange = WORLD.sheetStart - WORLD.sheetEnd;
    const worldYRange = WORLD.sheetHalfWidth * 2;
    const screenLong = isV ? H : W;
    const screenShort = isV ? W : H;
    const uScale = Math.min((screenLong * 0.92) / worldXRange, (screenShort * 0.92) / worldYRange);
    const wcx = (WORLD.sheetStart + WORLD.sheetEnd) / 2;

    const toScreen = (wx, wy) => {
      if (isV) {
        return [W / 2 + wy * uScale, H / 2 - (wx - wcx) * uScale];
      }
      return [W / 2 + (wx - wcx) * uScale, H / 2 - wy * uScale];
    };
    const r2s = (wr) => wr * uScale;

    const draw = () => {
      ctx.fillStyle = "#0a0f1a"; ctx.fillRect(0, 0, W, H);

      // Ice sheet
      const e = WORLD.sheetHalfWidth;
      const tl = toScreen(WORLD.sheetStart, e);
      const br = toScreen(WORLD.sheetEnd, -e);
      const sL = Math.min(tl[0], br[0]), sT = Math.min(tl[1], br[1]);
      const sW = Math.abs(br[0] - tl[0]), sH = Math.abs(br[1] - tl[1]);
      const gr = isV
        ? ctx.createLinearGradient(sL, sT, sL, sT + sH)
        : ctx.createLinearGradient(sL, sT, sL + sW, sT);
      gr.addColorStop(0, "#dce9f2"); gr.addColorStop(0.4, "#eaf4fa");
      gr.addColorStop(0.7, "#e4f0f6"); gr.addColorStop(1, "#d8e8f0");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.roundRect(sL, sT, sW, sH, 5); ctx.fill();

      // Pebble
      ctx.fillStyle = "rgba(180,200,215,0.10)";
      let seed = 42;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 400; i++) {
        ctx.beginPath();
        ctx.arc(sL + rnd() * sW, sT + rnd() * sH, 0.5 + rnd() * 0.4, 0, PI * 2);
        ctx.fill();
      }

      // Lines helper
      const drawWL = (wx, color, w = 1.5) => {
        const [x1, y1] = toScreen(wx, -e), [x2, y2] = toScreen(wx, e);
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };

      drawWL(WORLD.hogLine, "#cc2233", 2.5);   // single hog line
      drawWL(WORLD.tLine, "#33446688", 1.5);    // tee
      drawWL(WORLD.backLine, "#44557799", 2);    // back line

      // Center line
      ctx.strokeStyle = "#33446630"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(...toScreen(WORLD.sheetStart, 0)); ctx.lineTo(...toScreen(WORLD.sheetEnd, 0)); ctx.stroke();

      // House rings
      const rings = [
        { r: 72, f: "rgba(30,90,180,0.20)", s: "rgba(30,90,180,0.40)" },
        { r: 48, f: "rgba(225,232,242,0.40)", s: "rgba(180,190,200,0.30)" },
        { r: 24, f: "rgba(200,40,40,0.20)", s: "rgba(200,40,40,0.35)" },
        { r: 6,  f: "rgba(225,232,242,0.45)", s: "rgba(180,190,200,0.40)" },
      ];
      const [hcx2, hcy2] = toScreen(WORLD.houseCenter.x, WORLD.houseCenter.y);
      for (const ring of rings) {
        const rs = r2s(ring.r);
        ctx.fillStyle = ring.f; ctx.strokeStyle = ring.s; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hcx2, hcy2, rs, 0, PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = "#1a1a2e"; ctx.beginPath();
      ctx.arc(hcx2, hcy2, Math.max(2, r2s(1.2)), 0, PI * 2); ctx.fill();

      // Hack
      const [hkx, hky] = toScreen(WORLD.hackPos, 0);
      const hs = r2s(3);
      ctx.fillStyle = "#222";
      if (isV) ctx.fillRect(hkx - hs * 2, hky - hs / 2, hs * 4, hs);
      else ctx.fillRect(hkx - hs / 2, hky - hs * 2, hs, hs * 4);

      // Rocks
      const tc = [
        { f: "#f0c830", s: "#b8941e", g: "rgba(240,200,48,0.30)" },
        { f: "#d03030", s: "#8b1a1a", g: "rgba(208,48,48,0.30)" },
      ];
      for (const rock of rocksRef.current) {
        if (!rock.inPlay) continue;
        const [rx, ry] = toScreen(rock.x, rock.y);
        const rr = r2s(ROCK_RADIUS) * 1.05;
        const c = tc[rock.team];
        if (rock.velocity > 0.1) {
          ctx.fillStyle = c.g; ctx.beginPath(); ctx.arc(rx, ry, rr + 3, 0, PI * 2); ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.beginPath(); ctx.arc(rx + 1.2, ry + 1.2, rr, 0, PI * 2); ctx.fill();
        const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
        rg.addColorStop(0, "#fff"); rg.addColorStop(0.35, c.f); rg.addColorStop(1, c.s);
        ctx.fillStyle = rg; ctx.strokeStyle = c.s; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(rx, ry, rr, 0, PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#555"; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(rx, ry, rr * 0.4, 0, PI * 2); ctx.stroke();
      }

      // Remaining rocks (parked beside sheet)
      for (let t = 0; t < 2; t++) {
        const rem = rocksRef.current.filter(r => r.team === t && !r.inPlay && r.x >= 200).length;
        for (let i = 0; i < rem; i++) {
          const py = (t === 0 ? -1 : 1) * (e + 10 + i * ROCK_RADIUS * 2.4);
          const [px2, py2] = toScreen(WORLD.hackPos + 30, py);
          const pr = r2s(ROCK_RADIUS) * 0.65;
          ctx.fillStyle = tc[t].f + "50"; ctx.strokeStyle = tc[t].s + "30"; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.arc(px2, py2, pr, 0, PI * 2); ctx.fill(); ctx.stroke();
        }
      }

      // Aim line
      if (phase === "aiming" || phase === "power") {
        const [ax, ay] = toScreen(WORLD.hackPos, aimAngle * 30);
        const [tx2, ty2] = toScreen(WORLD.houseCenter.x, aimAngle * 30);
        const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
        ctx.strokeStyle = `rgba(${col},0.40)`; ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx2, ty2); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${col},0.75)`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(tx2, ty2, 7, 0, PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx2 - 11, ty2); ctx.lineTo(tx2 + 11, ty2);
        ctx.moveTo(tx2, ty2 - 11); ctx.lineTo(tx2, ty2 + 11); ctx.stroke();
      }

      // Sweep text
      if ((phase === "running" || phase === "sweeping") && deliveryRockRef.current?.inPlay && sweepingRef.current) {
        const dr = deliveryRockRef.current;
        const [sx2, sy2] = toScreen(dr.x, dr.y);
        ctx.fillStyle = "rgba(255,255,255,0.65)"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
        ctx.fillText("ðŸ§¹ SWEEP!", sx2, sy2 - r2s(ROCK_RADIUS) - 7); ctx.textAlign = "start";
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, aimAngle, currentTeam, vertical]);

  // Click handler
  const handleAction = useCallback(() => {
    if (phase === "title") {
      initEnd(); setPhase("aiming"); setCurrentTeam(0); setRockNum(0);
      setScores([[], []]); setCurrentEnd(1); setMessage(""); setEndScoreDisplay(null); return;
    }
    if (phase === "aiming") { setPhase("power"); return; }
    if (phase === "power") { deliverRock(); setPhase("running"); sweepingRef.current = false; return; }
    if (phase === "running") { sweepingRef.current = !sweepingRef.current; return; }
    if (phase === "scoring") {
      if (currentEnd >= totalEnds) { setPhase("gameover"); }
      else {
        setCurrentEnd(e => e + 1);
        const nf = endScoreDisplay?.scoringTeam >= 0 ? endScoreDisplay.scoringTeam : currentTeam;
        setCurrentTeam(nf); setRockNum(0); setAimAngle(0); setPower(0);
        setEndScoreDisplay(null); initEnd(); setPhase("aiming");
      }
      return;
    }
    if (phase === "gameover") { setPhase("title"); return; }
  }, [phase, initEnd, deliverRock, currentEnd, totalEnds, endScoreDisplay, currentTeam]);

  const toggleCurl = useCallback(() => setCurlDir(d => d * -1), []);
  const totalScore = (t) => scores[t].reduce((a, b) => a + b, 0);
  const tn = (t) => t === 0 ? "Yellow" : "Red";
  const tCol = (t) => t === 0 ? "#f0c830" : "#d03030";

  const [dims, setDims] = useState({ w: 900, h: 500 });
  useEffect(() => {
    const resize = () => {
      const mw = Math.min(window.innerWidth - 24, 1100), mh = window.innerHeight - 230;
      if (vertical) {
        const w = Math.min(mw, 400), h = Math.min(mh, w * 2.4);
        setDims({ w: Math.max(260, w), h: Math.max(380, h) });
      } else {
        const w = Math.min(mw, 1100), h = Math.min(w * 0.36, mh);
        setDims({ w: Math.max(460, w), h: Math.max(180, h) });
      }
    };
    resize(); window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [vertical]);

  const rockLabel = `${Math.floor(rockNum / 2) + 1}/${ROCKS_PER_TEAM}`;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(145deg, #070b14 0%, #0d1525 40%, #111d33 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
      color: "#c8d8e8", padding: "10px 14px", boxSizing: "border-box", userSelect: "none",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, width: "100%", maxWidth: dims.w, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px", background: "linear-gradient(135deg,#e8f0ff,#8ab4f8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CURLING</h1>
          <span style={{ fontSize: 8, color: "#4a6080" }}>from WinCurl 2.0</span>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, alignItems: "center" }}>
          {phase !== "title" && phase !== "gameover" && (<><span>End <b>{currentEnd}</b>/{totalEnds}</span><span>Rock <b>{rockLabel}</b></span></>)}
          <button onClick={() => setVertical(v => !v)} style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4, padding: "2px 8px", color: "#8ab4f8", fontSize: 9,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>{vertical ? "âŸ· Horizontal" : "âŸ³ Vertical"}</button>
        </div>
      </div>

      {/* Scoreboard */}
      {phase !== "title" && (
        <div style={{ display: "flex", gap: 2, marginBottom: 6, background: "rgba(255,255,255,0.03)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", fontSize: 10, width: "100%", maxWidth: dims.w }}>
          {[0, 1].map(t => (
            <div key={t} style={{ flex: 1, display: "flex", alignItems: "center", padding: "4px 8px", background: currentTeam === t && phase !== "scoring" && phase !== "gameover" ? `${tCol(t)}15` : "transparent", borderLeft: t === 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: tCol(t), marginRight: 6, boxShadow: `0 0 4px ${tCol(t)}60` }} />
              <span style={{ fontWeight: 700, marginRight: 8, minWidth: 40 }}>{tn(t)}</span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {scores[t].map((s, i) => (
                  <span key={i} style={{ background: "rgba(255,255,255,0.06)", padding: "0 3px", borderRadius: 2, fontWeight: s > 0 ? 700 : 400, color: s > 0 ? tCol(t) : "#4a6080", fontSize: 9 }}>{s}</span>
                ))}
              </div>
              <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 14, color: tCol(t) }}>{totalScore(t)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
        <canvas ref={canvasRef} width={dims.w} height={dims.h} onClick={handleAction}
          style={{ borderRadius: 8, cursor: "pointer", border: "1px solid rgba(255,255,255,0.06)", display: "block" }} />

        {phase === "title" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,11,20,0.85)", borderRadius: 8, cursor: "pointer" }} onClick={handleAction}>
            <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-2px", background: "linear-gradient(135deg,#f0c830,#d03030)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>CURLING</div>
            <div style={{ fontSize: 9, color: "#4a6080", marginBottom: 18 }}>Physics engine reimplemented from WinCurl 2.0 (c.2000)</div>
            <div style={{ padding: "8px 28px", background: "linear-gradient(135deg,rgba(240,200,48,0.15),rgba(208,48,48,0.15))", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, fontSize: 11, fontWeight: 600, letterSpacing: "1px" }}>TAP TO START</div>
          </div>
        )}

        {phase === "scoring" && endScoreDisplay && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,11,20,0.75)", borderRadius: 8, cursor: "pointer" }} onClick={handleAction}>
            <div style={{ fontSize: 12, color: "#6a8aaa", marginBottom: 4 }}>End {currentEnd} Result</div>
            {endScoreDisplay.scoringTeam >= 0
              ? <div style={{ fontSize: 24, fontWeight: 800, color: tCol(endScoreDisplay.scoringTeam) }}>{tn(endScoreDisplay.scoringTeam)} scores {endScoreDisplay.pts}!</div>
              : <div style={{ fontSize: 18, fontWeight: 700, color: "#6a8aaa" }}>Blank end</div>}
            <div style={{ marginTop: 12, fontSize: 9, color: "#4a6080" }}>Tap to continue</div>
          </div>
        )}

        {phase === "gameover" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,11,20,0.85)", borderRadius: 8, cursor: "pointer" }} onClick={handleAction}>
            <div style={{ fontSize: 12, color: "#6a8aaa", marginBottom: 4 }}>Final Score</div>
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              {[0, 1].map(t => (<div key={t} style={{ textAlign: "center" }}><div style={{ fontSize: 30, fontWeight: 900, color: tCol(t) }}>{totalScore(t)}</div><div style={{ fontSize: 10, color: "#6a8aaa" }}>{tn(t)}</div></div>))}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: totalScore(0) > totalScore(1) ? tCol(0) : totalScore(1) > totalScore(0) ? tCol(1) : "#6a8aaa" }}>
              {totalScore(0) > totalScore(1) ? "Yellow Wins!" : totalScore(1) > totalScore(0) ? "Red Wins!" : "Draw!"}
            </div>
            <div style={{ marginTop: 12, fontSize: 9, color: "#4a6080" }}>Tap to play again</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7, width: "100%", maxWidth: dims.w, minHeight: 40, flexWrap: "wrap" }}>
        <div style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 3, background: `${tCol(currentTeam)}18`, border: `1px solid ${tCol(currentTeam)}30`, color: tCol(currentTeam), minWidth: 64, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {phase === "aiming" ? "Aim" : phase === "power" ? "Set Power" : phase === "running" ? "Tap to Sweep" : phase}
        </div>
        {phase === "power" && (
          <div style={{ flex: 1, minWidth: 100, height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
            <div style={{ height: "100%", width: `${power}%`, background: power < 40 ? "rgba(100,200,100,0.4)" : power < 75 ? "rgba(240,200,48,0.4)" : "rgba(208,48,48,0.4)", borderRadius: 3 }} />
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 8, fontWeight: 700, color: "#c8d8e8" }}>{Math.round(power)}%</span>
          </div>
        )}
        {(phase === "aiming" || phase === "power") && (
          <button onClick={(e) => { e.stopPropagation(); toggleCurl(); }} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3, padding: "2px 10px", color: "#c8d8e8", fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Curl: {curlDir > 0 ? "â†’ In" : "â† Out"}
          </button>
        )}
        {phase === "running" && (
          <div style={{ fontSize: 9, color: sweepingRef.current ? "#8ef" : "#4a6080", fontWeight: sweepingRef.current ? 700 : 400 }}>
            {sweepingRef.current ? "ðŸ§¹ SWEEPING" : "Tap to sweep"}
          </div>
        )}
      </div>
      <div style={{ fontSize: 8, color: "#2a3a50", marginTop: 5, textAlign: "center", maxWidth: 400, lineHeight: 1.4 }}>
        {phase === "aiming" && "Tap when the aim is where you want â€” then set power."}
        {phase === "power" && "Tap to release at the desired power level."}
        {phase === "running" && "Tap to toggle sweeping â€” keeps the rock moving farther."}
      </div>
    </div>
  );
}