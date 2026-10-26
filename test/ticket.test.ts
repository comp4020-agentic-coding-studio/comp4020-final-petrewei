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
    // 25× is gone: Japan's cap is no longer a rung
    expect(LEVERAGES).not.toContain(25);
    expect(levAt(-1, LEVERAGES)).toBe(1);
    expect(levAt(2, LEVERAGES)).toBe(1000);
    // Australia's cap is a stop of its own
    expect(levAt(levPos(30) - 0.005, LEVERAGES)).toBe(30);
    expect(levAt(levPos(30) + 0.005, LEVERAGES)).toBe(30);
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

// ADR 0032: the stop loss and take profit distances. A log-scale slider
// snaps to a ladder of distances, and the ticket says what each would
// make or lose: at L× on a margin M, a move of d% is M × L × d / 100.
describe("the stop and take profit distances", () => {
  // ADR 0033: one slider for both exits, from the stop loss at the left
  // to the take profit at the right; each is 1% to 50% away.
  it("run from 1% to 50%, the same ladder both ways", async () => {
    const { DISTANCES, distAt, distPos } = await import("../public/ticket.js");
    expect(DISTANCES[0]).toBe(1);
    expect(DISTANCES.at(-1)).toBe(50);
    expect(distPos(1)).toBe(0);
    expect(distPos(50)).toBe(1);
    for (const d of DISTANCES) expect(distAt(distPos(d)), String(d)).toBe(d);
    expect(distAt(-1)).toBe(1);
    expect(distAt(2)).toBe(50);
  });

  it("place the stop loss left of the middle and the take profit right of it, as one track", async () => {
    const { DISTANCES, exitAt, exitPos } = await import("../public/ticket.js");
    // the track runs stop loss 50% ... 1% | 1% ... 50% take profit
    expect(exitPos({ kind: "sl", dist: 50 })).toBeCloseTo(0, 9);
    expect(exitPos({ kind: "tp", dist: 50 })).toBeCloseTo(1, 9);
    // the nearest of each sits either side of the middle, never on it
    expect(exitPos({ kind: "sl", dist: 1 })).toBeLessThan(0.5);
    expect(exitPos({ kind: "tp", dist: 1 })).toBeGreaterThan(0.5);
    for (const d of DISTANCES) {
      expect(exitAt(exitPos({ kind: "sl", dist: d })), `sl ${d}`).toEqual({ kind: "sl", dist: d });
      expect(exitAt(exitPos({ kind: "tp", dist: d })), `tp ${d}`).toEqual({ kind: "tp", dist: d });
    }
    // left of the middle is always a stop loss, right of it a take profit
    expect(exitAt(0.1).kind).toBe("sl");
    expect(exitAt(0.9).kind).toBe("tp");
  });

  it("say what a move of that distance makes or loses", async () => {
    const { moveYen } = await import("../public/ticket.js");
    // ¥500,000 at 10×: a 1% move is ¥50,000
    expect(moveYen(500_000, 10, 1)).toBe(50_000);
    expect(moveYen(1_000_000, 25, 4)).toBe(1_000_000);
    expect(moveYen(0, 25, 4)).toBe(0);
  });
});

// ADR 0033: what the ticket shows is what the order carries. Every thumb
// position reads as one distance, the same distance the desk then places
// the exit at, measured from the price when the order opens.
describe("the ticket's exits match the desk", async () => {
  const { Desk } = await import("../src/fx.ts");
  const { exitAt } = await import("../public/ticket.js");

  it("places each exit exactly as far as the thumb reads, at every position", () => {
    for (let pos = 0; pos <= 1000; pos += 20) {
      const { kind, dist } = exitAt(pos / 1000);
      const desk = new Desk(100);
      desk.join("a");
      const exit = kind === "sl" ? { sl: dist } : { tp: dist };
      desk.order("a", 1, 10, 1, exit);
      const p = desk.account("a").pos!;
      if (kind === "sl") expect((1 - p.stop! / 100) * 100, `thumb ${pos}`).toBeCloseTo(dist, 6);
      else expect((p.take! / 100 - 1) * 100, `thumb ${pos}`).toBeCloseTo(dist, 6);
      expect(dist).toBeGreaterThanOrEqual(1);
      expect(dist).toBeLessThanOrEqual(50);
    }
  });

  it("agrees between buying and selling: the stop loss is always on the losing side", () => {
    for (const side of [1, -1] as const) {
      const desk = new Desk(100);
      desk.join("a");
      desk.order("a", side, 10, 1, { sl: 5, tp: 5 });
      const p = desk.account("a").pos!;
      expect(side * (p.stop! - 100)).toBeLessThan(0);
      expect(side * (p.take! - 100)).toBeGreaterThan(0);
    }
  });
});
