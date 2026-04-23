import {
  DEFAULT_PIANO_OCTAVES,
  MAX_PIANO_OCTAVES,
  MIN_PIANO_OCTAVES,
  NATURAL_OCTAVE,
  NATURAL_NOTE_TO_SEMITONE,
  NATURAL_OCTAVE_SEMITONES,
  NOTE_NAMES_FLATS,
  NOTE_NAMES_SHARPS,
  SHARP_CAPABLE_OFFSETS,
  SHARP_CAPABLE_NATURAL_INDEXES,
  VISIBLE_NATURAL_NOTE_NAMES
} from "./constants";
import type { ChordMode, NoteLabelStyle } from "./types";

const ROOT_MIDI = 60;
export const PIANO_BLACK_KEY_WIDTH_RATIO = 0.52;
export const PIANO_BLACK_KEY_HEIGHT_RATIO = 0.58;

const CHORD_INTERVALS: Record<ChordMode, number[]> = {
  single: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10]
};

export function getNoteNames(style: NoteLabelStyle): readonly string[] {
  return style === "flats" ? NOTE_NAMES_FLATS : NOTE_NAMES_SHARPS;
}

export function normalizePianoOctaves(octaveCount = DEFAULT_PIANO_OCTAVES): number {
  if (!Number.isFinite(octaveCount)) {
    return DEFAULT_PIANO_OCTAVES;
  }

  return Math.min(
    MAX_PIANO_OCTAVES,
    Math.max(MIN_PIANO_OCTAVES, Math.round(octaveCount))
  );
}

export function getNaturalKeyCount(octaveCount = DEFAULT_PIANO_OCTAVES): number {
  return normalizePianoOctaves(octaveCount) * NATURAL_OCTAVE.length + 1;
}

export function getVisibleKeyNames(octaveCount = DEFAULT_PIANO_OCTAVES): readonly string[] {
  const octaves = normalizePianoOctaves(octaveCount);
  if (octaves === DEFAULT_PIANO_OCTAVES) {
    return VISIBLE_NATURAL_NOTE_NAMES;
  }

  return [...Array.from({ length: octaves }, () => NATURAL_OCTAVE).flat(), "C"];
}

export function getVisibleBlackKeys(
  octaveCount = DEFAULT_PIANO_OCTAVES
): Array<{ label: string; sourceIndex: number }> {
  const octaves = normalizePianoOctaves(octaveCount);
  const sharpIndexes =
    octaves === DEFAULT_PIANO_OCTAVES
      ? SHARP_CAPABLE_NATURAL_INDEXES
      : Array.from({ length: octaves }, (_, octave) =>
          SHARP_CAPABLE_OFFSETS.map((offset) => offset + octave * NATURAL_OCTAVE.length)
        ).flat();

  return sharpIndexes.map((sourceIndex) => ({
    label:
      NOTE_NAMES_SHARPS[(naturalZoneToSemitone(sourceIndex, false, octaves) + 1) % 12] ?? "C#",
    sourceIndex
  }));
}

export function getVisibleBlackKeyLayouts(
  noteCount: number | undefined = undefined,
  octaveCount = DEFAULT_PIANO_OCTAVES
): Array<{ label: string; sourceIndex: number; centerX: number; widthRatio: number }> {
  const octaves = normalizePianoOctaves(octaveCount);
  const resolvedNoteCount = noteCount ?? getNaturalKeyCount(octaves);
  const whiteKeyWidth = 1 / resolvedNoteCount;
  return getVisibleBlackKeys(octaves).map((key) => ({
    ...key,
    centerX: (key.sourceIndex + 1) * whiteKeyWidth,
    widthRatio: whiteKeyWidth * PIANO_BLACK_KEY_WIDTH_RATIO
  }));
}

export function naturalZoneSupportsSharp(
  zone: number,
  octaveCount = DEFAULT_PIANO_OCTAVES
): boolean {
  if (!Number.isFinite(zone) || zone < 0) {
    return false;
  }

  const normalizedZone = Math.floor(zone);
  const octaves = normalizePianoOctaves(octaveCount);
  if (normalizedZone >= octaves * NATURAL_OCTAVE.length) {
    return false;
  }

  return SHARP_CAPABLE_OFFSETS.includes(
    (normalizedZone % NATURAL_OCTAVE.length) as (typeof SHARP_CAPABLE_OFFSETS)[number]
  );
}

export function naturalZoneToSemitone(
  zone: number,
  useSharp = false,
  octaveCount = DEFAULT_PIANO_OCTAVES
): number {
  if (!Number.isFinite(zone) || zone < 0) {
    return NATURAL_NOTE_TO_SEMITONE[0];
  }

  const normalizedZone = Math.min(Math.floor(zone), getNaturalKeyCount(octaveCount) - 1);
  const octave = Math.floor(normalizedZone / NATURAL_OCTAVE.length);
  const naturalOffset = normalizedZone % NATURAL_OCTAVE.length;
  const semitone = (NATURAL_OCTAVE_SEMITONES[naturalOffset] ?? 0) + octave * 12;

  return useSharp && naturalZoneSupportsSharp(normalizedZone, octaveCount) ? semitone + 1 : semitone;
}

export function describeRootSemitone(semitone: number, style: NoteLabelStyle): string {
  const noteNames = getNoteNames(style);
  return noteNames[((semitone % 12) + 12) % 12] ?? noteNames[0];
}

export function getRootMidi(rootIndex: number): number {
  return ROOT_MIDI + rootIndex;
}

export function buildVoicing(rootIndex: number, mode: ChordMode): number[] {
  const rootMidi = getRootMidi(rootIndex);
  return CHORD_INTERVALS[mode].map((interval) => rootMidi + interval);
}

export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = midi % 12;
  const names = NOTE_NAMES_SHARPS.slice(0, 12);
  return `${names[pitchClass]}${octave}`;
}

export function describeChord(rootIndex: number, mode: ChordMode, style: NoteLabelStyle): string {
  const rootName = describeRootSemitone(rootIndex, style);

  switch (mode) {
    case "major":
      return `${rootName} major`;
    case "minor":
      return `${rootName} minor`;
    case "dominant7":
      return `${rootName}7`;
    default:
      return rootName;
  }
}

export function modeLabel(mode: ChordMode): string {
  switch (mode) {
    case "major":
      return "Major";
    case "minor":
      return "Minor";
    case "dominant7":
      return "Dominant 7";
    default:
      return "Single Note";
  }
}
