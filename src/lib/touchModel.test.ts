import {
  FINGER_SENSITIVITY_BOUNDS,
  calibrateFingerDepthSensitivity,
  calibrateSingleFingerDepthSensitivity,
  deriveTouchCalibrationDirection,
  getActivationVelocity,
  getTouchActivation,
  getVisualActivationProgress,
  shouldPressTouch,
  tipIndexToFingerName
} from "./touchModel";

describe("touchModel helpers", () => {
  it("maps playable tip indexes to fingertip names", () => {
    expect(tipIndexToFingerName(4)).toBe("thumb");
    expect(tipIndexToFingerName(8)).toBe("index");
    expect(tipIndexToFingerName(20)).toBe("pinky");
  });

  it("keeps visual activation progress normalized to the active depth gate", () => {
    expect(getVisualActivationProgress(0.01, 0.02)).toBeCloseTo(0.5, 5);
    expect(getVisualActivationProgress(0.05, 0.02)).toBe(1);
  });

  it("requires a stable key or a hard press before firing", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: false,
        stableMs: 32,
        activation: 0.62,
        activationVelocity: 0
      })
    ).toBe(true);

    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:9",
        previousPressed: false,
        stableMs: 0,
        activation: 0.7,
        activationVelocity: 0
      })
    ).toBe(false);
  });

  it("releases an already-playing key once normalized depth falls back too far", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: true,
        stableMs: 48,
        activation: 0.24,
        activationVelocity: -0.3
      })
    ).toBe(false);
  });

  it("lets a calibrated depth press fire without needing an excessive overshoot", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: false,
        stableMs: 20,
        activation: 0.56,
        activationVelocity: 0
      })
    ).toBe(true);
  });

  it("maps calibrated hover and press depths into activation", () => {
    const activation = getTouchActivation({
      effectiveDepthScore: 0.015,
      depthGate: 0.02,
      calibration: { hoverDepth: 0.01, pressDepth: 0.02, direction: 1 }
    });

    expect(activation.calibrated).toBe(true);
    expect(activation.activation).toBeCloseTo(0.5, 5);
  });

  it("supports inverted calibrated depth direction", () => {
    const activation = getTouchActivation({
      effectiveDepthScore: 0.015,
      depthGate: 0.02,
      calibration: { hoverDepth: 0.02, pressDepth: 0.01, direction: -1 }
    });

    expect(deriveTouchCalibrationDirection(0.02, 0.01)).toBe(-1);
    expect(activation.activation).toBeCloseTo(0.5, 5);
  });

  it("derives calibrated thresholds from raw depths and current sensitivity", () => {
    const activation = getTouchActivation({
      effectiveDepthScore: 0.03,
      depthGate: 0.02,
      sensitivity: 2,
      calibration: {
        hoverDepth: 0.01,
        pressDepth: 0.02,
        rawHoverDepth: 0.01,
        rawPressDepth: 0.02,
        sensitivityAtCalibration: 1,
        direction: 1,
        targetKey: "white:0",
        qualityScore: 0.9,
        noiseFloor: 0.001,
        pressDelta: 0.01,
        pressVelocity: 4,
        releaseVelocity: 3,
        sampleCount: 40,
        updatedAt: 1
      }
    });

    expect(activation.activation).toBeCloseTo(0.5, 5);
  });

  it("falls back to the depth gate when calibration is missing", () => {
    const activation = getTouchActivation({
      effectiveDepthScore: 0.01,
      depthGate: 0.02,
      calibration: { hoverDepth: null, pressDepth: null, direction: 1 }
    });

    expect(activation.calibrated).toBe(false);
    expect(activation.activation).toBeCloseTo(0.5, 5);
  });

  it("does not treat absent raw calibration fields as zero-depth raw calibration", () => {
    const activation = getTouchActivation({
      effectiveDepthScore: 0.015,
      depthGate: 0.02,
      sensitivity: 2,
      calibration: { hoverDepth: 0.01, pressDepth: 0.02, direction: 1 }
    });

    expect(activation.calibrated).toBe(true);
    expect(activation.activation).toBeCloseTo(0.5, 5);
  });

  it("uses release velocity only near the release boundary", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: true,
        stableMs: 20,
        activation: 0.5,
        activationVelocity: -6
      })
    ).toBe(false);

    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: true,
        stableMs: 20,
        activation: 0.8,
        activationVelocity: -6
      })
    ).toBe(true);
  });

  it("does not let press velocity trigger far below the threshold", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: false,
        stableMs: 0,
        activation: 0.2,
        activationVelocity: 50,
        tuning: { pressVelocityThreshold: 4 }
      })
    ).toBe(false);
  });

  it("smooths activation velocity from frame timestamps", () => {
    const velocity = getActivationVelocity({
      previousActivation: 0.2,
      nextActivation: 0.5,
      elapsedMs: 100,
      previousVelocity: 0,
      smoothing: 0.5
    });

    expect(velocity).toBeCloseTo(1.5, 5);
  });

  it("clamps extreme activation velocity spikes", () => {
    const velocity = getActivationVelocity({
      previousActivation: 0,
      nextActivation: 1,
      elapsedMs: 1,
      previousVelocity: 0,
      smoothing: 1
    });

    expect(velocity).toBe(60);
  });

  it("enforces sane activation threshold ordering at runtime", () => {
    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: true,
        stableMs: 20,
        activation: 0.6,
        activationVelocity: 0,
        tuning: {
          pressActivationThreshold: 0.5,
          releaseActivationThreshold: 0.8
        }
      })
    ).toBe(true);

    expect(
      shouldPressTouch({
        currentKey: "white:10",
        previousKey: "white:10",
        previousPressed: false,
        stableMs: 0,
        activation: 0.7,
        activationVelocity: 0,
        tuning: {
          pressActivationThreshold: 0.8,
          hardActivationThreshold: 0.4
        }
      })
    ).toBe(false);
  });

  it("calibrates per-finger sensitivity from the current pose", () => {
    const calibrated = calibrateFingerDepthSensitivity(
      {
        thumb: 1.35,
        index: 1,
        middle: 1,
        ring: 1,
        pinky: 1.05
      },
      {
        thumb: 0.012,
        index: 0.018,
        middle: null,
        ring: 0.02,
        pinky: 0.016
      },
      0.02
    );

    expect(calibrated.thumb).toBeGreaterThan(1.35);
    expect(calibrated.index).toBeGreaterThan(1);
    expect(calibrated.middle).toBe(1);
  });

  it("can calibrate a single finger without disturbing the others", () => {
    const calibrated = calibrateSingleFingerDepthSensitivity(
      {
        thumb: 1.35,
        index: 1,
        middle: 1,
        ring: 1,
        pinky: 1.05
      },
      {
        thumb: 0.012,
        index: 0.018,
        middle: 0.02,
        ring: 0.02,
        pinky: 0.016
      },
      0.02,
      "thumb"
    );

    expect(calibrated.thumb).toBeGreaterThan(1.35);
    expect(calibrated.index).toBe(1);
    expect(calibrated.middle).toBe(1);
  });

  it("clamps calibrated sensitivity to the full 0 to 10 range", () => {
    const calibrated = calibrateFingerDepthSensitivity(
      {
        thumb: 1,
        index: 1,
        middle: 1,
        ring: 1,
        pinky: 1
      },
      {
        thumb: 0.0001,
        index: 0.0001,
        middle: 0.0001,
        ring: 0.0001,
        pinky: 0.0001
      },
      0.02
    );

    expect(FINGER_SENSITIVITY_BOUNDS.min).toBe(0);
    expect(FINGER_SENSITIVITY_BOUNDS.max).toBe(10);
    expect(calibrated.thumb).toBe(10);
    expect(calibrated.index).toBe(10);
  });
});
