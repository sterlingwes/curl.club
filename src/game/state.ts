// Game state and scoring logic

import type { Rock, RockDebug, EndScore } from "../types";
import { WORLD, ROCK_RADIUS, ROCKS_PER_TEAM } from "../constants/world";

// Create a new rock
export function createRock(team: number, id: number): Rock {
  return {
    id,
    team,
    x: 0,
    y: 0,
    angle: 0,
    velocity: 0,
    spin: 1,
    paperTurns: 1.0,
    inPlay: false,
    active: false,
    stopped: false,
    hasContacted: false,
    dbg: {
      spinCurl: 0,
      gradDrift: 0,
      slopeY: 0,
      slopeX: 0,
      friction: 0,
      vFactor: 0,
      fL: 0,
      fR: 0,
      v: 0,
      spin: 1,
    } as RockDebug,
  };
}

// Initialize rocks for a new end
export function createRocksForEnd(): Rock[] {
  const rocks: Rock[] = [];
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < ROCKS_PER_TEAM; i++) {
      const rock = createRock(t, t * ROCKS_PER_TEAM + i);
      rock.x = 200 + i * 20;
      rock.y = t === 0 ? -60 : 60;
      rocks.push(rock);
    }
  }
  return rocks;
}

// Score an end
export function scoreEnd(rocks: Rock[]): EndScore {
  const inPlayRocks = rocks.filter((r) => r.inPlay);
  const hx = WORLD.houseCenter.x;
  const hy = WORLD.houseCenter.y;
  const maxR = WORLD.houseRadii[3] + ROCK_RADIUS;

  const dists: [number[], number[]] = [[], []];

  for (const r of inPlayRocks) {
    const d = Math.sqrt((r.x - hx) ** 2 + (r.y - hy) ** 2);
    if (d <= maxR) {
      dists[r.team]!.push(d);
    }
  }

  dists[0]!.sort((a, b) => a - b);
  dists[1]!.sort((a, b) => a - b);

  let scoringTeam = -1;
  let pts = 0;

  if (!dists[0]!.length && !dists[1]!.length) {
    // No rocks in house - blank end
  } else if (!dists[1]!.length) {
    scoringTeam = 0;
    pts = dists[0]!.length;
  } else if (!dists[0]!.length) {
    scoringTeam = 1;
    pts = dists[1]!.length;
  } else if (dists[0]![0]! < dists[1]![0]!) {
    scoringTeam = 0;
    pts = dists[0]!.filter((d) => d < dists[1]![0]!).length;
  } else {
    scoringTeam = 1;
    pts = dists[1]!.filter((d) => d < dists[0]![0]!).length;
  }

  return { scoringTeam, pts };
}

// Get the next team to deliver
export function getNextTeam(
  lastScoringTeam: number,
  currentTeam: number,
): number {
  if (lastScoringTeam >= 0) {
    return lastScoringTeam;
  }
  // Blank end - same team keeps hammer
  return currentTeam;
}
