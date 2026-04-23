import {
  createHandedFingerDepthSensitivity,
  emptyFingerDepthSamples,
  emptyHandedFingerDepthSamples,
  getCalibrationDepthScore,
  getCalibrationFingerSamples,
  recordFingerDepthSample
} from "./calibration";

describe("calibration helpers", () => {
  it("keeps per-hand finger samples isolated", () => {
    const leftSamples = recordFingerDepthSample(emptyFingerDepthSamples(), "thumb", 0.012);
    const rightSamples = recordFingerDepthSample(emptyFingerDepthSamples(), "thumb", 0.02);
    const samplesByHand = {
      Left: leftSamples,
      Right: rightSamples
    };

    expect(getCalibrationFingerSamples(samplesByHand, "Left").thumb).toBe(0.012);
    expect(getCalibrationFingerSamples(samplesByHand, "Right").thumb).toBe(0.02);
  });

  it("derives gate calibration depth from the strongest sample on the chosen hand", () => {
    const touchSamples = [
      { handedness: "Left" as const, finger: "thumb", rawDepthScore: 0.012, effectiveDepthScore: 0.014 },
      { handedness: "Left" as const, finger: "index", rawDepthScore: 0.019, effectiveDepthScore: 0.021 },
      { handedness: "Right" as const, finger: "thumb", rawDepthScore: 0.018, effectiveDepthScore: 0.0185 }
    ];

    expect(getCalibrationDepthScore(touchSamples, "Left")).toBe(0.021);
    expect(getCalibrationDepthScore(touchSamples, "Right")).toBe(0.0185);
  });

  it("builds a full 10-finger sensitivity map", () => {
    const sensitivity = createHandedFingerDepthSensitivity(
      { thumb: 1.5 },
      { index: 2.2 }
    );

    expect(sensitivity.Left.thumb).toBe(1.5);
    expect(sensitivity.Left.index).toBe(1);
    expect(sensitivity.Right.thumb).toBe(1.35);
    expect(sensitivity.Right.index).toBe(2.2);
  });

  it("initializes empty sample buckets for both hands", () => {
    const samples = emptyHandedFingerDepthSamples();

    expect(samples.Left).toEqual(emptyFingerDepthSamples());
    expect(samples.Right).toEqual(emptyFingerDepthSamples());
  });
});
