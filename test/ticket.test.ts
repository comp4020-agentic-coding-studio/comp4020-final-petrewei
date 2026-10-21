import { describe, expect, it } from "vitest";
import { LEVERAGES } from "../src/fx.ts";
import { STAKES, gauge, levAt, levPos, pct } from "../public/ticket.js";

// ADR 0024: the order ticket's arithmetic, kept out of the page so it can
// be checked here. The leverage slider runs on a log scale and snaps to
// the desk's ladder; the stake slider is even; percentages never round a
// real move to zero; the meter is centred on the starting money.
describe("the leverage slider", () => {
  it("places the ladder by its logarithm, from 1× at 0 to 1000× at 1", () => {
    expect(levPos(1)).toBe(0);
    expect(levPos(1000)).toBe(1);
    expect(levPos(10)).toBeCloseTo(1 / 3, 6);
    expect(levPos(100)).toBeCloseTo(2 / 3, 6);
  });

  it("snaps any position to the nearest rung, and every rung to itself", () => {
    for (const lev of LEVERAGES) expect(levAt(levPos(lev), LEVERAGES), String(lev)).toBe(lev);
    expect(levAt(0.5, LEVERAGES)).toBe(30);
    expect(levAt(-1, LEVERAGES)).toBe(1);
    expect(levAt(2, LEVERAGES)).toBe(1000);
    // the two legal caps are distinct stops even though they sit close
    expect(levAt(levPos(25) + 0.005, LEVERAGES)).toBe(25);
    expect(levAt(levPos(30) - 0.005, LEVERAGES)).toBe(30);
  });
});

describe("the stake slider", () => {
  it("offers a quarter, a half, three quarters and all, evenly", () => {
    expect(STAKES).toEqual([0.25, 0.5, 0.75, 1]);
  });
});

describe("percentages", () => {
  it("signs a change, to two places", () => {
    expect(pct(0.124)).toBe("+12.40%");
    expect(pct(-0.5)).toBe("−50.00%");
    expect(pct(0)).toBe("0.00%");
  });

  it("never shows a real move as zero", () => {
    expect(pct(0.00004)).toBe("+0.0040%");
    expect(pct(-0.0000123)).toBe("−0.0012%");
  });

  it("keeps big numbers short", () => {
    expect(pct(12.3456)).toBe("+1,235%");
    expect(pct(-1)).toBe("−100.0%");
  });
});

// The meter: 0.5 is the starting money; losses run left, gains right, on a
// log scale, so halving and doubling are the same distance from the start.
describe("the meter", () => {
  it("centres on the start, and puts halving and doubling at equal distances", () => {
    expect(gauge(1)).toBe(0.5);
    expect(0.5 - gauge(0.5)).toBeCloseTo(gauge(2) - 0.5, 9);
  });

  it("fills the ends at a wipe-out and at ten times the money", () => {
    expect(gauge(0)).toBe(0);
    expect(gauge(10)).toBe(1);
    expect(gauge(100)).toBe(1);
    expect(gauge(-1)).toBe(0);
  });

  it("orders any two worths as they are", () => {
    const xs = [0.01, 0.2, 0.5, 0.9, 1, 1.1, 2, 5, 9];
    for (let i = 1; i < xs.length; i++) expect(gauge(xs[i])).toBeGreaterThan(gauge(xs[i - 1]));
  });
});
