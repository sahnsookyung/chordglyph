import { useEffect, useMemo, useRef, useState } from "react";
import { useGestureInstrument } from "./hooks/useGestureInstrument";
import { AppTopBar } from "./components/AppTopBar";
import { ControlPanel } from "./components/ControlPanel";
import { FINGERTIP_SENSITIVITY_CONTROLS } from "./components/appShared";
import { StageSection } from "./components/StageSection";
import { drawHandPath } from "./components/stageRendering";
import { MAX_CIRCLE_NOTE_OCTAVE, MAX_CIRCLE_OPEN_OCTAVE_SHIFT, MIN_CIRCLE_NOTE_OCTAVE, MIN_CIRCLE_OPEN_OCTAVE_SHIFT } from "./lib/constants";
import { getCircleLayout } from "./lib/circleMode";
import { getVisibleKeyNames, PIANO_BLACK_KEY_WIDTH_RATIO } from "./lib/music";
import { getStripBounds } from "./lib/noteMapping";
import { getPianoLayout, getPianoVerticalOffsetBounds, getWhiteHitSegments } from "./lib/pianoLayout";
import { getCalibrationAcceptedControlZones } from "./lib/playingFeelCalibration";
import type {
  CalibrationScope,
  CircleNoteName,
  FingerActivationTuning,
  FingerActivationTuningMap,
  FingertipName,
  Handedness
} from "./lib/types";

function getCalibrationAcceptLabel(phase: string): string {
  if (phase === "finger-summary") {
    return "Next Finger";
  }
  if (phase === "preview") {
    return "Finish";
  }
  if (phase === "paused") {
    return "Resume";
  }
  return "Accept";
}

function getCalibrationRetryLabel(phase: string): string {
  return phase === "finger-summary" ? "Redo Finger" : "Retry";
}

