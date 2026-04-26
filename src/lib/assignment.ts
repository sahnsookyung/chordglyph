import type { Handedness, TrackedHand } from "./types";

export interface AssignedHands {
  noteHand: TrackedHand | null;
  chordHand: TrackedHand | null;
}

const EMPTY_ASSIGNED_HANDS: AssignedHands = { noteHand: null, chordHand: null };

export function averageHandX(hand: TrackedHand): number {
  const total = hand.landmarks.reduce((sum, landmark) => sum + landmark.x, 0);
  return total / Math.max(hand.landmarks.length, 1);
}

export function assignHands(
  hands: TrackedHand[],
  dominantHand: Handedness,
  previous?: AssignedHands
): AssignedHands {
  const resolvedPrevious = previous ?? EMPTY_ASSIGNED_HANDS;
  if (hands.length === 0) {
    return EMPTY_ASSIGNED_HANDS;
  }

  if (hands.length === 1) {
    const onlyHand = hands[0];
    const handX = averageHandX(onlyHand);

    if (Math.abs(handX - 0.5) < 0.12) {
      if (resolvedPrevious.noteHand?.id === onlyHand.id) {
        return { noteHand: onlyHand, chordHand: null };
      }
      if (resolvedPrevious.chordHand?.id === onlyHand.id) {
        return { noteHand: null, chordHand: onlyHand };
      }
    }

    const isNoteSide =
      dominantHand === "Right" ? handX >= 0.5 : handX <= 0.5;
    return isNoteSide
      ? { noteHand: onlyHand, chordHand: null }
      : { noteHand: null, chordHand: onlyHand };
  }

  const sortedByX = [...hands].sort((left, right) => averageHandX(left) - averageHandX(right));
  const leftmost = sortedByX[0] ?? null;
  const rightmost = sortedByX.at(-1) ?? null;

  return dominantHand === "Right"
    ? { noteHand: rightmost, chordHand: leftmost }
    : { noteHand: leftmost, chordHand: rightmost };
}
