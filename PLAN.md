# Curling Game — UI Refactor Plan

## Project Overview

A curling game (React/Canvas2D, single-file `.jsx` artifact) originally reverse-engineered from **WinCurl 2.0** (a VB3 game from ~2000). It has a full physics engine with ice grid simulation (pebble wear, curl, slope, sweep), collision resolution, 8-end game structure, and scoring.

**Live file:** `curling-game.jsx` (currently ~612 lines, runs as a Claude.ai artifact)

**Test suite:** `test/` directory with headless physics simulator, 18 scenario tests, SVG visualization, and GitHub Actions CI.

**Repo:** `github.com/sterlingwes/curl.club`

---

## Current State (as of Feb 18 2026)

### What's Done

1. **Theming system** — Two themes: `modern` (dark space aesthetic) and `wincurl` (Win3.1 gray chrome, beveled buttons, bold saturated house rings, flat rocks). Toggle via 🎨 button. Theme object controls all canvas colors, UI chrome, and rock rendering style.

2. **Three renderer functions added but not yet wired into layout:**
   - `drawPerspective(ctx, W, H, state)` — 3D behind-the-hack pinhole camera projection. Sheet renders as a trapezoid narrowing toward a vanishing point. Rocks are depth-sorted and scale with distance. House rings render as ellipses. Side boards visible. Sweep corridor renders in perspective.
   - `drawHouseZoom(ctx, W, H, state)` — Zoomed top-down view centered on the 12-foot house at ~3x magnification. Shows rocks in scoring area at larger scale.
   - `drawHouseRings(ctx, cx, cy, r2s, th)` and `drawRockFn(ctx, rx, ry, rr, c, th, moving)` — Shared drawing utilities used by all renderers.

3. **Existing top-down renderer** — The original monolithic `draw()` function inside the rendering `useEffect`. Still works, still the only thing rendered. Has overlay (ice condition heatmap), debug arrows, sweep visuals, aim line, reserve rocks display.

4. **Snapshot tests** — `test/run-snapshots.js` generates SVG visualizations of 18 physics scenarios. SVG uses `viewBox` for proper scaling. Tests validate curl direction, magnitude, symmetry, power range, distribution, sweep effects, and ice profiles.

### What's Not Done Yet

- The new renderers (`drawPerspective`, `drawHouseZoom`) are defined as top-level functions but **no canvas elements or useEffect hooks call them yet**. They need to be wired into the React component.
- Horizontal mode still exists (the `vertical` state toggle). Needs to be removed.
- Power bar is still horizontal at the bottom. Needs to be vertical on the right.
- Layout is still single-canvas. Needs multi-canvas responsive layout.
- Skip/broom targeting not implemented.

---

## Architecture

### File Structure

```
curling-game.jsx          # Single-file React artifact (everything inlined)
test/
  physics-sim.js          # Headless physics simulator (extracted from game)
  scenarios.js            # 18 test scenarios with soft expectations
  run-snapshots.js        # Test runner → JSON traces + SVG visualizations
  snapshots/              # Generated output (SVGs + JSON)
.github/workflows/
  physics-snapshots.yml   # CI workflow
```

### Key Constants

```js
WORLD = {
  sheetHalfWidth: 82, // Half-width of the sheet (y-axis, ±82)
  sheetStart: 50, // Hack end (x-axis, positive = behind hack)
  sheetEnd: -680, // Back wall end
  hogLine: -380, // Hog line x position
  tLine: -540, // Tee line (center of house)
  backLine: -612, // Back line
  hackPos: -100, // Hack position (delivery point)
  houseCenter: { x: -540, y: 0 },
  houseRadii: [6, 24, 48, 72], // Button, 4-foot, 8-foot, 12-foot
};
```

Coordinate system: **x** runs negative from hack toward house. **y** is cross-sheet (±82). Delivery is in the **-x** direction (angle = PI).

### Render State Object

All three renderers accept the same `state` object:

