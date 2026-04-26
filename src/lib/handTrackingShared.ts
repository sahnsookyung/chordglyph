import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult
} from "@mediapipe/tasks-vision";
import { mirrorLandmarkForDisplay, normalizeHandedness } from "./trackerNormalization";
import type { TrackedHand } from "./types";

export const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
export const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
export const TARGET_FRAME_INTERVAL_MS = 1000 / 30;

export type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { mediaTime: number }) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export type WorkerRequest =
  | { kind: "init"; requestId: number }
  | { kind: "detect"; requestId: number; frame: ImageBitmap; timestamp: number };

export type WorkerResponse =
  | { kind: "ready"; requestId: number }
  | {
      kind: "result";
      requestId: number;
      hands: TrackedHand[];
      timestamp: number;
      latencyMs: number;
    }
  | { kind: "error"; requestId: number; message: string };

export async function createHandLandmarker(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  return await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  });
}

export function toTrackedHands(result: HandLandmarkerResult): TrackedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const handednessEntry = result.handedness[index]?.[0];
    const handedness = normalizeHandedness(handednessEntry?.categoryName);
    return {
      id: `${handedness}-${index}`,
      handedness,
      confidence: handednessEntry?.score ?? 0,
      landmarks: landmarks.map((point) =>
        mirrorLandmarkForDisplay({
          x: point.x,
          y: point.y,
          z: point.z
        })
      )
    };
  });
}

export async function attachHandTrackingCamera(
  video: HTMLVideoElement,
  deviceId: string
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, min: 24 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    }
  });

  video.srcObject = stream;
  await video.play();
  return stream;
}
