// Core type definitions

import type { World } from "../constants/world";
import type { Theme } from "../constants/theme";
import type { PhysicsTune } from "../constants/physics";
import type { IceGrid } from "../ice/grid";

// Game phase states
export type GamePhase =
  | "title"
  | "aiming"
  | "power"
  | "running"
  | "scoring"
  | "gameover";

// Rock debug information
export interface RockDebug {
  friction: number;
  vFactor: number;
  fL: number;
  fR: number;
  v: number;
  spin: number;
  spinCurl: number;
  gradDrift: number;
  slopeY: number;
  slopeX: number;
}

// Rock entity
export interface Rock {
  id: number;
  team: number;
  x: number;
  y: number;
  angle: number;
  velocity: number;
  spin: number;
  paperTurns: number;
  inPlay: boolean;
  active: boolean;
  stopped: boolean;
  hasContacted: boolean;
  dbg: RockDebug;
}

// End scoring result
export interface EndScore {
  scoringTeam: number;
  pts: number;
}

// Ice profile definition
export type IceProfileKey = "championship" | "club" | "arena" | "swingy" | "discovery";

export interface IceProfile {
  name: string;
  desc: string;
  init: (grid: IceGrid) => void;
}

// UI dimensions
export interface Dimensions {
  w: number;
  h: number;
}

// Render state for perspective view
export interface PerspectiveState {
  WORLD: World;
  ROCK_RADIUS: number;
  rocks: Rock[];
  deliveryRock: Rock | null;
  sweeping: boolean;
  phase: GamePhase;
  aimAngle: number;
  currentTeam: number;
  theme: Theme;
}

// Projection result for 3D rendering
export interface ProjResult {
  sx: number;
  sy: number;
  sc: number;
  d: number;
}

// Render state for overhead view
export interface OverheadState {
  WORLD: World;
  ROCK_RADIUS: number;
  rocks: Rock[];
  phase: GamePhase;
  aimAngle: number;
  currentTeam: number;
  theme: Theme;
  showOverlay: boolean;
  showDebug: boolean;
  tune: PhysicsTune;
  grid: IceGrid;
}
