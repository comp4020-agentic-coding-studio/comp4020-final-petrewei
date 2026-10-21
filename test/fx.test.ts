import { describe, expect, it } from "vitest";
import { BORROW, BROKE, Desk, LOANS, SPREAD, START } from "../src/fx.ts";

const half = SPREAD / 2;

describe("the trading desk", () => {
  it("opens a position worth its margin times the leverage, at the ask or the bid", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 25);
    const pos = desk.account("a").pos!;
    expect(pos.notional).toBe(START * 25);
    expect(pos.entry).toBeCloseTo(100 * (1 + half));
    expect(desk.used("a")).toBe(START);
  });

  it("charges the spread at once, so a position starts slightly down", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    expect(desk.equity("a")).toBeLessThan(START);
    expect(desk.equity("a")).toBeCloseTo(START - START * 100 * SPREAD, -3);
  });

  it("pays a long when the price rises and a short when it falls", () => {
    const desk = new Desk(100);
    desk.join("long");
    desk.join("short");
    desk.order("long", 1, 10);
    desk.order("short", -1, 10);
    desk.mark(101);
    expect(desk.equity("long")).toBeGreaterThan(START * 1.09);
    expect(desk.equity("short")).toBeLessThan(START * 0.91);
  });

  it("uses only the stake asked for, leaving the rest free", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.5);
    expect(desk.used("a")).toBe(START / 2);
    expect(desk.free("a")).toBeCloseTo(START / 2 - START * 5 * SPREAD, -3);
  });

  it("averages down: adding to a position merges it at a weighted entry", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.5);
    desk.mark(98);
    desk.order("a", 1, 10, 0.5);
    const pos = desk.account("a").pos!;
    expect(pos.entry).toBeGreaterThan(98);
    expect(pos.entry).toBeLessThan(100);
    // Breaking even needs only the merged entry, not the first.
    desk.mark(pos.entry * (1 + SPREAD));
    expect(desk.equity("a")).toBeCloseTo(desk.account("a").balance, -4);
  });

  it("closes instead of reversing when the order is the other way", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10);
    desk.mark(102);
    const events = desk.order("a", -1, 10);
    expect(desk.account("a").pos).toBeNull();
    expect(events[0]).toMatchObject({ kind: "close" });
    expect(desk.account("a").balance).toBeGreaterThan(START * 1.19);
  });

  it("warns once at a margin call, then stops the position out", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    expect(desk.mark(99.5).map((e) => e.kind)).toEqual(["call"]);
    expect(desk.mark(99.45)).toEqual([]);
    const events = desk.mark(99.2);
    expect(events.map((e) => e.kind)).toEqual(["stopout"]);
    expect(desk.account("a").pos).toBeNull();
    expect(desk.account("a").balance).toBeGreaterThan(0);
    expect(desk.account("a").out).toBe(false);
  });

  it("zero-cuts a gap through the stop-out and sends the player out of the market", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.order("a", 1, 25);
    const events = desk.mark(1.03);
    expect(events.map((e) => e.kind)).toEqual(["zerocut"]);
    expect(events[0].pnl).toBeLessThan(-START * 2);
    expect(desk.account("a").balance).toBe(0);
    expect(desk.account("a").out).toBe(true);
    expect(desk.order("a", 1, 25)).toBe("You are out of the market until next round.");
  });

  it("fills a stop at the price that reached it, not at the stop's level", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.order("a", 1, 5);
    desk.stop("a", 1.19);
    const events = desk.mark(1.03);
    expect(events.map((e) => e.kind)).toEqual(["stop"]);
    expect(events[0].price).toBe(1.03);
    expect(desk.account("a").balance).toBeCloseTo(START + START * 5 * (1.03 * (1 - half) / (1.2 * (1 + half)) - 1), 0);
  });

  it("counts a stop that gaps past everything as a wipe-out, not a stop", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 1000);
    desk.stop("a", 99.99);
    const events = desk.mark(98);
    expect(events.map((e) => e.kind)).toEqual(["zerocut"]);
    expect(desk.account("a")).toMatchObject({ balance: 0, out: true, cuts: 1 });
  });

  it("warns again after a recovery", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    expect(desk.mark(99.5).map((e) => e.kind)).toEqual(["call"]);
    expect(desk.mark(100.5)).toEqual([]);
    expect(desk.mark(99.5).map((e) => e.kind)).toEqual(["call"]);
  });

  it("refuses an order it does not offer even when it would close the position", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10);
    expect(desk.order("a", -1, 7)).toBe("No such leverage.");
    expect(desk.order("a", -1, 10, 99)).toBe("Stake must be between 0 and 1.");
    expect(desk.account("a").pos).not.toBeNull();
  });

  it("triggers a short's stop when the price rises to it", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", -1, 5);
    desk.stop("a", 101);
    expect(desk.mark(100.5)).toEqual([]);
    expect(desk.mark(101.2).map((e) => e.kind)).toEqual(["stop"]);
  });

  it("closes on request, and refuses with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.close("a")).toBe("Nothing to close.");
    desk.order("a", -1, 5);
    expect(desk.close("a")).toMatchObject([{ kind: "close" }]);
    expect(desk.account("a").pos).toBeNull();
  });

  it("remembers the last forced close, so the player's page can show it once", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    expect(desk.account("a").cuts).toBe(0);
    desk.mark(99.2);
    expect(desk.account("a").cuts).toBe(1);
  });

  it("sets a stop a percentage away on the losing side, from its own price", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", -1, 5);
    expect(desk.stopAway("a", 2)).toBeNull();
    expect(desk.account("a").pos?.stop).toBeCloseTo(102);
    expect(desk.stopAway("a", 80)).toBe("A stop must be between 0% and 50% away.");
    expect(desk.stopAway("a", null)).toBeNull();
    expect(desk.account("a").pos?.stop).toBeNull();
  });

  it("refuses a stop on the wrong side of the price, or with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.stop("a", 99)).toBe("Open a position first.");
    desk.order("a", 1, 5);
    expect(desk.stop("a", 101)).toBe("A long's stop must be below the price.");
  });

  it("refuses orders with no free margin and leverage it does not offer", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.order("a", 1, 7)).toBe("No such leverage.");
    desk.order("a", 1, 5);
    expect(desk.order("a", 1, 5)).toBe("No free margin left.");
  });

  it("knows who traded this round and who only watched", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.join("b");
    desk.order("a", 1, 5);
    expect(desk.account("a").traded).toBe(true);
    expect(desk.account("b").traded).toBe(false);
  });

  it("settles every position at the round's last price and ranks by balance", () => {
    const desk = new Desk(100);
    for (const who of ["a", "b", "c"]) desk.join(who);
    desk.order("a", 1, 10);
    desk.order("b", -1, 10);
    desk.mark(103);
    const ranking = desk.settle();
    expect(ranking.map((r) => r.who)).toEqual(["a", "c", "b"]);
    expect(ranking[1].balance).toBe(START);
    expect(desk.account("a").pos).toBeNull();
  });

  it("lends a wiped-out player Dad's savings, but counts the debt against them", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.join("b");
    desk.order("a", 1, 1000);
    desk.mark(1.1);
    expect(desk.account("a").out).toBe(true);
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ balance: BORROW, debt: BORROW, out: false });
    for (let i = 1; i < LOANS; i++) {
      desk.order("a", 1, 1000);
      desk.mark(desk.price * 0.95);
      desk.borrow("a");
    }
    desk.order("a", 1, 1000);
    desk.mark(desk.price * 0.95);
    expect(desk.borrow("a")).toBe("Dad's savings are gone.");
    const ranking = desk.settle();
    expect(ranking.map((r) => r.who)).toEqual(["b", "a"]);
    expect(ranking[1].net).toBe(-BORROW * LOANS);
  });

  it("lends to a player left with crumbs after a stop-out, once nothing is open", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 1000);
    desk.mark(99.92);
    expect(desk.account("a").balance).toBeGreaterThan(0);
    expect(desk.account("a").balance).toBeLessThan(BROKE);
    expect(desk.account("a").out).toBe(false);
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a").debt).toBe(BORROW);
  });

  it("only lends to a player who is broke", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    expect(desk.borrow("a")).toBe("You still have money. For now.");
  });
});

