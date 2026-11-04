import { describe, expect, it } from "vitest";
import { dayOf, normal as draw, TICKS_PER_DAY } from "../src/bridge.ts";
import { random } from "../src/market.ts";

// The bridge between two closes is held to what real markets did, measured from HistData's minutes. Real: a day's
// movement by four-hour block from the 17:00 open was 14%, 12%, 22%, 20%, 20%, 12%; a day's high to low was 1.7 times
// its open to close. Fifteen-minute moves (ADR 0085), measured over 4,995 ordinary days of the raw files with the
// method below, which gives back 4.3 for the half hours once measured at 4.4, have a kurtosis of 5.0 (3 is a normal).
// The bridge matches the first two and reaches 1.5 on the third, which is checked as that and no more.
const DAYS = 3000;
const sample = () => {
  const rnd = random(11);
  const normal = (): number => draw(rnd);
  const blocks = Array(6).fill(0);
  const ratios: number[] = [];
  const kurt: number[] = [];
  for (let d = 0; d < DAYS; d++) {
    const close = Math.exp(normal() * 0.005);
    const t = [1, ...dayOf(1, close, 0.004, rnd)];
    const moves = t.slice(1).map((p, i) => Math.abs(Math.log(p / t[i])));
    const total = moves.reduce((a, b) => a + b, 0);
    const block = TICKS_PER_DAY / 6;
    for (let b = 0; b < 6; b++) blocks[b] += moves.slice(b * block, b * block + block).reduce((a, x) => a + x, 0) / total;
    const move = Math.abs(Math.log(close));
    if (move > 0.0002) ratios.push(Math.log(Math.max(...t) / Math.min(...t)) / move);
    const logs = t.slice(1).map((p, i) => Math.log(p / t[i]));
    const sd = Math.sqrt(logs.reduce((a, b) => a + b * b, 0) / logs.length);
    kurt.push(logs.reduce((a, b) => a + (b / sd) ** 4, 0) / logs.length);
  }
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  return { blocks: blocks.map((b) => (b / DAYS) * 100), ratio: median(ratios), kurt: median(kurt) };
};

describe("the bridge between two closes", () => {
  const got = sample();

  it("makes a day of 96 ticks that ends on its close, from the price before", () => {
    const rnd = random(5);
    const day = dayOf(100, 101.5, 0.004, rnd);
    expect(day).toHaveLength(TICKS_PER_DAY);
    expect(day.at(-1)).toBe(101.5);
    for (const p of day) expect(Number.isFinite(p) && p > 0).toBe(true);
  });

  it("follows the sessions: quiet overnight, busiest as London and New York overlap, as real days were", () => {
    const real = [14, 12, 22, 20, 20, 12];
    got.blocks.forEach((share, i) => expect(Math.abs(share - real[i]), `block ${i + 1} is ${share.toFixed(1)}% against ${real[i]}%`).toBeLessThanOrEqual(1.5));
  });

  it("has fat tails, near the real fifteen minutes' 5.0", () => {
    expect(got.kurt, `kurtosis ${got.kurt.toFixed(2)}`).toBeGreaterThan(4.5);
    expect(got.kurt).toBeLessThan(5.5);
  });

  it("overshoots its close as real days did, if not so far: about 1.5 times, where the real median was 1.7", () => {
    expect(got.ratio, `high to low over open to close is ${got.ratio.toFixed(2)}`).toBeGreaterThan(1.35);
    expect(got.ratio).toBeLessThan(1.8);
  });

  it("carries a gap in its first tick, the rest of the move following in the day", () => {
    const rnd = random(2);
    const day = dayOf(1.2, 1.0, 0.003, rnd, 1, 0.8);
    const first = Math.log(day[0] / 1.2);
    expect(first, "four fifths of the fall, at once").toBeLessThan(Math.log(1.0 / 1.2) * 0.7);
    expect(day.at(-1)).toBe(1.0);
  });
});
