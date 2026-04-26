import { AudioEngine } from "../../src/lib/audioEngine";

const toneNow = vi.fn(() => 42);
const toneStart = vi.fn().mockResolvedValue(undefined);
const toneSetContext = vi.fn();
const toneDestination = { destination: true };
const volumeConnect = vi.fn();
const volumeDisconnect = vi.fn();
const volumeDispose = vi.fn();
const volumeRampTo = vi.fn();
const synthSet = vi.fn();
const synthDispose = vi.fn();
const synthReleaseAll = vi.fn();
const synthTriggerAttack = vi.fn();
const synthTriggerRelease = vi.fn();
const synthTriggerAttackRelease = vi.fn();

class MockVolume {
  volume = {
    value: 0,
    rampTo: volumeRampTo
  };

  connect = volumeConnect;
  disconnect = volumeDisconnect;
  dispose = volumeDispose;
}

class MockPolySynth {
  connect = vi.fn(() => this);
  set = synthSet;
  dispose = synthDispose;
  releaseAll = synthReleaseAll;
  triggerAttack = synthTriggerAttack;
  triggerRelease = synthTriggerRelease;
  triggerAttackRelease = synthTriggerAttackRelease;
}

const createMediaStreamDestination = vi.fn(() => ({ stream: { id: "stream" } }));
const toneGetContext = vi.fn(() => ({
  rawContext: {
    createMediaStreamDestination
  }
}));
const toneModule = {
  Volume: MockVolume,
  PolySynth: MockPolySynth,
  Synth: class MockSynth {},
  start: toneStart,
  now: toneNow,
  setContext: toneSetContext,
  getDestination: vi.fn(() => toneDestination),
  getContext: toneGetContext
};

vi.mock("tone", () => toneModule);

describe("AudioEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts Tone, resumes the unlocked context, and routes to the default output", async () => {
    const engine = new AudioEngine();
    const resume = vi.fn().mockResolvedValue(undefined);
    const unlockedContext = {
      state: "suspended",
      resume
    } as unknown as AudioContext;

    await expect(engine.start("soft-keys", -8, "", unlockedContext)).resolves.toBe(true);

    expect(resume).toHaveBeenCalled();
    expect(toneSetContext).toHaveBeenCalledWith(unlockedContext, true);
    expect(toneStart).toHaveBeenCalled();
    expect(volumeConnect).toHaveBeenCalledWith(toneDestination);
    expect(synthSet).toHaveBeenCalled();
  });

  it("routes to an explicit sink when supported", async () => {
    const engine = new AudioEngine();
    const sinkElement = {
      autoplay: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      setSinkId: vi.fn().mockResolvedValue(undefined),
      srcObject: null
    };
    vi.spyOn(document, "createElement").mockReturnValue(sinkElement as unknown as HTMLAudioElement);

    await engine.start("soft-keys", -10);

    await expect(engine.setOutputDevice("bluetooth")).resolves.toBe(true);
    expect(sinkElement.setSinkId).toHaveBeenCalledWith("bluetooth");
    expect(sinkElement.play).toHaveBeenCalled();
    expect(engine.getOutputDeviceId()).toBe("bluetooth");
  });

  it("falls back cleanly when explicit sink routing fails", async () => {
    const engine = new AudioEngine();
    const sinkElement = {
      autoplay: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      setSinkId: vi.fn().mockRejectedValue(new Error("no route")),
      srcObject: null
    };
    vi.spyOn(document, "createElement").mockReturnValue(sinkElement as unknown as HTMLAudioElement);

    await engine.start("soft-keys", -10);

    await expect(engine.setOutputDevice("bluetooth")).resolves.toBe(false);
    expect(volumeConnect).toHaveBeenCalledWith(toneDestination);
    expect(engine.getOutputDeviceId()).toBe("");
  });

  it("syncs active notes and calibration preview notes", async () => {
    const engine = new AudioEngine();
    await engine.start("soft-keys", -10);

    engine.syncMidiNotes([64, 60, 64]);
    expect(synthTriggerAttack).toHaveBeenCalled();

    engine.syncMidiNotes([]);
    expect(synthReleaseAll).toHaveBeenCalled();

    engine.syncCalibrationPreviewNotes([72, 76]);
    expect(synthTriggerAttack).toHaveBeenCalled();

    engine.stopCalibrationPreview();
    expect(synthTriggerRelease).toHaveBeenCalled();
  });

  it("handles calibration cues, patch changes, volume changes, and disposal", async () => {
    const engine = new AudioEngine();
    const sinkElement = {
      autoplay: false,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      setSinkId: vi.fn().mockResolvedValue(undefined),
      srcObject: null
    };
    vi.spyOn(document, "createElement").mockReturnValue(sinkElement as unknown as HTMLAudioElement);

    await engine.start("soft-keys", -10, "speaker");
    engine.setPatch("warm-pad");
    engine.setVolume(-6);
    engine.triggerCalibrationCue("success");
    engine.triggerCalibrationTone(72);
    engine.handle({ kind: "play", rootIndex: 0, mode: "major" }, true);
    engine.handle({ kind: "stop", rootIndex: null, mode: "single" }, false);
    engine.dispose();

    expect(volumeRampTo).toHaveBeenCalledWith(-6, 0.05);
    expect(synthTriggerAttackRelease).toHaveBeenCalled();
    expect(sinkElement.pause).toHaveBeenCalled();
    expect(synthDispose).toHaveBeenCalled();
    expect(volumeDispose).toHaveBeenCalled();
  });
});
