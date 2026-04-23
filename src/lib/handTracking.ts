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

export class MediaPipeWorkerHandTrackerBackend implements HandTrackerBackend {
  readonly kind = "mediapipe-hands-worker" as const;
  private worker: Worker | null = null;
  private rafId = 0;
  private videoFrameCallbackId = 0;
  private activeVideo: VideoElementWithFrameCallback | null = null;
  private requestId = 0;
  private inFlight = false;
  private stopped = false;
  private lastVideoTime = -1;
  private lastFrameTimestamp = performance.now();
  private lastProcessedAt = 0;
  private pendingInit:
    | { requestId: number; resolve: () => void; reject: (error: Error) => void }
    | null = null;
  private pendingFrameStartedAt = 0;
  private onFrame: ((frame: TrackerFrame) => void) | null = null;

  async initialize(): Promise<void> {
    if (this.worker) {
      return;
    }

    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      throw new Error("Worker hand tracking is not supported in this browser.");
    }

    this.worker = new Worker(new URL("./handTrackingWorker.ts", import.meta.url), {
      type: "module"
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Worker hand tracker failed to load.");
      if (this.pendingInit) {
        this.pendingInit.reject(error);
        this.pendingInit = null;
      }
    };

    return await new Promise<void>((resolve, reject) => {
      const requestId = this.nextRequestId();
      const timeoutId = window.setTimeout(() => {
        if (this.pendingInit?.requestId === requestId) {
          this.pendingInit.reject(new Error("Worker hand tracker initialization timed out."));
          this.pendingInit = null;
        }
      }, 10000);
      this.pendingInit = {
        requestId,
        resolve: () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        }
      };
      this.worker?.postMessage({ kind: "init", requestId } satisfies WorkerRequest);
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
    if (!this.worker) {
      throw new Error("Worker hand tracker has not been initialized");
    }

    const videoWithFrameCallback = video as VideoElementWithFrameCallback;
    this.activeVideo = videoWithFrameCallback;
    this.onFrame = onFrame;
    this.stopped = false;

    const scheduleDetect = () => {
      void this.detectNextFrame(video);
    };

    if (videoWithFrameCallback.requestVideoFrameCallback) {
      const loop = () => {
        if (this.stopped) {
          return;
        }
        scheduleDetect();
        if (!this.stopped) {
          this.videoFrameCallbackId = videoWithFrameCallback.requestVideoFrameCallback?.(loop) ?? 0;
        }
      };

      this.videoFrameCallbackId = videoWithFrameCallback.requestVideoFrameCallback(loop);
      return;
    }

    const loop = () => {
      if (this.stopped) {
        return;
      }
      scheduleDetect();
      if (!this.stopped) {
        this.rafId = requestAnimationFrame(loop);
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(stream: MediaStream | null): void {
    this.stopped = true;
    cancelAnimationFrame(this.rafId);
    this.activeVideo?.cancelVideoFrameCallback?.(this.videoFrameCallbackId);
    this.videoFrameCallbackId = 0;
    this.activeVideo = null;
    this.onFrame = null;
    this.worker?.terminate();
    this.worker = null;
    this.pendingInit = null;
    this.inFlight = false;
    stream?.getTracks().forEach((track) => track.stop());
  }

  private async detectNextFrame(video: HTMLVideoElement): Promise<void> {
    const worker = this.worker;
    const now = performance.now();
    if (
      !worker ||
      this.stopped ||
      this.inFlight ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoTime ||
      now - this.lastProcessedAt < TARGET_FRAME_INTERVAL_MS
    ) {
      return;
    }

    this.inFlight = true;
    this.lastVideoTime = video.currentTime;
    this.lastProcessedAt = now;
    const requestId = this.nextRequestId();

    try {
      const frame = await createImageBitmap(video);
      if (this.stopped || this.worker !== worker) {
        frame.close();
        this.inFlight = false;
        return;
      }

      this.pendingFrameStartedAt = performance.now();
      worker.postMessage(
        {
          kind: "detect",
          requestId,
          frame,
          timestamp: now
        } satisfies WorkerRequest,
        [frame]
      );
    } catch {
      this.inFlight = false;
    }
  }

  private handleWorkerMessage(message: WorkerResponse): void {
    if (message.kind === "ready") {
      if (this.pendingInit?.requestId === message.requestId) {
        this.pendingInit.resolve();
        this.pendingInit = null;
      }
      return;
    }

    if (message.kind === "error") {
      this.inFlight = false;
      if (this.pendingInit?.requestId === message.requestId) {
        this.pendingInit.reject(new Error(message.message));
        this.pendingInit = null;
      }
      return;
    }

    this.inFlight = false;
    const now = performance.now();
    const fps = 1000 / Math.max(now - this.lastFrameTimestamp, 1);
    this.lastFrameTimestamp = now;
    this.onFrame?.({
      hands: message.hands,
      timestamp: now,
      fps,
      latencyMs: Math.max(now - this.pendingFrameStartedAt, message.latencyMs)
    });
  }

  private nextRequestId(): number {
    this.requestId += 1;
    return this.requestId;
  }
}

export class AutoMediaPipeHandTrackerBackend implements HandTrackerBackend {
  readonly kind = "mediapipe-hands" as const;
  private delegate: HandTrackerBackend | null = null;

  async initialize(): Promise<void> {
    const workerBackend = new MediaPipeWorkerHandTrackerBackend();
    try {
      await workerBackend.initialize();
      this.delegate = workerBackend;
      return;
    } catch {
      workerBackend.stop(null);
    }

    const mainThreadBackend = new MediaPipeHandTrackerBackend();
    await mainThreadBackend.initialize();
    this.delegate = mainThreadBackend;
  }

  async attachCamera(video: HTMLVideoElement, deviceId: string): Promise<MediaStream> {
    return await this.requireDelegate().attachCamera(video, deviceId);
  }

  start(video: HTMLVideoElement, onFrame: (frame: TrackerFrame) => void): void {
    this.requireDelegate().start(video, onFrame);
  }

  stop(stream: MediaStream | null): void {
    this.delegate?.stop(stream);
  }

  private requireDelegate(): HandTrackerBackend {
    if (!this.delegate) {
      throw new Error("Hand tracker has not been initialized");
    }
    return this.delegate;
  }
}
