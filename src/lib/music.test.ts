import {
  buildVoicing,
  describeChord,
  describeRootSemitone,
  getNaturalKeyCount,
  getVisibleBlackKeys,
  getVisibleKeyNames,
  naturalZoneSupportsSharp,
  naturalZoneToSemitone
} from "./music";

describe("music helpers", () => {
  it("builds major voicings from the root", () => {
    expect(buildVoicing(0, "major")).toEqual([60, 64, 67]);
    expect(buildVoicing(9, "minor")).toEqual([69, 72, 76]);
    expect(buildVoicing(2, "diminished")).toEqual([62, 65, 68]);
    expect(buildVoicing(5, "major7")).toEqual([65, 69, 72, 76]);
    expect(buildVoicing(7, "minor7")).toEqual([67, 70, 74, 77]);
  });

  it("formats chord labels with sharps or flats", () => {
    expect(describeChord(1, "major", "sharps")).toBe("C# major");
    expect(describeChord(1, "dominant7", "flats")).toBe("Db7");
    expect(describeChord(2, "diminished", "sharps")).toBe("D dim");
    expect(describeChord(4, "major7", "sharps")).toBe("Emaj7");
    expect(describeChord(3, "minor7", "flats")).toBe("Ebm7");
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
});