```js
const renderState = {
  WORLD,
  ROCK_RADIUS, // 5
  rocks: rocksRef.current, // Array of rock objects
  deliveryRock: deliveryRockRef.current,
  sweeping: sweepingRef.current,
  phase, // "title"|"aiming"|"power"|"running"|"scoring"|"gameover"
  aimAngle, // Current aim y-position (oscillates during aiming)
  power, // 0-100
  currentTeam, // 0 or 1
  curlDir, // +1 (CW) or -1 (CCW)
  showOverlay, // Ice condition visualization
  showDebug, // Force debug arrows
  tune, // Physics tuning parameters
  theme, // Current theme object from THEMES
  // Only needed by top-down renderer:
  gridConstants: {
    GRID_COLS,
    GRID_ROWS,
    GRID_X_MIN,
    CELL_W,
    CELL_H,
    cellFriction,
  },
  isVertical: true, // Always true after horizontal removal
};
```

### Theme Object Shape

Each theme defines ~30 properties controlling canvas and UI rendering. Key groups:

- **Page:** `pageBg`, `font`, `textColor`, `dimText`, `accentText`
- **Canvas:** `canvasBg`, `sheetGradient` (3 stops), `sheetRadius`, `pebbleDots`
- **Lines:** `hogLine`, `tLine`, `backLine`, `centerLine`, `lineWidth: { hog, tee, back }`
- **House:** `houseRings` (array of `[radius, fill, stroke, lineWidth]`), `buttonFill`, `houseCrosshairs`
- **Rocks:** `teams` (array of `{ f, s, g, name }`), `rockStroke`, `rockHandleWidth`, `rockGradient`
- **UI:** `btnBg`, `btnBorder`, `btnRadius`, `btnColor`, `panelBg`, `panelBorder`, etc.
- **Sweep:** `sweepEmoji` (boolean), `sweepCorridor` (boolean)

---

## Refactor Plan

### Step 1: Wire Up Multi-Canvas Layout ← NEXT

Replace the single `<canvas>` with a responsive layout containing three canvases:

**Narrow breakpoint (<500px, phone portrait):**

```
┌──────────────────────┐
│                      │
│   3D Perspective     │  ← Main view, takes most of the height
│   (behind hack)      │
│                      │
│              ┌──────┐│
│              │House ││  ← Small overlay in corner
│              │Zoom  ││
│              └──────┘│
├──────────────────────┤
│  Controls + Power    │  ← Docked at bottom
└──────────────────────┘
```

**Wide breakpoint (≥500px, tablet/fold):**

```
┌───────────────┬──────────┐
│               │ Top-down │
│  3D           │ minimap  │
│  Perspective  ├──────────┤
│               │  House   │
│               │  Zoom    │
├───────────────┴──────────┤
│  Controls + Power bar    │
└──────────────────────────┘
```

Implementation:

1. Add `perspCanvasRef`, `houseCanvasRef` refs alongside existing `canvasRef`
2. Create a single rendering `useEffect` that calls all three renderers on their respective contexts
3. Use `useState` + `window.innerWidth` for breakpoint detection
4. Remove horizontal mode: delete `vertical` state, remove all `isV`/horizontal branches, hardcode `isVertical: true`
5. Fix `deliverRock` — currently does `rock.spin = vertical ? curlDir : -curlDir`. After removing horizontal, simplify to `rock.spin = curlDir`.
6. Use CSS flexbox for layout. No scrolling — everything fits viewport.

**Key constraint:** This is a Claude.ai artifact — must remain a single `.jsx` file. All components are inlined. No external imports except React hooks.

### Step 2: Vertical Power Bar

Move the power bar from a horizontal bar below the canvas to a vertical bar on the right side of the 3D perspective view.

- Render it as a thin vertical canvas or absolutely-positioned div overlaying the right edge of the perspective canvas
- Fills upward from bottom (0% at bottom, 100% at top)
- Color transitions: green (guard weight) → yellow (draw weight) → red (takeout/peel)
- Show percentage label
- During `phase === "power"`, the fill oscillates up/down; tap to lock

