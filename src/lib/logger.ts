import type { SessionLogEvent } from "./types";

export class SessionLogger {
  private events: SessionLogEvent[] = [];

  push(event: SessionLogEvent): void {
    this.events.push(event);
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
