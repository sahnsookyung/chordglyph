import {
  CALIBRATION_SCOPE_OPTIONS,
  CIRCLE_HANDS,
  FINGERTIP_SENSITIVITY_CONTROLS,
  audioStatusLabel,
  confidenceTone,
  formatCalibrationQuality,
  formatDebugValue
} from "../../src/components/appShared";

describe("appShared helpers", () => {
  it("exposes the supported control lists", () => {
    expect(FINGERTIP_SENSITIVITY_CONTROLS.map(({ key }) => key)).toEqual([
      "thumb",
      "index",
      "middle",
      "ring",
      "pinky"
    ]);
    expect(CIRCLE_HANDS).toEqual(["Left", "Right"]);
    expect(CALIBRATION_SCOPE_OPTIONS).toEqual(["Both", "Left", "Right"]);
  });

  it("formats audio status, debug values, confidence, and quality", () => {
    expect(audioStatusLabel("arming")).toBe("Audio arming...");
    expect(audioStatusLabel("armed")).toBe("Audio ready");
    expect(audioStatusLabel("blocked")).toBe("Click to enable audio");
    expect(audioStatusLabel("error")).toBe("Audio retry");
    expect(audioStatusLabel("idle")).toBe("Click to enable audio");
    expect(confidenceTone(10)).toBe("#fb7185");
    expect(confidenceTone(30)).toBe("#f59e0b");
    expect(confidenceTone(50)).toBe("#4ade80");
    expect(formatDebugValue(null)).toBe("--");
    expect(formatDebugValue(1.2345, 3)).toBe("1.234");
    expect(formatCalibrationQuality(null)).toBe("--");
    expect(formatCalibrationQuality(0.556)).toBe("56%");
  });
});
