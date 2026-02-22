// 3D Perspective renderer - behind-the-hack view

import type { PerspectiveState, ProjResult, Rock } from "../types";
import type { Team, Theme } from "../constants/theme";
import { PI } from "../constants/world";

// Project 3D world coordinates to 2D screen coordinates
function proj(
  wx: number,
  wy: number,
  wz: number,
  camX: number,
  camH: number,
  fLen: number,
  hrzY: number,
  W: number,
): ProjResult | null {
  const d = camX - wx;
  if (d <= 0) return null;
  return {
    sx: W / 2 + (wy * fLen) / d,
    sy: hrzY + ((camH - wz) * fLen) / d,
    sc: fLen / d,
    d,
  };
}

// Draw a single rock in perspective
function drawRockPerspective(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  rr: number,
  team: Team,
  th: Theme,
  _moving: boolean,
  scale: number,
): void {
  const flat = 0.4; // vertical flattening for 3D perspective
  const height = rr * 0.25 * scale; // apparent height of rock above ice

  // Rock body - granite appearance
  if (th.rockGradient) {
    ctx.fillStyle = team.f;
    ctx.beginPath();
    ctx.ellipse(rx, ry - height * 0.5, rr * 0.85, rr * flat * 0.85, 0, 0, PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#333340";
  }

  // Main rock body ellipse
  ctx.strokeStyle = team.s;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(rx, ry - height * 0.3, rr, rr * flat, 0, 0, PI * 2);
  ctx.fill();
  ctx.stroke();

  // Top rim highlight
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(rx, ry - height * 0.5, rr * 0.85, rr * flat * 0.85, 0, 0, PI * 2);
  ctx.fill();

  // Handle
  const handleR = rr * 0.14;
  ctx.fillStyle = team.f;
  ctx.strokeStyle = th.rockStroke;
  ctx.lineWidth = th.rockHandleWidth * scale * 0.5;
  ctx.beginPath();
  ctx.ellipse(rx, ry - height * 0.5, handleR, handleR * flat, 0, 0, PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Main perspective drawing function
export function drawPerspective(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: PerspectiveState,
): void {
  const {
    WORLD: WD,
    ROCK_RADIUS: RR,
    rocks,
    phase,
    aimAngle,
    currentTeam,
    theme: th,
  } = state;

  const camX = WD.hackPos + 80;
  const camH = 60;
  const fLen = W * 0.75;
  const hrzY = H * 0.32;
  const e = WD.sheetHalfWidth;

  const projFn = (wx: number, wy: number, wz = 0): ProjResult | null =>
    proj(wx, wy, wz, camX, camH, fLen, hrzY, W);

  // Clear canvas
  ctx.fillStyle = th.canvasBg;
  ctx.fillRect(0, 0, W, H);

  // Draw sheet trapezoid
  const nearX = WD.hackPos;
  const farX = WD.backLine - 20;
  const nL = projFn(nearX, -e);
  const nR = projFn(nearX, e);
  const fL = projFn(farX, -e);
  const fR = projFn(farX, e);

  if (nL && nR && fL && fR) {
    const ig = ctx.createLinearGradient(0, fL.sy, 0, nL.sy);
    ig.addColorStop(0, th.sheetGradient[0]!);
    ig.addColorStop(0.5, th.sheetGradient[1]!);
    ig.addColorStop(1, th.sheetGradient[2]!);
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(nL.sx, nL.sy);
    ctx.lineTo(fL.sx, fL.sy);
    ctx.lineTo(fR.sx, fR.sy);
    ctx.lineTo(nR.sx, nR.sy);
    ctx.closePath();
    ctx.fill();

    // Side boards
    ctx.fillStyle = th.canvasBg;
    const bH = 8;
    const nLH = projFn(nearX, -e, bH);
    const fLH = projFn(farX, -e, bH);
    if (nLH && fLH) {
      ctx.beginPath();
      ctx.moveTo(nL.sx, nL.sy);
      ctx.lineTo(fL.sx, fL.sy);
      ctx.lineTo(fLH.sx, fLH.sy);
      ctx.lineTo(nLH.sx, nLH.sy);
      ctx.closePath();
      ctx.fill();
    }
    const nRH = projFn(nearX, e, bH);
    const fRH = projFn(farX, e, bH);
    if (nRH && fRH) {
      ctx.beginPath();
      ctx.moveTo(nR.sx, nR.sy);
      ctx.lineTo(fR.sx, fR.sy);
      ctx.lineTo(fRH.sx, fRH.sy);
      ctx.lineTo(nRH.sx, nRH.sy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Draw lines
  const dl3 = (wx: number, col: string, w: number): void => {
    const l = projFn(wx, -e);
    const r = projFn(wx, e);
    if (!l || !r) return;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.5, w * l.sc * 0.3);
    ctx.beginPath();
    ctx.moveTo(l.sx, l.sy);
    ctx.lineTo(r.sx, r.sy);
    ctx.stroke();
  };

  dl3(WD.hogLine, th.hogLine, th.lineWidth.hog);
  dl3(WD.tLine, th.tLine, th.lineWidth.tee);
  dl3(WD.backLine, th.backLine, th.lineWidth.back);

  // Center line
  const cN = projFn(nearX, 0);
  const cF = projFn(farX, 0);
  if (cN && cF) {
    ctx.strokeStyle = th.centerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cN.sx, cN.sy);
    ctx.lineTo(cF.sx, cF.sy);
    ctx.stroke();
  }

  // Draw house rings
  const hp = projFn(WD.houseCenter.x, WD.houseCenter.y);
  if (hp) {
    for (const [r, fill, stroke, lw] of th.houseRings) {
      const lft = projFn(WD.houseCenter.x, WD.houseCenter.y - r);
      const rgt = projFn(WD.houseCenter.x, WD.houseCenter.y + r);
      const top = projFn(WD.houseCenter.x - r, WD.houseCenter.y);
      const bot = projFn(WD.houseCenter.x + r, WD.houseCenter.y);
      if (!lft || !rgt || !top || !bot) continue;
      const rx2 = Math.abs(rgt.sx - lft.sx) / 2;
      const ry2 = Math.abs(bot.sy - top.sy) / 2;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.5, lw * hp.sc * 0.15);
      ctx.beginPath();
      ctx.ellipse(hp.sx, hp.sy, rx2, ry2, 0, 0, PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Button
    ctx.fillStyle = th.buttonFill;
    ctx.beginPath();
    ctx.arc(hp.sx, hp.sy, Math.max(2, hp.sc * 1.2), 0, PI * 2);
    ctx.fill();

    // Crosshairs
    if (th.houseCrosshairs) {
      const cr = hp.sc * 75;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hp.sx - cr, hp.sy);
      ctx.lineTo(hp.sx + cr, hp.sy);
      ctx.moveTo(hp.sx, hp.sy - cr);
      ctx.lineTo(hp.sx, hp.sy + cr);
      ctx.stroke();
    }
  }

  // Draw hack
  const hck = projFn(WD.hackPos, 0);
  if (hck) {
    ctx.fillStyle = th.hackFill;
    const hs = Math.max(2, hck.sc * 3);
    ctx.fillRect(hck.sx - hs * 2, hck.sy - hs / 2, hs * 4, hs);
  }

  // Sort rocks by depth for proper rendering order
  const rd = rocks
    .filter((r) => r.inPlay)
    .map((rock) => {
      const p = projFn(rock.x, rock.y, RR * 0.3);
      return p ? { rock, p } : null;
    })
    .filter((x): x is { rock: Rock; p: ProjResult } => x !== null)
    .sort((a, b) => b.p.d - a.p.d);

  // Draw rocks
  for (const { rock, p } of rd) {
    const rr = Math.max(2, p.sc * RR * 1.05);
    const team = th.teams[rock.team];
    if (!team) continue;
    drawRockPerspective(ctx, p.sx, p.sy, rr, team, th, rock.velocity > 0.1, p.sc);
  }

  // Draw aim line during aiming/power phase
  if (phase === "aiming" || phase === "power") {
    const aN = projFn(WD.hackPos, aimAngle);
    const aF = projFn(WD.houseCenter.x, aimAngle);
    if (aN && aF) {
      const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
      ctx.strokeStyle = `rgba(${col},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(aN.sx, aN.sy);
      ctx.lineTo(aF.sx, aF.sy);
      ctx.stroke();
    }
  }
}
