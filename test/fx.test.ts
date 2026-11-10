import { describe, expect, it } from "vitest";
import { BROKE, Desk, LIMIT, SPREAD, START, STEP, dailyRate } from "../src/fx.ts";

it("keeps financing paid across closes, adds and cloned tutorial checkpoints, then resets for a fresh account", () => {
  const desk = new Desk(100);
  desk.join("a");
  desk.order("a", 1, 100, 0.5);
  desk.mark(100);
  const first = desk.account("a").pos!.fees;
  desk.order("a", 1, 30, 0.5);
  desk.mark(100);
  const paid = desk.account("a").pos!.fees;
  expect(paid).toBeGreaterThan(first);
  desk.close("a");
  expect(desk.account("a").financing).toBeCloseTo(paid);
  desk.order("a", -1, 30);
  desk.mark(100);
  const second = desk.account("a").pos!.fees;
  desk.settle();
  expect(desk.account("a").financing).toBeCloseTo(paid + second);
  expect(desk.clone().account("a").financing).toBeCloseTo(paid + second);
  desk.reset("a");
  expect(desk.account("a").financing).toBe(0);
});

const half = SPREAD / 2;

describe("the trading desk", () => {
  it("opens a position worth its margin times the leverage, at the ask or the bid", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 30);
    const pos = desk.account("a").pos!;
    expect(pos.notional).toBe(START * 30);
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

  it("uses only the share asked for, leaving the rest free", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.5);
    expect(desk.used("a")).toBe(START / 2);
    expect(desk.free("a")).toBeCloseTo(START / 2 - START * 5 * SPREAD, -3);
  });

  // A share is a share of the whole account, net worth, so 25% means a quarter of what you have however much is
  // already in use; only what is free can go in, so a share larger than that is cut to it.
  it("shares a share of the whole account, not of what is left free", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.25);
    const first = desk.used("a");
    expect(first).toBe(START / 4);
    desk.order("a", 1, 10, 0.25);
    // a second quarter is a quarter of the account again, not a quarter of the three quarters left
    expect(desk.used("a") - first).toBeCloseTo(desk.equity("a") / 4, -1);
    expect(desk.used("a") - first).toBeGreaterThan((START * 3) / 16 + 10);
  });

  it("cuts a share to what is free when the share asked for is more", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.75);
    const free = desk.free("a");
    desk.order("a", 1, 10, 0.5);
    expect(desk.used("a")).toBe(START * 0.75 + Math.floor(free));
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

  // ADR 0026: a forced loss cut ends the player's round. What is left is
  // kept, but no more orders until the bell, unless they draw emergency credit.
  it("warns once at a margin call, then stops the position out and the player with it", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    expect(desk.mark(99.5).map((e) => e.kind)).toEqual(["call"]);
    expect(desk.mark(99.45)).toEqual([]);
    const events = desk.mark(99.2);
    expect(events.map((e) => e.kind)).toEqual(["stopout"]);
    expect(desk.account("a").pos).toBeNull();
    expect(desk.account("a").balance).toBeGreaterThan(0);
    expect(desk.account("a").out).toBe(true);
    expect(desk.order("a", 1, 3)).toBe("You are out of the market until next round.");
  });

  it("lets a stopped-out player back in on emergency credit, a step at a time, until the line is used up", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    desk.mark(99.2);
    expect(desk.account("a").out).toBe(true);
    // the money left after the cut is still theirs, and counts at the bell
    const left = desk.account("a").balance;
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ out: false, balance: left + STEP, debt: STEP });
    expect(desk.order("a", 1, 100)).toEqual([expect.objectContaining({ kind: "open" })]);
    desk.close("a");
    // the line is LIMIT, drawn STEP by step; past it, a refusal
    while (desk.account("a").debt + STEP <= LIMIT) expect(desk.borrow("a")).toBeNull();
    expect(desk.borrow("a")).toMatch(/used up/);
  });
