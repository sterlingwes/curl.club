// Grid constants for ice simulation

import { WORLD, ROCK_RADIUS } from "./world";

export const GRID_COLS = 48;
export const GRID_ROWS = 16;

export const GRID_X_MIN = WORLD.sheetEnd;
export const GRID_X_MAX = WORLD.sheetStart;
export const GRID_Y_MIN = -WORLD.sheetHalfWidth;
export const GRID_Y_MAX = WORLD.sheetHalfWidth;

export const CELL_W = (GRID_X_MAX - GRID_X_MIN) / GRID_COLS;
export const CELL_H = (GRID_Y_MAX - GRID_Y_MIN) / GRID_ROWS;

export const CURL_SAMPLE_OFFSET = ROCK_RADIUS * 0.8;
