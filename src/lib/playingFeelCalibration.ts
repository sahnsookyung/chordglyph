import {
  CALIBRATION_QUALITY_THRESHOLDS,
  CALIBRATION_STABILITY_THRESHOLDS,
  CONTROL_GESTURE_THRESHOLDS
} from "./constants";
import { extractHandFeatures } from "./featureExtraction";
import { clamp } from "./geometry";
import type {
  CalibrationPhase,
  CalibrationScope,
  FingerActivationTuning,
  FingertipName,
  Handedness,
  Landmark,
  TouchCalibrationPoint,
  TrackedHand
} from "./types";

export const CALIBRATION_FINGER_ORDER: FingertipName[] = [
  "thumb",
  "index",
  "middle",
  "ring",
  "pinky"
];

export type CalibrationControlGesture = "none" | "fist" | "pinch" | "open";
export type CalibrationCommand = "none" | "accept" | "retry" | "pause" | "skip";
export type CalibrationCue = "success" | "retry" | "complete" | "pause";
export type CalibrationQualityLabel =
  | "Good"
  | "Weak delta"
  | "Noisy hover"
  | "Direction unstable"
  | "Skipped"
  | "Accepted anyway"
  | "Pending";

export interface CalibrationControlZone {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CalibrationFrameSample {
  timestamp: number;
  hand: Handedness;
  finger: FingertipName;
  x: number;
  y: number;
  rawDepth: number;
  weightedDepth: number;
  sensitivity: number;
  candidateKey: string | null;
  nearKey: string | null;
  midiNote: number | null;
  visible: boolean;
}

export interface CalibrationHoverResult {
  weightedDepth: number;
  rawDepth: number;
  sensitivity: number;
  targetKey: string;
  midiNote: number | null;
  noiseFloor: number;
  xyStdDev: number;
  sampleCount: number;
  qualityScore: number;
}

export interface CalibrationTapResult {
  weightedPressDepth: number;
  rawPressDepth: number;
  direction: -1 | 1;
  targetKey: string;
  midiNote: number | null;
  pressDelta: number;
  pressVelocity: number;
  releaseVelocity: number;
  cycles: number;
  sampleCount: number;
  qualityScore: number;
  label: CalibrationQualityLabel;
}

export interface CalibrationCommit {
  hand: Handedness;
  finger: FingertipName;
  calibration: TouchCalibrationPoint;
  tuning: FingerActivationTuning;
  label: CalibrationQualityLabel;
}

export interface CalibrationCommandState {
  rawGesture: CalibrationControlGesture;
  command: CalibrationCommand;
  startedAt: number | null;
  elapsedMs: number;
  progress: number;
  stable: boolean;
  insideControlZone: boolean;
}

export interface FingerCalibrationSummary {
  status: CalibrationQualityLabel;
  qualityScore: number | null;
  targetKey: string | null;
  updatedAt: number | null;
}

export type HandCalibrationSummary = Record<FingertipName, FingerCalibrationSummary>;
export type CalibrationSummaries = Record<Handedness, HandCalibrationSummary>;

export interface PlayingFeelCalibrationSession {
  active: boolean;
  phase: CalibrationPhase;
  scope: CalibrationScope;
  handQueue: Handedness[];
  handIndex: number;
  fingerIndex: number;
  targetHand: Handedness;
  controlHand: Handedness;
  targetFinger: FingertipName;
  startedAt: number;
  phaseStartedAt: number;
  pausedFromPhase: CalibrationPhase | null;
  rehearsal: Record<"fist" | "pinch" | "open", boolean>;
  command: CalibrationCommandState;
  hoverSamples: CalibrationFrameSample[];
  tapSamples: CalibrationFrameSample[];
  acceptedHover: CalibrationHoverResult | null;
  pendingHover: CalibrationHoverResult | null;
  pendingTap: CalibrationTapResult | null;
  progress: number;
  qualityScore: number | null;
  guidance: string;
  captureStatus: string;
  targetKey: string | null;
  previewMidiNote: number | null;
  previewStartedAt: number | null;
  roleAmbiguousSince: number | null;
  handAwaySince: number | null;
  summaries: CalibrationSummaries;
}

export interface CalibrationUpdateInput {
  timestamp: number;
  targetSample: CalibrationFrameSample | null;
  controlGesture: CalibrationControlGesture;
  controlHandVisible: boolean;
  controlInsideZone: boolean;
  roleAmbiguous: boolean;
}

export interface CalibrationUpdateResult {
  session: PlayingFeelCalibrationSession;
  commit: CalibrationCommit | null;
  cue: CalibrationCue | null;
  normalAudioSuppressed: boolean;
}

function emptyCommandState(): CalibrationCommandState {
  return {
    rawGesture: "none",
    command: "none",
    startedAt: null,
    elapsedMs: 0,
    progress: 0,
    stable: false,
    insideControlZone: false
  };
}

function emptyFingerSummary(): FingerCalibrationSummary {
  return {
    status: "Pending",
    qualityScore: null,
    targetKey: null,
    updatedAt: null
  };
}

function emptyHandSummary(): HandCalibrationSummary {
  return {
    thumb: emptyFingerSummary(),
    index: emptyFingerSummary(),
    middle: emptyFingerSummary(),
    ring: emptyFingerSummary(),
    pinky: emptyFingerSummary()
  };
}

export function emptyCalibrationSummaries(): CalibrationSummaries {
  return {
    Left: emptyHandSummary(),
    Right: emptyHandSummary()
  };
}

export function getOppositeHand(hand: Handedness): Handedness {
  return hand === "Left" ? "Right" : "Left";
}

export function createIdleCalibrationSession(timestamp = 0): PlayingFeelCalibrationSession {
  return {
    active: false,
    phase: "idle",
    scope: "Right",
    handQueue: ["Right"],
    handIndex: 0,
    fingerIndex: 0,
    targetHand: "Right",
    controlHand: "Left",
    targetFinger: "thumb",
    startedAt: timestamp,
    phaseStartedAt: timestamp,
    pausedFromPhase: null,
    rehearsal: { fist: false, pinch: false, open: false },
    command: emptyCommandState(),
    hoverSamples: [],
    tapSamples: [],
    acceptedHover: null,
    pendingHover: null,
    pendingTap: null,
    progress: 0,
    qualityScore: null,
    guidance: "Ready to calibrate.",
    captureStatus: "Idle.",
    targetKey: null,
    previewMidiNote: null,
    previewStartedAt: null,
    roleAmbiguousSince: null,
    handAwaySince: null,
    summaries: emptyCalibrationSummaries()
  };
}

export function startPlayingFeelCalibration(
  scope: CalibrationScope,
  timestamp: number
): PlayingFeelCalibrationSession {
  const handQueue: Handedness[] =
    scope === "Both" ? ["Left", "Right"] : [scope];
  const targetHand = handQueue[0] ?? "Right";

  return {
    ...createIdleCalibrationSession(timestamp),
    active: true,
    phase: "control-rehearsal",
    scope,
    handQueue,
    handIndex: 0,
    fingerIndex: 0,
    targetHand,
    controlHand: getOppositeHand(targetHand),
    targetFinger: CALIBRATION_FINGER_ORDER[0],
    guidance: `Show the control gestures with your ${getOppositeHand(targetHand).toLowerCase()} hand.`,
    captureStatus: "Learn fist, pinch, and open-palm control signs.",
    phaseStartedAt: timestamp
  };
}

export function getCalibrationControlZone(controlHand: Handedness): CalibrationControlZone {
  return controlHand === "Left"
    ? { left: 0.02, right: 0.36, top: 0.08, bottom: 0.92 }
    : { left: 0.64, right: 0.98, top: 0.08, bottom: 0.92 };
}

export function getCalibrationAcceptedControlZones(
  controlHand: Handedness,
  pianoBounds: { topY: number; bottomY: number },
  stripBounds: { left: number; right: number }
): CalibrationControlZone[] {
  const zone = getCalibrationControlZone(controlHand);
  const blocked = {
    left: Math.max(zone.left, stripBounds.left),
    right: Math.min(zone.right, stripBounds.right),
    top: Math.max(zone.top, pianoBounds.topY),
    bottom: Math.min(zone.bottom, pianoBounds.bottomY)
  };

  if (blocked.left >= blocked.right || blocked.top >= blocked.bottom) {
    return [zone];
  }

  const candidates: CalibrationControlZone[] = [
    { left: zone.left, right: zone.right, top: zone.top, bottom: blocked.top },
    { left: zone.left, right: zone.right, top: blocked.bottom, bottom: zone.bottom },
    { left: zone.left, right: blocked.left, top: blocked.top, bottom: blocked.bottom },
    { left: blocked.right, right: zone.right, top: blocked.top, bottom: blocked.bottom }
  ];

  return candidates.filter(
    (candidate) => candidate.right - candidate.left > 0.001 && candidate.bottom - candidate.top > 0.001
  );
}

export function isPalmInsideControlZone(
  palm: Landmark | null,
  controlHand: Handedness,
  pianoBounds: { topY: number; bottomY: number },
  stripBounds: { left: number; right: number }
): boolean {
  if (!palm) {
    return false;
  }

  const zone = getCalibrationControlZone(controlHand);
  const inZone =
    palm.x >= zone.left &&
    palm.x <= zone.right &&
    palm.y >= zone.top &&
    palm.y <= zone.bottom;
  const inPiano =
    palm.x >= stripBounds.left &&
    palm.x <= stripBounds.right &&
    palm.y >= pianoBounds.topY &&
    palm.y <= pianoBounds.bottomY;

  return inZone && !inPiano;
}

export function classifyCalibrationControlGesture(hand: TrackedHand | null): CalibrationControlGesture {
  if (!hand) {
    return "none";
  }

  const features = extractHandFeatures(hand.landmarks);
  if (
    features.pinchIndex >= CONTROL_GESTURE_THRESHOLDS.pinch &&
    features.averageCurl < 0.78
  ) {
    return "pinch";
  }

  if (
    features.fistness >= CONTROL_GESTURE_THRESHOLDS.fistness &&
    features.openness < 0.46
  ) {
    return "fist";
  }

  if (
    features.openness >= CONTROL_GESTURE_THRESHOLDS.openness &&
    features.extendedCount >= 3
  ) {
    return "open";
  }

  return "none";
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stdDev(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function roundCalibrationNumber(value: number, digits = 5): number {
  return Number(value.toFixed(digits));
}

function getSampleResolvedKey(sample: CalibrationFrameSample): string | null {
  return sample.candidateKey ?? sample.nearKey;
}

function mostCommonString(values: string[]): string | null {
  if (values.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getTapExcursionThreshold(hover: CalibrationHoverResult): number {
  return Math.max(0.0012, hover.noiseFloor * 2.5);
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function buildHoverCaptureStatus(
  samples: CalibrationFrameSample[],
  hover: CalibrationHoverResult | null,
  targetSample: CalibrationFrameSample | null
): string {
  if (hover) {
    return `${hover.sampleCount} stable frames on ${hover.targetKey}; xy ${hover.xyStdDev.toFixed(3)}, z noise ${hover.noiseFloor.toFixed(4)}.`;
  }

  if (!targetSample) {
    return "Waiting for the target fingertip.";
  }

  if (!targetSample.visible) {
    return "Move the fingertip into the keyboard band.";
  }

  const usableSamples = samples.filter(
    (sample) => sample.visible && getSampleResolvedKey(sample) !== null
  );
  if (usableSamples.length === 0) {
    return "Move over a white or black key.";
  }

  const first = usableSamples[0];
  const last = usableSamples.at(-1);
  if (!last) {
    return "Move over a white or black key.";
  }
  const elapsedMs = last.timestamp - first.timestamp;
  return `${usableSamples.length}/${CALIBRATION_STABILITY_THRESHOLDS.hoverMinFrames} frames, ${formatSeconds(elapsedMs)}/${formatSeconds(CALIBRATION_STABILITY_THRESHOLDS.hoverMinDurationMs)} steady hold.`;
}

function buildTapCaptureStatus(
  cycles: number,
  hover: CalibrationHoverResult | null,
  targetSample: CalibrationFrameSample | null,
  timestamp: number,
  phaseStartedAt: number
): string {
  const remainingMs =
    CALIBRATION_STABILITY_THRESHOLDS.tapTimeoutMs - (timestamp - phaseStartedAt);
  if (!hover) {
    return "Waiting for accepted hover.";
  }

  if (!targetSample) {
    return `${cycles}/${CALIBRATION_STABILITY_THRESHOLDS.tapMinCycles} taps; return the target fingertip to ${hover.targetKey}.`;
  }

  if (getSampleResolvedKey(targetSample) !== hover.targetKey) {
    return `${cycles}/${CALIBRATION_STABILITY_THRESHOLDS.tapMinCycles} taps; stay on ${hover.targetKey}.`;
  }

  const excursion = Math.abs(targetSample.weightedDepth - hover.weightedDepth);
  const threshold = getTapExcursionThreshold(hover);
  const cue = excursion < threshold ? "press a little farther" : "lift and press again";
  return `${cycles}/${CALIBRATION_STABILITY_THRESHOLDS.tapMinCycles} taps, ${formatSeconds(remainingMs)} left; ${cue}.`;
}

function scoreToLabel(score: number): CalibrationQualityLabel {
  if (score >= CALIBRATION_QUALITY_THRESHOLDS.good) {
    return "Good";
  }
  if (score >= CALIBRATION_QUALITY_THRESHOLDS.weak) {
    return "Weak delta";
  }
  return "Noisy hover";
}

function getTapConfirmationGuidance(tap: CalibrationTapResult, cycles: number): string {
  if (tap.qualityScore < CALIBRATION_QUALITY_THRESHOLDS.weak) {
    return `${cycles} taps captured, but the signal is weak. Hold fist for 1.5s to accept anyway, or pinch to retry.`;
  }

  if (tap.qualityScore < CALIBRATION_QUALITY_THRESHOLDS.good) {
    return `${cycles} usable taps captured with weak delta. Show fist to accept, or pinch to retry.`;
  }

  return `${cycles} clean taps captured. Show fist to accept or pinch to retry.`;
}

function summarizeHoverSamples(samples: CalibrationFrameSample[]): CalibrationHoverResult | null {
  const usableSamples = samples
    .filter((sample) => sample.visible && getSampleResolvedKey(sample) !== null)
    .slice(-90);
  if (usableSamples.length < CALIBRATION_STABILITY_THRESHOLDS.hoverMinFrames) {
    return null;
  }

  const first = usableSamples[0];
  const last = usableSamples.at(-1);
  if (!last) {
    return null;
  }
  if (last.timestamp - first.timestamp < CALIBRATION_STABILITY_THRESHOLDS.hoverMinDurationMs) {
    return null;
  }

  const xyStd = Math.max(
    stdDev(usableSamples.map((sample) => sample.x)),
    stdDev(usableSamples.map((sample) => sample.y))
  );
  const depthStd = stdDev(usableSamples.map((sample) => sample.weightedDepth));
  if (
    xyStd > CALIBRATION_STABILITY_THRESHOLDS.hoverMaxXyStdDev ||
    depthStd > CALIBRATION_STABILITY_THRESHOLDS.hoverMaxDepthStdDev
  ) {
    return null;
  }

  const targetKey = mostCommonString(
    usableSamples
      .map((sample) => getSampleResolvedKey(sample))
      .filter((key): key is string => key !== null)
  );
  if (!targetKey) {
    return null;
  }

  const qualityScore = clamp(
    0.45 +
      (CALIBRATION_STABILITY_THRESHOLDS.hoverMaxXyStdDev - xyStd) * 9 +
      (CALIBRATION_STABILITY_THRESHOLDS.hoverMaxDepthStdDev - depthStd) * 90
  );

  return {
    weightedDepth: median(usableSamples.map((sample) => sample.weightedDepth)),
    rawDepth: median(usableSamples.map((sample) => sample.rawDepth)),
    sensitivity: median(usableSamples.map((sample) => sample.sensitivity)),
    targetKey,
    midiNote: usableSamples.find((sample) => sample.midiNote !== null)?.midiNote ?? null,
    noiseFloor: depthStd,
    xyStdDev: xyStd,
    sampleCount: usableSamples.length,
    qualityScore
  };
}

function detectTapCycles(
  samples: CalibrationFrameSample[],
  hover: CalibrationHoverResult
): Array<{ peak: CalibrationFrameSample; peakDelta: number; startIndex: number; endIndex: number }> {
  const validSamples = samples.filter(
    (sample) => sample.visible && getSampleResolvedKey(sample) === hover.targetKey
  );
  if (validSamples.length < 8) {
    return [];
  }

  const deltas = validSamples.map((sample) => sample.weightedDepth - hover.weightedDepth);
  const positivePeak = Math.max(...deltas);
  const negativePeak = Math.min(...deltas);
  const direction: -1 | 1 = positivePeak >= Math.abs(negativePeak) ? 1 : -1;
  const threshold = getTapExcursionThreshold(hover);
  const releaseThreshold = threshold * 0.6;
  const cycles: Array<{ peak: CalibrationFrameSample; peakDelta: number; startIndex: number; endIndex: number }> = [];
  let pressing = false;
  let peak: CalibrationFrameSample | null = null;
  let peakDelta = 0;
  let startIndex = 0;

  validSamples.forEach((sample, index) => {
    const excursion = (sample.weightedDepth - hover.weightedDepth) * direction;
    if (!pressing && excursion >= threshold) {
      pressing = true;
      startIndex = index;
      peak = sample;
      peakDelta = excursion;
      return;
    }

    if (pressing && excursion > peakDelta) {
      peak = sample;
      peakDelta = excursion;
    }

    const dynamicReleaseThreshold = Math.max(releaseThreshold, peakDelta * 0.62);
    if (pressing && excursion <= dynamicReleaseThreshold && peak) {
      cycles.push({ peak, peakDelta, startIndex, endIndex: index });
      pressing = false;
      peak = null;
      peakDelta = 0;
    }
  });

  return cycles;
}

function summarizeTapSamples(
  samples: CalibrationFrameSample[],
  hover: CalibrationHoverResult
): CalibrationTapResult | null {
  const validSamples = samples.filter(
    (sample) => sample.visible && getSampleResolvedKey(sample) === hover.targetKey
  );
  if (validSamples.length < 8) {
    return null;
  }

  const deltas = validSamples.map((sample) => sample.weightedDepth - hover.weightedDepth);
  const positivePeak = Math.max(...deltas);
  const negativePeak = Math.min(...deltas);
  const direction: -1 | 1 = positivePeak >= Math.abs(negativePeak) ? 1 : -1;
  const cycles = detectTapCycles(validSamples, hover);
  if (cycles.length < CALIBRATION_STABILITY_THRESHOLDS.tapMinCycles) {
    return null;
  }

  const sortedPeaks = [...cycles].sort((left, right) => right.peakDelta - left.peakDelta);
  const strongestPeakCount = Math.max(1, Math.ceil(sortedPeaks.length * 0.2));
  const strongestPeaks = sortedPeaks.slice(0, strongestPeakCount);
  const pressDelta = median(strongestPeaks.map((cycle) => cycle.peakDelta));
  const weightedPressDepth = hover.weightedDepth + pressDelta * direction;
  const rawPressDepth = median(strongestPeaks.map((cycle) => cycle.peak.rawDepth));
  const range = Math.max(Math.abs(weightedPressDepth - hover.weightedDepth), 0.003);
  const velocities: number[] = [];

  for (let index = 1; index < validSamples.length; index += 1) {
    const previous = validSamples[index - 1];
    const next = validSamples[index];
    const elapsedMs = Math.max(next.timestamp - previous.timestamp, 1);
    const previousActivation = clamp(((previous.weightedDepth - hover.weightedDepth) * direction) / range);
    const nextActivation = clamp(((next.weightedDepth - hover.weightedDepth) * direction) / range);
    velocities.push(((nextActivation - previousActivation) / elapsedMs) * 1000);
  }

  const pressVelocities = velocities.filter((velocity) => velocity > 0.2);
  const releaseVelocities = velocities.filter((velocity) => velocity < -0.2).map(Math.abs);
  const directionAgreement =
    validSamples.filter((sample) => (sample.weightedDepth - hover.weightedDepth) * direction >= 0).length /
    Math.max(validSamples.length, 1);
  const rangeScore = clamp((pressDelta - getTapExcursionThreshold(hover)) / 0.012);
  const cycleScore = clamp(cycles.length / 3);
  const returnScore = clamp(
    1 -
      Math.abs((validSamples.at(-1)?.weightedDepth ?? hover.weightedDepth) - hover.weightedDepth) /
        Math.max(pressDelta, 0.003)
  );
  const qualityScore = clamp(
    rangeScore * 0.35 +
      cycleScore * 0.22 +
      directionAgreement * 0.18 +
      returnScore * 0.15 +
      hover.qualityScore * 0.1
  );

  return {
    weightedPressDepth,
    rawPressDepth,
    direction,
    targetKey: hover.targetKey,
    midiNote: hover.midiNote,
    pressDelta,
    pressVelocity: median(pressVelocities),
    releaseVelocity: median(releaseVelocities),
    cycles: cycles.length,
    sampleCount: validSamples.length,
    qualityScore,
    label: scoreToLabel(qualityScore)
  };
}

function commandForGesture(
  gesture: CalibrationControlGesture,
  elapsedMs: number
): CalibrationCommand {
  if (gesture === "fist") {
    return "accept";
  }
  if (gesture === "open") {
    return "pause";
  }
  if (gesture === "pinch") {
    return elapsedMs >= CONTROL_GESTURE_THRESHOLDS.longHoldMs ? "skip" : "none";
  }
  return "none";
}

function updateCommandState(
  previous: CalibrationCommandState,
  gesture: CalibrationControlGesture,
  timestamp: number,
  insideControlZone: boolean
): CalibrationCommandState {
  if (
    insideControlZone &&
    gesture === "none" &&
    previous.rawGesture === "pinch" &&
    previous.insideControlZone &&
    previous.elapsedMs >= CONTROL_GESTURE_THRESHOLDS.stableMs &&
    previous.elapsedMs < CONTROL_GESTURE_THRESHOLDS.longHoldMs
  ) {
    return {
      ...emptyCommandState(),
      rawGesture: "none",
      command: "retry",
      stable: true,
      insideControlZone
    };
  }

  if (!insideControlZone || gesture === "none") {
    return {
      ...emptyCommandState(),
      rawGesture: gesture,
      insideControlZone
    };
  }

  const startedAt = previous.rawGesture === gesture && previous.startedAt !== null
    ? previous.startedAt
    : timestamp;
  const elapsedMs = Math.max(timestamp - startedAt, 0);
  const stable = elapsedMs >= CONTROL_GESTURE_THRESHOLDS.stableMs;

  return {
    rawGesture: gesture,
    command: stable ? commandForGesture(gesture, elapsedMs) : "none",
    startedAt,
    elapsedMs,
    progress: clamp(elapsedMs / CONTROL_GESTURE_THRESHOLDS.stableMs),
    stable,
    insideControlZone
  };
}

function resetForCapture(
  session: PlayingFeelCalibrationSession,
  phase: CalibrationPhase,
  timestamp: number,
  guidance: string
): PlayingFeelCalibrationSession {
  return {
    ...session,
    phase,
    phaseStartedAt: timestamp,
    hoverSamples: phase === "capture-hover" ? [] : session.hoverSamples,
    tapSamples: phase === "capture-taps" ? [] : session.tapSamples,
    pendingHover: phase === "capture-hover" ? null : session.pendingHover,
    pendingTap: phase === "capture-taps" ? null : session.pendingTap,
    progress: 0,
    qualityScore: null,
    guidance,
    captureStatus: phase === "capture-taps" ? "Ready for two natural taps." : "Collecting hover samples.",
    previewMidiNote: null,
    command: emptyCommandState()
  };
}

function appendContiguousSample(
  samples: CalibrationFrameSample[],
  nextSample: CalibrationFrameSample | null,
  timestamp: number,
  maxSamples: number
): CalibrationFrameSample[] {
  const lastSample = samples.at(-1);

  if (!nextSample) {
    return lastSample &&
      timestamp - lastSample.timestamp > CALIBRATION_STABILITY_THRESHOLDS.sampleGapResetMs
      ? []
      : samples;
  }

  const contiguous =
    !lastSample ||
    nextSample.timestamp - lastSample.timestamp <=
      CALIBRATION_STABILITY_THRESHOLDS.sampleGapResetMs;
  const baseSamples = contiguous ? samples : [];
  return [...baseSamples, nextSample].slice(-maxSamples);
}

function buildCalibrationCommit(
  session: PlayingFeelCalibrationSession,
  timestamp: number,
  acceptAnyway = false
): CalibrationCommit | null {
  if (!session.acceptedHover || !session.pendingTap) {
    return null;
  }

  const hover = session.acceptedHover;
  const tap = session.pendingTap;
  const qualityLabel =
    acceptAnyway && tap.qualityScore < CALIBRATION_QUALITY_THRESHOLDS.weak
      ? "Accepted anyway"
      : tap.label;
  const calibration: TouchCalibrationPoint = {
    hoverDepth: roundCalibrationNumber(hover.weightedDepth),
    pressDepth: roundCalibrationNumber(tap.weightedPressDepth),
    rawHoverDepth: roundCalibrationNumber(hover.rawDepth),
    rawPressDepth: roundCalibrationNumber(tap.rawPressDepth),
    sensitivityAtCalibration: roundCalibrationNumber(hover.sensitivity),
    direction: tap.direction,
    targetKey: tap.targetKey,
    qualityScore: roundCalibrationNumber(tap.qualityScore, 3),
    noiseFloor: roundCalibrationNumber(hover.noiseFloor),
    pressDelta: roundCalibrationNumber(tap.pressDelta),
    pressVelocity: roundCalibrationNumber(tap.pressVelocity, 3),
    releaseVelocity: roundCalibrationNumber(tap.releaseVelocity, 3),
    sampleCount: hover.sampleCount + tap.sampleCount,
    updatedAt: timestamp
  };
  const tuning: FingerActivationTuning = {
    hardActivationThreshold: 0.82,
    pressActivationThreshold: 0.55,
    releaseActivationThreshold: 0.35,
    touchDwellMs: 10,
    pressVelocityThreshold:
      tap.pressVelocity > 0 ? roundCalibrationNumber(clamp(tap.pressVelocity * 0.8, 1, 999), 3) : 999,
    releaseVelocityThreshold:
      tap.releaseVelocity > 0 ? roundCalibrationNumber(clamp(tap.releaseVelocity * 0.7, 0.5, 60), 3) : 5,
    activationVelocitySmoothing: 0.35
  };

  return {
    hand: session.targetHand,
    finger: session.targetFinger,
    calibration,
    tuning,
    label: qualityLabel
  };
}

function withSummary(
  session: PlayingFeelCalibrationSession,
  hand: Handedness,
  finger: FingertipName,
  summary: FingerCalibrationSummary
): PlayingFeelCalibrationSession {
  return {
    ...session,
    summaries: {
      ...session.summaries,
      [hand]: {
        ...session.summaries[hand],
        [finger]: summary
      }
    }
  };
}

function advanceToNextFinger(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): PlayingFeelCalibrationSession {
  const nextFingerIndex = session.fingerIndex + 1;
  if (nextFingerIndex < CALIBRATION_FINGER_ORDER.length) {
    return resetForCapture(
      {
        ...session,
        fingerIndex: nextFingerIndex,
        targetFinger: CALIBRATION_FINGER_ORDER[nextFingerIndex],
        acceptedHover: null,
        pendingHover: null,
        pendingTap: null,
        targetKey: null
      },
      "capture-hover",
      timestamp,
      `Center your ${session.targetHand.toLowerCase()} ${CALIBRATION_FINGER_ORDER[nextFingerIndex]} over a key and hold steady.`
    );
  }

  const nextHandIndex = session.handIndex + 1;
  if (nextHandIndex < session.handQueue.length) {
    const targetHand = session.handQueue[nextHandIndex];
    return {
      ...resetForCapture(
        {
          ...session,
          handIndex: nextHandIndex,
          fingerIndex: 0,
          targetHand,
          controlHand: getOppositeHand(targetHand),
          targetFinger: CALIBRATION_FINGER_ORDER[0],
          rehearsal: { fist: false, pinch: false, open: false },
          acceptedHover: null,
          pendingHover: null,
          pendingTap: null,
          targetKey: null
        },
        "control-rehearsal",
        timestamp,
        `Switch roles: show control gestures with your ${getOppositeHand(targetHand).toLowerCase()} hand.`
      ),
      hoverSamples: [],
      tapSamples: []
    };
  }

  return {
    ...session,
    phase: "preview",
    phaseStartedAt: timestamp,
    previewStartedAt: timestamp,
    guidance: "Preview your calibrated feel. Use fist or Space to finish, pinch or R to retry.",
    captureStatus: "Previewing saved calibration.",
    progress: 1,
    previewMidiNote: null,
    command: emptyCommandState()
  };
}

function retryCurrentPhase(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): PlayingFeelCalibrationSession {
  if (session.phase === "finger-summary") {
    return resetForCapture(
      {
        ...session,
        acceptedHover: null,
        pendingHover: null,
        pendingTap: null,
        targetKey: null
      },
      "capture-hover",
      timestamp,
      `Redo ${session.targetFinger}: center the fingertip over a key and hold steady.`
    );
  }

  if (session.phase === "confirm-hover" || session.phase === "capture-hover") {
    return resetForCapture(
      session,
      "capture-hover",
      timestamp,
      `Retry ${session.targetFinger}: center the fingertip over a key and hold steady.`
    );
  }

  if (session.phase === "confirm-taps" || session.phase === "capture-taps") {
    return resetForCapture(
      session,
      "capture-taps",
      timestamp,
      `Retry ${session.targetFinger}: make two natural taps.`
    );
  }

  if (session.phase === "preview") {
    return resetForCapture(
      {
        ...session,
        handIndex: 0,
        fingerIndex: 0,
        targetHand: session.handQueue[0],
        controlHand: getOppositeHand(session.handQueue[0]),
        targetFinger: CALIBRATION_FINGER_ORDER[0],
        rehearsal: { fist: false, pinch: false, open: false },
        acceptedHover: null,
        pendingHover: null,
        pendingTap: null,
        summaries: emptyCalibrationSummaries()
      },
      "control-rehearsal",
      timestamp,
      "Restarting calibration preview retry."
    );
  }

  return session;
}

function canSkipCurrentFinger(session: PlayingFeelCalibrationSession): boolean {
  return (
    session.phase !== "control-rehearsal" &&
    session.phase !== "finger-summary" &&
    session.phase !== "preview" &&
    session.phase !== "paused"
  );
}

function skipCurrentFinger(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): PlayingFeelCalibrationSession {
  const skipped = withSummary(session, session.targetHand, session.targetFinger, {
    status: "Skipped",
    qualityScore: null,
    targetKey: null,
    updatedAt: timestamp
  });

  return {
    ...advanceToNextFinger(skipped, timestamp),
    guidance: `${session.targetFinger} skipped. Previous calibration is unchanged.`
  };
}

function acceptCurrentPhase(
  session: PlayingFeelCalibrationSession,
  timestamp: number,
  acceptAnyway = false
): { session: PlayingFeelCalibrationSession; commit: CalibrationCommit | null; cue: CalibrationCue | null } {
  if (session.phase === "paused") {
    const phase = session.pausedFromPhase ?? "capture-hover";
    return {
      session: {
        ...session,
        phase,
        pausedFromPhase: null,
        phaseStartedAt: timestamp,
        guidance: "Resumed calibration.",
        command: emptyCommandState()
      },
      commit: null,
      cue: "success"
    };
  }

  if (session.phase === "control-rehearsal") {
    return {
      session: resetForCapture(
        {
          ...session,
          rehearsal: { fist: true, pinch: true, open: true }
        },
        "capture-hover",
        timestamp,
        `Control rehearsal skipped. Center your ${session.targetHand.toLowerCase()} ${session.targetFinger} over a key and hold steady.`
      ),
      commit: null,
      cue: "success"
    };
  }

  if (session.phase === "confirm-hover" && session.pendingHover) {
    return {
      session: resetForCapture(
        {
          ...session,
          acceptedHover: session.pendingHover,
          targetKey: session.pendingHover.targetKey
        },
        "capture-taps",
        timestamp,
        `Tap ${session.targetFinger} naturally twice, then confirm.`
      ),
      commit: null,
      cue: "success"
    };
  }

  if (session.phase === "confirm-taps" && session.pendingTap) {
    const commit = buildCalibrationCommit(session, timestamp, acceptAnyway);
    const summarySession = withSummary(session, session.targetHand, session.targetFinger, {
      status: commit?.label ?? "Pending",
      qualityScore: session.pendingTap.qualityScore,
      targetKey: session.pendingTap.targetKey,
      updatedAt: timestamp
    });
    return {
      session: {
        ...summarySession,
        phase: "finger-summary",
        phaseStartedAt: timestamp,
        progress: 1,
        guidance: `${session.targetFinger} captured: ${commit?.label ?? "Pending"}.`,
        captureStatus: `Saved ${session.targetHand} ${session.targetFinger} on ${session.pendingTap.targetKey}.`,
        command: emptyCommandState()
      },
      commit,
      cue: "success"
    };
  }

  if (session.phase === "preview") {
    return {
      session: {
        ...session,
        active: false,
        phase: "complete",
        guidance: "Calibration complete.",
        captureStatus: "Calibration complete.",
        command: emptyCommandState()
      },
      commit: null,
      cue: "complete"
    };
  }

  if (session.phase === "finger-summary") {
    return {
      session: advanceToNextFinger(session, timestamp),
      commit: null,
      cue: "success"
    };
  }

  return { session, commit: null, cue: null };
}

export function cancelPlayingFeelCalibration(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): PlayingFeelCalibrationSession {
  return {
    ...session,
    active: false,
    phase: "idle",
    phaseStartedAt: timestamp,
    guidance: "Calibration cancelled.",
    captureStatus: "Cancelled.",
    command: emptyCommandState(),
    previewMidiNote: null
  };
}

export function acceptPlayingFeelCalibration(
  session: PlayingFeelCalibrationSession,
  timestamp: number,
  acceptAnyway = true
): CalibrationUpdateResult {
  const accepted = acceptCurrentPhase(session, timestamp, acceptAnyway);
  return {
    session: accepted.session,
    commit: accepted.commit,
    cue: accepted.cue,
    normalAudioSuppressed: accepted.session.active
  };
}

export function retryPlayingFeelCalibration(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): CalibrationUpdateResult {
  return {
    session: retryCurrentPhase(session, timestamp),
    commit: null,
    cue: "retry",
    normalAudioSuppressed: session.active
  };
}

export function skipPlayingFeelCalibrationFinger(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): CalibrationUpdateResult {
  if (!canSkipCurrentFinger(session)) {
    return {
      session,
      commit: null,
      cue: null,
      normalAudioSuppressed: session.active
    };
  }

  return {
    session: skipCurrentFinger(session, timestamp),
    commit: null,
    cue: "retry",
    normalAudioSuppressed: session.active
  };
}

function getNextHandAwaySince(
  session: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): number | null {
  const controlHandMissing = input.controlHandVisible === false;
  const targetHandMissing = input.targetSample === null;
  const shouldTrackHandAway = session.phase !== "control-rehearsal";

  if (!controlHandMissing || !targetHandMissing || !shouldTrackHandAway) {
    return null;
  }

  return session.handAwaySince ?? input.timestamp;
}

function handleControlRehearsalPhase(
  session: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): CalibrationUpdateResult {
  const gesture = session.command.stable ? session.command.rawGesture : "none";
  const rehearsal =
    gesture === "fist" || gesture === "pinch" || gesture === "open"
      ? { ...session.rehearsal, [gesture]: true }
      : session.rehearsal;
  const learnedGestureCount = Object.values(rehearsal).filter(Boolean).length;
  const complete = learnedGestureCount === 3;

  if (complete) {
    return {
      session: resetForCapture(
        { ...session, rehearsal },
        "capture-hover",
        input.timestamp,
        `Center your ${session.targetHand.toLowerCase()} ${session.targetFinger} over a key and hold steady.`
      ),
      commit: null,
      cue: "success",
      normalAudioSuppressed: true
    };
  }

  return {
    session: {
      ...session,
      rehearsal,
      guidance: "Rehearse control signs: fist accept, pinch retry, open palm pause.",
      captureStatus: `${learnedGestureCount}/3 control signs learned.`,
      progress: learnedGestureCount / 3
    },
    commit: null,
    cue: null,
    normalAudioSuppressed: true
  };
}

function handlePausedPhase(session: PlayingFeelCalibrationSession): CalibrationUpdateResult {
  return {
    session: {
      ...session,
      guidance: "Paused. Show fist in the control zone or press Space to resume."
    },
    commit: null,
    cue: null,
    normalAudioSuppressed: true
  };
}

function handleFingerSummaryPhase(
  session: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): CalibrationUpdateResult {
  if (input.timestamp - session.phaseStartedAt > 900) {
    return {
      session: advanceToNextFinger(session, input.timestamp),
      commit: null,
      cue: null,
      normalAudioSuppressed: true
    };
  }

  return {
    session,
    commit: null,
    cue: null,
    normalAudioSuppressed: true
  };
}

function getHoverCaptureGuidance(
  hover: ReturnType<typeof summarizeHoverSamples>,
  targetSample: CalibrationFrameSample | null
): string {
  if (hover) {
    return "Hover captured. Show fist to accept or pinch to retry.";
  }
  if (targetSample) {
    return "Hold steady over one key.";
  }
  return "Move the target fingertip near the keyboard.";
}

function handleCaptureHoverPhase(
  session: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): CalibrationUpdateResult {
  const hoverSamples = appendContiguousSample(
    session.hoverSamples,
    input.targetSample,
    input.timestamp,
    120
  );
  const hover = summarizeHoverSamples(hoverSamples);
  const durationProgress =
    hoverSamples.length > 0
      ? clamp(
          ((hoverSamples.at(-1)?.timestamp ?? hoverSamples[0].timestamp) - hoverSamples[0].timestamp) /
            CALIBRATION_STABILITY_THRESHOLDS.hoverMinDurationMs
        )
      : 0;
  const progress = hover
    ? 1
    : Math.min(durationProgress, hoverSamples.length / CALIBRATION_STABILITY_THRESHOLDS.hoverMinFrames);
  const nextSession: PlayingFeelCalibrationSession = {
    ...session,
    hoverSamples,
    pendingHover: hover,
    progress,
    qualityScore: hover?.qualityScore ?? null,
    targetKey: hover?.targetKey ?? input.targetSample?.nearKey ?? null,
    guidance: getHoverCaptureGuidance(hover, input.targetSample),
    captureStatus: buildHoverCaptureStatus(hoverSamples, hover, input.targetSample)
  };

  if (!hover) {
    return {
      session: nextSession,
      commit: null,
      cue: null,
      normalAudioSuppressed: true
    };
  }

  return {
    session: {
      ...nextSession,
      phase: "confirm-hover",
      phaseStartedAt: input.timestamp,
      command: emptyCommandState()
    },
    commit: null,
    cue: null,
    normalAudioSuppressed: true
  };
}

function getTapPreviewMidiNote(
  session: PlayingFeelCalibrationSession,
  targetSample: CalibrationFrameSample | null
): number | null {
  if (!session.acceptedHover || !targetSample) {
    return null;
  }

  const sameResolvedKey = getSampleResolvedKey(targetSample) === session.acceptedHover.targetKey;
  const exceededExcursion =
    Math.abs(targetSample.weightedDepth - session.acceptedHover.weightedDepth) >
    getTapExcursionThreshold(session.acceptedHover);
  return sameResolvedKey && exceededExcursion ? targetSample.midiNote : null;
}

function getCaptureTapGuidance(
  tap: ReturnType<typeof summarizeTapSamples>,
  cycles: number,
  timedOut: boolean
): string {
  if (tap) {
    return getTapConfirmationGuidance(tap, cycles);
  }
  if (timedOut) {
    return "Tap capture timed out. Pinch or press R to retry.";
  }
  return "Press and lift naturally twice.";
}

function handleCaptureTapsPhase(
  session: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): CalibrationUpdateResult {
  const tapSamples = appendContiguousSample(
    session.tapSamples,
    input.targetSample,
    input.timestamp,
    520
  );
  const tap = session.acceptedHover ? summarizeTapSamples(tapSamples, session.acceptedHover) : null;
  const cycles = session.acceptedHover ? detectTapCycles(tapSamples, session.acceptedHover).length : 0;
  const timedOut = input.timestamp - session.phaseStartedAt > CALIBRATION_STABILITY_THRESHOLDS.tapTimeoutMs;
  const nextSession: PlayingFeelCalibrationSession = {
    ...session,
    tapSamples,
    pendingTap: tap,
    progress: tap ? 1 : clamp(cycles / CALIBRATION_STABILITY_THRESHOLDS.tapMinCycles),
    qualityScore: tap?.qualityScore ?? null,
    previewMidiNote: getTapPreviewMidiNote(session, input.targetSample),
    guidance: getCaptureTapGuidance(tap, cycles, timedOut),
    captureStatus: buildTapCaptureStatus(
      cycles,
      session.acceptedHover,
      input.targetSample,
      input.timestamp,
      session.phaseStartedAt
    )
  };

  if (!tap) {
    return {
      session: nextSession,
      commit: null,
      cue: null,
      normalAudioSuppressed: true
    };
  }

  return {
    session: {
      ...nextSession,
      phase: "confirm-taps",
      phaseStartedAt: input.timestamp,
      command: emptyCommandState()
    },
    commit: null,
    cue: null,
    normalAudioSuppressed: true
  };
}

function maybeHandleCommandTransition(
  session: PlayingFeelCalibrationSession,
  timestamp: number
): CalibrationUpdateResult | null {
  if (session.phase !== "control-rehearsal" && session.command.command === "retry") {
    return retryPlayingFeelCalibration(session, timestamp);
  }

  if (canSkipCurrentFinger(session) && session.command.command === "skip") {
    return skipPlayingFeelCalibrationFinger(session, timestamp);
  }

  if (session.phase === "control-rehearsal" || session.command.command !== "accept") {
    return null;
  }

  const weakTapPending =
    session.phase === "confirm-taps" &&
    session.pendingTap !== null &&
    session.pendingTap.qualityScore < CALIBRATION_QUALITY_THRESHOLDS.weak;
  const allowAcceptAnyway =
    weakTapPending && session.command.elapsedMs >= CONTROL_GESTURE_THRESHOLDS.longHoldMs;
  if (!weakTapPending || allowAcceptAnyway) {
    return acceptPlayingFeelCalibration(session, timestamp, allowAcceptAnyway);
  }

  return null;
}

export function updatePlayingFeelCalibrationSession(
  current: PlayingFeelCalibrationSession,
  input: CalibrationUpdateInput
): CalibrationUpdateResult {
  if (!current.active) {
    return {
      session: current,
      commit: null,
      cue: null,
      normalAudioSuppressed: false
    };
  }

  const session = {
    ...current,
    command: updateCommandState(
      current.command,
      input.controlGesture,
      input.timestamp,
      input.controlInsideZone
    ),
    roleAmbiguousSince: input.roleAmbiguous
      ? current.roleAmbiguousSince ?? input.timestamp
      : null,
    handAwaySince: getNextHandAwaySince(current, input)
  };

  const commandTransition = maybeHandleCommandTransition(session, input.timestamp);
  if (commandTransition) {
    return commandTransition;
  }

  if (
    session.roleAmbiguousSince !== null &&
    input.timestamp - session.roleAmbiguousSince >= CONTROL_GESTURE_THRESHOLDS.roleAmbiguousPauseMs
  ) {
    return {
      session: {
        ...session,
        phase: "paused",
        pausedFromPhase: current.phase,
        guidance: "Paused: hand roles became ambiguous. Separate your hands, then show fist to resume.",
        command: emptyCommandState()
      },
      commit: null,
      cue: "pause",
      normalAudioSuppressed: true
    };
  }

  if (
    session.handAwaySince !== null &&
    input.timestamp - session.handAwaySince >= CONTROL_GESTURE_THRESHOLDS.handAwayPauseMs
  ) {
    return {
      session: {
        ...session,
        phase: "paused",
        pausedFromPhase: current.phase,
        guidance: "Paused: control hand is away. Return it to the control zone and show fist to resume.",
        command: emptyCommandState()
      },
      commit: null,
      cue: "pause",
      normalAudioSuppressed: true
    };
  }

  if (
    session.phase !== "control-rehearsal" &&
    session.command.command === "pause" &&
    session.phase !== "paused"
  ) {
    return {
      session: {
        ...session,
        phase: "paused",
        pausedFromPhase: current.phase,
        guidance: "Paused. Show fist or press Space to resume.",
        command: emptyCommandState()
      },
      commit: null,
      cue: "pause",
      normalAudioSuppressed: true
    };
  }

  if (session.phase === "control-rehearsal") {
    return handleControlRehearsalPhase(session, input);
  }

  if (session.phase === "paused") {
    return handlePausedPhase(session);
  }

  if (session.phase === "finger-summary") {
    return handleFingerSummaryPhase(session, input);
  }

  if (session.phase === "capture-hover") {
    return handleCaptureHoverPhase(session, input);
  }

  if (session.phase === "capture-taps") {
    return handleCaptureTapsPhase(session, input);
  }

  return {
    session,
    commit: null,
    cue: null,
    normalAudioSuppressed: session.active
  };
}
