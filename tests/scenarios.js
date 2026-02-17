// scenarios.js — Test cases for curling physics snapshots
//
// Each scenario defines delivery inputs and soft expectations.
// Expectations are ranges, not exact values — they catch regressions
// (sign flips, broken deceleration, etc.) without being brittle.

module.exports = [
  // ============================================================
  // CURL DIRECTION — the most important thing to get right
  // ============================================================
  {
    name: "CW from center — should curl right (+y)",
    aim: 0, power: 42, spin: 1, profile: "championship",
    expect: { curlSign: "+", curlMin: 3, inHouse: true },
  },
  {
    name: "CCW from center — should curl left (-y)",
    aim: 0, power: 42, spin: -1, profile: "championship",
    expect: { curlSign: "-", curlMin: 3, inHouse: true },
  },
  {
    name: "CW from right side — should curl further right",
    aim: 40, power: 42, spin: 1, profile: "championship",
    expect: { curlSign: "+", curlMin: 3 },
  },
  {
    name: "CCW from right side — should curl left toward center",
    aim: 40, power: 42, spin: -1, profile: "championship",
    expect: { curlSign: "-", curlMin: 3, inHouse: true },
  },

  // ============================================================
  // CURL SYMMETRY — CW and CCW should produce equal magnitude
  // ============================================================
  {
    name: "Symmetry: CW center draw",
    aim: 0, power: 42, spin: 1, profile: "championship",
    expect: { inHouse: true },
    _symmetryPair: "sym-center",
  },
  {
    name: "Symmetry: CCW center draw",
    aim: 0, power: 42, spin: -1, profile: "championship",
    expect: { inHouse: true },
    _symmetryPair: "sym-center",
  },

  // ============================================================
  // POWER RANGE — verify useful range is wide
  // ============================================================
  {
    name: "10% power — should be short of hog line",
    aim: 0, power: 10, spin: 1, profile: "championship",
    expect: { removed: true, removeReason: "hog_line" },
  },
  {
    name: "35% power — should reach house",
    aim: 0, power: 35, spin: 1, profile: "championship",
    expect: { inHouse: true },
  },
  {
    name: "50% power — should reach house or pass through",
    aim: 0, power: 50, spin: 1, profile: "championship",
    expect: { finalXMax: -500 }, // at least past tee
  },
  {
    name: "95% power — peel weight, through back line",
    aim: 0, power: 95, spin: 1, profile: "championship",
    expect: { removed: true, removeReason: "back_line" },
  },

  // ============================================================
  // CURL GRADUALITY — curl should accumulate evenly, not spike at end
  // ============================================================
  {
    name: "Curl distribution — check halfway point",
    aim: 0, power: 42, spin: 1, profile: "championship",
    // Checked programmatically in run-snapshots.js
    expect: { inHouse: true, _checkCurlDistribution: true },
  },

  // ============================================================
  // SIDEBOARDS — edge shots shouldn't get removed prematurely
  // ============================================================
  {
    name: "CCW from far right — should curl inward, not hit sideboard",
    aim: 60, power: 42, spin: -1, profile: "championship",
    expect: { removed: false },
  },
  {
    name: "CW from far right — curls further right, likely hits sideboard",
    aim: 65, power: 42, spin: 1, profile: "championship",
    expect: { removed: true, removeReason: "sideboard" },
  },

  // ============================================================
  // ICE PROFILES — verify profiles produce different behavior
  // ============================================================
  {
    name: "Club ice — dish should pull toward center",
    aim: 40, power: 42, spin: 1, profile: "club",
    // CW curl goes +y (away from center), but dish should reduce net curl
    expect: { removed: false },
    _compareProfile: "championship",
  },
  {
    name: "Swingy ice — should produce more curl than championship",
    aim: 0, power: 42, spin: 1, profile: "swingy",
    expect: { curlMin: 5 },
  },

  // ============================================================
  // SWEEP — should extend travel distance
  // ============================================================
  {
    name: "Sweep vs no-sweep — 35% power without sweep",
    aim: 0, power: 30, spin: 1, profile: "championship",
    sweep: false,
    expect: {},
    _sweepPair: "sweep-test",
  },
  {
    name: "Sweep vs no-sweep — 35% power with sweep",
    aim: 0, power: 30, spin: 1, profile: "championship",
    sweep: true,
    expect: {},
    _sweepPair: "sweep-test",
  },

  // ============================================================
  // NO CURL — spin=0 equivalent (use very low curlCoeff)
  // ============================================================
  {
    name: "Zero curl coefficient — rock should go straight",
    aim: 20, power: 42, spin: 1, profile: "championship",
    tune: { curlCoeff: 0 },
    expect: { curlMax: 1 }, // negligible lateral movement
  },
];
