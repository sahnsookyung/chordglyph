import type { SessionLogEvent } from "./types";

export class SessionLogger {
  private events: SessionLogEvent[] = [];

  constructor(private readonly maxEvents = 2000) {}

  push(event: SessionLogEvent): void {
    this.events.push(event);
    const overflow = this.events.length - this.maxEvents;
    if (overflow > 0) {
      this.events.splice(0, overflow);
    }
  }

  length(): number {
    return this.events.length;
  }

  all(): SessionLogEvent[] {
    return [...this.events];
  }

  export(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        events: this.events
      },
      null,
      2
    );
  }
}
