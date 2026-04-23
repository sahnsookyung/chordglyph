import type {
  FingerDepthSampleMap,
  FingerDepthSensitivityMap,
  FingerActivationTuning,
  FingerActivationTuningMap,
  FingerTouchCalibrationMap,
  HandedNumberMap,
  HandedFingerDepthSamples,
  HandedFingerActivationTuning,
  HandedFingerDepthSensitivity,
  HandedTouchCalibration,
  Handedness,
  FingertipName,
  TouchCalibrationPoint
} from "./types";

export interface CalibrationTouchSample {
  handedness: Handedness;
  finger: FingertipName;
  rawDepthScore: number;
  effectiveDepthScore: number;
}

export function emptyFingerDepthSamples(): FingerDepthSampleMap {
  return {
    thumb: null,
    index: null,
    middle: null,
    ring: null,
    pinky: null
  };
}

export function emptyTouchCalibrationPoint(): TouchCalibrationPoint {
  return {
    hoverDepth: null,
    pressDepth: null,
    rawHoverDepth: null,
    rawPressDepth: null,
    sensitivityAtCalibration: null,
    direction: 1,
    targetKey: null,
    qualityScore: null,
    noiseFloor: null,
    pressDelta: null,
    pressVelocity: null,
    releaseVelocity: null,
    sampleCount: 0,
    updatedAt: null
  };
}

export function createFingerTouchCalibrationMap(
  base: Partial<Record<FingertipName, Partial<TouchCalibrationPoint>>> = {}
): FingerTouchCalibrationMap {
  return {
    thumb: { ...emptyTouchCalibrationPoint(), ...base.thumb },
    index: { ...emptyTouchCalibrationPoint(), ...base.index },
    middle: { ...emptyTouchCalibrationPoint(), ...base.middle },
    ring: { ...emptyTouchCalibrationPoint(), ...base.ring },
    pinky: { ...emptyTouchCalibrationPoint(), ...base.pinky }
  };
}

export function createHandedTouchCalibration(
  leftBase?: Partial<Record<FingertipName, Partial<TouchCalibrationPoint>>>,
  rightBase?: Partial<Record<FingertipName, Partial<TouchCalibrationPoint>>>
): HandedTouchCalibration {
  return {
    Left: createFingerTouchCalibrationMap(leftBase),
    Right: createFingerTouchCalibrationMap(rightBase)
  };
}

export function createFingerDepthSensitivityMap(
  base: Partial<FingerDepthSensitivityMap> = {}
): FingerDepthSensitivityMap {
  return {
    thumb: base.thumb ?? 1.35,
    index: base.index ?? 1,
    middle: base.middle ?? 1,
    ring: base.ring ?? 1,
    pinky: base.pinky ?? 1.05
  };
}

export function createHandedFingerDepthSensitivity(
  leftBase?: Partial<FingerDepthSensitivityMap>,
  rightBase?: Partial<FingerDepthSensitivityMap>
): HandedFingerDepthSensitivity {
  const sharedBase = createFingerDepthSensitivityMap(rightBase ?? leftBase);

  return {
    Left: createFingerDepthSensitivityMap(leftBase ?? sharedBase),
    Right: createFingerDepthSensitivityMap(rightBase ?? sharedBase)
  };
}

export function createFingerActivationTuning(
  base: Partial<FingerActivationTuning> = {}
): FingerActivationTuning {
  return {
    hardActivationThreshold: base.hardActivationThreshold ?? 0.82,
    pressActivationThreshold: base.pressActivationThreshold ?? 0.55,
    releaseActivationThreshold: base.releaseActivationThreshold ?? 0.35,
    touchDwellMs: base.touchDwellMs ?? 12,
    pressVelocityThreshold: base.pressVelocityThreshold ?? 999,
    releaseVelocityThreshold: base.releaseVelocityThreshold ?? 5,
    activationVelocitySmoothing: base.activationVelocitySmoothing ?? 0.35
  };
}

export function createFingerActivationTuningMap(
  base: Partial<Record<FingertipName, Partial<FingerActivationTuning>>> = {},
  sharedBase: Partial<FingerActivationTuning> = {}
): FingerActivationTuningMap {
  return {
    thumb: createFingerActivationTuning({ ...sharedBase, ...base.thumb }),
    index: createFingerActivationTuning({ ...sharedBase, ...base.index }),
    middle: createFingerActivationTuning({ ...sharedBase, ...base.middle }),
    ring: createFingerActivationTuning({ ...sharedBase, ...base.ring }),
    pinky: createFingerActivationTuning({ ...sharedBase, ...base.pinky })
  };
}

export function createHandedFingerActivationTuning(
  leftBase?: Partial<Record<FingertipName, Partial<FingerActivationTuning>>>,
  rightBase?: Partial<Record<FingertipName, Partial<FingerActivationTuning>>>,
  leftSharedBase: Partial<FingerActivationTuning> = {},
  rightSharedBase: Partial<FingerActivationTuning> = leftSharedBase
): HandedFingerActivationTuning {
  return {
    Left: createFingerActivationTuningMap(leftBase, leftSharedBase),
    Right: createFingerActivationTuningMap(rightBase, rightSharedBase)
  };
}

export function emptyHandedFingerDepthSamples(): HandedFingerDepthSamples {
  return {
    Left: emptyFingerDepthSamples(),
    Right: emptyFingerDepthSamples()
  };
}

export function emptyHandedTouchDepthMap(): Record<Handedness, number | null> {
  return {
    Left: null,
    Right: null
  };
}

export function createHandedNumberMap(left: number, right = left): HandedNumberMap {
  return {
    Left: left,
    Right: right
  };
}

export function recordFingerDepthSample(
  currentSamples: FingerDepthSampleMap,
  finger: FingertipName,
  rawDepthScore: number
): FingerDepthSampleMap {
  return {
    ...currentSamples,
    [finger]:
      currentSamples[finger] === null
        ? rawDepthScore
        : Math.max(currentSamples[finger] ?? rawDepthScore, rawDepthScore)
  };
}

export function getCalibrationDepthScore(
  touchSamples: CalibrationTouchSample[],
  handedness: Handedness
): number | null {
  const handSamples = touchSamples.filter((sample) => sample.handedness === handedness);
  if (handSamples.length === 0) {
    return null;
  }

  return Math.max(...handSamples.map((sample) => sample.effectiveDepthScore));
}

export function getCalibrationFingerSamples(
  samplesByHand: HandedFingerDepthSamples,
  handedness: Handedness
): FingerDepthSampleMap {
  return samplesByHand[handedness] ?? emptyFingerDepthSamples();
}
