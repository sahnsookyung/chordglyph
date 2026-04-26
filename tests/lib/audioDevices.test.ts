import { listAudioOutputDevices, supportsExplicitAudioOutputRouting } from "../../src/lib/audioDevices";

describe("audioDevices", () => {
  it("detects explicit sink routing support", () => {
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: vi.fn()
    });

    expect(supportsExplicitAudioOutputRouting()).toBe(true);

    Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
    expect(supportsExplicitAudioOutputRouting()).toBe(false);
  });

  it("lists only audio output devices", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "mic" },
          { kind: "audiooutput", deviceId: "speaker" },
          { kind: "videoinput", deviceId: "cam" }
        ])
      }
    });

    await expect(listAudioOutputDevices()).resolves.toEqual([
      expect.objectContaining({ kind: "audiooutput", deviceId: "speaker" })
    ]);
  });
});
