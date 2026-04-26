import {
  buildVoicing,
  buildVoicingFromMidiRoot,
  describeMidiChord,
  describeMidiNote,
  describeChord,
  describeRootSemitone,
  getNoteNames,
  getMidiForSemitoneOctave,
  getNaturalKeyCount,
  getVisibleBlackKeyLayouts,
  getVisibleBlackKeys,
  getVisibleKeyNames,
  midiToNoteName,
  modeLabel,
  naturalZoneSupportsSharp,
  naturalZoneToSemitone,
  normalizePianoOctaves
} from "../../src/lib/music";

describe("music helpers", () => {
  it("builds major voicings from the root", () => {
    expect(buildVoicing(0, "major")).toEqual([60, 64, 67]);
    expect(buildVoicing(9, "minor")).toEqual([69, 72, 76]);
    expect(buildVoicing(2, "diminished")).toEqual([62, 65, 68]);
    expect(buildVoicing(11, "dominant7")).toEqual([71, 75, 78, 81]);
    expect(buildVoicing(5, "major7")).toEqual([65, 69, 72, 76]);
    expect(buildVoicing(7, "minor7")).toEqual([67, 70, 74, 77]);
    expect(buildVoicingFromMidiRoot(48, "major")).toEqual([48, 52, 55]);
  });

  it("formats chord labels with sharps or flats", () => {
    expect(describeChord(1, "major", "sharps")).toBe("C# major");
    expect(describeChord(1, "dominant7", "flats")).toBe("Db7");
    expect(describeChord(2, "diminished", "sharps")).toBe("D dim");
    expect(describeChord(4, "major7", "sharps")).toBe("Emaj7");
    expect(describeChord(3, "minor7", "flats")).toBe("Ebm7");
    expect(describeMidiNote(48, "sharps")).toBe("C3");
    expect(describeMidiChord(49, "single", "flats")).toBe("Db3");
    expect(describeMidiChord(70, "dominant7", "sharps")).toBe("A#47");
  });

  it("maps semitones into explicit octaves", () => {
    expect(getMidiForSemitoneOctave(0, 3)).toBe(48);
    expect(getMidiForSemitoneOctave(7, 4)).toBe(67);
    expect(getMidiForSemitoneOctave(14, 3)).toBe(62);
    expect(getMidiForSemitoneOctave(-1, 4)).toBe(59);
  });

  it("maps natural keys and two-finger sharps to semitone roots", () => {
    expect(getVisibleKeyNames()).toEqual([
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C"
    ]);
    expect(getVisibleBlackKeys().map((key) => key.label)).toEqual([
      "C#",
      "D#",
      "F#",
      "G#",
      "A#",
      "C#",
      "D#",
      "F#",
      "G#",
      "A#",
      "C#",
      "D#",
      "F#",
      "G#",
      "A#",
      "C#",
      "D#",
      "F#",
      "G#",
      "A#"
    ]);
    expect(naturalZoneToSemitone(0, false)).toBe(0);
    expect(naturalZoneToSemitone(0, true)).toBe(1);
    expect(naturalZoneToSemitone(2, true)).toBe(4);
    expect(naturalZoneToSemitone(5, true)).toBe(10);
    expect(naturalZoneToSemitone(28, false)).toBe(48);
    expect(describeRootSemitone(48, "sharps")).toBe("C");
    expect(describeRootSemitone(49, "flats")).toBe("Db");
  });

  it("generates visible natural and black keys for configurable octave counts", () => {
    expect(getNaturalKeyCount(2)).toBe(15);
    expect(getVisibleKeyNames(2)).toEqual([
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "A",
      "B",
      "C"
    ]);
    expect(getVisibleBlackKeys(2).map((key) => key.sourceIndex)).toEqual([
      0,
      1,
      3,
      4,
      5,
      7,
      8,
      10,
      11,
      12
    ]);
    expect(naturalZoneToSemitone(14, false, 2)).toBe(24);
    expect(naturalZoneSupportsSharp(12, 2)).toBe(true);
    expect(naturalZoneSupportsSharp(14, 2)).toBe(false);
  });

  it("normalizes octave counts and note labels defensively", () => {
    expect(getNoteNames("sharps")[1]).toBe("C#");
    expect(getNoteNames("flats")[1]).toBe("Db");
    expect(normalizePianoOctaves(Number.NaN)).toBe(4);
    expect(normalizePianoOctaves(0)).toBe(1);
    expect(normalizePianoOctaves(99)).toBe(6);
    expect(getVisibleKeyNames(Number.NaN)).toEqual(getVisibleKeyNames(4));
  });

  it("derives black-key layouts from normalized octave geometry", () => {
    const layouts = getVisibleBlackKeyLayouts(undefined, 2);
    expect(layouts).toHaveLength(10);
    expect(layouts[0]).toEqual(
      expect.objectContaining({
        label: "C#",
        sourceIndex: 0
      })
    );
    expect(layouts[0]?.centerX).toBeCloseTo(1 / 15, 5);
    expect(layouts[0]?.widthRatio).toBeGreaterThan(0);
  });

  it("handles edge-case semitone and midi labeling", () => {
    expect(naturalZoneToSemitone(-1, false)).toBe(0);
    expect(naturalZoneToSemitone(Number.POSITIVE_INFINITY, false, 2)).toBe(0);
    expect(naturalZoneSupportsSharp(-1)).toBe(false);
    expect(midiToNoteName(61)).toBe("C#4");
    expect(modeLabel("single")).toBe("Single Note");
    expect(modeLabel("dominant7")).toBe("Dominant 7");
  });
});
