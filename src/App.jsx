import { useState, useEffect, useRef, useCallback } from "react";

const PI = Math.PI;
const ROCK_RADIUS = 5;
const RESTITUTION = 0.92;
const ROCKS_PER_TEAM = 8;
const ROCKS_PER_END = ROCKS_PER_TEAM * 2;

const WORLD = {
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

const GRID_COLS = 48,
  GRID_ROWS = 16;
const GRID_X_MIN = WORLD.sheetEnd,
  GRID_X_MAX = WORLD.sheetStart;
const GRID_Y_MIN = -WORLD.sheetHalfWidth,
  GRID_Y_MAX = WORLD.sheetHalfWidth;
const CELL_W = (GRID_X_MAX - GRID_X_MIN) / GRID_COLS;
const CELL_H = (GRID_Y_MAX - GRID_Y_MIN) / GRID_ROWS;
const CURL_SAMPLE_OFFSET = ROCK_RADIUS * 0.8;

const DEFAULTS = {
  baseFriction: 0.08,
  pebbleFrictionBonus: 0.07,
  curlCoeff: 40,
  gradientCoeff: 8,
  slopeGravity: 18,
  frictionDecel: 5,
  speedScale: 60,
  wearRate: 0.0015,
  sweepBoost: 0.15,
};

// ============================================================
// THEMES
// ============================================================
const THEMES = {
  modern: {
    name: "Modern",
    // Page chrome
    pageBg: "linear-gradient(145deg,#070b14 0%,#0d1525 40%,#111d33 100%)",
    font: "'JetBrains Mono','SF Mono','Fira Code',monospace",
    textColor: "#c8d8e8",
    dimText: "#4a6080",
    accentText: "#8ab4f8",
    // Canvas
    canvasBg: "#0a0f1a",
    sheetGradient: ["#dce9f2", "#eaf4fa", "#d8e8f0"],
    sheetRadius: 5,
    pebbleDots: "rgba(180,200,215,0.06)",
    // Lines
    hogLine: "#cc223388",
    tLine: "#33446666",
    backLine: "#44557766",
    centerLine: "#33446625",
    lineWidth: { hog: 2.5, tee: 1.5, back: 2 },
    // House
    houseRings: [
      [72, "rgba(30,90,180,0.15)", "rgba(30,90,180,0.30)", 1.5],
      [48, "rgba(225,232,242,0.30)", "rgba(180,190,200,0.20)", 1.5],
      [24, "rgba(200,40,40,0.15)", "rgba(200,40,40,0.25)", 1.5],
      [6, "rgba(225,232,242,0.35)", "rgba(180,190,200,0.30)", 1.5],
    ],
    buttonFill: "#1a1a2e",
    houseCrosshairs: false,
    // Hack
    hackFill: "#222",
    // Rocks
    teams: [
      {
        f: "#f0c830",
        s: "#b8941e",
        g: "rgba(240,200,48,0.28)",
        name: "Yellow",
      },
      { f: "#d03030", s: "#8b1a1a", g: "rgba(208,48,48,0.28)", name: "Red" },
    ],
    rockStroke: "#555",
    rockHandleWidth: 1.2,
    rockGradient: true,
    // UI chrome
    btnBg: "rgba(255,255,255,0.05)",
    btnBorder: "1px solid rgba(255,255,255,0.1)",
    btnRadius: 3,
    btnColor: "#8ab4f8",
    panelBg: "rgba(255,255,255,0.03)",
    panelBorder: "1px solid rgba(255,255,255,0.08)",
    scoreBg: "rgba(255,255,255,0.03)",
    scoreBorder: "1px solid rgba(255,255,255,0.06)",
    canvasBorder: "1px solid rgba(255,255,255,0.06)",
    // Title screen
    titleBg: "rgba(7,11,20,0.88)",
    titleGradient: "linear-gradient(135deg,#f0c830,#d03030)",
    titleFont: 42,
    titleWeight: 900,
    startBtnBg:
      "linear-gradient(135deg,rgba(240,200,48,0.15),rgba(208,48,48,0.15))",
    // Overlays (scoring, gameover)
    overlayBg: "rgba(7,11,20,0.75)",
    // Sweep
    sweepEmoji: true,
  },
  wincurl: {
    name: "WinCurl 2.0",
    // Page chrome — classic Win3.1 gray
    pageBg: "#c0c0c0",
    font: "'MS Sans Serif','Segoe UI','Tahoma',sans-serif",
    textColor: "#000000",
    dimText: "#808080",
    accentText: "#000080",
    // Canvas
    canvasBg: "#404040",
    sheetGradient: ["#e8e8e8", "#f0f0f0", "#e8e8e8"],
    sheetRadius: 0,
    pebbleDots: "rgba(200,200,200,0.08)",
    // Lines — bold, solid
    hogLine: "#cc0000",
    tLine: "#000000",
    backLine: "#000000",
    centerLine: "#00000040",
    lineWidth: { hog: 3, tee: 2, back: 2.5 },
    // House — bold WinCurl saturated rings with thick black outlines
    houseRings: [
      [72, "rgba(0,0,200,0.7)", "#000000", 3],
      [48, "rgba(255,255,255,0.95)", "#000000", 3],
      [24, "rgba(220,0,0,0.7)", "#000000", 3],
      [6, "rgba(255,255,255,0.95)", "#000000", 2],
    ],
    buttonFill: "#000000",
    houseCrosshairs: true,
    // Hack
    hackFill: "#000000",
    // Rocks — flat, bold
    teams: [
      { f: "#e0c020", s: "#000000", g: "rgba(224,192,32,0.3)", name: "Yellow" },
      { f: "#d02020", s: "#000000", g: "rgba(208,32,32,0.3)", name: "Red" },
    ],
    rockStroke: "#000000",
    rockHandleWidth: 2,
    rockGradient: false,
    // UI chrome — Win3.1 beveled
    btnBg: "#c0c0c0",
    btnBorder: "2px outset #ffffff",
    btnRadius: 0,
    btnColor: "#000000",
    panelBg: "#c0c0c0",
    panelBorder: "2px inset #808080",
    scoreBg: "#c0c0c0",
    scoreBorder: "2px inset #808080",
    canvasBorder: "2px inset #808080",
    // Title screen
    titleBg: "rgba(0,0,128,0.92)",
    titleGradient: "none",
    titleFont: 32,
    titleWeight: 700,
    titleTextColor: "#ffffff",
    startBtnBg: "#c0c0c0",
    startBtnBorder: "2px outset #ffffff",
    // Overlays
    overlayBg: "rgba(0,0,128,0.80)",
    // Sweep — cyan corridor like WinCurl
    sweepEmoji: false,
    sweepCorridor: true,
  },
};

// ============================================================
// SHARED DRAWING UTILS
// ============================================================
function drawHouseRings(ctx, cx, cy, r2s, th) {
  th.houseRings.forEach(([r, f, s, lw]) => {
    ctx.fillStyle = f;
    ctx.strokeStyle = s;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r2s(r), 0, PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.fillStyle = th.buttonFill;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(2, r2s(1.2)), 0, PI * 2);
  ctx.fill();
  if (th.houseCrosshairs) {
    const cr = r2s(75);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - cr, cy);
    ctx.lineTo(cx + cr, cy);
    ctx.moveTo(cx, cy - cr);
    ctx.lineTo(cx, cy + cr);
    ctx.stroke();
  }
}

function drawRockFn(ctx, rx, ry, rr, c, th, moving) {
  if (moving) {
    ctx.fillStyle = c.g;
    ctx.beginPath();
    ctx.arc(rx, ry, rr + 3, 0, PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.arc(rx + 1, ry + 1, rr, 0, PI * 2);
  ctx.fill();
  if (th.rockGradient) {
    const rg = ctx.createRadialGradient(
      rx - rr * 0.3,
      ry - rr * 0.3,
      rr * 0.1,
      rx,
      ry,
      rr,
    );
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
  ctx.strokeStyle = th.rockStroke;
  ctx.lineWidth = th.rockHandleWidth;
  ctx.beginPath();
  ctx.arc(rx, ry, rr * 0.4, 0, PI * 2);
  ctx.stroke();
}

// ============================================================
// PERSPECTIVE RENDERER
// ============================================================
function drawPerspective(ctx, W, H, state) {
  const {
    WORLD: WD,
    ROCK_RADIUS: RR,
    rocks,
    deliveryRock,
    sweeping,
    phase,
    aimAngle,
    currentTeam,
    theme: th,
  } = state;
  const camX = WD.hackPos + 80,
    camH = 60,
    fLen = W * 0.75,
    hrzY = H * 0.32,
    e = WD.sheetHalfWidth;
  const proj = (wx, wy, wz = 0) => {
    const d = camX - wx;
    if (d <= 0) return null;
    return {
      sx: W / 2 + (wy * fLen) / d,
      sy: hrzY + ((camH - wz) * fLen) / d,
      sc: fLen / d,
      d,
    };
  };
  ctx.fillStyle = th.canvasBg;
  ctx.fillRect(0, 0, W, H);
  const nearX = WD.hackPos,
    farX = WD.backLine - 20;
  const nL = proj(nearX, -e),
    nR = proj(nearX, e),
    fL = proj(farX, -e),
    fR = proj(farX, e);
  if (nL && nR && fL && fR) {
    const ig = ctx.createLinearGradient(0, fL.sy, 0, nL.sy);
    ig.addColorStop(0, th.sheetGradient[0]);
    ig.addColorStop(0.5, th.sheetGradient[1]);
    ig.addColorStop(1, th.sheetGradient[2]);
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.moveTo(nL.sx, nL.sy);
    ctx.lineTo(fL.sx, fL.sy);
    ctx.lineTo(fR.sx, fR.sy);
    ctx.lineTo(nR.sx, nR.sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.canvasBg;
    const bH = 8,
      nLH = proj(nearX, -e, bH),
      fLH = proj(farX, -e, bH);
    if (nLH && fLH) {
      ctx.beginPath();
      ctx.moveTo(nL.sx, nL.sy);
      ctx.lineTo(fL.sx, fL.sy);
      ctx.lineTo(fLH.sx, fLH.sy);
      ctx.lineTo(nLH.sx, nLH.sy);
      ctx.closePath();
      ctx.fill();
    }
    const nRH = proj(nearX, e, bH),
      fRH = proj(farX, e, bH);
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
  const dl3 = (wx, col, w) => {
    const l = proj(wx, -e),
      r = proj(wx, e);
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
  const cN = proj(nearX, 0),
    cF = proj(farX, 0);
  if (cN && cF) {
    ctx.strokeStyle = th.centerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cN.sx, cN.sy);
    ctx.lineTo(cF.sx, cF.sy);
    ctx.stroke();
  }
  const hp = proj(WD.houseCenter.x, WD.houseCenter.y);
  if (hp) {
    for (const [r, fill, stroke, lw] of th.houseRings) {
      const lft = proj(WD.houseCenter.x, WD.houseCenter.y - r),
        rgt = proj(WD.houseCenter.x, WD.houseCenter.y + r),
        top = proj(WD.houseCenter.x - r, WD.houseCenter.y),
        bot = proj(WD.houseCenter.x + r, WD.houseCenter.y);
      if (!lft || !rgt || !top || !bot) continue;
      const rx2 = Math.abs(rgt.sx - lft.sx) / 2,
        ry2 = Math.abs(bot.sy - top.sy) / 2;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.5, lw * hp.sc * 0.15);
      ctx.beginPath();
      ctx.ellipse(hp.sx, hp.sy, rx2, ry2, 0, 0, PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = th.buttonFill;
    ctx.beginPath();
    ctx.arc(hp.sx, hp.sy, Math.max(1.5, hp.sc * 1.2), 0, PI * 2);
    ctx.fill();
    if (th.houseCrosshairs) {
      const cL = proj(WD.houseCenter.x, WD.houseCenter.y - 75),
        cR = proj(WD.houseCenter.x, WD.houseCenter.y + 75),
        cT = proj(WD.houseCenter.x - 75, WD.houseCenter.y),
        cB = proj(WD.houseCenter.x + 75, WD.houseCenter.y);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      if (cL && cR) {
        ctx.beginPath();
        ctx.moveTo(cL.sx, cL.sy);
        ctx.lineTo(cR.sx, cR.sy);
        ctx.stroke();
      }
      if (cT && cB) {
        ctx.beginPath();
        ctx.moveTo(cT.sx, cT.sy);
        ctx.lineTo(cB.sx, cB.sy);
        ctx.stroke();
      }
    }
  }
  const hk = proj(WD.hackPos, 0);
  if (hk) {
    const hw = hk.sc * 3;
    ctx.fillStyle = th.hackFill;
    ctx.fillRect(hk.sx - hw, hk.sy - 1, hw * 2, 3);
  }
  if (phase === "running" && deliveryRock?.inPlay && sweeping) {
    const rp = proj(deliveryRock.x, deliveryRock.y),
      hpp = proj(WD.houseCenter.x, 0);
    if (rp && hpp) {
      const cw = rp.sc * 18,
        hw2 = hpp.sc * 40;
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#00e8e8";
      ctx.beginPath();
      ctx.moveTo(rp.sx - cw, rp.sy);
      ctx.lineTo(hpp.sx - hw2, hpp.sy);
      ctx.lineTo(hpp.sx + hw2, hpp.sy);
      ctx.lineTo(rp.sx + cw, rp.sy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  const rd = rocks
    .filter((r) => r.inPlay)
    .map((r) => {
      const p = proj(r.x, r.y, RR * 0.3);
      return p ? { rock: r, p } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.p.d - a.p.d);
  for (const { rock, p } of rd) {
    const rr = Math.max(2, p.sc * RR * 1.05);
    drawRockFn(
      ctx,
      p.sx,
      p.sy,
      rr,
      th.teams[rock.team],
      th,
      rock.velocity > 0.1,
    );
  }
  if (phase === "aiming" || phase === "power") {
    const aN = proj(WD.hackPos, aimAngle),
      aF = proj(WD.houseCenter.x, aimAngle);
    if (aN && aF) {
      const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
      ctx.strokeStyle = `rgba(${col},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(aN.sx, aN.sy);
      ctx.lineTo(aF.sx, aF.sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${col},0.8)`;
      ctx.lineWidth = 1.5;
      const tr = Math.max(4, aF.sc * 5);
      ctx.beginPath();
      ctx.arc(aF.sx, aF.sy, tr, 0, PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(aF.sx - tr * 1.5, aF.sy);
      ctx.lineTo(aF.sx + tr * 1.5, aF.sy);
      ctx.moveTo(aF.sx, aF.sy - tr * 1.5);
      ctx.lineTo(aF.sx, aF.sy + tr * 1.5);
      ctx.stroke();
    }
  }
}

// ============================================================
// HOUSE ZOOM RENDERER
// ============================================================
function drawHouseZoom(ctx, W, H, state) {
  const { WORLD: WD, ROCK_RADIUS: RR, rocks, theme: th } = state;
  ctx.fillStyle = th.canvasBg;
  ctx.fillRect(0, 0, W, H);
  const vr = WD.houseRadii[3] + RR * 2 + 10,
    sc = (Math.min(W, H) * 0.46) / vr,
    cx = W / 2,
    cy = H / 2;
  const toS = (wx, wy) => [
    cx + (wy - WD.houseCenter.y) * sc,
    cy - (wx - WD.houseCenter.x) * sc,
  ];
  const r2s = (wr) => wr * sc;
  ctx.fillStyle = th.sheetGradient[1];
  ctx.fillRect(0, 0, W, H);
  const e2 = WD.sheetHalfWidth;
  const drawL = (wx, col, w) => {
    const [x1, y1] = toS(wx, -e2),
      [x2, y2] = toS(wx, e2);
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  drawL(WD.tLine, th.tLine, th.lineWidth.tee);
  drawL(WD.backLine, th.backLine, th.lineWidth.back);
  ctx.strokeStyle = th.centerLine;
  ctx.lineWidth = 1;
  const [c1x, c1y] = toS(WD.houseCenter.x + vr, 0),
    [c2x, c2y] = toS(WD.houseCenter.x - vr, 0);
  ctx.beginPath();
  ctx.moveTo(c1x, c1y);
  ctx.lineTo(c2x, c2y);
  ctx.stroke();
  const [hcx, hcy] = toS(WD.houseCenter.x, WD.houseCenter.y);
  drawHouseRings(ctx, hcx, hcy, r2s, th);
  const maxD = vr + RR;
  for (const rock of rocks) {
    if (!rock.inPlay) continue;
    const dx = rock.x - WD.houseCenter.x,
      dy = rock.y - WD.houseCenter.y;
    if (Math.sqrt(dx * dx + dy * dy) > maxD) continue;
    const [rx, ry] = toS(rock.x, rock.y);
    drawRockFn(
      ctx,
      rx,
      ry,
      r2s(RR) * 1.05,
      th.teams[rock.team],
      th,
      rock.velocity > 0.1,
    );
  }
  ctx.font = "bold 8px " + th.font;
  ctx.fillStyle = th.dimText;
  ctx.textAlign = "center";
  ctx.fillText("HOUSE", W / 2, H - 4);
  ctx.textAlign = "start";
}

function createCell() {
  return {
    pebbleHeight: 1.0,
    temperature: 0,
    moisture: 0,
    slopeX: 0,
    slopeY: 0,
  };
}

function cellFriction(cell, bf, pb) {
  return Math.max(
    0.02,
    bf +
      cell.pebbleHeight * pb -
      cell.moisture * 0.03 +
      cell.temperature * 0.002,
  );
}

class IceGrid {
  constructor() {
    this.cells = [];
    for (let c = 0; c < GRID_COLS; c++) {
      this.cells[c] = [];
      for (let r = 0; r < GRID_ROWS; r++) this.cells[c][r] = createCell();
    }
  }
  toGrid(wx, wy) {
    return [
      Math.max(
        0,
        Math.min(GRID_COLS - 1, Math.floor((wx - GRID_X_MIN) / CELL_W)),
      ),
      Math.max(
        0,
        Math.min(GRID_ROWS - 1, Math.floor((wy - GRID_Y_MIN) / CELL_H)),
      ),
    ];
  }
  _bilinear(wx, wy, fn) {
    const fx = (wx - GRID_X_MIN) / CELL_W - 0.5,
      fy = (wy - GRID_Y_MIN) / CELL_H - 0.5;
    const c0 = Math.max(0, Math.min(GRID_COLS - 2, Math.floor(fx))),
      r0 = Math.max(0, Math.min(GRID_ROWS - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - c0)),
      ty = Math.max(0, Math.min(1, fy - r0));
    return (
      fn(this.cells[c0][r0]) * (1 - tx) * (1 - ty) +
      fn(this.cells[c0 + 1][r0]) * tx * (1 - ty) +
      fn(this.cells[c0][r0 + 1]) * (1 - tx) * ty +
      fn(this.cells[c0 + 1][r0 + 1]) * tx * ty
    );
  }
  sampleFriction(wx, wy, bf, pb) {
    return this._bilinear(wx, wy, (c) => cellFriction(c, bf, pb));
  }
  sampleSlope(wx, wy) {
    return {
      sx: this._bilinear(wx, wy, (c) => c.slopeX),
      sy: this._bilinear(wx, wy, (c) => c.slopeY),
    };
  }
  applyWear(wx, wy, dt, isSweeping, wearRate) {
    const [c, r] = this.toGrid(wx, wy);
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc,
          rr = r + dr;
        if (cc < 0 || cc >= GRID_COLS || rr < 0 || rr >= GRID_ROWS) continue;
        const w = dc === 0 && dr === 0 ? 1.0 : 0.3,
          cell = this.cells[cc][rr];
        cell.pebbleHeight = Math.max(0, cell.pebbleHeight - wearRate * w * dt);
        if (isSweeping) {
          cell.pebbleHeight = Math.max(
            0,
            cell.pebbleHeight - wearRate * 2.5 * w * dt,
          );
          cell.moisture = Math.min(1, cell.moisture + 0.05 * w * dt);
        }
      }
  }
  evaporateMoisture(dt) {
    for (let c = 0; c < GRID_COLS; c++)
      for (let r = 0; r < GRID_ROWS; r++) {
        const cell = this.cells[c][r];
        if (cell.moisture > 0)
          cell.moisture = Math.max(0, cell.moisture - 0.008 * dt);
      }
  }
}

const ICE_PROFILES = {
  championship: {
    name: "Championship",
    desc: "Flat, consistent, fresh pebble.",
    init: () => {},
  },
  club: {
    name: "Club Ice",
    desc: "Slight dish, mild center wear.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++)
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY = -yN * 0.0012;
          if (Math.abs(yN) < 0.3)
            cell.pebbleHeight -= 0.12 * (1 - Math.abs(yN) / 0.3);
        }
    },
  },
  arena: {
    name: "Arena",
    desc: "Cold ice, brine trough, corner slope.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++)
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          cell.temperature = -1.5;
          const yW = GRID_Y_MIN + (r + 0.5) * CELL_H,
            xW = GRID_X_MIN + (c + 0.5) * CELL_W;
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
    },
  },
  swingy: {
    name: "Swingy",
    desc: "Heavy dish, thick pebble, big curl.",
    init: (grid) => {
      for (let c = 0; c < GRID_COLS; c++)
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY = -yN * 0.003;
          cell.pebbleHeight = 1.2;
        }
    },
  },
  discovery: {
    name: "Discovery",
    desc: "Random hidden features.",
    init: (grid) => {
      const R = Math.random;
      const dish = (R() - 0.3) * 0.003;
      const tY = (R() - 0.5) * 130,
        tW = 5 + R() * 12,
        tS = (R() - 0.5) * 0.003,
        hasT = R() > 0.35;
      const hasCrn = R() > 0.4,
        cqx = R() > 0.5 ? 1 : -1,
        cqy = R() > 0.5 ? 1 : -1,
        cs = 0.001 + R() * 0.004;
      const wOff = (R() - 0.5) * 30,
        wAmt = 0.05 + R() * 0.2;
      for (let c = 0; c < GRID_COLS; c++)
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r];
          const xW = GRID_X_MIN + (c + 0.5) * CELL_W,
            yW = GRID_Y_MIN + (r + 0.5) * CELL_H;
          const yN = (r - GRID_ROWS / 2) / (GRID_ROWS / 2);
          cell.slopeY += -yN * dish;
          if (hasT && Math.abs(yW - tY) < tW) {
            const d = 1 - Math.abs(yW - tY) / tW;
            cell.temperature -= 1.5 * d;
            cell.pebbleHeight -= 0.08 * d;
            cell.slopeY += tS * d;
          }
          if (
            hasCrn &&
            (cqx > 0 ? xW < -480 : xW > -200) &&
            (cqy > 0 ? yW > 30 : yW < -30)
          ) {
            cell.slopeY += cqy * -cs;
            cell.slopeX += cqx * -cs * 0.3;
          }
          if (Math.abs(yW - wOff) < 15)
            cell.pebbleHeight -= wAmt * (1 - Math.abs(yW - wOff) / 15);
          cell.pebbleHeight = Math.max(0, Math.min(1.3, cell.pebbleHeight));
        }
    },
  },
};

function createRock(team, id) {
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
    },
  };
}

function Slider({ label, value, min, max, step, onChange, theme: th }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
    >
      <span
        style={{
          fontSize: 8,
          color: th?.dimText || "#6a8aaa",
          minWidth: 72,
          textAlign: "right",
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          flex: 1,
          height: 3,
          accentColor: th?.accentText || "#8ab4f8",
          cursor: "pointer",
        }}
      />
      <span
        style={{
          fontSize: 8,
          color: th?.textColor || "#f0c830",
          minWidth: 40,
          fontWeight: 700,
        }}
      >
        {typeof value === "number"
          ? value.toFixed(step < 1 ? (step < 0.01 ? 3 : 2) : 0)
          : value}
      </span>
    </div>
  );
}

export default function CurlingGame() {
  const canvasRef = useRef(null),
    perspCanvasRef = useRef(null),
    animRef = useRef(null),
    iceGridRef = useRef(new IceGrid());
  const [phase, setPhase] = useState("title");
  const [currentEnd, setCurrentEnd] = useState(1);
  const [totalEnds] = useState(8);
  const [currentTeam, setCurrentTeam] = useState(0);
  const [rockNum, setRockNum] = useState(0);
  const [scores, setScores] = useState([[], []]);
  const [endScoreDisplay, setEndScoreDisplay] = useState(null);
  const [aimAngle, setAimAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [curlDir, setCurlDir] = useState(1);
  // Vertical-only mode - horizontal mode removed
  const [isNarrowLayout, setIsNarrowLayout] = useState(true);
  const [iceProfile, setIceProfile] = useState("club");
  const [showOverlay, setShowOverlay] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [themeName, setThemeName] = useState("modern");
  const theme = THEMES[themeName] || THEMES.modern;
  const [tune, setTune] = useState({ ...DEFAULTS });
  const setT = (key, val) => setTune((prev) => ({ ...prev, [key]: val }));
  const rocksRef = useRef([]),
    deliveryRockRef = useRef(null),
    sweepingRef = useRef(false);

  const initIce = useCallback((pk) => {
    const g = new IceGrid();
    ICE_PROFILES[pk]?.init(g);
    iceGridRef.current = g;
  }, []);
  const initEnd = useCallback(() => {
    rocksRef.current = [];
    for (let t = 0; t < 2; t++)
      for (let i = 0; i < ROCKS_PER_TEAM; i++) {
        const r = createRock(t, t * ROCKS_PER_TEAM + i);
        r.x = 200 + i * 20;
        r.y = t === 0 ? -60 : 60;
        rocksRef.current.push(r);
      }
  }, []);

  const resolveCollisions = useCallback((rocks) => {
    for (let i = 0; i < rocks.length; i++) {
      const a = rocks[i];
      if (!a.inPlay || a.velocity <= 0.05) continue;
      for (let j = 0; j < rocks.length; j++) {
        if (i === j) continue;
        const b = rocks[j];
        if (!b.inPlay) continue;
        const dx = a.x - b.x,
          dy = a.y - b.y,
          dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ROCK_RADIUS * 2 && dist > 0) {
          const nx = (b.x - a.x) / dist,
            ny = (b.y - a.y) / dist;
          const avx = Math.cos(a.angle) * a.velocity,
            avy = Math.sin(a.angle) * a.velocity;
          const bvx = Math.cos(b.angle) * b.velocity,
            bvy = Math.sin(b.angle) * b.velocity;
          const rv = (avx - bvx) * nx + (avy - bvy) * ny;
          if (rv > 0) {
            const imp = rv * RESTITUTION;
            const nax = avx - imp * nx,
              nay = avy - imp * ny,
              nbx = bvx + imp * nx,
              nby = bvy + imp * ny;
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
  }, []);

  const removeRock = (rock) => {
    rock.inPlay = false;
    rock.active = false;
    rock.velocity = 0;
    rock.x = 800;
  };

  const physicsTick = useCallback(
    (dt) => {
      const rocks = rocksRef.current,
        grid = iceGridRef.current,
        T = tune;
      let anyMoving = false;
      grid.evaporateMoisture(dt);
      for (const rock of rocks) {
        if (!rock.inPlay || rock.velocity <= 0.02) {
          if (rock.inPlay) rock.stopped = true;
          continue;
        }
        anyMoving = true;
        rock.stopped = false;
        const isSweeping =
          sweepingRef.current && rock === deliveryRockRef.current;
        const friction = grid.sampleFriction(
          rock.x,
          rock.y,
          T.baseFriction,
          T.pebbleFrictionBonus,
        );
        const slope = grid.sampleSlope(rock.x, rock.y);
        rock.velocity = Math.max(
          0,
          rock.velocity - friction * T.frictionDecel * dt,
        );
        if (isSweeping && rock.velocity > 0.3)
          rock.velocity += dt * T.sweepBoost;
        const v = rock.velocity,
          vFactor = Math.max(0.3, Math.sqrt(v / 2));
        const spinCurl =
          rock.spin * rock.paperTurns * friction * T.curlCoeff * vFactor;
        const perpX = -Math.sin(rock.angle) * CURL_SAMPLE_OFFSET,
          perpY = Math.cos(rock.angle) * CURL_SAMPLE_OFFSET;
        const fL = grid.sampleFriction(
          rock.x + perpX,
          rock.y + perpY,
          T.baseFriction,
          T.pebbleFrictionBonus,
        );
        const fR = grid.sampleFriction(
          rock.x - perpX,
          rock.y - perpY,
          T.baseFriction,
          T.pebbleFrictionBonus,
        );
        const gradDrift = (fL - fR) * T.gradientCoeff * vFactor;
        const slopeScale = Math.min(1, v * 2);
        const slopeYF = slope.sy * T.slopeGravity * slopeScale,
          slopeXF = slope.sx * T.slopeGravity * slopeScale;
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
        };
        rock.y += (spinCurl + gradDrift + slopeYF) * dt;
        rock.velocity = Math.max(0, rock.velocity + slopeXF * dt * 0.5);
        rock.x += Math.cos(rock.angle) * rock.velocity * dt * T.speedScale;
        rock.y += Math.sin(rock.angle) * rock.velocity * dt * T.speedScale;
        grid.applyWear(rock.x, rock.y, dt, isSweeping, T.wearRate);
        if (rock.x - ROCK_RADIUS < WORLD.backLine) {
          removeRock(rock);
          continue;
        }
        if (Math.abs(rock.y) + ROCK_RADIUS > WORLD.sheetHalfWidth) {
          removeRock(rock);
          continue;
        }
        if (
          rock.velocity <= 0.02 &&
          rock.x > WORLD.hogLine - ROCK_RADIUS &&
          !rock.hasContacted
        ) {
          removeRock(rock);
          continue;
        }
      }
      resolveCollisions(rocks);
      return anyMoving;
    },
    [resolveCollisions, tune],
  );

  const scoreEnd = useCallback(() => {
    const rocks = rocksRef.current.filter((r) => r.inPlay),
      hx = WORLD.houseCenter.x,
      hy = WORLD.houseCenter.y,
      maxR = WORLD.houseRadii[3] + ROCK_RADIUS;
    const dists = [[], []];
    for (const r of rocks) {
      const d = Math.sqrt((r.x - hx) ** 2 + (r.y - hy) ** 2);
      if (d <= maxR) dists[r.team].push(d);
    }
    dists[0].sort((a, b) => a - b);
    dists[1].sort((a, b) => a - b);
    let sT = -1,
      pts = 0;
    if (!dists[0].length && !dists[1].length) {
    } else if (!dists[1].length) {
      sT = 0;
      pts = dists[0].length;
    } else if (!dists[0].length) {
      sT = 1;
      pts = dists[1].length;
    } else if (dists[0][0] < dists[1][0]) {
      sT = 0;
      pts = dists[0].filter((d) => d < dists[1][0]).length;
    } else {
      sT = 1;
      pts = dists[1].filter((d) => d < dists[0][0]).length;
    }
    return { scoringTeam: sT, pts };
  }, []);

  const deliverRock = useCallback(() => {
    const ti = currentTeam,
      ri = Math.floor(rockNum / 2);
    const rock = rocksRef.current.find(
      (r) => r.team === ti && r.id === ti * ROCKS_PER_TEAM + ri,
    );
    if (!rock) return;
    rock.x = WORLD.hackPos;
    rock.y = aimAngle;
    rock.angle = PI;
    rock.velocity = 1.8 + 2.6 * Math.pow(power / 100, 0.5);
    rock.spin = curlDir; // Fixed: vertical mode only, no flip needed
    rock.paperTurns = 0.8 + Math.random() * 0.4;
    rock.inPlay = true;
    rock.active = true;
    rock.stopped = false;
    rock.hasContacted = false;
    deliveryRockRef.current = rock;
  }, [currentTeam, rockNum, aimAngle, power, curlDir]);

  useEffect(() => {
    if (phase !== "running") return;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!physicsTick(dt)) {
        sweepingRef.current = false;
        deliveryRockRef.current = null;
        const next = rockNum + 1;
        if (next >= ROCKS_PER_END) {
          const res = scoreEnd();
          setEndScoreDisplay(res);
          setScores((prev) => {
            const n = [prev[0].slice(), prev[1].slice()];
            if (res.scoringTeam >= 0) {
              n[res.scoringTeam].push(res.pts);
              n[1 - res.scoringTeam].push(0);
            } else {
              n[0].push(0);
              n[1].push(0);
            }
            return n;
          });
          setPhase("scoring");
        } else {
          setRockNum(next);
          setCurrentTeam(next % 2 === 0 ? 0 : 1);
          setPhase("aiming");
          setAimAngle(0);
          setPower(0);
        }
        return;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, physicsTick, rockNum, scoreEnd]);

  useEffect(() => {
    if (phase !== "aiming") return;
    let t = 0;
    const max = WORLD.sheetHalfWidth - ROCK_RADIUS - 2;
    const iv = setInterval(() => {
      t += 0.03;
      setAimAngle(Math.sin(t) * max);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);
  useEffect(() => {
    if (phase !== "power") return;
    let t = 0,
      d = 1;
    const iv = setInterval(() => {
      t += d * 2.5;
      if (t >= 100) d = -1;
      if (t <= 0) d = 1;
      setPower(t);
    }, 30);
    return () => clearInterval(iv);
  }, [phase]);

  // Breakpoint detection for layout (narrow < 500px, wide >= 500px)
  useEffect(() => {
    const checkBreakpoint = () => {
      setIsNarrowLayout(window.innerWidth < 500);
    };
    checkBreakpoint();
    window.addEventListener("resize", checkBreakpoint);
    return () => window.removeEventListener("resize", checkBreakpoint);
  }, []);

  // === RENDERING ===
  useEffect(() => {
    const canvas = canvasRef.current;
    const perspCanvas = perspCanvasRef.current;
    if (!canvas || !perspCanvas) return;
    const ctx = canvas.getContext("2d");
    const perspCtx = perspCanvas.getContext("2d");
    let raf;
    const W = canvas.width,
      H = canvas.height,
      // Hardcoded vertical mode: world +y goes to right (screen +x)
      isV = true;
    const xRange = WORLD.sheetStart - WORLD.sheetEnd,
      yRange = WORLD.sheetHalfWidth * 2;
    const uScale = Math.min(
      (H * 0.92) / xRange,
      (W * 0.92) / yRange,
    );
    const wcx = (WORLD.sheetStart + WORLD.sheetEnd) / 2;
    const toS = (wx, wy) => [W / 2 + wy * uScale, H / 2 + (wx - wcx) * uScale];
    const r2s = (wr) => wr * uScale;
    const T = tune,
      grid = iceGridRef.current;
    // World +y force → screen delta. Vert: +y → right (screen +x).
    const fToS = (fy, sc) => [fy * sc, 0];

    const buildOverlay = () => {
      const oc = document.createElement("canvas");
      oc.width = GRID_COLS;
      oc.height = GRID_ROWS;
      const octx = oc.getContext("2d"),
        id = octx.createImageData(GRID_COLS, GRID_ROWS);
      for (let c = 0; c < GRID_COLS; c++)
        for (let r = 0; r < GRID_ROWS; r++) {
          const cell = grid.cells[c][r],
            idx = (r * GRID_COLS + c) * 4;
          const wear = 1 - Math.max(0, Math.min(1, cell.pebbleHeight));
          const fric = cellFriction(
            cell,
            T.baseFriction,
            T.pebbleFrictionBonus,
          );
          const sm = Math.sqrt(cell.slopeX ** 2 + cell.slopeY ** 2);
          if (showOverlay) {
            const fn = Math.max(0, Math.min(1, (fric - 0.05) / 0.15));
            id.data[idx] = Math.floor(fn * 200 + sm * 8000);
            id.data[idx + 1] = Math.floor((1 - wear) * 140);
            id.data[idx + 2] = Math.floor(
              cell.moisture * 255 + (cell.temperature < -1 ? 60 : 0),
            );
            id.data[idx + 3] = 160;
          } else {
            id.data[idx] = Math.floor(wear * 60);
            id.data[idx + 1] = Math.floor(wear * 40);
            id.data[idx + 2] = Math.floor(cell.moisture * 120);
            id.data[idx + 3] = Math.floor(wear * 100 + cell.moisture * 80);
          }
        }
      octx.putImageData(id, 0, 0);
      return oc;
    };

    const drawArrow = (sx, sy, dx, dy, color, label) => {
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
      ctx.lineTo(
        sx + dx - Math.cos(ang - 0.5) * 4,
        sy + dy - Math.sin(ang - 0.5) * 4,
      );
      ctx.moveTo(sx + dx, sy + dy);
      ctx.lineTo(
        sx + dx - Math.cos(ang + 0.5) * 4,
        sy + dy - Math.sin(ang + 0.5) * 4,
      );
      ctx.stroke();
      if (label) {
        ctx.font = "bold 6px monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, sx + dx + 2, sy + dy + 2);
      }
    };

    const draw = () => {
      const th = theme;
      ctx.fillStyle = th.canvasBg;
      ctx.fillRect(0, 0, W, H);
      const e = WORLD.sheetHalfWidth,
        tl = toS(WORLD.sheetStart, e),
        br = toS(WORLD.sheetEnd, -e);
      const sL = Math.min(tl[0], br[0]),
        sT2 = Math.min(tl[1], br[1]),
        sW = Math.abs(br[0] - tl[0]),
        sH = Math.abs(br[1] - tl[1]);
      const gr = isV
        ? ctx.createLinearGradient(sL, sT2, sL, sT2 + sH)
        : ctx.createLinearGradient(sL, sT2, sL + sW, sT2);
      gr.addColorStop(0, th.sheetGradient[0]);
      gr.addColorStop(0.5, th.sheetGradient[1]);
      gr.addColorStop(1, th.sheetGradient[2]);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(sL, sT2, sW, sH, th.sheetRadius);
      ctx.fill();

      if (showOverlay || phase === "running" || phase === "scoring") {
        const oImg = buildOverlay();
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = showOverlay ? 0.85 : 0.5;
        // Vertical mode: translate to top-left and rotate
        ctx.translate(sL, sT2 + sH);
        ctx.rotate(-PI / 2);
        ctx.drawImage(oImg, 0, 0, GRID_COLS, GRID_ROWS, 0, 0, sH, sW);
        ctx.restore();
      }
      if (showOverlay) {
        for (let c = 0; c < GRID_COLS; c += 3)
          for (let r = 0; r < GRID_ROWS; r += 3) {
            const cell = grid.cells[c][r];
            const mag = Math.sqrt(cell.slopeX ** 2 + cell.slopeY ** 2);
            if (mag < 0.0003) continue;
            const wx = GRID_X_MIN + (c + 0.5) * CELL_W,
              wy = GRID_Y_MIN + (r + 0.5) * CELL_H;
            const [sx, sy] = toS(wx, wy);
            const len = Math.min(12, mag * 3000);
            const ang = Math.atan2(cell.slopeY, cell.slopeX);
            // Vertical mode: -ang + PI/2
            const sa = -ang + PI / 2;
            const ex = sx + Math.cos(sa) * len,
              ey = sy - Math.sin(sa) * len;
            ctx.strokeStyle = `rgba(255,220,80,${Math.min(0.8, mag * 250)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
      }

      ctx.fillStyle = th.pebbleDots;
      let seed = 42;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 300; i++) {
        ctx.beginPath();
        ctx.arc(
          sL + rnd() * sW,
          sT2 + rnd() * sH,
          0.3 + rnd() * 0.3,
          0,
          PI * 2,
        );
        ctx.fill();
      }

      const drawWL = (wx, color, w) => {
        const [x1, y1] = toS(wx, -e),
          [x2, y2] = toS(wx, e);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      };
      drawWL(WORLD.hogLine, th.hogLine, th.lineWidth.hog);
      drawWL(WORLD.tLine, th.tLine, th.lineWidth.tee);
      drawWL(WORLD.backLine, th.backLine, th.lineWidth.back);
      ctx.strokeStyle = th.centerLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...toS(WORLD.sheetStart, 0));
      ctx.lineTo(...toS(WORLD.sheetEnd, 0));
      ctx.stroke();

      const [hcx, hcy] = toS(WORLD.houseCenter.x, WORLD.houseCenter.y);
      th.houseRings.forEach(([r, f, s, lw]) => {
        ctx.fillStyle = f;
        ctx.strokeStyle = s;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(hcx, hcy, r2s(r), 0, PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.fillStyle = th.buttonFill;
      ctx.beginPath();
      ctx.arc(hcx, hcy, Math.max(2, r2s(1.2)), 0, PI * 2);
      ctx.fill();
      // WinCurl-style thick black crosshairs on the house
      if (th === THEMES.wincurl) {
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

      const [hkx, hky] = toS(WORLD.hackPos, 0);
      const hs = r2s(3);
      ctx.fillStyle = th.hackFill;
      // Vertical mode: horizontal hack line
      ctx.fillRect(hkx - hs * 2, hky - hs / 2, hs * 4, hs);

      const tcA = th.teams;
      for (const rock of rocksRef.current) {
        if (!rock.inPlay) continue;
        const [rx, ry] = toS(rock.x, rock.y);
        const rr = r2s(ROCK_RADIUS) * 1.05;
        const c = tcA[rock.team];
        if (rock.velocity > 0.1) {
          ctx.fillStyle = c.g;
          ctx.beginPath();
          ctx.arc(rx, ry, rr + 3, 0, PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.beginPath();
        ctx.arc(rx + 1, ry + 1, rr, 0, PI * 2);
        ctx.fill();
        if (th.rockGradient) {
          const rg = ctx.createRadialGradient(
            rx - rr * 0.3,
            ry - rr * 0.3,
            rr * 0.1,
            rx,
            ry,
            rr,
          );
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
        ctx.strokeStyle = th.rockStroke;
        ctx.lineWidth = th.rockHandleWidth;
        ctx.beginPath();
        ctx.arc(rx, ry, rr * 0.4, 0, PI * 2);
        ctx.stroke();

        if (showDebug && rock.velocity > 0.02) {
          const d = rock.dbg,
            sc = 10;
          const [scX, scY] = fToS(d.spinCurl, sc),
            [gdX, gdY] = fToS(d.gradDrift, sc),
            [slX, slY] = fToS(d.slopeY, sc);
          const net = d.spinCurl + d.gradDrift + d.slopeY;
          const [nX, nY] = fToS(net, sc);
          const bx = rx,
            by = ry - rr - 3;
          drawArrow(bx, by, scX, scY, "#00ffff", "sc:" + d.spinCurl.toFixed(2));
          drawArrow(
            bx,
            by - 10,
            gdX,
            gdY,
            "#ff00ff",
            "gd:" + d.gradDrift.toFixed(3),
          );
          drawArrow(
            bx,
            by - 20,
            slX,
            slY,
            "#ffdd00",
            "sl:" + d.slopeY.toFixed(3),
          );
          drawArrow(bx, by - 30, nX, nY, "#ffffff", "\u03A3:" + net.toFixed(2));
          ctx.font = "bold 5px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "#aaddaa";
          ctx.fillText(
            "spin=" +
              (d.spin > 0 ? "+1" : "-1") +
              " v=" +
              d.v.toFixed(2) +
              " vF=" +
              d.vFactor.toFixed(3),
            rx,
            ry + rr + 9,
          );
          ctx.fillStyle = "#aaaadd";
          ctx.fillText(
            "fric=" +
              d.friction.toFixed(4) +
              " fL=" +
              d.fL.toFixed(4) +
              " fR=" +
              d.fR.toFixed(4),
            rx,
            ry + rr + 17,
          );
          ctx.fillStyle = "#ddaaaa";
          ctx.fillText(
            "y=" + rock.y.toFixed(1) + " ang=" + rock.angle.toFixed(4),
            rx,
            ry + rr + 25,
          );
        }
      }

      for (let t = 0; t < 2; t++) {
        const rem = rocksRef.current.filter(
          (r) => r.team === t && !r.inPlay && r.x >= 200,
        ).length;
        for (let i = 0; i < rem; i++) {
          const py = (t === 0 ? -1 : 1) * (e + 10 + i * ROCK_RADIUS * 2.4);
          const [px, py2] = toS(WORLD.hackPos + 30, py);
          const pr = r2s(ROCK_RADIUS) * 0.6;
          ctx.fillStyle = tcA[t].f + "45";
          ctx.strokeStyle = tcA[t].s + "25";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(px, py2, pr, 0, PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      if (phase === "aiming" || phase === "power") {
        const [ax, ay] = toS(WORLD.hackPos, aimAngle),
          [tx, ty] = toS(WORLD.houseCenter.x, aimAngle);
        const col = currentTeam === 0 ? "240,200,48" : "208,48,48";
        ctx.strokeStyle = `rgba(${col},0.35)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${col},0.7)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 7, 0, PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - 10, ty);
        ctx.lineTo(tx + 10, ty);
        ctx.moveTo(tx, ty - 10);
        ctx.lineTo(tx, ty + 10);
        ctx.stroke();
      }

      if (
        phase === "running" &&
        deliveryRockRef.current?.inPlay &&
        sweepingRef.current
      ) {
        const dr = deliveryRockRef.current;
        const [sx2, sy2] = toS(dr.x, dr.y);
        if (th.sweepCorridor) {
          // WinCurl-style cyan sweep corridor ahead of rock
          const [hx2, hy2] = toS(WORLD.houseCenter.x, 0);
          const rr2 = r2s(ROCK_RADIUS);
          const corridorW = r2s(20);
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = "#00e8e8";
          ctx.beginPath();
          ctx.moveTo(sx2, sy2 - corridorW);
          ctx.lineTo(hx2, hy2 - corridorW * 2.5);
          ctx.lineTo(hx2, hy2 + corridorW * 2.5);
          ctx.lineTo(sx2, sy2 + corridorW);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = "#00e8e8";
          ctx.font = "bold 8px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("SWEEP", sx2, sy2 - rr2 - 6);
          ctx.textAlign = "start";
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            "\uD83E\uDDF9",
            sx2,
            sy2 - r2s(ROCK_RADIUS) - (showDebug ? 38 : 6),
          );
          ctx.textAlign = "start";
        }
      }

      if (showOverlay) {
        ctx.fillStyle = "rgba(7,11,20,0.75)";
        ctx.fillRect(sL + 4, sT2 + 4, 110, 56);
        ctx.font = "bold 8px monospace";
        ctx.fillStyle = "#c8d8e8";
        ctx.fillText("OVERLAY", sL + 8, sT2 + 14);
        ctx.font = "7px monospace";
        ctx.fillStyle = "#e05050";
        ctx.fillText("\u25A0 Red = high friction", sL + 8, sT2 + 24);
        ctx.fillStyle = "#50c050";
        ctx.fillText("\u25A0 Green = pebble health", sL + 8, sT2 + 33);
        ctx.fillStyle = "#5080e0";
        ctx.fillText("\u25A0 Blue = moisture / cold", sL + 8, sT2 + 42);
        ctx.fillStyle = "#f0d830";
        ctx.fillText("\u2192 Yellow = slope direction", sL + 8, sT2 + 51);
      }
      if (showDebug) {
        const lx = sL + sW - 140,
          ly = sT2 + 4;
        ctx.fillStyle = "rgba(7,11,20,0.85)";
        ctx.fillRect(lx, ly, 136, 56);
        ctx.font = "bold 7px monospace";
        ctx.fillStyle = "#00ffff";
        ctx.fillText("\u2192 cyan = spin curl", lx + 4, ly + 12);
        ctx.fillStyle = "#ff00ff";
        ctx.fillText("\u2192 magenta = grad drift", lx + 4, ly + 22);
        ctx.fillStyle = "#ffdd00";
        ctx.fillText("\u2192 yellow = slope force", lx + 4, ly + 32);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("\u2192 white = NET lateral (\u03A3)", lx + 4, ly + 42);
        ctx.fillStyle = "#888";
        ctx.fillText("arrow len = force magnitude", lx + 4, ly + 52);
      }

      // Render perspective view
      drawPerspective(
        perspCtx,
        perspDims.w,
        perspDims.h,
        {
          WORLD,
          ROCK_RADIUS,
          rocks: rocksRef.current,
          deliveryRock: deliveryRockRef.current,
          sweeping: sweepingRef.current,
          phase,
          aimAngle,
          currentTeam,
          theme: th,
        },
      );

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [
    phase,
    aimAngle,
    currentTeam,
    showOverlay,
    showDebug,
    tune,
    theme,
  ]);

  const handleAction = useCallback(() => {
    if (phase === "title") {
      initIce(iceProfile);
      initEnd();
      setPhase("aiming");
      setCurrentTeam(0);
      setRockNum(0);
      setScores([[], []]);
      setCurrentEnd(1);
      setEndScoreDisplay(null);
      return;
    }
    if (phase === "aiming") {
      setPhase("power");
      return;
    }
    if (phase === "power") {
      deliverRock();
      setPhase("running");
      sweepingRef.current = false;
      return;
    }
    if (phase === "running") {
      sweepingRef.current = !sweepingRef.current;
      return;
    }
    if (phase === "scoring") {
      if (currentEnd >= totalEnds) setPhase("gameover");
      else {
        setCurrentEnd((e) => e + 1);
        const nf =
          endScoreDisplay?.scoringTeam >= 0
            ? endScoreDisplay.scoringTeam
            : currentTeam;
        setCurrentTeam(nf);
        setRockNum(0);
        setAimAngle(0);
        setPower(0);
        setEndScoreDisplay(null);
        initEnd();
        setPhase("aiming");
      }
      return;
    }
    if (phase === "gameover") {
      setPhase("title");
      return;
    }
  }, [
    phase,
    initIce,
    iceProfile,
    initEnd,
    deliverRock,
    currentEnd,
    totalEnds,
    endScoreDisplay,
    currentTeam,
  ]);

  const totalScore = (t) => scores[t].reduce((a, b) => a + b, 0);
  const tn = (t) => theme.teams[t].name;
  const tCol = (t) => theme.teams[t].f;
  // Main canvas dimensions (top-down minimap)
  const [dims, setDims] = useState({ w: 900, h: 500 });
  // Perspective canvas dimensions - grows to fill available space
  const [perspDims, setPerspDims] = useState({ w: 400, h: 400 });

  // Sheet aspect ratio (width:height ratio for the ice sheet)
  const SHEET_ASPECT = (WORLD.sheetStart - WORLD.sheetEnd) / (WORLD.sheetHalfWidth * 2);

  useEffect(() => {
    const resize = () => {
      const mw = Math.min(window.innerWidth - 24, 1100),
        mh = window.innerHeight - 260;

      if (isNarrowLayout) {
        // Narrow: stack vertically, perspective takes remaining space
        const sheetW = Math.min(mw, 400);
        const sheetH = Math.min(mh * 0.5, sheetW * SHEET_ASPECT);
        setDims({ w: Math.max(260, sheetW), h: Math.max(200, sheetH) });

        const pw = Math.min(mw, 400);
        const ph = Math.min(mh * 0.45, pw * 0.6);
        setPerspDims({ w: Math.max(260, pw), h: Math.max(180, ph) });
      } else {
        // Wide: side-by-side, both views fill space reasonably
        const sheetW = Math.min(mw * 0.45, 350);
        const sheetH = Math.min(mh, sheetW * SHEET_ASPECT);
        setDims({ w: Math.max(250, sheetW), h: Math.max(180, sheetH) });

        const pw = mw - sheetW - 8; // perspective takes remaining width
        const ph = Math.min(mh, pw * 0.6);
        setPerspDims({ w: Math.max(350, pw), h: Math.max(250, ph) });
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [isNarrowLayout]);

  const rockLabel = `${Math.floor(rockNum / 2) + 1}/${ROCKS_PER_TEAM}`;
  const btn = {
    background: theme.btnBg,
    border: theme.btnBorder,
    borderRadius: theme.btnRadius,
    padding: "2px 8px",
    color: theme.btnColor,
    fontSize: 9,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.pageBg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: theme.font,
        color: theme.textColor,
        padding: "10px 14px",
        boxSizing: "border-box",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
          width: "100%",
          maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 800,
            background:
              theme.titleGradient !== "none" ? theme.titleGradient : undefined,
            WebkitBackgroundClip:
              theme.titleGradient !== "none" ? "text" : undefined,
            WebkitTextFillColor:
              theme.titleGradient !== "none" ? "transparent" : undefined,
            color:
              theme.titleGradient === "none" ? theme.accentText : undefined,
          }}
        >
          CURLING
        </h1>
        <div
          style={{
            display: "flex",
            gap: 5,
            fontSize: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {phase !== "title" && phase !== "gameover" && (
            <span style={{ fontSize: 9 }}>
              E<b>{currentEnd}</b> R<b>{rockLabel}</b>
            </span>
          )}
          <button
            onClick={() => setShowOverlay((v) => !v)}
            style={{ ...btn, color: showOverlay ? "#f0c830" : theme.btnColor }}
          >
            🧊
          </button>
          <button
            onClick={() => setShowDebug((v) => !v)}
            style={{ ...btn, color: showDebug ? "#00ffcc" : theme.btnColor }}
          >
            🐛
          </button>
          <button onClick={() => setShowProfilePicker((v) => !v)} style={btn}>
            ⚙
          </button>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ ...btn, color: showAdvanced ? "#f0c830" : theme.btnColor }}
          >
            🔧
          </button>
          <button
            onClick={() =>
              setThemeName((t) => (t === "modern" ? "wincurl" : "modern"))
            }
            style={{ ...btn, fontSize: 8 }}
          >
            🎨 {theme.name}
          </button>
        </div>
      </div>

      {showProfilePicker && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 4,
            flexWrap: "wrap",
            width: "100%",
            maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
          }}
        >
          {Object.entries(ICE_PROFILES).map(([k, p]) => (
            <button
              key={k}
              onClick={() => {
                setIceProfile(k);
                setShowProfilePicker(false);
              }}
              style={{
                ...btn,
                padding: "3px 8px",
                color: iceProfile === k ? "#f0c830" : theme.btnColor,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 8 }}>{p.name}</div>
              <div style={{ fontSize: 6, color: theme.dimText, marginTop: 1 }}>
                {p.desc}
              </div>
            </button>
          ))}
        </div>
      )}

      {showAdvanced && (
        <div
          style={{
            width: "100%",
            maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
            background: theme.panelBg,
            border: theme.panelBorder,
            borderRadius: theme.btnRadius + 2,
            padding: "8px 10px",
            marginBottom: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{ fontSize: 9, fontWeight: 700, color: theme.accentText }}
            >
              PHYSICS TUNING
            </span>
            <button
              onClick={() => setTune({ ...DEFAULTS })}
              style={{ ...btn, fontSize: 7, padding: "1px 6px" }}
            >
              Reset
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 12px",
            }}
          >
            <Slider
              label="Spin Curl"
              value={tune.curlCoeff}
              min={0}
              max={200}
              step={1}
              theme={theme}
              onChange={(v) => setT("curlCoeff", v)}
            />
            <Slider
              label="Grad Drift"
              value={tune.gradientCoeff}
              min={0}
              max={50}
              step={0.5}
              theme={theme}
              onChange={(v) => setT("gradientCoeff", v)}
            />
            <Slider
              label="Slope Grav"
              value={tune.slopeGravity}
              min={0}
              max={80}
              step={1}
              theme={theme}
              onChange={(v) => setT("slopeGravity", v)}
            />
            <Slider
              label="Friction Dec"
              value={tune.frictionDecel}
              min={1}
              max={30}
              step={0.5}
              theme={theme}
              onChange={(v) => setT("frictionDecel", v)}
            />
            <Slider
              label="Base Fric"
              value={tune.baseFriction}
              min={0.01}
              max={0.2}
              step={0.005}
              theme={theme}
              onChange={(v) => setT("baseFriction", v)}
            />
            <Slider
              label="Pebble Bonus"
              value={tune.pebbleFrictionBonus}
              min={0}
              max={0.2}
              step={0.005}
              theme={theme}
              onChange={(v) => setT("pebbleFrictionBonus", v)}
            />
            <Slider
              label="Speed Scale"
              value={tune.speedScale}
              min={20}
              max={120}
              step={1}
              theme={theme}
              onChange={(v) => setT("speedScale", v)}
            />
            <Slider
              label="Wear Rate"
              value={tune.wearRate}
              min={0}
              max={0.01}
              step={0.0005}
              theme={theme}
              onChange={(v) => setT("wearRate", v)}
            />
            <Slider
              label="Sweep Boost"
              value={tune.sweepBoost}
              min={0}
              max={1}
              step={0.05}
              theme={theme}
              onChange={(v) => setT("sweepBoost", v)}
            />
          </div>
        </div>
      )}

      {phase !== "title" && (
        <div
          style={{
            display: "flex",
            gap: 2,
            marginBottom: 4,
            background: theme.scoreBg,
            borderRadius: theme.btnRadius + 2,
            border: theme.scoreBorder,
            overflow: "hidden",
            fontSize: 10,
            width: "100%",
            maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
          }}
        >
          {[0, 1].map((t) => (
            <div
              key={t}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                padding: "3px 8px",
                background:
                  currentTeam === t &&
                  phase !== "scoring" &&
                  phase !== "gameover"
                    ? `${tCol(t)}15`
                    : "transparent",
                borderLeft: t === 1 ? theme.scoreBorder : "none",
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: tCol(t),
                  marginRight: 5,
                }}
              />
              <span style={{ fontWeight: 700, marginRight: 6, fontSize: 9 }}>
                {tn(t)}
              </span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {scores[t].map((s, i) => (
                  <span
                    key={i}
                    style={{
                      background: theme.btnBg,
                      padding: "0 3px",
                      borderRadius: 2,
                      fontWeight: s > 0 ? 700 : 400,
                      color: s > 0 ? tCol(t) : theme.dimText,
                      fontSize: 8,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <span
                style={{
                  marginLeft: "auto",
                  fontWeight: 800,
                  fontSize: 13,
                  color: tCol(t),
                }}
              >
                {totalScore(t)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          position: "relative",
          borderRadius: 8,
          overflow: "hidden",
          flexWrap: isNarrowLayout ? "wrap" : "nowrap",
          minHeight: isNarrowLayout ? 600 : 400,
        }}
      >
        {/* Top-down minimap canvas */}
        <div
          style={{
            position: "relative",
            borderRadius: theme.btnRadius + 5,
            overflow: "hidden",
            flex: isNarrowLayout ? "0 0 auto" : "0 0 auto",
            display: "flex",
            alignItems: "center",
          }}
        >
          <canvas
            ref={canvasRef}
            width={dims.w}
            height={dims.h}
            onClick={handleAction}
            style={{
              borderRadius: theme.btnRadius + 5,
              cursor: "pointer",
              border: theme.canvasBorder,
              display: "block",
              width: isNarrowLayout ? "auto" : "100%",
            }}
          />
        </div>

        {/* Perspective canvas - 3D view from hack, grows to fill space */}
        <div
          style={{
            position: "relative",
            borderRadius: theme.btnRadius + 5,
            overflow: "hidden",
            flex: isNarrowLayout ? "1 1 auto" : "1 1 auto",
            minWidth: isNarrowLayout ? 0 : perspDims.w,
          }}
        >
          <canvas
            ref={perspCanvasRef}
            width={perspDims.w}
            height={perspDims.h}
            onClick={handleAction}
            style={{
              borderRadius: theme.btnRadius + 5,
              cursor: "pointer",
              border: theme.canvasBorder,
              display: "block",
              width: "100%",
            }}
          />
        </div>

        {phase === "title" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: theme.titleBg,
              borderRadius: theme.btnRadius + 5,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div
              style={{
                fontSize: theme.titleFont,
                fontWeight: theme.titleWeight,
                letterSpacing: "-2px",
                background:
                  theme.titleGradient !== "none"
                    ? theme.titleGradient
                    : undefined,
                WebkitBackgroundClip:
                  theme.titleGradient !== "none" ? "text" : undefined,
                WebkitTextFillColor:
                  theme.titleGradient !== "none" ? "transparent" : undefined,
                color: theme.titleTextColor || undefined,
                marginBottom: 4,
              }}
            >
              {themeName === "wincurl" ? "WinCurl 2.0" : "CURLING"}
            </div>
            <div
              style={{ fontSize: 8, color: theme.dimText, marginBottom: 12 }}
            >
              Ice:{" "}
              <b style={{ color: theme.accentText }}>
                {ICE_PROFILES[iceProfile].name}
              </b>{" "}
              — {ICE_PROFILES[iceProfile].desc}
            </div>
            <div
              style={{
                padding: "8px 28px",
                background: theme.startBtnBg,
                border:
                  theme.startBtnBorder || `1px solid rgba(255,255,255,0.12)`,
                borderRadius: theme.btnRadius,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "1px",
                color: theme.titleTextColor || theme.textColor,
              }}
            >
              TAP TO START
            </div>
          </div>
        )}

        {phase === "scoring" && endScoreDisplay && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: theme.overlayBg,
              borderRadius: theme.btnRadius + 5,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div
              style={{ fontSize: 12, color: theme.dimText, marginBottom: 4 }}
            >
              End {currentEnd}
            </div>
            {endScoreDisplay.scoringTeam >= 0 ? (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: tCol(endScoreDisplay.scoringTeam),
                }}
              >
                {tn(endScoreDisplay.scoringTeam)} scores {endScoreDisplay.pts}!
              </div>
            ) : (
              <div
                style={{ fontSize: 16, fontWeight: 700, color: theme.dimText }}
              >
                Blank end
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 9, color: theme.dimText }}>
              Tap to continue
            </div>
          </div>
        )}

        {phase === "gameover" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: theme.overlayBg,
              borderRadius: theme.btnRadius + 5,
              cursor: "pointer",
            }}
            onClick={handleAction}
          >
            <div
              style={{ fontSize: 12, color: theme.dimText, marginBottom: 4 }}
            >
              Final Score
            </div>
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              {[0, 1].map((t) => (
                <div key={t} style={{ textAlign: "center" }}>
                  <div
                    style={{ fontSize: 28, fontWeight: 900, color: tCol(t) }}
                  >
                    {totalScore(t)}
                  </div>
                  <div style={{ fontSize: 10, color: theme.dimText }}>
                    {tn(t)}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color:
                  totalScore(0) > totalScore(1)
                    ? tCol(0)
                    : totalScore(1) > totalScore(0)
                      ? tCol(1)
                      : theme.dimText,
              }}
            >
              {totalScore(0) > totalScore(1)
                ? "Yellow Wins!"
                : totalScore(1) > totalScore(0)
                  ? "Red Wins!"
                  : "Draw!"}
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: theme.dimText }}>
              Tap to play again
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 5,
          width: "100%",
          maxWidth: isNarrowLayout ? dims.w : dims.w + perspDims.w + 8,
          minHeight: 34,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: theme.btnRadius,
            background: `${tCol(currentTeam)}18`,
            border: `1px solid ${tCol(currentTeam)}30`,
            color: tCol(currentTeam),
            minWidth: 52,
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {phase === "aiming"
            ? "Aim"
            : phase === "power"
              ? "Power"
              : phase === "running"
                ? "Sweep"
                : phase}
        </div>
        {phase === "power" && (
          <div
            style={{
              flex: 1,
              minWidth: 80,
              height: 12,
              background: theme.btnBg,
              borderRadius: theme.btnRadius,
              overflow: "hidden",
              border: theme.btnBorder,
              position: "relative",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${power}%`,
                background:
                  power < 40
                    ? "rgba(100,200,100,0.4)"
                    : power < 75
                      ? "rgba(240,200,48,0.4)"
                      : "rgba(208,48,48,0.4)",
                borderRadius: theme.btnRadius,
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                fontSize: 7,
                fontWeight: 700,
                color: theme.textColor,
              }}
            >
              {Math.round(power)}%
            </span>
          </div>
        )}
        {(phase === "aiming" || phase === "power") && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurlDir((d) => d * -1);
            }}
            style={{ ...btn, color: theme.textColor }}
          >
            {curlDir > 0 ? "↻ CW (right)" : "↺ CCW (left)"}
          </button>
        )}
        {phase === "running" && (
          <div
            style={{
              fontSize: 9,
              color: sweepingRef.current ? theme.accentText : theme.dimText,
              fontWeight: sweepingRef.current ? 700 : 400,
            }}
          >
            {sweepingRef.current
              ? (theme.sweepEmoji ? "🧹 " : "") + "SWEEPING"
              : "Tap to sweep"}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 7,
          color: theme.dimText,
          marginTop: 3,
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        {phase === "aiming" &&
          "Tap to lock aim → set power → tap to sweep during delivery"}
        {phase === "power" && "Tap to release"}
        {phase === "running" && "Tap to toggle sweeping"}
      </div>
    </div>
  );
}
