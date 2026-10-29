import { describe, expect, it } from "vitest";
import { DISTANCES, LEVERAGES } from "../src/fx.ts";
import { STAKES, gauge, levAt, levPos, pct } from "../public/ticket.js";

// ADR 0024: the order ticket's arithmetic, kept out of the page so it can
// be checked here. The leverage slider runs on a log scale and snaps to
// the desk's ladder; the stake slider is even; percentages never round a
// real move to zero; the meter is centred on the starting money.
describe("the leverage slider", () => {
  it("places the rungs evenly, whatever their leverage, from the first at 0 to the last at 1", () => {
    expect(levPos(1, LEVERAGES)).toBe(0);
    expect(levPos(1000, LEVERAGES)).toBe(1);
    const gaps = LEVERAGES.slice(1).map((lev, i) => levPos(lev, LEVERAGES) - levPos(LEVERAGES[i], LEVERAGES));
    for (const gap of gaps) expect(gap).toBeCloseTo(1 / (LEVERAGES.length - 1), 9);
  });

  it("snaps any position to the nearest rung, and every rung to itself", () => {
    for (const lev of LEVERAGES) expect(levAt(levPos(lev, LEVERAGES), LEVERAGES), String(lev)).toBe(lev);
    expect(LEVERAGES).not.toContain(25);
    expect(LEVERAGES, "the 50× rung is gone").not.toContain(50);
    expect(levAt(-1, LEVERAGES)).toBe(1);
    expect(levAt(2, LEVERAGES)).toBe(1000);
    // Australia's cap has a rung of its own, and one step moves exactly one rung
    const cap = levPos(30, LEVERAGES);
    expect(levAt(cap - 0.01, LEVERAGES)).toBe(30);
    expect(levAt(cap + 0.01, LEVERAGES)).toBe(30);
    const step = 1 / (LEVERAGES.length - 1);
    expect(levAt(cap + step, LEVERAGES)).toBe(LEVERAGES[LEVERAGES.indexOf(30) + 1]);
  });

  it("puts a leverage that is not a rung at the nearest one", () => {
    // a position kept at 50× from before sits at 30×, the rung nearer in ratio (50/30 is less than 100/50)
    expect(levPos(50, LEVERAGES)).toBe(levPos(30, LEVERAGES));
    expect(levAt(levPos(25, LEVERAGES), LEVERAGES)).toBe(30);
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
  // ADR 0033, 0064: one slider for both exits, from the stop loss at the left to the take
  // profit at the right; each is one of the desk's six distances away, evenly spaced.
  it("run along the desk's six distances, evenly, the same ladder both ways", async () => {
    const { distAt, distPos } = await import("../public/ticket.js");
    expect(DISTANCES).toEqual([1, 2, 5, 10, 20, 50]);
    expect(distPos(1, DISTANCES)).toBe(0);
    expect(distPos(50, DISTANCES)).toBe(1);
    for (const d of DISTANCES) expect(distAt(distPos(d, DISTANCES), DISTANCES), String(d)).toBe(d);
    const gaps = DISTANCES.slice(1).map((d, i) => distPos(d, DISTANCES) - distPos(DISTANCES[i], DISTANCES));
    for (const gap of gaps) expect(gap).toBeCloseTo(1 / (DISTANCES.length - 1), 9);
    expect(distAt(-1, DISTANCES)).toBe(1);
    expect(distAt(2, DISTANCES)).toBe(50);
    // a distance that is not a rung sits at the nearer one, in ratio
    expect(distAt(distPos(3, DISTANCES), DISTANCES)).toBe(2);
    expect(distAt(distPos(7, DISTANCES), DISTANCES)).toBe(5);
  });

  it("place the stop loss left of the middle and the take profit right of it, as one track", async () => {
    const { exitAt, exitPos } = await import("../public/ticket.js");
    // the track runs stop loss 50% ... 1% | 1% ... 50% take profit
    expect(exitPos({ kind: "sl", dist: 50 }, DISTANCES)).toBeCloseTo(0, 9);
    expect(exitPos({ kind: "tp", dist: 50 }, DISTANCES)).toBeCloseTo(1, 9);
    // the nearest of each sits either side of the middle, never on it
    expect(exitPos({ kind: "sl", dist: 1 }, DISTANCES)).toBeLessThan(0.5);
    expect(exitPos({ kind: "tp", dist: 1 }, DISTANCES)).toBeGreaterThan(0.5);
    for (const d of DISTANCES) {
      expect(exitAt(exitPos({ kind: "sl", dist: d }, DISTANCES), DISTANCES), `sl ${d}`).toEqual({ kind: "sl", dist: d });
      expect(exitAt(exitPos({ kind: "tp", dist: d }, DISTANCES), DISTANCES), `tp ${d}`).toEqual({ kind: "tp", dist: d });
    }
    // left of the middle is always a stop loss, right of it a take profit
    expect(exitAt(0.1, DISTANCES).kind).toBe("sl");
    expect(exitAt(0.9, DISTANCES).kind).toBe("tp");
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
      const { kind, dist } = exitAt(pos / 1000, DISTANCES);
      const desk = new Desk(100);
      desk.join("a");
      const exit = kind === "sl" ? { sl: dist } : { tp: dist };
      // whatever the thumb reads, the desk takes it, and places the exit exactly there
      expect(desk.order("a", 1, 10, 1, exit), `thumb ${pos} reads ${dist}%`).toEqual([expect.objectContaining({ kind: "open" })]);
      const p = desk.account("a").pos!;
      if (kind === "sl") expect((1 - p.stop! / 100) * 100, `thumb ${pos}`).toBeCloseTo(dist, 6);
      else expect((p.take! / 100 - 1) * 100, `thumb ${pos}`).toBeCloseTo(dist, 6);
      expect(DISTANCES).toContain(dist);
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

// ADR 0034: the stop loss and take profit share one joined track. Each
// thumb's coloured fill grows from the middle outwards, so it is longer the
// further the distance: the stop loss's runs from its thumb to the middle
// (the right end of its left half), the take profit's from the middle to its
// thumb. A native slider fills to the left of its thumb, which for the stop
// loss is the wrong side, so the page draws the fill from these spans.
describe("the joined track's fill", () => {
  it("runs from the thumb to the middle for the stop loss, and from the middle to the thumb for the take profit", async () => {
    const { fillSpan } = await import("../public/ticket.js");
    // the stop loss half is 0 (50% away, far left) to 480 (1%, beside the middle)
    expect(fillSpan("sl", 0, 0, 480)).toEqual({ from: 0, to: 1 });
    expect(fillSpan("sl", 240, 0, 480)).toEqual({ from: 0.5, to: 1 });
    expect(fillSpan("sl", 480, 0, 480)).toEqual({ from: 1, to: 1 });
    // the take profit half is 520 (1%, beside the middle) to 1000 (50%, far right)
    expect(fillSpan("tp", 520, 520, 1000)).toEqual({ from: 0, to: 0 });
    expect(fillSpan("tp", 760, 520, 1000)).toEqual({ from: 0, to: 0.5 });
    expect(fillSpan("tp", 1000, 520, 1000)).toEqual({ from: 0, to: 1 });
  });

  it("is longer the further the distance, for both, and empty at 1%", async () => {
    const { exitPos, fillSpan } = await import("../public/ticket.js");
    const len = (kind: "sl" | "tp", dist: number) => {
      const v = Math.round(exitPos({ kind, dist }, DISTANCES) * 1000);
      const { from, to } = kind === "sl" ? fillSpan("sl", v, 0, 480) : fillSpan("tp", v, 520, 1000);
      return to - from;
    };
    for (const kind of ["sl", "tp"] as const) {
      expect(len(kind, 1), kind).toBeCloseTo(0, 2);
      expect(len(kind, 50), kind).toBeCloseTo(1, 2);
      let last = -1;
      for (const d of DISTANCES) {
        expect(len(kind, d), `${kind} ${d}`).toBeGreaterThan(last);
        last = len(kind, d);
      }
    }
  });
});

// ADR 0035: the stop loss and take profit on an open position are dragged on
// the chart, not set in the position panel. A pointer's height on the canvas
// is turned back into a price, then into the distance the desk is asked for,
// held to the six distances and to the right side of the price.
