// Ice grid system for friction, slope, and wear simulation

import { GRID_COLS, GRID_ROWS, GRID_X_MIN, GRID_Y_MIN, CELL_W, CELL_H } from "../constants/grid";

// Cell interface for ice grid
export interface Cell {
  pebbleHeight: number;
  temperature: number;
  moisture: number;
  slopeX: number;
  slopeY: number;
}

// Create a fresh cell with default values
export function createCell(): Cell {
  return {
    pebbleHeight: 1.0,
    temperature: 0,
    moisture: 0,
    slopeX: 0,
    slopeY: 0,
  };
}

// Calculate friction for a cell
export function cellFriction(cell: Cell, baseFriction: number, pebbleBonus: number): number {
  return Math.max(
    0.02,
    baseFriction +
      cell.pebbleHeight * pebbleBonus -
      cell.moisture * 0.03 +
      cell.temperature * 0.002,
  );
}

// Ice grid class
export class IceGrid {
  cells: Cell[][];

  constructor() {
    this.cells = [];
    for (let c = 0; c < GRID_COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        this.cells[c]![r] = createCell();
      }
    }
  }

  toGrid(wx: number, wy: number): [number, number] {
    return [
      Math.max(0, Math.min(GRID_COLS - 1, Math.floor((wx - GRID_X_MIN) / CELL_W))),
      Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((wy - GRID_Y_MIN) / CELL_H))),
    ];
  }

  private _bilinear(wx: number, wy: number, fn: (c: Cell) => number): number {
    const fx = (wx - GRID_X_MIN) / CELL_W - 0.5;
    const fy = (wy - GRID_Y_MIN) / CELL_H - 0.5;
    const c0 = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - c0));
    const ty = Math.max(0, Math.min(1, fy - r0));

    const cell00 = this.cells[c0]?.[r0];
    const cell10 = this.cells[c0 + 1]?.[r0];
    const cell01 = this.cells[c0]?.[r0 + 1];
    const cell11 = this.cells[c0 + 1]?.[r0 + 1];

    if (!cell00 || !cell10 || !cell01 || !cell11) return 0;

    return (
      fn(cell00) * (1 - tx) * (1 - ty) +
      fn(cell10) * tx * (1 - ty) +
      fn(cell01) * (1 - tx) * ty +
      fn(cell11) * tx * ty
    );
  }

  sampleFriction(wx: number, wy: number, baseFriction: number, pebbleBonus: number): number {
    return this._bilinear(wx, wy, (c) => cellFriction(c, baseFriction, pebbleBonus));
  }

  sampleSlope(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: this._bilinear(wx, wy, (c) => c.slopeX),
      sy: this._bilinear(wx, wy, (c) => c.slopeY),
    };
  }

  applyWear(wx: number, wy: number, dt: number, isSweeping: boolean, wearRate: number): void {
    const [c, r] = this.toGrid(wx, wy);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= GRID_COLS || rr < 0 || rr >= GRID_ROWS) continue;
        const w = dc === 0 && dr === 0 ? 1.0 : 0.3;
        const cell = this.cells[cc]?.[rr];
        if (!cell) continue;

        cell.pebbleHeight = Math.max(0, cell.pebbleHeight - wearRate * w * dt);
        if (isSweeping) {
          cell.pebbleHeight = Math.max(0, cell.pebbleHeight - wearRate * 2.5 * w * dt);
          cell.moisture = Math.min(1, cell.moisture + 0.05 * w * dt);
        }
      }
    }
  }

  evaporateMoisture(dt: number): void {
    for (let c = 0; c < GRID_COLS; c++) {
      for (let r = 0; r < GRID_ROWS; r++) {
        const cell = this.cells[c]?.[r];
        if (cell && cell.moisture > 0) {
          cell.moisture = Math.max(0, cell.moisture - 0.008 * dt);
        }
      }
    }
  }
}
