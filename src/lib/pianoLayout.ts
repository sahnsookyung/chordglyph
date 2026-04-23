import { NOTE_COUNT } from "./constants";
import { clamp } from "./geometry";
import { resolveNoteZone } from "./noteMapping";
import {
  getVisibleBlackKeys,
  PIANO_BLACK_KEY_HEIGHT_RATIO,
  PIANO_BLACK_KEY_WIDTH_RATIO,
  naturalZoneSupportsSharp
} from "./music";

export const PLAYABLE_FINGERTIP_INDEXES = [4, 8, 12, 16, 20] as const;
export const BASE_PIANO_BOTTOM_OFFSET = 0.12;
export const BASE_PIANO_HEIGHT_RATIO = 0.28;
export const MAX_PIANO_HEIGHT_SCALE = 3;
export const MAX_PIANO_HEIGHT_RATIO = BASE_PIANO_HEIGHT_RATIO * MAX_PIANO_HEIGHT_SCALE;
export const PIANO_BLACK_KEY_TOP_INSET_RATIO = 0.02;
export const PIANO_HITBOX_HORIZONTAL_GAP_RATIO = 0.08;
export const PIANO_HITBOX_VERTICAL_GAP_RATIO = 0.012;

export interface PianoBlackKeyLayout {
  label: string;
  sourceIndex: number;
  centerX: number;
  widthRatio: number;
  leftX: number;
  rightX: number;
}

export interface PianoLayout {
  bottomOffset: number;
  heightRatio: number;
  topY: number;
  bottomY: number;
  blackKeyTopY: number;
  blackKeyBottomY: number;
  blackKeys: PianoBlackKeyLayout[];
  whiteHitSegments: PianoWhiteHitSegment[];
}

export interface PianoTouchState {
  activeNaturalZones: number[];
  activeSharpZones: number[];
}

export interface PianoWhiteHitSegment {
  keyIndex: number;
  segment: "upper" | "lower";
  leftX: number;
  rightX: number;
  topY: number;
  bottomY: number;
}

function getHitGapX(whiteKeyWidth: number): number {
  return whiteKeyWidth * PIANO_HITBOX_HORIZONTAL_GAP_RATIO;
}

function getHitGapY(heightRatio: number): number {
  return heightRatio * PIANO_HITBOX_VERTICAL_GAP_RATIO;
}

export function getPianoLayout(
  noteCount = NOTE_COUNT,
  pianoVerticalOffset = 0,
  pianoHeightScale = 1
): PianoLayout {
  const heightRatio = clamp(
    BASE_PIANO_HEIGHT_RATIO * pianoHeightScale,
    0.18,
    MAX_PIANO_HEIGHT_RATIO
  );
  const verticalBounds = getPianoVerticalOffsetBounds(pianoHeightScale);
  const bottomOffset = clamp(
    BASE_PIANO_BOTTOM_OFFSET + pianoVerticalOffset,
    BASE_PIANO_BOTTOM_OFFSET + verticalBounds.min,
    BASE_PIANO_BOTTOM_OFFSET + verticalBounds.max
  );
  const whiteKeyWidth = 1 / noteCount;
  const hitGapX = getHitGapX(whiteKeyWidth);
  const blackKeys = getVisibleBlackKeys().map((key) => ({
    ...key,
    centerX: (key.sourceIndex + 1) * whiteKeyWidth,
    widthRatio: Math.max(whiteKeyWidth * PIANO_BLACK_KEY_WIDTH_RATIO - hitGapX * 2, whiteKeyWidth * 0.18),
    leftX:
      (key.sourceIndex + 1) * whiteKeyWidth -
      (whiteKeyWidth * PIANO_BLACK_KEY_WIDTH_RATIO) / 2 +
      hitGapX,
    rightX:
      (key.sourceIndex + 1) * whiteKeyWidth +
      (whiteKeyWidth * PIANO_BLACK_KEY_WIDTH_RATIO) / 2 -
      hitGapX
  }));
  const topY = 1 - bottomOffset - heightRatio;
  const bottomY = 1 - bottomOffset;
  const hitGapY = getHitGapY(heightRatio);
  const blackKeyTopY = topY + heightRatio * PIANO_BLACK_KEY_TOP_INSET_RATIO + hitGapY;
  const blackKeyBottomY =
    topY + heightRatio * PIANO_BLACK_KEY_HEIGHT_RATIO - hitGapY;
  const layoutBase = {
    bottomOffset,
    heightRatio,
    topY,
    bottomY,
    blackKeyTopY,
    blackKeyBottomY,
    blackKeys
  };
  const whiteHitSegments = buildWhiteHitSegments(layoutBase, noteCount);

  return {
    ...layoutBase,
    whiteHitSegments
  };
}

