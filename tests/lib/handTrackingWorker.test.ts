describe("handTrackingWorker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("initializes the landmarker and posts detect results through self", async () => {
    const createHandLandmarker = vi.fn().mockResolvedValue({
      detectForVideo: vi.fn().mockReturnValue({ landmarks: [], handedness: [] })
    });
    const toTrackedHands = vi.fn().mockReturnValue([]);
    const postMessage = vi.fn();
    const workerSelf = {
      postMessage,
      onmessage: null as ((event: MessageEvent<{ kind: string; requestId: number; frame?: ImageBitmap; timestamp?: number }>) => void) | null
    };
    vi.stubGlobal("self", workerSelf);

    vi.doMock("../../src/lib/handTrackingShared", () => ({
      createHandLandmarker,
      toTrackedHands
    }));

    await import("../../src/lib/handTrackingWorker");

    workerSelf.onmessage?.({
      data: { kind: "init", requestId: 1 }
    } as MessageEvent<{ kind: "init"; requestId: number }>);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postMessage).toHaveBeenCalledWith({ kind: "ready", requestId: 1 });

    const close = vi.fn();
    const frame = { close } as unknown as ImageBitmap;
    workerSelf.onmessage?.({
      data: { kind: "detect", requestId: 2, frame, timestamp: 120 }
    } as MessageEvent<{ kind: "detect"; requestId: number; frame: ImageBitmap; timestamp: number }>);

    expect(toTrackedHands).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "result", requestId: 2, hands: [] })
    );
    expect(close).toHaveBeenCalled();
  });

  it("reports initialization failures and detect-before-init errors", async () => {
    const createHandLandmarker = vi.fn().mockRejectedValue(new Error("init failed"));
    const toTrackedHands = vi.fn();
    const postMessage = vi.fn();
    const workerSelf = {
      postMessage,
      onmessage: null as ((event: MessageEvent<{ kind: string; requestId: number; frame?: ImageBitmap; timestamp?: number }>) => void) | null
    };
    vi.stubGlobal("self", workerSelf);

    vi.doMock("../../src/lib/handTrackingShared", () => ({
      createHandLandmarker,
      toTrackedHands
    }));

    await import("../../src/lib/handTrackingWorker");

    workerSelf.onmessage?.({
      data: { kind: "init", requestId: 1 }
    } as MessageEvent<{ kind: "init"; requestId: number }>);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(postMessage).toHaveBeenCalledWith({
      kind: "error",
      requestId: 1,
      message: "init failed"
    });

    const close = vi.fn();
    const frame = { close } as unknown as ImageBitmap;
    workerSelf.onmessage?.({
      data: { kind: "detect", requestId: 2, frame, timestamp: 120 }
    } as MessageEvent<{ kind: "detect"; requestId: number; frame: ImageBitmap; timestamp: number }>);

    expect(postMessage).toHaveBeenCalledWith({
      kind: "error",
      requestId: 2,
      message: "Worker hand tracker has not been initialized"
    });
    expect(toTrackedHands).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
