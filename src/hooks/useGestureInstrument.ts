import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject
} from "react";
import { averageHandX } from "../lib/assignment";
import { CALIBRATION_STABILITY_THRESHOLDS, DEFAULT_SETTINGS } from "../lib/constants";
import { extractHandFeatures } from "../lib/featureExtraction";
import { ema, lerp } from "../lib/geometry";
import { initialInteractionState, type InteractionState } from "../lib/interactionMachine";
import { SessionLogger } from "../lib/logger";
import {
  buildVoicing,
  describeChord,
  describeRootSemitone,
  getNaturalKeyCount,
  getRootMidi,
  naturalZoneToSemitone
} from "../lib/music";
import { getStripBounds, projectToNoteStripX } from "../lib/noteMapping";
import {
  emptyHandedFingerDepthSamples,
  emptyHandedTouchDepthMap,
  getCalibrationDepthScore,
  getCalibrationFingerSamples,
  recordFingerDepthSample,
  type CalibrationTouchSample
} from "../lib/calibration";
import {
  calibrateFingerDepthSensitivity,
  calibrateSingleFingerDepthSensitivity,
  deriveTouchCalibrationDirection,
  getActivationVelocity,
  getEffectiveDepthScore,
  getTouchActivation,
  shouldPressTouch,
  tipIndexToFingerName
} from "../lib/touchModel";
import {
  getPianoLayout,
  PLAYABLE_FINGERTIP_INDEXES,
  resolveActiveTouchState,
  resolveBlackKeyHit,
  resolveWhiteKeyHit,
  type PianoLayout
} from "../lib/pianoLayout";
import {
  listAudioOutputDevices,
  supportsExplicitAudioOutputRouting
} from "../lib/audioDevices";
import {
  classifyCircleChordQuality,
  getCircleLayout,
  getCircleRootSemitone,
  resolveCircleSegment
} from "../lib/circleMode";
import { loadInstrumentSettings, saveInstrumentSettings } from "../lib/settingsStore";
import { emptyStableHandSlots, resolveStableHandedness } from "../lib/stableHandedness";
import {
  acceptPlayingFeelCalibration,
  cancelPlayingFeelCalibration,
  classifyCalibrationControlGesture,
  createIdleCalibrationSession,
  getOppositeHand,
  isPalmInsideControlZone,
  retryPlayingFeelCalibration,
  skipPlayingFeelCalibrationFinger,
  startPlayingFeelCalibration,
  updatePlayingFeelCalibrationSession,
  type CalibrationFrameSample,
  type CalibrationCommit,
  type PlayingFeelCalibrationSession
} from "../lib/playingFeelCalibration";
import { createTrackerBackend, listVideoDevices, type HandTrackerBackend } from "../lib/trackerBackend";
import type {
  AudioStatus,
  CalibrationScope,
  ChordMode,
  FingertipName,
  HandedFingerDepthSamples,
  HandedNumberMap,
  HandedTouchDepthMap,
  Handedness,
  InstrumentSettings,
  SessionLogEvent,
  TouchCalibrationPoint,
  TrackerFrame,
  TrackedHand
} from "../lib/types";
import type { AudioEngine } from "../lib/audioEngine";

type TrackerStatus = "idle" | "loading" | "ready" | "error";

const MANUAL_TOUCH_SAMPLE_MAX_AGE_MS = 450;
const RENDER_FRAME_INTERVAL_MS = 50;
const TRACKING_DROP_LOG_INTERVAL_MS = 1000;
const SETTINGS_SAVE_DEBOUNCE_MS = 350;
type FingerSampleFreshnessMap = Record<FingertipName, boolean>;
type HandedFingerSampleFreshness = Record<Handedness, FingerSampleFreshnessMap>;

interface NoteCursorPoint {
  x: number;
  y: number;
}

interface DebugHandInfo {
  id: string;
  handedness: string;
  confidence: number;
  avgX: number;
}

interface InstrumentDebugState {
  visibleHands: number;
  leftHand: DebugHandInfo | null;
  rightHand: DebugHandInfo | null;
  focusTipLabel: string | null;
  focusTipRawX: number | null;
  focusTipProjectedX: number | null;
  touchDepth: HandedTouchDepthMap;
  depthGate: HandedNumberMap;
  activeNotes: string[];
  touchTips: number;
  activeSemitone: number | null;
  fingerDepthSamples: HandedFingerDepthSamples;
  fingerDepthSamplesFresh: HandedFingerSampleFreshness;
}

interface ActiveTouchMarker {
  handId: string;
  stableHandedness: Handedness;
  tipIndex: (typeof PLAYABLE_FINGERTIP_INDEXES)[number];
  source: "piano" | "circle";
  modelZ: number;
  rawDepthScore: number;
  sensitivity: number;
  depthScore: number;
  activationProgress: number;
  activationVelocity: number;
  isCalibrated: boolean;
  isPressed: boolean;
}

interface ActiveCircleMarker {
  handId: string;
  stableHandedness: Handedness;
  finger: FingertipName;
  tipIndex: (typeof PLAYABLE_FINGERTIP_INDEXES)[number];
  segment: number;
  rootSemitone: number;
  chordMode: ChordMode;
  label: string;
}

interface TipIntentMemory {
  timestamp: number;
  y: number;
  effectiveDepthScore: number;
  activation: number;
  activationVelocity: number;
  candidateKey: string | null;
  stableMs: number;
  pressed: boolean;
}

function getPreviousWhiteZone(candidateKey: string | null | undefined): number | null {
  if (!candidateKey?.startsWith("white:")) {
    return null;
  }

  const zone = Number(candidateKey.slice("white:".length));
  return Number.isFinite(zone) ? zone : null;
}

const FINGER_NAME_TO_TIP_INDEX: Record<FingertipName, 4 | 8 | 12 | 16 | 20> = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20
};

function keyToMidiNote(candidateKey: string | null, octaveCount: number): number | null {
  if (!candidateKey) {
    return null;
  }

  const [kind, rawZone] = candidateKey.split(":");
  const zone = Number(rawZone);
  if (!Number.isFinite(zone)) {
    return null;
  }

  return getRootMidi(naturalZoneToSemitone(zone, kind === "black", octaveCount));
}

function resolvePianoKeyAt(
  projectedX: number | null,
  y: number,
  layout: PianoLayout,
  previousKey: string | null = null
): string | null {
  if (projectedX === null) {
    return null;
  }

  const blackZone = resolveBlackKeyHit(projectedX, y, layout);
  if (blackZone !== null) {
    return `black:${blackZone}`;
  }

  const whiteZone = resolveWhiteKeyHit(
    projectedX,
    y,
    layout,
    getPreviousWhiteZone(previousKey)
  );
  return whiteZone !== null ? `white:${whiteZone}` : null;
}

export interface InstrumentViewState {
  trackerStatus: TrackerStatus;
  error: string | null;
  armed: boolean;
  audioStatus: AudioStatus;
  settings: InstrumentSettings;
  interaction: InteractionState;
  overlayHands: Array<{ hand: TrackedHand; role: "note" | "chord" | "other" }>;
  noteCursor: NoteCursorPoint | null;
  noteTrace: NoteCursorPoint[];
  fps: number;
  latencyMs: number;
  devices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  audioOutputRoutingSupported: boolean;
  currentRootLabel: string | null;
  currentChordLabel: string;
  currentModeLabel: string;
  logCount: number;
  warnings: string[];
  startupNotice: string | null;
  audioOutputNotice: string | null;
  debug: InstrumentDebugState;
  activeNaturalZones: number[];
  activeSharpZones: number[];
  activeTouchMarkers: ActiveTouchMarker[];
  activeCircleSegments: Record<Handedness, number[]>;
  activeCircleMarkers: ActiveCircleMarker[];
  calibrationSession: PlayingFeelCalibrationSession;
}

function downloadJsonFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function appendLog(logger: SessionLogger, event: SessionLogEvent): number {
  logger.push(event);
  return logger.length();
}

function toDebugHandInfo(hand: TrackedHand | null): DebugHandInfo | null {
  if (!hand) {
    return null;
  }

  return {
    id: hand.id,
    handedness: hand.handedness,
    confidence: hand.confidence,
    avgX: averageHandX(hand)
  };
}

function restorePreCalibrationFields(
  current: InstrumentSettings,
  snapshot: InstrumentSettings
): InstrumentSettings {
  return {
    ...current,
    touchCalibration: snapshot.touchCalibration,
    activationTuning: snapshot.activationTuning
  };
}

function emptyFingerSampleFreshness(): FingerSampleFreshnessMap {
  return {
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false
  };
}

function emptyHandedFingerSampleFreshness(): HandedFingerSampleFreshness {
  return {
    Left: emptyFingerSampleFreshness(),
    Right: emptyFingerSampleFreshness()
  };
}

