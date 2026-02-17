#!/usr/bin/env node
// run-snapshots.js — Run all scenarios, generate SVGs + JSON, validate expectations

const fs = require("fs");
const path = require("path");
const { simulate, WORLD, ROCK_RADIUS } = require("./physics-sim");
const scenarios = require("./scenarios");

const SNAP_DIR = path.join(__dirname, "snapshots");
if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

// ============================================================
// SVG COORDINATE SYSTEM
// ============================================================
// SVG x: 0 at hack end (sheetStart), increases toward house (sheetEnd)
// SVG y: 0 at top of sheet (+halfWidth), increases downward (-halfWidth)
// This puts hack on left, house on right, matching a natural left-to-right view.

const W_RANGE = WORLD.sheetStart - WORLD.sheetEnd; // 730
const H_RANGE = WORLD.sheetHalfWidth * 2; // 164

function sx(worldX) {
  return WORLD.sheetStart - worldX;
}
function sy(worldY) {
  return WORLD.sheetHalfWidth + worldY;
}
function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================
// SVG SHEET TEMPLATE
// ============================================================
function svgSheet(contentFn, opts = {}) {
  const pad = 25;
  const infoH = opts.infoHeight || 40;
  const vbX = -pad,
    vbY = -pad;
  const vbW = W_RANGE + pad * 2;
  const vbH = H_RANGE + pad * 2 + infoH;
  const displayW = opts.width || 800;
  const displayH = Math.round((displayW * vbH) / vbW);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${displayW}" height="${displayH}" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" style="background:#0a0f1a">\n`;
  svg += `<defs><style>text{font-family:monospace;fill:#8ab4f8;}</style></defs>\n`;

  // Sheet
  svg += `<rect x="0" y="0" width="${W_RANGE}" height="${H_RANGE}" fill="#dce9f2" rx="4"/>\n`;

  // House
  const hx = sx(WORLD.houseCenter.x),
    hy = sy(WORLD.houseCenter.y);
  for (const [r, f, s] of [
    [72, "rgba(30,90,180,0.2)", "rgba(30,90,180,0.3)"],
    [48, "rgba(225,232,242,0.4)", "rgba(180,190,200,0.2)"],
    [24, "rgba(200,40,40,0.2)", "rgba(200,40,40,0.3)"],
    [6, "rgba(225,232,242,0.5)", "rgba(180,190,200,0.3)"],
  ]) {
    svg += `<circle cx="${hx}" cy="${hy}" r="${r}" fill="${f}" stroke="${s}" stroke-width="0.8"/>\n`;
  }
  svg += `<circle cx="${hx}" cy="${hy}" r="1.5" fill="#1a1a2e"/>\n`;

  // Lines
  svg += `<line x1="${sx(WORLD.hogLine)}" y1="0" x2="${sx(WORLD.hogLine)}" y2="${H_RANGE}" stroke="#cc2233" stroke-width="2" opacity="0.5"/>\n`;
  svg += `<line x1="${sx(WORLD.tLine)}" y1="0" x2="${sx(WORLD.tLine)}" y2="${H_RANGE}" stroke="#556677" stroke-width="1" opacity="0.4"/>\n`;
  svg += `<line x1="${sx(WORLD.backLine)}" y1="0" x2="${sx(WORLD.backLine)}" y2="${H_RANGE}" stroke="#667788" stroke-width="1.5" opacity="0.4"/>\n`;
  svg += `<line x1="0" y1="${sy(0)}" x2="${W_RANGE}" y2="${sy(0)}" stroke="#556677" stroke-width="0.5" opacity="0.25"/>\n`;

  // Hack
  svg += `<rect x="${sx(WORLD.hackPos) - 1}" y="${sy(4)}" width="2" height="8" fill="#333" rx="0.5"/>\n`;

  // Line labels
  svg += `<text x="${sx(WORLD.hogLine) + 2}" y="-4" font-size="6" fill="#cc2233" opacity="0.7">HOG</text>\n`;
  svg += `<text x="${sx(WORLD.tLine) + 2}" y="-4" font-size="6" fill="#778899" opacity="0.7">TEE</text>\n`;
  svg += `<text x="${sx(WORLD.backLine) + 2}" y="-4" font-size="6" fill="#778899" opacity="0.7">BACK</text>\n`;

  // Y-axis labels (top = -y = CCW curl direction, bottom = +y = CW curl direction)
  svg += `<text x="-4" y="10" font-size="6" fill="#6a8aaa" text-anchor="end">−y</text>\n`;
  svg += `<text x="-4" y="${H_RANGE - 2}" font-size="6" fill="#6a8aaa" text-anchor="end">+y</text>\n`;
  svg += `<text x="-4" y="${sy(0) + 2}" font-size="5" fill="#556677" text-anchor="end">0</text>\n`;
  // CW/CCW direction hints
  svg += `<text x="-4" y="22" font-size="5" fill="#445566" text-anchor="end">CCW→</text>\n`;
  svg += `<text x="-4" y="${H_RANGE - 10}" font-size="5" fill="#445566" text-anchor="end">CW→</text>\n`;

  svg += contentFn();
  svg += `</svg>`;
  return svg;
}

// ============================================================
// SINGLE SCENARIO SVG
// ============================================================
function generateSVG(trace, summary) {
  return svgSheet(
    () => {
      let out = "";

      if (trace.length > 1) {
        const maxV = trace[0].velocity || 1;

        // Velocity-colored path
        for (let i = 1; i < trace.length; i++) {
          const a = trace[i - 1],
            b = trace[i];
          const vN = a.velocity / maxV;
          const r = Math.round(255 * (1 - vN));
          const g = Math.round(80 * vN);
          const bl = Math.round(255 * vN);
          out += `<line x1="${sx(a.x).toFixed(1)}" y1="${sy(a.y).toFixed(1)}" x2="${sx(b.x).toFixed(1)}" y2="${sy(b.y).toFixed(1)}" stroke="rgb(${r},${g},${bl})" stroke-width="3" stroke-linecap="round"/>\n`;
        }

        // Start (green ring)
        const first = trace[0];
        out += `<circle cx="${sx(first.x)}" cy="${sy(first.y)}" r="${ROCK_RADIUS}" fill="none" stroke="#00ff66" stroke-width="2"/>\n`;

        // End (gold rock)
        const last = trace[trace.length - 1];
        out += `<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="${ROCK_RADIUS}" fill="rgba(240,200,48,0.7)" stroke="#b8941e" stroke-width="1.5"/>\n`;

        // Force arrows (sampled)
        const nArrows = 10;
        const interval = Math.max(1, Math.floor(trace.length / nArrows));
        for (let i = 0; i < trace.length; i += interval) {
          const p = trace[i];
          if (p.velocity < 0.05) continue;
          const px = sx(p.x),
            py = sy(p.y);
          const sc = 5;

          // Curl → negative sy for positive world-y curl
          const curlDy = p.spinCurl * sc;
          if (Math.abs(curlDy) > 0.5)
            out += `<line x1="${px}" y1="${py}" x2="${px}" y2="${(py + curlDy).toFixed(1)}" stroke="#00ddff" stroke-width="1.5" opacity="0.8"/>\n`;

          const gradDy = p.gradDrift * sc;
          if (Math.abs(gradDy) > 0.5)
            out += `<line x1="${px}" y1="${py}" x2="${px}" y2="${(py + gradDy).toFixed(1)}" stroke="#ff44ff" stroke-width="1.5" opacity="0.8"/>\n`;

          const slopeDy = p.slopeY * sc;
          if (Math.abs(slopeDy) > 0.5)
            out += `<line x1="${px}" y1="${py}" x2="${px}" y2="${(py + slopeDy).toFixed(1)}" stroke="#ffdd00" stroke-width="1.5" opacity="0.8"/>\n`;
        }
      }

      // Title
      out += `<text x="4" y="-8" font-size="9" font-weight="bold" fill="#c8d8e8">${escXml(summary.name)}</text>\n`;

      // Legend (top right)
      out += `<text x="${W_RANGE - 110}" y="-10" font-size="6" fill="#4466ff">■ fast</text>`;
      out += `<text x="${W_RANGE - 78}" y="-10" font-size="6" fill="#ff4444">■ slow</text>`;
      out += `<text x="${W_RANGE - 110}" y="-3" font-size="5" fill="#00ddff">↕ spin</text>`;
      out += `<text x="${W_RANGE - 82}" y="-3" font-size="5" fill="#ff44ff">↕ grad</text>`;
      out += `<text x="${W_RANGE - 54}" y="-3" font-size="5" fill="#ffdd00">↕ slope</text>\n`;

      // Info below sheet
      const iy = H_RANGE + 14;
      const info = [
        `aim:${summary.aim}  pow:${summary.power}%  spin:${summary.spin > 0 ? "CW" : "CCW"}  ice:${summary.profile}`,
        `curl:${summary.totalCurl.toFixed(1)}  dist→btn:${summary.distToButton}  ${summary.inHouse ? "IN HOUSE" : summary.removed ? summary.removeReason.toUpperCase() : "stopped"}  ticks:${summary.ticks}  time:${summary.duration}s`,
      ];
      info.forEach((line, i) => {
        out += `<text x="4" y="${iy + i * 11}" font-size="7" fill="#6a8aaa">${escXml(line)}</text>\n`;
      });

      return out;
    },
    { infoHeight: 35 },
  );
}

// ============================================================
// INDEX SVG
// ============================================================
function generateIndexSVG(results) {
  const colors = [
    "#ff6b6b",
    "#4ecdc4",
    "#45b7d1",
    "#f7dc6f",
    "#bb8fce",
    "#82e0aa",
    "#f0b27a",
    "#85c1e9",
    "#f1948a",
    "#aab7b8",
    "#d4ac0d",
    "#1abc9c",
    "#e74c3c",
    "#3498db",
    "#e67e22",
    "#9b59b6",
  ];
  const legendH = results.length * 10 + 15;

  const svg = svgSheet(
    () => {
      let out = "";

      results.forEach(({ scenario }, idx) => {
        const { trace } = simulate({
          name: scenario.name,
          aim: scenario.aim,
          power: scenario.power,
          spin: scenario.spin,
          profile: scenario.profile,
          paperTurns: scenario.paperTurns || 1.0,
          sweep: scenario.sweep || false,
          tune: scenario.tune || {},
        });
        const color = colors[idx % colors.length];
        if (trace.length > 1) {
          const pts = trace
            .filter((_, i) => i % 2 === 0 || i === trace.length - 1)
            .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`);
          out += `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" opacity="0.75"/>\n`;
          const last = trace[trace.length - 1];
          out += `<circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="3.5" fill="${color}" opacity="0.85"/>\n`;
        }
      });

      out += `<text x="4" y="-8" font-size="9" font-weight="bold" fill="#c8d8e8">ALL SCENARIOS</text>\n`;

      const ly = H_RANGE + 12;
      results.forEach(({ summary }, idx) => {
        const color = colors[idx % colors.length];
        const icon = summary.removed ? "✗" : summary.inHouse ? "●" : "○";
        const y = ly + idx * 10;
        out += `<rect x="4" y="${y - 6}" width="6" height="6" fill="${color}" rx="1"/>\n`;
        out += `<text x="14" y="${y}" font-size="6" fill="#8ab4f8">${icon} ${escXml(summary.name)} — curl:${summary.totalCurl.toFixed(1)}</text>\n`;
      });

      return out;
    },
    { width: 900, infoHeight: legendH },
  );

  fs.writeFileSync(path.join(SNAP_DIR, "_index.svg"), svg);
  console.log(`\n  Index SVG: ${path.join(SNAP_DIR, "_index.svg")}`);
}

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
  if (
    expect.curlMin !== undefined &&
    Math.abs(summary.totalCurl) < expect.curlMin
  )
    failures.push(
      `curl magnitude ${Math.abs(summary.totalCurl).toFixed(2)} < min ${expect.curlMin}`,
    );
  if (
    expect.curlMax !== undefined &&
    Math.abs(summary.totalCurl) > expect.curlMax
  )
    failures.push(
      `curl magnitude ${Math.abs(summary.totalCurl).toFixed(2)} > max ${expect.curlMax}`,
    );
  if (expect.inHouse === true && !summary.inHouse)
    failures.push(
      `expected in house, but rock is at dist ${summary.distToButton}`,
    );
  if (expect.inHouse === false && summary.inHouse)
    failures.push(`expected NOT in house, but rock is in house`);
  if (expect.removed === true && !summary.removed)
    failures.push(`expected removed, but rock is still in play`);
  if (expect.removed === false && summary.removed)
    failures.push(
      `expected NOT removed, but rock was removed (${summary.removeReason})`,
    );
  if (expect.removeReason && summary.removeReason !== expect.removeReason)
    failures.push(
      `expected removeReason="${expect.removeReason}", got "${summary.removeReason}"`,
    );
  if (expect.finalXMax !== undefined && summary.finalX > expect.finalXMax)
    failures.push(
      `finalX ${summary.finalX.toFixed(1)} > max ${expect.finalXMax}`,
    );

  if (expect._checkCurlDistribution && trace.length > 10) {
    const halfIdx = Math.floor(trace.length / 2);
    const curlAtHalf = trace[halfIdx].y - trace[0].y;
    const curlTotal = trace[trace.length - 1].y - trace[0].y;
    const halfPct =
      Math.abs(curlTotal) > 0.1 ? Math.abs(curlAtHalf / curlTotal) : 0;
    if (halfPct < 0.25)
      failures.push(
        `curl distribution: only ${(halfPct * 100).toFixed(0)}% at halfway (want ≥25%)`,
      );
    if (halfPct > 0.75)
      failures.push(
        `curl distribution: ${(halfPct * 100).toFixed(0)}% at halfway (want ≤75%, too front-loaded)`,
      );
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
  const pairData = {};
  let passed = 0,
    failed = 0,
    total = 0;

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

    const failures = checkExpectations(summary, trace, scenario.expect);

    if (scenario._symmetryPair) {
      if (!pairData[scenario._symmetryPair])
        pairData[scenario._symmetryPair] = [];
      pairData[scenario._symmetryPair].push(summary);
    }
    if (scenario._sweepPair) {
      if (!pairData[scenario._sweepPair]) pairData[scenario._sweepPair] = [];
      pairData[scenario._sweepPair].push(summary);
    }
    if (scenario._compareProfile) {
      const refResult = simulate({
        name: scenario.name + " (ref: " + scenario._compareProfile + ")",
        aim: scenario.aim,
        power: scenario.power,
        spin: scenario.spin,
        profile: scenario._compareProfile,
        paperTurns: scenario.paperTurns || 1.0,
        sweep: scenario.sweep || false,
        tune: scenario.tune || {},
      });
      const k = "profile-" + scenario.name;
      if (!pairData[k]) pairData[k] = [];
      pairData[k].push(summary, refResult.summary);
    }

    const ok = failures.length === 0;
    if (ok) passed++;
    else failed++;

    console.log(`${ok ? "✅" : "❌"} ${summary.name}`);
    console.log(
      `   curl: ${summary.totalCurl.toFixed(2)}  final: (${summary.finalX?.toFixed(0)}, ${summary.finalY?.toFixed(1)})  dist→btn: ${summary.distToButton}  ${summary.inHouse ? "🏠" : summary.removed ? "🚫 " + summary.removeReason : "⏹"}`,
    );
    for (const f of failures) console.log(`   ⚠️  ${f}`);

    const slug = summary.name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/-+$/, "")
      .toLowerCase();
    fs.writeFileSync(
      path.join(SNAP_DIR, `${slug}.json`),
      JSON.stringify({ summary, trace }, null, 2),
    );
    fs.writeFileSync(
      path.join(SNAP_DIR, `${slug}.svg`),
      generateSVG(trace, summary),
    );

    results.push({ scenario, summary, failures });
  }

  console.log("\n── Pair Comparisons ──");
  for (const [key, summaries] of Object.entries(pairData)) {
    if (summaries.length !== 2) continue;
    const [a, b] = summaries;
    if (key.startsWith("sym")) {
      const magA = Math.abs(a.totalCurl),
        magB = Math.abs(b.totalCurl);
      const diff = Math.abs(magA - magB);
      const pct = magA > 0 ? ((diff / magA) * 100).toFixed(1) : "∞";
      const ok = diff < 2 || parseFloat(pct) < 15;
      console.log(
        `${ok ? "✅" : "❌"} Symmetry [${key}]: |${magA.toFixed(2)}| vs |${magB.toFixed(2)}| — diff: ${diff.toFixed(2)} (${pct}%)`,
      );
      if (!ok) failed++;
    }
    if (key.startsWith("sweep")) {
      const swept = summaries.find((s) => s.sweep),
        unswept = summaries.find((s) => !s.sweep);
      if (swept && unswept) {
        const further = swept.finalX < unswept.finalX;
        console.log(
          `${further ? "✅" : "❌"} Sweep [${key}]: swept goes ${Math.abs(swept.finalX - unswept.finalX).toFixed(0)} units further (${swept.finalX?.toFixed(0)} vs ${unswept.finalX?.toFixed(0)})`,
        );
        if (!further) failed++;
      }
    }
    if (key.startsWith("profile-")) {
      const [test, ref] = summaries;
      const tc = Math.abs(test.totalCurl),
        rc = Math.abs(ref.totalCurl);
      const diff = tc - rc;
      console.log(
        `📊 Profile [${key.replace("profile-", "")}]: curl ${tc.toFixed(1)} (${test.profile}) vs ${rc.toFixed(1)} (${ref.profile}) — diff: ${diff > 0 ? "+" : ""}${diff.toFixed(1)}`,
      );
    }
  }

  console.log(`\n${"═".repeat(56)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${total} total`);
  console.log(`  Snapshots written to: ${SNAP_DIR}/`);
  console.log(`${"═".repeat(56)}`);

  generateIndexSVG(results);

  return failed === 0 ? 0 : 1;
}

process.exit(run());