;

  it("does not send out a player whose own stop or close takes a loss", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    desk.stop("a", 99.6);
    expect(desk.mark(99.55).map((e) => e.kind)).toEqual(["stop"]);
    expect(desk.account("a").out).toBe(false);
    desk.order("a", 1, 10);
    desk.mark(98);
    desk.close("a");
    expect(desk.account("a").out).toBe(false);
  });

  it("zero-cuts a gap through the stop-out and sends the player out of the market", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.order("a", 1, 30);
    const events = desk.mark(1.03);
    expect(events.map((e) => e.kind)).toEqual(["zerocut"]);
    expect(events[0].pnl).toBeLessThan(-START * 2);
    expect(desk.account("a").balance).toBe(0);
    expect(desk.account("a").out).toBe(true);
    expect(desk.order("a", 1, 30)).toBe("You are out of the market until next round.");
  });

  it("fills a stop at the price that reached it, not at the stop's level", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.order("a", 1, 3);
    desk.stop("a", 1.19);
    const events = desk.mark(1.03);
    expect(events.map((e) => e.kind)).toEqual(["stop"]);
    expect(events[0].price).toBe(1.03);
    expect(desk.account("a").balance).toBeCloseTo(START + START * 3 * (1.03 * (1 - half) / (1.2 * (1 + half)) - 1), 0);
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
    expect(desk.order("a", -1, 10, 99)).toBe("Margin must be between 0 and 1.");
    expect(desk.account("a").pos).not.toBeNull();
  });

  it("triggers a short's stop when the price rises to it", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", -1, 3);
    desk.stop("a", 101);
    expect(desk.mark(100.5)).toEqual([]);
    expect(desk.mark(101.2).map((e) => e.kind)).toEqual(["stop"]);
  });

  it("closes on request, and refuses with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.close("a")).toBe("Nothing to close.");
    desk.order("a", -1, 3);
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
    desk.order("a", -1, 3);
    expect(desk.stopAway("a", 2)).toBeNull();
    expect(desk.account("a").pos?.stop).toBeCloseTo(102);
    expect(desk.stopAway("a", 80)).toBe("A Stop Loss must be 1%, 2%, 5%, 10%, 20% or 50% away.");
    expect(desk.stopAway("a", null)).toBeNull();
    expect(desk.account("a").pos?.stop).toBeNull();
  });

  it("refuses a stop on the wrong side of the price, or with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.stop("a", 99)).toBe("Open a position first.");
    desk.order("a", 1, 3);
    expect(desk.stop("a", 101)).toBe("A long's Stop Loss must be below the price.");
  });

  it("refuses orders with no free margin and leverage it does not offer", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.order("a", 1, 7)).toBe("No such leverage.");
    desk.order("a", 1, 3);
    expect(desk.order("a", 1, 3)).toBe("No free margin left.");
  });

  it("knows who traded this round and who only watched", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.join("b");
    desk.order("a", 1, 3);
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

  it("lends a wiped-out player credit, and ranks them by what they have less what they owe", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    desk.join("b");
    desk.order("a", 1, 1000);
    desk.mark(1.1);
    expect(desk.account("a").out).toBe(true);
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ balance: STEP, debt: STEP, out: false });
    desk.order("a", 1, 1000);
    desk.mark(desk.price * 0.95);
    expect(desk.bankrupt("a"), "wiped out again, still owing the step").toBe(true);
    const ranking = desk.settle();
    expect(ranking.map((r) => r.who)).toEqual(["b", "a"]);
    expect(ranking[1].net).toBeLessThan(0);
  });
;

  it("lends to a player left with crumbs after closing at a loss", () => {
    const desk = new Desk(100);
    desk.join("a");
    // two losing closes at 1000×, each taken by hand above the cut
    desk.order("a", 1, 1000);
    desk.mark(99.94);
    desk.close("a");
    desk.order("a", 1, 1000);
    desk.mark(99.88004);
    desk.close("a");
    expect(desk.account("a").balance).toBeGreaterThan(0);
    expect(desk.account("a").balance).toBeLessThan(BROKE);
    expect(desk.account("a").out).toBe(false);
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a").debt).toBe(STEP);
  });

  it("lends to anyone who asks, broke or not, as a credit line does", () => {
    const desk = new Desk(1.2);
    desk.join("a");
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ balance: START + STEP, debt: STEP });
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

