import { NATURAL_OCTAVE, NATURAL_OCTAVE_SEMITONES } from "./constants";
import type { ChordMode, CircleNoteName, HandFeatures, Handedness, Landmark } from "./types";

export const CIRCLE_STAGE_ASPECT_RATIO = 16 / 10;
export const CIRCLE_RADIUS_Y = 0.28;
export const CIRCLE_INNER_DEAD_ZONE_RATIO = 0.18;
export const CIRCLE_NOTE_COUNT = 7;

export const CIRCLE_NOTE_ORDERS = {
  natural: NATURAL_OCTAVE,
  fifths: ["C", "G", "D", "A", "E", "B", "F"] as const
} as const;

type CircleNoteLabel = (typeof NATURAL_OCTAVE)[number];
const CIRCLE_OPEN_HAND_THRESHOLD = 0.68;

const CIRCLE_CENTERS: Record<Handedness, { x: number; y: number }> = {
  Left: { x: 0.28, y: 0.56 },
  Right: { x: 0.72, y: 0.56 }
};

const NATURAL_NOTE_TO_SEMITONE = new Map(
  NATURAL_OCTAVE.map((note, index) => [note, NATURAL_OCTAVE_SEMITONES[index]])
);

export interface CircleLayout {
  hand: Handedness;
  center: { x: number; y: number };
  radiusY: number;
  radiusX: number;
  innerRadiusY: number;
  aspectRatio: number;
}

export interface CircleSegmentLabel {
  segment: number;
  label: string;
  semitone: number;
  x: number;
  y: number;
}

export function getCircleLayout(hand: Handedness): CircleLayout {
  return {
    hand,
    center: CIRCLE_CENTERS[hand],
    radiusY: CIRCLE_RADIUS_Y,
    radiusX: CIRCLE_RADIUS_Y / CIRCLE_STAGE_ASPECT_RATIO,
    innerRadiusY: CIRCLE_RADIUS_Y * CIRCLE_INNER_DEAD_ZONE_RATIO,
    aspectRatio: CIRCLE_STAGE_ASPECT_RATIO
  };
}

export function getCircleNoteOrder(useFifths: boolean): readonly CircleNoteLabel[] {
  return useFifths ? CIRCLE_NOTE_ORDERS.fifths : CIRCLE_NOTE_ORDERS.natural;
}

export function getCircleRootLabel(segment: number, useFifths: boolean): CircleNoteName {
  const order = getCircleNoteOrder(useFifths);
  return order[((segment % CIRCLE_NOTE_COUNT) + CIRCLE_NOTE_COUNT) % CIRCLE_NOTE_COUNT];
}

export function getCircleSegmentLabels(
  hand: Handedness,
  useFifths: boolean
): CircleSegmentLabel[] {
  const layout = getCircleLayout(hand);
  const labelRadiusY = layout.radiusY * 0.72;
  const order = getCircleNoteOrder(useFifths);

  return order.map((label, segment) => {
    const angle = (segment * Math.PI * 2) / CIRCLE_NOTE_COUNT;
    return {
      segment,
      label,
      semitone: getCircleRootSemitone(segment, useFifths),
      x: layout.center.x + (Math.sin(angle) * labelRadiusY) / layout.aspectRatio,
      y: layout.center.y - Math.cos(angle) * labelRadiusY
    };
  });
}

export function resolveCircleSegment(point: Pick<Landmark, "x" | "y">, layout: CircleLayout): number | null {
  const dx = (point.x - layout.center.x) * layout.aspectRatio;
  const dy = point.y - layout.center.y;
  const distance = Math.hypot(dx, dy);

  if (distance < layout.innerRadiusY || distance > layout.radiusY) {
    return null;
  }

  const angle = Math.atan2(dx, -dy);
  const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;
  const segmentSize = (Math.PI * 2) / CIRCLE_NOTE_COUNT;

  return Math.floor(((normalizedAngle + segmentSize / 2) % (Math.PI * 2)) / segmentSize);
}

export function getCircleRootSemitone(segment: number, useFifths: boolean): number {
  const label = getCircleRootLabel(segment, useFifths);
  return NATURAL_NOTE_TO_SEMITONE.get(label) ?? 0;
}

export function shouldUseCircleChordVoicing(enabledFingerCount: number): boolean {
  return enabledFingerCount <= 1;
}

export function getCircleOctaveShiftForPose(features: HandFeatures, openHandShift: number): number {
  return features.openness >= CIRCLE_OPEN_HAND_THRESHOLD ? openHandShift : 0;
}

export function classifyCircleChordQuality(features: HandFeatures): ChordMode {
  const extended = features.fingerExtended;

  if (extended.index && extended.middle && extended.thumb && extended.ring) {
    return "minor7";
  }

  if (extended.index && extended.middle && extended.ring) {
    return "major7";
  }

  if (extended.index && extended.middle && extended.thumb) {
    return "minor";
  }

  if (extended.index && extended.middle) {
    return "major";
  }

  if (extended.pinky) {
    return "diminished";
  }

  if (extended.index) {
    return "single";
  }

  return "single";
}
