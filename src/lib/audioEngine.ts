import * as Tone from "tone";
import { buildVoicing, midiToNoteName } from "./music";
import type { AudioEvent, SynthPatch } from "./types";

type SinkSelectableAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

const PATCHES = {
  "soft-keys": {
    oscillator: {
      type: "triangle"
    },
    envelope: {
      attack: 0.01,
      decay: 0.15,
      sustain: 0.25,
      release: 0.35
    }
  },
  "warm-pad": {
    oscillator: {
      type: "sine"
    },
    envelope: {
      attack: 0.03,
      decay: 0.22,
      sustain: 0.4,
      release: 0.6
    }
  }
} as const;

export class AudioEngine {
  private synth: Tone.PolySynth | null = null;
  private currentNotes: string[] = [];
  private calibrationPreviewNotes: string[] = [];
  private currentPatch: SynthPatch = "soft-keys";
  private volume: Tone.Volume | null = null;
  private volumeDb = -10;
  private currentOutputDeviceId = "";
  private explicitOutputElement: SinkSelectableAudioElement | null = null;
  private explicitOutputDestination: MediaStreamAudioDestinationNode | null = null;
  private explicitRoutingActive = false;

  async start(
    patch: SynthPatch,
    gainDb: number,
    outputDeviceId = "",
    unlockedContext: AudioContext | null = null
  ): Promise<boolean> {
    if (unlockedContext) {
      Tone.setContext(unlockedContext, true);
    }

    if (unlockedContext?.state === "suspended") {
      await unlockedContext.resume();
    }

    await Tone.start();
    this.volumeDb = gainDb;
    this.getVolume().volume.value = gainDb;
    this.setPatch(patch);

    try {
      return await this.setOutputDevice(outputDeviceId);
    } catch {
      try {
        this.routeToDefaultOutput();
      } catch {
        // Tone is already started; report routing failure without blocking audio arming state.
      }
      this.currentOutputDeviceId = "";
      return false;
    }
  }

  setPatch(patch: SynthPatch): void {
    this.currentPatch = patch;
    this.synth?.dispose();
    this.currentNotes = [];
    this.calibrationPreviewNotes = [];
    this.synth = new Tone.PolySynth(Tone.Synth).connect(this.getVolume());
    this.synth.set(PATCHES[patch] as never);
  }

  setVolume(gainDb: number): void {
    this.volumeDb = gainDb;
    this.volume?.volume.rampTo(gainDb, 0.05);
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    if (!deviceId) {
      this.routeToDefaultOutput();
      this.currentOutputDeviceId = "";
      return true;
    }

    const sinkElement = this.getExplicitOutputElement();
    if (!sinkElement?.setSinkId) {
      this.routeToDefaultOutput();
      this.currentOutputDeviceId = "";
      return false;
    }

    try {
      await sinkElement.setSinkId(deviceId);
      this.routeToExplicitOutput();
      await sinkElement.play();
      this.currentOutputDeviceId = deviceId;
      return true;
    } catch {
      try {
        this.routeToDefaultOutput();
      } catch {
        // Keep startup alive even if the browser refuses to rewire output devices.
      }
      this.currentOutputDeviceId = "";
      return false;
    }
  }

  getOutputDeviceId(): string {
    return this.currentOutputDeviceId;
  }

  handle(event: AudioEvent, legato: boolean): void {
    if (!this.synth) {
      return;
    }

    if (event.kind === "stop" || event.rootIndex === null) {
      this.stopAll();
      return;
    }

    const notes = buildVoicing(event.rootIndex, event.mode).map(midiToNoteName);
    if (!legato) {
      this.stopAll();
    }

    if (legato && this.currentNotes.length > 0) {
      this.synth.releaseAll(Tone.now() + 0.02);
    }

    this.synth.triggerAttack(notes, Tone.now());
    this.currentNotes = notes;
  }

  syncMidiNotes(midiNotes: number[]): void {
    if (!this.synth) {
      return;
    }

    const nextNotes = [...new Set(midiNotes)]
      .sort((left, right) => left - right)
      .map(midiToNoteName);

    const toRelease = this.currentNotes.filter((note) => !nextNotes.includes(note));
    const toAttack = nextNotes.filter((note) => !this.currentNotes.includes(note));

    if (toRelease.length > 0) {
      this.synth.triggerRelease(toRelease, Tone.now());
    }

    if (toAttack.length > 0) {
      this.synth.triggerAttack(toAttack, Tone.now());
    }

    if (nextNotes.length === 0 && this.currentNotes.length > 0) {
      this.synth.releaseAll();
    }

    this.currentNotes = nextNotes;
  }

