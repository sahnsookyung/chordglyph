import {
  buildVoicing,
  describeChord,
  describeRootSemitone,
  getVisibleBlackKeys,
  getVisibleKeyNames,
  naturalZoneToSemitone
} from "./music";

describe("music helpers", () => {
  it("builds major voicings from the root", () => {
    expect(buildVoicing(0, "major")).toEqual([60, 64, 67]);
    expect(buildVoicing(9, "minor")).toEqual([69, 72, 76]);
  });

  it("formats chord labels with sharps or flats", () => {
    expect(describeChord(1, "major", "sharps")).toBe("C# major");
    expect(describeChord(1, "dominant7", "flats")).toBe("Db7");
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
});
