const { createHandLandmarker, attachHandTrackingCamera, toTrackedHands } = vi.hoisted(() => ({
  createHandLandmarker: vi.fn(),
  attachHandTrackingCamera: vi.fn(),
  toTrackedHands: vi.fn()
}));

vi.mock("../../src/lib/handTrackingShared", () => ({
  TARGET_FRAME_INTERVAL_MS: 1000 / 30,
  createHandLandmarker,
  attachHandTrackingCamera,
  toTrackedHands
}));

import {
  AutoMediaPipeHandTrackerBackend,
  MediaPipeHandTrackerBackend,
  MediaPipeWorkerHandTrackerBackend
} from "../../src/lib/handTracking";

describe("handTracking backends", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("initializes and runs the stable backend on the animation-frame path", async () => {
    const detectForVideo = vi.fn().mockReturnValue({ landmarks: [], handedness: [] });
    createHandLandmarker.mockResolvedValue({ detectForVideo });
    toTrackedHands.mockReturnValue([{ id: "Right-0", handedness: "Right", confidence: 0.9, landmarks: [] }]);
    attachHandTrackingCamera.mockResolvedValue("stream");

    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementationOnce(() => 0).mockImplementation(() => 80);

    const backend = new MediaPipeHandTrackerBackend();
    await backend.initialize();
    const video = {
      readyState: 2,
      currentTime: 1,
      play: vi.fn()
    } as unknown as HTMLVideoElement;
    const onFrame = vi.fn();

    backend.start(video, onFrame);
    rafCallback?.(100);

    expect(detectForVideo).toHaveBeenCalled();
    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        hands: [{ id: "Right-0", handedness: "Right", confidence: 0.9, landmarks: [] }]
      })
    );

    const stream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;
    backend.stop(stream);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("uses requestVideoFrameCallback when the browser supports it", async () => {
    const detectForVideo = vi.fn().mockReturnValue({ landmarks: [], handedness: [] });
    createHandLandmarker.mockResolvedValue({ detectForVideo });
    toTrackedHands.mockReturnValue([]);
    attachHandTrackingCamera.mockResolvedValue("stream");
    vi.spyOn(performance, "now").mockImplementation(() => 80);
    const cancelVideoFrameCallback = vi.fn();

    const backend = new MediaPipeHandTrackerBackend();
    await backend.initialize();

    const frameCallbacks: Array<(now: number) => void> = [];
    const video = {
      readyState: 2,
      currentTime: 1,
      requestVideoFrameCallback: vi.fn((callback: (now: number) => void) => {
        frameCallbacks.push(callback);
        return 12;
      }),
      cancelVideoFrameCallback
    } as unknown as HTMLVideoElement;
    const onFrame = vi.fn();

    backend.start(video, onFrame);
    frameCallbacks[0]?.(100);

    expect(detectForVideo).toHaveBeenCalledWith(video, 100);
    backend.stop(null);
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(12);
  });

  it("initializes, posts work to the worker backend, and stops cleanly", async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent<{ kind: string; requestId: number; hands?: never[]; timestamp?: number; latencyMs?: number }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn((message: { kind: string; requestId: number }) => {
        if (message.kind === "init") {
          queueMicrotask(() =>
            this.onmessage?.({
              data: { kind: "ready", requestId: message.requestId }
            } as MessageEvent<{ kind: "ready"; requestId: number }>)
          );
        }
      });
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    const bitmap = { close: vi.fn() };
    vi.stubGlobal("Worker", FakeWorker);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => 80);

    const backend = new MediaPipeWorkerHandTrackerBackend();
    await backend.initialize();

    const frameCallbacks: Array<(now: number) => void> = [];
    const video = {
      readyState: 2,
      currentTime: 1,
      requestVideoFrameCallback: vi.fn((callback: (now: number) => void) => {
        frameCallbacks.push(callback);
        return 1;
      }),
      cancelVideoFrameCallback: vi.fn()
    } as unknown as HTMLVideoElement;
    const onFrame = vi.fn();

    backend.start(video, onFrame);
    frameCallbacks[0]?.(100);
    await Promise.resolve();

    const worker = workers[0];
    expect(worker.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: "detect" }),
      [bitmap]
    );

    worker.onmessage?.({
      data: {
        kind: "result",
        requestId: 2,
        hands: [],
        timestamp: 100,
        latencyMs: 6
      }
    } as MessageEvent<{ kind: "result"; requestId: number; hands: never[]; timestamp: number; latencyMs: number }>);

    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({ hands: [], latencyMs: 6, timestamp: 80 })
    );

    const stream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;
    backend.stop(stream);
    expect(worker.terminate).toHaveBeenCalled();
  });

  it("guards unsupported worker browsers and worker init failures", async () => {
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("createImageBitmap", undefined);
    await expect(new MediaPipeWorkerHandTrackerBackend().initialize()).rejects.toThrow(
      /not supported/
    );

    class BrokenWorker {
      onmessage: ((event: MessageEvent<{ kind: string; requestId: number }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn((message: { kind: string; requestId: number }) => {
        if (message.kind === "init") {
          queueMicrotask(() =>
            this.onerror?.({ message: "boom" } as ErrorEvent)
          );
        }
      });
      terminate = vi.fn();
    }

    vi.stubGlobal("Worker", BrokenWorker);
    vi.stubGlobal("createImageBitmap", vi.fn());
    await expect(new MediaPipeWorkerHandTrackerBackend().initialize()).rejects.toThrow(/boom/);
  });

  it("falls back to the main-thread backend when worker initialization fails", async () => {
    const workerInit = vi
      .spyOn(MediaPipeWorkerHandTrackerBackend.prototype, "initialize")
      .mockRejectedValueOnce(new Error("worker failed"));
    const stableInit = vi
      .spyOn(MediaPipeHandTrackerBackend.prototype, "initialize")
      .mockResolvedValueOnce();
    const stableStart = vi
      .spyOn(MediaPipeHandTrackerBackend.prototype, "start")
      .mockImplementation(() => undefined);

    const backend = new AutoMediaPipeHandTrackerBackend();
    await backend.initialize();
    backend.start({ readyState: 2, currentTime: 0 } as HTMLVideoElement, vi.fn());

    expect(workerInit).toHaveBeenCalled();
    expect(stableInit).toHaveBeenCalled();
    expect(stableStart).toHaveBeenCalled();
  });

  it("keeps the worker backend when worker initialization succeeds", async () => {
    const workerInit = vi
      .spyOn(MediaPipeWorkerHandTrackerBackend.prototype, "initialize")
      .mockResolvedValueOnce();
    const workerStart = vi
      .spyOn(MediaPipeWorkerHandTrackerBackend.prototype, "start")
      .mockImplementation(() => undefined);
    const stableInit = vi.spyOn(MediaPipeHandTrackerBackend.prototype, "initialize");

    const backend = new AutoMediaPipeHandTrackerBackend();
    await backend.initialize();
    backend.start({ readyState: 2, currentTime: 0 } as HTMLVideoElement, vi.fn());

    expect(workerInit).toHaveBeenCalled();
    expect(workerStart).toHaveBeenCalled();
    expect(stableInit).not.toHaveBeenCalled();
  });

  it("throws when start is called before initialization", () => {
    const stable = new MediaPipeHandTrackerBackend();
    expect(() =>
      stable.start({ readyState: 2, currentTime: 0 } as HTMLVideoElement, vi.fn())
    ).toThrow(/not been initialized/);

    const worker = new MediaPipeWorkerHandTrackerBackend();
    expect(() =>
      worker.start({ readyState: 2, currentTime: 0 } as HTMLVideoElement, vi.fn())
    ).toThrow(/not been initialized/);

    const auto = new AutoMediaPipeHandTrackerBackend();
    expect(() =>
      auto.start({ readyState: 2, currentTime: 0 } as HTMLVideoElement, vi.fn())
    ).toThrow(/not been initialized/);
  });
});
