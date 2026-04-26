import { averagePoint, clamp, distance, ema, lerp } from "../../src/lib/geometry";

describe("geometry helpers", () => {
  it("clamps values into the given range", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(0.25)).toBe(0.25);
    expect(clamp(3)).toBe(1);
    expect(clamp(11, 10, 20)).toBe(11);
    expect(clamp(30, 10, 20)).toBe(20);
  });

  it("linearly interpolates values", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("measures landmark distance in 3D", () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13);
  });

  it("averages points and handles empty arrays safely", () => {
    expect(
      averagePoint([
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 4, z: 6 }
      ])
    ).toEqual({ x: 1, y: 2, z: 3 });
    expect(averagePoint([])).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("computes exponential moving averages", () => {
    expect(ema(null, 5, 0.25)).toBe(5);
    expect(ema(10, 14, 0.25)).toBe(11);
  });
});
