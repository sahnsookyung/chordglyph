import {
  MAX_CIRCLE_NOTE_OCTAVE,
  MAX_CIRCLE_OPEN_OCTAVE_SHIFT,
  MAX_PIANO_OCTAVES,
  MIN_CIRCLE_NOTE_OCTAVE,
  MIN_CIRCLE_OPEN_OCTAVE_SHIFT,
  MIN_PIANO_OCTAVES
} from "../lib/constants";
import { getCircleNoteOrder } from "../lib/circleMode";
import { MAX_PIANO_HEIGHT_SCALE } from "../lib/pianoLayout";
import type { InstrumentViewState } from "../hooks/useGestureInstrument";
import type {
  CircleNoteName,
  FingerActivationTuning,
  FingertipName,
  Handedness,
  InstrumentSettings,
  TrackerBackendKind
} from "../lib/types";
import {
  CIRCLE_HANDS,
  FINGERTIP_SENSITIVITY_CONTROLS,
  formatCalibrationQuality,
  formatDebugValue
} from "./appShared";
import { RangeNumberControl } from "./RangeNumberControl";

type GuidedActivationPhase = "hover" | "press";
type HandActivationLegacyPatch = Partial<
  Pick<
    InstrumentSettings,
    | "hardActivationThreshold"
    | "pressActivationThreshold"
    | "releaseActivationThreshold"
    | "touchDwellMs"
    | "pressVelocityThreshold"
    | "releaseVelocityThreshold"
    | "activationVelocitySmoothing"
  >
>;

interface PianoVerticalBounds {
  min: number;
  max: number;
}

interface ControlPanelProps {
  state: InstrumentViewState;
  calibrationHand: Handedness;
  guidedCalibrationIndex: number | null;
  guidedActivationPhase: GuidedActivationPhase;
  pianoVerticalBounds: PianoVerticalBounds;
  onCalibrationHandChange: (value: Handedness) => void;
  onGuidedCalibrationIndexChange: (value: number | null) => void;
  onGuidedActivationPhaseChange: (value: GuidedActivationPhase) => void;
  onUpdateSettings: (patch: Partial<InstrumentSettings>) => void;
  onUpdateHandActivationTuning: (
    patch: Partial<FingerActivationTuning>,
    legacyPatch?: HandActivationLegacyPatch
  ) => void;
  onUpdateFingerActivationTuning: (
    finger: FingertipName,
    patch: Partial<FingerActivationTuning>
  ) => void;
  onUpdateCircleFingerEnabled: (
    hand: Handedness,
    finger: FingertipName,
    enabled: boolean
  ) => void;
  onUpdateCircleOfFifths: (hand: Handedness, enabled: boolean) => void;
  onUpdateCircleNoteOctave: (hand: Handedness, note: CircleNoteName, octave: number) => void;
  onUpdateCircleOpenOctaveShift: (hand: Handedness, shift: number) => void;
  onCalibrateFingerSensitivity: (hand: Handedness) => void;
  onSetFingerHoverCalibration: (finger: FingertipName, hand: Handedness) => void;
  onSetFingerPressCalibration: (finger: FingertipName, hand: Handedness) => void;
  onCalibrateDepthGate: (hand: Handedness) => void;
  onExportLogs: () => void;
}

function getGuidedCalibrationTitle(
  calibrationHand: Handedness,
  guidedCalibrationIndex: number | null,
  guidedActivationPhase: GuidedActivationPhase
): string {
  if (guidedCalibrationIndex === null) {
    return `${calibrationHand} hand ready`;
  }

  return `${guidedCalibrationIndex + 1} / ${FINGERTIP_SENSITIVITY_CONTROLS.length} ${guidedActivationPhase}`;
}

function getGuidedCalibrationCopy(
  calibrationHand: Handedness,
  guidedCalibrationFinger: { key: FingertipName; label: string } | null,
  guidedActivationPhase: GuidedActivationPhase
): string {
  if (!guidedCalibrationFinger) {
    return `Walk through hover and press poses for each ${calibrationHand.toLowerCase()} fingertip while the camera stays visible.`;
  }

  const fingerName = guidedCalibrationFinger.label.toLowerCase();
  const handName = calibrationHand.toLowerCase();
  if (guidedActivationPhase === "hover") {
    return `Hold your ${handName} ${fingerName} just above the key where it should be silent, then set hover.`;
  }

  return `Press your ${handName} ${fingerName} where the key should sound, then set press.`;
}

