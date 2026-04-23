import { clamp } from "./geometry";
import type { FingertipName, TouchCalibrationPoint } from "./types";

export const FINGER_SENSITIVITY_BOUNDS = {
  min: 0,
  max: 10
} as const;

const MIN_VISUAL_GATE = 0.02;
const MIN_CALIBRATION_RANGE = 0.001;
const MAX_ACTIVATION_VELOCITY = 60;

export interface TouchIntentTuning {
  hardActivationThreshold: number;
  pressActivationThreshold: number;
  releaseActivationThreshold: number;
  stablePressMs: number;
  pressVelocityThreshold: number;
  releaseVelocityThreshold: number;
}

export const DEFAULT_TOUCH_INTENT_TUNING: TouchIntentTuning = {
  hardActivationThreshold: 0.82,
  pressActivationThreshold: 0.55,
  releaseActivationThreshold: 0.35,
  stablePressMs: 12,
  pressVelocityThreshold: 999,
  releaseVelocityThreshold: 5
};

export function tipIndexToFingerName(tipIndex: 4 | 8 | 12 | 16 | 20): FingertipName {
  const tipMap: Record<4 | 8 | 12 | 16 | 20, FingertipName> = {
    4: "thumb",
    8: "index",
    12: "middle",
    16: "ring",
    20: "pinky"
  };

  return tipMap[tipIndex];
}

export function getEffectiveDepthScore(rawDepthScore: number, sensitivity: number): number {
  return rawDepthScore * sensitivity;
}

export function getVisualActivationProgress(effectiveDepthScore: number, depthGate: number): number {
  return clamp(effectiveDepthScore / Math.max(depthGate, MIN_VISUAL_GATE));
}

export function isTouchCalibrationComplete(calibration: TouchCalibrationPoint): boolean {
  const hasRawCalibration =
    typeof calibration.rawHoverDepth === "number" &&
    Number.isFinite(calibration.rawHoverDepth) &&
    typeof calibration.rawPressDepth === "number" &&
    Number.isFinite(calibration.rawPressDepth);
  const hasWeightedCalibration =
    typeof calibration.hoverDepth === "number" &&
    Number.isFinite(calibration.hoverDepth) &&
    typeof calibration.pressDepth === "number" &&
    Number.isFinite(calibration.pressDepth);

  return (
    hasRawCalibration ||
    hasWeightedCalibration
  );
}

export function deriveTouchCalibrationDirection(
  hoverDepth: number | null,
  pressDepth: number | null
): -1 | 1 {
  if (hoverDepth === null || pressDepth === null) {
    return 1;
  }

  return pressDepth >= hoverDepth ? 1 : -1;
}

export function getTouchActivation(input: {
  effectiveDepthScore: number;
  depthGate: number;
  calibration: TouchCalibrationPoint;
  sensitivity?: number;
}): { activation: number; calibrated: boolean } {
  if (!isTouchCalibrationComplete(input.calibration)) {
    return {
      activation: getVisualActivationProgress(input.effectiveDepthScore, input.depthGate),
      calibrated: false
    };
  }

  const hasRawCalibration =
    typeof input.calibration.rawHoverDepth === "number" &&
    Number.isFinite(input.calibration.rawHoverDepth) &&
    typeof input.calibration.rawPressDepth === "number" &&
    Number.isFinite(input.calibration.rawPressDepth) &&
    input.sensitivity !== undefined;
  const hoverDepth = hasRawCalibration
    ? (input.calibration.rawHoverDepth ?? 0) * (input.sensitivity ?? 1)
    : input.calibration.hoverDepth ?? 0;
  const pressDepth = hasRawCalibration
    ? (input.calibration.rawPressDepth ?? input.calibration.rawHoverDepth ?? 0) *
      (input.sensitivity ?? 1)
    : input.calibration.pressDepth ?? hoverDepth;
  const noiseGuard =
    typeof input.calibration.noiseFloor === "number" &&
    Number.isFinite(input.calibration.noiseFloor)
      ? input.calibration.noiseFloor * 2
      : 0;
  const range = Math.max(
    Math.abs(pressDepth - hoverDepth),
    noiseGuard,
    MIN_CALIBRATION_RANGE
  );
  const direction = input.calibration.direction;

  return {
    activation: clamp(((input.effectiveDepthScore - hoverDepth) * direction) / range),
    calibrated: true
  };
}

