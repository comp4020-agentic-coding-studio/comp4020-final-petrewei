export interface Timer { cancel(): void; unref(): Timer }
export interface Clock {
  now(): number;
  every(callback: () => void, ms: number): Timer;
  defer(callback: () => void): Timer;
}

export const systemClock: Clock = {
  now: Date.now,
  every(callback, ms) {
    const handle = setInterval(callback, ms);
    return { cancel: () => clearInterval(handle), unref() { handle.unref(); return this; } };
  },
  defer(callback) {
    const handle = setImmediate(callback);
    return { cancel: () => clearImmediate(handle), unref() { handle.unref(); return this; } };
  },
};

// Deterministic scheduler for application tests: no patched globals or private timer inspection.
export class ManualClock implements Clock {
  private time: number;
  private tasks = new Set<{ callback: () => void; at: number; period: number }>();
  constructor(now: number) { this.time = now; }
  now = (): number => this.time;
  get pending(): number { return this.tasks.size; }
  private schedule(callback: () => void, delay: number, period: number): Timer {
    const task = { callback, at: this.time + delay, period };
    this.tasks.add(task);
    return { cancel: () => { this.tasks.delete(task); }, unref() { return this; } };
  }
  every(callback: () => void, ms: number): Timer {
    if (!(ms > 0)) throw new Error("Timer period must be positive.");
    return this.schedule(callback, ms, ms);
  }
  defer(callback: () => void): Timer { return this.schedule(callback, 0, 0); }
  advance(ms: number): void {
    if (!(ms >= 0)) throw new Error("Cannot move the clock backwards.");
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks].filter((task) => task.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.time = next.at;
      if (next.period) next.at += next.period;
      else this.tasks.delete(next);
      next.callback();
    }
    this.time = end;
  }
}
