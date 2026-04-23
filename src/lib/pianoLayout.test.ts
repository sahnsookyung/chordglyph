import { resolveNoteZone } from "./noteMapping";
import {
  getWhiteHitSegments,
  getPianoLayout,
  getPianoVerticalOffsetBounds,
  isBlockedByBlackKey,
  PLAYABLE_FINGERTIP_INDEXES,
  resolveActiveTouchState,
  resolveBlackKeyHit,
  resolveWhiteKeyHit
} from "./pianoLayout";

describe("pianoLayout helpers", () => {
  it("uses the expected playable fingertip landmarks", () => {
    expect(PLAYABLE_FINGERTIP_INDEXES).toEqual([4, 8, 12, 16, 20]);
  });

  it("returns stable default piano bounds", () => {
    const layout = getPianoLayout();

    expect(layout.bottomOffset).toBeCloseTo(0.12, 5);
    expect(layout.heightRatio).toBeCloseTo(0.28, 5);
    expect(layout.topY).toBeCloseTo(0.6, 5);
    expect(layout.bottomY).toBeCloseTo(0.88, 5);
  });

  it("moves the piano upward when vertical offset increases", () => {
    const baseLayout = getPianoLayout();
    const shiftedLayout = getPianoLayout(undefined, 0.08, 1);

    expect(shiftedLayout.bottomOffset).toBeGreaterThan(baseLayout.bottomOffset);
    expect(shiftedLayout.topY).toBeLessThan(baseLayout.topY);
    expect(shiftedLayout.bottomY).toBeLessThan(baseLayout.bottomY);
  });

  it("lets the slider move the keyboard all the way to the top for the current key height", () => {
    const bounds = getPianoVerticalOffsetBounds(1.15);
    const layout = getPianoLayout(undefined, bounds.max, 1.15);

    expect(bounds.max).toBeGreaterThan(0);
    expect(layout.topY).toBeCloseTo(0, 5);
  });

  it("makes the keys taller and extends the black-key region", () => {
    const baseLayout = getPianoLayout();
    const tallerLayout = getPianoLayout(undefined, 0, 1.3);

    expect(tallerLayout.heightRatio).toBeGreaterThan(baseLayout.heightRatio);
    expect(tallerLayout.blackKeyTopY).toBeGreaterThan(tallerLayout.topY);
    expect(tallerLayout.blackKeyBottomY - tallerLayout.topY).toBeGreaterThan(
      baseLayout.blackKeyBottomY - baseLayout.topY
    );
  });

  it("lets a single fingertip hit a black key directly", () => {
    const layout = getPianoLayout();
    const key = layout.blackKeys[0];

    expect(
      resolveBlackKeyHit(key.centerX, layout.topY + (layout.blackKeyBottomY - layout.topY) / 2, layout)
    ).toBe(key.sourceIndex);
  });

  it("resolves a white key below the black-key boundary", () => {
    const layout = getPianoLayout();
    const whiteX = 0.5 / 29;

    expect(resolveBlackKeyHit(whiteX, layout.blackKeyBottomY + 0.01, layout)).toBeNull();
    expect(resolveNoteZone(whiteX, null)).toBe(0);
  });

  it("uses a distinct black-key boundary instead of the full white-key height", () => {
    const layout = getPianoLayout();
    const key = layout.blackKeys[0];

    expect(isBlockedByBlackKey(key.centerX, layout.blackKeyTopY + 0.01, layout)).toBe(true);
    expect(isBlockedByBlackKey(key.centerX, layout.blackKeyBottomY + 0.01, layout)).toBe(false);
  });

  it("builds white hit boxes with cutouts where neighboring black keys sit", () => {
    const layout = getPianoLayout();
    const segments = getWhiteHitSegments(layout);
    const dUpper = segments.find((segment) => segment.keyIndex === 1 && segment.segment === "upper");
    const dLower = segments.find((segment) => segment.keyIndex === 1 && segment.segment === "lower");
    const cSharp = layout.blackKeys.find((key) => key.sourceIndex === 0);
    const dSharp = layout.blackKeys.find((key) => key.sourceIndex === 1);

    expect(dUpper).toBeDefined();
    expect(dLower).toBeDefined();
    expect(cSharp).toBeDefined();
    expect(dSharp).toBeDefined();
    expect(dUpper!.leftX).toBeGreaterThan(cSharp!.rightX);
    expect(dUpper!.rightX).toBeLessThan(dSharp!.leftX);
    expect(dLower!.leftX).toBeCloseTo(1 / 29, 5);
    expect(dLower!.rightX).toBeCloseTo(2 / 29, 5);
  });

  it("resolves upper white-key shoulders without overlapping nearby black keys", () => {
    const layout = getPianoLayout();
    const cKeyUpper = getWhiteHitSegments(layout).find(
      (segment) => segment.keyIndex === 0 && segment.segment === "upper"
    );

    expect(cKeyUpper).toBeDefined();
    expect(
      resolveWhiteKeyHit(
        (cKeyUpper!.leftX + cKeyUpper!.rightX) / 2,
        layout.topY + 0.01,
        layout,
        null
      )
    ).toBe(0);
    expect(
      resolveWhiteKeyHit(layout.blackKeys[0].centerX, layout.topY + 0.01, layout, null)
    ).toBeNull();
  });

  it("keeps a real gap between the black hit box and neighboring white shoulders", () => {
    const layout = getPianoLayout();
    const cSharp = layout.blackKeys[0];
    const cUpper = getWhiteHitSegments(layout).find(
      (segment) => segment.keyIndex === 0 && segment.segment === "upper"
    );
    const dUpper = getWhiteHitSegments(layout).find(
      (segment) => segment.keyIndex === 1 && segment.segment === "upper"
    );

    expect(cUpper).toBeDefined();
    expect(dUpper).toBeDefined();
    expect(cUpper!.rightX).toBeLessThan(cSharp.leftX);
    expect(dUpper!.leftX).toBeGreaterThan(cSharp.rightX);
  });

  it("keeps a vertical separation gap between black hit boxes and lower white hit boxes", () => {
    const layout = getPianoLayout();
    const cLower = getWhiteHitSegments(layout).find(
      (segment) => segment.keyIndex === 0 && segment.segment === "lower"
    );

    expect(cLower).toBeDefined();
    expect(cLower!.topY).toBeGreaterThan(layout.blackKeyBottomY);
    expect(
      resolveWhiteKeyHit(
        0.5 / 29,
        (layout.blackKeyBottomY + cLower!.topY) / 2,
        layout,
        null
      )
    ).toBeNull();
  });

  it("keeps the two-fingertip sharp fallback when no direct black touch exists", () => {
    const state = resolveActiveTouchState(
      new Map([
        [0, 2],
        [3, 1]
      ]),
      new Set()
    );

    expect(state.activeSharpZones).toEqual([0]);
    expect(state.activeNaturalZones).toEqual([3]);
  });
});