// The chart draws where a position meets a margin call and the forced
// losscut. The desk works the prices out, so they are the prices its own
// rules act at, spread included.
describe("margin lines", () => {
  for (const side of [1, -1] as const) {
    it(`gives the ${side === 1 ? "long" : "short"}'s call and losscut prices, which the desk acts at`, () => {
      const desk = new Desk(100);
      desk.join("a");
      desk.order("a", side, 100, 0.5);
      const { call, cut } = desk.lines("a")!;
      // a long's lines are below the price, a short's above, the cut beyond the call
      expect(side * (100 - call)).toBeGreaterThan(0);
      expect(side * (call - cut)).toBeGreaterThan(0);
      // at the line the level is what the rule says
      for (const [price, level] of [[call, 0.5], [cut, 0.2]] as const) {
        const d = new Desk(100);
        d.join("a");
        d.order("a", side, 100, 0.5);
        d.price = price;
        expect(d.level("a")).toBeCloseTo(level, 9);
      }
      // just short of the call nothing happens; just past it, the call
      const near = new Desk(100);
      near.join("a");
      near.order("a", side, 100, 0.5);
      expect(near.mark(call + side * 1e-6)).toEqual([]);
      expect(near.mark(call - side * 1e-6)).toMatchObject([{ kind: "call" }]);
      expect(near.mark(cut - side * 1e-6)).toMatchObject([{ kind: "stopout" }]);
    });
  }

  it("has none with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.lines("a")).toBeNull();
  });
});

describe("a margin call's state", () => {
  it("holds while the level is at or under 50%, and clears when it recovers", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100, 0.5);
    const { call, cut } = desk.lines("a")!;
    desk.mark((call + cut) / 2);
    expect(desk.account("a").pos?.called).toBe(true);
    // still in the call a tick later, with no new event
    expect(desk.mark((call + cut) / 2 + 1e-9)).toEqual([]);
    expect(desk.account("a").pos?.called).toBe(true);
    desk.mark(100);
    expect(desk.account("a").pos?.called).toBe(false);
  });
});
