import { extractHandFeatures } from "../../src/lib/featureExtraction";
import type { Landmark } from "../../src/lib/types";

function makeHand(overrides: Partial<Record<number, Partial<Landmark>>> = {}): Landmark[] {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: 0.4 + (index % 4) * 0.03,
    y: 0.7 - Math.floor(index / 4) * 0.05,
    z: 0
  }));

  for (const [index, patch] of Object.entries(overrides)) {
    Object.assign(landmarks[Number(index)], patch);
  }

  return landmarks;
}

describe("extractHandFeatures", () => {
  it("recognizes an open hand with extended fingers", () => {
    const hand = makeHand({
      0: { x: 0.5, y: 0.85 },
      3: { x: 0.38, y: 0.58 },
      4: { x: 0.3, y: 0.5 },
      5: { x: 0.42, y: 0.72 },
      6: { x: 0.42, y: 0.58 },
      8: { x: 0.42, y: 0.35 },
      9: { x: 0.5, y: 0.72 },
      10: { x: 0.5, y: 0.56 },
      12: { x: 0.5, y: 0.28 },
      13: { x: 0.58, y: 0.72 },
      14: { x: 0.58, y: 0.58 },
      16: { x: 0.58, y: 0.34 },
      17: { x: 0.66, y: 0.74 },
      18: { x: 0.66, y: 0.62 },
      20: { x: 0.66, y: 0.42 }
    });

    const features = extractHandFeatures(hand);

    expect(features.extendedCount).toBe(4);
    expect(features.fingerExtended.index).toBe(true);
    expect(features.fingerExtended.middle).toBe(true);
    expect(features.fingerExtended.ring).toBe(true);
    expect(features.fingerExtended.pinky).toBe(true);
    expect(features.fingerExtended.thumb).toBe(true);
    expect(features.openness).toBeGreaterThan(0.6);
    expect(features.fistness).toBeLessThan(0.5);
  });

  it("recognizes a tighter hand and pinch suppression on the thumb", () => {
    const hand = makeHand({
      0: { x: 0.5, y: 0.82 },
      3: { x: 0.43, y: 0.69 },
      4: { x: 0.44, y: 0.63 },
      5: { x: 0.45, y: 0.74 },
      6: { x: 0.46, y: 0.71 },
      8: { x: 0.45, y: 0.64 },
      9: { x: 0.51, y: 0.74 },
      10: { x: 0.52, y: 0.7 },
      12: { x: 0.51, y: 0.63 },
      13: { x: 0.57, y: 0.75 },
      14: { x: 0.58, y: 0.72 },
      16: { x: 0.57, y: 0.67 },
      17: { x: 0.63, y: 0.76 },
      18: { x: 0.64, y: 0.73 },
      20: { x: 0.63, y: 0.7 }
    });

    const features = extractHandFeatures(hand);

    expect(features.pinchIndex).toBeGreaterThan(0.55);
    expect(features.fingerExtended.thumb).toBe(false);
    expect(features.fistness).toBeGreaterThan(0.05);
    expect(features.averageCurl).toBeGreaterThan(0);
  });
});