export function getPianoVerticalOffsetBounds(pianoHeightScale = 1): { min: number; max: number } {
  const heightRatio = clamp(
    BASE_PIANO_HEIGHT_RATIO * pianoHeightScale,
    0.18,
    MAX_PIANO_HEIGHT_RATIO
  );

  return {
    min: -BASE_PIANO_BOTTOM_OFFSET,
    max: 1 - heightRatio - BASE_PIANO_BOTTOM_OFFSET
  };
}

export function resolveBlackKeyHit(
  normalizedX: number,
  normalizedY: number,
  layout: PianoLayout
): number | null {
  if (normalizedY < layout.blackKeyTopY || normalizedY > layout.blackKeyBottomY) {
    return null;
  }

  const blackKey = layout.blackKeys.find((candidate) => {
    return normalizedX >= candidate.leftX && normalizedX <= candidate.rightX;
  });

  return blackKey?.sourceIndex ?? null;
}

export function isBlockedByBlackKey(
  normalizedX: number,
  normalizedY: number,
  layout: PianoLayout
): boolean {
  if (normalizedY < layout.blackKeyTopY || normalizedY > layout.blackKeyBottomY) {
    return false;
  }

  return layout.blackKeys.some(
    (candidate) => normalizedX >= candidate.leftX && normalizedX <= candidate.rightX
  );
}

function buildWhiteHitSegments(
  layout: Pick<PianoLayout, "blackKeyBottomY" | "blackKeys" | "bottomY" | "topY">,
  noteCount = NOTE_COUNT
): PianoWhiteHitSegment[] {
  const whiteKeyWidth = 1 / noteCount;
  const hitGapX = getHitGapX(whiteKeyWidth);
  const hitGapY = getHitGapY(layout.bottomY - layout.topY);

  return Array.from({ length: noteCount }, (_, keyIndex) => {
    const keyLeftX = keyIndex * whiteKeyWidth;
    const keyRightX = keyLeftX + whiteKeyWidth;
    const leftBlackKey = layout.blackKeys.find((candidate) => candidate.sourceIndex === keyIndex - 1);
    const rightBlackKey = layout.blackKeys.find((candidate) => candidate.sourceIndex === keyIndex);
    const upperLeftX = leftBlackKey ? leftBlackKey.rightX + hitGapX : keyLeftX;
    const upperRightX = rightBlackKey ? rightBlackKey.leftX - hitGapX : keyRightX;
    const segments: PianoWhiteHitSegment[] = [
      {
        keyIndex,
        segment: "lower",
        leftX: keyLeftX,
        rightX: keyRightX,
        topY: layout.blackKeyBottomY + hitGapY,
        bottomY: layout.bottomY
      }
    ];

    if (upperRightX > upperLeftX) {
      segments.push({
        keyIndex,
        segment: "upper",
        leftX: upperLeftX,
        rightX: upperRightX,
        topY: layout.topY,
        bottomY: layout.blackKeyBottomY
      });
    }

    return segments;
  }).flat();
}

export function getWhiteHitSegments(
  layout: PianoLayout,
  _noteCount = NOTE_COUNT
): PianoWhiteHitSegment[] {
  return layout.whiteHitSegments;
}

export function resolveWhiteKeyHit(
  normalizedX: number,
  normalizedY: number,
  layout: PianoLayout,
  previousZone: number | null,
  noteCount = NOTE_COUNT
): number | null {
  if (normalizedY < layout.topY || normalizedY > layout.bottomY) {
    return null;
  }

  if (normalizedY > layout.blackKeyBottomY + getHitGapY(layout.bottomY - layout.topY)) {
    return resolveNoteZone(normalizedX, previousZone);
  }

  if (normalizedY > layout.blackKeyBottomY) {
    return null;
  }

  const upperSegment = getWhiteHitSegments(layout, noteCount).find((segment) => {
    return (
      segment.segment === "upper" &&
      normalizedX >= segment.leftX &&
      normalizedX <= segment.rightX
    );
  });

  return upperSegment?.keyIndex ?? null;
}

export function resolveActiveTouchState(
  groupedWhiteTouches: Map<number, number>,
  directBlackTouches: Set<number>
): PianoTouchState {
  const fallbackSharpZones = [...groupedWhiteTouches.keys()].filter(
    (zone) => (groupedWhiteTouches.get(zone) ?? 0) >= 2 && naturalZoneSupportsSharp(zone)
  );
  const activeSharpZones = [...new Set([...directBlackTouches, ...fallbackSharpZones])].sort(
    (left, right) => left - right
  );
  const activeNaturalZones = [...groupedWhiteTouches.keys()]
    .filter((zone) => !activeSharpZones.includes(zone))
    .sort((left, right) => left - right);

  return {
    activeNaturalZones,
    activeSharpZones
  };
}
