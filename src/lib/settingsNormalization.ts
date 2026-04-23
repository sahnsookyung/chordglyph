import { DEFAULT_SETTINGS, MAX_PIANO_OCTAVES, MIN_PIANO_OCTAVES } from "./constants";
import {
  createFingerActivationTuning,
  createFingerActivationTuningMap,
  createHandedFingerActivationTuning,
  createHandedFingerDepthSensitivity,
  createHandedNumberMap,
  createHandedTouchCalibration
} from "./calibration";
import type {
  CalibrationAudioMode,
  CircleFingerEnabledMap,
  FingerActivationTuning,
  FingerActivationTuningMap,
  FingerDepthSensitivityMap,
  FingerTouchCalibrationMap,
  HandedBooleanMap,
  HandedCircleFingerEnabled,
  HandedFingerActivationTuning,
  HandedNumberMap,
  HandedTouchCalibration,
  InstrumentSettings,
  NoteLabelStyle,
  NoteStripSize,
  PlayMode,
  SynthPatch,
  TouchCalibrationDirection,
  TouchCalibrationPoint,
  TrackerBackendKind
} from "./types";

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableFiniteNumber(value: unknown, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  return clampNumber(Math.round(asFiniteNumber(value, fallback)), min, max);
}

function normalizeCircleFingerEnabledMap(
  value: unknown,
  fallback: CircleFingerEnabledMap
): CircleFingerEnabledMap {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    thumb: asBoolean(raw.thumb, fallback.thumb),
    index: asBoolean(raw.index, fallback.index),
    middle: asBoolean(raw.middle, fallback.middle),
    ring: asBoolean(raw.ring, fallback.ring),
    pinky: asBoolean(raw.pinky, fallback.pinky)
  };
}

function normalizeHandedCircleFingerEnabled(
  value: unknown,
  fallback: HandedCircleFingerEnabled
): HandedCircleFingerEnabled {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    Left: normalizeCircleFingerEnabledMap(raw.Left, fallback.Left),
    Right: normalizeCircleFingerEnabledMap(raw.Right, fallback.Right)
  };
}

function normalizeHandedBooleanMap(
  value: unknown,
  fallback: HandedBooleanMap
): HandedBooleanMap {
  if (typeof value === "boolean") {
    return {
      Left: value,
      Right: value
    };
  }

  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    Left: asBoolean(raw.Left, fallback.Left),
    Right: asBoolean(raw.Right, fallback.Right)
  };
}

function normalizeSingleFingerSensitivity(
  value: unknown,
  fallback: FingerDepthSensitivityMap
): FingerDepthSensitivityMap {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    thumb: clampNumber(asFiniteNumber(raw.thumb, fallback.thumb), 0, 10),
    index: clampNumber(asFiniteNumber(raw.index, fallback.index), 0, 10),
    middle: clampNumber(asFiniteNumber(raw.middle, fallback.middle), 0, 10),
    ring: clampNumber(asFiniteNumber(raw.ring, fallback.ring), 0, 10),
    pinky: clampNumber(asFiniteNumber(raw.pinky, fallback.pinky), 0, 10)
  };
}

function normalizeHandedNumberMap(value: unknown, fallback: HandedNumberMap): HandedNumberMap {
  if (typeof value === "number" && Number.isFinite(value)) {
    return createHandedNumberMap(value);
  }

  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    Left: asFiniteNumber(raw.Left, fallback.Left),
    Right: asFiniteNumber(raw.Right, fallback.Right)
  };
}

function normalizeClampedHandedNumberMap(
  value: unknown,
  fallback: HandedNumberMap,
  min: number,
  max: number
): HandedNumberMap {
  const normalized = normalizeHandedNumberMap(value, fallback);
  return {
    Left: clampNumber(normalized.Left, min, max),
    Right: clampNumber(normalized.Right, min, max)
  };
}

