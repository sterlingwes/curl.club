#!/usr/bin/env node
// run-snapshots.js — Run all scenarios, generate SVGs + JSON, validate expectations

const fs = require("fs");
const path = require("path");
const { simulate, WORLD, ROCK_RADIUS } = require("./physics-sim");
const scenarios = require("./scenarios");

const SNAP_DIR = path.join(__dirname, "snapshots");
if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

// ============================================================
// SVG GENERATOR
// ============================================================
function generateSVG(trace, summary) {
  // SVG coordinate system: x-right, y-down
  // World: x goes negative toward house, y is cross-sheet
  // Map: world-x → SVG-x (negated so house is on the right), world-y → SVG-y

  const margin = 40;
  const worldW = WORLD.sheetStart - WORLD.sheetEnd; // 730
  const worldH = WORLD.sheetHalfWidth * 2;           // 164
  const scale = 0.9;
  const svgW = Math.round(worldW * scale + margin * 2);
  const svgH = Math.round(worldH * scale + margin * 2);

  // World → SVG coords
  const tx = (wx) => margin + (-wx - WORLD.sheetEnd) * scale;  // negate: house on right
  const ty = (wy) => margin + (WORLD.sheetHalfWidth - wy) * scale; // negate: +y = up

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="background:#0a0f1a">\n`;
  svg += `<defs><style>text{font:10px monospace;fill:#8ab4f8;}</style></defs>\n`;

  // Sheet background
  const sheetL = tx(WORLD.sheetStart), sheetR = tx(WORLD.sheetEnd);
  const sheetT = ty(WORLD.sheetHalfWidth), sheetB = ty(-WORLD.sheetHalfWidth);
  svg += `<rect x="${sheetL}" y="${sheetT}" width="${sheetR-sheetL}" height="${sheetB-sheetT}" fill="#dce9f2" rx="3"/>\n`;

  // House rings
  const hcx = tx(WORLD.houseCenter.x), hcy = ty(WORLD.houseCenter.y);
  const rings = [
    [72, "rgba(30,90,180,0.2)"],
    [48, "rgba(225,232,242,0.4)"],
    [24, "rgba(200,40,40,0.2)"],
    [6,  "rgba(225,232,242,0.5)"],
  ];
  for (const [r, fill] of rings) {
    svg += `<circle cx="${hcx}" cy="${hcy}" r="${r*scale}" fill="${fill}" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>\n`;
  }

  // Lines
  const lineY1 = ty(WORLD.sheetHalfWidth), lineY2 = ty(-WORLD.sheetHalfWidth);
  svg += `<line x1="${tx(WORLD.hogLine)}" y1="${lineY1}" x2="${tx(WORLD.hogLine)}" y2="${lineY2}" stroke="#cc2233" stroke-width="2" opacity="0.5"/>\n`;
  svg += `<line x1="${tx(WORLD.tLine)}" y1="${lineY1}" x2="${tx(WORLD.tLine)}" y2="${lineY2}" stroke="#334466" stroke-width="1" opacity="0.4"/>\n`;
  svg += `<line x1="${tx(WORLD.backLine)}" y1="${lineY1}" x2="${tx(WORLD.backLine)}" y2="${lineY2}" stroke="#445577" stroke-width="1.5" opacity="0.4"/>\n`;
  // Center line
  svg += `<line x1="${sheetL}" y1="${ty(0)}" x2="${sheetR}" y2="${ty(0)}" stroke="#334466" stroke-width="0.5" opacity="0.3"/>\n`;

  // Hack
  svg += `<rect x="${tx(WORLD.hackPos)-1}" y="${ty(3)}" width="2" height="${6*scale}" fill="#333"/>\n`;

  // Rock path — color coded by velocity
  if (trace.length > 1) {
    const maxV = trace[0].velocity || 1;
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1], b = trace[i];
      const vNorm = a.velocity / maxV;
      // High speed = blue, low speed = red
      const r = Math.round(255 * (1 - vNorm));
      const g = Math.round(100 * vNorm);
      const bl = Math.round(255 * vNorm);
      svg += `<line x1="${tx(a.x)}" y1="${ty(a.y)}" x2="${tx(b.x)}" y2="${ty(b.y)}" stroke="rgb(${r},${g},${bl})" stroke-width="2" stroke-linecap="round"/>\n`;
    }

    // Start and end markers
    const first = trace[0], last = trace[trace.length - 1];
    svg += `<circle cx="${tx(first.x)}" cy="${ty(first.y)}" r="4" fill="none" stroke="#0f0" stroke-width="1.5"/>\n`;
    svg += `<circle cx="${tx(last.x)}" cy="${ty(last.y)}" r="${ROCK_RADIUS*scale}" fill="rgba(240,200,48,0.6)" stroke="#b8941e" stroke-width="1"/>\n`;

    // Force arrows every ~50 ticks
    const arrowInterval = Math.max(1, Math.floor(trace.length / 12));
    for (let i = 0; i < trace.length; i += arrowInterval) {
      const p = trace[i];
      if (p.velocity < 0.05) continue;
      const arrowScale = 3;
      // spinCurl acts on y; show as arrow from path
      const curlLen = p.spinCurl * arrowScale;
      const gradLen = p.gradDrift * arrowScale;
      const slopeLen = p.slopeY * arrowScale;
      const px = tx(p.x), py = ty(p.y);
      // Curl arrow (cyan) — points in -ty direction for positive curl
      if (Math.abs(curlLen) > 0.3) {
        svg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py - curlLen}" stroke="#00ffff" stroke-width="1" opacity="0.7"/>\n`;
      }
      // Gradient arrow (magenta)
      if (Math.abs(gradLen) > 0.3) {
        svg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py - gradLen}" stroke="#ff00ff" stroke-width="1" opacity="0.7"/>\n`;
      }
      // Slope arrow (yellow)
      if (Math.abs(slopeLen) > 0.3) {
        svg += `<line x1="${px}" y1="${py}" x2="${px}" y2="${py - slopeLen}" stroke="#ffdd00" stroke-width="1" opacity="0.7"/>\n`;
      }
    }
  }

  // Labels
  svg += `<text x="${margin}" y="14" style="font:bold 11px monospace;fill:#c8d8e8">${escXml(summary.name)}</text>\n`;
  const info = [
    `aim:${summary.aim} pow:${summary.power}% spin:${summary.spin > 0 ? "CW" : "CCW"} ice:${summary.profile}`,
    `curl:${summary.totalCurl.toFixed(1)} dist→btn:${summary.distToButton} ${summary.inHouse ? "IN HOUSE" : summary.removed ? summary.removeReason.toUpperCase() : "stopped"}`,
    `ticks:${summary.ticks} time:${summary.duration}s`,
  ];
  info.forEach((line, i) => {
    svg += `<text x="${margin}" y="${svgH - 28 + i * 12}" style="font:9px monospace;fill:#6a8aaa">${escXml(line)}</text>\n`;
  });

  // Line labels
  svg += `<text x="${tx(WORLD.hogLine)+3}" y="${lineY2 - 3}" style="font:8px monospace;fill:#cc2233" opacity="0.6">HOG</text>\n`;
  svg += `<text x="${tx(WORLD.tLine)+3}" y="${lineY2 - 3}" style="font:8px monospace;fill:#667" opacity="0.6">TEE</text>\n`;
  svg += `<text x="${tx(WORLD.backLine)+3}" y="${lineY2 - 3}" style="font:8px monospace;fill:#667" opacity="0.6">BACK</text>\n`;

  // Velocity color legend
  svg += `<text x="${svgW - 120}" y="14" style="font:8px monospace;fill:#4466ff">■ fast</text>\n`;
  svg += `<text x="${svgW - 70}" y="14" style="font:8px monospace;fill:#ff4444">■ slow</text>\n`;

  // Force arrow legend
  svg += `<text x="${svgW - 120}" y="26" style="font:8px monospace;fill:#00ffff">↕ spin</text>\n`;
  svg += `<text x="${svgW - 80}" y="26" style="font:8px monospace;fill:#ff00ff">↕ grad</text>\n`;
  svg += `<text x="${svgW - 40}" y="26" style="font:8px monospace;fill:#ffdd00">↕ slope</text>\n`;

  svg += `</svg>`;
  return svg;
}

function escXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ============================================================
// EXPECTATION CHECKER
// ============================================================
function checkExpectations(summary, trace, expect) {
  const failures = [];
  if (!expect) return failures;

  if (expect.curlSign === "+" && summary.totalCurl <= 0)
    failures.push(`expected positive curl, got ${summary.totalCurl}`);
  if (expect.curlSign === "-" && summary.totalCurl >= 0)
    failures.push(`expected negative curl, got ${summary.totalCurl}`);
  if (expect.curlMin !== undefined && Math.abs(summary.totalCurl) < expect.curlMin)
    failures.push(`curl magnitude ${Math.abs(summary.totalCurl).toFixed(2)} < min ${expect.curlMin}`);
  if (expect.curlMax !== undefined && Math.abs(summary.totalCurl) > expect.curlMax)
    failures.push(`curl magnitude ${Math.abs(summary.totalCurl).toFixed(2)} > max ${expect.curlMax}`);
  if (expect.inHouse === true && !summary.inHouse)
    failures.push(`expected in house, but rock is at dist ${summary.distToButton}`);
  if (expect.inHouse === false && summary.inHouse)
    failures.push(`expected NOT in house, but rock is in house`);
  if (expect.removed === true && !summary.removed)
    failures.push(`expected removed, but rock is still in play`);
  if (expect.removed === false && summary.removed)
    failures.push(`expected NOT removed, but rock was removed (${summary.removeReason})`);
  if (expect.removeReason && summary.removeReason !== expect.removeReason)
    failures.push(`expected removeReason="${expect.removeReason}", got "${summary.removeReason}"`);
  if (expect.finalXMax !== undefined && summary.finalX > expect.finalXMax)
    failures.push(`finalX ${summary.finalX.toFixed(1)} > max ${expect.finalXMax}`);

  // Curl distribution check
  if (expect._checkCurlDistribution && trace.length > 10) {
    const halfIdx = Math.floor(trace.length / 2);
    const curlAtHalf = trace[halfIdx].y - trace[0].y;
    const curlTotal = trace[trace.length - 1].y - trace[0].y;
    const halfPct = Math.abs(curlTotal) > 0.1 ? Math.abs(curlAtHalf / curlTotal) : 0;
    if (halfPct < 0.25)
      failures.push(`curl distribution: only ${(halfPct*100).toFixed(0)}% at halfway (want ≥25%)`);
    if (halfPct > 0.75)
      failures.push(`curl distribution: ${(halfPct*100).toFixed(0)}% at halfway (want ≤75%, too front-loaded)`);
  }

  return failures;
}

