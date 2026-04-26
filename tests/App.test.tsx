/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InstrumentViewState } from "../src/hooks/useGestureInstrument";
import App from "../src/App";
import * as stageRendering from "../src/components/stageRendering";
import { makeViewState } from "./support/viewState";

const mockUseGestureInstrument = vi.fn<
  () => ReturnType<typeof createHookResult>
>();

vi.mock("../src/hooks/useGestureInstrument", () => ({
  useGestureInstrument: () => mockUseGestureInstrument()
}));

function createHookResult(state: InstrumentViewState = makeViewState()) {
  return {
    videoRef: { current: null },
    state,
    calibrateFingerSensitivity: vi.fn(),
    calibrateDepthGate: vi.fn(),
    exportLogs: vi.fn(),
    setFingerHoverCalibration: vi.fn(),
    setFingerPressCalibration: vi.fn(),
    startPlayingFeelCalibration: vi.fn(),
    acceptPlayingFeelCalibrationStep: vi.fn(),
    retryPlayingFeelCalibrationStep: vi.fn(),
    skipPlayingFeelCalibrationStep: vi.fn(),
    cancelPlayingFeelCalibrationFlow: vi.fn(),
    startTracking: vi.fn().mockResolvedValue(undefined),
    stopTracking: vi.fn(),
    armAudio: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn()
  };
}

