import type { Handedness, Landmark } from "./types";

export function normalizeHandedness(categoryName: string | undefined): Handedness {
  // MediaPipe handedness labels assume mirrored selfie input. Our camera frames are passed
  // in raw, so we swap labels before the rest of the app assigns dominant/non-dominant roles.
  if (categoryName === "Left") {
    return "Right";
  }
  if (categoryName === "Right") {
    return "Left";
  }
  return "Right";
}

export function mirrorLandmarkForDisplay(point: Landmark): Landmark {
  return {
    x: 1 - point.x,
    y: point.y,
    z: point.z
  };
}
