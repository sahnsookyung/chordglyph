import { DEFAULT_SETTINGS } from "../../src/lib/constants";
import { normalizeInstrumentSettings } from "../../src/lib/settingsNormalization";

describe("normalizeInstrumentSettings", () => {
  it("keeps supported settings and drops stale intent fields", () => {
    const normalized = normalizeInstrumentSettings({
      depthGate: 0.031,
      touchEntryThreshold: 0.88,
      touchHardThreshold: 1.2,
      touchReleaseThreshold: 0.63,
      touchDwellMs: 22,
      touchEntryIntentThreshold: 0.66,
      touchHoldIntentThreshold: 0.77,
      touchIsolationThreshold: 0.004,
      touchIntentDepthWeight: 0.5,
      touchIntentMotionWeight: 0.4,
      touchIntentCurlWeight: 0.1,
      fingerDepthSensitivity: {
        thumb: 2.5
      }
    });

    expect(normalized.depthGate.Left).toBe(0.031);
    expect(normalized.depthGate.Right).toBe(0.031);
    expect(normalized.pressActivationThreshold.Left).toBe(0.88);
    expect(normalized.pressActivationThreshold.Right).toBe(0.88);
    expect(normalized.hardActivationThreshold.Left).toBe(1);
    expect(normalized.releaseActivationThreshold.Right).toBe(0.63);
    expect(normalized.touchDwellMs.Left).toBe(22);
    expect(normalized.activationTuning.Left.thumb.pressActivationThreshold).toBe(0.88);
    expect(normalized.activationTuning.Right.pinky.hardActivationThreshold).toBe(1);
    expect(normalized.fingerDepthSensitivity.Left.thumb).toBe(2.5);
    expect(normalized.fingerDepthSensitivity.Right.thumb).toBe(2.5);
    expect("touchEntryIntentThreshold" in normalized).toBe(false);
    expect("touchIntentDepthWeight" in normalized).toBe(false);
    expect("touchEntryThreshold" in normalized).toBe(false);
  });

  it("preserves separate left and right hand sensitivity maps", () => {
    const normalized = normalizeInstrumentSettings({
      depthGate: { Left: 0.018, Right: 0.029 },
      pressActivationThreshold: { Left: 0.51, Right: 0.61 },
      hardActivationThreshold: { Left: 0.77, Right: 0.91 },
      releaseActivationThreshold: { Left: 0.29, Right: 0.42 },
      touchDwellMs: { Left: 12, Right: 24 },
      touchCalibration: {
        Left: { thumb: { hoverDepth: 0.011, pressDepth: 0.017, direction: -1 } },
        Right: { thumb: { hoverDepth: 0.014, pressDepth: 0.009, direction: 1 } }
      },
      fingerDepthSensitivity: {
        Left: { thumb: 1.9, index: 1.1 },
        Right: { thumb: 3.4, pinky: 0.8 }
      }
    });

    expect(normalized.depthGate.Left).toBe(0.018);
    expect(normalized.depthGate.Right).toBe(0.029);
    expect(normalized.pressActivationThreshold.Left).toBe(0.51);
    expect(normalized.hardActivationThreshold.Right).toBe(0.91);
    expect(normalized.releaseActivationThreshold.Left).toBe(0.29);
    expect(normalized.touchDwellMs.Right).toBe(24);
    expect(normalized.touchCalibration.Left.thumb.hoverDepth).toBe(0.011);
    expect(normalized.touchCalibration.Left.thumb.direction).toBe(1);
    expect(normalized.touchCalibration.Right.thumb.direction).toBe(-1);
    expect(normalized.activationTuning.Left.index.pressActivationThreshold).toBe(0.51);
    expect(normalized.activationTuning.Right.ring.hardActivationThreshold).toBe(0.91);
    expect(normalized.fingerDepthSensitivity.Left.thumb).toBe(1.9);
    expect(normalized.fingerDepthSensitivity.Left.index).toBe(1.1);
    expect(normalized.fingerDepthSensitivity.Right.thumb).toBe(3.4);
    expect(normalized.fingerDepthSensitivity.Right.pinky).toBe(0.8);
  });

  it("falls back to defaults for invalid values", () => {
    const normalized = normalizeInstrumentSettings({
      volume: Number.NaN,
      showHitBoxes: "yes",
      playMode: "grid",
      showFingertipStats: "no",
      circleOfFifths: { Left: true, Right: "yes" },
      circleOpenOctaveShift: { Left: 4, Right: -7 },
      circleNoteOctaves: {
        Left: { C: 9, D: 0, E: 3 },
        Right: { G: 5 }
      },
      circleFingerEnabled: {
        Left: { thumb: true, index: false, middle: true, ring: "nope" }
      },
      trackingBackend: "not-real",
      audioOutputDeviceId: 42
    });

    expect(normalized.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(normalized.showHitBoxes).toBe(DEFAULT_SETTINGS.showHitBoxes);
    expect(normalized.playMode).toBe(DEFAULT_SETTINGS.playMode);
    expect(normalized.showFingertipStats).toBe(DEFAULT_SETTINGS.showFingertipStats);
    expect(normalized.circleOfFifths.Left).toBe(true);
    expect(normalized.circleOfFifths.Right).toBe(false);
    expect(normalized.circleFingerEnabled.Left.thumb).toBe(true);
    expect(normalized.circleFingerEnabled.Left.index).toBe(false);
    expect(normalized.circleFingerEnabled.Left.middle).toBe(true);
    expect(normalized.circleFingerEnabled.Left.ring).toBe(false);
    expect(normalized.circleFingerEnabled.Right.index).toBe(true);
    expect(normalized.circleNoteOctaves.Left.C).toBe(7);
    expect(normalized.circleNoteOctaves.Left.D).toBe(1);
    expect(normalized.circleNoteOctaves.Left.E).toBe(3);
    expect(normalized.circleNoteOctaves.Right.G).toBe(5);
    expect(normalized.circleOpenOctaveShift.Left).toBe(2);
    expect(normalized.circleOpenOctaveShift.Right).toBe(-2);
    expect(normalized.trackingBackend).toBe(DEFAULT_SETTINGS.trackingBackend);
    expect(normalized.audioOutputDeviceId).toBe(DEFAULT_SETTINGS.audioOutputDeviceId);
  });

  it("clamps persisted per-finger sensitivity to the supported range", () => {
    const normalized = normalizeInstrumentSettings({
      fingerDepthSensitivity: {
        Left: { thumb: -4, index: 12 },
        Right: { thumb: 2, pinky: 99 }
      }
    });

    expect(normalized.fingerDepthSensitivity.Left.thumb).toBe(0);
    expect(normalized.fingerDepthSensitivity.Left.index).toBe(10);
    expect(normalized.fingerDepthSensitivity.Right.thumb).toBe(2);
    expect(normalized.fingerDepthSensitivity.Right.pinky).toBe(10);
  });

  it("preserves audio output and tracker backend selections", () => {
    const normalized = normalizeInstrumentSettings({
      audioOutputDeviceId: "bluez-headphones",
      trackingBackend: "mediapipe-hands"
    });

    expect(normalized.audioOutputDeviceId).toBe("bluez-headphones");
    expect(normalized.trackingBackend).toBe("mediapipe-hands");
  });

  it("normalizes piano octave count to an integer in the supported range", () => {
    expect(normalizeInstrumentSettings({ pianoOctaves: 2.4 }).pianoOctaves).toBe(2);
    expect(normalizeInstrumentSettings({ pianoOctaves: 99 }).pianoOctaves).toBe(6);
    expect(normalizeInstrumentSettings({ pianoOctaves: -1 }).pianoOctaves).toBe(1);
    expect(normalizeInstrumentSettings({ pianoOctaves: "wide" }).pianoOctaves).toBe(
      DEFAULT_SETTINGS.pianoOctaves
    );
  });
});
