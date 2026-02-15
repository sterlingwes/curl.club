# curl.club

A curling game

---

# Curling — Grid-Based Ice Physics Engine

Reimplementation inspired by WinCurl 2.0 (c.2000), a VB3/4 curling simulation. The original game used a closed-source `wincurl.dll` for physics. This project reverse-engineers the core concepts and extends them with a grid-based ice model that simulates realistic surface properties, wear, and environmental effects.

## Current Architecture

Single-file React component (`App.jsx`) with Canvas2D rendering. Designed to map cleanly to `@shopify/react-native-skia` for a future React Native port.

### Coordinate System

| Constant               | Value           | Meaning                      |
| ---------------------- | --------------- | ---------------------------- |
| `WORLD.sheetStart`     | 50              | Delivery end (hack side)     |
| `WORLD.sheetEnd`       | -680            | Far end past back line       |
| `WORLD.hackPos`        | -100            | Hack (foot block) position   |
| `WORLD.hogLine`        | -380            | Rocks must fully cross this  |
| `WORLD.tLine`          | -540            | Tee line (house center)      |
| `WORLD.backLine`       | -612            | Far edge of house            |
| `WORLD.sheetHalfWidth` | 82              | Cross-sheet extent (±82)     |
| `WORLD.houseRadii`     | [6, 24, 48, 72] | Button, 4ft, 8ft, 12ft rings |

Rocks travel in the **negative-x** direction (from hack toward house). The y-axis is cross-sheet, with y=0 on the center line.

### Screen Mapping

The `toScreen` function maps world coordinates to canvas pixels with uniform scaling (circles always render as circles regardless of viewport aspect ratio). Two orientations are supported:

- **Horizontal**: Delivery on the left, house on the right. `toScreen` negates x so higher world-x (hack) maps to screen-left.
- **Vertical**: Delivery at the bottom, house at the top. For mobile portrait mode.

---

## Game Rules Implemented

- **8 rocks per team**, 16 deliveries per end alternating, 8 ends per game.
- **Hog line rule**: A delivered rock must have its trailing edge fully cross the hog line, unless it has contacted another rock.
- **Back line rule**: A rock is removed when its leading edge fully crosses the back line.
- **Sideboard rule**: Rocks touching the sideboards are removed from play (no bounce).
- **Scoring**: After all 16 rocks are thrown, the team with the closest rock to the button scores one point for each of their rocks closer than the opponent's closest rock.
- **Hammer**: The team that did NOT score in the previous end throws last (hammer advantage) in the next end.

---

## Ice Grid Model

A 48×16 grid of cells covers the sheet. Each cell stores physical properties that evolve during play.

### Cell Properties

| Property       | Range            | Effect                                                                 |
| -------------- | ---------------- | ---------------------------------------------------------------------- |
| `pebbleHeight` | 0.0–1.3          | Fresh pebble = 1.0, worn = lower. Directly affects friction.           |
| `temperature`  | deviation from 0 | Negative = colder = harder ice = slightly lower friction, slower wear. |
| `moisture`     | 0.0–1.0          | Surface water from sweeping. Temporarily reduces friction. Evaporates. |
| `slopeX`       | small float      | Along-sheet grade. Positive = tilts toward house. Affects rock speed.  |
| `slopeY`       | small float      | Cross-sheet grade. Positive = tilts toward +y side. Causes "fall."     |

### Friction Derivation

```
effective_friction = baseFriction + (pebbleHeight × pebbleFrictionBonus)
                   - (moisture × 0.03)
                   + (temperature × 0.002)
```

Grid values are bilinearly interpolated for smooth sampling between cell boundaries.

---

## Physics Engine

### Three Lateral Force Components

Each physics tick, the rock's cross-sheet (y) position is affected by three independent forces:

#### 1. Spin Curl

The primary curling mechanic. A spinning rock's running band creates asymmetric friction — one side grips more than the other. This produces a lateral force whose direction depends on the handle (spin direction).

```
velocityFactor = v / (v² + 0.5)     // peaks at v ≈ 0.7, zero at rest and at high speed
spinCurl = -spin × paperTurns × localFriction × curlCoeff × velocityFactor
```

Key behaviors:

- **Symmetric on uniform ice**: in-turn and out-turn produce equal and opposite curl.
- **Velocity-dependent**: almost no curl at high speed (running band skips), peaks at moderate speed as the rock approaches the house, drops to zero as the rock stops (band stops rotating).
- **Friction-dependent**: more pebble = more curl. Worn paths produce less spin curl.
- **Per-rock variation**: `paperTurns` (0.8–1.2) models running surface roughness.

#### 2. Gradient Drift

Caused by friction variation across the rock's width. If one side of the rock sits on higher-friction ice, that side decelerates more, pulling the rock sideways. Independent of spin direction.

```
sample friction at (rock ± perpendicular offset)
gradientDrift = (fricLeft - fricRight) × gradientCoeff × velocityFactor
```

This naturally produces:

- **Trough trapping**: a low-friction channel has higher friction on both walls, centering the rock.
- **Worn-path drift**: a rock on the edge of a worn path gets pulled toward the fresh pebble.
- **Dished-ice funneling**: center-heavy pebble pulls rocks inward.

#### 3. Slope / Fall

Gravitational force from ice surface grade. Always present regardless of spin. Models real-world "fall" where rocks drift in the opposite direction of their curl due to uneven ice.

```
slopeScale = min(1, velocity × 2)    // fades to zero at rest (static friction)
slopeForceY = slopeY × slopeGravity × slopeScale
slopeForceX = slopeX × slopeGravity × slopeScale    // also affects speed
```

### Deceleration

```
rock.velocity -= effectiveFriction × frictionDecel × dt
```

