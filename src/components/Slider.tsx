// Slider UI component

import React from "react";
import type { Theme } from "../constants/theme";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  theme: Theme;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  theme: th,
}: SliderProps): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
      <span
        style={{
          fontSize: 8,
          color: th.dimText,
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
          accentColor: th.accentText,
          cursor: "pointer",
        }}
      />
      <span
        style={{
          fontSize: 8,
          color: th.textColor,
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
