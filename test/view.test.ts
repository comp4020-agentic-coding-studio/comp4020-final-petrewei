import { describe, expect, it } from "vitest";
import { closes } from "../public/indicators.js";
import { place, windowed } from "../public/view.js";

// ADR 0062: the chart shows thirty whole days and today's ticks so far, with the
// newest tick at the right edge, so the new price arrives there and the older days
// slide off the left. The tutorial has no history, and runs from the left.
const STEPS = 9;
const DAYS = 30;
// a market whose every tick is its own number, so a candle's ticks can be told apart
const history = Array.from({ length: DAYS * STEPS + 1 }, (_, i) => 100 + i);
const at = (tick: number) => {
  const prices = Array.from({ length: tick + 1 }, (_, i) => 1000 + i);
  return windowed({ prices, history, steps: STEPS, total: DAYS * STEPS });
};

describe("the chart's window", () => {
  it("is thirty whole days and today's ticks so far, at the open and ever after", () => {
    for (const tick of [0, 1, 8, 9, 10, 17, 18, 100, 269, 270]) {
      const v = at(tick);
      expect(v.prices.length, `tick ${tick}`).toBe(DAYS * STEPS + 1 + (tick % STEPS));
      expect(v.total).toBe(DAYS * STEPS);
    }
  });

  it("ends at the newest price, which is the round's latest tick", () => {
    for (const tick of [0, 5, 9, 200]) expect(at(tick).prices.at(-1), `tick ${tick}`).toBe(1000 + tick);
  });

  it("opens on the history, which ends on the open, so the chart is full and continuous", () => {
    const v = at(0);
    expect(v.prices.slice(0, -1)).toEqual(history.slice(0, -1));
    expect(v.prices.at(-1)).toBe(1000);
  });

  it("slides a whole day at a time, so a candle is the same ticks until its day is done", () => {
    // the first tick of the window is a day boundary, and moves only when a day completes
    const firsts = Array.from({ length: 28 }, (_, tick) => at(tick).prices[0]);
    for (let tick = 1; tick < 28; tick++) {
      const moved = firsts[tick] !== firsts[tick - 1];
      expect(moved, `tick ${tick}`).toBe(tick % STEPS === 0);
    }
    for (const tick of [3, 12, 30]) expect((at(tick).skip ?? 0) % 1).toBe(0);
  });

  it("buckets the window's ticks into the same days as the whole market does", () => {
    for (const tick of [0, 4, 9, 13, 40]) {
      const v = at(tick);
      const whole = closes(v.all!, STEPS);
      const shown = closes(v.prices, STEPS);
      // the shown days are the last of the whole market's, with the same closes
      expect(shown, `tick ${tick}`).toEqual(whole.slice(whole.length - shown.length));
    }
  });

  it("gives the indicators the whole market, and tells the page how many days to skip", () => {
    const v = at(40);
    expect(v.all!.length).toBe(history.length - 1 + 41);
    expect(v.skip! * STEPS + v.prices.length).toBe(v.all!.length);
  });

  it("puts the newest tick at the right edge and the oldest shown a window back", () => {
    for (const tick of [0, 3, 9, 100]) {
      const v = at(tick);
      expect(place(v, v.prices.length - 1), `tick ${tick}`).toBeCloseTo(1, 9);
      // a tick one window older than the newest is at the left edge
      expect(place(v, v.prices.length - 1 - v.total)).toBeCloseTo(0, 9);
    }
  });

  it("moves the older ticks left as new ones arrive, by one tick's width each", () => {
    const wide = (tick: number) => place(at(tick), at(tick).prices.length - 1) - place(at(tick), at(tick).prices.length - 2);
    for (const tick of [2, 7, 50]) expect(wide(tick)).toBeCloseTo(1 / (DAYS * STEPS), 9);
  });

  it("leaves a tutorial, which has no history, as it was: from the left, over its own length", () => {
    const tutorial = { prices: [1, 2, 3], steps: 4, total: 40 };
    const v = windowed(tutorial);
    expect(v).toBe(tutorial);
    expect(place(v, 0)).toBe(0);
    expect(place(v, 20)).toBeCloseTo(0.5, 9);
  });
});
