import { averagePoint, clamp, distance } from "./geometry";
import type { HandFeatures, Landmark } from "./types";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

function normalizedPinch(a: Landmark, b: Landmark, scale: number): number {
  const normalizedDistance = distance(a, b) / Math.max(scale, 0.0001);
  return clamp(1.25 - normalizedDistance * 3);
}

function fingerCurl(
  palm: Landmark,
  mcp: Landmark,
  pip: Landmark,
  tip: Landmark,
  scale: number
): number {
  const tipDistance = distance(tip, palm);
  const pipDistance = distance(pip, palm);
  const mcpDistance = distance(mcp, palm);
  const normalized = (mcpDistance + pipDistance - 2 * tipDistance) / Math.max(scale, 0.0001);
  return clamp(0.45 + normalized * 1.2);
}

function fingerExtended(palm: Landmark, pip: Landmark, tip: Landmark): boolean {
  return distance(tip, palm) > distance(pip, palm) * 1.08;
}

export function extractHandFeatures(landmarks: Landmark[]): HandFeatures {
  const palmCenter = averagePoint([
    landmarks[WRIST],
    landmarks[INDEX_MCP],
    landmarks[MIDDLE_MCP],
    landmarks[RING_MCP],
    landmarks[PINKY_MCP]
  ]);

  const handScale =
    (distance(landmarks[WRIST], landmarks[MIDDLE_MCP]) +
      distance(landmarks[INDEX_MCP], landmarks[PINKY_MCP]) +
      distance(landmarks[WRIST], landmarks[PINKY_MCP])) /
    3;

  const indexCurl = fingerCurl(
    palmCenter,
    landmarks[INDEX_MCP],
    landmarks[INDEX_PIP],
    landmarks[INDEX_TIP],
    handScale
  );
  const middleCurl = fingerCurl(
    palmCenter,
    landmarks[MIDDLE_MCP],
    landmarks[MIDDLE_PIP],
    landmarks[MIDDLE_TIP],
    handScale
  );
  const ringCurl = fingerCurl(
    palmCenter,
    landmarks[RING_MCP],
    landmarks[RING_PIP],
    landmarks[RING_TIP],
    handScale
  );
  const pinkyCurl = fingerCurl(
    palmCenter,
    landmarks[PINKY_MCP],
    landmarks[PINKY_PIP],
    landmarks[PINKY_TIP],
    handScale
  );

  const fingerCurlValues = {
    index: indexCurl,
    middle: middleCurl,
    ring: ringCurl,
    pinky: pinkyCurl
  };

  const tipToPalm = {
    index: distance(landmarks[INDEX_TIP], palmCenter) / Math.max(handScale, 0.0001),
    middle: distance(landmarks[MIDDLE_TIP], palmCenter) / Math.max(handScale, 0.0001),
    ring: distance(landmarks[RING_TIP], palmCenter) / Math.max(handScale, 0.0001),
    pinky: distance(landmarks[PINKY_TIP], palmCenter) / Math.max(handScale, 0.0001)
  };

  const extendedCount = [
    fingerExtended(palmCenter, landmarks[INDEX_PIP], landmarks[INDEX_TIP]),
    fingerExtended(palmCenter, landmarks[MIDDLE_PIP], landmarks[MIDDLE_TIP]),
    fingerExtended(palmCenter, landmarks[RING_PIP], landmarks[RING_TIP]),
    fingerExtended(palmCenter, landmarks[PINKY_PIP], landmarks[PINKY_TIP])
  ].filter(Boolean).length;

  const averageCurl = (indexCurl + middleCurl + ringCurl + pinkyCurl) / 4;
  const pinchIndex = normalizedPinch(landmarks[THUMB_TIP], landmarks[INDEX_TIP], handScale);
  const pinchMiddle = normalizedPinch(landmarks[THUMB_TIP], landmarks[MIDDLE_TIP], handScale);
  const fistness = clamp(
    averageCurl * 0.75 +
      (1 - (tipToPalm.index + tipToPalm.middle + tipToPalm.ring + tipToPalm.pinky) / 4) * 0.45
  );
  const openness = clamp(
    extendedCount / 4 - Math.max(pinchIndex, pinchMiddle) * 0.25 - averageCurl * 0.2
  );

  return {
    palmCenter,
    handScale,
    pinchIndex,
    pinchMiddle,
    averageCurl,
    fingerCurl: fingerCurlValues,
    tipToPalm,
    extendedCount,
    fistness,
    openness
  };
}