// ============================================================
// MAIN
// ============================================================
function run() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║          CURLING PHYSICS SNAPSHOT TESTS             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const results = [];
  const pairData = {}; // for symmetry / sweep pair comparisons
  let passed = 0, failed = 0, total = 0;

  for (const scenario of scenarios) {
    total++;
    const { trace, summary } = simulate({
      name: scenario.name,
      aim: scenario.aim,
      power: scenario.power,
      spin: scenario.spin,
      profile: scenario.profile,
      paperTurns: scenario.paperTurns || 1.0,
      sweep: scenario.sweep || false,
      tune: scenario.tune || {},
    });

    // Check expectations
    const failures = checkExpectations(summary, trace, scenario.expect);

    // Collect pair data
    if (scenario._symmetryPair) {
      if (!pairData[scenario._symmetryPair]) pairData[scenario._symmetryPair] = [];
      pairData[scenario._symmetryPair].push(summary);
    }
    if (scenario._sweepPair) {
      if (!pairData[scenario._sweepPair]) pairData[scenario._sweepPair] = [];
      pairData[scenario._sweepPair].push(summary);
    }
    // Profile comparison: re-run same scenario on reference profile
    if (scenario._compareProfile) {
      const refResult = simulate({
        name: scenario.name + " (ref: " + scenario._compareProfile + ")",
        aim: scenario.aim, power: scenario.power, spin: scenario.spin,
        profile: scenario._compareProfile,
        paperTurns: scenario.paperTurns || 1.0, sweep: scenario.sweep || false,
        tune: scenario.tune || {},
      });
      if (!pairData["profile-" + scenario.name]) pairData["profile-" + scenario.name] = [];
      pairData["profile-" + scenario.name].push(summary, refResult.summary);
    }

    const ok = failures.length === 0;
    if (ok) passed++; else failed++;

    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${summary.name}`);
    console.log(`   curl: ${summary.totalCurl.toFixed(2)}  final: (${summary.finalX?.toFixed(0)}, ${summary.finalY?.toFixed(1)})  dist→btn: ${summary.distToButton}  ${summary.inHouse ? "🏠" : summary.removed ? "🚫 " + summary.removeReason : "⏹"}`);
    if (failures.length > 0) {
      for (const f of failures) console.log(`   ⚠️  ${f}`);
    }

    // Write outputs
    const slug = summary.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+$/, "").toLowerCase();
    fs.writeFileSync(path.join(SNAP_DIR, `${slug}.json`), JSON.stringify({ summary, trace }, null, 2));
    fs.writeFileSync(path.join(SNAP_DIR, `${slug}.svg`), generateSVG(trace, summary));

    results.push({ scenario, summary, failures });
  }

  // Symmetry pair checks
  console.log("\n── Pair Comparisons ──");
  for (const [key, summaries] of Object.entries(pairData)) {
    if (summaries.length === 2) {
      const [a, b] = summaries;
      if (key.startsWith("sym")) {
        const magA = Math.abs(a.totalCurl), magB = Math.abs(b.totalCurl);
        const diff = Math.abs(magA - magB);
        const pct = magA > 0 ? (diff / magA * 100).toFixed(1) : "∞";
        const ok = diff < 2 || parseFloat(pct) < 15;
        console.log(`${ok ? "✅" : "❌"} Symmetry [${key}]: |${magA.toFixed(2)}| vs |${magB.toFixed(2)}| — diff: ${diff.toFixed(2)} (${pct}%)`);
        if (!ok) failed++;
      }
      if (key.startsWith("sweep")) {
        const swept = summaries.find(s => s.sweep), unswept = summaries.find(s => !s.sweep);
        if (swept && unswept) {
          const further = swept.finalX < unswept.finalX; // more negative = further toward house
          console.log(`${further ? "✅" : "❌"} Sweep [${key}]: swept goes ${Math.abs(swept.finalX - unswept.finalX).toFixed(0)} units further (${swept.finalX?.toFixed(0)} vs ${unswept.finalX?.toFixed(0)})`);
          if (!further) failed++;
        }
      }
      if (key.startsWith("profile-") && summaries.length === 2) {
        const [test, ref] = summaries;
        const testCurl = Math.abs(test.totalCurl), refCurl = Math.abs(ref.totalCurl);
        const diff = testCurl - refCurl;
        console.log(`📊 Profile [${key.replace("profile-","")}]: curl ${testCurl.toFixed(1)} (${test.profile}) vs ${refCurl.toFixed(1)} (${ref.profile}) — diff: ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`);
      }
    }
  }

  // Summary
  console.log(`\n${"═".repeat(56)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${total} total`);
  console.log(`  Snapshots written to: ${SNAP_DIR}/`);
  console.log(`${"═".repeat(56)}`);

  // Also generate an index SVG with all paths overlaid
  generateIndexSVG(results);

  return failed === 0 ? 0 : 1;
}

// ============================================================
// INDEX SVG — all paths on one sheet
// ============================================================
function generateIndexSVG(results) {
  const margin = 40;
  const worldW = WORLD.sheetStart - WORLD.sheetEnd;
  const worldH = WORLD.sheetHalfWidth * 2;
  const scale = 1.1;
  const svgW = Math.round(worldW * scale + margin * 2);
  const svgH = Math.round(worldH * scale + margin * 2 + results.length * 13 + 20);

  const tx = (wx) => margin + (-wx - WORLD.sheetEnd) * scale;
  const ty = (wy) => margin + (WORLD.sheetHalfWidth - wy) * scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="background:#0a0f1a">\n`;
  svg += `<defs><style>text{font:9px monospace;fill:#8ab4f8;}</style></defs>\n`;

  // Sheet
  const sL = tx(WORLD.sheetStart), sR = tx(WORLD.sheetEnd);
  const sT = ty(WORLD.sheetHalfWidth), sB = ty(-WORLD.sheetHalfWidth);
  svg += `<rect x="${sL}" y="${sT}" width="${sR-sL}" height="${sB-sT}" fill="#dce9f2" rx="3"/>\n`;

  // House rings
  const hcx = tx(WORLD.houseCenter.x), hcy = ty(WORLD.houseCenter.y);
  for (const [r, fill] of [[72,"rgba(30,90,180,0.15)"],[48,"rgba(225,232,242,0.3)"],[24,"rgba(200,40,40,0.15)"],[6,"rgba(225,232,242,0.4)"]]) {
    svg += `<circle cx="${hcx}" cy="${hcy}" r="${r*scale}" fill="${fill}" stroke="rgba(0,0,0,0.08)" stroke-width="0.5"/>\n`;
  }

  // Lines
  const lY1 = ty(WORLD.sheetHalfWidth), lY2 = ty(-WORLD.sheetHalfWidth);
  svg += `<line x1="${tx(WORLD.hogLine)}" y1="${lY1}" x2="${tx(WORLD.hogLine)}" y2="${lY2}" stroke="#cc2233" stroke-width="1.5" opacity="0.3"/>\n`;
  svg += `<line x1="${tx(WORLD.tLine)}" y1="${lY1}" x2="${tx(WORLD.tLine)}" y2="${lY2}" stroke="#334466" stroke-width="1" opacity="0.3"/>\n`;
  svg += `<line x1="${tx(WORLD.backLine)}" y1="${lY1}" x2="${tx(WORLD.backLine)}" y2="${lY2}" stroke="#445577" stroke-width="1" opacity="0.3"/>\n`;
  svg += `<line x1="${sL}" y1="${ty(0)}" x2="${sR}" y2="${ty(0)}" stroke="#334466" stroke-width="0.5" opacity="0.2"/>\n`;

  // Color palette for paths
  const colors = ["#ff6b6b","#4ecdc4","#45b7d1","#f7dc6f","#bb8fce","#82e0aa","#f0b27a","#85c1e9","#f1948a","#aab7b8","#d4ac0d","#1abc9c","#e74c3c","#3498db","#e67e22","#9b59b6"];

  // Draw all paths
  results.forEach(({ summary, scenario }, idx) => {
    const { trace } = simulate({
      name: scenario.name, aim: scenario.aim, power: scenario.power,
      spin: scenario.spin, profile: scenario.profile,
      paperTurns: scenario.paperTurns || 1.0, sweep: scenario.sweep || false, tune: scenario.tune || {},
    });
    const color = colors[idx % colors.length];
    if (trace.length > 1) {
      let pts = trace.filter((_, i) => i % 3 === 0 || i === trace.length - 1).map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`);
      svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.7"/>\n`;
      // End marker
      const last = trace[trace.length - 1];
      svg += `<circle cx="${tx(last.x)}" cy="${ty(last.y)}" r="3" fill="${color}" opacity="0.8"/>\n`;
    }
  });

  // Legend below sheet
  const legendY = sB + 20;
  svg += `<text x="${margin}" y="${legendY}" style="font:bold 11px monospace;fill:#c8d8e8">ALL SCENARIOS</text>\n`;
  results.forEach(({ summary }, idx) => {
    const color = colors[idx % colors.length];
    const icon = summary.removed ? "✗" : summary.inHouse ? "●" : "○";
    const y = legendY + 14 + idx * 13;
    svg += `<rect x="${margin}" y="${y - 8}" width="8" height="8" fill="${color}" rx="1"/>\n`;
    svg += `<text x="${margin + 12}" y="${y}" style="font:9px monospace;fill:#8ab4f8">${icon} ${escXml(summary.name)} — curl:${summary.totalCurl.toFixed(1)}</text>\n`;
  });

  svg += `</svg>`;
  fs.writeFileSync(path.join(SNAP_DIR, "_index.svg"), svg);
  console.log(`\n  Index SVG: ${path.join(SNAP_DIR, "_index.svg")}`);
}

process.exit(run());
