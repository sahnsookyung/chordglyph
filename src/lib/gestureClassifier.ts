import { clamp } from "./geometry";
import { extractHandFeatures } from "./featureExtraction";
import type { GestureClassification, HandFeatures, Landmark } from "./types";

function classifyFromFeatures(features: HandFeatures): GestureClassification {
  const strongestPinch = Math.max(features.pinchIndex, features.pinchMiddle);
  const fistScore = clamp(
    features.fistness * 0.75 +
      Math.max(0, features.averageCurl - 0.38) * 0.55 +
      Math.max(0, 1.15 - (features.tipToPalm.index + features.tipToPalm.middle) * 0.45) * 0.2
  );
  const majorScore = clamp(
    features.pinchIndex * 0.72 +
      Math.max(0, features.pinchIndex - features.pinchMiddle) * 0.48 +
      Math.max(0, 0.8 - features.averageCurl) * 0.12 -
      fistScore * 0.12
  );
  const minorScore = clamp(
    features.pinchMiddle * 0.72 +
      Math.max(0, features.pinchMiddle - features.pinchIndex) * 0.48 +
      Math.max(0, 0.8 - features.averageCurl) * 0.12 -
      fistScore * 0.12
  );
  const singleScore = clamp(
    features.openness * 0.72 +
      (features.extendedCount >= 3 ? 0.18 : 0) +
      Math.max(0, 0.78 - strongestPinch) * 0.18 -
      fistScore * 0.12
  );

  const scores = {
    dominant7: fistScore,
    diminished: 0,
    major: majorScore,
    major7: 0,
    minor: minorScore,
    minor7: 0,
    single: singleScore
  };

  const ranking = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [bestMode, bestScore] = ranking[0] as [GestureClassification["mode"], number];
  const runnerUpScore = ranking[1]?.[1] ?? 0;
  const margin = bestScore - runnerUpScore;
  const minimumConfidence =
    bestMode === "dominant7" ? 0.46 : bestMode === "single" ? 0.48 : 0.43;
  const minimumMargin = bestMode === "dominant7" ? 0.08 : 0.06;
  const ambiguous =
    bestScore < minimumConfidence || margin < minimumMargin;

  return {
    mode: ambiguous ? "single" : bestMode,
    confidence: bestScore,
    ambiguous,
    scores,
    margin,
    reason: ambiguous ? "held-previous-mode" : `${bestMode}-detected`
  };
}

export function classifyChordGesture(landmarks: Landmark[]): GestureClassification {
  return classifyFromFeatures(extractHandFeatures(landmarks));
}

export function classifyChordGestureFromFeatures(features: HandFeatures): GestureClassification {
  return classifyFromFeatures(features);
}