// The debug console's lever: one account's margin level set at the
// current price, which the desk's rules then act on. No other account
// and no price moves.
describe("rebase, for the debug console", () => {
  for (const side of [1, -1] as const) {
    it(`sets a ${side === 1 ? "long" : "short"}'s margin level without moving the price or anyone else`, () => {
      const desk = new Desk(100);
      desk.join("a");
      desk.join("b");
      desk.order("a", side, 100, 0.5);
      desk.order("b", side, 100, 0.5);
      const before = desk.equity("b");
      expect(desk.rebase("a", 0.4)).toBe(true);
      expect(desk.level("a")).toBeCloseTo(0.4, 9);
      expect(desk.price).toBe(100);
      expect(desk.equity("b")).toBe(before);
      // the desk's own rule then calls it, at the unchanged price, and
      // nobody else
      expect(desk.enforce("a")).toMatchObject([{ kind: "call", who: "a" }]);
      desk.rebase("a", 0.1);
      expect(desk.enforce("a")).toMatchObject([{ kind: "stopout", who: "a" }]);
      expect(desk.account("b").pos).not.toBeNull();
    });
  }
  it("does nothing with no position", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.rebase("a", 0.4)).toBe(false);
  });
});

// ADR 0024, 0033, 0059: the leverage ladder. A slider snaps to these, evenly
// spaced, with Australia's retail cap for major pairs (30×) on it. Japan's 25×
// was dropped, and so was 50×.
describe("the leverage ladder", () => {
  it("offers the ladder, both legal caps, and nothing between", async () => {
    const { LEVERAGES } = await import("../src/fx.ts");
    expect(LEVERAGES).toEqual([1, 3, 10, 30, 100, 300, 1000]);
    const desk = new Desk(100);
    for (const lev of LEVERAGES) {
      desk.join(`p${lev}`);
      expect(desk.order(`p${lev}`, 1, lev, 0.75), String(lev)).toEqual([expect.objectContaining({ kind: "open", leverage: lev })]);
    }
    desk.join("x");
    // including the rungs of the ladder before this one: the desk takes the page's ladder and no other
    for (const lev of [2, 4, 5, 25, 50, 200, 400, 500, 999, 1001, 0]) expect(desk.order("x", 1, lev), String(lev)).toBe("No such leverage.");
  });
});

