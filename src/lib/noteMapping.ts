import { NOTE_COUNT, TRACKING_THRESHOLDS } from "./constants";
import { clamp } from "./geometry";
import type { NoteStripSize } from "./types";

export interface NoteZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface StripBounds {
  left: number;
  right: number;
  widthRatio: number;
}

const MIN_STRIP_WIDTH_RATIO = 0.64;
const MAX_STRIP_WIDTH_RATIO = 0.99;

export function resolveNoteZone(
  normalizedX: number,
  previousZone: number | null,
  noteCount = NOTE_COUNT,
  hysteresisRatio = TRACKING_THRESHOLDS.hysteresisRatio
): number {
  const x = clamp(normalizedX);
  const zoneWidth = 1 / noteCount;

  if (previousZone === null) {
    return Math.min(noteCount - 1, Math.floor(x * noteCount));
  }

  const zoneStart = previousZone * zoneWidth;
  const zoneEnd = zoneStart + zoneWidth;
  const lowerBound = previousZone === 0 ? zoneStart : zoneStart - zoneWidth * hysteresisRatio;
  const upperBound =
    previousZone === noteCount - 1 ? zoneEnd : zoneEnd + zoneWidth * hysteresisRatio;

  if (x >= lowerBound && x < upperBound) {
    return previousZone;
  }

  return Math.min(noteCount - 1, Math.floor(x * noteCount));
}

export function getStripWidthRatio(size: NoteStripSize): number {
  switch (size) {
    case "compact":
      return 0.78;
    case "large":
      return 0.92;
    default:
      return 0.86;
  }
}

export function getStripScale(size: NoteStripSize): number {
  switch (size) {
    case "compact":
      return 0.9;
    case "large":
      return 1.12;
    default:
      return 1;
  }
}

export function getStripBounds(size: NoteStripSize, widthScale = 1): StripBounds {
  const widthRatio = clamp(
    getStripWidthRatio(size) * widthScale,
    MIN_STRIP_WIDTH_RATIO,
    MAX_STRIP_WIDTH_RATIO
  );
  const left = (1 - widthRatio) / 2;

  return {
    left,
    right: left + widthRatio,
    widthRatio
  };
}

export function projectToNoteStripX(
  rawX: number | null,
  size: NoteStripSize,
  outsideGrace = 0.035,
  widthScale = 1
): number | null {
  if (rawX === null) {
    return null;
  }

  const { left, right, widthRatio } = getStripBounds(size, widthScale);

  if (rawX < left - outsideGrace || rawX > right + outsideGrace) {
    return null;
  }

  return clamp((rawX - left) / widthRatio);
}

export function buildArcLayout(
  viewportWidth: number,
  viewportHeight: number,
  size: NoteStripSize,
  confidence = 1,
  noteCount = NOTE_COUNT,
  widthScale = 1
): NoteZoneLayout[] {
  const scale = getStripScale(size);
  const width = viewportWidth * getStripBounds(size, widthScale).widthRatio;
  const height = viewportHeight * 0.135 * scale;
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight * 0.72;
  const left = centerX - width / 2;
  const slotWidth = width / noteCount;
  const lowConfidenceBoost = 1 + (1 - confidence) * 0.06;
  const zoneWidth = Math.min(slotWidth * 0.88, slotWidth * 0.78 * lowConfidenceBoost);
  const arcLift = viewportHeight * 0.055 * scale;

  return Array.from({ length: noteCount }, (_, index) => {
    const t = index / Math.max(noteCount - 1, 1);
    const curve = (t - 0.5) * 2;
    const arcProfile = 1 - curve * curve;
    const zoneCenterX = left + slotWidth * (index + 0.5);
    const angle = curve * 10;
    return {
      x: zoneCenterX - zoneWidth / 2,
      y: centerY - arcProfile * arcLift,
      width: zoneWidth,
      height,
      rotation: angle
    };
  });
}
