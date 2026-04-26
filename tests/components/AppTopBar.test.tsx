import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppTopBar } from "../../src/components/AppTopBar";

function renderTopBar(overrides: Partial<React.ComponentProps<typeof AppTopBar>> = {}) {
  const props: React.ComponentProps<typeof AppTopBar> = {
    playMode: "piano",
    audioStatus: "idle",
    trackerStatus: "idle",
    calibrationScope: "Both",
    calibrationActive: false,
    error: null,
    warning: null,
    startupNotice: null,
    audioOutputNotice: null,
    onPlayModeChange: vi.fn(),
    onArmAudio: vi.fn(),
    onStartTracking: vi.fn(),
    onStopTracking: vi.fn(),
    onCalibrationScopeChange: vi.fn(),
    onStartCalibration: vi.fn(),
    onCancelCalibration: vi.fn(),
    ...overrides
  };

  render(<AppTopBar {...props} />);
  return props;
}

describe("AppTopBar", () => {
  it("renders the piano subtitle and startup actions", () => {
    renderTopBar();

    expect(screen.getByText("ChordGlyph")).toBeTruthy();
    expect(screen.getByText("Fingertip piano")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Click to enable audio" })).toBeTruthy();
  });

  it("shows circle mode, live camera state, and cancel while calibration is active", async () => {
    const user = userEvent.setup();
    const props = renderTopBar({
      playMode: "circle",
      audioStatus: "blocked",
      trackerStatus: "ready",
      calibrationActive: true,
      error: "Tracker error",
      warning: "Tracker warning",
      startupNotice: "Starting up",
      audioOutputNotice: "Routing notice"
    });

    expect(screen.getByText("Fingertip circles")).toBeTruthy();
    expect(screen.getByText("Camera live")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByText("Tracker error")).toBeTruthy();
    expect(screen.getByText("Tracker warning")).toBeTruthy();
    expect(screen.getByText("Starting up")).toBeTruthy();
    expect(screen.getByText("Routing notice")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Click to enable audio" }));
    expect(props.onArmAudio).toHaveBeenCalled();
  });
});
