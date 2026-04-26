import { type CSSProperties, type RefObject } from "react";
import { getCircleNoteOrder, type CircleLayout } from "../lib/circleMode";
import type { InstrumentViewState } from "../hooks/useGestureInstrument";
import type { CalibrationControlZone } from "../lib/playingFeelCalibration";
import type { PianoLayout, PianoWhiteHitSegment } from "../lib/pianoLayout";
import type { Handedness } from "../lib/types";
import { CIRCLE_HANDS, confidenceTone, formatCalibrationQuality } from "./appShared";
import { circleLabelPoint, circleSegmentPath } from "./stageRendering";

interface StageSectionProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  state: InstrumentViewState;
  circleLayouts: Record<Handedness, CircleLayout>;
  calibrationControlZones: CalibrationControlZone[];
  calibrationHandProgress: string;
  calibrationFingerProgress: string;
  calibrationAcceptLabel: string;
  calibrationRetryLabel: string;
  calibrationSkipDisabled: boolean;
  noteNames: readonly string[];
  pianoLayout: PianoLayout;
  pianoHorizontalBounds: { left: number; right: number };
  whiteHitSegments: PianoWhiteHitSegment[];
  blackKeyWidth: string;
  blackKeyTop: string;
  blackKeyHeight: string;
  onAcceptCalibration: () => void;
  onRetryCalibration: () => void;
  onSkipCalibration: () => void;
  onCancelCalibration: () => void;
}

function getCircleOrderingLabel(enabled: boolean): string {
  return enabled ? "Fifths" : "Natural";
}

function getCalibrationCommandLabel(state: InstrumentViewState): string {
  const command = state.calibrationSession.command.command;
  if (command !== "none") {
    return command;
  }
  return `${Math.round(state.calibrationSession.command.progress * 100)}%`;
}

function getCalibrationCommandCopy(state: InstrumentViewState): string {
  if (!state.calibrationSession.command.insideControlZone) {
    return "Move control hand into the control zone";
  }
  return `${state.calibrationSession.command.rawGesture} detected`;
}

export function StageSection({
  videoRef,
  overlayRef,
  stageRef,
  state,
  circleLayouts,
  calibrationControlZones,
  calibrationHandProgress,
  calibrationFingerProgress,
  calibrationAcceptLabel,
  calibrationRetryLabel,
  calibrationSkipDisabled,
  noteNames,
  pianoLayout,
  pianoHorizontalBounds,
  whiteHitSegments,
  blackKeyWidth,
  blackKeyTop,
  blackKeyHeight,
  onAcceptCalibration,
  onRetryCalibration,
  onSkipCalibration,
  onCancelCalibration
}: Readonly<StageSectionProps>) {
  const playbackConfidence = Math.min(100, Math.round((state.fps / 30) * 100));

  return (
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

          {state.settings.playMode === "circle" ? (
            <div className="circle-layer">
              {CIRCLE_HANDS.map((hand) => {
                const layout = circleLayouts[hand];
                const activeSegments = new Set(state.activeCircleSegments[hand]);
                const noteOrder = getCircleNoteOrder(state.settings.circleOfFifths[hand]);

                return (
                  <div
                    key={`note-circle-${hand}`}
                    className={`note-circle ${hand.toLowerCase()}`}
                    style={{
                      left: `${(layout.center.x - layout.radiusX) * 100}%`,
                      top: `${(layout.center.y - layout.radiusY) * 100}%`,
                      width: `${layout.radiusX * 2 * 100}%`,
                      height: `${layout.radiusY * 2 * 100}%`
                    }}
                  >
                    <svg className="note-circle-svg" viewBox="0 0 100 100" aria-hidden="true">
                      {noteOrder.map((label, segment) => {
                        const isActive = activeSegments.has(segment);
                        const labelPoint = circleLabelPoint(segment);
                        const labelClassName = isActive ? "circle-label active" : "circle-label";
                        const segmentClassName = isActive
                          ? "circle-segment active"
                          : "circle-segment";

                        return (
                          <g key={`${hand}-${label}-${segment}`}>
                            <path className={segmentClassName} d={circleSegmentPath(segment)} />
                            <text
                              className={labelClassName}
                              x={labelPoint.x}
                              y={labelPoint.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}
                      <circle className="circle-dead-zone" cx="50" cy="50" r="9" />
                    </svg>
                    <div className="note-circle-caption">
                      <strong>{hand}</strong>
                      <span>{getCircleOrderingLabel(state.settings.circleOfFifths[hand])}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

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
                    width: `${playbackConfidence}%`,
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
                  <div className="calibration-progress-wide">
                    <span>Capture</span>
                    <strong>{state.calibrationSession.captureStatus}</strong>
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
                  <div
                    className={
                      state.calibrationSession.rehearsal.fist
                        ? "gesture-card learned"
                        : "gesture-card"
                    }
                  >
                    <span className="gesture-icon">fist</span>
                    <strong>Accept</strong>
                  </div>
                  <div
                    className={
                      state.calibrationSession.rehearsal.pinch
                        ? "gesture-card learned"
                        : "gesture-card"
                    }
                  >
                    <span className="gesture-icon">pinch</span>
                    <strong>Retry</strong>
                  </div>
                  <div
                    className={
                      state.calibrationSession.rehearsal.open
                        ? "gesture-card learned"
                        : "gesture-card"
                    }
                  >
                    <span className="gesture-icon">open</span>
                    <strong>Pause</strong>
                  </div>
                  <div className="gesture-card">
                    <span className="gesture-icon">long pinch</span>
                    <strong>Skip</strong>
                  </div>
                </div>
                <div className="calibration-command">
                  <span>{getCalibrationCommandCopy(state)}</span>
                  <strong>{getCalibrationCommandLabel(state)}</strong>
                </div>
                <div className="button-row">
                  <button className="secondary-button" onClick={onAcceptCalibration}>
                    {calibrationAcceptLabel}
                  </button>
                  <button className="ghost-button" onClick={onRetryCalibration}>
                    {calibrationRetryLabel}
                  </button>
                  <button
                    className="ghost-button"
                    onClick={onSkipCalibration}
                    disabled={calibrationSkipDisabled}
                  >
                    Skip
                  </button>
                  <button className="ghost-button" onClick={onCancelCalibration}>
                    Cancel
                  </button>
                </div>
                <small className="settings-help">
                  Keyboard: Space accept, R retry, S skip, Esc cancel.
                </small>
              </div>
            </>
          ) : null}

          {state.settings.playMode === "piano" ? (
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
                  <div className="piano-hitbox-white-layer">
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
                  const keyClassName = state.activeNaturalZones.includes(index)
                    ? "white-key active"
                    : "white-key";
                  return (
                    <div key={`${noteName}-${index}`} className={keyClassName}>
                      <span>{noteName}</span>
                    </div>
                  );
                })}
              </div>
              <div className="piano-black-keys">
                {pianoLayout.blackKeys.map((key) => {
                  const keyClassName = state.activeSharpZones.includes(key.sourceIndex)
                    ? "black-key active"
                    : "black-key";
                  return (
                    <div
                      key={`${key.label}-${key.sourceIndex}`}
                      className={keyClassName}
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
          ) : null}
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
  );
}
