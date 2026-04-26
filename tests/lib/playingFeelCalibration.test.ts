import {
  CALIBRATION_STABILITY_THRESHOLDS,
  CONTROL_GESTURE_THRESHOLDS
} from "../../src/lib/constants";
import {
  acceptPlayingFeelCalibration,
  cancelPlayingFeelCalibration,
  classifyCalibrationControlGesture,
  createIdleCalibrationSession,
  getCalibrationAcceptedControlZones,
  getCalibrationControlZone,
  getOppositeHand,
  isPalmInsideControlZone,
  retryPlayingFeelCalibration,
  skipPlayingFeelCalibrationFinger,
  startPlayingFeelCalibration,
  updatePlayingFeelCalibrationSession,
  type CalibrationFrameSample,
  type PlayingFeelCalibrationSession
} from "../../src/lib/playingFeelCalibration";

function sample(timestamp: number, weightedDepth: number): CalibrationFrameSample {
  return {
    timestamp,
    hand: "Left",
    finger: "thumb",
    x: 0.32,
    y: 0.68,
    rawDepth: weightedDepth,
    weightedDepth,
    sensitivity: 1,
    candidateKey: "white:0",
    nearKey: "white:0",
    midiNote: 60,
    visible: true
  };
}

function update(
  session: PlayingFeelCalibrationSession,
  timestamp: number,
  targetSample: CalibrationFrameSample | null = null
): PlayingFeelCalibrationSession {
  return updatePlayingFeelCalibrationSession(session, {
    timestamp,
    targetSample,
    controlGesture: "none",
    controlHandVisible: true,
    controlInsideZone: true,
    roleAmbiguous: false
  }).session;
}

function captureFingerSummarySession(): PlayingFeelCalibrationSession {
  let session = {
    ...startPlayingFeelCalibration("Left", 0),
    phase: "capture-hover" as const
  };

  for (let index = 0; index < 26; index += 1) {
    session = update(session, index * 34, sample(index * 34, 0.01 + (index % 2) * 0.0001));
  }

  session = acceptPlayingFeelCalibration(session, 1000).session;
  const depths = [
    0.01, 0.012, 0.018, 0.023, 0.018, 0.011,
    0.01, 0.013, 0.019, 0.024, 0.017, 0.01
  ];
  depths.forEach((depth, index) => {
    session = update(session, 1100 + index * 60, sample(1100 + index * 60, depth));
  });

  return acceptPlayingFeelCalibration(session, 2200).session;
}

