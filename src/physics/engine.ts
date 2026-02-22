// Physics simulation engine

import type { Rock, RockDebug } from "../types";
import type { IceGrid } from "../ice/grid";
import type { PhysicsTune } from "../constants/physics";
import { WORLD, ROCK_RADIUS, RESTITUTION, PI } from "../constants/world";
import { CURL_SAMPLE_OFFSET } from "../constants/grid";

// Remove a rock from play
export function removeRock(rock: Rock): void {
  rock.inPlay = false;
  rock.active = false;
  rock.velocity = 0;
  rock.x = 800;
}

// Check if rock is out of bounds
export function isRockOutOfBounds(rock: Rock): boolean {
  if (rock.x - ROCK_RADIUS < WORLD.backLine) return true;
  if (Math.abs(rock.y) + ROCK_RADIUS > WORLD.sheetHalfWidth) return true;
  if (rock.velocity <= 0.02 && rock.x > WORLD.hogLine - ROCK_RADIUS && !rock.hasContacted) {
    return true;
  }
  return false;
}

// Resolve collisions between rocks
export function resolveCollisions(rocks: Rock[]): void {
  for (let i = 0; i < rocks.length; i++) {
    const a = rocks[i];
    if (!a || !a.inPlay || a.velocity <= 0.05) continue;

    for (let j = 0; j < rocks.length; j++) {
      if (i === j) continue;
      const b = rocks[j];
      if (!b || !b.inPlay) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ROCK_RADIUS * 2 && dist > 0) {
        const nx = (b.x - a.x) / dist;
        const ny = (b.y - a.y) / dist;
        const avx = Math.cos(a.angle) * a.velocity;
        const avy = Math.sin(a.angle) * a.velocity;
        const bvx = Math.cos(b.angle) * b.velocity;
        const bvy = Math.sin(b.angle) * b.velocity;
        const rv = (avx - bvx) * nx + (avy - bvy) * ny;

        if (rv > 0) {
          const imp = rv * RESTITUTION;
          const nax = avx - imp * nx;
          const nay = avy - imp * ny;
          const nbx = bvx + imp * nx;
          const nby = bvy + imp * ny;
          a.velocity = Math.sqrt(nax * nax + nay * nay);
          b.velocity = Math.sqrt(nbx * nbx + nby * nby);
          if (a.velocity > 0.01) a.angle = Math.atan2(nay, nax);
          if (b.velocity > 0.01) b.angle = Math.atan2(nby, nbx);
        }

        const ol = ROCK_RADIUS * 2 - dist;
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
}

// Physics tick - update all rocks for one frame
export function physicsTick(
  dt: number,
  rocks: Rock[],
  grid: IceGrid,
  tune: PhysicsTune,
  deliveryRock: Rock | null,
  isSweeping: boolean,
): boolean {
  let anyMoving = false;
  grid.evaporateMoisture(dt);

  for (const rock of rocks) {
    if (!rock.inPlay || rock.velocity <= 0.02) {
      if (rock.inPlay) rock.stopped = true;
      continue;
    }

    anyMoving = true;
    rock.stopped = false;

    const sweeping = isSweeping && rock === deliveryRock;
    const friction = grid.sampleFriction(
      rock.x,
      rock.y,
      tune.baseFriction,
      tune.pebbleFrictionBonus,
    );
    const slope = grid.sampleSlope(rock.x, rock.y);

    rock.velocity = Math.max(0, rock.velocity - friction * tune.frictionDecel * dt);
    if (sweeping && rock.velocity > 0.3) {
      rock.velocity += dt * tune.sweepBoost;
    }

    const v = rock.velocity;
    const vFactor = Math.max(0.3, Math.sqrt(v / 2));
    const spinCurl = rock.spin * rock.paperTurns * friction * tune.curlCoeff * vFactor;

    const perpX = -Math.sin(rock.angle) * CURL_SAMPLE_OFFSET;
    const perpY = Math.cos(rock.angle) * CURL_SAMPLE_OFFSET;

    const fL = grid.sampleFriction(
      rock.x + perpX,
      rock.y + perpY,
      tune.baseFriction,
      tune.pebbleFrictionBonus,
    );
    const fR = grid.sampleFriction(
      rock.x - perpX,
      rock.y - perpY,
      tune.baseFriction,
      tune.pebbleFrictionBonus,
    );

    const gradDrift = (fL - fR) * tune.gradientCoeff * vFactor;
    const slopeScale = Math.min(1, v * 2);
    const slopeYF = slope.sy * tune.slopeGravity * slopeScale;
    const slopeXF = slope.sx * tune.slopeGravity * slopeScale;

    rock.dbg = {
      spinCurl,
      gradDrift,
      slopeY: slopeYF,
      slopeX: slopeXF,
      friction,
      vFactor,
      fL,
      fR,
      v,
      spin: rock.spin,
    } as RockDebug;

    rock.y += (spinCurl + gradDrift + slopeYF) * dt;
    rock.velocity = Math.max(0, rock.velocity + slopeXF * dt * 0.5);
    rock.x += Math.cos(rock.angle) * rock.velocity * dt * tune.speedScale;
    rock.y += Math.sin(rock.angle) * rock.velocity * dt * tune.speedScale;

    grid.applyWear(rock.x, rock.y, dt, sweeping, tune.wearRate);

    if (isRockOutOfBounds(rock)) {
      removeRock(rock);
      continue;
    }
  }

  resolveCollisions(rocks);
  return anyMoving;
}

// Calculate delivery velocity from power
export function calculateVelocity(power: number): number {
  return 1.8 + 2.6 * Math.pow(power / 100, 0.5);
}

// Deliver a rock
export function deliverRock(
  rock: Rock,
  aimAngle: number,
  power: number,
  curlDir: number,
): void {
  rock.x = WORLD.hackPos;
  rock.y = aimAngle;
  rock.angle = PI;
  rock.velocity = calculateVelocity(power);
  rock.spin = curlDir;
  rock.paperTurns = 0.8 + Math.random() * 0.4;
  rock.inPlay = true;
  rock.active = true;
  rock.stopped = false;
  rock.hasContacted = false;
}