function normalizeTouchCalibrationPoint(
  value: unknown,
  fallback: TouchCalibrationPoint
): TouchCalibrationPoint {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const hoverDepth =
    typeof raw.hoverDepth === "number" && Number.isFinite(raw.hoverDepth)
      ? raw.hoverDepth
      : fallback.hoverDepth;
  const pressDepth =
    typeof raw.pressDepth === "number" && Number.isFinite(raw.pressDepth)
      ? raw.pressDepth
      : fallback.pressDepth;
  const rawHoverDepth = asNullableFiniteNumber(raw.rawHoverDepth, fallback.rawHoverDepth);
  const rawPressDepth = asNullableFiniteNumber(raw.rawPressDepth, fallback.rawPressDepth);
  const rawDirection =
    rawHoverDepth !== null && rawPressDepth !== null
      ? rawPressDepth >= rawHoverDepth
        ? 1
        : -1
      : hoverDepth !== null && pressDepth !== null
      ? pressDepth >= hoverDepth
        ? 1
        : -1
      : raw.direction === -1 || raw.direction === 1
        ? (raw.direction as TouchCalibrationDirection)
        : fallback.direction;

  return {
    hoverDepth,
    pressDepth,
    rawHoverDepth,
    rawPressDepth,
    sensitivityAtCalibration: asNullableFiniteNumber(
      raw.sensitivityAtCalibration,
      fallback.sensitivityAtCalibration
    ),
    direction: rawDirection,
    targetKey: typeof raw.targetKey === "string" ? raw.targetKey : fallback.targetKey,
    qualityScore: asNullableFiniteNumber(raw.qualityScore, fallback.qualityScore),
    noiseFloor: asNullableFiniteNumber(raw.noiseFloor, fallback.noiseFloor),
    pressDelta: asNullableFiniteNumber(raw.pressDelta, fallback.pressDelta),
    pressVelocity: asNullableFiniteNumber(raw.pressVelocity, fallback.pressVelocity),
    releaseVelocity: asNullableFiniteNumber(raw.releaseVelocity, fallback.releaseVelocity),
    sampleCount: Math.max(0, asFiniteNumber(raw.sampleCount, fallback.sampleCount)),
    updatedAt: asNullableFiniteNumber(raw.updatedAt, fallback.updatedAt)
  };
}

function normalizeFingerTouchCalibrationMap(
  value: unknown,
  fallback: FingerTouchCalibrationMap
): FingerTouchCalibrationMap {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return {
    thumb: normalizeTouchCalibrationPoint(raw.thumb, fallback.thumb),
    index: normalizeTouchCalibrationPoint(raw.index, fallback.index),
    middle: normalizeTouchCalibrationPoint(raw.middle, fallback.middle),
    ring: normalizeTouchCalibrationPoint(raw.ring, fallback.ring),
    pinky: normalizeTouchCalibrationPoint(raw.pinky, fallback.pinky)
  };
}

function normalizeHandedTouchCalibration(
  value: unknown,
  fallback: HandedTouchCalibration
): HandedTouchCalibration {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return createHandedTouchCalibration(
    normalizeFingerTouchCalibrationMap(raw.Left, fallback.Left),
    normalizeFingerTouchCalibrationMap(raw.Right, fallback.Right)
  );
}

function normalizeFingerActivationTuning(
  value: unknown,
  fallback: FingerActivationTuning
): FingerActivationTuning {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return createFingerActivationTuning({
    hardActivationThreshold: clampNumber(
      asFiniteNumber(raw.hardActivationThreshold, fallback.hardActivationThreshold),
      0,
      1
    ),
    pressActivationThreshold: clampNumber(
      asFiniteNumber(raw.pressActivationThreshold, fallback.pressActivationThreshold),
      0,
      1
    ),
    releaseActivationThreshold: clampNumber(
      asFiniteNumber(raw.releaseActivationThreshold, fallback.releaseActivationThreshold),
      0,
      1
    ),
    touchDwellMs: clampNumber(asFiniteNumber(raw.touchDwellMs, fallback.touchDwellMs), 0, 200),
    pressVelocityThreshold: clampNumber(
      asFiniteNumber(raw.pressVelocityThreshold, fallback.pressVelocityThreshold),
      0,
      999
    ),
    releaseVelocityThreshold: clampNumber(
      asFiniteNumber(raw.releaseVelocityThreshold, fallback.releaseVelocityThreshold),
      0,
      60
    ),
    activationVelocitySmoothing: clampNumber(
      asFiniteNumber(raw.activationVelocitySmoothing, fallback.activationVelocitySmoothing),
      0.05,
      1
    )
  });
}

function normalizeFingerActivationTuningMap(
  value: unknown,
  fallback: FingerActivationTuningMap
): FingerActivationTuningMap {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  return createFingerActivationTuningMap({
    thumb: normalizeFingerActivationTuning(raw.thumb, fallback.thumb),
    index: normalizeFingerActivationTuning(raw.index, fallback.index),
    middle: normalizeFingerActivationTuning(raw.middle, fallback.middle),
    ring: normalizeFingerActivationTuning(raw.ring, fallback.ring),
    pinky: normalizeFingerActivationTuning(raw.pinky, fallback.pinky)
  });
}

