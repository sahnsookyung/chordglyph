import type { CalibrationScope, FingertipName, Handedness } from "../lib/types";

export const FINGERTIP_SENSITIVITY_CONTROLS: Array<{ key: FingertipName; label: string }> = [
  { key: "thumb", label: "Thumb" },
  { key: "index", label: "Index" },
  { key: "middle", label: "Middle" },
  { key: "ring", label: "Ring" },
  { key: "pinky", label: "Pinky" }
];

export const CIRCLE_HANDS: readonly Handedness[] = ["Left", "Right"];
export const CALIBRATION_SCOPE_OPTIONS: CalibrationScope[] = ["Both", "Left", "Right"];

export function audioStatusLabel(
  status: "idle" | "arming" | "armed" | "blocked" | "error"
): string {
  switch (status) {
    case "arming":
      return "Audio arming...";
    case "armed":
      return "Audio ready";
    case "blocked":
      return "Click to enable audio";
    case "error":
      return "Audio retry";
    default:
      return "Click to enable audio";
  }
}

export function confidenceTone(value: number): string {
  if (value > 45) {
    return "#4ade80";
  }
  if (value > 25) {
    return "#f59e0b";
  }
  return "#fb7185";
}

export function formatDebugValue(value: number | null, digits = 2): string {
  return value === null ? "--" : value.toFixed(digits);
}

export function formatCalibrationQuality(value: number | null): string {
  return value === null ? "--" : `${Math.round(value * 100)}%`;
}