  syncCalibrationPreviewNotes(midiNotes: number[], velocity = 0.24): void {
    if (!this.synth) {
      return;
    }

    const nextNotes = [...new Set(midiNotes)]
      .sort((left, right) => left - right)
      .map(midiToNoteName);

    const toRelease = this.calibrationPreviewNotes.filter((note) => !nextNotes.includes(note));
    const toAttack = nextNotes.filter((note) => !this.calibrationPreviewNotes.includes(note));

    if (toRelease.length > 0) {
      this.synth.triggerRelease(toRelease, Tone.now());
    }

    if (toAttack.length > 0) {
      this.synth.triggerAttack(toAttack, Tone.now(), velocity);
    }

    if (nextNotes.length === 0 && this.calibrationPreviewNotes.length > 0) {
      this.synth.triggerRelease(this.calibrationPreviewNotes, Tone.now());
    }

    this.calibrationPreviewNotes = nextNotes;
  }

  stopCalibrationPreview(): void {
    if (this.calibrationPreviewNotes.length === 0) {
      return;
    }

    this.synth?.triggerRelease(this.calibrationPreviewNotes, Tone.now());
    this.calibrationPreviewNotes = [];
  }

  triggerCalibrationTone(midiNote: number, duration = 0.12, velocity = 0.35): void {
    if (!this.synth) {
      return;
    }

    this.synth.triggerAttackRelease(midiToNoteName(midiNote), duration, Tone.now(), velocity);
  }

  triggerCalibrationCue(kind: "success" | "retry" | "complete" | "pause"): void {
    const cueMidi = kind === "retry" ? 67 : kind === "pause" ? 62 : kind === "complete" ? 84 : 76;
    const duration = kind === "complete" ? 0.18 : 0.1;
    this.triggerCalibrationTone(cueMidi, duration, kind === "retry" ? 0.24 : 0.3);
  }

  stopAll(): void {
    this.synth?.releaseAll();
    this.currentNotes = [];
    this.calibrationPreviewNotes = [];
  }

  dispose(): void {
    this.stopAll();
    this.explicitOutputElement?.pause();
    this.explicitOutputElement?.removeAttribute("src");
    this.explicitOutputElement && (this.explicitOutputElement.srcObject = null);
    this.synth?.dispose();
    this.volume?.dispose();
  }

  private getVolume(): Tone.Volume {
    if (!this.volume) {
      this.volume = new Tone.Volume(this.volumeDb);
    }

    return this.volume;
  }

  private getExplicitOutputElement(): SinkSelectableAudioElement | null {
    if (typeof document === "undefined") {
      return null;
    }

    if (!this.explicitOutputDestination) {
      const rawContext = Tone.getContext().rawContext;
      if (!("createMediaStreamDestination" in rawContext)) {
        return null;
      }

      this.explicitOutputDestination = rawContext.createMediaStreamDestination();
    }

    if (!this.explicitOutputElement) {
      const audioElement = document.createElement("audio") as SinkSelectableAudioElement;
      audioElement.autoplay = true;
      audioElement.srcObject = this.explicitOutputDestination.stream;
      this.explicitOutputElement = audioElement;
    }

    return this.explicitOutputElement;
  }

  private routeToDefaultOutput(): void {
    this.disconnectOutputs();
    this.explicitOutputElement?.pause();
    this.getVolume().connect(Tone.getDestination());
    this.explicitRoutingActive = false;
  }

  private routeToExplicitOutput(): void {
    const sinkElement = this.getExplicitOutputElement();
    const destination = this.explicitOutputDestination;
    if (!sinkElement || !destination) {
      this.routeToDefaultOutput();
      return;
    }

    this.disconnectOutputs();
    this.getVolume().connect(destination);
    this.explicitRoutingActive = true;
  }

  private disconnectOutputs(): void {
    try {
      this.volume?.disconnect();
    } catch {
      // Tone throws if disconnecting before the node has any live outputs.
    }
  }
}
