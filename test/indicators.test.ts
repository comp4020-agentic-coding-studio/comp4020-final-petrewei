import { describe, expect, it } from "vitest";
import { bollinger, closes, rsi, sma } from "../public/indicators.js";

// The chart's indicators are the textbook ones, worked out on each day's
// close. A day with too little history has none, rather than a guess.
describe("closes", () => {
  it("takes each day's last price, including today's so far", () => {
    // four ticks a day: days end at index 4 and 8; today is at 10
    expect(closes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 4)).toEqual([5, 9, 11]);
    expect(closes([1, 2, 3, 4, 5], 4)).toEqual([5]);
    expect(closes([1], 4)).toEqual([1]);
  });
});

describe("simple moving average", () => {
  it("averages the last n closes, and is null until there are n", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(sma([2, 2], 5)).toEqual([null, null]);
  });
});

describe("Bollinger bands", () => {
  it("sit two population standard deviations either side of the average", () => {
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    // mean 5, population standard deviation 2
    expect(b.at(-1)).toEqual({ mid: 5, upper: 9, lower: 1 });
    expect(b[0]).toBeNull();
  });
  it("close to the average when the price is flat", () => {
    expect(bollinger([3, 3, 3], 3, 2).at(-1)).toEqual({ mid: 3, upper: 3, lower: 3 });
  });
});

describe("RSI", () => {
  it("is 100 when every move is up, 0 when every move is down", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 5).at(-1)).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 5).at(-1)).toBe(0);
  });
  it("is 50 when gains and losses balance, and null before n moves", () => {
    const r = rsi([10, 11, 10, 11, 10], 4);
    expect(r.at(-1)).toBe(50);
    expect(r.slice(0, 4)).toEqual([null, null, null, null]);
  });
  it("follows Wilder's smoothing after the first n moves", () => {
    // first average gain 1/2, loss 0 over [1,2,2]; then a fall of 1:
    // gain 1/2·1/2 = 0.25, loss 1/2 = 0.5, RS 0.5, RSI 100 − 100/1.5
    expect(rsi([1, 2, 2, 1], 2).at(-1)).toBeCloseTo(100 - 100 / 1.5, 10);
  });
  it("is 50 on a flat line", () => {
    expect(rsi([5, 5, 5, 5], 3).at(-1)).toBe(50);
  });
});
