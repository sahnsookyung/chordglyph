import { initialInteractionState } from "../../src/lib/interactionMachine";
import { createIdleCalibrationSession } from "../../src/lib/playingFeelCalibration";
import { DEFAULT_SETTINGS } from "../../src/lib/constants";
import type { InstrumentViewState } from "../../src/hooks/useGestureInstrument";
import type {
  AudioStatus,
  Handedness,
  InstrumentSettings,
  Landmark,
  TrackedHand
} from "../../src/lib/types";

function makeLandmark(x: number, y: number, z = 0): Landmark {
  return { x, y, z };
}

export function makeTrackedHand(
  id: string,
  handedness: Handedness,
  confidence = 0.9
): TrackedHand {
  return {
    id,
    handedness,
    confidence,
    landmarks: Array.from({ length: 21 }, (_, index) => makeLandmark(0.1 + index * 0.01, 0.2, 0))
  };
}

export function makeViewState(
  overrides: Partial<InstrumentViewState> = {},
  settingsOverrides: Partial<InstrumentSettings> = {}
): InstrumentViewState {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...settingsOverrides
  };

  return {
    trackerStatus: "ready",
    error: null,
    armed: false,
    audioStatus: "idle" satisfies AudioStatus,
    settings,
    interaction: initialInteractionState,
    overlayHands: [],
    noteCursor: null,
    noteTrace: [],
    fps: 30,
    latencyMs: 14,
    devices: [],
    audioOutputDevices: [],
    audioOutputRoutingSupported: true,
    currentRootLabel: null,
    currentChordLabel: "C",
    currentModeLabel: settings.playMode === "circle" ? "Circle" : "Piano",
    logCount: 0,
    warnings: [],
    startupNotice: null,
    audioOutputNotice: null,
    debug: {
      visibleHands: 0,
      leftHand: null,
      rightHand: null,
      focusTipLabel: null,
      focusTipRawX: null,
      focusTipProjectedX: null,
      touchDepth: { Left: null, Right: null },
      depthGate: settings.depthGate,
      activeNotes: [],
      touchTips: 0,
      activeSemitone: null,
      fingerDepthSamples: {
        Left: { thumb: null, index: null, middle: null, ring: null, pinky: null },
        Right: { thumb: null, index: null, middle: null, ring: null, pinky: null }
      },
      fingerDepthSamplesFresh: {
        Left: { thumb: false, index: false, middle: false, ring: false, pinky: false },
        Right: { thumb: false, index: false, middle: false, ring: false, pinky: false }
      }
    },
    activeNaturalZones: [],
    activeSharpZones: [],
    activeTouchMarkers: [],
    activeCircleSegments: { Left: [], Right: [] },
    activeCircleMarkers: [],
    calibrationSession: createIdleCalibrationSession(),
    ...overrides
  };
}
