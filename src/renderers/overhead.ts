// Overhead view renderer - top-down sheet view

import type { OverheadState } from "../types";
import type { Theme } from "../constants/theme";
import type { PhysicsTune } from "../constants/physics";
import type { IceGrid } from "../ice/grid";
import { PI } from "../constants/world";
import { GRID_COLS, GRID_ROWS } from "../constants/grid";
import { cellFriction } from "../ice/grid";

// Build ice grid overlay visualization
function buildOverlay(
  grid: IceGrid,
  tune: PhysicsTune,
  showOverlay: boolean,
): HTMLCanvasElement {
  const oc = document.createElement("canvas");
  oc.width = GRID_COLS;
  oc.height = GRID_ROWS;
  const octx = oc.getContext("2d");
  if (!octx) return oc;
  const id = octx.createImageData(GRID_COLS, GRID_ROWS);
  const T = tune;

  for (let c = 0; c < GRID_COLS; c++) {
    for (let r = 0; r < GRID_ROWS; r++) {
      const cell = grid.cells[c]?.[r];
      if (!cell) continue;
      const idx = (r * GRID_COLS + c) * 4;
      const wear = 1 - Math.max(0, Math.min(1, cell.pebbleHeight));
      const fric = cellFriction(cell, T.baseFriction, T.pebbleFrictionBonus);
      const sm = Math.sqrt(cell.slopeX ** 2 + cell.slopeY ** 2);
      if (showOverlay) {
        const fn = Math.max(0, Math.min(1, (fric - 0.05) / 0.15));
        id.data[idx] = Math.floor(fn * 200 + sm * 8000);
        id.data[idx + 1] = Math.floor((1 - wear) * 140);
        id.data[idx + 2] = Math.floor(cell.moisture * 255 + (cell.temperature < -1 ? 60 : 0));
        id.data[idx + 3] = 160;
      } else {
        id.data[idx] = Math.floor(wear * 60);
        id.data[idx + 1] = Math.floor(wear * 40);
        id.data[idx + 2] = Math.floor(cell.moisture * 120);
        id.data[idx + 3] = Math.floor(wear * 100 + cell.moisture * 80);
      }
    }
  }
  octx.putImageData(id, 0, 0);
  return oc;
}

// Draw debug arrow
function drawArrow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  color: string,
  theme: Theme,
  label?: string,
): void {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.3) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + dx, sy + dy);
  ctx.stroke();
  const ang = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(sx + dx, sy + dy);
  ctx.lineTo(sx + dx - Math.cos(ang - 0.5) * 4, sy + dy - Math.sin(ang - 0.5) * 4);
  ctx.lineTo(sx + dx - Math.cos(ang + 0.5) * 4, sy + dy - Math.sin(ang + 0.5) * 4);
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.font = "8px " + theme.font;
    ctx.fillText(label, sx + dx + 3, sy + dy);
  }
}