// ADR 0032: stop loss and take profit. A take profit closes a winning
// position at its level, or better if the price gaps past it; a stop loss
// closes a losing one at its level, or worse on a gap. Each is set as a
// distance from the desk's price, on the right side, and both may be
// attached as an order opens a position.
describe("stop loss and take profit", () => {
  it("takes profit when a long rises to it, and a short falls to it", () => {
    const long = new Desk(100);
    long.join("a");
    long.order("a", 1, 10);
    expect(long.takeAway("a", 1)).toBeNull();
    expect(long.mark(100.5)).toEqual([]);
    const done = long.mark(101.1);
    expect(done.map((e) => e.kind)).toEqual(["take"]);
    expect(done[0].pnl).toBeGreaterThan(0);
    expect(long.account("a").pos).toBeNull();
    const short = new Desk(100);
    short.join("a");
    short.order("a", -1, 10);
    short.takeAway("a", 1);
    expect(short.mark(98.9).map((e) => e.kind)).toEqual(["take"]);
  });

  it("fills a take profit at the better price when the price gaps past it", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10);
    desk.takeAway("a", 1);
    const [fill] = desk.mark(105);
    expect(fill).toMatchObject({ kind: "take", price: 105 });
  });

  it("refuses a take profit on the losing side, or out of range", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.takeAway("a", 1)).toBe("Open a position first.");
    desk.order("a", 1, 10);
    expect(desk.take("a", 99)).toBe("A long's Take Profit must be above the price.");
    for (const bad of [0, 0.5, 0.99, -1, 51]) expect(desk.takeAway("a", bad), String(bad)).toBe("A Take Profit must be 1%, 2%, 5%, 10%, 20% or 50% away.");
    expect(desk.takeAway("a", 1)).toBeNull();
    expect(desk.takeAway("a", 50)).toBeNull();
    expect(desk.takeAway("a", null)).toBeNull();
    expect(desk.account("a").pos?.take).toBeNull();
  });

  it("attaches a stop loss and a take profit as an order opens, not as it adds", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 0.5, { sl: 1, tp: 2 });
    const pos = desk.account("a").pos!;
    expect(pos.stop).toBeCloseTo(99, 6);
    expect(pos.take).toBeCloseTo(102, 6);
    // an add keeps the orders as they were
    desk.mark(100.5);
    desk.order("a", 1, 10, 0.5, { sl: 5, tp: 9 });
    expect(desk.account("a").pos!.stop).toBeCloseTo(99, 6);
    expect(desk.account("a").pos!.take).toBeCloseTo(102, 6);
  });

  it("refuses an order whose attached distances are out of range, opening nothing", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.order("a", 1, 10, 1, { sl: 60 })).toBe("A Stop Loss must be 1%, 2%, 5%, 10%, 20% or 50% away.");
    expect(desk.order("a", 1, 10, 1, { sl: 0.5 })).toBe("A Stop Loss must be 1%, 2%, 5%, 10%, 20% or 50% away.");
    expect(desk.order("a", 1, 10, 1, { tp: 0 })).toBe("A Take Profit must be 1%, 2%, 5%, 10%, 20% or 50% away.");
    expect(desk.account("a").pos).toBeNull();
  });

  it("closes at the stop when one move crosses both, the cautious reading", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 10, 1, { sl: 1, tp: 1 });
    // a gap down through the stop: the take profit above can't fill
    expect(desk.mark(98.5).map((e) => e.kind)).toEqual(["stop"]);
  });
});

// ADR 0080: emergency credit, which replaced Dad's savings. Interest is charged each tick, a tick's share of a daily
// rate that rises with the debt, and added to what is owed; a step is repaid from free cash; owing more than you have is
// bankruptcy.
// ADR 0081: the desk keeps each player's closed trades for the round: how it ended, its prices, its result in yen and
// on its margin.
it("records each closed trade, how it ended and its result on its margin", () => {
  const desk = new Desk(100);
  desk.join("a");
  desk.order("a", 1, 10, 0.5, { tp: 1 });
  desk.mark(101.5);
  desk.order("a", -1, 10, 0.5);
  desk.close("a");
  const [took, closed] = desk.account("a").trades;
  expect(took).toMatchObject({ side: 1, leverage: 10, how: "take" });
  expect(took.pnl).toBeGreaterThan(0);
  // about ten times the move, on the margin, less the spread
  expect(took.pct).toBeGreaterThan(0.1);
  expect(took.exit).toBeCloseTo(101.5 * (1 - SPREAD / 2), 6);
  expect(closed).toMatchObject({ side: -1, how: "close" });
  expect(closed.pct, "a round trip at one price costs the spread").toBeLessThan(0);
});

