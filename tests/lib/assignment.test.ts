import { assignHands, averageHandX } from "../../src/lib/assignment";
import type { TrackedHand } from "../../src/lib/types";

function makeHand(id: string, handedness: "Left" | "Right", centerX: number): TrackedHand {
  return {
    id,
    handedness,
    confidence: 0.92,
    landmarks: Array.from({ length: 21 }, () => ({
      x: centerX,
      y: 0.5,
      z: 0
    }))
  };
}

describe("assignHands", () => {
  it("returns empty assignments when no hands are visible", () => {
    expect(assignHands([], "Right")).toEqual({ noteHand: null, chordHand: null });
  });

  it("averages landmark x positions safely", () => {
    expect(averageHandX(makeHand("avg", "Left", 0.25))).toBe(0.25);
    expect(
      averageHandX({
        id: "empty",
        handedness: "Left",
        confidence: 1,
        landmarks: []
      })
    ).toBe(0);
  });

  it("prefers screen-side position when handedness is noisy", () => {
    const rightSideHand = makeHand("left-labeled", "Left", 0.78);
    const leftSideHand = makeHand("right-labeled", "Right", 0.22);

    const assigned = assignHands([rightSideHand, leftSideHand], "Right");

    expect(assigned.noteHand?.id).toBe("left-labeled");
    expect(assigned.chordHand?.id).toBe("right-labeled");
  });

  it("assigns a single visible hand to the closer expected role", () => {
    const rightSideHand = makeHand("solo", "Left", 0.81);
    const assigned = assignHands([rightSideHand], "Right");

    expect(assigned.noteHand?.id).toBe("solo");
    expect(assigned.chordHand).toBeNull();
  });

  it("uses previous sticky role when a single centered hand stays near the middle", () => {
    const centeredHand = makeHand("solo-note", "Right", 0.5);
    expect(
      assignHands([centeredHand], "Right", { noteHand: centeredHand, chordHand: null })
    ).toEqual({ noteHand: centeredHand, chordHand: null });

    const centeredChord = makeHand("solo-chord", "Left", 0.49);
    expect(
      assignHands([centeredChord], "Right", { noteHand: null, chordHand: centeredChord })
    ).toEqual({ noteHand: null, chordHand: centeredChord });
  });

  it("maps a single centered hand by dominant side when there is no sticky history", () => {
    const centeredHand = makeHand("solo-left", "Left", 0.45);
    expect(assignHands([centeredHand], "Left")).toEqual({
      noteHand: centeredHand,
      chordHand: null
    });
    expect(assignHands([centeredHand], "Right")).toEqual({
      noteHand: null,
      chordHand: centeredHand
    });
  });

  it("swaps note and chord assignments for left-handed mode", () => {
    const leftSideHand = makeHand("leftmost", "Left", 0.2);
    const rightSideHand = makeHand("rightmost", "Right", 0.8);

    const assigned = assignHands([leftSideHand, rightSideHand], "Left");

    expect(assigned.noteHand?.id).toBe("leftmost");
    expect(assigned.chordHand?.id).toBe("rightmost");
  });
});