Friction is sampled from the grid at the rock's position. Lower pebble = lower friction = rock glides farther on worn paths.

### Sweeping

When the player taps during delivery:

- Direct velocity boost (`sweepBoost × dt`)
- Grid effects at rock position: pebble wear (permanent), moisture deposit (temporary friction reduction)

### Wear

Each tick a moving rock degrades `pebbleHeight` in a 3×3 cell neighborhood. Sweeping accelerates wear. Over an end, common delivery paths become visible as worn tracks with reduced friction.

### Collision Resolution

Impulse-based elastic collision with configurable restitution (0.92). Properly resolves overlapping rocks by separating along the collision normal. Collision sets `hasContacted` flag (relevant for hog line rule).

---

## Ice Profiles

Five preset ice configurations initialize the grid differently:

| Profile          | Description                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Championship** | Perfectly flat, uniform fresh pebble. Pure spin curl, no surprises.                                                                                                   |
| **Club Ice**     | Slight dish (slope toward center), mild center-path wear from previous game.                                                                                          |
| **Arena**        | Cold hard ice (-1.5°C offset). Brine-pipe trough at y≈25 with internal slope. Corner fall near the house.                                                             |
| **Swingy**       | Heavy dish, extra-thick pebble (1.2), dramatic curl effects.                                                                                                          |
| **Discovery**    | Randomly generated hidden features: random dish, random trough with slope, random corner fall, random wear pattern. Players learn the ice by observing rock behavior. |

---

## Tunable Parameters (🔧 Panel)

All physics constants are exposed as live sliders:

| Parameter    | Default | Range    | Effect                                   |
| ------------ | ------- | -------- | ---------------------------------------- |
| Spin Curl    | 35      | 0–200    | Spin curl force multiplier               |
| Grad Drift   | 8       | 0–50     | Friction gradient drift multiplier       |
| Slope Grav   | 18      | 0–80     | Slope/fall force multiplier              |
| Friction Dec | 9       | 1–30     | Overall deceleration rate                |
| Base Fric    | 0.08    | 0.01–0.2 | Bare ice friction floor                  |
| Pebble Bonus | 0.07    | 0–0.2    | Additional friction from pebble          |
| Speed Scale  | 60      | 20–120   | World units per velocity unit per second |
| Wear Rate    | 0.0015  | 0–0.01   | Pebble degradation rate                  |
| Sweep Boost  | 0.25    | 0–1      | Velocity boost from sweeping             |

---

## Visual Overlay (🧊)

Toggle the ice overlay to see grid state as an RGB heatmap:

- **Red**: high friction (from pebble + temperature)
- **Green**: pebble health (bright = fresh, dark = worn)
- **Blue**: moisture (from sweeping) and cold zones
- **Yellow arrows**: slope direction and magnitude

During normal play, a subtle wear overlay shows paths developing without the full diagnostic view.

---

## Known Issues

### Curl Direction

The curl direction labels ("→ In" / "← Out") and the actual physics sign have been a persistent source of confusion. The current state:

- `curlDir = +1` is labeled "→ In" but the physics negation (`-rock.spin × ...`) means this produces **negative-y** displacement.
- `curlDir = -1` is labeled "← Out" and produces **positive-y** displacement.
- User reports that one handle curls correctly but the other curls in the wrong direction — suggesting the negation may be wrong, or the labels need swapping, or there's an additional sign error in how the forces combine.

**Root cause to investigate**: The `toScreen` mapping negates axes differently in horizontal vs vertical mode. The labels use arrows that imply screen-space direction, but the physics operates in world space. A clean fix would be to:

1. Define an authoritative convention: "in-turn = clockwise rotation when viewed from above = curls to the LEFT from thrower's perspective"
2. Verify the sign chain: `spin → spinCurl → rock.y += → toScreen` produces the correct screen direction for both orientations
3. Update labels to match

### Delivery Angle

The delivery angle formula `PI - (aimAngle / halfWidth) × 0.08` adds a tiny angular offset so off-center aims converge slightly toward the house. This was previously `PI +` which steered rocks the wrong way. The current formula may still need validation — the offset should be small enough that it doesn't visibly override curl behavior.

### End-of-Travel Behavior

Previously rocks would snap sideways at the end of travel due to:

1. Velocity factor blowing up near zero (fixed: now uses `v/(v²+0.5)` which goes to zero)
2. Slope force active on stopped rocks (fixed: now scales by `min(1, v×2)`)

Both fixes are in place but worth monitoring.

---

## Roadmap

### Phase 1: Curl Fix (Priority)

- Establish definitive sign convention for curl direction
- Add debug visualization: draw a small arrow on each moving rock showing the net lateral force vector
- Test all four scenarios: in-turn from center, out-turn from center, in-turn from outside, out-turn from outside
- Verify behavior matches on both horizontal and vertical orientations

### Phase 2: Gameplay Polish

- AI opponents with configurable skill levels (from original WinCurl player types)
- Sound effects (rock sliding, collision, sweeping)
- Replay system (snapshot rock positions each tick, play back)
- Inter-end ice maintenance (partial re-pebble between ends)

### Phase 3: React Native Port

- Swap Canvas2D for `@shopify/react-native-skia` primitives
- Touch controls optimized for mobile (drag to aim, press-and-hold to sweep)
- Orientation auto-detection (portrait = vertical sheet)
- Sound via `expo-av`

### Phase 4: Advanced Ice

- Ice maker tool: let players design custom ice profiles by painting pebble, temperature, and slope
- Multiplayer: shared game state over network
- Tournament mode with progressive ice wear across multiple games
- Statistics tracking: curl amount achieved, delivery accuracy, sweeping effectiveness
