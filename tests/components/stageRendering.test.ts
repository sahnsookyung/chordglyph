import { circleLabelPoint, circleSegmentPath, drawHandPath } from "../../src/components/stageRendering";
import { makeTrackedHand } from "../support/viewState";

function createContext() {
  const spies = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn()
  };

  return {
    context: {
      ...spies,
      lineWidth: 0,
      strokeStyle: "",
      fillStyle: "",
      textBaseline: "",
      lineJoin: "",
      font: ""
    } as unknown as CanvasRenderingContext2D,
    spies
  };
}

describe("stageRendering helpers", () => {
  it("builds deterministic circle segments and label points", () => {
    expect(circleSegmentPath(0)).toContain("A 48 48");
    expect(circleSegmentPath(0)).toContain("A 12 12");
    expect(circleLabelPoint(0).y).toBeLessThan(50);
  });

  it("draws landmarks, fingertips, and labels for active piano touches", () => {
    const { context, spies } = createContext();
    const hand = makeTrackedHand("left-1", "Left");

    drawHandPath(
      context,
      hand.landmarks,
      100,
      100,
      {
        stroke: "#ffffff",
        thickness: 0.5,
        activeTouchMarkers: [
          {
            tipIndex: 8,
            source: "piano",
            modelZ: -0.02,
            rawDepthScore: 0.02,
            sensitivity: 1.5,
            depthScore: 0.03,
            activationProgress: 0.9,
            activationVelocity: 0.4,
            isCalibrated: true,
            isPressed: true
          }
        ],
        idleTipColor: "#7dd3fc",
        activeColor: "#f97316",
        showLabels: true
      }
    );

    expect(spies.lineTo).toHaveBeenCalled();
    expect(spies.arc).toHaveBeenCalled();
    expect(spies.fillText).toHaveBeenCalledWith(
      expect.stringContaining("model"),
      expect.any(Number),
      expect.any(Number)
    );
    expect(spies.strokeText).toHaveBeenCalled();
  });
});
