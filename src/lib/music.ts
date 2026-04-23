import {
  NATURAL_NOTE_TO_SEMITONE,
  NOTE_NAMES_FLATS,
  NOTE_NAMES_SHARPS,
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

export function getVisibleKeyNames(): readonly string[] {
  return VISIBLE_NATURAL_NOTE_NAMES;
}

export function getVisibleBlackKeys(): Array<{ label: string; sourceIndex: number }> {
  return SHARP_CAPABLE_NATURAL_INDEXES.map((sourceIndex) => ({
    label:
      NOTE_NAMES_SHARPS[((NATURAL_NOTE_TO_SEMITONE[sourceIndex] ?? 0) + 1) % 12] ?? "C#",
    sourceIndex
  }));
}

export function getVisibleBlackKeyLayouts(
  noteCount = VISIBLE_NATURAL_NOTE_NAMES.length
): Array<{ label: string; sourceIndex: number; centerX: number; widthRatio: number }> {
  const whiteKeyWidth = 1 / noteCount;
  return getVisibleBlackKeys().map((key) => ({
    ...key,
    centerX: (key.sourceIndex + 1) * whiteKeyWidth,
    widthRatio: whiteKeyWidth * PIANO_BLACK_KEY_WIDTH_RATIO
  }));
}

export function naturalZoneSupportsSharp(zone: number): boolean {
  return SHARP_CAPABLE_NATURAL_INDEXES.includes(zone as (typeof SHARP_CAPABLE_NATURAL_INDEXES)[number]);
}

export function naturalZoneToSemitone(zone: number, useSharp = false): number {
  const semitone = NATURAL_NOTE_TO_SEMITONE[zone] ?? NATURAL_NOTE_TO_SEMITONE[0];
  return useSharp && naturalZoneSupportsSharp(zone) ? semitone + 1 : semitone;
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
