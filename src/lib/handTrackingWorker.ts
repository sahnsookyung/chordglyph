import { HandLandmarker } from "@mediapipe/tasks-vision";
import {
  createHandLandmarker,
  toTrackedHands,
  type WorkerRequest,
  type WorkerResponse
} from "./handTrackingShared";

let landmarker: HandLandmarker | null = null;

async function initializeLandmarker(): Promise<void> {
  if (landmarker) {
    return;
  }

  landmarker = await createHandLandmarker();
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
