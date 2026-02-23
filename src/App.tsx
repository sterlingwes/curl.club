import { useState, useEffect, useRef, useCallback } from "react";

// Constants
import { ROCK_RADIUS, ROCKS_PER_TEAM, ROCKS_PER_END, WORLD } from "./constants/world";
import { DEFAULTS } from "./constants/physics";
import type { PhysicsTune } from "./constants/physics";
import { THEMES, DEFAULT_THEME } from "./constants/theme";
import type { ThemeName } from "./constants/theme";

// Ice system
import { IceGrid } from "./ice/grid";
import { ICE_PROFILES, DEFAULT_PROFILE } from "./ice/profiles";
import type { IceProfileKey } from "./types";

// Physics
import { physicsTick, deliverRock } from "./physics/engine";

// Game logic
import { createRocksForEnd, scoreEnd } from "./game/state";

// Renderers
import { drawPerspective } from "./renderers/perspective";
import { drawOverhead } from "./renderers/overhead";

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

    const draw = () => {
      // Draw overhead view
      drawOverhead(ctx, W, H, {
        WORLD,
        ROCK_RADIUS,
        rocks: rocksRef.current,
        phase,
        aimAngle,
        currentTeam,
        theme,
        showOverlay,
        showDebug,
        tune,
        grid: iceGridRef.current,
      });

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
  }, [phase, aimAngle, currentTeam, showOverlay, showDebug, tune, theme, dims, perspDims]);

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
