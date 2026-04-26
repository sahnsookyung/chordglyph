import { act, renderHook, waitFor } from "@testing-library/react";
import { useGestureInstrument } from "../../src/hooks/useGestureInstrument";
import { getCircleLayout } from "../../src/lib/circleMode";
import { DEFAULT_SETTINGS } from "../../src/lib/constants";
import type { HandTrackerBackend } from "../../src/lib/trackerBackend";
import type { TrackerFrame, TrackedHand } from "../../src/lib/types";

const {
  loadInstrumentSettings,
  saveInstrumentSettings,
  createTrackerBackend,
  listVideoDevices,
  listAudioOutputDevices,
  supportsExplicitAudioOutputRouting,
  audioStart,
  audioSetPatch,
  audioSetVolume,
  audioSetOutputDevice,
  audioSyncMidiNotes,
  audioStopCalibrationPreview,
  audioStopAll,
  audioDispose,
  audioTriggerCue,
  audioTriggerTone
} = vi.hoisted(() => ({
  loadInstrumentSettings: vi.fn(),
  saveInstrumentSettings: vi.fn(),
  createTrackerBackend: vi.fn(),
  listVideoDevices: vi.fn(),
  listAudioOutputDevices: vi.fn(),
  supportsExplicitAudioOutputRouting: vi.fn(),
  audioStart: vi.fn(),
  audioSetPatch: vi.fn(),
  audioSetVolume: vi.fn(),
  audioSetOutputDevice: vi.fn(),
  audioSyncMidiNotes: vi.fn(),
  audioStopCalibrationPreview: vi.fn(),
  audioStopAll: vi.fn(),
  audioDispose: vi.fn(),
  audioTriggerCue: vi.fn(),
  audioTriggerTone: vi.fn()
}));

vi.mock("../../src/lib/settingsStore", () => ({
  loadInstrumentSettings,
  saveInstrumentSettings
}));

vi.mock("../../src/lib/trackerBackend", () => ({
  createTrackerBackend,
  listVideoDevices
}));

vi.mock("../../src/lib/audioDevices", () => ({
  listAudioOutputDevices,
  supportsExplicitAudioOutputRouting
}));

vi.mock("../../src/lib/audioEngine", () => ({
  AudioEngine: class AudioEngine {
    start = audioStart;
    setPatch = audioSetPatch;
    setVolume = audioSetVolume;
    setOutputDevice = audioSetOutputDevice;
    syncMidiNotes = audioSyncMidiNotes;
    stopCalibrationPreview = audioStopCalibrationPreview;
    stopAll = audioStopAll;
    dispose = audioDispose;
    triggerCalibrationCue = audioTriggerCue;
    triggerCalibrationTone = audioTriggerTone;
    syncCalibrationPreviewNotes = vi.fn();
  }
}));

function createAudioContextStub(state: "running" | "suspended" = "running") {
  return class FakeAudioContext {
    state = state;
    currentTime = 0;
    destination = {};

    resume = vi.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });

    createGain() {
      return createGainNode();
    }

    createOscillator() {
      return createOscillatorNode();
    }
  };
}

function makeLandmarks(x = 0.5, y = 0.72, z = -0.02) {
  return Array.from({ length: 21 }, (_, index) => ({
    x: x + (index === 8 ? 0.01 : 0),
    y,
    z
  }));
}

function setCircleTipPosition(
  landmarks: ReturnType<typeof makeLandmarks>,
  tipIndex: CircleTipIndex,
  handedness: "Left" | "Right",
  segment: number,
  distanceRatio = 0.72
) {
  const layout = getCircleLayout(handedness);
  const angle = (segment * Math.PI * 2) / 7;
  const distance = layout.radiusY * distanceRatio;
  landmarks[tipIndex] = {
    x: layout.center.x + (Math.sin(angle) * distance) / layout.aspectRatio,
    y: layout.center.y - Math.cos(angle) * distance,
    z: -0.02
  };
}

