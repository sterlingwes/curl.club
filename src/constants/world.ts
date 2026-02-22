// World/sheet constants

export const PI = Math.PI;
export const ROCK_RADIUS = 5;
export const RESTITUTION = 0.92;
export const ROCKS_PER_TEAM = 8;
export const ROCKS_PER_END = ROCKS_PER_TEAM * 2;

export interface World {
  sheetHalfWidth: number;
  sheetStart: number;
  sheetEnd: number;
  hogLine: number;
  tLine: number;
  backLine: number;
  hackPos: number;
  houseCenter: { x: number; y: number };
  houseRadii: [number, number, number, number];
}

export const WORLD: World = {
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
