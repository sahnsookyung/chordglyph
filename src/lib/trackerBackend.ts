import type { TrackerBackendKind, TrackerFrame } from "./types";

export interface HandTrackerBackend {
  readonly kind: TrackerBackendKind;
  initialize(): Promise<void>;
  attachCamera(video: HTMLVideoElement, deviceId: string): Promise<MediaStream>;
  start(video: HTMLVideoElement, onFrame: (frame: TrackerFrame) => void): void;
  stop(stream: MediaStream | null): void;
}

export async function createTrackerBackend(
  kind: TrackerBackendKind
): Promise<HandTrackerBackend> {
  switch (kind) {
    case "mediapipe-hands": {
      const { MediaPipeHandTrackerBackend } = await import("./handTracking");
      return new MediaPipeHandTrackerBackend();
    }
    case "mediapipe-hands-worker": {
      const { MediaPipeWorkerHandTrackerBackend } = await import("./handTracking");
      return new MediaPipeWorkerHandTrackerBackend();
    }
    case "yolo-pose":
      throw new Error("YOLO Pose backend adapter has not been implemented yet.");
    case "openpose":
      throw new Error("OpenPose backend adapter has not been implemented yet.");
    default:
      throw new Error(`Unsupported tracker backend: ${kind}`);
  }
}

export async function listVideoDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}
