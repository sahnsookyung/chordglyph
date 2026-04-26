import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { StageSection } from "../../src/components/StageSection";
import { getCircleLayout } from "../../src/lib/circleMode";
import { getVisibleKeyNames, PIANO_BLACK_KEY_WIDTH_RATIO } from "../../src/lib/music";
import { getStripBounds } from "../../src/lib/noteMapping";
import { getPianoLayout, getWhiteHitSegments } from "../../src/lib/pianoLayout";
import { makeViewState } from "../support/viewState";

function renderStage(playMode: "piano" | "circle", overrides = {}) {
  const state = makeViewState(
    {
      currentRootLabel: "C",
      currentModeLabel: playMode === "circle" ? "Circle" : "Major",
      settings: {
        ...makeViewState().settings,
        playMode,
        showHitBoxes: true
      },
      ...overrides
    },
    { playMode, showHitBoxes: true }
  );
  const noteNames = getVisibleKeyNames(state.settings.pianoOctaves);
  const pianoLayout = getPianoLayout(
    noteNames.length,
    state.settings.pianoVerticalOffset,
    state.settings.pianoHeightScale,
    state.settings.pianoOctaves
  );
  const blackKeyWidth = `${((100 / noteNames.length) * PIANO_BLACK_KEY_WIDTH_RATIO).toFixed(2)}%`;
  const blackKeyTop = `${((pianoLayout.blackKeyTopY - pianoLayout.topY) / pianoLayout.heightRatio) * 100}%`;
  const blackKeyHeight = `${((pianoLayout.blackKeyBottomY - pianoLayout.blackKeyTopY) / pianoLayout.heightRatio) * 100}%`;

  render(
    <StageSection
      videoRef={createRef<HTMLVideoElement>()}
      overlayRef={createRef<HTMLCanvasElement>()}
      stageRef={createRef<HTMLDivElement>()}
      state={state}
      circleLayouts={{ Left: getCircleLayout("Left"), Right: getCircleLayout("Right") }}
      calibrationControlZones={[]}
      calibrationHandProgress="1 / 2"
      calibrationFingerProgress="1 / 5"
      calibrationAcceptLabel="Accept"
      calibrationRetryLabel="Retry"
      calibrationSkipDisabled={false}
      noteNames={noteNames}
      pianoLayout={pianoLayout}
      pianoHorizontalBounds={getStripBounds(state.settings.noteStripSize, state.settings.pianoWidthScale)}
      whiteHitSegments={getWhiteHitSegments(pianoLayout, noteNames.length)}
      blackKeyWidth={blackKeyWidth}
      blackKeyTop={blackKeyTop}
      blackKeyHeight={blackKeyHeight}
      onAcceptCalibration={vi.fn()}
      onRetryCalibration={vi.fn()}
      onSkipCalibration={vi.fn()}
      onCancelCalibration={vi.fn()}
    />
  );
}

describe("StageSection", () => {
  it("renders circle mode segments and captions", () => {
    renderStage("circle", {
      activeCircleSegments: { Left: [0], Right: [2] }
    });

    expect(screen.getByText("Left")).toBeTruthy();
    expect(screen.getByText("Right")).toBeTruthy();
    expect(screen.getAllByText("Natural")).toHaveLength(2);
    expect(screen.getByText("Circle")).toBeTruthy();
  });

  it("renders the piano strip, hit boxes, and captions", () => {
    renderStage("piano", {
      activeNaturalZones: [0],
      activeSharpZones: [1]
    });

    expect(screen.getByText("Any fingertip can press the white keys")).toBeTruthy();
    expect(screen.getByText(/Black keys now use direct hit detection/)).toBeTruthy();
    expect(screen.getByText("Supported envelope")).toBeTruthy();
  });

  it("shows the calibration overlay when calibration is active", () => {
    const state = makeViewState({
      calibrationSession: {
        ...makeViewState().calibrationSession,
        active: true,
        phase: "capture-hover",
        targetHand: "Left",
        controlHand: "Right",
        targetFinger: "thumb",
        targetKey: "white:0",
        qualityScore: 0.72,
        progress: 0.5,
        captureStatus: "Hold steady",
        guidance: "Move the control hand into the zone",
        command: {
          command: "none",
          progress: 0.4,
          insideControlZone: false,
          rawGesture: "open"
        }
      }
    });
    const noteNames = getVisibleKeyNames(state.settings.pianoOctaves);
    const pianoLayout = getPianoLayout(
      noteNames.length,
      state.settings.pianoVerticalOffset,
      state.settings.pianoHeightScale,
      state.settings.pianoOctaves
    );

    render(
      <StageSection
        videoRef={createRef<HTMLVideoElement>()}
        overlayRef={createRef<HTMLCanvasElement>()}
        stageRef={createRef<HTMLDivElement>()}
        state={state}
        circleLayouts={{ Left: getCircleLayout("Left"), Right: getCircleLayout("Right") }}
        calibrationControlZones={[{ left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }]}
        calibrationHandProgress="1 / 2"
        calibrationFingerProgress="1 / 5"
        calibrationAcceptLabel="Accept"
        calibrationRetryLabel="Retry"
        calibrationSkipDisabled={false}
        noteNames={noteNames}
        pianoLayout={pianoLayout}
        pianoHorizontalBounds={getStripBounds(state.settings.noteStripSize, state.settings.pianoWidthScale)}
        whiteHitSegments={getWhiteHitSegments(pianoLayout, noteNames.length)}
        blackKeyWidth="10%"
        blackKeyTop="20%"
        blackKeyHeight="40%"
        onAcceptCalibration={vi.fn()}
        onRetryCalibration={vi.fn()}
        onSkipCalibration={vi.fn()}
        onCancelCalibration={vi.fn()}
      />
    );

    expect(screen.getByText("Playing Feel")).toBeTruthy();
    expect(screen.getByText("Move control hand into the control zone")).toBeTruthy();
    expect(screen.getByText("Right signs accepted here")).toBeTruthy();
    expect(screen.getByText("Keyboard: Space accept, R retry, S skip, Esc cancel.")).toBeTruthy();
  });
});
