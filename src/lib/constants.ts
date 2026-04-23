import {
  createHandedFingerActivationTuning,
  createHandedFingerDepthSensitivity,
  createHandedNumberMap,
  createHandedTouchCalibration
} from "./calibration";
import type { InstrumentSettings } from "./types";

export const NOTE_NAMES_SHARPS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
  "C"
] as const;

export const NOTE_NAMES_FLATS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
  "C"
] as const;

const NATURAL_OCTAVE = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_OCTAVE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;
const SHARP_CAPABLE_OFFSETS = [0, 1, 3, 4, 5] as const;

export const VISIBLE_NATURAL_NOTE_NAMES = [
  ...Array.from({ length: 4 }, () => NATURAL_OCTAVE).flat(),
  "C"
] as const;
export const NATURAL_NOTE_TO_SEMITONE = [
  ...Array.from({ length: 4 }, (_, octave) =>
    NATURAL_OCTAVE_SEMITONES.map((semitone) => semitone + octave * 12)
  ).flat(),
  48
] as const;
export const SHARP_CAPABLE_NATURAL_INDEXES = Array.from({ length: 4 }, (_, octave) =>
  SHARP_CAPABLE_OFFSETS.map((offset) => offset + octave * 7)
).flat() as number[];

export const NOTE_COUNT = VISIBLE_NATURAL_NOTE_NAMES.length;

export const DEFAULT_SETTINGS: InstrumentSettings = {
  noteStripSize: "large",
  labelStyle: "sharps",
  depthGate: createHandedNumberMap(0.02),
  fingerDepthSensitivity: createHandedFingerDepthSensitivity(),
  touchCalibration: createHandedTouchCalibration(),
  activationTuning: createHandedFingerActivationTuning(),
  hardActivationThreshold: createHandedNumberMap(0.82),
  pressActivationThreshold: createHandedNumberMap(0.55),
  releaseActivationThreshold: createHandedNumberMap(0.35),
  touchDwellMs: createHandedNumberMap(12),
  pressVelocityThreshold: createHandedNumberMap(999),
  releaseVelocityThreshold: createHandedNumberMap(5),
  activationVelocitySmoothing: createHandedNumberMap(0.35),
  trackingSensitivity: 0.7,
  overlayThickness: 0.8,
  pianoVerticalOffset: 0,
  pianoHeightScale: 1.15,
  pianoWidthScale: 1,
  pianoOpacity: 0.8,
  showHitBoxes: false,
  hitBoxColor: "#f97316",
  volume: -10,
  synthPatch: "soft-keys",
  showDebugOverlays: true,
  deviceId: "",
  audioOutputDeviceId: "",
  trackingBackend: "mediapipe-hands",
  calibrationAudioMode: "target-preview"
};

export const CALIBRATION_QUALITY_THRESHOLDS = {
  weak: 0.45,
  good: 0.65
} as const;

export const CALIBRATION_STABILITY_THRESHOLDS = {
  hoverMinFrames: 24,
  hoverMinDurationMs: 800,
  hoverMaxXyStdDev: 0.018,
  hoverMaxDepthStdDev: 0.0015,
  tapMinCycles: 2,
  tapTimeoutMs: 15000,
  sampleGapResetMs: 260,
  hoverAcquisitionMargin: 0.025
} as const;

export const CONTROL_GESTURE_THRESHOLDS = {
  stableMs: 650,
  longHoldMs: 1500,
  handAwayPauseMs: 2000,
  roleAmbiguousPauseMs: 300,
  fistness: 0.52,
  openness: 0.56,
  pinch: 0.72
} as const;

export const TRACKING_THRESHOLDS = {
  noteConfidence: 0.45,
  chordConfidence: 0.45,
  chordPersistenceMs: 80,
  ambiguityTimeoutMs: 320,
  noteLossMs: 150,
  chordLossMs: 220,
  dwellMs: 70,
  cooldownMs: 90,
  confidenceMargin: 0.12,
  hysteresisRatio: 0.1
} as const;