export default function App() {
  const {
    videoRef,
    state,
    calibrateFingerSensitivity,
    calibrateDepthGate,
    exportLogs,
    setFingerHoverCalibration,
    setFingerPressCalibration,
    startPlayingFeelCalibration,
    acceptPlayingFeelCalibrationStep,
    retryPlayingFeelCalibrationStep,
    skipPlayingFeelCalibrationStep,
    cancelPlayingFeelCalibrationFlow,
    startTracking,
    stopTracking,
    armAudio,
    updateSettings
  } = useGestureInstrument();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 1280, height: 720 });
  const [guidedCalibrationIndex, setGuidedCalibrationIndex] = useState<number | null>(null);
  const [guidedActivationPhase, setGuidedActivationPhase] = useState<"hover" | "press">("hover");
  const [calibrationHand, setCalibrationHand] = useState<Handedness>("Right");
  const [calibrationScope, setCalibrationScope] = useState<CalibrationScope>("Both");

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });

    if (stageRef.current) {
      observer.observe(stageRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.round(stageSize.width * pixelRatio));
    const nextHeight = Math.max(1, Math.round(stageSize.height * pixelRatio));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
  }, [stageSize]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = Math.max(1, stageSize.width);
    const height = Math.max(1, stageSize.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    state.noteTrace.forEach((point, index) => {
      const alpha = (index + 1) / state.noteTrace.length;
      context.fillStyle = `rgba(125, 211, 252, ${alpha * 0.65})`;
      context.beginPath();
      context.arc(point.x * width, point.y * height, 3 + alpha * 4, 0, Math.PI * 2);
      context.fill();
    });

    state.overlayHands.forEach(({ hand, role }) => {
      const strokeColors: Record<typeof role, string> = {
        note: "rgba(125, 211, 252, 0.95)",
        chord: "rgba(251, 146, 60, 0.95)",
        other: "rgba(226, 232, 240, 0.45)"
      };
      const idleColors: Record<typeof role, string> = {
        note: "#7dd3fc",
        chord: "#fb923c",
        other: "#e2e8f0"
      };
      const activeTouchMarkers = state.activeTouchMarkers.filter((marker) => marker.handId === hand.id);

      drawHandPath(
        context,
        hand.landmarks,
        width,
        height,
        strokeColors[role],
        state.settings.overlayThickness,
        activeTouchMarkers,
        idleColors[role],
        state.settings.hitBoxColor,
        state.settings.showFingertipStats && !state.settings.lowLatencyMode
      );
    });
  }, [
    stageSize,
    state.activeTouchMarkers,
    state.noteTrace,
    state.overlayHands,
    state.settings.hitBoxColor,
    state.settings.lowLatencyMode,
    state.settings.overlayThickness,
    state.settings.showFingertipStats
  ]);

  const noteNames = useMemo(
    () => getVisibleKeyNames(state.settings.pianoOctaves),
    [state.settings.pianoOctaves]
  );
  const pianoLayout = useMemo(
    () =>
      getPianoLayout(
        noteNames.length,
        state.settings.pianoVerticalOffset,
        state.settings.pianoHeightScale,
        state.settings.pianoOctaves
      ),
    [
      noteNames.length,
      state.settings.pianoHeightScale,
      state.settings.pianoOctaves,
      state.settings.pianoVerticalOffset
    ]
  );
  const whiteHitSegments = useMemo(
    () => getWhiteHitSegments(pianoLayout, noteNames.length),
    [noteNames.length, pianoLayout]
  );
  const pianoVerticalBounds = useMemo(
    () => getPianoVerticalOffsetBounds(state.settings.pianoHeightScale),
    [state.settings.pianoHeightScale]
  );
  const pianoHorizontalBounds = useMemo(
    () => getStripBounds(state.settings.noteStripSize, state.settings.pianoWidthScale),
    [state.settings.noteStripSize, state.settings.pianoWidthScale]
  );
  const circleLayouts = useMemo(
    () => ({
      Left: getCircleLayout("Left"),
      Right: getCircleLayout("Right")
    }),
    []
  );
  const calibrationControlZones = useMemo(
    () =>
      state.calibrationSession.active
        ? getCalibrationAcceptedControlZones(
            state.calibrationSession.controlHand,
            pianoLayout,
            pianoHorizontalBounds
          )
        : [],
    [
      pianoHorizontalBounds,
      pianoLayout,
      state.calibrationSession.active,
      state.calibrationSession.controlHand
    ]
  );

  const calibrationHandProgress =
    state.calibrationSession.handQueue.length === 0
      ? "0 / 0"
      : `${state.calibrationSession.handIndex + 1} / ${state.calibrationSession.handQueue.length}`;
  const calibrationFingerProgress = `${state.calibrationSession.fingerIndex + 1} / ${FINGERTIP_SENSITIVITY_CONTROLS.length}`;
  const calibrationPhase = state.calibrationSession.phase;
  const calibrationAcceptLabel = getCalibrationAcceptLabel(calibrationPhase);
  const calibrationRetryLabel = getCalibrationRetryLabel(calibrationPhase);
  const calibrationSkipDisabled = [
    "control-rehearsal",
    "finger-summary",
    "preview",
    "paused"
  ].includes(calibrationPhase);
  const blackKeyWidth = `${((100 / noteNames.length) * PIANO_BLACK_KEY_WIDTH_RATIO).toFixed(2)}%`;
  const blackKeyTop = `${((pianoLayout.blackKeyTopY - pianoLayout.topY) / pianoLayout.heightRatio) * 100}%`;
  const blackKeyHeight =
    `${((pianoLayout.blackKeyBottomY - pianoLayout.blackKeyTopY) / pianoLayout.heightRatio) * 100}%`;

  const updateHandActivationTuning = (
    patch: Partial<FingerActivationTuning>,
    legacyPatch: Partial<
      Pick<
        typeof state.settings,
        | "hardActivationThreshold"
        | "pressActivationThreshold"
        | "releaseActivationThreshold"
        | "touchDwellMs"
        | "pressVelocityThreshold"
        | "releaseVelocityThreshold"
        | "activationVelocitySmoothing"
      >
    > = {}
  ) => {
    updateSettings({
      ...legacyPatch,
      activationTuning: {
        ...state.settings.activationTuning,
        [calibrationHand]: Object.fromEntries(
          FINGERTIP_SENSITIVITY_CONTROLS.map(({ key }) => [
            key,
            {
              ...state.settings.activationTuning[calibrationHand][key],
              ...patch
            }
          ])
        ) as FingerActivationTuningMap
      }
    });
  };

  const updateFingerActivationTuning = (
    finger: FingertipName,
    patch: Partial<FingerActivationTuning>
  ) => {
    updateSettings({
      activationTuning: {
        ...state.settings.activationTuning,
        [calibrationHand]: {
          ...state.settings.activationTuning[calibrationHand],
          [finger]: {
            ...state.settings.activationTuning[calibrationHand][finger],
            ...patch
          }
        }
      }
    });
  };

  const updateCircleFingerEnabled = (
    hand: Handedness,
    finger: FingertipName,
    enabled: boolean
  ) => {
    updateSettings({
      circleFingerEnabled: {
        ...state.settings.circleFingerEnabled,
        [hand]: {
          ...state.settings.circleFingerEnabled[hand],
          [finger]: enabled
        }
      }
    });
  };

  const updateCircleOfFifths = (hand: Handedness, enabled: boolean) => {
    updateSettings({
      circleOfFifths: {
        ...state.settings.circleOfFifths,
        [hand]: enabled
      }
    });
  };

  const updateCircleNoteOctave = (hand: Handedness, note: CircleNoteName, octave: number) => {
    if (!Number.isFinite(octave)) {
      return;
    }

    const clampedOctave = Math.min(
      MAX_CIRCLE_NOTE_OCTAVE,
      Math.max(MIN_CIRCLE_NOTE_OCTAVE, Math.round(octave))
    );
    updateSettings({
      circleNoteOctaves: {
        ...state.settings.circleNoteOctaves,
        [hand]: {
          ...state.settings.circleNoteOctaves[hand],
          [note]: clampedOctave
        }
      }
    });
  };

  const updateCircleOpenOctaveShift = (hand: Handedness, shift: number) => {
    if (!Number.isFinite(shift)) {
      return;
    }

    updateSettings({
      circleOpenOctaveShift: {
        ...state.settings.circleOpenOctaveShift,
        [hand]: Math.min(
          MAX_CIRCLE_OPEN_OCTAVE_SHIFT,
          Math.max(MIN_CIRCLE_OPEN_OCTAVE_SHIFT, Math.round(shift))
        )
      }
    });
  };

  return (
    <div className={state.settings.lowLatencyMode ? "app-shell low-latency" : "app-shell"}>
      <AppTopBar
        playMode={state.settings.playMode}
        audioStatus={state.audioStatus}
        trackerStatus={state.trackerStatus}
        calibrationScope={calibrationScope}
        calibrationActive={state.calibrationSession.active}
        error={state.error}
        warning={state.warnings[0] ?? null}
        startupNotice={state.startupNotice}
        audioOutputNotice={state.audioOutputNotice}
        onPlayModeChange={(value) => updateSettings({ playMode: value })}
        onArmAudio={() => void armAudio()}
        onStartTracking={() => void startTracking()}
        onStopTracking={() => {
          setGuidedCalibrationIndex(null);
          setGuidedActivationPhase("hover");
          stopTracking();
        }}
        onCalibrationScopeChange={setCalibrationScope}
        onStartCalibration={() => startPlayingFeelCalibration(calibrationScope)}
        onCancelCalibration={cancelPlayingFeelCalibrationFlow}
      />

      <div className="workspace-shell">
        <ControlPanel
          state={state}
          calibrationHand={calibrationHand}
          guidedCalibrationIndex={guidedCalibrationIndex}
          guidedActivationPhase={guidedActivationPhase}
          pianoVerticalBounds={pianoVerticalBounds}
          onCalibrationHandChange={setCalibrationHand}
          onGuidedCalibrationIndexChange={setGuidedCalibrationIndex}
          onGuidedActivationPhaseChange={setGuidedActivationPhase}
          onUpdateSettings={updateSettings}
          onUpdateHandActivationTuning={updateHandActivationTuning}
          onUpdateFingerActivationTuning={updateFingerActivationTuning}
          onUpdateCircleFingerEnabled={updateCircleFingerEnabled}
          onUpdateCircleOfFifths={updateCircleOfFifths}
          onUpdateCircleNoteOctave={updateCircleNoteOctave}
          onUpdateCircleOpenOctaveShift={updateCircleOpenOctaveShift}
          onCalibrateFingerSensitivity={calibrateFingerSensitivity}
          onSetFingerHoverCalibration={setFingerHoverCalibration}
          onSetFingerPressCalibration={setFingerPressCalibration}
          onCalibrateDepthGate={calibrateDepthGate}
          onExportLogs={exportLogs}
        />

        <StageSection
          videoRef={videoRef}
          overlayRef={overlayRef}
          stageRef={stageRef}
          state={state}
          circleLayouts={circleLayouts}
          calibrationControlZones={calibrationControlZones}
          calibrationHandProgress={calibrationHandProgress}
          calibrationFingerProgress={calibrationFingerProgress}
          calibrationAcceptLabel={calibrationAcceptLabel}
          calibrationRetryLabel={calibrationRetryLabel}
          calibrationSkipDisabled={calibrationSkipDisabled}
          noteNames={noteNames}
          pianoLayout={pianoLayout}
          pianoHorizontalBounds={pianoHorizontalBounds}
          whiteHitSegments={whiteHitSegments}
          blackKeyWidth={blackKeyWidth}
          blackKeyTop={blackKeyTop}
          blackKeyHeight={blackKeyHeight}
          onAcceptCalibration={acceptPlayingFeelCalibrationStep}
          onRetryCalibration={retryPlayingFeelCalibrationStep}
          onSkipCalibration={skipPlayingFeelCalibrationStep}
          onCancelCalibration={cancelPlayingFeelCalibrationFlow}
        />
      </div>
    </div>
  );
}