describe("playing feel calibration", () => {
  it("builds idle sessions and basic hand helpers predictably", () => {
    const idle = createIdleCalibrationSession(42);

    expect(idle.active).toBe(false);
    expect(idle.phase).toBe("idle");
    expect(idle.startedAt).toBe(42);
    expect(idle.summaries.Left.thumb.status).toBe("Pending");
    expect(getOppositeHand("Left")).toBe("Right");
    expect(getOppositeHand("Right")).toBe("Left");
  });

  it("requires control gesture rehearsal before capture begins", () => {
    let session = startPlayingFeelCalibration("Left", 0);

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "fist",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: CONTROL_GESTURE_THRESHOLDS.stableMs + 50,
      targetSample: null,
      controlGesture: "fist",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;

    expect(session.rehearsal.fist).toBe(true);
    expect(session.phase).toBe("control-rehearsal");

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 1400,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 2100,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 2800,
      targetSample: null,
      controlGesture: "open",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 3500,
      targetSample: null,
      controlGesture: "open",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;

    expect(session.rehearsal).toEqual({ fist: true, pinch: true, open: true });
    expect(session.phase).toBe("capture-hover");
  });

  it("lets keyboard or button accept skip gesture rehearsal when gestures are unreliable", () => {
    const started = startPlayingFeelCalibration("Left", 0);
    const accepted = acceptPlayingFeelCalibration(started, 100);

    expect(accepted.session.phase).toBe("capture-hover");
    expect(accepted.session.rehearsal).toEqual({ fist: true, pinch: true, open: true });
    expect(accepted.session.guidance).toContain("Control rehearsal skipped");
  });

  it("captures hover, tap cycles, and emits a calibration commit", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    for (let index = 0; index < 26; index += 1) {
      session = update(session, index * 34, sample(index * 34, 0.01 + (index % 2) * 0.0001));
    }

    expect(session.phase).toBe("confirm-hover");
    const acceptedHover = acceptPlayingFeelCalibration(session, 1000);
    session = acceptedHover.session;
    expect(session.phase).toBe("capture-taps");

    const depths = [
      0.01, 0.012, 0.018, 0.023, 0.018, 0.011,
      0.01, 0.013, 0.019, 0.024, 0.017, 0.01
    ];
    depths.forEach((depth, index) => {
      session = update(session, 1100 + index * 60, sample(1100 + index * 60, depth));
    });

    expect(session.phase).toBe("confirm-taps");
    const acceptedTap = acceptPlayingFeelCalibration(session, 2200);

    expect(acceptedTap.commit?.hand).toBe("Left");
    expect(acceptedTap.commit?.finger).toBe("thumb");
    expect(acceptedTap.commit?.calibration.rawHoverDepth).toBeCloseTo(0.01, 3);
    expect(acceptedTap.commit?.calibration.targetKey).toBe("white:0");
    expect(acceptedTap.commit?.tuning.releaseVelocityThreshold).toBeGreaterThan(0);
  });

  it("counts natural partial lifts as tap cycle releases", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    for (let index = 0; index < 26; index += 1) {
      session = update(session, index * 34, sample(index * 34, 0.01 + (index % 2) * 0.0001));
    }

    session = acceptPlayingFeelCalibration(session, 1000).session;
    const partialLiftDepths = [
      0.01, 0.014, 0.022, 0.026, 0.018,
      0.019, 0.024, 0.028, 0.019
    ];
    partialLiftDepths.forEach((depth, index) => {
      session = update(session, 1100 + index * 70, sample(1100 + index * 70, depth));
    });

    expect(session.phase).toBe("confirm-taps");
    expect(session.captureStatus).toContain("taps");
  });

  it("lets users advance immediately from the finger summary", () => {
    const summary = captureFingerSummarySession();

    expect(summary.phase).toBe("finger-summary");

    const advanced = acceptPlayingFeelCalibration(summary, 2250);

    expect(advanced.session.phase).toBe("capture-hover");
    expect(advanced.session.targetFinger).toBe("index");
  });

  it("lets users redo the current finger from the summary without skipping it", () => {
    const summary = captureFingerSummarySession();

    const redo = retryPlayingFeelCalibration(summary, 2250);
    const skipped = skipPlayingFeelCalibrationFinger(summary, 2250);

    expect(redo.session.phase).toBe("capture-hover");
    expect(redo.session.targetFinger).toBe("thumb");
    expect(redo.session.hoverSamples).toHaveLength(0);
    expect(skipped.cue).toBeNull();
    expect(skipped.session.phase).toBe("finger-summary");
    expect(skipped.session.targetFinger).toBe("thumb");
  });

  it("gates control commands to the visible control zone outside the piano", () => {
    const zone = getCalibrationControlZone("Right");

    expect(zone.left).toBeGreaterThan(0.5);
    expect(
      isPalmInsideControlZone(
        { x: 0.8, y: 0.2, z: 0 },
        "Right",
        { topY: 0.6, bottomY: 0.9 },
        { left: 0.04, right: 0.96 }
      )
    ).toBe(true);
    expect(
      isPalmInsideControlZone(
        { x: 0.8, y: 0.7, z: 0 },
        "Right",
        { topY: 0.6, bottomY: 0.9 },
        { left: 0.04, right: 0.96 }
      )
    ).toBe(false);
  });

  it("returns the full control zone when piano and strip bounds do not block it", () => {
    expect(
      getCalibrationAcceptedControlZones(
        "Left",
        { topY: 0.95, bottomY: 0.98 },
        { left: 0.7, right: 0.9 }
      )
    ).toEqual([{ left: 0.02, right: 0.36, top: 0.08, bottom: 0.92 }]);
  });

  it("treats null palms and null control hands as no-op control gestures", () => {
    expect(
      isPalmInsideControlZone(null, "Left", { topY: 0.6, bottomY: 0.9 }, { left: 0.04, right: 0.96 })
    ).toBe(false);
    expect(classifyCalibrationControlGesture(null)).toBe("none");
  });

  it("returns only the actually accepted control-zone regions for the overlay", () => {
    const zones = getCalibrationAcceptedControlZones(
      "Right",
      { topY: 0.6, bottomY: 0.9 },
      { left: 0.04, right: 0.96 }
    );

    expect(zones).toContainEqual({ left: 0.64, right: 0.98, top: 0.08, bottom: 0.6 });
    expect(zones).toContainEqual({ left: 0.64, right: 0.98, top: 0.9, bottom: 0.92 });
    expect(zones).toContainEqual({ left: 0.96, right: 0.98, top: 0.6, bottom: 0.9 });
    expect(
      zones.some(
        (zone) =>
          zone.left < 0.8 &&
          zone.right > 0.8 &&
          zone.top < 0.7 &&
          zone.bottom > 0.7
      )
    ).toBe(false);
  });

  it("distinguishes short pinch retry from long-pinch skip", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    const stillHolding = updatePlayingFeelCalibrationSession(session, {
      timestamp: 700,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    });

    expect(stillHolding.session.targetFinger).toBe("thumb");

    const shortRelease = updatePlayingFeelCalibrationSession(stillHolding.session, {
      timestamp: 900,
      targetSample: null,
      controlGesture: "none",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    });
    expect(shortRelease.cue).toBe("retry");
    expect(shortRelease.session.targetFinger).toBe("thumb");

    session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    const longHold = updatePlayingFeelCalibrationSession(session, {
      timestamp: 1600,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    });

    expect(longHold.session.targetFinger).toBe("index");
    expect(longHold.session.summaries.Left.thumb.status).toBe("Skipped");
  });

  it("does not fire retry when a short pinch is released outside the control zone", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 700,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;

    const releasedOutside = updatePlayingFeelCalibrationSession(session, {
      timestamp: 850,
      targetSample: null,
      controlGesture: "none",
      controlHandVisible: true,
      controlInsideZone: false,
      roleAmbiguous: false
    });

    expect(releasedOutside.cue).toBeNull();
    expect(releasedOutside.session.phase).toBe("capture-hover");
  });

  it("does not pause while the target fingertip is visible even if the control hand leaves", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const,
      phaseStartedAt: 0
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: CONTROL_GESTURE_THRESHOLDS.handAwayPauseMs + 200,
      targetSample: sample(CONTROL_GESTURE_THRESHOLDS.handAwayPauseMs + 200, 0.01),
      controlGesture: "none",
      controlHandVisible: false,
      controlInsideZone: false,
      roleAmbiguous: false
    }).session;

    expect(session.phase).toBe("capture-hover");
    expect(session.handAwaySince).toBeNull();
  });

  it("resets hover capture progress after a target-sample gap", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    for (let index = 0; index < CALIBRATION_STABILITY_THRESHOLDS.hoverMinFrames - 1; index += 1) {
      session = update(session, index * 34, sample(index * 34, 0.01));
    }

    expect(session.phase).toBe("capture-hover");

    session = update(session, 2000, sample(2000, 0.01));

    expect(session.phase).toBe("capture-hover");
    expect(session.hoverSamples).toHaveLength(1);
  });

  it("ignores long-pinch skip during preview", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "preview" as const
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    const longHold = updatePlayingFeelCalibrationSession(session, {
      timestamp: 1600,
      targetSample: null,
      controlGesture: "pinch",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    });

    expect(longHold.session.phase).toBe("preview");
    expect(longHold.session.summaries.Left.thumb.status).toBe("Pending");
  });

  it("pauses when hand roles stay ambiguous and resumes from pause on accept", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: sample(0, 0.01),
      controlGesture: "none",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: true
    }).session;

    const paused = updatePlayingFeelCalibrationSession(session, {
      timestamp: 700,
      targetSample: sample(700, 0.01),
      controlGesture: "none",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: true
    }).session;

    expect(paused.phase).toBe("paused");

    const resumed = acceptPlayingFeelCalibration(paused, 800);
    expect(resumed.session.phase).toBe("capture-hover");
  });

  it("pauses when both target and control hands are away for too long", () => {
    let session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: 0,
      targetSample: null,
      controlGesture: "none",
      controlHandVisible: false,
      controlInsideZone: false,
      roleAmbiguous: false
    }).session;

    session = updatePlayingFeelCalibrationSession(session, {
      timestamp: CONTROL_GESTURE_THRESHOLDS.handAwayPauseMs + 50,
      targetSample: null,
      controlGesture: "none",
      controlHandVisible: false,
      controlInsideZone: false,
      roleAmbiguous: false
    }).session;

    expect(session.phase).toBe("paused");
    expect(session.guidance).toContain("Pause");
  });

  it("supports explicit pause and cancel flows", () => {
    const session = {
      ...startPlayingFeelCalibration("Left", 0),
      phase: "capture-hover" as const
    };

    const pauseStarted = updatePlayingFeelCalibrationSession(session, {
      timestamp: 100,
      targetSample: sample(100, 0.01),
      controlGesture: "open",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    }).session;
    const paused = updatePlayingFeelCalibrationSession(pauseStarted, {
      timestamp: 100 + CONTROL_GESTURE_THRESHOLDS.stableMs + 10,
      targetSample: sample(100 + CONTROL_GESTURE_THRESHOLDS.stableMs + 10, 0.01),
      controlGesture: "open",
      controlHandVisible: true,
      controlInsideZone: true,
      roleAmbiguous: false
    });

    expect(paused.session.phase).toBe("paused");
    expect(paused.cue).toBe("pause");

    const cancelled = cancelPlayingFeelCalibration(paused.session, 200);
    expect(cancelled.active).toBe(false);
    expect(cancelled.phase).toBe("idle");
  });
});
