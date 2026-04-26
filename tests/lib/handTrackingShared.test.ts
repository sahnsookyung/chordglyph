/* eslint-disable @typescript-eslint/no-unsafe-assignment */
const { forVisionTasks, createFromOptions } = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn()
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks
  },
  HandLandmarker: {
    createFromOptions
  }
}));

import {
  MODEL_ASSET,
  TARGET_FRAME_INTERVAL_MS,
  WASM_ROOT,
  attachHandTrackingCamera,
  createHandLandmarker,
  toTrackedHands
} from "../../src/lib/handTrackingShared";

describe("handTrackingShared", () => {
  it("creates the hand landmarker with the expected MediaPipe options", async () => {
    const vision = { id: "vision" };
    const landmarker = { id: "landmarker" };
    forVisionTasks.mockResolvedValue(vision);
    createFromOptions.mockResolvedValue(landmarker);

    await expect(createHandLandmarker()).resolves.toBe(landmarker);

    expect(forVisionTasks).toHaveBeenCalledWith(WASM_ROOT);
    expect(createFromOptions).toHaveBeenCalledWith(
      vision,
      expect.objectContaining({
        baseOptions: { modelAssetPath: MODEL_ASSET },
        runningMode: "VIDEO",
        numHands: 2
      })
    );
    expect(TARGET_FRAME_INTERVAL_MS).toBeGreaterThan(30);
  });

  it("normalizes handedness and mirrors landmarks for display", () => {
    const hands = toTrackedHands({
      landmarks: [[{ x: 0.2, y: 0.3, z: -0.1 }]],
      handedness: [[{ categoryName: "Left", score: 0.88 }]]
    });

    expect(hands).toEqual([
      {
        id: "Right-0",
        handedness: "Right",
        confidence: 0.88,
        landmarks: [{ x: 0.8, y: 0.3, z: -0.1 }]
      }
    ]);
  });

  it("attaches the camera stream and starts playback", async () => {
    const stream = {
      id: "stream",
      getTracks: () => []
    } as unknown as MediaStream;
    const play = vi.fn().mockResolvedValue(undefined);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const video = {
      play,
      srcObject: null
    } as unknown as HTMLVideoElement;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia
      }
    });

    await expect(attachHandTrackingCamera(video, "cam-1")).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          deviceId: { exact: "cam-1" }
        })
      })
    );
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalled();
  });
});
