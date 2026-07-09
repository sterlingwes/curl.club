# Game Implementation Critique & Canvas Iteration Workflow

_Reviewed at commit `fba8d01` ("overhead tweaks (still broken) w/ snapshots"), July 2026._

Everything in this report was verified against the running app, not just read from
the source: typecheck and lint pass, the 18 physics snapshot scenarios pass (and
regenerate byte-identically — the headless sim is deterministic, which is great),
`vitest` exits 1 because there are zero unit test files, and the layout numbers
below were measured in a live Chromium session against the dev server.

- [Part 1 — What's working](#part-1--whats-working)
- [Part 2 — Bugs found](#part-2--bugs-found)
- [Part 3 — Design observations](#part-3--design-observations)
- [Part 4 — Making canvas iteration agent-friendly](#part-4--making-canvas-iteration-agent-friendly)
- [Part 5 — Suggested sequencing](#part-5--suggested-sequencing)

---

## Part 1 — What's working

Credit where due, because several instincts here are exactly right:

- **The headless physics sim + SVG trace pipeline is the best idea in the repo.**
  `tests/physics-sim.js` + `run-snapshots.js` renders every scenario as an SVG
  with velocity-colored paths, force arrows, and axis labels. This is precisely
  the kind of artifact that lets a human and an agent look at the *same thing*
  and agree on what happened. The problem (Part 4) is that nothing equivalent
  exists for the *renderers*, which is where the actual pain is.
- **The refactor out of the single-file artifact is mostly clean.** Physics,
  ice, game state, renderers, constants, and theme are separated with sensible
  dependency direction. Renderers take a state object rather than reaching into
  React. Strict TS with no `any` leakage.
- **The theme system** is a genuinely good abstraction — two visually distinct
  themes render from the same draw code with no branching in the renderers.
- **Soft, range-based expectations** in `scenarios.js` are the right philosophy
  for physics regression tests (catch sign flips, don't pin exact floats) —
  though several are currently *too* soft to catch anything (see 2.11).

---

## Part 2 — Bugs found

Ordered roughly by severity.

### 2.1 The overhead view is broken because flexbox stretches the canvas element (P0)

This is the "still broken" in the last commit message, and it is not a drawing
bug at all — `drawOverhead` is fine.

The overhead `<canvas>` is a direct child of the flex row in `src/App.tsx:440`,
and the perspective canvas + power bar are wrapped in an inner div. Flexbox's
default `align-items: stretch` stretches the overhead canvas *element* to the
row height, while its *buffer* stays at `dims` (200×120 in wide layout).
Measured live at a 1280×720 viewport:

| canvas      | buffer (`width`/`height` attrs) | on-screen CSS size |
| ----------- | ------------------------------- | ------------------ |
| perspective | 1040 × 460                      | 1042 × 462         |
| overhead    | **200 × 120**                   | **202 × 462**      |

A 3.85× non-uniform vertical stretch: circles become blurred ellipses, the hog
line becomes a fuzzy bar, the pebble dots smear. Every "overhead tweak" made on
top of this was fighting a distortion applied *after* drawing, which is
unwinnable — and worth internalizing as a lesson for the workflow discussion in
Part 4: the failure wasn't visible in the code that draws, only in the
buffer-vs-CSS-size relationship of the DOM element.

Compounding it, the `dims` the layout picks don't match what `drawOverhead`
wants to show. The renderer aspect-fits a portrait world region (164 wide × 572
tall, aspect ≈ 0.29) into the canvas (`src/renderers/overhead.ts:109-128`), but
the layout hands it landscape canvases (200×120 wide, 368×120 narrow), so the
sheet renders as a sliver occupying ~30 % of the buffer width and the rest is
background. The comment at `src/App.tsx:254-256` ("we're zooming on house so
use ~3:1") describes a house-zoom renderer that was never ported from the
prototype — the current renderer draws the whole sheet.

**Fix:** always set both the buffer size *and* the CSS size (`style.width/height`)
from the same numbers, add `alignSelf: "flex-start"` (or `align-items:
flex-start` on the row), and pick `dims` from the renderer's intended aspect
ratio, not vice versa. Part 4.3 proposes making this a single shared utility so
the bug class disappears.

### 2.2 Team rotation is hard-anchored to team 0, breaking hammer — and can re-deliver a live rock (P0)

Two pieces conspire:

- After each delivery, the next team is computed as
  `setCurrentTeam(next % 2 === 0 ? 0 : 1)` (`src/App.tsx:196`) — team 0 always
  throws even-numbered rocks, regardless of who was supposed to throw first
  this end.
- At end transitions, `handleAction` sets the scoring team to throw first
  (`src/App.tsx:117-121`), which is correct curling (scorer loses hammer).

If team 1 scored and starts the next end: team 1 throws rock 0 selecting rock
id 8 (`ri = floor(0/2) = 0`, `src/App.tsx:97-100`), then rock 1's team is
computed as `1 % 2 → 1` — team 1 again, and `ri = floor(1/2) = 0` selects **the
same rock id 8**, which `deliverRock` teleports from wherever it stopped back
to the hack and throws again. Team 0 ends the end with unthrown rocks, hammer
is effectively meaningless, and a rock in play gets resurrected.

**Fix:** derive the thrower from `firstTeam` state: `team = (firstTeam +
rockNum) % 2`, and the rock index from how many rocks that team has thrown:
`ri = floor(rockNum / 2)` is fine once team alternation is correct. This logic
(and scoring/hammer) belongs in a pure, unit-testable reducer rather than
inline in a `useEffect` callback — see 3.1.

### 2.3 The render loop is torn down and rebuilt ~33 times per second during aiming

The draw `useEffect` (`src/App.tsx:269-319`) depends on `aimAngle`, which a
`setInterval` updates every 30 ms during aiming (`src/App.tsx:214-223`). So the
effect cancels its rAF loop and starts a new one every 30 ms, all game long in
the aiming phase. Meanwhile the loop *also* self-schedules at 60 fps, redrawing
identical frames from stale closure values between state ticks. Three timing
systems coexist: two `setInterval` oscillators driving React state, the draw
rAF loop, and a separate physics rAF loop (`src/App.tsx:156-211`).

It works, but it's the "muddled middle" between immediate-mode and React-driven
rendering, and it's part of why iterating on rendering feels unpredictable —
what's on screen at any instant depends on effect re-run timing. **Fix:** one
persistent rAF loop that reads a single mutable "sim state" ref (rocks, aim,
power, phase); oscillators mutate the ref instead of calling `setState`; React
state is reserved for things the DOM UI actually shows (scores, phase for
button labels). Renderers become pure consumers of one snapshot object.

### 2.4 Power can only lock between 30 % and 70 %

The power oscillator is `setPower(30 + 40 * (1 + Math.sin(t)) / 2)`
(`src/App.tsx:231`) → range 30–70. The physics test suite validates 10 % (comes
up short) and 95 % (peel through the back line), and the power bar renders a
0–100 gradient, but no player can ever throw a guard lighter than 30 or a peel
heavier than 70. If the clamp is intentional game design, the bar should show
30–70; if not, restore the full range.

### 2.5 Removed rocks come back as "reserve" rocks in the overhead view

`removeRock` parks rocks at `x = 800` (`src/physics/engine.ts:14`); undelivered
rocks are staged at `x = 200+` (`src/game/state.ts:42`). The overhead reserve
counter counts `!r.inPlay && r.x >= 200` (`src/renderers/overhead.ts:290`) —
which includes every rock removed from play. Throw a rock through the house
and it reappears in the reserve rack. Use an explicit rock status
(`"unthrown" | "inPlay" | "removed"`) instead of sentinel positions.

### 2.6 CI is not actually guarding anything

Three independent problems in `.github/workflows/tests.yml`:

1. **No `npm ci` in either job** — `npm run typecheck` / `npm run lint` cannot
   run without `node_modules`; the jobs fail (or would, when triggered).
2. **The `paths` filters reference `src/App.jsx`**, deleted in the refactor.
   Source changes under `src/**` no longer trigger the workflow at all — only
   `tests/**` changes do.
3. The Playwright visual suite isn't wired into CI, and its committed baselines
   are `*-chromium-darwin.png`, so a Linux runner could never compare against
   them anyway.

Also, `npm test` (vitest) exits 1 because there are no unit test files — an
agent told to "make sure tests pass" hits a red herring immediately.

### 2.7 The Playwright visual specs screenshot a moving target

`tests/visual/overhead.spec.ts` takes screenshots during the aiming phase,
while the aim line oscillates at 33 Hz and the pebble dots re-randomize every
frame (see 2.8). `toHaveScreenshot` waits for two consecutive identical frames;
this canvas never produces them, so the assertions only pass via retry-timing
luck. Any agent iterating against these tests gets noise, not signal. Part 4
proposes the replacement (deterministic fixture harness); regardless, visual
assertions must only be taken on frozen frames.

### 2.8 The overhead renderer is nondeterministic and allocates per frame

- 800 `Math.random()` pebble dots are drawn **every frame**
  (`src/renderers/overhead.ts:159-164`) — the ice shimmers with noise, and no
  two frames are ever pixel-identical.
- `buildOverlay` creates a fresh `<canvas>` + ImageData every frame while the
  overlay or debug toggle is on (`src/renderers/overhead.ts:16-49,167-172`).

Seed the dots (precompute positions once, or use a seeded PRNG keyed off the
sheet), and cache the overlay canvas, invalidating on grid change. Determinism
matters beyond aesthetics — it's the precondition for every workflow
improvement in Part 4.

### 2.9 The breakpoint handler lags one resize event behind

`resize()` reads `isNarrowLayout` from the closure and also sets it
(`src/App.tsx:237-266`). When a resize crosses the 500 px threshold, the
current invocation computes dims with the *old* flag, and only the effect
re-run (triggered by the flag change) corrects it. On mount, wide-window users
get one frame of narrow-layout dims. Compute `narrow = window.innerWidth < 500`
as a local and branch on that; keep the state only for JSX.

### 2.10 Docs actively contradict the code

This matters double in an agent workflow, because agents *trust* documentation:

- `README.md` says the curl velocity factor is `v/(v² + 0.5)` ("goes to zero at
  rest — fixed") and that spinCurl is negated. The code has neither: `vFactor =
  max(0.3, sqrt(v/2))` with no negation (`src/physics/engine.ts:114-115`). The
  0.3 floor means lateral force persists down to the stop threshold — the
  "snap sideways at end of travel" the README claims was fixed is structurally
  back.
- `README.md` and `PLAN.md` disagree with each other on the curl sign
  convention (PLAN's "spin > 0 = CW = +y" matches the code; README describes
  the opposite with different UI labels).
- Both describe a single-file `App.jsx` that no longer exists; PLAN references
  a `test/` directory (it's `tests/`), a horizontal mode already removed, and a
  house-zoom renderer that was never ported.

Recommendation: collapse to one short, current document (a `CLAUDE.md` is the
natural home — see 4.7) describing the coordinate system, sign conventions,
file map, and how to run/see things. Move the historical narrative elsewhere or
delete it. A wrong doc is worse than no doc.

### 2.11 Several physics tests pass while contradicting their own names

Observed in the actual run:

- **"Club ice — dish should pull toward center"**: aim 40, final y **64.5** —
  the rock drifted *away* from center, and the club-vs-championship curl diff
  is −0.1. The dish (`slopeY ≈ 0.0012 × 18 ≈ 0.02/s`) is ~50× weaker than spin
  curl (~1/s), so the profile is cosmetically irrelevant — but the test passes
  because it only asserts `curlSign: "+"` (spin direction dominates).
- **"Swingy — should produce more curl than championship"** is only logged as a
  📊 info line; `_compareProfile` results are never asserted.
- Total curl is nearly power-invariant (10 % → 16, 42 % → 24.6, 95 % → 19
  units) because the `vFactor` floor keeps curl accumulating at all speeds.
  Real draws curl much more than peels; no scenario checks this.

The scaffolding is good — the expectations just need teeth: assert relative
comparisons (`club.finalY` closer to center than `championship.finalY`;
`swingy.curl > championship.curl × 1.5`; `peel.curl < draw.curl × 0.5`).

### 2.12 Smaller items

- **Ice re-initializes every end** (`src/App.tsx:124`), discarding wear — the
  README's "worn tracks develop over a game" narrative can't happen. If
  intentional, document it; PLAN's "partial re-pebble between ends" is the
  better design.
- **Switching ice profile mid-game does nothing** until the next end/title —
  the picker only sets state (`src/App.tsx:620-639`); no feedback to the user.
- **The power bar appearing during the power phase shifts the layout** — it's
  conditionally rendered inside the flex row (`src/App.tsx:459-497`), so the
  overhead canvas jumps 24 px left every time. Reserve the space.
- **No `devicePixelRatio` handling** anywhere — everything is blurry on retina
  (the committed darwin snapshots show it). Fold into the sizing utility (4.3).
- **Collision pairs are processed twice** ((i,j) and (j,i),
  `src/physics/engine.ts:28-76`) — benign today because the second pass sees
  `rv ≤ 0`, but fragile; iterate `j > i`. The stray `b.inPlay = true` is dead
  code (b was already checked in-play).
- `sampleSlope` runs two full bilinear passes per call; trivially mergeable.
  Irrelevant at 16 rocks, worth knowing about before RN port.

---

## Part 3 — Design observations (not bugs)

### 3.1 The game-flow state machine deserves to be pure

The phase machine (aiming → power → running → scoring), rock rotation, hammer,
and end transitions live across `handleAction` and the physics effect's
"nothing moving anymore" branch in `App.tsx`. That's exactly where bug 2.2
hides. Extract a reducer: `gameReducer(state, event)` with events like
`ROCK_DELIVERED`, `ALL_ROCKS_STOPPED`, `END_SCORED`. It becomes unit-testable
("team 1 scores 2 → team 1 throws first next end and never throws twice in a
row"), and `App.tsx` shrinks to wiring.

### 3.2 Curl nudges position, not velocity

`rock.y += (spinCurl + gradDrift + slopeY) * dt` (`src/physics/engine.ts:151`)
moves the rock sideways without ever changing `rock.angle`, while propulsion
uses polar velocity + angle. Consequences: lateral motion carries no momentum
(it stops the instant force stops), collisions exchange momentum computed from
`angle`/`velocity` that don't include accumulated lateral drift, and the
trajectory can't "hook" the way a real rock's does since heading never
rotates. Fine for an arcade feel — but if realism is a goal, store `vx, vy`
and apply curl as acceleration; collisions already think in vx/vy internally,
so the representation change is mostly mechanical.

### 3.3 The perspective camera framing wastes a third of the canvas

`fLen = W * 0.75`, `hrzY = H * 0.32`, `camH = 60` are hardcoded
(`src/renderers/perspective.ts:94-97`), so the field of view is a function of
canvas *width* and the top third above the horizon is empty background at all
sizes (clearly visible in both committed screenshots). The house — the thing
players care about — is a few dozen pixels tall. Consider solving the camera
from the desired framing instead: given the viewport, choose `fLen`/`camH`/
pitch such that the hog-to-backline span fills a target fraction of the canvas.
That inversion also makes camera behavior testable (see 4.5).

### 3.4 `physics-sim.js` is a hand-maintained duplicate of the engine

Currently in sync (verified line-by-line; only the `discovery` profile is
missing), but PLAN itself warns "update both" — that's a treadmill someone will
eventually fall off, and the divergence will be silent because the sim, not the
engine, is what the tests exercise. Since the engine is already pure TypeScript
with zero DOM dependencies, the sim should import it. Two options: run the
snapshot runner through `vitest` (which compiles TS transparently, and would
also give the repo its missing unit-test home), or a tiny esbuild step before
the node script. Either kills the whole drift class.

---

## Part 4 — Making canvas iteration agent-friendly

This addresses the core question: *"work with agents on canvas rendering is
hard because we seem to 'see' differently."*

The diagnosis, from this repo's own history: the agent's view of the game is
the code plus whatever pixels it can screenshot, and right now those pixels are
**nondeterministic** (random dots, oscillating aim line), **entangled with
layout** (the P0 bug wasn't in draw code at all — it was CSS stretching applied
after drawing), and **expensive to reach** (boot app → click through phases →
screenshot a moving frame at some window size). Under those conditions an agent
"tweaks the overhead" blind, which is exactly what the last commit says
happened. The fix is not better-looking screenshots — it's making the rendering
**deterministic, addressable, and measurable**. Concretely, five pieces:

### 4.1 Make every renderer a deterministic pure function

Contract: `draw(ctx, viewport, renderState)` where the same inputs produce the
same pixels, always.

- No `Math.random()` in draw paths (2.8) — seed or precompute the pebble dots.
- No per-frame DOM allocation (`document.createElement` in `buildOverlay`) —
  cache derived bitmaps keyed on grid version.
- No reading clocks, refs, or globals inside renderers — everything through
  `renderState`.
- `renderState` must be **JSON-serializable** (it nearly is already — rocks,
  phase, aim, power, theme name, tune, plus grid cells). That makes any visual
  state capturable, diffable, and replayable.

This is the foundation; nothing else works without it. It also fixes the flaky
Playwright suite (2.7) as a side effect.

### 4.2 Build a fixture-driven render harness

A dev-only route (`/harness`) that renders **one frozen frame** of **one
renderer** from a **named fixture** at an **exact canvas size**:

```
/harness?view=overhead&fixture=mid-end-8-rocks&w=200&h=460&theme=wincurl&seed=42
```

with fixtures as checked-in JSON (`fixtures/aiming.json`,
`fixtures/mid-end-8-rocks.json`, `fixtures/crowded-house.json`,
`fixtures/rock-on-hogline.json`, …). Implementation is small: a component that
loads the fixture, builds `renderState`, calls the renderer once, and stops —
no rAF, no oscillators, no game loop.

This changes agent iteration from "boot the game, click Start, wait for the
right phase, screenshot an animation mid-flight" to "screenshot this URL" —
reproducible for the agent, and *identical to what you see* when you open the
same URL. When you disagree about how something looks, you're finally
disagreeing about the same frame. It's the renderer-level equivalent of what
`run-snapshots.js` already does so well for physics.

### 4.3 One sizing utility, so buffer/CSS/DPR can never disagree again

```ts
// src/render/fitCanvas.ts
export function fitCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;   // ← the line whose absence caused 2.1
  canvas.style.height = `${cssH}px`;
  canvas.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
}
```

Plus a pure layout-policy function — `computeLayout(viewportW, viewportH) →
{ persp: Rect, overhead: Rect, narrow: boolean }` — that owns the breakpoint
logic and *derives each canvas's rect from its renderer's preferred aspect
ratio*. Pure means unit-testable: "at 1280×720 the overhead rect has portrait
aspect", "rects don't overlap", "everything fits the viewport". Bugs 2.1 and
2.9 both become impossible to reintroduce silently, especially combined with
this one-line Playwright invariant that would have caught 2.1 on the day it
was written:

```ts
for (const c of await page.locator("canvas").all()) {
  const { bw, bh, cw, ch, dpr } = await c.evaluate(...);
  expect(bw / dpr).toBeCloseTo(cw, 0);   // buffer ↔ CSS must agree
  expect(bh / dpr).toBeCloseTo(ch, 0);
}
```

### 4.4 Give the agent a sub-second render loop: node-side PNG rendering

Because the renderers are pure Canvas2D, they can run headless with
`@napi-rs/canvas` (or `skia-canvas`) — no browser, milliseconds per frame:

```
node tools/render-fixture.mjs --view=overhead --fixture=crowded-house --size=200x460 --out=out.png
```

The agent's inner loop becomes: edit `overhead.ts` → run the script → read the
PNG → adjust. That's a couple of seconds per iteration versus tens of seconds
through Playwright, and it needs no dev server. Two products fall out almost
for free:

- **A contact sheet**: every fixture × view × theme × breakpoint tiled into one
  image or HTML page. You review one artifact and say "third row, house too
  small" instead of describing pixels in prose; CI uploads it like the physics
  SVGs, so every PR shows what rendering *looks like* now.
- **Golden-image tests** generated on Linux in CI (fixing the darwin-baseline
  dead end, 2.6), with tight diff thresholds — safe now that frames are
  deterministic. Keep goldens few and fixture-based; the geometry probes below
  are the finer-grained net.

The only caveat: verify parity for newer APIs (`roundRect`, `ellipse`) between
the node canvas and Chromium once, in a smoke test.

### 4.5 Assert geometry as numbers, not pixels — this is the highest-leverage change

Here's the heart of the "we see differently" problem: **you perceive a rendered
frame gestalt; an agent is far better at reasoning over numbers than over
screenshots.** A human glances at the overhead view and instantly sees
"squished"; an agent inspecting the same PNG may or may not. But *"the 12-ft
ring's projected radius must be ≤ the sheet's projected half-width"* is a
one-line assertion an agent can run, trust, and — critically — use to locate
the failure.

The overhead's `toS`/scale computation and the perspective `proj` are already
nearly pure. Extract them into `src/render/geometry.ts`, exported independently
of drawing, and unit-test the *layout claims* the renderers implicitly make:

```ts
// The sheet should actually use the canvas
expect(sheetRect.w * sheetRect.h).toBeGreaterThan(0.5 * W * H);
// Circles stay circles: uniform scale on both axes
expect(scaleX).toBeCloseTo(scaleY);
// The house is fully inside the viewport
for (const p of houseRingExtremes) expect(inRect(p, viewport)).toBe(true);
// Perspective: house occupies a meaningful share of the frame
expect(houseProjectedHeight / H).toBeGreaterThan(0.06);
// Nothing near-plane-clips: all sheet corners project successfully
```

Every visual defect verified in this review — the stretch, the sliver-width
sheet, the wasted top third of the perspective view, the blur — is expressible
as one of these cheap numeric assertions. When one fails, the message *is* the
diagnosis ("sheet uses 11 % of canvas area, want ≥ 50 %"), which beats a
pixel-diff blob for both of you. Pixel goldens then only need to guard what
numbers can't: aesthetics, gradients, theme fidelity.

Complement with a **debug annotation pass** (a flag that overlays world-space
gridlines, labeled line positions like `hog −380`, canvas dimensions, and the
world→screen scale onto any frame): screenshots become self-describing, so when
an agent *does* look at pixels, it reads labels instead of guessing what it's
seeing.

### 4.6 Proposed shape

```
src/render/
  geometry.ts        # toScreen/proj/scale math, pure, unit-tested
  fitCanvas.ts       # buffer+CSS+DPR sizing (4.3)
  layout.ts          # computeLayout(viewport) → rects, pure, unit-tested
fixtures/
  aiming.json  mid-end-8-rocks.json  crowded-house.json  ...
tools/
  render-fixture.mjs # node-side PNG render (4.4)
  contact-sheet.mjs  # all fixtures × views × themes → one artifact
src/harness/         # /harness route: one frozen frame per URL (4.2)
tests/
  geometry.test.ts   # numeric layout probes (4.5) — also gives vitest its first tests
  visual/            # few fixture-based goldens + the buffer≡CSS invariant
```

### 4.7 Write the workflow down for the agent

Add a `CLAUDE.md` that states, briefly: the coordinate system and sign
conventions (once, authoritatively — ending the README/PLAN contradiction),
and the loop: *"To see a rendering change: `node tools/render-fixture.mjs
--view=… --fixture=…` and read the PNG. To check layout: `npm run
test:geometry`. Never screenshot the live game to evaluate rendering — use the
harness."* Agents follow the paved road if one exists; today the only road is
booting the game and squinting.

---

## Part 5 — Suggested sequencing

| # | Change | Why this order |
| - | ------ | -------------- |
| 1 | Fix canvas sizing via `fitCanvas` + layout fn (2.1, 2.9, 4.3) | Unblocks all rendering work; everything drawn today is distorted |
| 2 | Determinism: seed pebble dots, cache overlay (2.8, 4.1) | Precondition for every testing improvement |
| 3 | Fix CI: `npm ci`, `paths: src/**`, wire typecheck/lint/snapshots (2.6) | Cheap; makes later steps enforceable |
| 4 | Extract geometry + first numeric probe tests (4.5) | Locks in fix #1; gives vitest a reason to exist |
| 5 | Fixture harness + node renderer + contact sheet (4.2, 4.4) | The actual iteration workflow |
| 6 | Fix team rotation via pure game reducer (2.2, 3.1) | Worst gameplay bug; reducer makes it regression-proof |
| 7 | De-duplicate physics-sim (3.4); tighten scenario assertions (2.11) | Protects the physics suite's long-term value |
| 8 | Docs: single source of truth + `CLAUDE.md` (2.10, 4.7) | Do after conventions stabilize so it's written once |

Items 1–5 are a day or two of work total, and they convert canvas iteration
from "agent guesses, human squints" into a loop where both parties look at the
same deterministic frame and share a set of numeric checks that say what
"correct" means.