function normalizeHandedFingerActivationTuning(
  value: unknown,
  fallback: HandedFingerActivationTuning
): HandedFingerActivationTuning {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return createHandedFingerActivationTuning(
    normalizeFingerActivationTuningMap(raw.Left, fallback.Left),
    normalizeFingerActivationTuningMap(raw.Right, fallback.Right)
  );
}

export function normalizeInstrumentSettings(value: unknown): InstrumentSettings {
  const persisted =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const persistedFingerSensitivity =
    typeof persisted.fingerDepthSensitivity === "object" &&
    persisted.fingerDepthSensitivity !== null
      ? (persisted.fingerDepthSensitivity as Record<string, unknown>)
      : {};
  const hasPerHandFingerSensitivity =
    typeof persistedFingerSensitivity.Left === "object" ||
    typeof persistedFingerSensitivity.Right === "object";
  const sharedFingerSensitivity = normalizeSingleFingerSensitivity(
    persistedFingerSensitivity,
    DEFAULT_SETTINGS.fingerDepthSensitivity.Right
  );
  const handedFingerSensitivity = hasPerHandFingerSensitivity
    ? createHandedFingerDepthSensitivity(
        normalizeSingleFingerSensitivity(
          persistedFingerSensitivity.Left,
          DEFAULT_SETTINGS.fingerDepthSensitivity.Left
        ),
        normalizeSingleFingerSensitivity(
          persistedFingerSensitivity.Right,
          DEFAULT_SETTINGS.fingerDepthSensitivity.Right
        )
      )
    : createHandedFingerDepthSensitivity(sharedFingerSensitivity, sharedFingerSensitivity);
  const hardActivationThreshold = normalizeClampedHandedNumberMap(
    persisted.hardActivationThreshold ?? persisted.touchHardThreshold,
    DEFAULT_SETTINGS.hardActivationThreshold,
    0,
    1
  );
  const pressActivationThreshold = normalizeClampedHandedNumberMap(
    persisted.pressActivationThreshold ?? persisted.touchEntryThreshold,
    DEFAULT_SETTINGS.pressActivationThreshold,
    0,
    1
  );
  const releaseActivationThreshold = normalizeClampedHandedNumberMap(
    persisted.releaseActivationThreshold ?? persisted.touchReleaseThreshold,
    DEFAULT_SETTINGS.releaseActivationThreshold,
    0,
    1
  );
  const touchDwellMs = normalizeHandedNumberMap(
    persisted.touchDwellMs,
    DEFAULT_SETTINGS.touchDwellMs
  );
  const pressVelocityThreshold = normalizeClampedHandedNumberMap(
    persisted.pressVelocityThreshold,
    DEFAULT_SETTINGS.pressVelocityThreshold,
    0,
    999
  );
  const releaseVelocityThreshold = normalizeClampedHandedNumberMap(
    persisted.releaseVelocityThreshold,
    DEFAULT_SETTINGS.releaseVelocityThreshold,
    0,
    60
  );
  const activationVelocitySmoothing = normalizeClampedHandedNumberMap(
    persisted.activationVelocitySmoothing,
    DEFAULT_SETTINGS.activationVelocitySmoothing,
    0.05,
    1
  );
  const activationFallback = createHandedFingerActivationTuning(
    undefined,
    undefined,
    {
      hardActivationThreshold: hardActivationThreshold.Left,
      pressActivationThreshold: pressActivationThreshold.Left,
      releaseActivationThreshold: releaseActivationThreshold.Left,
      touchDwellMs: touchDwellMs.Left,
      pressVelocityThreshold: pressVelocityThreshold.Left,
      releaseVelocityThreshold: releaseVelocityThreshold.Left,
      activationVelocitySmoothing: activationVelocitySmoothing.Left
    },
    {
      hardActivationThreshold: hardActivationThreshold.Right,
      pressActivationThreshold: pressActivationThreshold.Right,
      releaseActivationThreshold: releaseActivationThreshold.Right,
      touchDwellMs: touchDwellMs.Right,
      pressVelocityThreshold: pressVelocityThreshold.Right,
      releaseVelocityThreshold: releaseVelocityThreshold.Right,
      activationVelocitySmoothing: activationVelocitySmoothing.Right
    }
  );

  return {
    playMode: asOneOf<PlayMode>(
      persisted.playMode,
      ["piano", "circle"],
      DEFAULT_SETTINGS.playMode
    ),
    noteStripSize: asOneOf<NoteStripSize>(
      persisted.noteStripSize,
      ["compact", "normal", "large"],
      DEFAULT_SETTINGS.noteStripSize
    ),
    labelStyle: asOneOf<NoteLabelStyle>(
      persisted.labelStyle,
      ["sharps", "flats"],
      DEFAULT_SETTINGS.labelStyle
    ),
    depthGate: normalizeHandedNumberMap(persisted.depthGate, DEFAULT_SETTINGS.depthGate),
    fingerDepthSensitivity: handedFingerSensitivity,
    touchCalibration: normalizeHandedTouchCalibration(
      persisted.touchCalibration,
      DEFAULT_SETTINGS.touchCalibration
    ),
    activationTuning: normalizeHandedFingerActivationTuning(
      persisted.activationTuning,
      activationFallback
    ),
    hardActivationThreshold,
    pressActivationThreshold,
    releaseActivationThreshold,
    touchDwellMs,
    pressVelocityThreshold,
    releaseVelocityThreshold,
    activationVelocitySmoothing,
    trackingSensitivity: asFiniteNumber(
      persisted.trackingSensitivity,
      DEFAULT_SETTINGS.trackingSensitivity
    ),
    overlayThickness: asFiniteNumber(
      persisted.overlayThickness,
      DEFAULT_SETTINGS.overlayThickness
    ),
    pianoVerticalOffset: asFiniteNumber(
      persisted.pianoVerticalOffset,
      DEFAULT_SETTINGS.pianoVerticalOffset
    ),
    pianoHeightScale: asFiniteNumber(
      persisted.pianoHeightScale,
      DEFAULT_SETTINGS.pianoHeightScale
    ),
    pianoWidthScale: asFiniteNumber(
      persisted.pianoWidthScale,
      DEFAULT_SETTINGS.pianoWidthScale
    ),
    pianoOctaves: normalizeInteger(
      persisted.pianoOctaves,
      DEFAULT_SETTINGS.pianoOctaves,
      MIN_PIANO_OCTAVES,
      MAX_PIANO_OCTAVES
    ),
    pianoOpacity: asFiniteNumber(persisted.pianoOpacity, DEFAULT_SETTINGS.pianoOpacity),
    showHitBoxes: asBoolean(persisted.showHitBoxes, DEFAULT_SETTINGS.showHitBoxes),
    hitBoxColor: asString(persisted.hitBoxColor, DEFAULT_SETTINGS.hitBoxColor),
    lowLatencyMode: asBoolean(persisted.lowLatencyMode, DEFAULT_SETTINGS.lowLatencyMode),
    volume: asFiniteNumber(persisted.volume, DEFAULT_SETTINGS.volume),
    synthPatch: asOneOf<SynthPatch>(
      persisted.synthPatch,
      ["soft-keys", "warm-pad"],
      DEFAULT_SETTINGS.synthPatch
    ),
    showDebugOverlays: asBoolean(
      persisted.showDebugOverlays,
      DEFAULT_SETTINGS.showDebugOverlays
    ),
    showFingertipStats: asBoolean(
      persisted.showFingertipStats,
      DEFAULT_SETTINGS.showFingertipStats
    ),
    circleFingerEnabled: normalizeHandedCircleFingerEnabled(
      persisted.circleFingerEnabled,
      DEFAULT_SETTINGS.circleFingerEnabled
    ),
    circleOfFifths: normalizeHandedBooleanMap(
      persisted.circleOfFifths,
      DEFAULT_SETTINGS.circleOfFifths
    ),
    deviceId: asString(persisted.deviceId, DEFAULT_SETTINGS.deviceId),
    audioOutputDeviceId: asString(
      persisted.audioOutputDeviceId,
      DEFAULT_SETTINGS.audioOutputDeviceId
    ),
    trackingBackend: asOneOf<TrackerBackendKind>(
      persisted.trackingBackend,
      ["mediapipe-hands", "mediapipe-hands-worker", "yolo-pose", "openpose"],
      DEFAULT_SETTINGS.trackingBackend
    ),
    calibrationAudioMode: asOneOf<CalibrationAudioMode>(
      persisted.calibrationAudioMode,
      ["off", "cues", "target-preview"],
      DEFAULT_SETTINGS.calibrationAudioMode
    )
  };
}
