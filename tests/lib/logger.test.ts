import { SessionLogger } from "../../src/lib/logger";

describe("SessionLogger", () => {
  it("keeps only the newest events up to the configured cap", () => {
    const logger = new SessionLogger(2);
    logger.push({ type: "note-zone", timestamp: 1, payload: { zone: 1 } });
    logger.push({ type: "tracking-drop", timestamp: 2, payload: { reason: "x" } });
    logger.push({ type: "audio-event", timestamp: 3, payload: { activeSemitones: [], activeMidiNotes: [], activeLabels: [], playMode: "piano" } });

    expect(logger.length()).toBe(2);
    expect(logger.all().map((event) => event.timestamp)).toEqual([2, 3]);
  });

  it("exports a JSON payload with timestamp and events", () => {
    const logger = new SessionLogger();
    logger.push({ type: "tracking-drop", timestamp: 2, payload: { reason: "lost" } });

    const exported = JSON.parse(logger.export()) as { exportedAt: string; events: unknown[] };
    expect(exported.exportedAt).toMatch(/T/);
    expect(exported.events).toHaveLength(1);
  });
});
