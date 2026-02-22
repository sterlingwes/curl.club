import { useState, useEffect, useRef, useCallback } from "react";

// Constants
import { PI, ROCK_RADIUS, ROCKS_PER_TEAM, ROCKS_PER_END, WORLD } from "./constants/world";
import { DEFAULTS } from "./constants/physics";
import type { PhysicsTune } from "./constants/physics";
import { THEMES, DEFAULT_THEME } from "./constants/theme";
import type { ThemeName } from "./constants/theme";
import { GRID_COLS, GRID_ROWS } from "./constants/grid";

// Ice system
import { IceGrid, cellFriction } from "./ice/grid";
import { ICE_PROFILES, DEFAULT_PROFILE } from "./ice/profiles";
import type { IceProfileKey } from "./types";

// Physics
import { physicsTick, deliverRock } from "./physics/engine";

// Game logic
import { createRocksForEnd, scoreEnd } from "./game/state";

// Renderers
import { drawPerspective } from "./renderers/perspective";

// Components
import { Slider } from "./components/Slider";

// Types
import type { Rock, GamePhase, EndScore, Dimensions } from "./types";

// Main game component
export default function CurlingGame() {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const perspCanvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const iceGridRef = useRef<IceGrid>(new IceGrid());
  const rocksRef = useRef<Rock[]>([]);
  const deliveryRockRef = useRef<Rock | null>(null);
  const sweepingRef = useRef(false);

  // State
  const [phase, setPhase] = useState<GamePhase>("title");
  const [currentEnd, setCurrentEnd] = useState(1);
  const [totalEnds] = useState(8);
  const [currentTeam, setCurrentTeam] = useState(0);
  const [rockNum, setRockNum] = useState(0);
  const [scores, setScores] = useState<number[][]>([[], []]);
  const [endScoreDisplay, setEndScoreDisplay] = useState<EndScore | null>(null);
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [curlDir, setCurlDir] = useState(1);
  const [isNarrowLayout, setIsNarrowLayout] = useState(true);
  const [iceProfile, setIceProfile] = useState<IceProfileKey>(DEFAULT_PROFILE);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const theme = THEMES[themeName] ?? THEMES[DEFAULT_THEME]!;
  const [tune, setTune] = useState<PhysicsTune>({ ...DEFAULTS });
  const [dims, setDims] = useState<Dimensions>({ w: 900, h: 500 });
  const [perspDims, setPerspDims] = useState<Dimensions>({ w: 400, h: 400 });

  const setT = (key: keyof PhysicsTune, val: number) =>
    setTune((prev) => ({ ...prev, [key]: val }));

  // Initialize ice
  const initIce = useCallback((pk: IceProfileKey) => {
    const g = new IceGrid();
    const profile = ICE_PROFILES[pk];
    if (profile) {
      profile.init(g);
    }
    iceGridRef.current = g;
  }, []);

  // Initialize end
  const initEnd = useCallback(() => {
    rocksRef.current = createRocksForEnd();
  }, []);

  // Handle tap action
  const handleAction = useCallback(() => {
    if (phase === "title") {
      initIce(iceProfile);
      initEnd();
      setPhase("aiming");
      return;
    }
    if (phase === "aiming") {
      setPhase("power");
      return;
    }
    if (phase === "power") {
      const ti = currentTeam;
      const ri = Math.floor(rockNum / 2);
      const rock = rocksRef.current.find(
        (r) => r.team === ti && r.id === ti * ROCKS_PER_TEAM + ri,
      );
      if (rock) {
        deliverRock(rock, aimAngle, power, curlDir);
        deliveryRockRef.current = rock;
      }
      setPhase("running");
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
          endScoreDisplay && endScoreDisplay.scoringTeam >= 0
            ? endScoreDisplay.scoringTeam
            : currentTeam;
        setCurrentTeam(nf);
        setRockNum(0);
        initEnd();
        initIce(iceProfile);
        setEndScoreDisplay(null);
        setPhase("aiming");
        setAimAngle(0);
        setPower(0);
      }
      return;
    }
    if (phase === "gameover") {
      setScores([[], []]);
      setCurrentEnd(1);
      setCurrentTeam(0);
      setRockNum(0);
      setEndScoreDisplay(null);
      setPhase("title");
    }
  }, [
    phase,
    currentTeam,
    rockNum,
    aimAngle,
    power,
    curlDir,
    currentEnd,
    totalEnds,
    endScoreDisplay,
    initEnd,
    initIce,
    iceProfile,
  ]);

  // Physics loop
  useEffect(() => {
    if (phase !== "running") return;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const anyMoving = physicsTick(
        dt,
        rocksRef.current,
        iceGridRef.current,
        tune,
        deliveryRockRef.current,
        sweepingRef.current,
      );

      if (!anyMoving) {
        sweepingRef.current = false;
        deliveryRockRef.current = null;
        const next = rockNum + 1;
        if (next >= ROCKS_PER_END) {
          const res = scoreEnd(rocksRef.current);
          setEndScoreDisplay(res);
          setScores((prev) => {
            const n: [number[], number[]] = [
              prev[0]?.slice() ?? [],
              prev[1]?.slice() ?? [],
            ];
            if (res.scoringTeam >= 0) {
              n[res.scoringTeam]!.push(res.pts);
              n[1 - res.scoringTeam]!.push(0);
            } else {
              n[0]!.push(0);
              n[1]!.push(0);
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
        }
        return;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [phase, rockNum, tune]);

  // Aiming oscillation
  useEffect(() => {
    if (phase !== "aiming") return;
    let t = 0;
    const max = WORLD.sheetHalfWidth - ROCK_RADIUS - 2;
    const iv = setInterval(() => {
      t += 0.03;
      setAimAngle(Math.sin(t) * max);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  // Power oscillation
  useEffect(() => {
    if (phase !== "power") return;
    let t = 0;
    const iv = setInterval(() => {
      t += 0.04;
      setPower(30 + 40 * (1 + Math.sin(t)) / 2);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  // Resize handler
  useEffect(() => {
    const resize = () => {
      const totalWidth = window.innerWidth - 32;
      const mh = window.innerHeight - 260;
      setIsNarrowLayout(window.innerWidth < 500);

      if (isNarrowLayout) {
        // Narrow layout: stack vertically
        setPerspDims({ w: totalWidth, h: 300 });
        setDims({ w: totalWidth, h: 120 });
      } else {
        // Wide layout: side by side
        // Overhead is fixed small width, perspective takes remaining
        const overheadW = 200;
        const gap = 8;
        const perspW = totalWidth - overheadW - gap;

        // Overhead height based on sheet aspect ratio (~4.45:1)
        // But we're zooming on house so use ~3:1
        const overheadH = Math.min(mh / 2, overheadW * 0.6);
        const perspH = mh;

        setDims({ w: overheadW, h: overheadH });
        setPerspDims({ w: perspW, h: perspH });
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [isNarrowLayout]);

  // Main canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const perspCanvas = perspCanvasRef.current;
    if (!canvas || !perspCanvas) return;
    const ctx = canvas.getContext("2d");
    const perspCtx = perspCanvas.getContext("2d");
    if (!ctx || !perspCtx) return;

    let raf: number | undefined;
    const W = canvas.width;
    const H = canvas.height;

    // Overhead view - scale to fill width, crop height, center on house
    const e = WORLD.sheetHalfWidth;
    const yRange = e * 2; // 164 - sheet width

    // Scale to fit sheet width to canvas width (fills horizontally)
    const uScale = (W * 0.95) / yRange;

    // Center vertically on house area
    const wcx = WORLD.houseCenter.x;
    const wcy = 0;

    // Convert world coords to screen coords
    // World Y maps to screen X (horizontal)
    // World X maps to screen Y (vertical, with hack at TOP)
    const toS = (wx: number, wy: number): [number, number] =>
      [W / 2 + (wy - wcy) * uScale, H / 2 + (wx - wcx) * uScale];
    const r2s = (wr: number): number => wr * uScale;
    const T = tune;
    const grid = iceGridRef.current;

    const buildOverlay = () => {
      const oc = document.createElement("canvas");
      oc.width = GRID_COLS;
      oc.height = GRID_ROWS;
      const octx = oc.getContext("2d");
      if (!octx) return oc;
      const id = octx.createImageData(GRID_COLS, GRID_ROWS);
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c]?.[r];
          if (!cell) continue;
          const idx = (r * GRID_COLS + c) * 4;
          const wear = 1 - Math.max(0, Math.min(1, cell.pebbleHeight));
          const fric = cellFriction(cell, T.baseFriction, T.pebbleFrictionBonus);
          const sm = Math.sqrt(cell.slopeX ** 2 + cell.slopeY ** 2);
          if (showOverlay) {
            const fn = Math.max(0, Math.min(1, (fric - 0.05) / 0.15));
            id.data[idx] = Math.floor(fn * 200 + sm * 8000);
            id.data[idx + 1] = Math.floor((1 - wear) * 140);
            id.data[idx + 2] = Math.floor(cell.moisture * 255 + (cell.temperature < -1 ? 60 : 0));
            id.data[idx + 3] = 160;
          } else {
            id.data[idx] = Math.floor(wear * 60);
            id.data[idx + 1] = Math.floor(wear * 40);
            id.data[idx + 2] = Math.floor(cell.moisture * 120);
            id.data[idx + 3] = Math.floor(wear * 100 + cell.moisture * 80);
          }
        }
      }
      octx.putImageData(id, 0, 0);
      return oc;
    };

    const drawArrow = (sx: number, sy: number, dx: number, dy: number, color: string, label?: string): void => {
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.3) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + dx, sy + dy);
      ctx.stroke();
      const ang = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(sx + dx, sy + dy);
      ctx.lineTo(sx + dx - Math.cos(ang - 0.5) * 4, sy + dy - Math.sin(ang - 0.5) * 4);
      ctx.lineTo(sx + dx - Math.cos(ang + 0.5) * 4, sy + dy - Math.sin(ang + 0.5) * 4);
      ctx.closePath();
      ctx.fill();
      if (label) {
        ctx.font = "8px " + theme.font;
        ctx.fillText(label, sx + dx + 3, sy + dy);
      }
    };

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = theme.canvasBg;
      ctx.fillRect(0, 0, W, H);

      // Draw sheet background
      const ig = ctx.createLinearGradient(0, 0, 0, H);
      ig.addColorStop(0, theme.sheetGradient[0]!);
      ig.addColorStop(0.5, theme.sheetGradient[1]!);
      ig.addColorStop(1, theme.sheetGradient[2]!);
      ctx.fillStyle = ig;

      const [left, top] = toS(WORLD.sheetStart, -e);
      const [right, bottom] = toS(WORLD.sheetEnd, e);
      const sheetW = right - left;
      const sheetH = bottom - top;
      ctx.beginPath();
      ctx.roundRect(left, top, sheetW, sheetH, theme.sheetRadius);
      ctx.fill();

      // Draw pebble dots
      ctx.fillStyle = theme.pebbleDots;
      for (let i = 0; i < 800; i++) {
        const px = left + Math.random() * sheetW;
        const py = top + Math.random() * sheetH;
        ctx.fillRect(px, py, 1, 1);
      }

      // Draw overlay
      if (showOverlay || showDebug) {
        const overlay = buildOverlay();
        ctx.globalAlpha = 0.4;
        ctx.drawImage(overlay, left, top, sheetW, sheetH);
        ctx.globalAlpha = 1;
      }

      // Draw lines
      const drawWL = (wx: number, color: string, w: number): void => {
        const [x1, y1] = toS(wx, -e);
        const [x2, y2] = toS(wx, e);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };

      drawWL(WORLD.hogLine, theme.hogLine, theme.lineWidth.hog);
      drawWL(WORLD.tLine, theme.tLine, theme.lineWidth.tee);
      drawWL(WORLD.backLine, theme.backLine, theme.lineWidth.back);

      // Center line
      ctx.strokeStyle = theme.centerLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const [c1x, c1y] = toS(WORLD.sheetStart, 0);
      const [c2x, c2y] = toS(WORLD.sheetEnd, 0);
      ctx.moveTo(c1x, c1y);
      ctx.lineTo(c2x, c2y);
      ctx.stroke();

      // Draw house rings
      const [hcx, hcy] = toS(WORLD.houseCenter.x, WORLD.houseCenter.y);
      for (const [r, fill, stroke, lw] of theme.houseRings) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(hcx, hcy, r2s(r), 0, PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Button
      ctx.fillStyle = theme.buttonFill;
      ctx.beginPath();
      ctx.arc(hcx, hcy, Math.max(2, r2s(1.2)), 0, PI * 2);
      ctx.fill();

      // Crosshairs
      if (theme.houseCrosshairs) {
        const cr = r2s(75);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(hcx - cr, hcy);
        ctx.lineTo(hcx + cr, hcy);
        ctx.moveTo(hcx, hcy - cr);
        ctx.lineTo(hcx, hcy + cr);
        ctx.stroke();
      }

      // Draw hack
      const [hkx, hky] = toS(WORLD.hackPos, 0);
      const hs = r2s(3);
      ctx.fillStyle = theme.hackFill;
      ctx.fillRect(hkx - hs * 2, hky - hs / 2, hs * 4, hs);

      // Draw rocks
      const tcA = theme.teams;
      for (const rock of rocksRef.current) {
        if (!rock.inPlay) continue;
        const [rx, ry] = toS(rock.x, rock.y);
        const rr = r2s(ROCK_RADIUS) * 1.05;
        const c = tcA[rock.team];
        if (!c) continue;

        // Motion glow
        if (rock.velocity > 0.1) {
          ctx.fillStyle = c.g;
          ctx.beginPath();
          ctx.arc(rx, ry, rr + 3, 0, PI * 2);
          ctx.fill();
        }

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.arc(rx + 1, ry + 1, rr, 0, PI * 2);
        ctx.fill();

        // Rock body
        if (theme.rockGradient) {
          const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
          rg.addColorStop(0, "#fff");
          rg.addColorStop(0.35, c.f);
          rg.addColorStop(1, c.s);
          ctx.fillStyle = rg;
        } else {
          ctx.fillStyle = c.f;
        }
        ctx.strokeStyle = c.s;
        ctx.lineWidth = theme.rockGradient ? 1 : 2;
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, PI * 2);
        ctx.fill();
        ctx.stroke();

        // Handle
        ctx.strokeStyle = theme.rockStroke;
        ctx.lineWidth = theme.rockHandleWidth;
        ctx.beginPath();
        ctx.arc(rx, ry, rr * 0.4, 0, PI * 2);
        ctx.stroke();
      }

      // Draw reserve rocks
      for (let t = 0; t < 2; t++) {
        const teamColors = tcA[t];
        if (!teamColors) continue;
        const rem = rocksRef.current.filter((r) => r.team === t && !r.inPlay && r.x >= 200).length;
        for (let i = 0; i < rem; i++) {
          const py = (t === 0 ? -1 : 1) * (e + 10 + i * ROCK_RADIUS * 2.4);
          const [px, py2] = toS(WORLD.hackPos + 30, py);
          const pr = r2s(ROCK_RADIUS) * 0.6;
          ctx.fillStyle = teamColors.f + "45";
          ctx.strokeStyle = teamColors.s + "25";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(px, py2, pr, 0, PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Draw aim line
      if (phase === "aiming" || phase === "power") {
        const [ax, ay] = toS(WORLD.hackPos, aimAngle);
        const [tx, ty] = toS(WORLD.houseCenter.x, aimAngle);
        const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
        ctx.strokeStyle = `rgba(${col},0.35)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      // Draw debug arrows
      if (showDebug) {
        for (const rock of rocksRef.current) {
          if (!rock.inPlay || rock.velocity < 0.02) continue;
          const [sx, sy] = toS(rock.x, rock.y);
          if (Math.abs(rock.dbg.spinCurl) > 0.001) {
            drawArrow(sx, sy, 0, rock.dbg.spinCurl * 50, "rgba(0,200,0,0.6)");
          }
          if (Math.abs(rock.dbg.gradDrift) > 0.001) {
            drawArrow(sx, sy + 8, 0, rock.dbg.gradDrift * 50, "rgba(0,0,200,0.6)");
          }
        }
      }

      // Draw perspective view
      drawPerspective(perspCtx, perspDims.w, perspDims.h, {
        WORLD,
        ROCK_RADIUS,
        rocks: rocksRef.current,
        deliveryRock: deliveryRockRef.current,
        sweeping: sweepingRef.current,
        phase,
        aimAngle,
        currentTeam,
        theme,
      });

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      if (raf !== undefined) {
        cancelAnimationFrame(raf);
      }
    };
  }, [phase, aimAngle, currentTeam, showOverlay, showDebug, tune, theme, dims, perspDims, isNarrowLayout]);

  // Helper functions for UI
  const totalScore = (t: number): number => scores[t]?.reduce((a, b) => a + b, 0) ?? 0;
  const tn = (t: number): string => theme.teams[t]?.name ?? "";
  const tCol = (t: number): string => theme.teams[t]?.f ?? "";

  return (
    <div
      style={{
        background: theme.pageBg,
        minHeight: "100vh",
        fontFamily: theme.font,
        color: theme.textColor,
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      {/* Title screen */}
      {phase === "title" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: theme.titleBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <h1
            style={{
              fontSize: theme.titleFont,
              fontWeight: theme.titleWeight,
              background: theme.titleGradient,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: 40,
            }}
          >
            CURL.CLUB
          </h1>
          <button
            onClick={handleAction}
            style={{
              background: theme.startBtnBg,
              border: theme.startBtnBorder || "none",
              borderRadius: theme.btnRadius,
              padding: "12px 40px",
              fontSize: 18,
              cursor: "pointer",
              color: theme.btnColor,
            }}
          >
            Start Game
          </button>
        </div>
      )}

      {/* Score bar - at top */}
      {phase !== "title" && (
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 4,
            background: theme.scoreBg,
            borderRadius: theme.btnRadius + 2,
            border: theme.scoreBorder,
            overflow: "hidden",
            fontSize: 10,
            width: "100%",
            maxWidth: perspDims.w,
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
                background: currentTeam === t ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: tCol(t),
                  marginRight: 5,
                }}
              />
              <span style={{ fontWeight: 700, marginRight: 6, fontSize: 9 }}>{tn(t)}</span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {(scores[t] ?? []).map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: theme.btnBg,
                      border: theme.btnBorder,
                      borderRadius: 2,
                      padding: "1px 4px",
                      fontSize: 9,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <span style={{ marginLeft: "auto", fontWeight: 700 }}>{totalScore(t)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Canvases with power bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: isNarrowLayout ? "wrap" : "nowrap",
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          <canvas
            ref={perspCanvasRef}
            width={perspDims.w}
            height={perspDims.h}
            style={{
              border: theme.canvasBorder,
              borderRadius: theme.btnRadius,
              cursor: "pointer",
            }}
            onClick={handleAction}
          />
          {/* Power bar */}
          {phase === "power" && (
            <div
              style={{
                width: 20,
                height: perspDims.h,
                background: "rgba(0,0,0,0.3)",
                borderRadius: theme.btnRadius,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${power}%`,
                  background: `linear-gradient(to top, #22c55e, #eab308, #ef4444)`,
                  borderRadius: theme.btnRadius,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: `${power}%`,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontSize: 8,
                  color: "#fff",
                  transform: "translateY(50%)",
                }}
              >
                {Math.round(power)}%
              </div>
            </div>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={dims.w}
          height={dims.h}
          style={{
            border: theme.canvasBorder,
            borderRadius: theme.btnRadius,
            cursor: "pointer",
          }}
          onClick={handleAction}
        />
      </div>

      {/* Controls */}
      {phase !== "title" && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setThemeName(themeName === "modern" ? "wincurl" : "modern")}
            style={{
              background: theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: theme.btnColor,
              cursor: "pointer",
            }}
          >
            🎨
          </button>
          <button
            onClick={() => setCurlDir(curlDir === 1 ? -1 : 1)}
            style={{
              background: theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: theme.btnColor,
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            {curlDir === 1 ? "↻ CW" : "↺ CCW"}
          </button>
          <button
            onClick={() => setShowProfilePicker(!showProfilePicker)}
            style={{
              background: theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: theme.btnColor,
              cursor: "pointer",
            }}
          >
            🧊 {ICE_PROFILES[iceProfile]?.name}
          </button>
          <button
            onClick={() => setShowOverlay(!showOverlay)}
            style={{
              background: showOverlay ? theme.btnColor : theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: showOverlay ? theme.btnBg : theme.btnColor,
              cursor: "pointer",
            }}
          >
            📊
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            style={{
              background: showDebug ? theme.btnColor : theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: showDebug ? theme.btnBg : theme.btnColor,
              cursor: "pointer",
            }}
          >
            🔧
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: theme.btnBg,
              border: theme.btnBorder,
              borderRadius: theme.btnRadius,
              padding: "4px 8px",
              color: theme.btnColor,
              cursor: "pointer",
            }}
          >
            ⚙️
          </button>
        </div>
      )}

      {/* Profile picker */}
      {showProfilePicker && (
        <div
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.btnRadius,
            padding: 8,
            marginBottom: 4,
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            width: "100%",
            maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
          }}
        >
          {Object.entries(ICE_PROFILES).map(([k, p]) => (
            <button
              key={k}
              onClick={() => {
                setIceProfile(k as IceProfileKey);
                setShowProfilePicker(false);
              }}
              style={{
                background: iceProfile === k ? theme.btnColor : theme.btnBg,
                border: theme.btnBorder,
                borderRadius: theme.btnRadius,
                padding: "4px 8px",
                color: iceProfile === k ? theme.btnBg : theme.btnColor,
                cursor: "pointer",
                fontSize: 9,
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Advanced controls */}
      {showAdvanced && (
        <div
          style={{
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.btnRadius,
            padding: 8,
            marginBottom: 4,
            width: "100%",
            maxWidth: 300,
          }}
        >
          <Slider
            label="Spin Curl"
            value={tune.curlCoeff}
            min={0}
            max={200}
            step={1}
            theme={theme}
            onChange={(v) => setT("curlCoeff", v)}
          />
          <Slider
            label="Grad Drift"
            value={tune.gradientCoeff}
            min={0}
            max={50}
            step={0.5}
            theme={theme}
            onChange={(v) => setT("gradientCoeff", v)}
          />
          <Slider
            label="Slope Grav"
            value={tune.slopeGravity}
            min={0}
            max={80}
            step={1}
            theme={theme}
            onChange={(v) => setT("slopeGravity", v)}
          />
          <Slider
            label="Friction Dec"
            value={tune.frictionDecel}
            min={1}
            max={30}
            step={0.5}
            theme={theme}
            onChange={(v) => setT("frictionDecel", v)}
          />
        </div>
      )}

      {/* Status */}
      {phase !== "title" && (
        <div
          style={{
            fontSize: 10,
            color: theme.dimText,
            marginTop: 4,
          }}
        >
          End {currentEnd}/{totalEnds} • Rock {rockNum + 1}/{ROCKS_PER_END} •{" "}
          {phase === "aiming"
            ? "Tap to lock aim"
            : phase === "power"
              ? "Tap to lock power"
              : phase === "running"
                ? "Tap to sweep"
                : phase === "scoring"
                  ? "Tap to continue"
                  : phase}
        </div>
      )}

      {/* Scoring overlay */}
      {phase === "scoring" && endScoreDisplay && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: theme.overlayBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={handleAction}
        >
          <div
            style={{
              background: theme.panelBg,
              border: theme.panelBorder,
              borderRadius: theme.btnRadius * 2,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              {endScoreDisplay.scoringTeam >= 0
                ? `${tn(endScoreDisplay.scoringTeam)} scores ${endScoreDisplay.pts}`
                : "Blank end"}
            </div>
            <div style={{ fontSize: 10, color: theme.dimText }}>Tap to continue</div>
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {phase === "gameover" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: theme.overlayBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={handleAction}
        >
          <div
            style={{
              background: theme.panelBg,
              border: theme.panelBorder,
              borderRadius: theme.btnRadius * 2,
              padding: 20,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Game Over</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>
              {totalScore(0) > totalScore(1)
                ? `${tn(0)} wins!`
                : totalScore(1) > totalScore(0)
                  ? `${tn(1)} wins!`
                  : "It's a tie!"}
            </div>
            <div style={{ fontSize: 12 }}>
              {tn(0)}: {totalScore(0)} • {tn(1)}: {totalScore(1)}
            </div>
            <div style={{ fontSize: 10, color: theme.dimText, marginTop: 8 }}>Tap to play again</div>
          </div>
        </div>
      )}
    </div>
  );
}
