import { describe, expect, it } from "vitest";
import { BORROW, BROKE, Desk, LOANS, SPREAD, START } from "../src/fx.ts";

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

  // ADR 0026: a forced loss cut ends the player's round. What is left is
  // kept, but no more orders until the bell, unless they borrow from Dad.
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
    expect(desk.order("a", 1, 5)).toBe("You are out of the market until next round.");
  });

  it("lets a stopped-out player back in only on Dad's money, and a second cut on it ends the round", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 100);
    desk.mark(99.2);
    expect(desk.account("a").out).toBe(true);
    // the money left after the cut is still theirs, and counts at the bell
    const left = desk.account("a").balance;
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a")).toMatchObject({ out: false, balance: left + BORROW, debt: BORROW });
    expect(desk.order("a", 1, 100)).toEqual([expect.objectContaining({ kind: "open" })]);
    desk.mark(98.4);
    expect(desk.account("a").out).toBe(true);
    expect(desk.borrow("a")).toBeNull();
    desk.order("a", 1, 100);
    desk.mark(97.6);
    expect(desk.account("a").out).toBe(true);
    expect(desk.borrow("a")).toBe("Dad's savings are gone.");
    expect(desk.account("a").cuts).toBe(3);
  });

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
    expect(desk.stopAway("a", 80)).toBe("A Stop Loss must be between 1% and 50% away.");
    expect(desk.stopAway("a", null)).toBeNull();
    expect(desk.account("a").pos?.stop).toBeNull();
  });

  it("refuses a stop on the wrong side of the price, or with nothing open", () => {
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.stop("a", 99)).toBe("Open a position first.");
    desk.order("a", 1, 5);
    expect(desk.stop("a", 101)).toBe("A long's Stop Loss must be below the price.");
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

  it("lends to a player left with crumbs after closing at a loss, once nothing is open", () => {
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

// ADR 0024, 0033: the leverage ladder. A log-scale slider snaps to these,
// with Australia's retail cap for major pairs (30×) on it, and 500× where
// 400× was. Japan's 25× was dropped.
describe("the leverage ladder", () => {
  it("offers the ladder, both legal caps, and nothing between", async () => {
    const { LEVERAGES } = await import("../src/fx.ts");
    expect(LEVERAGES).toEqual([1, 2, 5, 10, 30, 50, 100, 200, 500, 1000]);
    const desk = new Desk(100);
    for (const lev of LEVERAGES) {
      desk.join(`p${lev}`);
      expect(desk.order(`p${lev}`, 1, lev, 0.75), String(lev)).toEqual([expect.objectContaining({ kind: "open", leverage: lev })]);
    }
    desk.join("x");
    for (const lev of [3, 25, 400, 999, 1001, 0]) expect(desk.order("x", 1, lev), String(lev)).toBe("No such leverage.");
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
    for (const bad of [0, 0.5, 0.99, -1, 51]) expect(desk.takeAway("a", bad), String(bad)).toBe("A Take Profit must be between 1% and 50% away.");
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
    expect(desk.order("a", 1, 10, 1, { sl: 60 })).toBe("A Stop Loss must be between 1% and 50% away.");
    expect(desk.order("a", 1, 10, 1, { sl: 0.5 })).toBe("A Stop Loss must be between 1% and 50% away.");
    expect(desk.order("a", 1, 10, 1, { tp: 0 })).toBe("A Take Profit must be between 1% and 50% away.");
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

// ADR 0057 and 0058: "borrowing" from Dad is open to a player under a margin
// call, he finds out, and the financing fee grows with the leverage squared.
describe("Dad's savings", () => {
  it("lets a player under a margin call take the money, before anything is lost", async () => {
    const { Desk, BORROW } = await import("../src/fx.ts");
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 1000);
    expect(desk.borrow("a")).toMatch(/still have money/);
    desk.mark(99.965);
    expect(desk.called("a")).toBe(true);
    expect(desk.borrow("a")).toBeNull();
    expect(desk.account("a").debt).toBe(BORROW);
  });
  it("is found out: the position is closed, the player is grounded, and it counts once", async () => {
    const { Desk } = await import("../src/fx.ts");
    const desk = new Desk(100);
    desk.join("a");
    expect(desk.discover("a"), "nothing taken, nothing found").toEqual([]);
    desk.order("a", 1, 10);
    desk.mark(90);
    desk.account("a").balance = 50_000;
    desk.account("a").pos = null;
    desk.borrow("a");
    desk.order("a", 1, 1);
    const found = desk.discover("a");
    expect(found.map((f) => f.kind)).toEqual(["close", "caught"]);
    expect(desk.account("a").pos).toBeNull();
    expect(desk.account("a").out).toBe(true);
    expect(desk.account("a").caught).toBe(1);
    expect(desk.discover("a"), "found out only once").toEqual([]);
    expect(desk.borrow("a")).toMatch(/hidden/);
  });
});
describe("the financing fee", () => {
  it("is nothing to notice at 1× and costs more than the leverage as it rises", async () => {
    const { feeRate } = await import("../src/fx.ts");
    expect(feeRate(1000) / feeRate(1)).toBeCloseTo(1_000_000, 3);
    expect(feeRate(100) * 360, "a round at 100× costs under 1% of the margin").toBeLessThan(0.01);
    expect(feeRate(1000) * 360, "and at 1000× over a third of it").toBeGreaterThan(0.3);
  });
  it("is charged each tick on the open position, and counts against its profit", async () => {
    const { Desk, feeRate } = await import("../src/fx.ts");
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 500);
    const before = desk.pnl("a");
    for (let i = 0; i < 10; i++) desk.mark(100);
    const margin = desk.account("a").pos!.margin;
    expect(before - desk.pnl("a")).toBeCloseTo(10 * margin * feeRate(500), 4);
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
