import {
  initialInteractionState,
  updateInteractionState,
  type InteractionFrame
} from "../../src/lib/interactionMachine";
import type { GestureClassification } from "../../src/lib/types";

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

  it("requires a pinch edge in pinch trigger mode", () => {
    const options = {
      triggerMode: "pinch" as const,
      dwellMs: 40,
      cooldownMs: 0,
      noteLossMs: 200,
      chordLossMs: 200,
      chordPersistenceMs: 100,
      ambiguityTimeoutMs: 100
    };
    const first = updateInteractionState(initialInteractionState, frame({ timestamp: 0 }), options);
    const hoverOnly = updateInteractionState(
      first.state,
      frame({ timestamp: 50, notePinch: false }),
      options
    );
    const pinched = updateInteractionState(
      hoverOnly.state,
      frame({ timestamp: 60, notePinch: true }),
      options
    );

    expect(hoverOnly.events).toHaveLength(0);
    expect(pinched.events[0]).toMatchObject({ kind: "play" });
  });

  it("stops sounding after the note hand is missing long enough", () => {
    const primed = {
      ...initialInteractionState,
      isSounding: true,
      stableMode: "minor",
      lastNoteVisibleAt: 0,
      currentZone: 4,
      currentRoot: 4,
      currentRootSince: 0
    };
    const missing = updateInteractionState(
      primed,
      frame({ timestamp: 400, noteX: null, noteConfidence: 0.1, chordGesture: null, chordConfidence: 0.1 })
    );

    expect(missing.events[0]).toMatchObject({ kind: "stop", rootIndex: null, mode: "minor" });
    expect(missing.state.systemState).toBe("DEGRADED_TRACKING");
    expect(missing.state.currentRoot).toBeNull();
  });

  it("holds the previous mode briefly when the chord hand disappears", () => {
    const holdingMajor = {
      ...initialInteractionState,
      stableMode: "major",
      lastChordVisibleAt: 100
    };
    const update = updateInteractionState(
      holdingMajor,
      frame({ timestamp: 180, chordGesture: null, chordConfidence: 0.1 })
    );

    expect(update.state.stableMode).toBe("major");
    expect(update.state.warnings).toContain("Chord hand lost - holding previous mode");
  });
});
