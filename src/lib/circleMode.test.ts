import {
  classifyCircleChordQuality,
  getCircleLayout,
  getCircleNoteOrder,
  getCircleSegmentLabels,
  getCircleRootSemitone,
  resolveCircleSegment
} from "./circleMode";
import type { HandFeatures } from "./types";

function makeFeatures(
  fingerExtended: Partial<HandFeatures["fingerExtended"]>
): HandFeatures {
  return {
    palmCenter: { x: 0.5, y: 0.5, z: 0 },
    handScale: 0.2,
    pinchIndex: 0.1,
    pinchMiddle: 0.1,
    averageCurl: 0.2,
    fingerExtended: {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
      ...fingerExtended
    },
    fingerCurl: {
      index: 0.2,
      middle: 0.2,
      ring: 0.2,
      pinky: 0.2
    },
    tipToPalm: {
      index: 1,
      middle: 1,
      ring: 1,
      pinky: 1
    },
    extendedCount: 0,
    fistness: 0.2,
    openness: 0.8
  };
}

describe("circle mode helpers", () => {
  it("hit-tests with an inner dead zone and 12 o'clock C", () => {
    const layout = getCircleLayout("Left");

    expect(resolveCircleSegment(layout.center, layout)).toBeNull();
    expect(
      resolveCircleSegment(
        { x: layout.center.x, y: layout.center.y - layout.radiusY - 0.02 },
        layout
      )
    ).toBeNull();
    expect(
      resolveCircleSegment(
        { x: layout.center.x, y: layout.center.y - layout.radiusY * 0.72 },
        layout
      )
    ).toBe(0);
    expect(
      resolveCircleSegment(
        { x: layout.center.x + (layout.radiusY * 0.72) / layout.aspectRatio, y: layout.center.y },
        layout
      )
    ).toBe(2);
  });

  it("maps natural and fifths order independently", () => {
    expect(getCircleNoteOrder(false)).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(getCircleNoteOrder(true)).toEqual(["C", "G", "D", "A", "E", "B", "F"]);
    expect(getCircleRootSemitone(1, false)).toBe(2);
    expect(getCircleRootSemitone(1, true)).toBe(7);
    expect(getCircleSegmentLabels("Right", true).map((segment) => segment.label)).toEqual([
      "C",
      "G",
      "D",
      "A",
      "E",
      "B",
      "F"
    ]);
  });

  it("resolves chord quality by priority from extended-finger combos", () => {
    expect(classifyCircleChordQuality(makeFeatures({}))).toBe("single");
    expect(classifyCircleChordQuality(makeFeatures({ index: true }))).toBe("single");
    expect(classifyCircleChordQuality(makeFeatures({ index: true, middle: true }))).toBe("major");
    expect(
      classifyCircleChordQuality(makeFeatures({ thumb: true, index: true, middle: true }))
    ).toBe("minor");
    expect(
      classifyCircleChordQuality(makeFeatures({ index: true, middle: true, ring: true }))
    ).toBe("major7");
    expect(
      classifyCircleChordQuality(
        makeFeatures({ thumb: true, index: true, middle: true, ring: true, pinky: true })
      )
    ).toBe("minor7");
    expect(classifyCircleChordQuality(makeFeatures({ pinky: true }))).toBe("diminished");
  });
});
