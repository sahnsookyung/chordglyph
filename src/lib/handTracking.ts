import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult
} from "@mediapipe/tasks-vision";
import type { HandTrackerBackend } from "./trackerBackend";
import { mirrorLandmarkForDisplay, normalizeHandedness } from "./trackerNormalization";
import type { TrackerFrame, TrackedHand } from "./types";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const TARGET_FRAME_INTERVAL_MS = 1000 / 30;

type VideoFrameCallbackHandle = number;
type VideoFrameCallbackMetadata = { mediaTime: number };
type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameCallbackMetadata) => void
  ) => VideoFrameCallbackHandle;
  cancelVideoFrameCallback?: (handle: VideoFrameCallbackHandle) => void;
};

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

export class MediaPipeHandTrackerBackend implements HandTrackerBackend {
  readonly kind = "mediapipe-hands" as const;
  private landmarker: HandLandmarker | null = null;
  private rafId = 0;
  private videoFrameCallbackId = 0;
  private activeVideo: VideoElementWithFrameCallback | null = null;
  private lastVideoTime = -1;
  private lastFrameTimestamp = performance.now();
  private lastProcessedAt = 0;

  async initialize(): Promise<void> {
    if (this.landmarker) {
      return;
    }

    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
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

  async attachCamera(video: HTMLVideoElement, deviceId: string): Promise<MediaStream> {
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

  start(video: HTMLVideoElement, onFrame: (frame: TrackerFrame) => void): void {
    if (!this.landmarker) {
      throw new Error("Hand tracker has not been initialized");
    }
    const videoWithFrameCallback = video as VideoElementWithFrameCallback;
    this.activeVideo = videoWithFrameCallback;

    const processFrame = (callbackTimestamp: number) => {
      const now = performance.now();
      if (
        video.readyState < 2 ||
        video.currentTime === this.lastVideoTime ||
        now - this.lastProcessedAt < TARGET_FRAME_INTERVAL_MS
      ) {
        return;
      }

      const fps = 1000 / Math.max(now - this.lastFrameTimestamp, 1);
      this.lastVideoTime = video.currentTime;
      this.lastFrameTimestamp = now;
      this.lastProcessedAt = now;
      const detectStartedAt = performance.now();
      const result = this.landmarker?.detectForVideo(video, callbackTimestamp);
      if (!result) {
        return;
      }
      onFrame({
        hands: toTrackedHands(result),
        timestamp: now,
        fps,
        latencyMs: performance.now() - detectStartedAt
      });
    };

    if (videoWithFrameCallback.requestVideoFrameCallback) {
      const loop = (now: number) => {
        processFrame(now);
        this.videoFrameCallbackId = videoWithFrameCallback.requestVideoFrameCallback?.(loop) ?? 0;
      };

      this.videoFrameCallbackId = videoWithFrameCallback.requestVideoFrameCallback(loop);
      return;
    }

    const loop = () => {
      processFrame(performance.now());
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(stream: MediaStream | null): void {
    cancelAnimationFrame(this.rafId);
    this.activeVideo?.cancelVideoFrameCallback?.(this.videoFrameCallbackId);
    this.videoFrameCallbackId = 0;
    this.activeVideo = null;
    stream?.getTracks().forEach((track) => track.stop());
  }
}
