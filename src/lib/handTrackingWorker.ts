import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult
} from "@mediapipe/tasks-vision";
import { mirrorLandmarkForDisplay, normalizeHandedness } from "./trackerNormalization";
import type { TrackedHand } from "./types";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

type WorkerRequest =
  | { kind: "init"; requestId: number }
  | { kind: "detect"; requestId: number; frame: ImageBitmap; timestamp: number };

type WorkerResponse =
  | { kind: "ready"; requestId: number }
  | {
      kind: "result";
      requestId: number;
      hands: TrackedHand[];
      timestamp: number;
      latencyMs: number;
    }
  | { kind: "error"; requestId: number; message: string };

let landmarker: HandLandmarker | null = null;

function toTrackedHands(result: HandLandmarkerResult): TrackedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const handedness = normalizeHandedness(result.handednesses[index]?.[0]?.categoryName);
    return {
      id: `${handedness}-${index}`,
      handedness,
      confidence: result.handednesses[index]?.[0]?.score ?? 0,
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

async function initializeLandmarker(): Promise<void> {
  if (landmarker) {
    return;
  }

  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  landmarker = await HandLandmarker.createFromOptions(vision, {
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

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.kind === "init") {
    void initializeLandmarker()
      .then(() => post({ kind: "ready", requestId: message.requestId }))
      .catch((caughtError: unknown) =>
        post({
          kind: "error",
          requestId: message.requestId,
          message:
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to initialize worker hand tracker"
        })
      );
    return;
  }

  if (message.kind === "detect") {
    try {
      if (!landmarker) {
        throw new Error("Worker hand tracker has not been initialized");
      }

      const detectStartedAt = performance.now();
      const result = landmarker.detectForVideo(message.frame, message.timestamp);
      post({
        kind: "result",
        requestId: message.requestId,
        hands: toTrackedHands(result),
        timestamp: message.timestamp,
        latencyMs: performance.now() - detectStartedAt
      });
    } catch (caughtError) {
      post({
        kind: "error",
        requestId: message.requestId,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Worker hand detection failed"
      });
    } finally {
      message.frame.close();
    }
  }
};