// Main overhead drawing function
export function drawOverhead(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: OverheadState,
): void {
  const {
    WORLD: WD,
    ROCK_RADIUS: RR,
    rocks,
    phase,
    aimAngle,
    currentTeam,
    theme: th,
    showOverlay,
    showDebug,
    tune,
    grid,
  } = state;

  // Coordinate transformation
  // - World Y (sheet width) maps to screen X (horizontal)
  // - World X (sheet length) maps to screen Y (vertical)
  // - Define a viewing area and scale to fit it in the canvas
  const e = WD.sheetHalfWidth;
  const sheetWidth = e * 2; // 164 world units

  // Define viewing area: from back line to near hack
  // This ensures we always see the house and a good portion of the sheet
  const viewTop = WD.backLine - 10; // -622 (slightly above back line)
  const viewBottom = WD.hackPos + 50; // -50 (past hack towards sheet start)
  const viewHeight = viewBottom - viewTop; // ~572 world units

  // Calculate scale to fit viewing area while maintaining aspect ratio
  // Use the smaller scale to ensure the entire viewing area fits
  const scaleX = (W * 0.98) / sheetWidth;
  const scaleY = (H * 0.98) / viewHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center the view in the canvas
  const actualWidth = sheetWidth * scale;
  const actualHeight = viewHeight * scale;
  const offsetX = (W - actualWidth) / 2;
  const offsetY = (H - actualHeight) / 2;

  // World to screen coordinate conversion
  const toS = (wx: number, wy: number): [number, number] =>
    [offsetX + (wy + e) * scale, offsetY + (wx - viewTop) * scale];
  const r2s = (wr: number): number => wr * scale;

  // Clear canvas
  ctx.fillStyle = th.canvasBg;
  ctx.fillRect(0, 0, W, H);

  // Draw sheet background
  const ig = ctx.createLinearGradient(0, 0, 0, H);
  ig.addColorStop(0, th.sheetGradient[0]!);
  ig.addColorStop(0.5, th.sheetGradient[1]!);
  ig.addColorStop(1, th.sheetGradient[2]!);
  ctx.fillStyle = ig;

  // Calculate sheet corners in screen coordinates
  // Note: world X increases towards hack, screen Y increases downward
  // So sheetStart (hack end, high X) maps to high screen Y (bottom)
  // And sheetEnd (back line end, low X) maps to low screen Y (top)
  const [sheetLeft, sheetBottom] = toS(WD.sheetStart, -e);  // hack end, left side
  const [sheetRight, sheetTop] = toS(WD.sheetEnd, e);       // back line end, right side
  const sheetW = sheetRight - sheetLeft;
  const sheetH = sheetBottom - sheetTop;
  ctx.beginPath();
  ctx.roundRect(sheetLeft, sheetTop, sheetW, sheetH, th.sheetRadius);
  ctx.fill();

  // Draw pebble dots
  ctx.fillStyle = th.pebbleDots;
  for (let i = 0; i < 800; i++) {
    const px = sheetLeft + Math.random() * sheetW;
    const py = sheetTop + Math.random() * sheetH;
    ctx.fillRect(px, py, 1, 1);
  }

  // Draw overlay
  if (showOverlay || showDebug) {
    const overlay = buildOverlay(grid, tune, showOverlay);
    ctx.globalAlpha = 0.4;
    ctx.drawImage(overlay, sheetLeft, sheetTop, sheetW, sheetH);
    ctx.globalAlpha = 1;
  }

  // Draw world line helper
  const drawWL = (wx: number, color: string, w: number): void => {
    const [x1, y1] = toS(wx, -e);
    const [x2, y2] = toS(wx, e);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // Draw lines
  drawWL(WD.hogLine, th.hogLine, th.lineWidth.hog);
  drawWL(WD.tLine, th.tLine, th.lineWidth.tee);
  drawWL(WD.backLine, th.backLine, th.lineWidth.back);

  // Center line
  ctx.strokeStyle = th.centerLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const [c1x, c1y] = toS(WD.sheetStart, 0);
  const [c2x, c2y] = toS(WD.sheetEnd, 0);
  ctx.moveTo(c1x, c1y);
  ctx.lineTo(c2x, c2y);
  ctx.stroke();

  // Draw house rings
  const [hcx, hcy] = toS(WD.houseCenter.x, WD.houseCenter.y);
  for (const [r, fill, stroke, lw] of th.houseRings) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(hcx, hcy, r2s(r), 0, PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Button
  ctx.fillStyle = th.buttonFill;
  ctx.beginPath();
  ctx.arc(hcx, hcy, Math.max(2, r2s(1.2)), 0, PI * 2);
  ctx.fill();

  // Crosshairs
  if (th.houseCrosshairs) {
    const cr = r2s(75);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hcx - cr, hcy);
    ctx.lineTo(hcx + cr, hcy);
    ctx.moveTo(hcx, hcy - cr);
    ctx.lineTo(hcx, hcy + cr);
    ctx.stroke();
  }

  // Draw hack
  const [hkx, hky] = toS(WD.hackPos, 0);
  const hs = r2s(3);
  ctx.fillStyle = th.hackFill;
  ctx.fillRect(hkx - hs * 2, hky - hs / 2, hs * 4, hs);

  // Draw rocks
  const tcA = th.teams;
  for (const rock of rocks) {
    if (!rock.inPlay) continue;
    const [rx, ry] = toS(rock.x, rock.y);
    const rr = r2s(RR) * 1.05;
    const c = tcA[rock.team];
    if (!c) continue;

    // Motion glow
    if (rock.velocity > 0.1) {
      ctx.fillStyle = c.g;
      ctx.beginPath();
      ctx.arc(rx, ry, rr + 3, 0, PI * 2);
      ctx.fill();
    }

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.arc(rx + 1, ry + 1, rr, 0, PI * 2);
    ctx.fill();

    // Rock body
    if (th.rockGradient) {
      const rg = ctx.createRadialGradient(rx - rr * 0.3, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
      rg.addColorStop(0, "#fff");
      rg.addColorStop(0.35, c.f);
      rg.addColorStop(1, c.s);
      ctx.fillStyle = rg;
    } else {
      ctx.fillStyle = c.f;
    }
    ctx.strokeStyle = c.s;
    ctx.lineWidth = th.rockGradient ? 1 : 2;
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, PI * 2);
    ctx.fill();
    ctx.stroke();

    // Handle
    ctx.strokeStyle = th.rockStroke;
    ctx.lineWidth = th.rockHandleWidth;
    ctx.beginPath();
    ctx.arc(rx, ry, rr * 0.4, 0, PI * 2);
    ctx.stroke();
  }

  // Draw reserve rocks
  for (let t = 0; t < 2; t++) {
    const teamColors = tcA[t];
    if (!teamColors) continue;
    const rem = rocks.filter((r) => r.team === t && !r.inPlay && r.x >= 200).length;
    for (let i = 0; i < rem; i++) {
      const py = (t === 0 ? -1 : 1) * (e + 10 + i * RR * 2.4);
      const [px, py2] = toS(WD.hackPos + 30, py);
      const pr = r2s(RR) * 0.6;
      ctx.fillStyle = teamColors.f + "45";
      ctx.strokeStyle = teamColors.s + "25";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(px, py2, pr, 0, PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Draw aim line
  if (phase === "aiming" || phase === "power") {
    const [ax, ay] = toS(WD.hackPos, aimAngle);
    const [tx, ty] = toS(WD.houseCenter.x, aimAngle);
    const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
    ctx.strokeStyle = `rgba(${col},0.35)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  // Draw debug arrows
  if (showDebug) {
    for (const rock of rocks) {
      if (!rock.inPlay || rock.velocity < 0.02) continue;
      const [sx, sy] = toS(rock.x, rock.y);
      if (Math.abs(rock.dbg.spinCurl) > 0.001) {
        drawArrow(ctx, sx, sy, 0, rock.dbg.spinCurl * 50, "rgba(0,200,0,0.6)", th);
      }
      if (Math.abs(rock.dbg.gradDrift) > 0.001) {
        drawArrow(ctx, sx, sy + 8, 0, rock.dbg.gradDrift * 50, "rgba(0,0,200,0.6)", th);
      }
    }
  }
}
