import {
  emptyStableHandSlots,
  resolveStableHandedness,
  type StableHandSlots
} from "./stableHandedness";
import type { TrackedHand } from "./types";

function makeHand(id: string, handedness: "Left" | "Right", avgX: number): TrackedHand {
  return {
    id,
    handedness,
    confidence: 0.9,
    landmarks: Array.from({ length: 21 }, () => ({
      x: avgX,
      y: 0.5,
      z: -0.02
    }))
  };
}

describe("resolveStableHandedness", () => {
  it("keeps a previous left-hand slot stable across a mislabeled frame", () => {
    const previousSlots: StableHandSlots = {
      Left: { avgX: 0.18 },
      Right: { avgX: 0.82 }
    };

    const result = resolveStableHandedness([makeHand("flipped", "Right", 0.2)], previousSlots);

    expect(result.resolvedHands[0]?.stableHandedness).toBe("Left");
  });

  it("assigns two visible hands to their observed screen sides", () => {
    const result = resolveStableHandedness(
      [makeHand("a", "Right", 0.22), makeHand("b", "Left", 0.76)],
      {
        Left: { avgX: 0.2 },
        Right: { avgX: 0.8 }
      }
    );

    expect(result.resolvedHands.find((entry) => entry.hand.id === "a")?.stableHandedness).toBe("Left");
    expect(result.resolvedHands.find((entry) => entry.hand.id === "b")?.stableHandedness).toBe("Right");
  });

  it("treats the right side of the mirrored preview as the right hand", () => {
    const result = resolveStableHandedness([makeHand("right-side", "Right", 0.82)], emptyStableHandSlots());

    expect(result.resolvedHands[0]?.stableHandedness).toBe("Right");
  });

  it("lets mirrored screen side beat a conflicting raw model label", () => {
    const rightSideResult = resolveStableHandedness(
      [makeHand("right-side", "Left", 0.82)],
      emptyStableHandSlots()
    );
    const leftSideResult = resolveStableHandedness(
      [makeHand("left-side", "Right", 0.18)],
      emptyStableHandSlots()
    );

    expect(rightSideResult.resolvedHands[0]?.stableHandedness).toBe("Right");
    expect(leftSideResult.resolvedHands[0]?.stableHandedness).toBe("Left");
  });
});