function getFingerSampleFreshness(
  timestamps: HandedFingerDepthSamples,
  timestamp: number
): HandedFingerSampleFreshness {
  return {
    Left: {
      thumb:
        timestamps.Left.thumb !== null &&
        timestamp - timestamps.Left.thumb <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      index:
        timestamps.Left.index !== null &&
        timestamp - timestamps.Left.index <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      middle:
        timestamps.Left.middle !== null &&
        timestamp - timestamps.Left.middle <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      ring:
        timestamps.Left.ring !== null &&
        timestamp - timestamps.Left.ring <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      pinky:
        timestamps.Left.pinky !== null &&
        timestamp - timestamps.Left.pinky <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS
    },
    Right: {
      thumb:
        timestamps.Right.thumb !== null &&
        timestamp - timestamps.Right.thumb <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      index:
        timestamps.Right.index !== null &&
        timestamp - timestamps.Right.index <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      middle:
        timestamps.Right.middle !== null &&
        timestamp - timestamps.Right.middle <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      ring:
        timestamps.Right.ring !== null &&
        timestamp - timestamps.Right.ring <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS,
      pinky:
        timestamps.Right.pinky !== null &&
        timestamp - timestamps.Right.pinky <= MANUAL_TOUCH_SAMPLE_MAX_AGE_MS
    }
  };
}

function getTipDepthScore(hand: TrackedHand, tipIndex: 4 | 8 | 12 | 16 | 20): number | null {
  const tip = hand.landmarks[tipIndex];
  if (!tip) {
    return null;
  }

  // Independent fingertip depth mode: only the fingertip landmark contributes.
  return Math.max(0, -tip.z);
}

function getHandConfidenceThreshold(sensitivity: number): number {
  return lerp(0.72, 0.18, sensitivity);
}

function getOverlaySmoothingAlpha(sensitivity: number): number {
  return lerp(0.18, 0.62, sensitivity);
}