export function getActivationVelocity(input: {
  previousActivation: number | null;
  nextActivation: number;
  elapsedMs: number;
  previousVelocity: number;
  smoothing: number;
}): number {
  if (input.previousActivation === null || input.elapsedMs <= 0) {
    return 0;
  }

  const rawVelocity =
    ((input.nextActivation - input.previousActivation) / input.elapsedMs) * 1000;
  const alpha = clamp(input.smoothing);
  return clamp(
    input.previousVelocity + (rawVelocity - input.previousVelocity) * alpha,
    -MAX_ACTIVATION_VELOCITY,
    MAX_ACTIVATION_VELOCITY
  );
}

export function shouldPressTouch(input: {
  currentKey: string | null;
  previousKey: string | null;
  previousPressed: boolean;
  stableMs: number;
  activation: number;
  activationVelocity: number;
  tuning?: Partial<TouchIntentTuning>;
}): boolean {
  if (!input.currentKey) {
    return false;
  }

  const tuning = {
    ...DEFAULT_TOUCH_INTENT_TUNING,
    ...input.tuning
  };
  const pressActivationThreshold = clamp(tuning.pressActivationThreshold);
  const hardActivationThreshold = Math.max(
    pressActivationThreshold,
    clamp(tuning.hardActivationThreshold)
  );
  const releaseActivationThreshold = Math.min(
    pressActivationThreshold,
    clamp(tuning.releaseActivationThreshold)
  );
  const pressVelocityThreshold = Math.max(0, tuning.pressVelocityThreshold);
  const releaseVelocityThreshold = Math.max(0, tuning.releaseVelocityThreshold);
  const sameKeyAsPrevious = input.currentKey === input.previousKey;

  if (input.previousPressed && sameKeyAsPrevious) {
    if (
      input.activation <= releaseActivationThreshold ||
      (input.activation <= pressActivationThreshold &&
        input.activationVelocity <= -releaseVelocityThreshold)
    ) {
      return false;
    }

    return true;
  }

  if (input.activation >= hardActivationThreshold) {
    return true;
  }

  if (!sameKeyAsPrevious) {
    return false;
  }

  return (
    (input.stableMs >= tuning.stablePressMs &&
      input.activation >= pressActivationThreshold) ||
    (input.activation >= pressActivationThreshold * 0.85 &&
      input.activationVelocity >= pressVelocityThreshold)
  );
}

export function calibrateFingerDepthSensitivity(
  currentSensitivity: Record<FingertipName, number>,
  rawDepthSamples: Record<FingertipName, number | null>,
  depthGate: number
): Record<FingertipName, number> {
  const targetDepthScore = Math.max(depthGate * 0.98, depthGate - 0.0015, MIN_VISUAL_GATE);

  return {
    thumb:
      rawDepthSamples.thumb === null || rawDepthSamples.thumb <= 0
        ? currentSensitivity.thumb
        : clamp(targetDepthScore / rawDepthSamples.thumb, FINGER_SENSITIVITY_BOUNDS.min, FINGER_SENSITIVITY_BOUNDS.max),
    index:
      rawDepthSamples.index === null || rawDepthSamples.index <= 0
        ? currentSensitivity.index
        : clamp(targetDepthScore / rawDepthSamples.index, FINGER_SENSITIVITY_BOUNDS.min, FINGER_SENSITIVITY_BOUNDS.max),
    middle:
      rawDepthSamples.middle === null || rawDepthSamples.middle <= 0
        ? currentSensitivity.middle
        : clamp(targetDepthScore / rawDepthSamples.middle, FINGER_SENSITIVITY_BOUNDS.min, FINGER_SENSITIVITY_BOUNDS.max),
    ring:
      rawDepthSamples.ring === null || rawDepthSamples.ring <= 0
        ? currentSensitivity.ring
        : clamp(targetDepthScore / rawDepthSamples.ring, FINGER_SENSITIVITY_BOUNDS.min, FINGER_SENSITIVITY_BOUNDS.max),
    pinky:
      rawDepthSamples.pinky === null || rawDepthSamples.pinky <= 0
        ? currentSensitivity.pinky
        : clamp(targetDepthScore / rawDepthSamples.pinky, FINGER_SENSITIVITY_BOUNDS.min, FINGER_SENSITIVITY_BOUNDS.max)
  };
}

export function calibrateSingleFingerDepthSensitivity(
  currentSensitivity: Record<FingertipName, number>,
  rawDepthSamples: Record<FingertipName, number | null>,
  depthGate: number,
  finger: FingertipName
): Record<FingertipName, number> {
  return {
    ...currentSensitivity,
    [finger]: calibrateFingerDepthSensitivity(currentSensitivity, rawDepthSamples, depthGate)[finger]
  };
}