describe("emergency credit", () => {
  it("charges a day's interest over a day's ticks, at the rate for what is owed, and adds it to the debt", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.dayTicks = 10;
    desk.borrow("a");
    for (let i = 0; i < 10; i++) desk.mark(100);
    // 0.5% a day on A$1,000, compounded over ten ticks
    expect(desk.account("a").debt).toBeCloseTo(STEP * (1 + 0.005 / 10) ** 10, 6);
    expect(desk.account("a").interest).toBeCloseTo(desk.account("a").debt - STEP, 6);
  });
  it("charges more a day the more is owed", () => {
    expect(dailyRate(1_000)).toBe(0.005);
    expect(dailyRate(3_000)).toBe(0.005);
    expect(dailyRate(3_001)).toBe(0.01);
    expect(dailyRate(6_001)).toBe(0.015);
    expect(dailyRate(LIMIT)).toBe(0.015);
    // far over any legal rate, a loan shark's: well over 100% a year even at the lowest tier
    expect(dailyRate(STEP) * 365).toBeGreaterThan(1);
    // and felt in a round: the whole line, left a five-day round, costs over 5% of itself
    expect((1 + dailyRate(LIMIT)) ** 5 - 1).toBeGreaterThan(0.05);
  });
  it("repays a step from free cash, never from the margin in use, and refuses with nothing owed or free", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.repay("a")).toMatch(/owe nothing/);
    desk.borrow("a");
    desk.borrow("a");
    expect(desk.repay("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ debt: STEP, balance: START + STEP });
    // everything in a position: nothing free to repay with
    desk.order("a", 1, 10, 1);
    expect(desk.repay("a")).toMatch(/no free cash/);
    desk.close("a");
    expect(desk.repay("a")).toBeNull();
    expect(desk.account("a").debt).toBe(0);
  });
  it("is bankrupt only when what you have, less what you owe, is under nothing", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.borrow("a");
    expect(desk.bankrupt("a")).toBe(false);
    desk.account("a").balance = STEP - 1;
    expect(desk.bankrupt("a")).toBe(true);
  });
});
describe("the financing fee", () => {
  it("is nothing to notice at 1× and costs more than the leverage as it rises", async () => {
    const { feeRate } = await import("../src/fx.ts");
    expect(feeRate(1000) / feeRate(1)).toBeCloseTo(1_000_000, 3);
    // a round's ticks, from the clock itself, so the promise holds however the clock is cut
    const { DAY_TICKS, PLAY_DAYS } = await import("../src/market.ts");
    const round = DAY_TICKS * PLAY_DAYS;
    expect(feeRate(100) * round, "a round at 100× costs under 1% of the margin").toBeLessThan(0.01);
    expect(feeRate(1000) * round, "and at 1000× over a third of it").toBeGreaterThan(0.3);
  });
  it("is charged each tick on the open position, and counts against its profit", async () => {
    const { Desk, feeRate } = await import("../src/fx.ts");
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 300);
    const before = desk.pnl("a");
    for (let i = 0; i < 10; i++) desk.mark(100);
    const margin = desk.account("a").pos!.margin;
    expect(before - desk.pnl("a")).toBeCloseTo(10 * margin * feeRate(300), 4);
  });
  it("leaves the margin lines where the desk acts on them", async () => {
    const { Desk } = await import("../src/fx.ts");
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100, 0.5);
    for (let i = 0; i < 50; i++) desk.mark(100);
    const { call } = desk.lines("a")!;
    const d = new Desk(100);
    d.join("a");
    d.order("a", 1, 100, 0.5);
    d.account("a").pos!.fees = desk.account("a").pos!.fees;
    d.price = call;
    expect(d.level("a")).toBeCloseTo(0.5, 9);
  });
});

// ADR 0064: a stop loss or take profit is one of six distances, and the desk, not the
// page, holds that to them: a distance that used to be allowed is turned away.
describe("the six distances", () => {
  it("accepts 1%, 2%, 5%, 10%, 20% and 50% and nothing between them", async () => {
    const { Desk, DISTANCES } = await import("../src/fx.ts");
    expect(DISTANCES).toEqual([1, 2, 5, 10, 20, 50]);
    for (const d of DISTANCES) {
      const desk = new Desk(100);
      desk.join("a");
      expect(desk.order("a", 1, 10, 1, { sl: d, tp: d }), `${d}%`).toEqual([expect.objectContaining({ kind: "open" })]);
      expect(desk.stopAway("a", d), `stop ${d}%`).toBeNull();
      expect(desk.takeAway("a", d), `take ${d}%`).toBeNull();
    }
    for (const bad of [0, 0.5, 1.5, 3, 4, 7.5, 15, 30, 51, -5]) {
      const desk = new Desk(100);
      desk.join("a");
      expect(desk.order("a", 1, 10, 1, { sl: bad }), `sl ${bad}`).toMatch(/must be 1%, 2%, 5%, 10%, 20% or 50% away/);
      expect(desk.order("a", 1, 10, 1, { tp: bad }), `tp ${bad}`).toMatch(/must be 1%, 2%, 5%, 10%, 20% or 50% away/);
      expect(desk.account("a").pos, `nothing opens at ${bad}%`).toBeNull();
    }
  });
});


