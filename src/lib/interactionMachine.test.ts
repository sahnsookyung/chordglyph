import {
  initialInteractionState,
  updateInteractionState,
  type InteractionFrame
} from "./interactionMachine";
import type { GestureClassification } from "./types";

const stableMajor: GestureClassification = {
  mode: "major",
  confidence: 0.94,
  ambiguous: false,
  scores: {
    single: 0.08,
    major: 0.94,
    minor: 0.11,
    dominant7: 0.16
  },
  margin: 0.78,
  reason: "major-detected"
};

const ambiguousGesture: GestureClassification = {
  mode: "single",
  confidence: 0.5,
  ambiguous: true,
  scores: {
    single: 0.5,
    major: 0.46,
    minor: 0.45,
    dominant7: 0.18
  },
  margin: 0.04,
  reason: "held-previous-mode"
};

function frame(overrides: Partial<InteractionFrame>): InteractionFrame {
  return {
    timestamp: 0,
    noteX: 0.25,
    noteConfidence: 0.9,
    chordConfidence: 0.9,
    notePinch: false,
    chordGesture: stableMajor,
    ...overrides
  };
}

describe("updateInteractionState", () => {
  it("triggers playback after the dwell threshold", () => {
    const first = updateInteractionState(initialInteractionState, frame({ timestamp: 0 }));
    const second = updateInteractionState(first.state, frame({ timestamp: 90 }));

    expect(second.events).toHaveLength(1);
    expect(second.events[0]).toMatchObject({
      kind: "play",
      rootIndex: 7
    });
  });

  it("falls back to single note after prolonged ambiguity", () => {
    const promoted = updateInteractionState(initialInteractionState, frame({ timestamp: 0 }));
    const stable = updateInteractionState(promoted.state, frame({ timestamp: 90 }));
    const ambiguousStart = updateInteractionState(
      stable.state,
      frame({ timestamp: 120, chordGesture: ambiguousGesture })
    );
    const timedOut = updateInteractionState(
      ambiguousStart.state,
      frame({ timestamp: 500, chordGesture: ambiguousGesture })
    );

    expect(stable.state.stableMode).toBe("major");
    expect(timedOut.state.stableMode).toBe("single");
  });
});
