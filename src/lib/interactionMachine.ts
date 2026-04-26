import { TRACKING_THRESHOLDS } from "./constants";
import { resolveNoteZone } from "./noteMapping";
import type {
  AudioEvent,
  ChordMode,
  GestureClassification,
  SystemState,
  TriggerMode
} from "./types";

export interface InteractionFrame {
  timestamp: number;
  noteX: number | null;
  noteConfidence: number;
  chordConfidence: number;
  notePinch: boolean;
  chordGesture: GestureClassification | null;
}

export interface InteractionState {
  systemState: SystemState;
  stableMode: ChordMode;
  currentZone: number | null;
  currentRoot: number | null;
  currentRootSince: number | null;
  lastTriggeredRoot: number | null;
  lastTriggerAt: number;
  lastNoteVisibleAt: number | null;
  lastChordVisibleAt: number | null;
  chordCandidateMode: ChordMode | null;
  chordCandidateSince: number | null;
  ambiguousSince: number | null;
  notePinchActive: boolean;
  isSounding: boolean;
  warnings: string[];
}

export interface InteractionUpdate {
  state: InteractionState;
  events: AudioEvent[];
}

export interface InteractionOptions {
  triggerMode: TriggerMode;
  dwellMs: number;
  cooldownMs: number;
  noteLossMs: number;
  chordLossMs: number;
  chordPersistenceMs: number;
  ambiguityTimeoutMs: number;
}

export const DEFAULT_INTERACTION_OPTIONS: InteractionOptions = {
  triggerMode: "hover",
  dwellMs: TRACKING_THRESHOLDS.dwellMs,
  cooldownMs: TRACKING_THRESHOLDS.cooldownMs,
  noteLossMs: TRACKING_THRESHOLDS.noteLossMs,
  chordLossMs: TRACKING_THRESHOLDS.chordLossMs,
  chordPersistenceMs: TRACKING_THRESHOLDS.chordPersistenceMs,
  ambiguityTimeoutMs: TRACKING_THRESHOLDS.ambiguityTimeoutMs
};

export const initialInteractionState: InteractionState = {
  systemState: "BOOT",
  stableMode: "single",
  currentZone: null,
  currentRoot: null,
  currentRootSince: null,
  lastTriggeredRoot: null,
  lastTriggerAt: -Infinity,
  lastNoteVisibleAt: null,
  lastChordVisibleAt: null,
  chordCandidateMode: null,
  chordCandidateSince: null,
  ambiguousSince: null,
  notePinchActive: false,
  isSounding: false,
  warnings: []
};

function shouldStopForMissingNote(
  state: InteractionState,
  timestamp: number,
  noteVisible: boolean,
  options: InteractionOptions
): boolean {
  if (noteVisible || state.lastNoteVisibleAt === null) {
    return false;
  }
  return timestamp - state.lastNoteVisibleAt > options.noteLossMs && state.isSounding;
}

function createNextInteractionState(
  state: InteractionState,
  frame: InteractionFrame,
  noteVisible: boolean,
  chordVisible: boolean
): InteractionState {
  return {
    ...state,
    systemState: noteVisible || chordVisible ? "TRACKING_ACTIVE" : "TRACKING_SEARCH",
    warnings: [],
    lastNoteVisibleAt: noteVisible ? frame.timestamp : state.lastNoteVisibleAt,
    lastChordVisibleAt: chordVisible ? frame.timestamp : state.lastChordVisibleAt,
    notePinchActive: frame.notePinch
  };
}

function updateRootTracking(
  state: InteractionState,
  nextState: InteractionState,
  frame: InteractionFrame
): void {
  const resolvedNoteX = frame.noteX ?? 0;
  const zone = resolveNoteZone(resolvedNoteX, state.currentZone);
  const zoneChanged = zone !== state.currentZone;

  if (zoneChanged) {
    nextState.currentZone = zone;
    nextState.currentRoot = zone;
    nextState.currentRootSince = frame.timestamp;
    return;
  }

  nextState.currentZone = state.currentZone;
  nextState.currentRoot = state.currentRoot ?? zone;
  nextState.currentRootSince = state.currentRootSince ?? frame.timestamp;
}

function shouldTriggerZonePlayback(
  state: InteractionState,
  nextState: InteractionState,
  frame: InteractionFrame,
  options: InteractionOptions
): { shouldTrigger: boolean; cooldownElapsed: boolean; modeChangedWhileHolding: boolean } {
  const hasRoot = nextState.currentRoot !== null;
  const modeChangedWhileHolding = hasRoot && nextState.isSounding && nextState.stableMode !== state.stableMode;
  const zoneReady =
    hasRoot &&
    nextState.currentRootSince !== null &&
    frame.timestamp - nextState.currentRootSince >= options.dwellMs;
  const cooldownElapsed = frame.timestamp - state.lastTriggerAt >= options.cooldownMs;
  const pinchEdge = frame.notePinch && !state.notePinchActive;
  const rootChanged = nextState.currentRoot !== state.lastTriggeredRoot;
  const shouldTriggerForZoneChange = zoneReady && cooldownElapsed && (rootChanged || modeChangedWhileHolding);

  if (options.triggerMode !== "hover") {
    return {
      shouldTrigger: shouldTriggerForZoneChange && pinchEdge,
      cooldownElapsed,
      modeChangedWhileHolding
    };
  }

  return {
    shouldTrigger: shouldTriggerForZoneChange,
    cooldownElapsed,
    modeChangedWhileHolding
  };
}

