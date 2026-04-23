import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getVisibleKeyNames,
  PIANO_BLACK_KEY_WIDTH_RATIO
} from "./lib/music";
import {
  getPianoLayout,
  getPianoVerticalOffsetBounds,
  MAX_PIANO_HEIGHT_SCALE,
  getWhiteHitSegments
} from "./lib/pianoLayout";
import { getStripBounds } from "./lib/noteMapping";
import { getCalibrationAcceptedControlZones } from "./lib/playingFeelCalibration";
import { MAX_PIANO_OCTAVES, MIN_PIANO_OCTAVES } from "./lib/constants";
import type {
  CalibrationScope,
  FingerActivationTuning,
  FingerActivationTuningMap,
  FingertipName,
  Handedness,
  Landmark,
  TrackerBackendKind
} from "./lib/types";
import { useGestureInstrument } from "./hooks/useGestureInstrument";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17]
] as const;

const FINGERTIP_SENSITIVITY_CONTROLS: Array<{ key: FingertipName; label: string }> = [
  { key: "thumb", label: "Thumb" },
  { key: "index", label: "Index" },
  { key: "middle", label: "Middle" },
  { key: "ring", label: "Ring" },
  { key: "pinky", label: "Pinky" }
];

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(249, 115, 22, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHexColors(startHex: string, endHex: string, amount: number, alpha = 1): string {
  const normalizedAmount = Math.max(0, Math.min(1, amount));
  const parseHex = (value: string) => {
    const normalized = value.trim().replace("#", "");
    if (normalized.length !== 6) {
      return { red: 249, green: 115, blue: 22 };
    }

    return {
      red: Number.parseInt(normalized.slice(0, 2), 16),
      green: Number.parseInt(normalized.slice(2, 4), 16),
      blue: Number.parseInt(normalized.slice(4, 6), 16)
    };
  };

  const start = parseHex(startHex);
  const end = parseHex(endHex);

  return `rgba(${Math.round(start.red + (end.red - start.red) * normalizedAmount)}, ${Math.round(
    start.green + (end.green - start.green) * normalizedAmount
  )}, ${Math.round(start.blue + (end.blue - start.blue) * normalizedAmount)}, ${alpha})`;
}

function drawHandPath(
  context: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  stroke: string,
  thickness: number,
  activeTouchMarkers: Array<{
    tipIndex: number;
    modelZ: number;
    rawDepthScore: number;
    sensitivity: number;
    depthScore: number;
    activationProgress: number;
    activationVelocity: number;
    isCalibrated: boolean;
    isPressed: boolean;
  }>,
  idleTipColor: string,
  activeColor: string,
  showLabels: boolean
): void {
  context.strokeStyle = stroke;
  context.lineWidth = 1 + thickness * 2.2;
  HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  });

  const touchMarkerByTip = new Map(
    activeTouchMarkers.map((marker) => [marker.tipIndex, marker] as const)
  );

  landmarks.forEach((landmark, index) => {
    const tipMarker = touchMarkerByTip.get(index);
    const isFingertip = touchMarkerByTip.has(index) || [4, 8, 12, 16, 20].includes(index);
    context.fillStyle = tipMarker
      ? mixHexColors(
          idleTipColor,
          activeColor,
          tipMarker.activationProgress,
          tipMarker.isPressed ? 1 : 0.45 + tipMarker.activationProgress * 0.45
        )
      : isFingertip
        ? hexToRgba(idleTipColor, 0.7)
        : stroke;
    context.beginPath();
    const radius = tipMarker
      ? 3.6 + thickness * 3.4 + tipMarker.activationProgress * 2.4
      : isFingertip
        ? 2.6 + thickness * 2.8
        : 1.8 + thickness * 2.2;
    context.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
    context.fill();
  });

  if (!showLabels) {
    return;
  }

  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.font = '600 11px "Space Grotesk", sans-serif';

  activeTouchMarkers.forEach((marker) => {
    const tip = landmarks[marker.tipIndex];
    if (!tip) {
      return;
    }

    const labelX = tip.x * width + 10;
    const labelY = tip.y * height - 12;
    const labelColor = mixHexColors(
      idleTipColor,
      activeColor,
      marker.activationProgress,
      marker.isPressed ? 1 : 0.92
    );

    context.lineWidth = 3;
    context.strokeStyle = "rgba(5, 10, 15, 0.88)";
    context.fillStyle = labelColor;

    const modelLabel = `model ${marker.modelZ.toFixed(3)}`;
    const rawLabel = `base ${marker.rawDepthScore.toFixed(3)}`;
    const sensitivityLabel = `s ${marker.sensitivity.toFixed(2)}`;
    const weightedLabel = `wd ${marker.depthScore.toFixed(3)}`;
    const activationLabel = `act ${marker.activationProgress.toFixed(2)}${marker.isCalibrated ? "" : "*"}`;
    const velocityLabel = `v ${marker.activationVelocity.toFixed(2)}`;

    context.strokeText(modelLabel, labelX, labelY);
    context.fillText(modelLabel, labelX, labelY);
    context.strokeText(rawLabel, labelX, labelY + 13);
    context.fillText(rawLabel, labelX, labelY + 13);
    context.strokeText(sensitivityLabel, labelX, labelY + 26);
    context.fillText(sensitivityLabel, labelX, labelY + 26);
    context.strokeText(weightedLabel, labelX, labelY + 39);
    context.fillText(weightedLabel, labelX, labelY + 39);
    context.strokeText(activationLabel, labelX, labelY + 52);
    context.fillText(activationLabel, labelX, labelY + 52);
    context.strokeText(velocityLabel, labelX, labelY + 65);
    context.fillText(velocityLabel, labelX, labelY + 65);
  });
}