describe("App", () => {
  it("wires top-bar actions through the hook callbacks", async () => {
    const user = userEvent.setup();
    const hookResult = createHookResult(
      makeViewState({ trackerStatus: "idle" }, { showDebugOverlays: false, playMode: "piano" })
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    await user.selectOptions(screen.getByLabelText("Play mode"), "circle");
    expect(hookResult.updateSettings).toHaveBeenCalledWith({ playMode: "circle" });

    await user.click(screen.getByRole("button", { name: "Click to enable audio" }));
    expect(hookResult.armAudio).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Enable Camera" }));
    expect(hookResult.startTracking).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Calibrate Feel" }));
    expect(hookResult.startPlayingFeelCalibration).toHaveBeenCalledWith("Both");

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(hookResult.stopTracking).toHaveBeenCalled();
  });

  it("builds circle-mode setting patches from the control panel", async () => {
    const user = userEvent.setup();
    const hookResult = createHookResult(
      makeViewState({}, { playMode: "circle", showDebugOverlays: false })
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    await user.click(screen.getAllByLabelText("Circle of fifths")[0]);
    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        circleOfFifths: expect.objectContaining({ Left: true })
      })
    );

    await user.click(screen.getAllByLabelText("Thumb")[1]);
    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        circleFingerEnabled: expect.objectContaining({
          Left: expect.objectContaining({ thumb: false })
        })
      })
    );

    const circleSection = screen.getByText("Circle Mode").closest("section");
    if (!circleSection) {
      throw new Error("Circle section not found");
    }
    const octaveInputs = within(circleSection).getAllByRole("spinbutton");
    fireEvent.change(octaveInputs[1], { target: { value: "5" } });
    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        circleNoteOctaves: expect.objectContaining({
          Left: expect.objectContaining({ C: 5 })
        })
      })
    );

    fireEvent.change(octaveInputs[0], { target: { value: "NaN" } });
    expect(hookResult.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({
        circleNoteOctaves: expect.objectContaining({
          Left: expect.objectContaining({ "Open-hand octave shift": expect.anything() })
        })
      })
    );

    fireEvent.change(octaveInputs[0], { target: { value: "9" } });
    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        circleOpenOctaveShift: expect.objectContaining({ Left: 2 })
      })
    );
  });

  it("builds activation tuning patches for the selected calibration hand", () => {
    const hookResult = createHookResult(
      makeViewState(
        {
          trackerStatus: "ready"
        },
        { showDebugOverlays: false, playMode: "piano" }
      )
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    const touchSection = screen.getByText("Touch Tuning").closest("section");
    if (!touchSection) {
      throw new Error("Touch section not found");
    }
    const dwellInput = within(touchSection).getAllByRole("spinbutton")[1];
    fireEvent.change(dwellInput, { target: { value: "24" } });

    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        touchDwellMs: expect.objectContaining({ Right: 24 }),
        activationTuning: expect.objectContaining({
          Right: expect.objectContaining({
            thumb: expect.objectContaining({ touchDwellMs: 24 }),
            pinky: expect.objectContaining({ touchDwellMs: 24 })
          })
        })
      })
    );
  });

  it("renders active calibration controls and wires overlay actions", async () => {
    const user = userEvent.setup();
    const hookResult = createHookResult(
      makeViewState(
        {
          trackerStatus: "ready",
          calibrationSession: {
            ...makeViewState().calibrationSession,
            active: true,
            phase: "finger-summary",
            targetHand: "Left",
            targetFinger: "thumb",
            controlHand: "Right",
            guidance: "Hold steady",
            captureStatus: "2 taps captured",
            targetKey: "white:0",
            qualityScore: 0.72,
            progress: 0.5,
            command: {
              command: "accept",
              progress: 0.64,
              rawGesture: "loose fist",
              insideControlZone: true
            }
          }
        },
        { playMode: "piano", showDebugOverlays: false }
      )
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    expect(screen.getByText("Camera live")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next Finger" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redo Finger" })).toBeTruthy();
    expect(screen.getByText("loose fist detected")).toBeTruthy();
    expect(screen.getByText("accept")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next Finger" }));
    expect(hookResult.acceptPlayingFeelCalibrationStep).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Redo Finger" }));
    expect(hookResult.retryPlayingFeelCalibrationStep).toHaveBeenCalled();

    const calibrationOverlay = screen.getByText("Playing Feel").closest(".calibration-overlay");
    expect(calibrationOverlay).toBeTruthy();
    await user.click(within(calibrationOverlay as HTMLElement).getByRole("button", { name: "Cancel" }));
    expect(hookResult.cancelPlayingFeelCalibrationFlow).toHaveBeenCalled();
  });

  it("shows paused calibration state in the overlay", () => {
    const hookResult = createHookResult(
      makeViewState(
        {
          calibrationSession: {
            ...makeViewState().calibrationSession,
            active: true,
            phase: "paused",
            command: {
              command: "none",
              progress: 0.25,
              rawGesture: "none",
              insideControlZone: false
            }
          }
        },
        { playMode: "circle", showDebugOverlays: false }
      )
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(screen.getByText("Move control hand into the control zone")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    const calibrationSelect = screen.getByRole("combobox", { name: "Calibration" });
    expect(calibrationSelect.disabled).toBe(true);
  });

  it("propagates calibration scope changes before starting calibration", async () => {
    const user = userEvent.setup();
    const hookResult = createHookResult(
      makeViewState({}, { playMode: "circle", showDebugOverlays: false })
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    await user.selectOptions(screen.getByLabelText("Calibration"), "Left");
    await user.click(screen.getByRole("button", { name: "Calibrate Feel" }));

    expect(hookResult.startPlayingFeelCalibration).toHaveBeenCalledWith("Left");
  });

  it("updates per-finger activation tuning through the real app wiring", async () => {
    const user = userEvent.setup();
    const hookResult = createHookResult(
      makeViewState({ trackerStatus: "ready" }, { playMode: "piano", showDebugOverlays: true })
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    await user.click(screen.getByText("Advanced per-finger activation tuning"));
    const advancedTuning = document.querySelector(".advanced-tuning");
    expect(advancedTuning).toBeTruthy();
    const thumbCard = within(advancedTuning as HTMLElement)
      .getByText("Thumb")
      .closest(".advanced-finger-card");
    expect(thumbCard).toBeTruthy();
    const thumbSpinbuttons = within(thumbCard as HTMLElement).getAllByRole("spinbutton");
    fireEvent.change(thumbSpinbuttons[0], { target: { value: "0.61" } });

    expect(hookResult.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        activationTuning: expect.objectContaining({
          Right: expect.objectContaining({
            thumb: expect.objectContaining({ pressActivationThreshold: 0.61 })
          })
        })
      })
    );
  });

  it("draws overlay traces and hand paths when debug overlays are visible", () => {
    const drawHandPathSpy = vi.spyOn(stageRendering, "drawHandPath");
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
      fillStyle: ""
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );

    const hookResult = createHookResult(
      makeViewState(
        {
          noteTrace: [{ x: 0.2, y: 0.4 }],
          overlayHands: [
            {
              role: "note",
              hand: {
                id: "Right-0",
                handedness: "Right",
                confidence: 0.95,
                landmarks: Array.from({ length: 21 }, (_, index) => ({
                  x: 0.2 + index * 0.01,
                  y: 0.3,
                  z: 0
                }))
              }
            }
          ],
          activeTouchMarkers: [
            { handId: "Right-0", x: 0.3, y: 0.6, color: "#fff", label: "C4" }
          ]
        },
        { showDebugOverlays: true, playMode: "piano" }
      )
    );
    mockUseGestureInstrument.mockReturnValue(hookResult);

    render(<App />);

    expect(context.arc).toHaveBeenCalled();
    expect(drawHandPathSpy).toHaveBeenCalled();
  });
});
