import { averageHandX } from "./assignment";
import { clamp } from "./geometry";
import type { Handedness, TrackedHand } from "./types";

export interface StableHandSlot {
  avgX: number | null;
}

export type StableHandSlots = Record<Handedness, StableHandSlot>;

export interface StableTrackedHand {
  hand: TrackedHand;
  stableHandedness: Handedness;
}

const RAW_HANDEDNESS_BONUS = 0.35;
const SCREEN_SIDE_BIAS_WEIGHT = 1.25;
const SLOT_CONTINUITY_WEIGHT = 1.5;

export function emptyStableHandSlots(): StableHandSlots {
  return {
    Left: { avgX: null },
    Right: { avgX: null }
  };
}

function scoreHandForSide(
  hand: TrackedHand,
  side: Handedness,
  previousSlot: StableHandSlot
): number {
  const avgX = averageHandX(hand);
  const rawHandednessBonus = hand.handedness === side ? RAW_HANDEDNESS_BONUS : 0;
  // In the mirrored preview, the player's physical right hand still appears
  // on the right side of the screen from their perspective. Screen side should
  // beat raw model labels when the two disagree.
  const sideBias =
    side === "Left"
      ? clamp((0.5 - avgX) / 0.5, -1, 1)
      : clamp((avgX - 0.5) / 0.5, -1, 1);
  const continuityBonus =
    previousSlot.avgX === null
      ? 0
      : 1 - clamp(Math.abs(avgX - previousSlot.avgX) / 0.35, 0, 1);

  return (
    rawHandednessBonus +
    sideBias * SCREEN_SIDE_BIAS_WEIGHT +
    continuityBonus * SLOT_CONTINUITY_WEIGHT
  );
}

export function resolveStableHandedness(
  hands: TrackedHand[],
  previousSlots: StableHandSlots
): { resolvedHands: StableTrackedHand[]; nextSlots: StableHandSlots } {
  if (hands.length === 0) {
    return {
      resolvedHands: [],
      nextSlots: emptyStableHandSlots()
    };
  }

  if (hands.length === 1) {
    const hand = hands[0];
    const leftScore = scoreHandForSide(hand, "Left", previousSlots.Left);
    const rightScore = scoreHandForSide(hand, "Right", previousSlots.Right);
    const stableHandedness = leftScore >= rightScore ? "Left" : "Right";

    return {
      resolvedHands: [{ hand, stableHandedness }],
      nextSlots: {
        Left: { avgX: stableHandedness === "Left" ? averageHandX(hand) : null },
        Right: { avgX: stableHandedness === "Right" ? averageHandX(hand) : null }
      }
    };
  }

  const limitedHands = hands.slice(0, 2);
  const [firstHand, secondHand] = limitedHands;
  const keepAssignmentScore =
    scoreHandForSide(firstHand, "Left", previousSlots.Left) +
    scoreHandForSide(secondHand, "Right", previousSlots.Right);
  const swapAssignmentScore =
    scoreHandForSide(firstHand, "Right", previousSlots.Right) +
    scoreHandForSide(secondHand, "Left", previousSlots.Left);

  const resolvedHands =
    keepAssignmentScore >= swapAssignmentScore
      ? [
          { hand: firstHand, stableHandedness: "Left" as const },
          { hand: secondHand, stableHandedness: "Right" as const }
        ]
      : [
          { hand: firstHand, stableHandedness: "Right" as const },
          { hand: secondHand, stableHandedness: "Left" as const }
        ];

  const leftHand = resolvedHands.find((entry) => entry.stableHandedness === "Left")?.hand ?? null;
  const rightHand =
    resolvedHands.find((entry) => entry.stableHandedness === "Right")?.hand ?? null;

  return {
    resolvedHands,
    nextSlots: {
      Left: { avgX: leftHand ? averageHandX(leftHand) : null },
      Right: { avgX: rightHand ? averageHandX(rightHand) : null }
    }
  };
}