function confidenceTone(value: number): string {
  if (value > 45) {
    return "#4ade80";
  }
  if (value > 25) {
    return "#f59e0b";
  }
  return "#fb7185";
}

function formatDebugValue(value: number | null, digits = 2): string {
  return value === null ? "--" : value.toFixed(digits);
}

function formatCalibrationQuality(value: number | null): string {
  return value === null ? "--" : `${Math.round(value * 100)}%`;
}

interface RangeNumberControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  help?: string;
  className?: string;
}

function RangeNumberControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  help,
  className
}: RangeNumberControlProps) {
  const applyValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const clamped = Math.min(max, Math.max(min, nextValue));
    onChange(Number(clamped.toFixed(6)));
  };

  return (
    <label className={className}>
      <span>{label}</span>
      <div className="range-number-row">
        <input
          className="range-number-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => applyValue(Number(event.target.value))}
        />
        <input
          className="range-number-input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => applyValue(Number(event.target.value))}
        />
      </div>
      {help ? <small className="settings-help">{help}</small> : null}
    </label>
  );
}

export default function App() {
  const {
    videoRef,
    state,
    calibrateFingerSensitivity,
    calibrateSingleFingerSensitivity,
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
    context.strokeStyle = "rgba(255,255,255,0.2)";
    context.fillStyle = "rgba(255,255,255,0.18)";

    state.noteTrace.forEach((point, index) => {
      const alpha = (index + 1) / state.noteTrace.length;
      context.fillStyle = `rgba(125, 211, 252, ${alpha * 0.65})`;
      context.beginPath();
      context.arc(point.x * width, point.y * height, 3 + alpha * 4, 0, Math.PI * 2);
      context.fill();
    });

    state.overlayHands.forEach(({ hand, role }) => {
      const stroke =
        role === "note" ? "rgba(125, 211, 252, 0.95)" : role === "chord" ? "rgba(251, 146, 60, 0.95)" : "rgba(226, 232, 240, 0.45)";
      const activeTouchMarkers = state.activeTouchMarkers.filter((marker) => marker.handId === hand.id);
      drawHandPath(
        context,
        hand.landmarks,
        width,
        height,
        stroke,
        state.settings.overlayThickness,
        activeTouchMarkers,
        role === "note" ? "#7dd3fc" : role === "chord" ? "#fb923c" : "#e2e8f0",
        state.settings.hitBoxColor,
        !state.settings.lowLatencyMode
      );
    });
  }, [
    stageSize,
    state.activeTouchMarkers,
    state.calibrationSession.active,
    state.noteTrace,
    state.overlayHands,
    state.settings.hitBoxColor,
    state.settings.lowLatencyMode,
    state.settings.overlayThickness
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
  const blackKeyWidth = `${((100 / noteNames.length) * PIANO_BLACK_KEY_WIDTH_RATIO).toFixed(2)}%`;
  const blackKeyTop = `${((pianoLayout.blackKeyTopY - pianoLayout.topY) / pianoLayout.heightRatio) * 100}%`;
  const blackKeyHeight =
    `${((pianoLayout.blackKeyBottomY - pianoLayout.blackKeyTopY) / pianoLayout.heightRatio) * 100}%`;
  const guidedCalibrationFinger =
    guidedCalibrationIndex === null ? null : FINGERTIP_SENSITIVITY_CONTROLS[guidedCalibrationIndex] ?? null;
  const hasFingerDepthSamples = FINGERTIP_SENSITIVITY_CONTROLS.some(
    ({ key }) => state.debug.fingerDepthSamplesFresh[calibrationHand][key]
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
  const calibrationFingerProgress =
    `${state.calibrationSession.fingerIndex + 1} / ${FINGERTIP_SENSITIVITY_CONTROLS.length}`;
  const calibrationPhase = state.calibrationSession.phase;
  const calibrationAcceptLabel =
    calibrationPhase === "finger-summary"
      ? "Next Finger"
      : calibrationPhase === "preview"
        ? "Finish"
        : calibrationPhase === "paused"
          ? "Resume"
          : "Accept";
  const calibrationRetryLabel =
    calibrationPhase === "finger-summary" ? "Redo Finger" : "Retry";
  const calibrationSkipDisabled =
    calibrationPhase === "control-rehearsal" ||
    calibrationPhase === "finger-summary" ||
    calibrationPhase === "preview" ||
    calibrationPhase === "paused";
  const selectedHandBulkTuning =
    state.settings.activationTuning[calibrationHand].index;
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

  useEffect(() => {
    if (state.trackerStatus !== "ready") {
      setGuidedCalibrationIndex(null);
      setGuidedActivationPhase("hover");
    }
  }, [state.trackerStatus]);

  return (
    <div className={state.settings.lowLatencyMode ? "app-shell low-latency" : "app-shell"}>
      <header className="app-topbar">
        <div className="brand-block topbar-brand">
          <h1>ChordGlyph</h1>
          <p className="topbar-subtitle">Fingertip piano</p>
        </div>

        <div className="topbar-actions">
          <div className="button-row topbar-buttons">
            {state.trackerStatus === "ready" ? (
              <span className="topbar-live-pill">Camera live</span>
            ) : (
              <button className="primary-button" onClick={() => void startTracking()}>
                Enable Camera
              </button>
            )}
            <button className="ghost-button" onClick={stopTracking}>
              Stop
            </button>
            <label className="topbar-scope-select">
              <span>Calibration</span>
              <select
                value={calibrationScope}
                onChange={(event) => setCalibrationScope(event.target.value as CalibrationScope)}
                disabled={state.calibrationSession.active}
              >
                <option value="Both">Both hands</option>
                <option value="Left">Left hand</option>
                <option value="Right">Right hand</option>
              </select>
            </label>
            {state.calibrationSession.active ? (
              <button className="ghost-button" onClick={cancelPlayingFeelCalibrationFlow}>
                Cancel
              </button>
            ) : (
              <button
                className="secondary-button"
                onClick={() => startPlayingFeelCalibration(calibrationScope)}
              >
                Calibrate Feel
              </button>
            )}
          </div>
          {state.error ? <p className="error-text">{state.error}</p> : null}
          {state.warnings[0] ? <p className="warning-text">{state.warnings[0]}</p> : null}
          {state.startupNotice ? <p className="warning-text">{state.startupNotice}</p> : null}
          {state.audioOutputNotice ? <p className="warning-text">{state.audioOutputNotice}</p> : null}
        </div>
      </header>

      <div className="workspace-shell">
        <aside className="control-panel">
          <section className="panel-card">
          <div className="legend-header touch-tuning-header">
            <h2>Touch Tuning</h2>
            <label className="inline-select">
              <span>Calibration hand</span>
              <select
                value={calibrationHand}
                onChange={(event) => setCalibrationHand(event.target.value as Handedness)}
              >
                <option value="Left">Left</option>
                <option value="Right">Right</option>
              </select>
            </label>
          </div>
          <div className="guided-calibration-card calibration-quick-card">
            <div className="legend-header">
              <strong>Guided activation calibration</strong>
              <span className="settings-help">
                {guidedCalibrationFinger
                  ? `${guidedCalibrationIndex! + 1} / ${FINGERTIP_SENSITIVITY_CONTROLS.length} ${guidedActivationPhase}`
                  : `${calibrationHand} hand ready`}
              </span>
            </div>
            <p className="settings-help guided-calibration-copy">
              {guidedCalibrationFinger
                ? guidedActivationPhase === "hover"
                  ? `Hold your ${calibrationHand.toLowerCase()} ${guidedCalibrationFinger.label.toLowerCase()} just above the key where it should be silent, then set hover.`
                  : `Press your ${calibrationHand.toLowerCase()} ${guidedCalibrationFinger.label.toLowerCase()} where the key should sound, then set press.`
                : `Walk through hover and press poses for each ${calibrationHand.toLowerCase()} fingertip while the camera stays visible.`}
            </p>
            <div className="button-row">
              {guidedCalibrationFinger ? (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      if (guidedActivationPhase === "hover") {
                        setFingerHoverCalibration(guidedCalibrationFinger.key, calibrationHand);
                        setGuidedActivationPhase("press");
                        return;
                      }

                      setFingerPressCalibration(guidedCalibrationFinger.key, calibrationHand);
                      setGuidedActivationPhase("hover");
                      setGuidedCalibrationIndex((current) =>
                        current === null || current >= FINGERTIP_SENSITIVITY_CONTROLS.length - 1
                          ? null
                          : current + 1
                      );
                    }}
                    disabled={!state.debug.fingerDepthSamplesFresh[calibrationHand][guidedCalibrationFinger.key]}
                  >
                    {guidedActivationPhase === "hover" ? "Set Hover" : "Set Press"}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setGuidedActivationPhase("hover");
                      setGuidedCalibrationIndex((current) => Math.max((current ?? 1) - 1, 0));
                    }}
                    disabled={guidedCalibrationIndex === 0}
                  >
                    Previous
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setGuidedCalibrationIndex(null);
                      setGuidedActivationPhase("hover");
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setGuidedActivationPhase("hover");
                    setGuidedCalibrationIndex(0);
                  }}
                  disabled={state.trackerStatus !== "ready"}
                >
                  Start Activation Calibration
                </button>
              )}
            </div>
          </div>
          <div className="settings-grid touch-tuning-grid">
            <RangeNumberControl
              className="settings-span-2"
              label={`${calibrationHand} fallback z gate`}
              min={0}
              max={0.08}
              step={0.001}
              value={state.settings.depthGate[calibrationHand]}
              onChange={(value) =>
                updateSettings({
                  depthGate: {
                    ...state.settings.depthGate,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Used only for fingertips without hover/press calibration. Current fallback gate: ${state.settings.depthGate[calibrationHand].toFixed(3)}.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} dwell ms`}
              min={0}
              max={80}
              step={1}
              value={selectedHandBulkTuning.touchDwellMs}
              onChange={(value) =>
                updateHandActivationTuning({ touchDwellMs: value }, {
                  touchDwellMs: {
                    ...state.settings.touchDwellMs,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Bulk updates all ${calibrationHand.toLowerCase()} fingertips. Lower values start faster.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} press activation`}
              min={0}
              max={1}
              step={0.01}
              value={selectedHandBulkTuning.pressActivationThreshold}
              onChange={(value) =>
                updateHandActivationTuning({ pressActivationThreshold: value }, {
                  pressActivationThreshold: {
                    ...state.settings.pressActivationThreshold,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Activation needed for a stable calibrated ${calibrationHand.toLowerCase()} press.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} hard activation`}
              min={0}
              max={1}
              step={0.01}
              value={selectedHandBulkTuning.hardActivationThreshold}
              onChange={(value) =>
                updateHandActivationTuning({ hardActivationThreshold: value }, {
                  hardActivationThreshold: {
                    ...state.settings.hardActivationThreshold,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Immediate ${calibrationHand.toLowerCase()} activation threshold that bypasses dwell.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} release activation`}
              min={0}
              max={1}
              step={0.01}
              value={selectedHandBulkTuning.releaseActivationThreshold}
              onChange={(value) =>
                updateHandActivationTuning({ releaseActivationThreshold: value }, {
                  releaseActivationThreshold: {
                    ...state.settings.releaseActivationThreshold,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Lower values hold longer. Higher values release with smaller lifts.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} press velocity`}
              min={0}
              max={999}
              step={0.1}
              value={selectedHandBulkTuning.pressVelocityThreshold}
              onChange={(value) =>
                updateHandActivationTuning({ pressVelocityThreshold: value }, {
                  pressVelocityThreshold: {
                    ...state.settings.pressVelocityThreshold,
                    [calibrationHand]: value
                  }
                })
              }
              help={`High values effectively disable press velocity assist; release assist remains separate.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} release velocity`}
              min={0}
              max={30}
              step={0.1}
              value={selectedHandBulkTuning.releaseVelocityThreshold}
              onChange={(value) =>
                updateHandActivationTuning({ releaseVelocityThreshold: value }, {
                  releaseVelocityThreshold: {
                    ...state.settings.releaseVelocityThreshold,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Lower values release faster when activation is falling.`}
            />
            <RangeNumberControl
              label={`${calibrationHand} velocity smoothing`}
              min={0.05}
              max={1}
              step={0.01}
              value={selectedHandBulkTuning.activationVelocitySmoothing}
              onChange={(value) =>
                updateHandActivationTuning({ activationVelocitySmoothing: value }, {
                  activationVelocitySmoothing: {
                    ...state.settings.activationVelocitySmoothing,
                    [calibrationHand]: value
                  }
                })
              }
              help={`Higher values react faster to activation velocity; lower values smooth more.`}
            />
            <div className="settings-action settings-span-2">
              <div className="legend-header">
                <span>Per-finger z sensitivity</span>
                <strong>{calibrationHand} hand</strong>
              </div>
              <div className="finger-sensitivity-grid">
                {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => {
                  const calibration = state.settings.touchCalibration[calibrationHand][key];
                  const hasSample =
                    state.debug.fingerDepthSamplesFresh[calibrationHand][key];
                  return (
                    <div key={key} className="finger-sensitivity-control">
                      <RangeNumberControl
                        label={label}
                        min={0}
                        max={10}
                        step={0.1}
                        value={state.settings.fingerDepthSensitivity[calibrationHand][key]}
                        onChange={(value) =>
                          updateSettings({
                            fingerDepthSensitivity: {
                              ...state.settings.fingerDepthSensitivity,
                              [calibrationHand]: {
                                ...state.settings.fingerDepthSensitivity[calibrationHand],
                                [key]: value
                              }
                            }
                          })
                        }
                        help={`${state.settings.fingerDepthSensitivity[calibrationHand][key].toFixed(2)}x`}
                      />
                      <div className="button-row">
                        <button
                          className="ghost-button"
                          onClick={() => setFingerHoverCalibration(key, calibrationHand)}
                          disabled={!hasSample}
                        >
                          Set Hover
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => setFingerPressCalibration(key, calibrationHand)}
                          disabled={!hasSample}
                        >
                          Set Press
                        </button>
                      </div>
                      <small className="settings-help">
                        h {formatDebugValue(calibration.hoverDepth, 3)} | p{" "}
                        {formatDebugValue(calibration.pressDepth, 3)} | d {calibration.direction}
                      </small>
                      <small className="settings-help">
                        q {formatCalibrationQuality(calibration.qualityScore)} | key{" "}
                        {calibration.targetKey ?? "--"}
                      </small>
                    </div>
                  );
                })}
              </div>
              <small className="settings-help">
                `0` disables z triggering for that fingertip, `1` is neutral, and `10` multiplies
                that fingertip's raw depth before hover/press activation is calculated.
              </small>
              <small className="settings-help">
                Left and right hands now keep separate fingertip sensitivities. You are editing the
                {` ${calibrationHand.toLowerCase()} `}
                hand.
              </small>
              <button
                className="ghost-button"
                onClick={() => calibrateFingerSensitivity(calibrationHand)}
                disabled={!hasFingerDepthSamples}
              >
                Learn {calibrationHand} Sensitivity
              </button>
              <small className="settings-help">
                Optional: learn z multipliers before hover/press activation calibration.
              </small>
              <details className="advanced-tuning">
                <summary>Advanced per-finger activation tuning</summary>
                <div className="advanced-finger-grid">
                  {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => {
                    const tuning = state.settings.activationTuning[calibrationHand][key];
                    return (
                      <div key={`advanced-${key}`} className="advanced-finger-card">
                        <strong>{label}</strong>
                        <RangeNumberControl
                          label="Press"
                          min={0}
                          max={1}
                          step={0.01}
                          value={tuning.pressActivationThreshold}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { pressActivationThreshold: value })
                          }
                        />
                        <RangeNumberControl
                          label="Hard"
                          min={0}
                          max={1}
                          step={0.01}
                          value={tuning.hardActivationThreshold}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { hardActivationThreshold: value })
                          }
                        />
                        <RangeNumberControl
                          label="Release"
                          min={0}
                          max={1}
                          step={0.01}
                          value={tuning.releaseActivationThreshold}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { releaseActivationThreshold: value })
                          }
                        />
                        <RangeNumberControl
                          label="Dwell ms"
                          min={0}
                          max={80}
                          step={1}
                          value={tuning.touchDwellMs}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { touchDwellMs: value })
                          }
                        />
                        <RangeNumberControl
                          label="Press velocity"
                          min={0}
                          max={999}
                          step={0.1}
                          value={tuning.pressVelocityThreshold}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { pressVelocityThreshold: value })
                          }
                        />
                        <RangeNumberControl
                          label="Release velocity"
                          min={0}
                          max={60}
                          step={0.1}
                          value={tuning.releaseVelocityThreshold}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { releaseVelocityThreshold: value })
                          }
                        />
                        <RangeNumberControl
                          label="Velocity smoothing"
                          min={0.05}
                          max={1}
                          step={0.01}
                          value={tuning.activationVelocitySmoothing}
                          onChange={(value) =>
                            updateFingerActivationTuning(key, { activationVelocitySmoothing: value })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
            <div className="settings-action settings-span-2">
              <span>Z calibration</span>
              <button
                className="ghost-button"
                onClick={() => calibrateDepthGate(calibrationHand)}
                disabled={state.debug.touchDepth[calibrationHand] === null}
              >
                Calibrate {calibrationHand} Hand Gate
              </button>
              <small className="settings-help">
                Place a {calibrationHand.toLowerCase()} fingertip on the keybed, then calibrate to
                set the gate just below that hand's current press score.
              </small>
            </div>
          </div>
          </section>

          {state.calibrationSession.phase === "complete" ? (
            <section className="panel-card calibration-summary-card">
              <div className="legend-header">
                <h2>Calibration Summary</h2>
                <strong>Saved</strong>
              </div>
              <div className="calibration-summary-grid">
                {(["Left", "Right"] as const).map((hand) => (
                  <div key={`summary-${hand}`} className="calibration-summary-hand">
                    <strong>{hand}</strong>
                    {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => {
                      const summary = state.calibrationSession.summaries[hand][key];
                      const calibration = state.settings.touchCalibration[hand][key];
                      return (
                        <div key={`summary-${hand}-${key}`} className="calibration-summary-row">
                          <span>{label}</span>
                          <strong>{summary.status}</strong>
                          <small>
                            {calibration.targetKey ?? summary.targetKey ?? "--"} ·{" "}
                            {formatCalibrationQuality(calibration.qualityScore ?? summary.qualityScore)}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

        <section className="panel-card settings-grid">
          <label>
            <span>Strip size</span>
            <select
              value={state.settings.noteStripSize}
              onChange={(event) =>
                updateSettings({ noteStripSize: event.target.value as "compact" | "normal" | "large" })
              }
            >
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label>
            <span>Note labels</span>
            <select
              value={state.settings.labelStyle}
              onChange={(event) => updateSettings({ labelStyle: event.target.value as "sharps" | "flats" })}
            >
              <option value="sharps">Sharps</option>
              <option value="flats">Flats</option>
            </select>
          </label>
          <label>
            <span>Synth patch</span>
            <select
              value={state.settings.synthPatch}
              onChange={(event) =>
                updateSettings({ synthPatch: event.target.value as "soft-keys" | "warm-pad" })
              }
            >
              <option value="soft-keys">Soft keys</option>
              <option value="warm-pad">Warm pad</option>
            </select>
          </label>
          <label>
            <span>Camera</span>
            <select
              value={state.settings.deviceId}
              onChange={(event) => updateSettings({ deviceId: event.target.value })}
            >
              <option value="">Default camera</option>
              {state.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 4)}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tracking backend</span>
            <select
              value={state.settings.trackingBackend}
              onChange={(event) =>
                updateSettings({ trackingBackend: event.target.value as TrackerBackendKind })
              }
            >
              <option value="mediapipe-hands">MediaPipe stable</option>
              <option value="mediapipe-hands-worker">MediaPipe worker experimental</option>
            </select>
            <small className="settings-help">
              Stable keeps landmark geometry aligned with the camera. Worker mode may reduce UI load
              but can add visual offset on some browsers.
            </small>
          </label>
          <label>
            <span>Audio output</span>
            <select
              value={state.settings.audioOutputDeviceId}
              onChange={(event) => updateSettings({ audioOutputDeviceId: event.target.value })}
              disabled={!state.audioOutputRoutingSupported}
            >
              <option value="">
                {state.audioOutputRoutingSupported
                  ? "System default output"
                  : "System default only in this browser"}
              </option>
              {state.audioOutputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Output ${device.deviceId.slice(0, 4)}`}
                </option>
              ))}
            </select>
            <small className="settings-help">
              {state.audioOutputRoutingSupported
                ? "Choose a wired or Bluetooth output directly when the browser supports device routing."
                : "Explicit output routing is unavailable here, so wired and Bluetooth playback follow the browser or OS default output."}
            </small>
          </label>
          <label>
            <span>Calibration audio</span>
            <select
              value={state.settings.calibrationAudioMode}
              onChange={(event) =>
                updateSettings({
                  calibrationAudioMode: event.target.value as "off" | "cues" | "target-preview"
                })
              }
            >
              <option value="target-preview">Target preview</option>
              <option value="cues">Cues only</option>
              <option value="off">Off</option>
            </select>
            <small className="settings-help">
              Calibration suppresses normal play notes but can preview the target key while you tap.
            </small>
          </label>
          <RangeNumberControl
            label="Tracking sensitivity"
            min={0.1}
            max={1}
            step={0.01}
            value={state.settings.trackingSensitivity}
            onChange={(value) => updateSettings({ trackingSensitivity: value })}
          />
          <RangeNumberControl
            label="Hand overlay thickness"
            min={0.2}
            max={1.6}
            step={0.01}
            value={state.settings.overlayThickness}
            onChange={(value) => updateSettings({ overlayThickness: value })}
          />
          <RangeNumberControl
            label="Piano position"
            min={Number(pianoVerticalBounds.min.toFixed(3))}
            max={Number(pianoVerticalBounds.max.toFixed(3))}
            step={0.001}
            value={state.settings.pianoVerticalOffset}
            onChange={(value) => updateSettings({ pianoVerticalOffset: value })}
          />
          <RangeNumberControl
            label="Key height"
            min={0.8}
            max={MAX_PIANO_HEIGHT_SCALE}
            step={0.01}
            value={state.settings.pianoHeightScale}
            onChange={(value) => updateSettings({ pianoHeightScale: value })}
          />
          <RangeNumberControl
            label="Key width"
            min={0.85}
            max={1.2}
            step={0.001}
            value={state.settings.pianoWidthScale}
            onChange={(value) => updateSettings({ pianoWidthScale: value })}
            help={`${state.settings.pianoWidthScale.toFixed(3)}x wider piano means thicker keys and wider hit boxes.`}
          />
          <RangeNumberControl
            label="Octaves"
            min={MIN_PIANO_OCTAVES}
            max={MAX_PIANO_OCTAVES}
            step={1}
            value={state.settings.pianoOctaves}
            onChange={(value) => updateSettings({ pianoOctaves: Math.round(value) })}
            help={`${state.settings.pianoOctaves} octave${state.settings.pianoOctaves === 1 ? "" : "s"} displayed from C to C.`}
          />
          <RangeNumberControl
            label="Piano opacity"
            min={0.2}
            max={1}
            step={0.01}
            value={state.settings.pianoOpacity}
            onChange={(value) => updateSettings({ pianoOpacity: value })}
          />
          <label>
            <span>Hit box color</span>
            <input
              type="color"
              value={state.settings.hitBoxColor}
              onChange={(event) => updateSettings({ hitBoxColor: event.target.value })}
            />
          </label>
          <RangeNumberControl
            label="Volume"
            min={-24}
            max={6}
            step={0.5}
            value={state.settings.volume}
            onChange={(value) => updateSettings({ volume: value })}
          />
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.settings.showDebugOverlays}
              onChange={(event) => updateSettings({ showDebugOverlays: event.target.checked })}
            />
            <span>Debug overlays</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.settings.showHitBoxes}
              onChange={(event) => updateSettings({ showHitBoxes: event.target.checked })}
            />
            <span>Show hit boxes</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={state.settings.lowLatencyMode}
              onChange={(event) => updateSettings({ lowLatencyMode: event.target.checked })}
            />
            <span>Low latency visuals</span>
          </label>
        </section>

        <section className="panel-card">
          <div className="legend-header">
            <h2>Piano Touch</h2>
            <strong>{state.currentChordLabel}</strong>
          </div>
          <div className="legend-list">
            <div className="legend-item active">
              <span className="legend-icon">Fingertips only</span>
              <span>Only tip landmarks can trigger notes</span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Z color ramp</span>
              <span>Tip color warms up as calibrated activation approaches press</span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Activation</span>
              <span>Pressing uses per-fingertip hover/press calibration with velocity-assisted release</span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Tracking layer</span>
              <span>Hands render above the keyboard</span>
            </div>
          </div>
          <button className="ghost-button full-width" onClick={exportLogs}>
            Export Session Log ({state.logCount})
          </button>
        </section>

        {state.settings.showDebugOverlays ? (
          <section className="panel-card">
            <div className="legend-header">
              <h2>Debug</h2>
              <strong>{state.debug.visibleHands} hands</strong>
            </div>
            <div className="debug-grid">
              <div className="debug-block">
                <span>Left hand</span>
                <strong>
                  {state.debug.leftHand
                    ? `${state.debug.leftHand.handedness} @ ${formatDebugValue(state.debug.leftHand.avgX)}`
                    : "--"}
                </strong>
              </div>
              <div className="debug-block">
                <span>Right hand</span>
                <strong>
                  {state.debug.rightHand
                    ? `${state.debug.rightHand.handedness} @ ${formatDebugValue(state.debug.rightHand.avgX)}`
                    : "--"}
                </strong>
              </div>
              <div className="debug-block">
                <span>Focus tip</span>
                <strong>{state.debug.focusTipLabel ?? "--"}</strong>
              </div>
              <div className="debug-block">
                <span>Focus raw x</span>
                <strong>{formatDebugValue(state.debug.focusTipRawX)}</strong>
              </div>
              <div className="debug-block">
                <span>Focus playable x</span>
                <strong>{formatDebugValue(state.debug.focusTipProjectedX)}</strong>
              </div>
              <div className="debug-block">
                <span>Left touch depth</span>
                <strong>{formatDebugValue(state.debug.touchDepth.Left)}</strong>
              </div>
              <div className="debug-block">
                <span>Right touch depth</span>
                <strong>{formatDebugValue(state.debug.touchDepth.Right)}</strong>
              </div>
              <div className="debug-block">
                <span>Left z gate</span>
                <strong>{formatDebugValue(state.debug.depthGate.Left, 3)}</strong>
              </div>
              <div className="debug-block">
                <span>Right z gate</span>
                <strong>{formatDebugValue(state.debug.depthGate.Right, 3)}</strong>
              </div>
              <div className="debug-block">
                <span>Touch tips</span>
                <strong>{formatDebugValue(state.debug.touchTips, 0)}</strong>
              </div>
              <div className="debug-block">
                <span>Active notes</span>
                <strong>{state.debug.activeNotes.join(" • ") || "--"}</strong>
              </div>
              <div className="debug-block">
                <span>Active semitone</span>
                <strong>{formatDebugValue(state.debug.activeSemitone, 0)}</strong>
              </div>
            </div>
            <div className="legend-header">
              <strong>{calibrationHand} hand depth samples</strong>
              <span className="settings-help">
                Live sample buckets for the selected calibration hand
              </span>
            </div>
            <div className="finger-depth-grid">
              {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => (
                <div
                  key={`finger-depth-${key}`}
                  className={
                    guidedCalibrationFinger?.key === key
                      ? "debug-block finger-depth-block active"
                      : "debug-block finger-depth-block"
                  }
                >
                  <span>{label}</span>
                  <strong>{formatDebugValue(state.debug.fingerDepthSamples[calibrationHand][key], 3)}</strong>
                  <small className="settings-help">
                    {state.settings.fingerDepthSensitivity[calibrationHand][key].toFixed(2)}x sensitivity
                    {state.debug.fingerDepthSamplesFresh[calibrationHand][key] ? " · live" : " · no live sample"}
                  </small>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <main className="stage-column">
        <section className="stage-card">
          <div className="stage-toolbar">
            <div className="metric-pill">
              <span>Tracking</span>
              <strong>{state.trackerStatus}</strong>
            </div>
            <div className="metric-pill">
              <span>FPS</span>
              <strong>{Math.round(state.fps)}</strong>
            </div>
            <div className="metric-pill">
              <span>Latency</span>
              <strong>{Math.round(state.latencyMs)} ms</strong>
            </div>
          </div>

          <div className="stage" ref={stageRef}>
            <video ref={videoRef} playsInline muted className="camera-feed" />
            {state.settings.showDebugOverlays || state.calibrationSession.active ? (
              <canvas ref={overlayRef} className="overlay-canvas" />
            ) : null}
            <div className="stage-vignette" />

            <div className="hud-group top-left">
              <div className="hud-chip note">
                <span>Root</span>
                <strong>{state.currentRootLabel ?? "--"}</strong>
              </div>
              <div className="hud-chip chord">
                <span>Mode</span>
                <strong>{state.currentModeLabel}</strong>
              </div>
            </div>

            <div className="hud-group top-right">
              <div className="confidence-card">
                <span>Processing confidence</span>
                <div className="confidence-bar">
                  <div
                    className="confidence-fill"
                    style={{
                      width: `${Math.min(100, Math.round((state.fps / 30) * 100))}%`,
                      background: confidenceTone((state.fps / 30) * 100)
                    }}
                  />
                </div>
              </div>
            </div>

            {state.calibrationSession.active ? (
              <>
                {calibrationControlZones.map((zone, index) => (
                  <div
                    key={`calibration-control-zone-${index}`}
                    className="calibration-control-zone"
                    style={{
                      left: `${zone.left * 100}%`,
                      top: `${zone.top * 100}%`,
                      width: `${(zone.right - zone.left) * 100}%`,
                      height: `${(zone.bottom - zone.top) * 100}%`
                    }}
                  >
                    <span>
                      {index === 0
                        ? `${state.calibrationSession.controlHand} signs accepted here`
                        : "accepted here"}
                    </span>
                  </div>
                ))}
                <div className="calibration-overlay">
                  <div className="legend-header">
                    <h2>Playing Feel</h2>
                    <strong>{state.calibrationSession.phase.replaceAll("-", " ")}</strong>
                  </div>
                  <div className="calibration-progress-grid">
                    <div>
                      <span>Target</span>
                      <strong>
                        {state.calibrationSession.targetHand} {state.calibrationSession.targetFinger}
                      </strong>
                    </div>
                    <div>
                      <span>Control</span>
                      <strong>{state.calibrationSession.controlHand}</strong>
                    </div>
                    <div>
                      <span>Hand</span>
                      <strong>{calibrationHandProgress}</strong>
                    </div>
                    <div>
                      <span>Finger</span>
                      <strong>{calibrationFingerProgress}</strong>
                    </div>
                    <div>
                      <span>Quality</span>
                      <strong>{formatCalibrationQuality(state.calibrationSession.qualityScore)}</strong>
                    </div>
                    <div>
                      <span>Key</span>
                      <strong>{state.calibrationSession.targetKey ?? "--"}</strong>
                    </div>
                    <div>
                      <span>Audio</span>
                      <strong>{state.settings.calibrationAudioMode.replace("-", " ")}</strong>
                    </div>
                  </div>
                  <div className="confidence-bar calibration-progress-bar">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${Math.round(state.calibrationSession.progress * 100)}%`,
                        background: confidenceTone(state.calibrationSession.progress * 60)
                      }}
                    />
                  </div>
                  <p className="calibration-guidance">{state.calibrationSession.guidance}</p>
                  <div className="gesture-card-grid">
                    <div className={state.calibrationSession.rehearsal.fist ? "gesture-card learned" : "gesture-card"}>
                      <span className="gesture-icon">fist</span>
                      <strong>Accept</strong>
                    </div>
                    <div className={state.calibrationSession.rehearsal.pinch ? "gesture-card learned" : "gesture-card"}>
                      <span className="gesture-icon">pinch</span>
                      <strong>Retry</strong>
                    </div>
                    <div className={state.calibrationSession.rehearsal.open ? "gesture-card learned" : "gesture-card"}>
                      <span className="gesture-icon">open</span>
                      <strong>Pause</strong>
                    </div>
                    <div className="gesture-card">
                      <span className="gesture-icon">long pinch</span>
                      <strong>Skip</strong>
                    </div>
                  </div>
                  <div className="calibration-command">
                    <span>
                      {state.calibrationSession.command.insideControlZone
                        ? `${state.calibrationSession.command.rawGesture} detected`
                        : "Move control hand into the control zone"}
                    </span>
                    <strong>
                      {state.calibrationSession.command.command === "none"
                        ? `${Math.round(state.calibrationSession.command.progress * 100)}%`
                        : state.calibrationSession.command.command}
                    </strong>
                  </div>
                  <div className="button-row">
                    <button className="secondary-button" onClick={acceptPlayingFeelCalibrationStep}>
                      {calibrationAcceptLabel}
                    </button>
                    <button className="ghost-button" onClick={retryPlayingFeelCalibrationStep}>
                      {calibrationRetryLabel}
                    </button>
                    <button
                      className="ghost-button"
                      onClick={skipPlayingFeelCalibrationStep}
                      disabled={calibrationSkipDisabled}
                    >
                      Skip
                    </button>
                    <button className="ghost-button" onClick={cancelPlayingFeelCalibrationFlow}>
                      Cancel
                    </button>
                  </div>
                  <small className="settings-help">
                    Keyboard: Space accept, R retry, S skip, Esc cancel.
                  </small>
                </div>
              </>
            ) : null}

            <div
              className="piano-strip"
              style={{
                opacity: state.settings.pianoOpacity,
                left: `${pianoHorizontalBounds.left * 100}%`,
                right: `${(1 - pianoHorizontalBounds.right) * 100}%`,
                bottom: `${pianoLayout.bottomOffset * 100}%`,
                height: `${pianoLayout.heightRatio * 100}%`
              }}
            >
              {state.settings.showHitBoxes ? (
                <div
                  className="piano-hitbox-layer"
                  style={
                    {
                      "--hitbox-color": state.settings.hitBoxColor
                    } as CSSProperties
                  }
                >
                  <div
                    className="piano-hitbox-white-layer"
                  >
                    {whiteHitSegments.map((segment) => (
                      <div
                        key={`white-hitbox-${segment.keyIndex}-${segment.segment}`}
                        className="white-hitbox"
                        style={{
                          left: `${segment.leftX * 100}%`,
                          width: `${(segment.rightX - segment.leftX) * 100}%`,
                          top: `${((segment.topY - pianoLayout.topY) / pianoLayout.heightRatio) * 100}%`,
                          height: `${((segment.bottomY - segment.topY) / pianoLayout.heightRatio) * 100}%`
                        }}
                      />
                    ))}
                  </div>
                  <div className="piano-hitbox-black-layer">
                    {pianoLayout.blackKeys.map((key) => (
                      <div
                        key={`black-hitbox-${key.label}-${key.sourceIndex}`}
                        className="black-hitbox"
                        style={{
                          left: `${key.centerX * 100}%`,
                          width: `${(key.rightX - key.leftX) * 100}%`,
                          top: blackKeyTop,
                          height: blackKeyHeight
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div
                className="piano-white-keys"
                style={{ gridTemplateColumns: `repeat(${noteNames.length}, minmax(0, 1fr))` }}
              >
                {noteNames.map((noteName, index) => {
                  const isActive = state.activeNaturalZones.includes(index);
                  return (
                    <div
                      key={`${noteName}-${index}`}
                      className={isActive ? "white-key active" : "white-key"}
                    >
                      <span>{noteName}</span>
                    </div>
                  );
                })}
              </div>
              <div className="piano-black-keys">
                {pianoLayout.blackKeys.map((key) => {
                  const isActive = state.activeSharpZones.includes(key.sourceIndex);
                  return (
                    <div
                      key={`${key.label}-${key.sourceIndex}`}
                      className={isActive ? "black-key active" : "black-key"}
                      style={{ left: `${key.centerX * 100}%`, width: blackKeyWidth }}
                    >
                      <span>{key.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="piano-caption">
                <span>Any fingertip can press the white keys</span>
                <span>Black keys now use direct hit detection, with two-finger fallback</span>
              </div>
            </div>
          </div>
        </section>

        <section className="footnote-grid">
          <div className="footnote-card">
            <h3>Supported envelope</h3>
            <p>Stable indoor light, both hands visible, moderate camera distance, 30 FPS or better.</p>
          </div>
          <div className="footnote-card">
            <h3>Expected degradation</h3>
            <p>Backlighting, hand overlap, low light, motion blur, weak webcams, or tight framing.</p>
          </div>
          <div className="footnote-card">
            <h3>Recovery behavior</h3>
            <p>Loose touches fall back cleanly, and hover/press activation can be recalibrated live.</p>
          </div>
        </section>
      </main>
      </div>
    </div>
  );
}