// ADR 0078, 0079: a pending order, the FX entry order: buy or sell when the price reaches the level typed.
// Buying below the price is a Buy Limit, above it a Buy Stop; selling above is a Sell Limit, below a Sell Stop.
describe("a pending order", () => {
  const desk = () => {
    const d = new Desk(100);
    d.join("a");
    return d;
  };
  it("names itself by side and where its level sits, by where the typed level sits against the price", () => {
    const d = desk();
    expect(d.pend("a", { side: 1, at: 98, leverage: 10, share: 0.5 })).toBeNull();
    expect(d.account("a").pending).toMatchObject({ type: "buy-limit", side: 1, at: 98 });
    d.pend("a", { side: 1, at: 105, leverage: 10, share: 0.5 });
    expect(d.account("a").pending).toMatchObject({ type: "buy-stop", at: 105 });
    d.pend("a", { side: -1, at: 101, leverage: 10, share: 0.5 });
    expect(d.account("a").pending).toMatchObject({ type: "sell-limit", at: 101 });
    d.pend("a", { side: -1, at: 99, leverage: 10, share: 0.5 });
    expect(d.account("a").pending).toMatchObject({ type: "sell-stop", at: 99 });
  });

  it("waits until the price reaches its level, then fills as a click would, with its own share and leverage", () => {
    const d = desk();
    d.pend("a", { side: 1, at: 98, leverage: 10, share: 0.5 });
    expect(d.mark(99)).toEqual([]);
    expect(d.account("a").pos).toBeNull();
    const fills = d.mark(97.5);
    expect(fills.map((f) => f.kind)).toEqual(["open"]);
    expect(d.account("a").pos).toMatchObject({ side: 1, leverage: 10, margin: START / 2 });
    expect(d.account("a").pending, "a filled order is gone").toBeNull();
  });

  it("treats the typed level as a trigger only: it fills at the desk's own price on the tick that reaches it", () => {
    const d = desk();
    d.pend("a", { side: 1, at: 98.5, leverage: 10, share: 1 });
    d.mark(97);
    // a buy fills at the ask over 97, never at the 98.5 the player typed
    expect(d.account("a").pos!.entry).toBeLessThan(97.1);
  });

  it("fills at the price it gapped to, as a stop order does", () => {
    const d = desk();
    d.pend("a", { side: -1, at: 98, leverage: 10, share: 1 });
    d.mark(90);
    expect(d.account("a").pos?.entry).toBeLessThan(91);
  });

  it("keeps one at a time: a new one replaces the old, and none cancels it", () => {
    const d = desk();
    d.pend("a", { side: 1, at: 98, leverage: 10, share: 0.5 });
    d.pend("a", { side: -1, at: 105, leverage: 30, share: 0.25 });
    expect(d.account("a").pending).toMatchObject({ type: "sell-limit", at: 105 });
    expect(d.unpend("a")).toBeNull();
    expect(d.account("a").pending).toBeNull();
    expect(d.unpend("a")).toMatch(/no pending order/i);
  });

  it("refuses a level at the price or more than half away, a leverage off the ladder, or a trader out of the round", () => {
    const d = desk();
    expect(d.pend("a", { side: 1, at: 49, leverage: 10, share: 0.5 })).toMatch(/within 50%/);
    expect(d.pend("a", { side: 1, at: 151, leverage: 10, share: 0.5 })).toMatch(/within 50%/);
    expect(d.pend("a", { side: 1, at: 100, leverage: 10, share: 0.5 })).toMatch(/price now/);
    expect(d.pend("a", { side: 1, at: Number.NaN, leverage: 10, share: 0.5 })).toMatch(/type the price/i);
    expect(d.pend("a", { side: 1, at: 98, leverage: 7, share: 0.5 })).toMatch(/leverage/i);
    d.account("a").out = true;
    expect(d.pend("a", { side: 1, at: 98, leverage: 10, share: 0.5 })).toMatch(/out of the market/i);
  });

  it("carries a stop loss and a take profit onto the position it opens", () => {
    const d = desk();
    d.pend("a", { side: 1, at: 98, leverage: 10, share: 0.5, sl: 1, tp: 5 });
    d.mark(98);
    const pos = d.account("a").pos!;
    expect(pos.stop).toBeCloseTo(98 * 0.99, 6);
    expect(pos.take).toBeCloseTo(98 * 1.05, 6);
  });
});

