import { buildArcLayout, getStripBounds, projectToNoteStripX, resolveNoteZone } from "../../src/lib/noteMapping";

describe("resolveNoteZone", () => {
  it("maps positions into 29 note zones", () => {
    expect(resolveNoteZone(0, null)).toBe(0);
    expect(resolveNoteZone(0.499, null)).toBe(14);
    expect(resolveNoteZone(0.999, null)).toBe(28);
  });

  it("applies hysteresis near zone boundaries", () => {
    const zone = resolveNoteZone(0.05, 1);
    expect(zone).toBe(1);
    expect(resolveNoteZone(0.08, 1)).toBe(2);
  });

  it("keeps neighboring zones visually separated in the arc layout", () => {
    const layout = buildArcLayout(1280, 720, "normal", 1);

    for (let index = 1; index < layout.length; index += 1) {
      expect(layout[index].x).toBeGreaterThan(layout[index - 1].x + layout[index - 1].width);
    }
  });

  it("projects fingertip positions into the playable strip instead of the full camera width", () => {
    expect(projectToNoteStripX(0.02, "normal")).toBeNull();
    expect(projectToNoteStripX(0.5, "normal")).toBeCloseTo(0.5, 5);
    expect(projectToNoteStripX(0.98, "normal")).toBeNull();
  });

  it("returns shared strip bounds that match the projected piano width", () => {
    const compactBounds = getStripBounds("compact");
    const largeBounds = getStripBounds("large");

    expect(compactBounds.left).toBeCloseTo(0.11, 5);
    expect(compactBounds.right).toBeCloseTo(0.89, 5);
    expect(compactBounds.widthRatio).toBeCloseTo(0.78, 5);
    expect(largeBounds.left).toBeCloseTo(0.04, 5);
    expect(largeBounds.right).toBeCloseTo(0.96, 5);
    expect(largeBounds.widthRatio).toBeCloseTo(0.92, 5);
  });

  it("widens the playable strip when key width scale increases", () => {
    const baseBounds = getStripBounds("large", 1);
    const widerBounds = getStripBounds("large", 1.08);

    expect(widerBounds.widthRatio).toBeGreaterThan(baseBounds.widthRatio);
    expect(widerBounds.left).toBeLessThan(baseBounds.left);
    expect(projectToNoteStripX(0.97, "large", 0.035, 1.08)).not.toBeNull();
  });
});
