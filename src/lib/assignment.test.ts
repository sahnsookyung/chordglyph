import { assignHands } from "./assignment";
import type { TrackedHand } from "./types";

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
});
