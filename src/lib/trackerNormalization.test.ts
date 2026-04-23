import { mirrorLandmarkForDisplay, normalizeHandedness } from "./trackerNormalization";

describe("tracker normalization", () => {
  it("swaps MediaPipe handedness labels into real camera handedness", () => {
    expect(normalizeHandedness("Left")).toBe("Right");
    expect(normalizeHandedness("Right")).toBe("Left");
    expect(normalizeHandedness(undefined)).toBe("Right");
  });

  it("mirrors landmarks into display space", () => {
    expect(
      mirrorLandmarkForDisplay({
        x: 0.2,
        y: 0.4,
        z: -0.1
      })
    ).toEqual({
      x: 0.8,
      y: 0.4,
      z: -0.1
    });
  });
});
