// Ice condition profiles

import type { IceProfileKey, IceProfile } from "../types";
import type { IceGrid } from "./grid";
import { GRID_COLS, GRID_ROWS, GRID_X_MIN, GRID_Y_MIN, CELL_W, CELL_H } from "../constants/grid";

export const ICE_PROFILES: Record<IceProfileKey, IceProfile> = {
  championship: {
    name: "Championship",
    desc: "Flat, consistent, fresh pebble.",
    init: () => {},
  },
  club: {
    name: "Club Ice",
    desc: "Slight dish, mild center wear.",
    init: (grid: IceGrid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c]?.[r];
          if (!cell) continue;
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY = -yN * 0.0012;
          if (Math.abs(yN) < 0.3) {
            cell.pebbleHeight -= 0.12 * (1 - Math.abs(yN) / 0.3);
          }
        }
      }
    },
  },
  arena: {
    name: "Arena",
    desc: "Cold ice, brine trough, corner slope.",
    init: (grid: IceGrid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c]?.[r];
          if (!cell) continue;
          cell.temperature = -1.5;
          const yW = GRID_Y_MIN + (r + 0.5) * CELL_H;
          const xW = GRID_X_MIN + (c + 0.5) * CELL_W;
          if (Math.abs(yW - 25) < 8) {
            cell.temperature -= 2;
            cell.pebbleHeight -= 0.12;
            cell.slopeY = 0.0012;
          }
          if (xW < -500 && yW > 40) {
            cell.slopeY = -0.003;
            cell.slopeX = -0.001;
          }
        }
      }
    },
  },
  swingy: {
    name: "Swingy",
    desc: "Heavy dish, thick pebble, big curl.",
    init: (grid: IceGrid) => {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c]?.[r];
          if (!cell) continue;
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY = -yN * 0.003;
          cell.pebbleHeight = 1.2;
        }
      }
    },
  },
  discovery: {
    name: "Discovery",
    desc: "Random hidden features.",
    init: (grid: IceGrid) => {
      const R = Math.random;
      const dish = (R() - 0.3) * 0.003;
      const tY = (R() - 0.5) * 130;
      const tW = 5 + R() * 12;
      const tS = (R() - 0.5) * 0.003;
      const hasT = R() > 0.35;
      const hasCrn = R() > 0.4;
      const cqx = R() > 0.5 ? 1 : -1;
      const cqy = R() > 0.5 ? 1 : -1;
      const cs = 0.001 + R() * 0.004;
      const wOff = (R() - 0.5) * 30;
      const wAmt = 0.05 + R() * 0.2;

      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c]?.[r];
          if (!cell) continue;
          const xW = GRID_X_MIN + (c + 0.5) * CELL_W;
          const yW = GRID_Y_MIN + (r + 0.5) * CELL_H;
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY += -yN * dish;

          if (hasT && Math.abs(yW - tY) < tW) {
            cell.slopeY += tS;
            cell.pebbleHeight -= 0.15;
          }

          if (hasCrn && xW < -450 && Math.abs(yW) > 50) {
            if (yW > 0) cell.slopeY += cs * cqy;
            else cell.slopeY -= cs * cqy;
            if (xW < -520) cell.slopeX += cs * cqx;
          }

          const wearF = Math.abs(yW - wOff) / 30;
          if (wearF < 1) {
            cell.pebbleHeight -= wAmt * (1 - wearF);
          }
        }
      }
    },
  },
};

export const DEFAULT_PROFILE: IceProfileKey = "club";