it("reports a pending order refused at its trigger when the player used the free margin", () => {
  const desk = new Desk(100);
  desk.join("me");
  expect(desk.pend("me", { side: 1, at: 100.001, leverage: 10, share: 1 })).toBeNull();
  desk.order("me", 1, 1);
  expect(desk.mark(100.001)).toContainEqual(expect.objectContaining({
    kind: "pending-refused", who: "me", reason: "No free margin left.",
  }));
  expect(desk.account("me").pending).toBeNull();
});

// ADR 0095: the bell's "what if", the same trade at another leverage through the prices it was open over.
describe("a trade at another leverage", () => {
  it("scales a held trade's result with the leverage", async () => {
    const { atLeverage } = await import("../src/fx.ts");
    // A$1,000 long from 100 to 101 held: 1% on A$1,000 at 1x is about A$10, at 30x about A$300
    expect(atLeverage(1, 100, 101, 1000, 1, [100, 100.5, 101]).pnl).toBe(10);
    expect(atLeverage(1, 100, 101, 1000, 30, [100, 100.5, 101]).pnl).toBe(300);
  });
  it("stops out a high leverage on a dip a low one rides through, at what the stop-out leaves", async () => {
    const { atLeverage } = await import("../src/fx.ts");
    // a 0.5% dip on the way to a 1% gain: nothing at 1x, a wipe-out at 1000x, where 0.08% against is 80% of the margin
    const path = [100, 99.5, 100.5, 101];
    const low = atLeverage(1, 100, 101, 1000, 1, path);
    const high = atLeverage(1, 100, 101, 1000, 1000, path);
    expect(low).toEqual({ pnl: 10, stoppedOut: false });
    expect(high.stoppedOut).toBe(true);
    // stopped out at 20%: four fifths of the margin gone
    expect(high.pnl).toBe(-800);
    // a short loses on the same rise
    expect(atLeverage(-1, 100, 101, 1000, 1, path).pnl).toBe(-10);
  });
  it("records the marks a trade was open between, for the bell to read its prices", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.mark(100);
    desk.order("a", 1, 10, 0.5);
    desk.mark(100.5);
    desk.mark(101);
    desk.close("a");
    expect(desk.account("a").trades[0]).toMatchObject({ opened: 1, closed: 3, margin: START / 2 });
  });
});

it("keeps trade timestamps and the interest clock when restoring a desk checkpoint", () => {
  const desk = new Desk(100);
  desk.dayTicks = 10;
  desk.join("a");
  desk.borrow("a");
  for (let tick = 0; tick < 5; tick++) desk.mark(100);
  desk.order("a", 1, 10, 0.25);
  const restored = desk.clone();
  restored.mark(101);
  restored.close("a");
  expect(desk.account("a").trades).toEqual([]);
  desk.mark(101);
  desk.close("a");
  expect(restored.account("a")).toEqual(desk.account("a"));
});