function pushPlayEvent(
  events: AudioEvent[],
  nextState: InteractionState,
  timestamp: number
): void {
  if (nextState.currentRoot === null) {
    return;
  }

  nextState.isSounding = true;
  nextState.systemState = "PLAYING";
  nextState.lastTriggerAt = timestamp;
  nextState.lastTriggeredRoot = nextState.currentRoot;
  events.push({
    kind: "play",
    rootIndex: nextState.currentRoot,
    mode: nextState.stableMode,
    timestamp
  });
}

function resolveMode(
  state: InteractionState,
  frame: InteractionFrame,
  options: InteractionOptions
): Pick<
  InteractionState,
  "stableMode" | "chordCandidateMode" | "chordCandidateSince" | "ambiguousSince" | "warnings"
> {
  const warnings: string[] = [];
  const chordVisible = frame.chordConfidence >= TRACKING_THRESHOLDS.chordConfidence;

  if (!chordVisible || frame.chordGesture === null) {
    if (
      state.lastChordVisibleAt !== null &&
      frame.timestamp - state.lastChordVisibleAt > options.chordLossMs
    ) {
      warnings.push("Chord hand lost - reverting to single note");
      return {
        stableMode: "single",
        chordCandidateMode: null,
        chordCandidateSince: null,
        ambiguousSince: null,
        warnings
      };
    }

    warnings.push("Chord hand lost - holding previous mode");
    return {
      stableMode: state.stableMode,
      chordCandidateMode: null,
      chordCandidateSince: null,
      ambiguousSince: state.ambiguousSince,
      warnings
    };
  }

  if (frame.chordGesture.ambiguous) {
    const ambiguousSince = state.ambiguousSince ?? frame.timestamp;
    if (frame.timestamp - ambiguousSince > options.ambiguityTimeoutMs) {
      warnings.push("Tracking weak - reverting to single note");
      return {
        stableMode: "single",
        chordCandidateMode: null,
        chordCandidateSince: null,
        ambiguousSince,
        warnings
      };
    }

    warnings.push("Ambiguous chord gesture - holding previous mode");
    return {
      stableMode: state.stableMode,
      chordCandidateMode: null,
      chordCandidateSince: null,
      ambiguousSince,
      warnings
    };
  }

  if (frame.chordGesture.mode === state.stableMode) {
    return {
      stableMode: state.stableMode,
      chordCandidateMode: null,
      chordCandidateSince: null,
      ambiguousSince: null,
      warnings
    };
  }

  if (state.chordCandidateMode !== frame.chordGesture.mode) {
    return {
      stableMode: state.stableMode,
      chordCandidateMode: frame.chordGesture.mode,
      chordCandidateSince: frame.timestamp,
      ambiguousSince: null,
      warnings
    };
  }

  if (
    state.chordCandidateSince !== null &&
    frame.timestamp - state.chordCandidateSince >= options.chordPersistenceMs
  ) {
    return {
      stableMode: frame.chordGesture.mode,
      chordCandidateMode: null,
      chordCandidateSince: null,
      ambiguousSince: null,
      warnings
    };
  }

  return {
    stableMode: state.stableMode,
    chordCandidateMode: state.chordCandidateMode,
    chordCandidateSince: state.chordCandidateSince,
    ambiguousSince: null,
    warnings
  };
}

export function updateInteractionState(
  state: InteractionState,
  frame: InteractionFrame,
  options: InteractionOptions = DEFAULT_INTERACTION_OPTIONS
): InteractionUpdate {
  const events: AudioEvent[] = [];
  const noteVisible = frame.noteConfidence >= TRACKING_THRESHOLDS.noteConfidence && frame.noteX !== null;
  const chordVisible =
    frame.chordConfidence >= TRACKING_THRESHOLDS.chordConfidence && frame.chordGesture !== null;
  const nextState = createNextInteractionState(state, frame, noteVisible, chordVisible);

  const modeState = resolveMode(nextState, frame, options);
  nextState.stableMode = modeState.stableMode;
  nextState.chordCandidateMode = modeState.chordCandidateMode;
  nextState.chordCandidateSince = modeState.chordCandidateSince;
  nextState.ambiguousSince = modeState.ambiguousSince;
  nextState.warnings = modeState.warnings;

  if (shouldStopForMissingNote(state, frame.timestamp, noteVisible, options)) {
    nextState.isSounding = false;
    nextState.systemState = "DEGRADED_TRACKING";
    nextState.currentZone = null;
    nextState.currentRoot = null;
    nextState.currentRootSince = null;
    events.push({
      kind: "stop",
      rootIndex: null,
      mode: nextState.stableMode,
      timestamp: frame.timestamp
    });
    return { state: nextState, events };
  }

  if (!noteVisible) {
    return { state: nextState, events };
  }

  updateRootTracking(state, nextState, frame);
  const playbackState = shouldTriggerZonePlayback(state, nextState, frame, options);

  if (playbackState.shouldTrigger) {
    pushPlayEvent(events, nextState, frame.timestamp);
  }

  if (playbackState.modeChangedWhileHolding && playbackState.cooldownElapsed) {
    pushPlayEvent(events, nextState, frame.timestamp);
  }

  return { state: nextState, events };
}
