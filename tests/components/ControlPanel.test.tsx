import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ControlPanel } from "../../src/components/ControlPanel";
import { makeViewState } from "../support/viewState";

function buildPanelProps(overrides = {}) {
  const state = makeViewState(
    {
      trackerStatus: "ready",
      logCount: 4,
      devices: [{ deviceId: "cam-1", kind: "videoinput", groupId: "", label: "FaceTime" } as MediaDeviceInfo],
      audioOutputDevices: [{ deviceId: "spk-1", kind: "audiooutput", groupId: "", label: "Headphones" } as MediaDeviceInfo],
      audioOutputRoutingSupported: true,
      debug: {
        ...makeViewState().debug,
        visibleHands: 2,
        leftHand: { id: "L", handedness: "Left", confidence: 0.9, avgX: 0.2 },
        rightHand: { id: "R", handedness: "Right", confidence: 0.9, avgX: 0.8 },
        fingerDepthSamplesFresh: {
          Left: { thumb: true, index: true, middle: false, ring: false, pinky: false },
          Right: { thumb: false, index: false, middle: false, ring: false, pinky: false }
        }
      },
      ...overrides
    },
    { playMode: "circle", showDebugOverlays: true }
  );

  const props = {
    state,
    calibrationHand: "Left" as const,
    guidedCalibrationIndex: null,
    guidedActivationPhase: "hover" as const,
    pianoVerticalBounds: { min: 0, max: 1 },
    onCalibrationHandChange: vi.fn(),
    onGuidedCalibrationIndexChange: vi.fn(),
    onGuidedActivationPhaseChange: vi.fn(),
    onUpdateSettings: vi.fn(),
    onUpdateHandActivationTuning: vi.fn(),
    onUpdateFingerActivationTuning: vi.fn(),
    onUpdateCircleFingerEnabled: vi.fn(),
    onUpdateCircleOfFifths: vi.fn(),
    onUpdateCircleNoteOctave: vi.fn(),
    onUpdateCircleOpenOctaveShift: vi.fn(),
    onCalibrateFingerSensitivity: vi.fn(),
    onSetFingerHoverCalibration: vi.fn(),
    onSetFingerPressCalibration: vi.fn(),
    onCalibrateDepthGate: vi.fn(),
    onExportLogs: vi.fn()
  };

  return props;
}

function renderPanel(overrides = {}) {
  const props = buildPanelProps(overrides);
  render(<ControlPanel {...props} />);
  return props;
}

