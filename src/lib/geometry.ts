import type { Landmark } from "./types";

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

export function averagePoint(points: Landmark[]): Landmark {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
      z: accumulator.z + point.z
    }),
    { x: 0, y: 0, z: 0 }
  );

  const count = Math.max(points.length, 1);
  return {
    x: total.x / count,
    y: total.y / count,
    z: total.z / count
  };
}

export function ema(previous: number | null, next: number, alpha: number): number {
  if (previous === null) {
    return next;
  }
  return previous + alpha * (next - previous);
}