function TouchTuningPanel({
  state,
  calibrationHand,
  guidedCalibrationIndex,
  guidedActivationPhase,
  onCalibrationHandChange,
  onGuidedCalibrationIndexChange,
  onGuidedActivationPhaseChange,
  onUpdateSettings,
  onUpdateHandActivationTuning,
  onUpdateFingerActivationTuning,
  onCalibrateFingerSensitivity,
  onSetFingerHoverCalibration,
  onSetFingerPressCalibration,
  onCalibrateDepthGate
}: Readonly<
  Pick<
    ControlPanelProps,
    | "state"
    | "calibrationHand"
    | "guidedCalibrationIndex"
    | "guidedActivationPhase"
    | "onCalibrationHandChange"
    | "onGuidedCalibrationIndexChange"
    | "onGuidedActivationPhaseChange"
    | "onUpdateSettings"
    | "onUpdateHandActivationTuning"
    | "onUpdateFingerActivationTuning"
    | "onCalibrateFingerSensitivity"
    | "onSetFingerHoverCalibration"
    | "onSetFingerPressCalibration"
    | "onCalibrateDepthGate"
  >
>) {
  const guidedCalibrationFinger =
    guidedCalibrationIndex === null
      ? null
      : FINGERTIP_SENSITIVITY_CONTROLS[guidedCalibrationIndex] ?? null;
  const hasFingerDepthSamples = FINGERTIP_SENSITIVITY_CONTROLS.some(
    ({ key }) => state.debug.fingerDepthSamplesFresh[calibrationHand][key]
  );
  const selectedHandBulkTuning = state.settings.activationTuning[calibrationHand].index;

  return (
    <section className="panel-card">
      <div className="legend-header touch-tuning-header">
        <h2>Touch Tuning</h2>
        <label className="inline-select">
          <span>Calibration hand</span>
          <select
            value={calibrationHand}
            onChange={(event) => onCalibrationHandChange(event.target.value as Handedness)}
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
            {getGuidedCalibrationTitle(
              calibrationHand,
              guidedCalibrationIndex,
              guidedActivationPhase
            )}
          </span>
        </div>
        <p className="settings-help guided-calibration-copy">
          {getGuidedCalibrationCopy(
            calibrationHand,
            guidedCalibrationFinger,
            guidedActivationPhase
          )}
        </p>
        <div className="button-row">
          {guidedCalibrationFinger ? (
            <>
              <button
                className="secondary-button"
                onClick={() => {
                  if (guidedActivationPhase === "hover") {
                    onSetFingerHoverCalibration(guidedCalibrationFinger.key, calibrationHand);
                    onGuidedActivationPhaseChange("press");
                    return;
                  }

                  onSetFingerPressCalibration(guidedCalibrationFinger.key, calibrationHand);
                  onGuidedActivationPhaseChange("hover");
                  onGuidedCalibrationIndexChange(
                    guidedCalibrationIndex === null ||
                      guidedCalibrationIndex >= FINGERTIP_SENSITIVITY_CONTROLS.length - 1
                      ? null
                      : guidedCalibrationIndex + 1
                  );
                }}
                disabled={
                  !state.debug.fingerDepthSamplesFresh[calibrationHand][guidedCalibrationFinger.key]
                }
              >
                {guidedActivationPhase === "hover" ? "Set Hover" : "Set Press"}
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  onGuidedActivationPhaseChange("hover");
                  onGuidedCalibrationIndexChange(
                    guidedCalibrationIndex === null ? 0 : Math.max(guidedCalibrationIndex - 1, 0)
                  );
                }}
                disabled={guidedCalibrationIndex === 0}
              >
                Previous
              </button>
              <button
                className="ghost-button"
                onClick={() => {
                  onGuidedCalibrationIndexChange(null);
                  onGuidedActivationPhaseChange("hover");
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="secondary-button"
              onClick={() => {
                onGuidedActivationPhaseChange("hover");
                onGuidedCalibrationIndexChange(0);
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
            onUpdateSettings({
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
            onUpdateHandActivationTuning(
              { touchDwellMs: value },
              {
                touchDwellMs: {
                  ...state.settings.touchDwellMs,
                  [calibrationHand]: value
                }
              }
            )
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
            onUpdateHandActivationTuning(
              { pressActivationThreshold: value },
              {
                pressActivationThreshold: {
                  ...state.settings.pressActivationThreshold,
                  [calibrationHand]: value
                }
              }
            )
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
            onUpdateHandActivationTuning(
              { hardActivationThreshold: value },
              {
                hardActivationThreshold: {
                  ...state.settings.hardActivationThreshold,
                  [calibrationHand]: value
                }
              }
            )
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
            onUpdateHandActivationTuning(
              { releaseActivationThreshold: value },
              {
                releaseActivationThreshold: {
                  ...state.settings.releaseActivationThreshold,
                  [calibrationHand]: value
                }
              }
            )
          }
          help="Lower values hold longer. Higher values release with smaller lifts."
        />
        <RangeNumberControl
          label={`${calibrationHand} press velocity`}
          min={0}
          max={999}
          step={0.1}
          value={selectedHandBulkTuning.pressVelocityThreshold}
          onChange={(value) =>
            onUpdateHandActivationTuning(
              { pressVelocityThreshold: value },
              {
                pressVelocityThreshold: {
                  ...state.settings.pressVelocityThreshold,
                  [calibrationHand]: value
                }
              }
            )
          }
          help="High values effectively disable press velocity assist; release assist remains separate."
        />
        <RangeNumberControl
          label={`${calibrationHand} release velocity`}
          min={0}
          max={30}
          step={0.1}
          value={selectedHandBulkTuning.releaseVelocityThreshold}
          onChange={(value) =>
            onUpdateHandActivationTuning(
              { releaseVelocityThreshold: value },
              {
                releaseVelocityThreshold: {
                  ...state.settings.releaseVelocityThreshold,
                  [calibrationHand]: value
                }
              }
            )
          }
          help="Lower values release faster when activation is falling."
        />
        <RangeNumberControl
          label={`${calibrationHand} velocity smoothing`}
          min={0.05}
          max={1}
          step={0.01}
          value={selectedHandBulkTuning.activationVelocitySmoothing}
          onChange={(value) =>
            onUpdateHandActivationTuning(
              { activationVelocitySmoothing: value },
              {
                activationVelocitySmoothing: {
                  ...state.settings.activationVelocitySmoothing,
                  [calibrationHand]: value
                }
              }
            )
          }
          help="Higher values react faster to activation velocity; lower values smooth more."
        />
        <div className="settings-action settings-span-2">
          <div className="legend-header">
            <span>Per-finger z sensitivity</span>
            <strong>{calibrationHand} hand</strong>
          </div>
          <div className="finger-sensitivity-grid">
            {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => {
              const calibration = state.settings.touchCalibration[calibrationHand][key];
              const hasSample = state.debug.fingerDepthSamplesFresh[calibrationHand][key];

              return (
                <div key={key} className="finger-sensitivity-control">
                  <RangeNumberControl
                    label={label}
                    min={0}
                    max={10}
                    step={0.1}
                    value={state.settings.fingerDepthSensitivity[calibrationHand][key]}
                    onChange={(value) =>
                      onUpdateSettings({
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
                      onClick={() => onSetFingerHoverCalibration(key, calibrationHand)}
                      disabled={!hasSample}
                    >
                      Set Hover
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => onSetFingerPressCalibration(key, calibrationHand)}
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
            `0` disables z triggering for that fingertip, `1` is neutral, and `10` multiplies that
            fingertip&apos;s raw depth before hover/press activation is calculated.
          </small>
          <small className="settings-help">
            Left and right hands now keep separate fingertip sensitivities. You are editing the{" "}
            {calibrationHand.toLowerCase()} hand.
          </small>
          <button
            className="ghost-button"
            onClick={() => onCalibrateFingerSensitivity(calibrationHand)}
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
                        onUpdateFingerActivationTuning(key, { pressActivationThreshold: value })
                      }
                    />
                    <RangeNumberControl
                      label="Hard"
                      min={0}
                      max={1}
                      step={0.01}
                      value={tuning.hardActivationThreshold}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, { hardActivationThreshold: value })
                      }
                    />
                    <RangeNumberControl
                      label="Release"
                      min={0}
                      max={1}
                      step={0.01}
                      value={tuning.releaseActivationThreshold}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, {
                          releaseActivationThreshold: value
                        })
                      }
                    />
                    <RangeNumberControl
                      label="Dwell ms"
                      min={0}
                      max={80}
                      step={1}
                      value={tuning.touchDwellMs}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, { touchDwellMs: value })
                      }
                    />
                    <RangeNumberControl
                      label="Press velocity"
                      min={0}
                      max={999}
                      step={0.1}
                      value={tuning.pressVelocityThreshold}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, { pressVelocityThreshold: value })
                      }
                    />
                    <RangeNumberControl
                      label="Release velocity"
                      min={0}
                      max={60}
                      step={0.1}
                      value={tuning.releaseVelocityThreshold}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, { releaseVelocityThreshold: value })
                      }
                    />
                    <RangeNumberControl
                      label="Velocity smoothing"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={tuning.activationVelocitySmoothing}
                      onChange={(value) =>
                        onUpdateFingerActivationTuning(key, { activationVelocitySmoothing: value })
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
            onClick={() => onCalibrateDepthGate(calibrationHand)}
            disabled={state.debug.touchDepth[calibrationHand] === null}
          >
            Calibrate {calibrationHand} Hand Gate
          </button>
          <small className="settings-help">
            Place a {calibrationHand.toLowerCase()} fingertip on the keybed, then calibrate to set
            the gate just below that hand&apos;s current press score.
          </small>
        </div>
      </div>
    </section>
  );
}