describe("ControlPanel", () => {
  it("renders circle mode controls and debug panels", () => {
    renderPanel();

    expect(screen.getByText("Touch Tuning")).toBeTruthy();
    expect(screen.getByText("Circle Mode")).toBeTruthy();
    expect(screen.getByText("Debug")).toBeTruthy();
    expect(screen.getByText("Export Session Log (4)")).toBeTruthy();
  });

  it("dispatches circle and settings updates through the provided callbacks", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getAllByLabelText("Circle of fifths")[0]);
    expect(props.onUpdateCircleOfFifths).toHaveBeenCalled();

    await user.click(screen.getAllByLabelText("Thumb")[1]);
    expect(props.onUpdateCircleFingerEnabled).toHaveBeenCalled();

    const circleSection = screen.getByText("Circle Mode").closest("section");
    expect(circleSection).toBeTruthy();
    const octaveInputs = within(circleSection as HTMLElement).getAllByRole("spinbutton");
    fireEvent.change(octaveInputs[1], { target: { value: "5" } });
    expect(props.onUpdateCircleNoteOctave).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Export Session Log/ }));
    expect(props.onExportLogs).toHaveBeenCalled();
  });

  it("shows guided calibration actions for a selected finger", async () => {
    const user = userEvent.setup();
    const props = buildPanelProps({
      debug: {
        ...makeViewState().debug,
        fingerDepthSamplesFresh: {
          Left: { thumb: true, index: true, middle: false, ring: false, pinky: false },
          Right: { thumb: false, index: false, middle: false, ring: false, pinky: false }
        }
      }
    });

    render(<ControlPanel {...props} guidedCalibrationIndex={0} guidedActivationPhase="hover" />);

    await user.click(screen.getAllByRole("button", { name: "Set Hover" })[0]);
    expect(props.onSetFingerHoverCalibration).toHaveBeenCalledWith("thumb", "Left");
    expect(props.onGuidedActivationPhaseChange).toHaveBeenCalledWith("press");
  });

  it("covers guided press, previous, cancel, and advanced per-finger tuning", async () => {
    const user = userEvent.setup();
    const props = buildPanelProps();

    render(<ControlPanel {...props} guidedCalibrationIndex={1} guidedActivationPhase="press" />);

    await user.click(screen.getAllByRole("button", { name: "Set Press" })[0]);
    expect(props.onSetFingerPressCalibration).toHaveBeenCalledWith("index", "Left");
    expect(props.onGuidedCalibrationIndexChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(props.onGuidedCalibrationIndexChange).toHaveBeenCalledWith(0);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onGuidedCalibrationIndexChange).toHaveBeenCalledWith(null);

    await user.click(screen.getByText("Advanced per-finger activation tuning"));
    const advancedTuning = document.querySelector(".advanced-tuning");
    expect(advancedTuning).toBeTruthy();
    const thumbCard = within(advancedTuning as HTMLElement)
      .getByText("Thumb")
      .closest(".advanced-finger-card");
    expect(thumbCard).toBeTruthy();
    const thumbSpinbuttons = within(thumbCard as HTMLElement).getAllByRole("spinbutton");
    fireEvent.change(thumbSpinbuttons[0], { target: { value: "0.63" } });
    expect(props.onUpdateFingerActivationTuning).toHaveBeenCalledWith(
      "thumb",
      expect.objectContaining({ pressActivationThreshold: 0.63 })
    );

    await user.click(screen.getByRole("button", { name: "Learn Left Sensitivity" }));
    expect(props.onCalibrateFingerSensitivity).toHaveBeenCalledWith("Left");
  });

  it("renders piano-mode settings, summary, and debug branches", async () => {
    const user = userEvent.setup();
    const summaryState = makeViewState(
      {
        trackerStatus: "idle",
        calibrationSession: {
          ...makeViewState().calibrationSession,
          phase: "complete",
          summaries: {
            Left: {
              thumb: { status: "Good", targetKey: "white:0", qualityScore: 0.8 },
              index: { status: "Weak", targetKey: null, qualityScore: 0.4 },
              middle: { status: "Skipped", targetKey: null, qualityScore: null },
              ring: { status: "Good", targetKey: "white:2", qualityScore: 0.7 },
              pinky: { status: "Good", targetKey: "white:3", qualityScore: 0.7 }
            },
            Right: {
              thumb: { status: "Good", targetKey: "white:0", qualityScore: 0.8 },
              index: { status: "Good", targetKey: "white:1", qualityScore: 0.7 },
              middle: { status: "Good", targetKey: "white:2", qualityScore: 0.7 },
              ring: { status: "Good", targetKey: "white:3", qualityScore: 0.7 },
              pinky: { status: "Good", targetKey: "white:4", qualityScore: 0.7 }
            }
          }
        }
      },
      { playMode: "piano", showDebugOverlays: false, audioOutputDeviceId: "" }
    );
    const props = buildPanelProps({ ...summaryState, trackerStatus: "idle" });
    props.state = summaryState;

    render(<ControlPanel {...props} />);

    expect(screen.queryByText("Circle Mode")).toBeNull();
    expect(screen.getByText("Calibration Summary")).toBeTruthy();
    expect(screen.getByText("Fingertips only")).toBeTruthy();
    expect(screen.queryByText("Debug")).toBeNull();

    const backendSelect = within(
      screen.getByText("Tracking backend").closest("label") as HTMLElement
    ).getByRole("combobox");
    await user.selectOptions(backendSelect, "mediapipe-hands-worker");
    expect(props.onUpdateSettings).toHaveBeenCalledWith({
      trackingBackend: "mediapipe-hands-worker"
    });

    const calibrationAudioSelect = within(
      screen.getByText("Calibration audio").closest("label") as HTMLElement
    ).getByRole("combobox");
    await user.selectOptions(calibrationAudioSelect, "cues");
    expect(props.onUpdateSettings).toHaveBeenCalledWith({
      calibrationAudioMode: "cues"
    });

    await user.click(screen.getByLabelText("Show hit boxes"));
    expect(props.onUpdateSettings).toHaveBeenLastCalledWith({ showHitBoxes: true });
  });

  it("updates general settings controls and the audio-output fallback branch", async () => {
    const user = userEvent.setup();
    const props = buildPanelProps();
    props.state = makeViewState(
      {
        audioOutputRoutingSupported: false,
        devices: [{ deviceId: "cam-1", kind: "videoinput", groupId: "", label: "Front Cam" } as MediaDeviceInfo]
      },
      { playMode: "piano", showDebugOverlays: true }
    );

    render(<ControlPanel {...props} />);

    await user.selectOptions(
      within(screen.getByText("Strip size").closest("label") as HTMLElement).getByRole("combobox"),
      "large"
    );
    await user.selectOptions(
      within(screen.getByText("Note labels").closest("label") as HTMLElement).getByRole("combobox"),
      "flats"
    );
    await user.selectOptions(
      within(screen.getByText("Synth patch").closest("label") as HTMLElement).getByRole("combobox"),
      "warm-pad"
    );
    await user.selectOptions(
      within(screen.getByText("Camera").closest("label") as HTMLElement).getByRole("combobox"),
      "cam-1"
    );
    await user.click(screen.getByLabelText("Debug overlays"));

    expect(props.onUpdateSettings).toHaveBeenCalledWith({ noteStripSize: "large" });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ labelStyle: "flats" });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ synthPatch: "warm-pad" });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ deviceId: "cam-1" });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ showDebugOverlays: false });
    expect(screen.getByText(/System default only in this browser/)).toBeTruthy();
  });

  it("covers touch-tuning start flow, bulk tuning, and supported audio routing", async () => {
    const user = userEvent.setup();
    const props = buildPanelProps();
    props.state = makeViewState(
      {
        trackerStatus: "ready",
        audioOutputRoutingSupported: true,
        audioOutputDevices: [
          { deviceId: "spk-1", kind: "audiooutput", groupId: "", label: "Headphones" } as MediaDeviceInfo
        ],
        debug: {
          ...makeViewState().debug,
          touchDepth: {
            Left: 0.01,
            Right: 0.02
          },
          fingerDepthSamplesFresh: {
            Left: { thumb: true, index: true, middle: true, ring: true, pinky: true },
            Right: { thumb: true, index: true, middle: true, ring: true, pinky: true }
          }
        }
      },
      { playMode: "piano", showDebugOverlays: true }
    );

    render(<ControlPanel {...props} />);

    await user.selectOptions(screen.getByLabelText("Calibration hand"), "Right");
    expect(props.onCalibrationHandChange).toHaveBeenCalledWith("Right");

    await user.click(screen.getByRole("button", { name: "Start Activation Calibration" }));
    expect(props.onGuidedActivationPhaseChange).toHaveBeenCalledWith("hover");
    expect(props.onGuidedCalibrationIndexChange).toHaveBeenCalledWith(0);

    const dwellLabel = screen.getByText("Left dwell ms").closest("label");
    expect(dwellLabel).toBeTruthy();
    const dwellInput = (dwellLabel as HTMLElement).querySelector('input[type="number"]');
    expect(dwellInput).toBeTruthy();
    fireEvent.change(dwellInput as HTMLInputElement, { target: { value: "18" } });
    const lastHandTuningCall = props.onUpdateHandActivationTuning.mock.calls.at(-1);
    expect(lastHandTuningCall?.[0]).toEqual({ touchDwellMs: 18 });
    expect(lastHandTuningCall?.[1]).toBeTruthy();
    const legacyPatch = lastHandTuningCall?.[1] as { touchDwellMs: Record<string, number> };
    expect(legacyPatch.touchDwellMs.Left).toBe(18);

    await user.click(screen.getByRole("button", { name: "Calibrate Left Hand Gate" }));
    expect(props.onCalibrateDepthGate).toHaveBeenCalledWith("Left");

    const audioOutputLabel = screen.getByText("Audio output").closest("label");
    expect(audioOutputLabel).toBeTruthy();
    await user.selectOptions(within(audioOutputLabel as HTMLElement).getByRole("combobox"), "spk-1");
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ audioOutputDeviceId: "spk-1" });

    await user.click(screen.getByLabelText("Low latency visuals"));
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ lowLatencyMode: true });
  });

  it("updates piano settings sliders, color, and stats toggles", () => {
    const props = buildPanelProps();
    props.state = makeViewState(
      {
        trackerStatus: "ready"
      },
      { playMode: "piano", showDebugOverlays: true }
    );

    render(<ControlPanel {...props} />);

    const setNumberControl = (label: string, value: string) => {
      const wrapper = screen.getByText(label).closest("label");
      expect(wrapper).toBeTruthy();
      const input = (wrapper as HTMLElement).querySelector('input[type="number"]');
      expect(input).toBeTruthy();
      fireEvent.change(input as HTMLInputElement, { target: { value } });
    };

    setNumberControl("Tracking sensitivity", "0.62");
    setNumberControl("Hand overlay thickness", "1.12");
    setNumberControl("Piano position", "0.18");
    setNumberControl("Key height", "1.5");
    setNumberControl("Key width", "1.1");
    setNumberControl("Octaves", "5");
    setNumberControl("Piano opacity", "0.72");
    setNumberControl("Volume", "-6");

    const colorLabel = screen.getByText("Hit box color").closest("label");
    expect(colorLabel).toBeTruthy();
    const colorInput = (colorLabel as HTMLElement).querySelector('input[type="color"]');
    expect(colorInput).toBeTruthy();
    fireEvent.change(colorInput as HTMLInputElement, { target: { value: "#ff0000" } });
    fireEvent.click(screen.getByLabelText("Fingertip stats"));

    expect(props.onUpdateSettings).toHaveBeenCalledWith({ trackingSensitivity: 0.62 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ overlayThickness: 1.12 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ pianoVerticalOffset: 0.18 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ pianoHeightScale: 1.5 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ pianoWidthScale: 1.1 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ pianoOctaves: 5 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ pianoOpacity: 0.72 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ volume: -6 });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ hitBoxColor: "#ff0000" });
    expect(props.onUpdateSettings).toHaveBeenCalledWith({ showFingertipStats: false });
  });
});