### Step 3: Skip / Broom Targeting

Separate aim from accuracy:

1. **Skip's broom** — A target marker that the player positions on the house before delivery. Tap/drag to place it. This sets the _intended_ line. Visible in both the perspective and house-zoom views as a broom icon or crosshair.

2. **Aim oscillator (accuracy)** — The existing oscillating aim system persists. The oscillating line sweeps left/right. If timed perfectly, the delivery line goes straight to the broom. If off, the rock starts offset from the intended line.

3. **Delivery flow becomes:**
   - Place broom (tap on house area)
   - Set curl direction (CW/CCW toggle)
   - Tap → accuracy oscillator runs → tap to lock aim
   - Power bar oscillates → tap to lock weight
   - Watch delivery + tap to sweep

The broom position determines where the rock _should_ end up. The accuracy oscillator determines how close to that line the delivery actually goes. `rock.y = broomY + accuracyOffset`.

### Step 4: Polish & Future Themes

- Add shot commentary in status bar ("Slightly outside (4"), and a bit heavy" like WinCurl)
- Additional themes: broadcast TV, retro CRT, club house
- Sound effects (optional)
- React Native adaptation (the two-breakpoint layout maps to: perspective = main screen, house zoom = overlay, minimap = swipe-to panel)

---

## Physics Reference

### Curl Mechanics

Rock curls **in the direction it spins** (CW rotation → rightward/+y curl, CCW → leftward/-y curl). This is the opposite of what most people expect but matches real curling physics.

Key formula:

```js
spinCurl = rock.spin × rock.paperTurns × friction × curlCoeff × velocityFactor
velocityFactor = max(0.3, sqrt(v / 2))  // Gradual curl, not end-loaded
```

### Power Curve

```js
velocity = 1.8 + 2.6 × (power/100)^0.5
```

- 35% power → draw weight (lands in house)
- 50% power → firm draw / light takeout
- 85%+ → peel weight

### Delivery

```js
rock.x = WORLD.hackPos; // Start at hack
rock.y = aimAngle; // Cross-sheet position from oscillator
rock.angle = PI; // Straight toward house (-x direction)
rock.spin = curlDir; // +1 CW, -1 CCW (after horizontal removal)
```

---

## Test Suite

Run tests:

```bash
cd test && node run-snapshots.js
```

Outputs:

- `test/snapshots/*.svg` — Per-scenario bird's-eye path visualization
- `test/snapshots/*.json` — Full tick-by-tick trace data
- `test/snapshots/_index.svg` — All 18 paths overlaid

SVG coordinate system: hack on left, house on right. Top = -y (CCW curl direction), bottom = +y (CW curl direction). Labeled with axis annotations.

The test suite runs the **headless physics simulator** (`test/physics-sim.js`) which extracts the exact physics code from the game but has no React/Canvas dependencies. When making physics changes, update both the game file and `physics-sim.js`.

---

## Important Notes

1. **Single-file constraint** — The artifact must be one `.jsx` file. All components, renderers, themes, and physics are inlined. The separate `components/` files in the working directory are reference implementations that need to be kept inline in the main file.

2. **No network** — The Claude.ai artifact environment has no network access. No CDN imports beyond what's available (React, Tailwind core, recharts, d3, Three.js r128, etc.).

3. **Spin direction** — We spent multiple sessions debugging curl direction. The sign convention is: `rock.spin > 0` = CW rotation = curls toward +y (right). Negation was historically needed for horizontal mode (`rock.spin = vertical ? curlDir : -curlDir`) but should become `rock.spin = curlDir` after removing horizontal.

4. **The `drawPerspective` function is tested** — The projection math was verified to produce correct screen coordinates (hack at bottom, house in upper-center, natural narrowing). But it hasn't been rendered in a real canvas yet, so visual tweaks will likely be needed.

5. **Theme switching is live** — The 🎨 button toggles between themes at any time. The canvas re-renders immediately. The theme object is passed to all renderers via the render state.