type CircleTipIndex = 4 | 8 | 12 | 16 | 20;

function makeCircleHand(
  handedness: "Left" | "Right",
  segments: Partial<Record<CircleTipIndex, number>>
) {
  const layout = getCircleLayout(handedness);
  const landmarks = makeLandmarks(layout.center.x, layout.center.y, -0.02);
  for (const [tipIndex, segment] of Object.entries(segments)) {
    setCircleTipPosition(landmarks, Number(tipIndex) as CircleTipIndex, handedness, segment);
  }

  return makeHand(handedness, { landmarks });
}

function makeHand(
  handedness: "Left" | "Right" = "Right",
  overrides: Partial<TrackedHand> = {}
): TrackedHand {
  return {
    id: `${handedness}-0`,
    handedness,
    confidence: 0.96,
    landmarks: makeLandmarks(),
    ...overrides
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve());
  });
}

function createGainNode() {
  return {
    gain: { value: 0 },
    connect: vi.fn().mockReturnThis()
  };
}

function createOscillatorNode() {
  return {
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn()
  };
}

describe("useGestureInstrument", () => {
  let trackerBackend: HandTrackerBackend;
  let trackerFrameHandler: ((frame: TrackerFrame) => void) | null;
  let trackerInitialize: ReturnType<typeof vi.fn>;
  let trackerAttachCamera: ReturnType<typeof vi.fn>;
  let trackerStart: ReturnType<typeof vi.fn>;
  let trackerStop: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    trackerFrameHandler = null;
    const mediaStream = {
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream;
    trackerInitialize = vi.fn().mockResolvedValue(undefined);
    trackerAttachCamera = vi.fn().mockResolvedValue(mediaStream);
    trackerStart = vi.fn((_: HTMLVideoElement, onFrame: (frame: TrackerFrame) => void) => {
      trackerFrameHandler = onFrame;
    });
    trackerStop = vi.fn();
    trackerBackend = {
      kind: "mediapipe-hands",
      initialize: trackerInitialize,
      attachCamera: trackerAttachCamera,
      start: trackerStart,
      stop: trackerStop
    };

    loadInstrumentSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      playMode: "circle",
      synthPatch: "soft-keys"
    });
    saveInstrumentSettings.mockResolvedValue(undefined);
    createTrackerBackend.mockResolvedValue(trackerBackend);
    listVideoDevices.mockResolvedValue([
      { deviceId: "cam-1", kind: "videoinput", groupId: "", label: "FaceTime" },
      { deviceId: "cam-2", kind: "videoinput", groupId: "", label: "External Camera" }
    ]);
    listAudioOutputDevices.mockResolvedValue([
      { deviceId: "spk-1", kind: "audiooutput", groupId: "", label: "Headphones" }
    ]);
    supportsExplicitAudioOutputRouting.mockReturnValue(true);
    audioStart.mockResolvedValue(true);
    audioSetPatch.mockResolvedValue(undefined);
    audioSetVolume.mockResolvedValue(undefined);
    audioSetOutputDevice.mockResolvedValue(true);
    audioSyncMidiNotes.mockResolvedValue(undefined);
    audioStopCalibrationPreview.mockResolvedValue(undefined);
    audioStopAll.mockResolvedValue(undefined);
    audioDispose.mockResolvedValue(undefined);
    audioTriggerCue.mockResolvedValue(undefined);
    audioTriggerTone.mockResolvedValue(undefined);

    vi.stubGlobal("AudioContext", createAudioContextStub());
    vi.stubGlobal("performance", {
      now: vi.fn(() => 1_000)
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hydrates settings, starts tracking, and derives touch calibration from live frames", async () => {
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));
    act(() => {
      result.current.updateSettings({ playMode: "piano" });
    });

    await act(async () => {
      await result.current.startTracking();
    });

    expect(createTrackerBackend).toHaveBeenCalledWith("mediapipe-hands");
    expect(trackerInitialize).toHaveBeenCalled();
    expect(trackerAttachCamera).toHaveBeenCalled();
    expect(trackerStart).toHaveBeenCalled();

    act(() => {
      trackerFrameHandler?.({
        timestamp: 1_200,
        fps: 30,
        latencyMs: 5,
        hands: [makeHand("Right")]
      });
    });

    expect(result.current.state.debug.visibleHands).toBe(1);
    expect(result.current.state.debug.rightHand?.id).toBe("Right-0");

    act(() => {
      result.current.setFingerHoverCalibration("index", "Right");
      result.current.setFingerPressCalibration("index", "Right");
      result.current.calibrateDepthGate("Right");
      result.current.calibrateFingerSensitivity("Right");
      result.current.calibrateSingleFingerSensitivity("index", "Right");
    });

    expect(result.current.state.settings.touchCalibration.Right.index.hoverDepth).not.toBeNull();
    expect(result.current.state.settings.touchCalibration.Right.index.pressDepth).not.toBeNull();
    expect(result.current.state.settings.depthGate.Right).not.toBe(DEFAULT_SETTINGS.depthGate.Right);
  });

  it("arms audio, reroutes settings live, and saves settings after debounce", async () => {
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));
    vi.useFakeTimers();

    await act(async () => {
      await result.current.armAudio();
    });

    expect(audioStart).toHaveBeenCalled();
    expect(result.current.state.audioStatus).toBe("armed");

    act(() => {
      result.current.updateSettings({
        synthPatch: "warm-pad",
        volume: -6,
        audioOutputDeviceId: "spk-1",
        playMode: "piano"
      });
    });

    expect(audioSetPatch).toHaveBeenCalledWith("warm-pad");
    expect(audioSetVolume).toHaveBeenCalledWith(-6);
    expect(audioSetOutputDevice).toHaveBeenCalledWith("spk-1");
    expect(audioSyncMidiNotes).toHaveBeenCalledWith([]);
    expect(audioStopCalibrationPreview).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
      await flushPromises();
    });

    expect(saveInstrumentSettings).toHaveBeenCalled();
  });

  it("shows an audio-output fallback notice when explicit routing cannot be applied", async () => {
    audioSetOutputDevice.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    await act(async () => {
      await result.current.armAudio();
    });

    act(() => {
      result.current.updateSettings({ audioOutputDeviceId: "spk-1" });
    });

    await waitFor(() => {
      expect(result.current.state.audioOutputNotice).toMatch(/browser default output/i);
    });
  });

  it("enters blocked audio state when autoplay unlock fails", async () => {
    vi.stubGlobal("AudioContext", createAudioContextStub("suspended"));
    audioStart.mockReset();

    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    const BlockedAudioContext = class {
      state = "suspended" as const;
      currentTime = 0;
      destination = {};
      resume = vi.fn(() => Promise.resolve());
      createGain() {
        return createGainNode();
      }
      createOscillator() {
        return createOscillatorNode();
      }
    };
    vi.stubGlobal("AudioContext", BlockedAudioContext);

    await act(async () => {
      await result.current.armAudio();
    });

    expect(result.current.state.audioStatus).toBe("blocked");
    expect(result.current.state.startupNotice).toMatch(/autoplay/i);
    expect(audioStart).not.toHaveBeenCalled();
  });

  it("runs calibration flow actions and restores idle state on cancel", async () => {
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));
    await act(async () => {
      await result.current.armAudio();
    });

    act(() => {
      result.current.startPlayingFeelCalibration("Left");
    });

    expect(result.current.state.calibrationSession.active).toBe(true);
    expect(result.current.state.currentChordLabel).toBe("Calibrating");

    act(() => {
      result.current.acceptPlayingFeelCalibrationStep();
      result.current.retryPlayingFeelCalibrationStep();
      result.current.skipPlayingFeelCalibrationStep();
      result.current.cancelPlayingFeelCalibrationFlow();
    });

    expect(result.current.state.calibrationSession.active).toBe(false);
    expect(result.current.state.currentChordLabel).toBe("Waiting for touch");

    act(() => {
      result.current.stopTracking();
    });

    expect(trackerStop).toHaveBeenCalled();
    expect(audioStopAll).toHaveBeenCalled();
    expect(result.current.state.trackerStatus).toBe("idle");
  });

  it("does not start tracking before a video element is attached", async () => {
    const { result } = renderHook(() => useGestureInstrument());

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    await act(async () => {
      await result.current.startTracking();
    });

    expect(createTrackerBackend).not.toHaveBeenCalled();
    expect(result.current.state.trackerStatus).toBe("idle");
  });

  it("restarts tracking when the selected camera changes live", async () => {
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    await act(async () => {
      await result.current.startTracking();
    });

    expect(trackerAttachCamera).toHaveBeenNthCalledWith(
      1,
      result.current.videoRef.current,
      ""
    );

    act(() => {
      result.current.updateSettings({ deviceId: "cam-2" });
    });

    await waitFor(() => expect(createTrackerBackend).toHaveBeenCalledTimes(2));
    expect(trackerStop).toHaveBeenCalled();
    expect(trackerAttachCamera).toHaveBeenNthCalledWith(
      2,
      result.current.videoRef.current,
      "cam-2"
    );
  });

  it("falls back to empty device lists when device refresh fails", async () => {
    listVideoDevices.mockRejectedValueOnce(new Error("devices unavailable"));
    listAudioOutputDevices.mockRejectedValueOnce(new Error("outputs unavailable"));

    const { result } = renderHook(() => useGestureInstrument());

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    expect(result.current.state.devices).toEqual([]);
    expect(result.current.state.audioOutputDevices).toEqual([]);
  });

  it("projects live circle-mode touches into active segments and labels", async () => {
    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));
    await act(async () => {
      await result.current.startTracking();
    });

    act(() => {
      trackerFrameHandler?.({
        timestamp: 1_500,
        fps: 30,
        latencyMs: 5,
        hands: [makeCircleHand("Right", { 8: 0 })]
      });
    });

    expect(result.current.state.currentModeLabel).toBe("Circle");
    expect(result.current.state.currentChordLabel).toContain("C");
    expect(result.current.state.currentRootLabel).toContain("C");
    expect(result.current.state.activeCircleSegments.Right).toEqual([0]);
    expect(result.current.state.activeCircleMarkers).toEqual([
      expect.objectContaining({
        stableHandedness: "Right",
        finger: "index",
        segment: 0,
        rootMidi: 60,
        chordMode: "single"
      })
    ]);
  });

  it("responds to calibration keyboard shortcuts and exports logs", async () => {
    const createObjectUrl = vi.fn(() => "blob:test");
    const revokeObjectUrl = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl
    });

    const { result } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));

    act(() => {
      result.current.startPlayingFeelCalibration("Left");
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(result.current.state.calibrationSession.phase).toBe("capture-hover");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    });
    expect(result.current.state.calibrationSession.targetFinger).toBe("index");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.state.calibrationSession.active).toBe(false);

    act(() => {
      result.current.exportLogs();
    });

    expect(createObjectUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test");
  });

  it("cleans up pending saves, tracker state, and audio resources on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const { result, unmount } = renderHook(() => useGestureInstrument());
    result.current.videoRef.current = document.createElement("video");

    await waitFor(() => expect(result.current.state.settings.playMode).toBe("circle"));
    await act(async () => {
      await result.current.startTracking();
      await result.current.armAudio();
    });
    vi.useFakeTimers();

    act(() => {
      result.current.updateSettings({ volume: -4 });
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(trackerStop).toHaveBeenCalled();
    expect(audioDispose).toHaveBeenCalled();
  });
});
