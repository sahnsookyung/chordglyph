import { classifyChordGestureFromFeatures } from "./gestureClassifier";
import type { HandFeatures } from "./types";

function makeFeatures(overrides: Partial<HandFeatures>): HandFeatures {
  return {
    palmCenter: { x: 0.5, y: 0.5, z: 0 },
    handScale: 0.2,
    pinchIndex: 0.1,
    pinchMiddle: 0.1,
    averageCurl: 0.15,
    fingerCurl: {
      index: 0.1,
      middle: 0.1,
      ring: 0.1,
      pinky: 0.1
    },
    tipToPalm: {
      index: 1.4,
      middle: 1.4,
      ring: 1.3,
      pinky: 1.3
    },
    extendedCount: 4,
    fistness: 0.15,
    openness: 0.88,
    ...overrides
  };
}

describe("classifyChordGestureFromFeatures", () => {
  it("recognizes open hand as single-note mode", () => {
    const result = classifyChordGestureFromFeatures(makeFeatures({}));
    expect(result.ambiguous).toBe(false);
    expect(result.mode).toBe("single");
  });

  it("recognizes thumb-index pinch as major mode", () => {
    const result = classifyChordGestureFromFeatures(
      makeFeatures({
        pinchIndex: 0.92,
        pinchMiddle: 0.18,
        openness: 0.18,
        averageCurl: 0.25
      })
    );
    expect(result.mode).toBe("major");
  });

  it("holds when two pinch modes are too close", () => {
    const result = classifyChordGestureFromFeatures(
      makeFeatures({
        pinchIndex: 0.71,
        pinchMiddle: 0.68,
        openness: 0.12,
        averageCurl: 0.24
      })
    );
    expect(result.ambiguous).toBe(true);
    expect(result.mode).toBe("single");
  });
});
