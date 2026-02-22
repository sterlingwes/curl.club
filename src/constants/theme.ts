// Theme definitions

export interface Team {
  f: string;
  s: string;
  g: string;
  name: string;
}

export interface LineWidth {
  hog: number;
  tee: number;
  back: number;
}

export type HouseRing = [number, string, string, number];

export interface Theme {
  name: string;
  pageBg: string;
  font: string;
  textColor: string;
  dimText: string;
  accentText: string;
  canvasBg: string;
  sheetGradient: [string, string, string];
  sheetRadius: number;
  pebbleDots: string;
  hogLine: string;
  tLine: string;
  backLine: string;
  centerLine: string;
  lineWidth: LineWidth;
  houseRings: [HouseRing, HouseRing, HouseRing, HouseRing];
  buttonFill: string;
  houseCrosshairs: boolean;
  hackFill: string;
  teams: [Team, Team];
  rockStroke: string;
  rockHandleWidth: number;
  rockGradient: boolean;
  btnBg: string;
  btnBorder: string;
  btnRadius: number;
  btnColor: string;
  panelBg: string;
  panelBorder: string;
  scoreBg: string;
  scoreBorder: string;
  canvasBorder: string;
  titleBg: string;
  titleGradient: string;
  titleFont: number;
  titleWeight: number;
  titleTextColor?: string;
  startBtnBg: string;
  startBtnBorder?: string;
  overlayBg: string;
  sweepEmoji: boolean;
  sweepCorridor?: boolean;
}

export type ThemeName = "modern" | "wincurl";

export const THEMES: Record<ThemeName, Theme> = {
  modern: {
    name: "Modern",
    pageBg: "linear-gradient(145deg,#070b14 0%,#0d1525 40%,#111d33 100%)",
    font: "'JetBrains Mono','SF Mono','Fira Code',monospace",
    textColor: "#c8d8e8",
    dimText: "#4a6080",
    accentText: "#8ab4f8",
    canvasBg: "#0a0f1a",
    sheetGradient: ["#dce9f2", "#eaf4fa", "#d8e8f0"],
    sheetRadius: 5,
    pebbleDots: "rgba(180,200,215,0.06)",
    hogLine: "#cc223388",
    tLine: "#33446666",
    backLine: "#44557766",
    centerLine: "#33446625",
    lineWidth: { hog: 2.5, tee: 1.5, back: 2 },
    houseRings: [
      [72, "rgba(30,90,180,0.15)", "rgba(30,90,180,0.30)", 1.5],
      [48, "rgba(225,232,242,0.30)", "rgba(180,190,200,0.20)", 1.5],
      [24, "rgba(200,40,40,0.15)", "rgba(200,40,40,0.25)", 1.5],
      [6, "rgba(225,232,242,0.35)", "rgba(180,190,200,0.30)", 1.5],
    ],
    buttonFill: "#1a1a2e",
    houseCrosshairs: false,
    hackFill: "#222",
    teams: [
      { f: "#f0c830", s: "#b8941e", g: "rgba(240,200,48,0.28)", name: "Yellow" },
      { f: "#d03030", s: "#8b1a1a", g: "rgba(208,48,48,0.28)", name: "Red" },
    ],
    rockStroke: "#555",
    rockHandleWidth: 1.2,
    rockGradient: true,
    btnBg: "rgba(255,255,255,0.05)",
    btnBorder: "1px solid rgba(255,255,255,0.1)",
    btnRadius: 3,
    btnColor: "#8ab4f8",
    panelBg: "rgba(255,255,255,0.03)",
    panelBorder: "1px solid rgba(255,255,255,0.08)",
    scoreBg: "rgba(255,255,255,0.03)",
    scoreBorder: "1px solid rgba(255,255,255,0.06)",
    canvasBorder: "1px solid rgba(255,255,255,0.06)",
    titleBg: "rgba(7,11,20,0.88)",
    titleGradient: "linear-gradient(135deg,#f0c830,#d03030)",
    titleFont: 42,
    titleWeight: 900,
    startBtnBg: "linear-gradient(135deg,rgba(240,200,48,0.15),rgba(208,48,48,0.15))",
    overlayBg: "rgba(7,11,20,0.75)",
    sweepEmoji: true,
  },
  wincurl: {
    name: "WinCurl 2.0",
    pageBg: "#c0c0c0",
    font: "'MS Sans Serif','Segoe UI','Tahoma',sans-serif",
    textColor: "#000000",
    dimText: "#808080",
    accentText: "#000080",
    canvasBg: "#404040",
    sheetGradient: ["#e8e8e8", "#f0f0f0", "#e8e8e8"],
    sheetRadius: 0,
    pebbleDots: "rgba(200,200,200,0.08)",
    hogLine: "#cc0000",
    tLine: "#000000",
    backLine: "#000000",
    centerLine: "#00000040",
    lineWidth: { hog: 3, tee: 2, back: 2.5 },
    houseRings: [
      [72, "rgba(0,0,200,0.7)", "#000000", 3],
      [48, "rgba(255,255,255,0.95)", "#000000", 3],
      [24, "rgba(220,0,0,0.7)", "#000000", 3],
      [6, "rgba(255,255,255,0.95)", "#000000", 2],
    ],
    buttonFill: "#000000",
    houseCrosshairs: true,
    hackFill: "#000000",
    teams: [
      { f: "#e0c020", s: "#000000", g: "rgba(224,192,32,0.3)", name: "Yellow" },
      { f: "#d02020", s: "#000000", g: "rgba(208,32,32,0.3)", name: "Red" },
    ],
    rockStroke: "#000000",
    rockHandleWidth: 2,
    rockGradient: false,
    btnBg: "#c0c0c0",
    btnBorder: "2px outset #ffffff",
    btnRadius: 0,
    btnColor: "#000000",
    panelBg: "#c0c0c0",
    panelBorder: "2px inset #808080",
    scoreBg: "#c0c0c0",
    scoreBorder: "2px inset #808080",
    canvasBorder: "2px inset #808080",
    titleBg: "rgba(0,0,128,0.92)",
    titleGradient: "none",
    titleFont: 32,
    titleWeight: 700,
    titleTextColor: "#ffffff",
    startBtnBg: "#c0c0c0",
    startBtnBorder: "2px outset #ffffff",
    overlayBg: "rgba(0,0,128,0.80)",
    sweepEmoji: false,
    sweepCorridor: true,
  },
};

export const DEFAULT_THEME: ThemeName = "modern";
