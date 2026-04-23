export type Handedness = "Left" | "Right";
export type HandRole = "note" | "chord";
export type ChordMode =
  | "single"
  | "major"
  | "minor"
  | "diminished"
  | "dominant7"
  | "major7"
  | "minor7";
export type TriggerMode = "hover" | "pinch";
export type PlayMode = "piano" | "circle";
export type AudioStatus = "idle" | "arming" | "armed" | "blocked" | "error";
export type SystemState =
  | "BOOT"
  | "CAMERA_READY"
  | "TRACKING_SEARCH"
  | "TRACKING_ACTIVE"
  | "PLAYING"
  | "DEGRADED_TRACKING"
  | "PAUSED";
export type NoteLabelStyle = "sharps" | "flats";
export type NoteStripSize = "compact" | "normal" | "large";
export type SynthPatch = "soft-keys" | "warm-pad";
export type FingertipName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type TrackerBackendKind =
  | "mediapipe-hands"
  | "mediapipe-hands-worker"
  | "yolo-pose"
  | "openpose";
export type CalibrationAudioMode = "off" | "cues" | "target-preview";
export type CalibrationScope = Handedness | "Both";
export type CalibrationPhase =
  | "idle"
  | "select-scope"
  | "control-rehearsal"
  | "capture-hover"
  | "confirm-hover"
  | "capture-taps"
  | "confirm-taps"
  | "finger-summary"
  | "preview"
  | "paused"
  | "complete";
export type FingerDepthSensitivityMap = Record<FingertipName, number>;
export type HandedFingerDepthSensitivity = Record<Handedness, FingerDepthSensitivityMap>;
export type FingerDepthSampleMap = Record<FingertipName, number | null>;
export type HandedFingerDepthSamples = Record<Handedness, FingerDepthSampleMap>;
export type CircleFingerEnabledMap = Record<FingertipName, boolean>;
export type HandedCircleFingerEnabled = Record<Handedness, CircleFingerEnabledMap>;
export type HandedBooleanMap = Record<Handedness, boolean>;
export type HandedTouchDepthMap = Record<Handedness, number | null>;
export type HandedNumberMap = Record<Handedness, number>;
export type TouchCalibrationDirection = -1 | 1;

export interface FingerActivationTuning {
  hardActivationThreshold: number;
  pressActivationThreshold: number;
  releaseActivationThreshold: number;
  touchDwellMs: number;
  pressVelocityThreshold: number;
  releaseVelocityThreshold: number;
  activationVelocitySmoothing: number;
}

export type FingerActivationTuningMap = Record<FingertipName, FingerActivationTuning>;
export type HandedFingerActivationTuning = Record<Handedness, FingerActivationTuningMap>;

export interface TouchCalibrationPoint {
  hoverDepth: number | null;
  pressDepth: number | null;
  rawHoverDepth: number | null;
  rawPressDepth: number | null;
  sensitivityAtCalibration: number | null;
  direction: TouchCalibrationDirection;
  targetKey: string | null;
  qualityScore: number | null;
  noiseFloor: number | null;
  pressDelta: number | null;
  pressVelocity: number | null;
  releaseVelocity: number | null;
  sampleCount: number;
  updatedAt: number | null;
}

export type FingerTouchCalibrationMap = Record<FingertipName, TouchCalibrationPoint>;
export type HandedTouchCalibration = Record<Handedness, FingerTouchCalibrationMap>;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  id: string;
  handedness: Handedness;
  confidence: number;
  landmarks: Landmark[];
}

export interface HandFeatures {
  palmCenter: Landmark;
  handScale: number;
  pinchIndex: number;
  pinchMiddle: number;
  averageCurl: number;
  fingerExtended: Record<FingertipName, boolean>;
  fingerCurl: Record<"index" | "middle" | "ring" | "pinky", number>;
  tipToPalm: Record<"index" | "middle" | "ring" | "pinky", number>;
  extendedCount: number;
  fistness: number;
  openness: number;
}

export interface GestureClassification {
  mode: ChordMode;
  confidence: number;
  ambiguous: boolean;
  scores: Record<ChordMode, number>;
  margin: number;
  reason: string;
}

export interface InstrumentSettings {
  playMode: PlayMode;
  noteStripSize: NoteStripSize;
  labelStyle: NoteLabelStyle;
  depthGate: HandedNumberMap;
  fingerDepthSensitivity: HandedFingerDepthSensitivity;
  touchCalibration: HandedTouchCalibration;
  activationTuning: HandedFingerActivationTuning;
  hardActivationThreshold: HandedNumberMap;
  pressActivationThreshold: HandedNumberMap;
  releaseActivationThreshold: HandedNumberMap;
  touchDwellMs: HandedNumberMap;
  pressVelocityThreshold: HandedNumberMap;
  releaseVelocityThreshold: HandedNumberMap;
  activationVelocitySmoothing: HandedNumberMap;
  trackingSensitivity: number;
  overlayThickness: number;
  pianoVerticalOffset: number;
  pianoHeightScale: number;
  pianoWidthScale: number;
  pianoOctaves: number;
  pianoOpacity: number;
  showHitBoxes: boolean;
  hitBoxColor: string;
  lowLatencyMode: boolean;
  volume: number;
  synthPatch: SynthPatch;
  showDebugOverlays: boolean;
  showFingertipStats: boolean;
  circleFingerEnabled: HandedCircleFingerEnabled;
  circleOfFifths: HandedBooleanMap;
  deviceId: string;
  audioOutputDeviceId: string;
  trackingBackend: TrackerBackendKind;
  calibrationAudioMode: CalibrationAudioMode;
}

export interface TrackerFrame {
  hands: TrackedHand[];
  timestamp: number;
  fps: number;
  latencyMs: number;
}

export interface AudioEvent {
  kind: "play" | "stop";
  rootIndex: number | null;
  mode: ChordMode;
  timestamp: number;
}

export interface SessionLogEvent {
  type:
    | "tracker-status"
    | "note-zone"
    | "mode-change"
    | "audio-event"
    | "tracking-drop"
    | "warning";
  timestamp: number;
  payload: Record<string, unknown>;
}