function CalibrationSummaryPanel({ state }: Readonly<Pick<ControlPanelProps, "state">>) {
  if (state.calibrationSession.phase !== "complete") {
    return null;
  }

  return (
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
  );
}

function GeneralSettingsPanel({
  state,
  pianoVerticalBounds,
  onUpdateSettings
}: Readonly<Pick<ControlPanelProps, "state" | "pianoVerticalBounds" | "onUpdateSettings">>) {
  return (
    <section className="panel-card settings-grid">
      <label>
        <span>Strip size</span>
        <select
          value={state.settings.noteStripSize}
          onChange={(event) =>
            onUpdateSettings({
              noteStripSize: event.target.value as "compact" | "normal" | "large"
            })
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
          onChange={(event) =>
            onUpdateSettings({ labelStyle: event.target.value as "sharps" | "flats" })
          }
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
            onUpdateSettings({ synthPatch: event.target.value as "soft-keys" | "warm-pad" })
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
          onChange={(event) => onUpdateSettings({ deviceId: event.target.value })}
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
            onUpdateSettings({ trackingBackend: event.target.value as TrackerBackendKind })
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
          onChange={(event) => onUpdateSettings({ audioOutputDeviceId: event.target.value })}
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
            onUpdateSettings({
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
        onChange={(value) => onUpdateSettings({ trackingSensitivity: value })}
      />
      <RangeNumberControl
        label="Hand overlay thickness"
        min={0.2}
        max={1.6}
        step={0.01}
        value={state.settings.overlayThickness}
        onChange={(value) => onUpdateSettings({ overlayThickness: value })}
      />
      <RangeNumberControl
        label="Piano position"
        min={Number(pianoVerticalBounds.min.toFixed(3))}
        max={Number(pianoVerticalBounds.max.toFixed(3))}
        step={0.001}
        value={state.settings.pianoVerticalOffset}
        onChange={(value) => onUpdateSettings({ pianoVerticalOffset: value })}
      />
      <RangeNumberControl
        label="Key height"
        min={0.8}
        max={MAX_PIANO_HEIGHT_SCALE}
        step={0.01}
        value={state.settings.pianoHeightScale}
        onChange={(value) => onUpdateSettings({ pianoHeightScale: value })}
      />
      <RangeNumberControl
        label="Key width"
        min={0.85}
        max={1.2}
        step={0.001}
        value={state.settings.pianoWidthScale}
        onChange={(value) => onUpdateSettings({ pianoWidthScale: value })}
        help={`${state.settings.pianoWidthScale.toFixed(3)}x wider piano means thicker keys and wider hit boxes.`}
      />
      <RangeNumberControl
        label="Octaves"
        min={MIN_PIANO_OCTAVES}
        max={MAX_PIANO_OCTAVES}
        step={1}
        value={state.settings.pianoOctaves}
        onChange={(value) => onUpdateSettings({ pianoOctaves: Math.round(value) })}
        help={`${state.settings.pianoOctaves} octave${state.settings.pianoOctaves === 1 ? "" : "s"} displayed from C to C.`}
      />
      <RangeNumberControl
        label="Piano opacity"
        min={0.2}
        max={1}
        step={0.01}
        value={state.settings.pianoOpacity}
        onChange={(value) => onUpdateSettings({ pianoOpacity: value })}
      />
      <label>
        <span>Hit box color</span>
        <input
          type="color"
          value={state.settings.hitBoxColor}
          onChange={(event) => onUpdateSettings({ hitBoxColor: event.target.value })}
        />
      </label>
      <RangeNumberControl
        label="Volume"
        min={-24}
        max={6}
        step={0.5}
        value={state.settings.volume}
        onChange={(value) => onUpdateSettings({ volume: value })}
      />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={state.settings.showDebugOverlays}
          onChange={(event) => onUpdateSettings({ showDebugOverlays: event.target.checked })}
        />
        <span>Debug overlays</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={state.settings.showFingertipStats}
          onChange={(event) => onUpdateSettings({ showFingertipStats: event.target.checked })}
        />
        <span>Fingertip stats</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={state.settings.showHitBoxes}
          onChange={(event) => onUpdateSettings({ showHitBoxes: event.target.checked })}
        />
        <span>Show hit boxes</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={state.settings.lowLatencyMode}
          onChange={(event) => onUpdateSettings({ lowLatencyMode: event.target.checked })}
        />
        <span>Low latency visuals</span>
      </label>
    </section>
  );
}

function CircleSettingsPanel({
  state,
  onUpdateCircleFingerEnabled,
  onUpdateCircleOfFifths,
  onUpdateCircleNoteOctave,
  onUpdateCircleOpenOctaveShift
}: Readonly<
  Pick<
    ControlPanelProps,
    | "state"
    | "onUpdateCircleFingerEnabled"
    | "onUpdateCircleOfFifths"
    | "onUpdateCircleNoteOctave"
    | "onUpdateCircleOpenOctaveShift"
  >
>) {
  if (state.settings.playMode !== "circle") {
    return null;
  }

  return (
    <section className="panel-card circle-settings-card">
      <div className="legend-header">
        <h2>Circle Mode</h2>
        <strong>Z-free</strong>
      </div>
      <p className="settings-help">
        Fingertips choose roots by circle segment. If a hand has more than one enabled fingertip,
        that hand switches to single-note pads. With exactly one enabled fingertip, hand shape
        chooses the chord quality.
      </p>
      <div className="circle-settings-grid">
        {CIRCLE_HANDS.map((hand) => (
          <div key={`circle-settings-${hand}`} className="circle-hand-settings">
            <div className="legend-header">
              <strong>{hand} hand</strong>
              <label className="checkbox-row compact-checkbox">
                <input
                  type="checkbox"
                  checked={state.settings.circleOfFifths[hand]}
                  onChange={(event) => onUpdateCircleOfFifths(hand, event.target.checked)}
                />
                <span>Circle of fifths</span>
              </label>
            </div>
            <div className="circle-finger-grid">
              {FINGERTIP_SENSITIVITY_CONTROLS.map(({ key, label }) => (
                <label key={`circle-${hand}-${key}`} className="checkbox-row compact-checkbox">
                  <input
                    type="checkbox"
                    checked={state.settings.circleFingerEnabled[hand][key]}
                    onChange={(event) =>
                      onUpdateCircleFingerEnabled(hand, key, event.target.checked)
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <RangeNumberControl
              label="Open-hand octave shift"
              min={MIN_CIRCLE_OPEN_OCTAVE_SHIFT}
              max={MAX_CIRCLE_OPEN_OCTAVE_SHIFT}
              step={1}
              value={state.settings.circleOpenOctaveShift[hand]}
              onChange={(value) => onUpdateCircleOpenOctaveShift(hand, value)}
              help="Applied when the hand is clearly straightened. Use -1 to drop or +1 to lift an octave."
            />
            <div className="circle-octave-grid">
              {getCircleNoteOrder(state.settings.circleOfFifths[hand]).map((note) => (
                <label key={`circle-octave-${hand}-${note}`} className="circle-octave-chip">
                  <span>{note}</span>
                  <input
                    type="number"
                    min={MIN_CIRCLE_NOTE_OCTAVE}
                    max={MAX_CIRCLE_NOTE_OCTAVE}
                    step={1}
                    value={state.settings.circleNoteOctaves[hand][note]}
                    onChange={(event) =>
                      onUpdateCircleNoteOctave(hand, note, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
            <small className="settings-help">
              Base octaves follow the current note order. Defaults keep the left hand one octave
              under the right.
            </small>
          </div>
        ))}
      </div>
      <div className="circle-combo-legend">
        <span>2+ enabled fingers: single notes only</span>
        <span>Index: single</span>
        <span>Index + middle: major</span>
        <span>+ thumb: minor</span>
        <span>+ ring: major7/minor7</span>
        <span>Pinky: diminished</span>
      </div>
    </section>
  );
}

function LegendPanel({
  state,
  onExportLogs
}: Readonly<Pick<ControlPanelProps, "state" | "onExportLogs">>) {
  return (
    <section className="panel-card">
      <div className="legend-header">
        <h2>{state.settings.playMode === "circle" ? "Circle Touch" : "Piano Touch"}</h2>
        <strong>{state.currentChordLabel}</strong>
      </div>
      <div className="legend-list">
        {state.settings.playMode === "circle" ? (
          <>
            <div className="legend-item active">
              <span className="legend-icon">No z gate</span>
              <span>Circle mode plays from x/y segment hover only</span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Per hand</span>
              <span>Left hand controls the left circle; right hand controls the right circle</span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Shape chords</span>
              <span>Lifted-finger combos choose single, triad, diminished, or seventh voicings</span>
            </div>
          </>
        ) : (
          <>
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
              <span>
                Pressing uses per-fingertip hover/press calibration with velocity-assisted release
              </span>
            </div>
            <div className="legend-item active">
              <span className="legend-icon">Tracking layer</span>
              <span>Hands render above the keyboard</span>
            </div>
          </>
        )}
      </div>
      <button className="ghost-button full-width" onClick={onExportLogs}>
        Export Session Log ({state.logCount})
      </button>
    </section>
  );
}

function DebugPanel({
  state,
  calibrationHand,
  guidedCalibrationIndex
}: Readonly<
  Pick<ControlPanelProps, "state" | "calibrationHand" | "guidedCalibrationIndex">
>) {
  if (!state.settings.showDebugOverlays) {
    return null;
  }

  const guidedCalibrationFinger =
    guidedCalibrationIndex === null
      ? null
      : FINGERTIP_SENSITIVITY_CONTROLS[guidedCalibrationIndex] ?? null;

  return (
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
        <span className="settings-help">Live sample buckets for the selected calibration hand</span>
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
              {state.debug.fingerDepthSamplesFresh[calibrationHand][key]
                ? " · live"
                : " · no live sample"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ControlPanel(props: Readonly<ControlPanelProps>) {
  return (
    <aside className="control-panel">
      <TouchTuningPanel
        state={props.state}
        calibrationHand={props.calibrationHand}
        guidedCalibrationIndex={props.guidedCalibrationIndex}
        guidedActivationPhase={props.guidedActivationPhase}
        onCalibrationHandChange={props.onCalibrationHandChange}
        onGuidedCalibrationIndexChange={props.onGuidedCalibrationIndexChange}
        onGuidedActivationPhaseChange={props.onGuidedActivationPhaseChange}
        onUpdateSettings={props.onUpdateSettings}
        onUpdateHandActivationTuning={props.onUpdateHandActivationTuning}
        onUpdateFingerActivationTuning={props.onUpdateFingerActivationTuning}
        onCalibrateFingerSensitivity={props.onCalibrateFingerSensitivity}
        onSetFingerHoverCalibration={props.onSetFingerHoverCalibration}
        onSetFingerPressCalibration={props.onSetFingerPressCalibration}
        onCalibrateDepthGate={props.onCalibrateDepthGate}
      />
      <CalibrationSummaryPanel state={props.state} />
      <GeneralSettingsPanel
        state={props.state}
        pianoVerticalBounds={props.pianoVerticalBounds}
        onUpdateSettings={props.onUpdateSettings}
      />
      <CircleSettingsPanel
        state={props.state}
        onUpdateCircleFingerEnabled={props.onUpdateCircleFingerEnabled}
        onUpdateCircleOfFifths={props.onUpdateCircleOfFifths}
        onUpdateCircleNoteOctave={props.onUpdateCircleNoteOctave}
        onUpdateCircleOpenOctaveShift={props.onUpdateCircleOpenOctaveShift}
      />
      <LegendPanel state={props.state} onExportLogs={props.onExportLogs} />
      <DebugPanel
        state={props.state}
        calibrationHand={props.calibrationHand}
        guidedCalibrationIndex={props.guidedCalibrationIndex}
      />
    </aside>
  );
}