export function useGestureInstrument(): {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  state: InstrumentViewState;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  armAudio: () => Promise<void>;
  calibrateDepthGate: (handedness: Handedness) => void;
  calibrateFingerSensitivity: (handedness: Handedness) => void;
  calibrateSingleFingerSensitivity: (finger: FingertipName, handedness: Handedness) => void;
  setFingerHoverCalibration: (finger: FingertipName, handedness: Handedness) => void;
  setFingerPressCalibration: (finger: FingertipName, handedness: Handedness) => void;
  startPlayingFeelCalibration: (scope: CalibrationScope) => void;
  acceptPlayingFeelCalibrationStep: () => void;
  retryPlayingFeelCalibrationStep: () => void;
  skipPlayingFeelCalibrationStep: () => void;
  cancelPlayingFeelCalibrationFlow: () => void;
  updateSettings: (patch: Partial<InstrumentSettings>) => void;
  exportLogs: () => void;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<HandTrackerBackend | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const loggerRef = useRef(new SessionLogger());
  const logCountRef = useRef(0);
  const interactionRef = useRef(initialInteractionState);
  const smoothedNoteXRef = useRef<number | null>(null);
  const noteTraceRef = useRef<NoteCursorPoint[]>([]);
  const latestTouchDepthRef = useRef<HandedTouchDepthMap>(emptyHandedTouchDepthMap());
  const latestFingerDepthSamplesRef = useRef<HandedFingerDepthSamples>(
    emptyHandedFingerDepthSamples()
  );
  const latestWeightedFingerDepthSamplesRef = useRef<HandedFingerDepthSamples>(
    emptyHandedFingerDepthSamples()
  );
  const latestFingerDepthSampleTimestampsRef = useRef<HandedFingerDepthSamples>(
    emptyHandedFingerDepthSamples()
  );
  const stableHandSlotsRef = useRef(emptyStableHandSlots());
  const tipIntentMemoryRef = useRef<Record<string, TipIntentMemory>>({});
  const calibrationSessionRef = useRef<PlayingFeelCalibrationSession>(
    createIdleCalibrationSession()
  );
  const preCalibrationSettingsRef = useRef<InstrumentSettings | null>(null);
  const lastCalibrationPreviewToneAtRef = useRef(0);
  const lastCalibrationPhaseRef = useRef(calibrationSessionRef.current.phase);
  const commitFrameRef = useRef<(frame: TrackerFrame) => void>(() => {});
  const startupAttemptedRef = useRef(false);
  const settingsHydratedRef = useRef(false);
  const armedRef = useRef(false);
  const audioArmingRef = useRef(false);
  const audioOutputRequestIdRef = useRef(0);
  const lastRenderStateAtRef = useRef(0);
  const lastRenderSignatureRef = useRef("");
  const lastMidiSignatureRef = useRef<string | null>(null);
  const lastCalibrationPreviewMidiSignatureRef = useRef<string | null>(null);
  const lastLoggedSemitoneSignatureRef = useRef("");
  const lastTrackingDropLogAtRef = useRef(-Infinity);
  const settingsSaveTimeoutRef = useRef<number | null>(null);
  const frameGeometryRef = useRef<{
    key: string;
    pianoLayout: PianoLayout;
    stripBounds: ReturnType<typeof getStripBounds>;
  } | null>(null);
  const trackerStatusRef = useRef<TrackerStatus>("idle");
  const previousDeviceIdRef = useRef(DEFAULT_SETTINGS.deviceId);
  const previousTrackerBackendRef = useRef(DEFAULT_SETTINGS.trackingBackend);
  const previousAudioOutputDeviceIdRef = useRef(DEFAULT_SETTINGS.audioOutputDeviceId);
  const settingsRef = useRef<InstrumentSettings>(DEFAULT_SETTINGS);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>("idle");
  const [armed, setArmed] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [startupNotice, setStartupNotice] = useState<string | null>(null);
  const [audioOutputNotice, setAudioOutputNotice] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<InstrumentViewState>({
    trackerStatus: "idle",
    error: null,
    armed: false,
    audioStatus: "idle",
    settings: DEFAULT_SETTINGS,
    interaction: initialInteractionState,
    overlayHands: [],
    noteCursor: null,
    noteTrace: [],
    fps: 0,
    latencyMs: 0,
    devices: [],
    audioOutputDevices: [],
    audioOutputRoutingSupported: supportsExplicitAudioOutputRouting(),
    currentRootLabel: null,
    currentChordLabel: "C",
    currentModeLabel: "Piano",
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
      touchDepth: emptyHandedTouchDepthMap(),
      depthGate: DEFAULT_SETTINGS.depthGate,
      activeNotes: [],
      touchTips: 0,
      activeSemitone: null,
      fingerDepthSamples: emptyHandedFingerDepthSamples(),
      fingerDepthSamplesFresh: emptyHandedFingerSampleFreshness()
    },
    activeNaturalZones: [],
    activeSharpZones: [],
    activeTouchMarkers: [],
    activeCircleSegments: { Left: [], Right: [] },
    activeCircleMarkers: [],
    calibrationSession: calibrationSessionRef.current
  });

  const refreshDevices = useCallback(async () => {
    try {
      const [nextVideoDevices, nextAudioOutputDevices] = await Promise.all([
        listVideoDevices(),
        listAudioOutputDevices().catch(() => [])
      ]);
      setDevices(nextVideoDevices);
      setAudioOutputDevices(nextAudioOutputDevices);
    } catch {
      setDevices([]);
      setAudioOutputDevices([]);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    let cancelled = false;

    const hydrateSettings = async () => {
      try {
        const persistedSettings = await loadInstrumentSettings();
        if (cancelled) {
          return;
        }

        if (persistedSettings) {
          const hydratedSettings = { ...DEFAULT_SETTINGS, ...persistedSettings };
          settingsRef.current = hydratedSettings;
          setSettings(hydratedSettings);
        }
      } catch {
        if (cancelled) {
          return;
        }

        settingsRef.current = DEFAULT_SETTINGS;
        setSettings(DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) {
          settingsHydratedRef.current = true;
          setSettingsReady(true);
        }
      }
    };

    void hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsHydratedRef.current) {
      return;
    }

    if (settingsSaveTimeoutRef.current !== null) {
      window.clearTimeout(settingsSaveTimeoutRef.current);
      settingsSaveTimeoutRef.current = null;
    }

    if (calibrationSessionRef.current.active) {
      return;
    }

    settingsSaveTimeoutRef.current = window.setTimeout(() => {
      settingsSaveTimeoutRef.current = null;
      void saveInstrumentSettings(settingsRef.current).catch(() => undefined);
    }, SETTINGS_SAVE_DEBOUNCE_MS);

    return () => {
      if (settingsSaveTimeoutRef.current !== null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
        settingsSaveTimeoutRef.current = null;
      }
    };
  }, [settings]);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  useEffect(() => {
    trackerStatusRef.current = trackerStatus;
  }, [trackerStatus]);

  const routeAudioOutput = useCallback((deviceId: string) => {
    const audioEngine = audioRef.current;
    if (!audioEngine) {
      return;
    }

    const requestId = audioOutputRequestIdRef.current + 1;
    audioOutputRequestIdRef.current = requestId;
    previousAudioOutputDeviceIdRef.current = deviceId;

    void audioEngine
      .setOutputDevice(deviceId)
      .then((applied) => {
        if (audioOutputRequestIdRef.current !== requestId) {
          return;
        }

        if (applied) {
          setAudioOutputNotice(null);
          setRenderState((current) => ({ ...current, audioOutputNotice: null }));
          return;
        }

        const notice =
          "Selected audio output could not be routed directly, so sound is using the browser default output.";
        setAudioOutputNotice(notice);
        setRenderState((current) => ({ ...current, audioOutputNotice: notice }));
      })
      .catch(() => {
        if (audioOutputRequestIdRef.current !== requestId) {
          return;
        }

        const notice =
          "Selected audio output could not be routed directly, so sound is using the browser default output.";
        setAudioOutputNotice(notice);
        setRenderState((current) => ({ ...current, audioOutputNotice: notice }));
      });
  }, []);

  useEffect(() => {
    if (!armed) {
      return;
    }

    audioRef.current?.setPatch(settings.synthPatch);
    lastMidiSignatureRef.current = null;
    lastCalibrationPreviewMidiSignatureRef.current = null;
    audioRef.current?.setVolume(settings.volume);
    if (previousAudioOutputDeviceIdRef.current === settings.audioOutputDeviceId) {
      return;
    }

    routeAudioOutput(settings.audioOutputDeviceId);
  }, [armed, routeAudioOutput, settings.audioOutputDeviceId, settings.synthPatch, settings.volume]);

  useEffect(
    () => () => {
      if (settingsSaveTimeoutRef.current !== null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
      }
      trackerRef.current?.stop(streamRef.current);
      audioRef.current?.dispose();
    },
    []
  );

  const applyCalibrationCommit = useCallback((commit: CalibrationCommit) => {
    const current = settingsRef.current;
    const next = {
      ...current,
      touchCalibration: {
        ...current.touchCalibration,
        [commit.hand]: {
          ...current.touchCalibration[commit.hand],
          [commit.finger]: commit.calibration
        }
      },
      activationTuning: {
        ...current.activationTuning,
        [commit.hand]: {
          ...current.activationTuning[commit.hand],
          [commit.finger]: {
            ...current.activationTuning[commit.hand][commit.finger],
            ...commit.tuning
          }
        }
      }
    };

    settingsRef.current = next;
    setSettings(next);
    return next;
  }, []);

  const commitFrame = useCallback(
    (frame: TrackerFrame) => {
      const liveSettings = settingsRef.current;
      const confidenceThreshold = getHandConfidenceThreshold(liveSettings.trackingSensitivity);
      const trackedHands = frame.hands.filter((hand) => hand.confidence >= confidenceThreshold);
      const stableHandResolution = resolveStableHandedness(trackedHands, stableHandSlotsRef.current);
      stableHandSlotsRef.current = stableHandResolution.nextSlots;
      const stableHandednessById = new Map(
        stableHandResolution.resolvedHands.map((entry) => [entry.hand.id, entry.stableHandedness] as const)
      );
      const stableLeftHand =
        stableHandResolution.resolvedHands.find((entry) => entry.stableHandedness === "Left")?.hand ?? null;
      const stableRightHand =
        stableHandResolution.resolvedHands.find((entry) => entry.stableHandedness === "Right")?.hand ?? null;
      const overlayAlpha = getOverlaySmoothingAlpha(liveSettings.trackingSensitivity);
      const sortedHands = [...trackedHands].sort((left, right) => averageHandX(right) - averageHandX(left));
      const primaryHand = sortedHands[0] ?? null;
      const secondaryHand = sortedHands[1] ?? null;
      const noteRawX = primaryHand ? primaryHand.landmarks[8]?.x ?? null : null;
      const noteY = primaryHand ? primaryHand.landmarks[8]?.y ?? null : null;
      const noteX = projectToNoteStripX(
        noteRawX,
        liveSettings.noteStripSize,
        0.035,
        liveSettings.pianoWidthScale
      );
      const smoothedNoteX =
        noteX === null ? null : ema(smoothedNoteXRef.current, noteX, overlayAlpha);
      smoothedNoteXRef.current = smoothedNoteX;
      const geometryKey = [
        liveSettings.noteStripSize,
        liveSettings.pianoWidthScale,
        liveSettings.pianoVerticalOffset,
        liveSettings.pianoHeightScale,
        liveSettings.pianoOctaves
      ].join("|");
      let frameGeometry = frameGeometryRef.current;
      if (!frameGeometry || frameGeometry.key !== geometryKey) {
        const noteCount = getNaturalKeyCount(liveSettings.pianoOctaves);
        frameGeometry = {
          key: geometryKey,
          pianoLayout: getPianoLayout(
            noteCount,
            liveSettings.pianoVerticalOffset,
            liveSettings.pianoHeightScale,
            liveSettings.pianoOctaves
          ),
          stripBounds: getStripBounds(liveSettings.noteStripSize, liveSettings.pianoWidthScale)
        };
        frameGeometryRef.current = frameGeometry;
      }
      const { pianoLayout, stripBounds } = frameGeometry;
      const calibrationSession = calibrationSessionRef.current;
      const calibrationActive = calibrationSession.active;
      const targetHand =
        calibrationActive && calibrationSession.targetHand === "Left"
          ? stableLeftHand
          : calibrationActive
            ? stableRightHand
            : null;
      const controlHand =
        calibrationActive && calibrationSession.controlHand === "Left"
          ? stableLeftHand
          : calibrationActive
            ? stableRightHand
            : null;
      const controlPalm = controlHand ? extractHandFeatures(controlHand.landmarks).palmCenter : null;
      const controlInsideZone =
        calibrationActive &&
        isPalmInsideControlZone(
          controlPalm,
          calibrationSession.controlHand,
          pianoLayout,
          stripBounds
        );
      const controlGesture = calibrationActive
        ? classifyCalibrationControlGesture(controlHand)
        : "none";
      const targetAvgX = targetHand ? averageHandX(targetHand) : null;
      const controlAvgX = controlHand ? averageHandX(controlHand) : null;
      const roleAmbiguous =
        calibrationActive &&
        targetAvgX !== null &&
        controlAvgX !== null &&
        (calibrationSession.targetHand === "Left"
          ? targetAvgX > controlAvgX
          : targetAvgX < controlAvgX);
      let calibrationTargetSample: CalibrationFrameSample | null = null;

      if (calibrationActive && targetHand) {
        const tipIndex = FINGER_NAME_TO_TIP_INDEX[calibrationSession.targetFinger];
        const tip = targetHand.landmarks[tipIndex];
        const rawDepth = getTipDepthScore(targetHand, tipIndex);
        if (tip && rawDepth !== null) {
          const strictProjectedX = projectToNoteStripX(
            tip.x,
            liveSettings.noteStripSize,
            0.035,
            liveSettings.pianoWidthScale
          );
          const looseProjectedX = projectToNoteStripX(
            tip.x,
            liveSettings.noteStripSize,
            0.08,
            liveSettings.pianoWidthScale
          );
          const inHoverMargin =
            tip.y >= pianoLayout.topY - CALIBRATION_STABILITY_THRESHOLDS.hoverAcquisitionMargin &&
            tip.y <= pianoLayout.bottomY + CALIBRATION_STABILITY_THRESHOLDS.hoverAcquisitionMargin;
          const sensitivity =
            liveSettings.fingerDepthSensitivity[calibrationSession.targetHand][
              calibrationSession.targetFinger
            ];
          const candidateKey =
            strictProjectedX !== null
              ? resolvePianoKeyAt(strictProjectedX, tip.y, pianoLayout)
              : null;
          const looseZone =
            looseProjectedX !== null && inHoverMargin
              ? resolvePianoKeyAt(
                  looseProjectedX,
                  Math.min(Math.max(tip.y, pianoLayout.topY), pianoLayout.bottomY),
                  pianoLayout,
                  candidateKey
                )
              : null;
          calibrationTargetSample = {
            timestamp: frame.timestamp,
            hand: calibrationSession.targetHand,
            finger: calibrationSession.targetFinger,
            x: tip.x,
            y: tip.y,
            rawDepth,
            weightedDepth: getEffectiveDepthScore(rawDepth, sensitivity),
            sensitivity,
            candidateKey,
            nearKey: candidateKey ?? looseZone,
            midiNote: keyToMidiNote(candidateKey ?? looseZone, liveSettings.pianoOctaves),
            visible: inHoverMargin && looseProjectedX !== null
          };
        }
      }

      const calibrationUpdate = updatePlayingFeelCalibrationSession(calibrationSession, {
        timestamp: frame.timestamp,
        targetSample: calibrationTargetSample,
        controlGesture,
        controlHandVisible: controlHand !== null,
        controlInsideZone,
        roleAmbiguous
      });
      if (calibrationUpdate.commit) {
        applyCalibrationCommit(calibrationUpdate.commit);
      }
      calibrationSessionRef.current = calibrationUpdate.session;
      const calibrationPhaseChanged =
        lastCalibrationPhaseRef.current !== calibrationUpdate.session.phase;
      if (calibrationPhaseChanged) {
        audioRef.current?.syncMidiNotes([]);
        audioRef.current?.stopCalibrationPreview();
        lastMidiSignatureRef.current = "";
        lastCalibrationPreviewMidiSignatureRef.current = "";
        lastCalibrationPhaseRef.current = calibrationUpdate.session.phase;
      }
      if (!calibrationUpdate.session.active && calibrationUpdate.session.phase === "complete") {
        preCalibrationSettingsRef.current = null;
        if (settingsSaveTimeoutRef.current !== null) {
          window.clearTimeout(settingsSaveTimeoutRef.current);
          settingsSaveTimeoutRef.current = null;
        }
        void saveInstrumentSettings(settingsRef.current).catch(() => undefined);
      }
      if (calibrationUpdate.cue && liveSettings.calibrationAudioMode !== "off") {
        audioRef.current?.triggerCalibrationCue(calibrationUpdate.cue);
      }
      if (
        liveSettings.calibrationAudioMode === "target-preview" &&
        calibrationUpdate.session.phase === "capture-taps" &&
        calibrationUpdate.session.previewMidiNote !== null &&
        frame.timestamp - lastCalibrationPreviewToneAtRef.current > 160
      ) {
        audioRef.current?.triggerCalibrationTone(calibrationUpdate.session.previewMidiNote, 0.08, 0.22);
        lastCalibrationPreviewToneAtRef.current = frame.timestamp;
      }

      if (noteRawX !== null && noteY !== null) {
        noteTraceRef.current = [
          ...noteTraceRef.current.slice(-18),
          { x: noteRawX, y: noteY }
        ];
      }

      const isCircleMode = liveSettings.playMode === "circle";
      const shouldRunPianoTouchPipeline = !isCircleMode || calibrationUpdate.session.active;
      const groupedWhiteTouches = new Map<number, number>();
      const directBlackTouches = new Set<number>();
      const touchSamples: CalibrationTouchSample[] = [];
      const activeTouchMarkers: ActiveTouchMarker[] = [];
      const nextFingerDepthSamplesByHand = emptyHandedFingerDepthSamples();
      const nextWeightedFingerDepthSamplesByHand = emptyHandedFingerDepthSamples();
      const nextFingerDepthSampleTimestampsByHand = emptyHandedFingerDepthSamples();
      const nextTipIntentMemory: Record<string, TipIntentMemory> = {};

      if (shouldRunPianoTouchPipeline) {
        trackedHands.forEach((hand) => {
          PLAYABLE_FINGERTIP_INDEXES.forEach((tipIndex) => {
            const tip = hand.landmarks[tipIndex];
            if (!tip) {
              return;
            }

            const projectedX = projectToNoteStripX(
              tip.x,
              liveSettings.noteStripSize,
              0.035,
              liveSettings.pianoWidthScale
            );
            if (
              projectedX === null ||
              tip.y < pianoLayout.topY ||
              tip.y > pianoLayout.bottomY
            ) {
              return;
            }

            const depthScore = getTipDepthScore(hand, tipIndex);
            if (depthScore === null) {
              return;
            }

            const fingertipName = tipIndexToFingerName(tipIndex);
            const stableHandedness = stableHandednessById.get(hand.id) ?? hand.handedness;
            const depthGate = liveSettings.depthGate[stableHandedness];
            const sensitivity =
              liveSettings.fingerDepthSensitivity[stableHandedness][fingertipName];
            const effectiveDepthScore = getEffectiveDepthScore(depthScore, sensitivity);
            nextFingerDepthSamplesByHand[stableHandedness] = recordFingerDepthSample(
              nextFingerDepthSamplesByHand[stableHandedness],
              fingertipName,
              depthScore
            );
            nextWeightedFingerDepthSamplesByHand[stableHandedness] = recordFingerDepthSample(
              nextWeightedFingerDepthSamplesByHand[stableHandedness],
              fingertipName,
              effectiveDepthScore
            );
            nextFingerDepthSampleTimestampsByHand[stableHandedness] = {
              ...nextFingerDepthSampleTimestampsByHand[stableHandedness],
              [fingertipName]: frame.timestamp
            };
            touchSamples.push({
              handedness: stableHandedness,
              finger: fingertipName,
              rawDepthScore: depthScore,
              effectiveDepthScore
            });
            const memoryKey = `${stableHandedness}:${tipIndex}`;
            const previousMemory = tipIntentMemoryRef.current[memoryKey];
            const touchActivation = getTouchActivation({
              effectiveDepthScore,
              depthGate,
              calibration: liveSettings.touchCalibration[stableHandedness][fingertipName],
              sensitivity
            });
            const elapsedMs = Math.max(
              frame.timestamp - (previousMemory?.timestamp ?? frame.timestamp),
              0
            );
            const activationVelocity = getActivationVelocity({
              previousActivation: previousMemory?.activation ?? null,
              nextActivation: touchActivation.activation,
              elapsedMs,
              previousVelocity: previousMemory?.activationVelocity ?? 0,
              smoothing:
                liveSettings.activationTuning[stableHandedness][fingertipName]
                  .activationVelocitySmoothing
            });
            const blackZone = resolveBlackKeyHit(projectedX, tip.y, pianoLayout);
            const whiteZone =
              blackZone === null
                ? resolveWhiteKeyHit(
                    projectedX,
                    tip.y,
                    pianoLayout,
                    getPreviousWhiteZone(previousMemory?.candidateKey)
                  )
                : null;
            const candidateKey =
              blackZone !== null
                ? `black:${blackZone}`
                : whiteZone !== null
                  ? `white:${whiteZone}`
                  : null;
            const stableMs =
              candidateKey !== null && candidateKey === previousMemory?.candidateKey
                ? Math.min(
                    (previousMemory?.stableMs ?? 0) +
                      Math.max(frame.timestamp - (previousMemory?.timestamp ?? frame.timestamp), 0),
                    240
                  )
                : 0;
            const isPressed = shouldPressTouch({
              currentKey: candidateKey,
              previousKey: previousMemory?.candidateKey ?? null,
              previousPressed: previousMemory?.pressed ?? false,
              stableMs,
              activation: touchActivation.activation,
              activationVelocity,
              tuning: {
                hardActivationThreshold:
                  liveSettings.activationTuning[stableHandedness][fingertipName]
                    .hardActivationThreshold,
                pressActivationThreshold:
                  liveSettings.activationTuning[stableHandedness][fingertipName]
                    .pressActivationThreshold,
                releaseActivationThreshold:
                  liveSettings.activationTuning[stableHandedness][fingertipName]
                    .releaseActivationThreshold,
                stablePressMs:
                  liveSettings.activationTuning[stableHandedness][fingertipName].touchDwellMs,
                pressVelocityThreshold:
                  liveSettings.activationTuning[stableHandedness][fingertipName]
                    .pressVelocityThreshold,
                releaseVelocityThreshold:
                  liveSettings.activationTuning[stableHandedness][fingertipName]
                    .releaseVelocityThreshold
              }
            });

          activeTouchMarkers.push({
            handId: hand.id,
            stableHandedness,
            tipIndex,
            source: "piano",
            modelZ: tip.z,
            rawDepthScore: depthScore,
            sensitivity,
              depthScore: effectiveDepthScore,
              activationProgress: touchActivation.activation,
              activationVelocity,
              isCalibrated: touchActivation.calibrated,
              isPressed
            });
            nextTipIntentMemory[memoryKey] = {
              timestamp: frame.timestamp,
              y: tip.y,
              effectiveDepthScore,
              activation: touchActivation.activation,
              activationVelocity,
              candidateKey,
              stableMs,
              pressed: isPressed
            };

            if (!isPressed) {
              return;
            }

            if (blackZone !== null) {
              directBlackTouches.add(blackZone);
              return;
            }

            if (whiteZone === null) {
              return;
            }

            groupedWhiteTouches.set(whiteZone, (groupedWhiteTouches.get(whiteZone) ?? 0) + 1);
          });
        });

        latestFingerDepthSamplesRef.current = {
          Left: getCalibrationFingerSamples(nextFingerDepthSamplesByHand, "Left"),
          Right: getCalibrationFingerSamples(nextFingerDepthSamplesByHand, "Right")
        };
        latestWeightedFingerDepthSamplesRef.current = {
          Left: getCalibrationFingerSamples(nextWeightedFingerDepthSamplesByHand, "Left"),
          Right: getCalibrationFingerSamples(nextWeightedFingerDepthSamplesByHand, "Right")
        };
        latestFingerDepthSampleTimestampsRef.current = {
          Left: getCalibrationFingerSamples(nextFingerDepthSampleTimestampsByHand, "Left"),
          Right: getCalibrationFingerSamples(nextFingerDepthSampleTimestampsByHand, "Right")
        };
        tipIntentMemoryRef.current = nextTipIntentMemory;
        latestTouchDepthRef.current = {
          Left: getCalibrationDepthScore(touchSamples, "Left"),
          Right: getCalibrationDepthScore(touchSamples, "Right")
        };
      } else {
        latestFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
        latestWeightedFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
        latestFingerDepthSampleTimestampsRef.current = emptyHandedFingerDepthSamples();
        tipIntentMemoryRef.current = {};
        latestTouchDepthRef.current = emptyHandedTouchDepthMap();
      }

      const { activeNaturalZones, activeSharpZones } = shouldRunPianoTouchPipeline
        ? resolveActiveTouchState(groupedWhiteTouches, directBlackTouches, liveSettings.pianoOctaves)
        : { activeNaturalZones: [], activeSharpZones: [] };
      const activeSemitones = shouldRunPianoTouchPipeline
        ? [
            ...activeNaturalZones.map((zone) =>
              naturalZoneToSemitone(zone, false, liveSettings.pianoOctaves)
            ),
            ...activeSharpZones.map((zone) =>
              naturalZoneToSemitone(zone, true, liveSettings.pianoOctaves)
            )
          ].sort((left, right) => left - right)
        : [];
      const activeMidiNotes = activeSemitones.map((semitone) => getRootMidi(semitone));
      const activeNoteLabels = activeSemitones.map((semitone) =>
        describeRootSemitone(semitone, liveSettings.labelStyle)
      );
      const circleSegmentSets: Record<Handedness, Set<number>> = {
        Left: new Set<number>(),
        Right: new Set<number>()
      };
      const activeCircleMarkers: ActiveCircleMarker[] = [];
      const activeCircleTouchMarkers: ActiveTouchMarker[] = [];
      const circleRootSemitoneSet = new Set<number>();
      const circleMidiNoteSet = new Set<number>();
      const circleChordLabelSet = new Set<string>();
      const circleNoteLabels: string[] = [];

      if (isCircleMode) {
        ([
          ["Left", stableLeftHand],
          ["Right", stableRightHand]
        ] as const).forEach(([stableHandedness, hand]) => {
          if (!hand) {
            return;
          }

          const circleLayout = getCircleLayout(stableHandedness);
          const chordMode = classifyCircleChordQuality(extractHandFeatures(hand.landmarks));
          const useFifths = liveSettings.circleOfFifths[stableHandedness];

          PLAYABLE_FINGERTIP_INDEXES.forEach((tipIndex) => {
            const finger = tipIndexToFingerName(tipIndex);
            if (!liveSettings.circleFingerEnabled[stableHandedness][finger]) {
              return;
            }

            const tip = hand.landmarks[tipIndex];
            const segment = tip ? resolveCircleSegment(tip, circleLayout) : null;
            if (segment === null) {
              return;
            }

            const rootSemitone = getCircleRootSemitone(segment, useFifths);
            const label = describeChord(rootSemitone, chordMode, liveSettings.labelStyle);
            const labelSignature = `${rootSemitone}:${chordMode}`;
            circleSegmentSets[stableHandedness].add(segment);
            circleRootSemitoneSet.add(rootSemitone);
            buildVoicing(rootSemitone, chordMode).forEach((midiNote) => {
              circleMidiNoteSet.add(midiNote);
            });

            if (!circleChordLabelSet.has(labelSignature)) {
              circleChordLabelSet.add(labelSignature);
              circleNoteLabels.push(label);
            }

            activeCircleMarkers.push({
              handId: hand.id,
              stableHandedness,
              finger,
              tipIndex,
              segment,
              rootSemitone,
              chordMode,
              label
            });
            activeCircleTouchMarkers.push({
              handId: hand.id,
              stableHandedness,
              tipIndex,
              source: "circle",
              modelZ: tip.z,
              rawDepthScore: 0,
              sensitivity: 1,
              depthScore: 0,
              activationProgress: 1,
              activationVelocity: 0,
              isCalibrated: true,
              isPressed: true
            });
          });
        });
      }

      const circleRootSemitones = [...circleRootSemitoneSet].sort((left, right) => left - right);
      const circleMidiNotes = [...circleMidiNoteSet].sort((left, right) => left - right);
      const circleRootLabels = circleRootSemitones.map((semitone) =>
        describeRootSemitone(semitone, liveSettings.labelStyle)
      );
      const suppressNormalAudio = calibrationUpdate.session.active;
      const playableMidiNotes = isCircleMode ? circleMidiNotes : activeMidiNotes;
      const playableSemitones = isCircleMode ? circleRootSemitones : activeSemitones;
      const playableNoteLabels = isCircleMode ? circleNoteLabels : activeNoteLabels;
      const playableRootLabels = isCircleMode ? circleRootLabels : activeNoteLabels;
      const displayedActiveNaturalZones = suppressNormalAudio || isCircleMode ? [] : activeNaturalZones;
      const displayedActiveSharpZones = suppressNormalAudio || isCircleMode ? [] : activeSharpZones;
      const displayedActiveCircleSegments =
        suppressNormalAudio || !isCircleMode
          ? { Left: [], Right: [] }
          : {
              Left: [...circleSegmentSets.Left],
              Right: [...circleSegmentSets.Right]
            };
      const displayedActiveCircleMarkers =
        suppressNormalAudio || !isCircleMode ? [] : activeCircleMarkers;
      const displayedActiveTouchMarkers =
        suppressNormalAudio
          ? []
          : isCircleMode
            ? activeCircleTouchMarkers
            : activeTouchMarkers;
      const displayedActiveSemitones = suppressNormalAudio ? [] : playableSemitones;
      const displayedActiveNoteLabels = suppressNormalAudio ? [] : playableNoteLabels;
      const displayedActiveRootLabels = suppressNormalAudio ? [] : playableRootLabels;
      const normalMidiSignature = suppressNormalAudio ? "" : playableMidiNotes.join(",");
      const calibrationPreviewMidiSignature =
        calibrationUpdate.session.active &&
        calibrationUpdate.session.phase === "preview" &&
        liveSettings.calibrationAudioMode === "target-preview"
          ? activeMidiNotes.join(",")
          : "";

      if (lastMidiSignatureRef.current !== normalMidiSignature) {
        audioRef.current?.syncMidiNotes(suppressNormalAudio ? [] : playableMidiNotes);
        lastMidiSignatureRef.current = normalMidiSignature;
      }
      if (
        calibrationPreviewMidiSignature &&
        lastCalibrationPreviewMidiSignatureRef.current !== calibrationPreviewMidiSignature
      ) {
        audioRef.current?.syncCalibrationPreviewNotes(activeMidiNotes, 0.24);
        lastCalibrationPreviewMidiSignatureRef.current = calibrationPreviewMidiSignature;
      } else if (!calibrationPreviewMidiSignature && lastCalibrationPreviewMidiSignatureRef.current) {
        audioRef.current?.stopCalibrationPreview();
        lastCalibrationPreviewMidiSignatureRef.current = "";
      }

      const previous = interactionRef.current;
      const nextInteraction: InteractionState = {
        ...previous,
        systemState:
          trackedHands.length === 0
            ? "TRACKING_SEARCH"
            : displayedActiveSemitones.length > 0
              ? "PLAYING"
              : "TRACKING_ACTIVE",
        stableMode: "single",
        currentZone: displayedActiveNaturalZones[0] ?? displayedActiveSharpZones[0] ?? null,
        currentRoot: displayedActiveSemitones[0] ?? null,
        currentRootSince: displayedActiveSemitones.length > 0 ? frame.timestamp : null,
        lastTriggeredRoot: displayedActiveSemitones[0] ?? null,
        lastTriggerAt: displayedActiveSemitones.length > 0 ? frame.timestamp : previous.lastTriggerAt,
        lastNoteVisibleAt: trackedHands.length > 0 ? frame.timestamp : previous.lastNoteVisibleAt,
        lastChordVisibleAt: null,
        chordCandidateMode: null,
        chordCandidateSince: null,
        ambiguousSince: null,
        notePinchActive: false,
        isSounding: displayedActiveSemitones.length > 0,
        warnings: []
      };
      interactionRef.current = nextInteraction;

      let logCount = logCountRef.current;
      if (nextInteraction.currentZone !== previous.currentZone && nextInteraction.currentZone !== null) {
        logCount = appendLog(loggerRef.current, {
          type: "note-zone",
          timestamp: frame.timestamp,
          payload: { zone: nextInteraction.currentZone }
        });
      }

      const displayedAudioSignature = [
        liveSettings.playMode,
        displayedActiveSemitones.join(","),
        displayedActiveNoteLabels.join(","),
        normalMidiSignature
      ].join("|");
      if (displayedAudioSignature !== lastLoggedSemitoneSignatureRef.current) {
        logCount = appendLog(loggerRef.current, {
          type: "audio-event",
          timestamp: frame.timestamp,
          payload: {
            playMode: liveSettings.playMode,
            activeSemitones: displayedActiveSemitones,
            activeMidiNotes: suppressNormalAudio ? [] : playableMidiNotes,
            activeLabels: displayedActiveNoteLabels
          }
        });
        lastLoggedSemitoneSignatureRef.current = displayedAudioSignature;
      }

      if (
        trackedHands.length === 0 &&
        frame.timestamp - lastTrackingDropLogAtRef.current >= TRACKING_DROP_LOG_INTERVAL_MS
      ) {
        logCount = appendLog(loggerRef.current, {
          type: "tracking-drop",
          timestamp: frame.timestamp,
          payload: { reason: "no-hands-visible" }
        });
        lastTrackingDropLogAtRef.current = frame.timestamp;
      }
      logCountRef.current = logCount;

      const currentRootLabel =
        displayedActiveSemitones.length > 0
          ? displayedActiveRootLabels.join(" • ")
          : smoothedNoteX !== null && displayedActiveNaturalZones[0] !== undefined
            ? describeRootSemitone(
                naturalZoneToSemitone(displayedActiveNaturalZones[0], false, liveSettings.pianoOctaves),
                liveSettings.labelStyle
              )
            : null;
      const currentChordLabel =
        displayedActiveNoteLabels.length > 0
          ? displayedActiveNoteLabels.join(" • ")
          : isCircleMode
            ? "Circle ready"
            : "Waiting for touch";
      let focusTouchMarker: ActiveTouchMarker | null = null;
      for (const marker of displayedActiveTouchMarkers) {
        if (
          !focusTouchMarker ||
          Number(marker.isPressed) > Number(focusTouchMarker.isPressed) ||
          (marker.isPressed === focusTouchMarker.isPressed &&
            marker.depthScore > focusTouchMarker.depthScore)
        ) {
          focusTouchMarker = marker;
        }
      }
      const focusHand = focusTouchMarker
        ? trackedHands.find((hand) => hand.id === focusTouchMarker.handId) ?? null
        : primaryHand;
      const focusLandmark =
        focusTouchMarker && focusHand
          ? focusHand.landmarks[focusTouchMarker.tipIndex]
          : primaryHand?.landmarks[8] ?? null;
      const focusTipLabel =
        focusTouchMarker !== null
          ? `${focusTouchMarker.stableHandedness.toLowerCase()} ${tipIndexToFingerName(focusTouchMarker.tipIndex)}`
          : primaryHand
            ? "primary index"
            : null;
      const focusTipRawX = focusLandmark?.x ?? null;
      const focusTipProjectedX =
        focusLandmark
          ? projectToNoteStripX(
              focusLandmark.x,
              liveSettings.noteStripSize,
              0.035,
              liveSettings.pianoWidthScale
            )
          : null;
      let touchTips = isCircleMode ? displayedActiveCircleMarkers.length : directBlackTouches.size;
      if (!isCircleMode) {
        groupedWhiteTouches.forEach((count) => {
          touchTips += count;
        });
      }
      const renderSignature = [
        liveSettings.playMode,
        displayedAudioSignature,
        displayedActiveNoteLabels.join(","),
        displayedActiveCircleSegments.Left.join(","),
        displayedActiveCircleSegments.Right.join(","),
        trackedHands.length,
        calibrationUpdate.session.phase,
        calibrationUpdate.session.targetHand,
        calibrationUpdate.session.targetFinger,
        calibrationUpdate.session.guidance,
        Math.round(calibrationUpdate.session.progress * 20),
        logCount,
        startupNotice ?? "",
        audioOutputNotice ?? ""
      ].join("|");
      const shouldPublishRender =
        renderSignature !== lastRenderSignatureRef.current ||
        frame.timestamp - lastRenderStateAtRef.current >= RENDER_FRAME_INTERVAL_MS;

      if (!shouldPublishRender) {
        return;
      }

      lastRenderSignatureRef.current = renderSignature;
      lastRenderStateAtRef.current = frame.timestamp;

      setRenderState({
        trackerStatus: "ready",
        error: null,
        armed,
        audioStatus,
        settings: liveSettings,
        interaction: nextInteraction,
        overlayHands: trackedHands.map((hand) => ({ hand, role: "note" })),
        noteCursor:
          noteRawX !== null && noteY !== null ? { x: noteRawX, y: noteY } : null,
        noteTrace: noteTraceRef.current,
        fps: frame.fps,
        latencyMs: frame.latencyMs,
        devices,
        audioOutputDevices,
        audioOutputRoutingSupported: supportsExplicitAudioOutputRouting(),
        currentRootLabel,
        currentChordLabel,
        currentModeLabel: isCircleMode ? "Circle" : "Piano",
        logCount,
        warnings: [],
        startupNotice,
        audioOutputNotice,
        debug: {
          visibleHands: trackedHands.length,
          leftHand: toDebugHandInfo(stableLeftHand),
          rightHand: toDebugHandInfo(stableRightHand),
          focusTipLabel,
          focusTipRawX,
          focusTipProjectedX,
          touchDepth: latestTouchDepthRef.current,
          depthGate: liveSettings.depthGate,
          activeNotes: displayedActiveNoteLabels,
          touchTips,
          activeSemitone: displayedActiveSemitones[0] ?? null,
          fingerDepthSamples: latestFingerDepthSamplesRef.current,
          fingerDepthSamplesFresh: getFingerSampleFreshness(
            latestFingerDepthSampleTimestampsRef.current,
            frame.timestamp
          )
        },
        activeNaturalZones: displayedActiveNaturalZones,
        activeSharpZones: displayedActiveSharpZones,
        activeTouchMarkers: displayedActiveTouchMarkers,
        activeCircleSegments: displayedActiveCircleSegments,
        activeCircleMarkers: displayedActiveCircleMarkers,
        calibrationSession: calibrationUpdate.session
      });
    },
    [
      applyCalibrationCommit,
      armed,
      audioOutputDevices,
      audioOutputNotice,
      audioStatus,
      devices,
      startupNotice
    ]
  );

  useEffect(() => {
    commitFrameRef.current = commitFrame;
  }, [commitFrame]);

  const beginTracking = useCallback(
    async (deviceId: string, backendKind: InstrumentSettings["trackingBackend"]) => {
      if (!videoRef.current) {
        return;
      }

      setTrackerStatus("loading");
      trackerStatusRef.current = "loading";
      setError(null);

      try {
        trackerRef.current?.stop(streamRef.current);
        latestFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
        latestWeightedFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
        latestFingerDepthSampleTimestampsRef.current = emptyHandedFingerDepthSamples();
        lastRenderStateAtRef.current = 0;
        lastRenderSignatureRef.current = "";
        trackerRef.current = await createTrackerBackend(backendKind);
        await trackerRef.current.initialize();
        streamRef.current = await trackerRef.current.attachCamera(videoRef.current, deviceId);
        trackerRef.current.start(videoRef.current, (frame) => {
          commitFrameRef.current(frame);
        });
        setTrackerStatus("ready");
        trackerStatusRef.current = "ready";
        previousDeviceIdRef.current = deviceId;
        previousTrackerBackendRef.current = backendKind;
        void refreshDevices();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to initialize camera";
        setTrackerStatus("error");
        trackerStatusRef.current = "error";
        setError(message);
        setRenderState((current) => ({
          ...current,
          trackerStatus: "error",
          error: message
        }));
      }
    },
    [refreshDevices]
  );

  const startTracking = useCallback(async () => {
    if (!videoRef.current || trackerStatus === "loading" || trackerStatus === "ready") {
      return;
    }

    const liveSettings = settingsRef.current;
    await beginTracking(liveSettings.deviceId, liveSettings.trackingBackend);
  }, [beginTracking, trackerStatus]);

  useEffect(() => {
    if (!settingsReady || trackerStatus !== "ready") {
      previousDeviceIdRef.current = settings.deviceId;
      previousTrackerBackendRef.current = settings.trackingBackend;
      return;
    }

    if (
      previousDeviceIdRef.current === settings.deviceId &&
      previousTrackerBackendRef.current === settings.trackingBackend
    ) {
      return;
    }

    const liveSettings = settingsRef.current;
    void beginTracking(liveSettings.deviceId, liveSettings.trackingBackend);
  }, [beginTracking, settings.deviceId, settings.trackingBackend, settingsReady, trackerStatus]);

  const stopTracking = useCallback(() => {
    const restoredSettings =
      calibrationSessionRef.current.active && preCalibrationSettingsRef.current
        ? restorePreCalibrationFields(settingsRef.current, preCalibrationSettingsRef.current)
        : null;
    if (restoredSettings) {
      settingsRef.current = restoredSettings;
      setSettings(restoredSettings);
    }

    trackerRef.current?.stop(streamRef.current);
    streamRef.current = null;
    audioRef.current?.stopAll();
    lastMidiSignatureRef.current = null;
    lastCalibrationPreviewMidiSignatureRef.current = null;
    interactionRef.current = initialInteractionState;
    noteTraceRef.current = [];
    smoothedNoteXRef.current = null;
    stableHandSlotsRef.current = emptyStableHandSlots();
    latestTouchDepthRef.current = emptyHandedTouchDepthMap();
    latestFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
    latestWeightedFingerDepthSamplesRef.current = emptyHandedFingerDepthSamples();
    latestFingerDepthSampleTimestampsRef.current = emptyHandedFingerDepthSamples();
    lastRenderStateAtRef.current = 0;
    lastRenderSignatureRef.current = "";
    tipIntentMemoryRef.current = {};
    calibrationSessionRef.current = createIdleCalibrationSession();
    preCalibrationSettingsRef.current = null;
    setTrackerStatus("idle");
    trackerStatusRef.current = "idle";
    setRenderState((current) => ({
      ...current,
      trackerStatus: "idle",
      settings: restoredSettings ?? current.settings,
      audioStatus,
      interaction: initialInteractionState,
      overlayHands: [],
      noteCursor: null,
      noteTrace: [],
      warnings: [],
      startupNotice,
      audioOutputNotice,
      debug: {
        visibleHands: 0,
        leftHand: null,
        rightHand: null,
        focusTipLabel: null,
        focusTipRawX: null,
        focusTipProjectedX: null,
        touchDepth: emptyHandedTouchDepthMap(),
        depthGate: settingsRef.current.depthGate,
        activeNotes: [],
        touchTips: 0,
        activeSemitone: null,
        fingerDepthSamples: emptyHandedFingerDepthSamples(),
        fingerDepthSamplesFresh: emptyHandedFingerSampleFreshness()
      },
      activeNaturalZones: [],
      activeSharpZones: [],
      activeTouchMarkers: [],
      activeCircleSegments: { Left: [], Right: [] },
      activeCircleMarkers: [],
      calibrationSession: calibrationSessionRef.current
    }));
  }, [audioOutputNotice, audioStatus, startupNotice]);

  const armAudio = useCallback(async () => {
    if (armedRef.current || audioArmingRef.current) {
      return;
    }

    audioArmingRef.current = true;
    setAudioStatus("arming");
    setRenderState((current) => ({ ...current, audioStatus: "arming" }));

    try {
      if (!audioRef.current) {
        const { AudioEngine: RuntimeAudioEngine } = await import("../lib/audioEngine");
        audioRef.current = new RuntimeAudioEngine();
      }

      const liveSettings = settingsRef.current;
      const routed = await audioRef.current.start(
        liveSettings.synthPatch,
        liveSettings.volume,
        liveSettings.audioOutputDeviceId
      );
      armedRef.current = true;
      setArmed(true);
      setAudioStatus("armed");
      setStartupNotice(null);
      const notice =
        liveSettings.audioOutputDeviceId && !routed
          ? "Selected audio output could not be routed directly, so sound is using the browser default output."
          : null;
      previousAudioOutputDeviceIdRef.current = liveSettings.audioOutputDeviceId;
      setAudioOutputNotice(notice);
      setRenderState((current) => ({
        ...current,
        armed: true,
        audioStatus: "armed",
        startupNotice: null,
        audioOutputNotice: notice
      }));
    } catch (caughtError) {
      const nextAudioStatus: AudioStatus =
        caughtError instanceof Error && /import|module|routing|output/i.test(caughtError.message)
          ? "error"
          : "blocked";
      setAudioStatus(nextAudioStatus);
      const notice =
        nextAudioStatus === "blocked"
          ? "Browser blocked autoplay audio - sound will arm on your first click or key press."
          : "Audio initialization failed. Click the audio status pill to retry.";
      setStartupNotice(notice);
      setRenderState((current) => ({
        ...current,
        audioStatus: nextAudioStatus,
        startupNotice: notice
      }));
    } finally {
      audioArmingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (startupAttemptedRef.current || !videoRef.current || !settingsReady) {
      return;
    }

    startupAttemptedRef.current = true;
    void startTracking();
    void armAudio();
  }, [armAudio, settingsReady, startTracking]);

  useEffect(() => {
    if (armed) {
      setStartupNotice(null);
      return;
    }

    const retryAudio = () => {
      void armAudio();
    };

    window.addEventListener("pointerdown", retryAudio, { once: true });
    window.addEventListener("keydown", retryAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", retryAudio);
      window.removeEventListener("keydown", retryAudio);
    };
  }, [armed, armAudio, audioStatus]);

  const updateSettings = useCallback((patch: Partial<InstrumentSettings>) => {
    const previous = settingsRef.current;
    const next = { ...previous, ...patch };
    settingsRef.current = next;
    setSettings(next);

    if (patch.playMode !== undefined && patch.playMode !== previous.playMode) {
      audioRef.current?.syncMidiNotes([]);
      audioRef.current?.stopCalibrationPreview();
      lastMidiSignatureRef.current = null;
      lastCalibrationPreviewMidiSignatureRef.current = null;
      lastLoggedSemitoneSignatureRef.current = "";
      tipIntentMemoryRef.current = {};
      setRenderState((current) => ({
        ...current,
        currentRootLabel: null,
        currentChordLabel: patch.playMode === "circle" ? "Circle ready" : "Waiting for touch",
        currentModeLabel: patch.playMode === "circle" ? "Circle" : "Piano",
        activeNaturalZones: [],
        activeSharpZones: [],
        activeCircleSegments: { Left: [], Right: [] },
        activeCircleMarkers: [],
        activeTouchMarkers: []
      }));
    }

    if (armedRef.current && audioRef.current) {
      if (patch.synthPatch !== undefined) {
        audioRef.current.setPatch(next.synthPatch);
        lastMidiSignatureRef.current = null;
        lastCalibrationPreviewMidiSignatureRef.current = null;
      }
      if (patch.volume !== undefined) {
        audioRef.current.setVolume(next.volume);
      }
      if (patch.audioOutputDeviceId !== undefined) {
        routeAudioOutput(next.audioOutputDeviceId);
      }
    }

    const trackerSelectionChanged =
      patch.deviceId !== undefined || patch.trackingBackend !== undefined;
    if (trackerSelectionChanged && trackerStatusRef.current === "ready") {
      void beginTracking(next.deviceId, next.trackingBackend);
    }
  }, [beginTracking, routeAudioOutput]);

  const calibrateDepthGate = useCallback((handedness: Handedness) => {
    const sampledDepth = latestTouchDepthRef.current[handedness];
    if (sampledDepth === null) {
      return;
    }

    setSettings((current) => {
      const next = {
        ...current,
        depthGate: {
          ...current.depthGate,
          [handedness]: Number(Math.max(0.004, sampledDepth - 0.006).toFixed(3))
        }
      };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const calibrateFingerSensitivity = useCallback((handedness: Handedness) => {
    setSettings((current) => {
      const next = {
        ...current,
        fingerDepthSensitivity: {
          ...current.fingerDepthSensitivity,
          [handedness]: calibrateFingerDepthSensitivity(
            current.fingerDepthSensitivity[handedness],
            latestFingerDepthSamplesRef.current[handedness],
            current.depthGate[handedness]
          )
        }
      };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const calibrateSingleFingerSensitivity = useCallback((finger: FingertipName, handedness: Handedness) => {
    setSettings((current) => {
      const next = {
        ...current,
        fingerDepthSensitivity: {
          ...current.fingerDepthSensitivity,
          [handedness]: calibrateSingleFingerDepthSensitivity(
            current.fingerDepthSensitivity[handedness],
            latestFingerDepthSamplesRef.current[handedness],
            current.depthGate[handedness],
            finger
          )
        }
      };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const updateFingerTouchCalibration = useCallback(
    (finger: FingertipName, handedness: Handedness, field: "hoverDepth" | "pressDepth") => {
      const sampledDepth = latestWeightedFingerDepthSamplesRef.current[handedness][finger];
      const rawSampledDepth = latestFingerDepthSamplesRef.current[handedness][finger];
      const sampledAt = latestFingerDepthSampleTimestampsRef.current[handedness][finger];
      if (
        sampledDepth === null ||
        sampledAt === null ||
        performance.now() - sampledAt > MANUAL_TOUCH_SAMPLE_MAX_AGE_MS
      ) {
        return;
      }

      setSettings((current) => {
        const currentPoint = current.touchCalibration[handedness][finger];
        const rawField = field === "hoverDepth" ? "rawHoverDepth" as const : "rawPressDepth" as const;
        const nextPoint: TouchCalibrationPoint = {
          ...currentPoint,
          [field]: Number(sampledDepth.toFixed(5)),
          [rawField]:
            rawSampledDepth === null ? currentPoint[rawField] : Number(rawSampledDepth.toFixed(5)),
          sensitivityAtCalibration:
            current.fingerDepthSensitivity[handedness][finger],
          sampleCount: currentPoint.sampleCount + 1,
          updatedAt: Date.now()
        };
        nextPoint.direction = deriveTouchCalibrationDirection(
          nextPoint.rawHoverDepth ?? nextPoint.hoverDepth,
          nextPoint.rawPressDepth ?? nextPoint.pressDepth
        );

        const next = {
          ...current,
          touchCalibration: {
            ...current.touchCalibration,
            [handedness]: {
              ...current.touchCalibration[handedness],
              [finger]: nextPoint
            }
          }
        };
        settingsRef.current = next;
        return next;
      });
    },
    []
  );

  const setFingerHoverCalibration = useCallback(
    (finger: FingertipName, handedness: Handedness) => {
      updateFingerTouchCalibration(finger, handedness, "hoverDepth");
    },
    [updateFingerTouchCalibration]
  );

  const setFingerPressCalibration = useCallback(
    (finger: FingertipName, handedness: Handedness) => {
      updateFingerTouchCalibration(finger, handedness, "pressDepth");
    },
    [updateFingerTouchCalibration]
  );

  const applyCalibrationUpdateResult = useCallback(
    (result: ReturnType<typeof acceptPlayingFeelCalibration>) => {
      if (result.commit) {
        applyCalibrationCommit(result.commit);
      }

      calibrationSessionRef.current = result.session;
      audioRef.current?.syncMidiNotes([]);
      audioRef.current?.stopCalibrationPreview();
      lastMidiSignatureRef.current = "";
      lastCalibrationPreviewMidiSignatureRef.current = "";
      if (result.cue && settingsRef.current.calibrationAudioMode !== "off") {
        audioRef.current?.triggerCalibrationCue(result.cue);
      }
      if (!result.session.active && result.session.phase === "complete") {
        preCalibrationSettingsRef.current = null;
        if (settingsSaveTimeoutRef.current !== null) {
          window.clearTimeout(settingsSaveTimeoutRef.current);
          settingsSaveTimeoutRef.current = null;
        }
        void saveInstrumentSettings(settingsRef.current).catch(() => undefined);
      }

      setRenderState((current) => ({
        ...current,
        calibrationSession: result.session,
        activeNaturalZones: [],
        activeSharpZones: [],
        activeCircleSegments: { Left: [], Right: [] },
        activeCircleMarkers: [],
        currentRootLabel: null,
        currentChordLabel: result.session.active ? "Calibrating" : current.currentChordLabel
      }));
    },
    [applyCalibrationCommit]
  );

  const startPlayingFeelCalibrationFlow = useCallback(
    (scope: CalibrationScope) => {
      if (settingsSaveTimeoutRef.current !== null) {
        window.clearTimeout(settingsSaveTimeoutRef.current);
        settingsSaveTimeoutRef.current = null;
      }
      preCalibrationSettingsRef.current = settingsRef.current;
      const nextSession = startPlayingFeelCalibration(scope, performance.now());
      calibrationSessionRef.current = nextSession;
      lastCalibrationPhaseRef.current = nextSession.phase;
      audioRef.current?.syncMidiNotes([]);
      audioRef.current?.stopCalibrationPreview();
      lastMidiSignatureRef.current = "";
      lastCalibrationPreviewMidiSignatureRef.current = "";
      void startTracking();
      void armAudio();
      setRenderState((current) => ({
        ...current,
        calibrationSession: nextSession,
        activeNaturalZones: [],
        activeSharpZones: [],
        activeCircleSegments: { Left: [], Right: [] },
        activeCircleMarkers: [],
        currentRootLabel: null,
        currentChordLabel: "Calibrating"
      }));
    },
    [armAudio, startTracking]
  );

  const acceptPlayingFeelCalibrationStep = useCallback(() => {
    applyCalibrationUpdateResult(
      acceptPlayingFeelCalibration(calibrationSessionRef.current, performance.now(), true)
    );
  }, [applyCalibrationUpdateResult]);

  const retryPlayingFeelCalibrationStep = useCallback(() => {
    applyCalibrationUpdateResult(
      retryPlayingFeelCalibration(calibrationSessionRef.current, performance.now())
    );
  }, [applyCalibrationUpdateResult]);

  const skipPlayingFeelCalibrationStep = useCallback(() => {
    applyCalibrationUpdateResult(
      skipPlayingFeelCalibrationFinger(calibrationSessionRef.current, performance.now())
    );
  }, [applyCalibrationUpdateResult]);

  const cancelPlayingFeelCalibrationFlow = useCallback(() => {
    const nextSession = cancelPlayingFeelCalibration(
      calibrationSessionRef.current,
      performance.now()
    );
    const restoredSettings = preCalibrationSettingsRef.current
      ? restorePreCalibrationFields(settingsRef.current, preCalibrationSettingsRef.current)
      : null;
    calibrationSessionRef.current = nextSession;
    preCalibrationSettingsRef.current = null;
    audioRef.current?.syncMidiNotes([]);
    audioRef.current?.stopCalibrationPreview();
    lastMidiSignatureRef.current = "";
    lastCalibrationPreviewMidiSignatureRef.current = "";
    if (restoredSettings) {
      settingsRef.current = restoredSettings;
      setSettings(restoredSettings);
    }
    setRenderState((current) => ({
      ...current,
      settings: restoredSettings ?? current.settings,
      calibrationSession: nextSession,
      activeNaturalZones: [],
      activeSharpZones: [],
      activeCircleSegments: { Left: [], Right: [] },
      activeCircleMarkers: [],
      currentRootLabel: null,
      currentChordLabel: "Waiting for touch"
    }));
  }, []);

  useEffect(() => {
    const handleCalibrationKey = (event: KeyboardEvent) => {
      if (!calibrationSessionRef.current.active) {
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        acceptPlayingFeelCalibrationStep();
      } else if (event.key.toLowerCase() === "r") {
        retryPlayingFeelCalibrationStep();
      } else if (event.key.toLowerCase() === "s") {
        skipPlayingFeelCalibrationStep();
      } else if (event.key === "Escape") {
        cancelPlayingFeelCalibrationFlow();
      }
    };

    window.addEventListener("keydown", handleCalibrationKey);
    return () => window.removeEventListener("keydown", handleCalibrationKey);
  }, [
    acceptPlayingFeelCalibrationStep,
    cancelPlayingFeelCalibrationFlow,
    retryPlayingFeelCalibrationStep,
    skipPlayingFeelCalibrationStep
  ]);

  const exportLogs = useCallback(() => {
    downloadJsonFile(
      `chordglyph-session-${new Date().toISOString().replaceAll(":", "-")}.json`,
      loggerRef.current.export()
    );
  }, []);

  return useMemo(
    () => ({
      videoRef,
      state: {
        ...renderState,
        trackerStatus,
        error,
        armed,
        audioStatus,
        settings,
        devices,
        audioOutputDevices,
        startupNotice,
        audioOutputNotice,
        audioOutputRoutingSupported: supportsExplicitAudioOutputRouting()
      },
      startTracking,
      stopTracking,
      armAudio,
      calibrateDepthGate,
      calibrateFingerSensitivity,
      calibrateSingleFingerSensitivity,
      setFingerHoverCalibration,
      setFingerPressCalibration,
      startPlayingFeelCalibration: startPlayingFeelCalibrationFlow,
      acceptPlayingFeelCalibrationStep,
      retryPlayingFeelCalibrationStep,
      skipPlayingFeelCalibrationStep,
      cancelPlayingFeelCalibrationFlow,
      updateSettings,
      exportLogs
    }),
    [
      acceptPlayingFeelCalibrationStep,
      armAudio,
      armed,
      audioOutputDevices,
      audioOutputNotice,
      audioStatus,
      calibrateFingerSensitivity,
      calibrateSingleFingerSensitivity,
      calibrateDepthGate,
      cancelPlayingFeelCalibrationFlow,
      devices,
      error,
      exportLogs,
      renderState,
      retryPlayingFeelCalibrationStep,
      setFingerHoverCalibration,
      setFingerPressCalibration,
      skipPlayingFeelCalibrationStep,
      settings,
      startPlayingFeelCalibrationFlow,
      startTracking,
      startupNotice,
      stopTracking,
      trackerStatus,
      updateSettings
    ]
  );
}
