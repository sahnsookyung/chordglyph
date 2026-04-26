import { CIRCLE_NOTE_COUNT } from "../lib/circleMode";
import type { Landmark } from "../lib/types";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17]
] as const;

interface ActiveTouchMarker {
  tipIndex: number;
  source: "piano" | "circle";
  modelZ: number;
  rawDepthScore: number;
  sensitivity: number;
  depthScore: number;
  activationProgress: number;
  activationVelocity: number;
  isCalibrated: boolean;
  isPressed: boolean;
}

function circlePoint(angle: number, radius: number): { x: number; y: number } {
  return {
    x: 50 + Math.sin(angle) * radius,
    y: 50 - Math.cos(angle) * radius
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(249, 115, 22, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function parseHex(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) {
    return { red: 249, green: 115, blue: 22 };
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function mixHexColors(startHex: string, endHex: string, amount: number, alpha = 1): string {
  const normalizedAmount = Math.max(0, Math.min(1, amount));
  const start = parseHex(startHex);
  const end = parseHex(endHex);

  return `rgba(${Math.round(start.red + (end.red - start.red) * normalizedAmount)}, ${Math.round(
    start.green + (end.green - start.green) * normalizedAmount
  )}, ${Math.round(start.blue + (end.blue - start.blue) * normalizedAmount)}, ${alpha})`;
}

export function circleSegmentPath(segment: number): string {
  const segmentSize = (Math.PI * 2) / CIRCLE_NOTE_COUNT;
  const startAngle = segment * segmentSize - segmentSize / 2;
  const endAngle = segment * segmentSize + segmentSize / 2;
  const outerStart = circlePoint(startAngle, 48);
  const outerEnd = circlePoint(endAngle, 48);
  const innerStart = circlePoint(startAngle, 12);
  const innerEnd = circlePoint(endAngle, 12);

  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A 48 48 0 0 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A 12 12 0 0 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z"
  ].join(" ");
}

export function circleLabelPoint(segment: number): { x: number; y: number } {
  return circlePoint((segment * Math.PI * 2) / CIRCLE_NOTE_COUNT, 31);
}

export function drawHandPath(
  context: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  stroke: string,
  thickness: number,
  activeTouchMarkers: ActiveTouchMarker[],
  idleTipColor: string,
  activeColor: string,
  showLabels: boolean
): void {
  context.strokeStyle = stroke;
  context.lineWidth = 1 + thickness * 2.2;
  HAND_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.stroke();
  });

  const touchMarkerByTip = new Map(
    activeTouchMarkers.map((marker) => [marker.tipIndex, marker] as const)
  );

  landmarks.forEach((landmark, index) => {
    const tipMarker = touchMarkerByTip.get(index);
    const isFingertip = touchMarkerByTip.has(index) || [4, 8, 12, 16, 20].includes(index);
    let fillStyle = stroke;
    if (tipMarker) {
      const alpha = tipMarker.isPressed ? 1 : 0.45 + tipMarker.activationProgress * 0.45;
      fillStyle = mixHexColors(
        idleTipColor,
        activeColor,
        tipMarker.activationProgress,
        alpha
      );
    } else if (isFingertip) {
      fillStyle = hexToRgba(idleTipColor, 0.7);
    }
    context.fillStyle = fillStyle;
    context.beginPath();
    let radius = 1.8 + thickness * 2.2;
    if (tipMarker) {
      radius = 3.6 + thickness * 3.4 + tipMarker.activationProgress * 2.4;
    } else if (isFingertip) {
      radius = 2.6 + thickness * 2.8;
    }
    context.arc(landmark.x * width, landmark.y * height, radius, 0, Math.PI * 2);
    context.fill();
  });

  if (!showLabels) {
    return;
  }

  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.font = '600 11px "Space Grotesk", sans-serif';

  activeTouchMarkers.forEach((marker) => {
    if (marker.source !== "piano") {
      return;
    }

    const tip = landmarks[marker.tipIndex];
    if (!tip) {
      return;
    }

    const labelX = tip.x * width + 10;
    const labelY = tip.y * height - 12;
    const labelColor = mixHexColors(
      idleTipColor,
      activeColor,
      marker.activationProgress,
      marker.isPressed ? 1 : 0.92
    );

    context.lineWidth = 3;
    context.strokeStyle = "rgba(5, 10, 15, 0.88)";
    context.fillStyle = labelColor;

    const modelLabel = `model ${marker.modelZ.toFixed(3)}`;
    const rawLabel = `base ${marker.rawDepthScore.toFixed(3)}`;
    const sensitivityLabel = `s ${marker.sensitivity.toFixed(2)}`;
    const weightedLabel = `wd ${marker.depthScore.toFixed(3)}`;
    const activationSuffix = marker.isCalibrated ? "" : "*";
    const activationLabel = `act ${marker.activationProgress.toFixed(2)}${activationSuffix}`;
    const velocityLabel = `v ${marker.activationVelocity.toFixed(2)}`;

    context.strokeText(modelLabel, labelX, labelY);
    context.fillText(modelLabel, labelX, labelY);
    context.strokeText(rawLabel, labelX, labelY + 13);
    context.fillText(rawLabel, labelX, labelY + 13);
    context.strokeText(sensitivityLabel, labelX, labelY + 26);
    context.fillText(sensitivityLabel, labelX, labelY + 26);
    context.strokeText(weightedLabel, labelX, labelY + 39);
    context.fillText(weightedLabel, labelX, labelY + 39);
    context.strokeText(activationLabel, labelX, labelY + 52);
    context.fillText(activationLabel, labelX, labelY + 52);
    context.strokeText(velocityLabel, labelX, labelY + 65);
    context.fillText(velocityLabel, labelX, labelY + 65);
  });
}
