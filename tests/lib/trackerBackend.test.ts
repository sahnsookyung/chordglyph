vi.mock("../../src/lib/handTracking", () => ({
  MediaPipeHandTrackerBackend: class MediaPipeHandTrackerBackend {
    readonly kind = "mediapipe-hands";
  },
  MediaPipeWorkerHandTrackerBackend: class MediaPipeWorkerHandTrackerBackend {
    readonly kind = "mediapipe-hands-worker";
  }
}));

import { createTrackerBackend, listVideoDevices } from "../../src/lib/trackerBackend";

describe("trackerBackend", () => {
  it("creates the stable and worker tracker backends", async () => {
    await expect(createTrackerBackend("mediapipe-hands")).resolves.toMatchObject({
      kind: "mediapipe-hands"
    });
    await expect(createTrackerBackend("mediapipe-hands-worker")).resolves.toMatchObject({
      kind: "mediapipe-hands-worker"
    });
  });

  it("throws clear errors for unimplemented backends", async () => {
    await expect(createTrackerBackend("yolo-pose")).rejects.toThrow(/YOLO Pose/);
    await expect(createTrackerBackend("openpose")).rejects.toThrow(/OpenPose/);
  });

  it("lists only video input devices", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mic" },
          { kind: "videoinput", deviceId: "cam-1" }
        ])
      }
    });

    await expect(listVideoDevices()).resolves.toEqual([
      expect.objectContaining({ kind: "videoinput", deviceId: "cam-1" })
    ]);
  });
});
