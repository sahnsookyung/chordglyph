import type { CalibrationScope } from "../lib/types";
import { CALIBRATION_SCOPE_OPTIONS, audioStatusLabel } from "./appShared";

interface AppTopBarProps {
  playMode: "piano" | "circle";
  audioStatus: "idle" | "arming" | "armed" | "blocked" | "error";
  trackerStatus: string;
  calibrationScope: CalibrationScope;
  calibrationActive: boolean;
  error: string | null;
  warning: string | null;
  startupNotice: string | null;
  audioOutputNotice: string | null;
  onPlayModeChange: (value: "piano" | "circle") => void;
  onArmAudio: () => void;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onCalibrationScopeChange: (value: CalibrationScope) => void;
  onStartCalibration: () => void;
  onCancelCalibration: () => void;
}

function getTopbarSubtitle(playMode: "piano" | "circle"): string {
  return playMode === "circle" ? "Fingertip circles" : "Fingertip piano";
}

function getAudioTitle(audioStatus: AppTopBarProps["audioStatus"]): string | undefined {
  return audioStatus === "blocked" || audioStatus === "error"
    ? "Click to retry audio startup"
    : undefined;
}

export function AppTopBar({
  playMode,
  audioStatus,
  trackerStatus,
  calibrationScope,
  calibrationActive,
  error,
  warning,
  startupNotice,
  audioOutputNotice,
  onPlayModeChange,
  onArmAudio,
  onStartTracking,
  onStopTracking,
  onCalibrationScopeChange,
  onStartCalibration,
  onCancelCalibration
}: Readonly<AppTopBarProps>) {
  return (
    <header className="app-topbar">
      <div className="brand-block topbar-brand">
        <h1>ChordGlyph</h1>
        <p className="topbar-subtitle">{getTopbarSubtitle(playMode)}</p>
      </div>

      <div className="topbar-actions">
        <div className="button-row topbar-buttons">
          <label className="topbar-scope-select">
            <span>Play mode</span>
            <select
              value={playMode}
              onChange={(event) => onPlayModeChange(event.target.value as "piano" | "circle")}
            >
              <option value="piano">Piano</option>
              <option value="circle">Circle</option>
            </select>
          </label>
          <button
            className={`audio-status-pill ${audioStatus}`}
            onClick={onArmAudio}
            disabled={audioStatus === "arming" || audioStatus === "armed"}
            title={getAudioTitle(audioStatus)}
          >
            {audioStatusLabel(audioStatus)}
          </button>
          {trackerStatus === "ready" ? (
            <span className="topbar-live-pill">Camera live</span>
          ) : (
            <button className="primary-button" onClick={onStartTracking}>
              Enable Camera
            </button>
          )}
          <button className="ghost-button" onClick={onStopTracking}>
            Stop
          </button>
          <label className="topbar-scope-select">
            <span>Calibration</span>
            <select
              value={calibrationScope}
              onChange={(event) => onCalibrationScopeChange(event.target.value as CalibrationScope)}
              disabled={calibrationActive}
            >
              {CALIBRATION_SCOPE_OPTIONS.map((scope) => (
                <option key={scope} value={scope}>
                  {scope === "Both" ? "Both hands" : `${scope} hand`}
                </option>
              ))}
            </select>
          </label>
          {calibrationActive ? (
            <button className="ghost-button" onClick={onCancelCalibration}>
              Cancel
            </button>
          ) : (
            <button className="secondary-button" onClick={onStartCalibration}>
              Calibrate Feel
            </button>
          )}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        {warning ? <p className="warning-text">{warning}</p> : null}
        {startupNotice ? <p className="warning-text">{startupNotice}</p> : null}
        {audioOutputNotice ? <p className="warning-text">{audioOutputNotice}</p> : null}
      </div>
    </header>
  );
}
