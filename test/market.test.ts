import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAYS, EVENTS, GAP, History, PAIRS, STEPS, live, path, random, replay } from "../src/market.ts";

const history = new History(readFileSync(join(import.meta.dirname, "..", "data", "ecb.csv"), "utf8"));

describe("the price history", () => {
  it("derives any pair from the euro rates", () => {
    const day = history.on("2015-01-15");
    expect(history.rate(day, "EUR/CHF")).toBeCloseTo(1.028);
    expect(history.rate(history.on("2015-01-14"), "EUR/CHF")).toBeCloseTo(1.201);
    expect(history.rate(history.on("2008-09-12"), "USD/JPY")).toBeCloseTo(107.29, 1);
  });

  it("covers every pair it offers", () => {
    for (const pair of PAIRS) expect(history.series(pair).length).toBeGreaterThan(5000);
  });

  it("has no yuan before April 2005", () => {
    expect(history.series("USD/CNY")[0].date >= "2005-04-01").toBe(true);
  });
});

describe("a round's path", () => {
  it("passes through every day's close at the day's end", () => {
    const closes = [100, 100.5, 99.8, 100.2];
    const prices = path(closes, random(1));
    expect(prices.length).toBe((closes.length - 1) * STEPS + 1);
    for (let d = 0; d < closes.length; d++) expect(prices[d * STEPS]).toBeCloseTo(closes[d], 10);
  });

  it("wanders between closes, so the price moves on every tick", () => {
    const prices = path([100, 100.4], random(2));
    expect(new Set(prices).size).toBe(prices.length);
  });

  it("gaps on a big day: the first tick is already near the close", () => {
    const prices = path([1.2, 1.2 * (1 - GAP * 3)], random(3));
    expect(prices[1]).toBeLessThan(1.2 * (1 - GAP * 2));
  });
});

describe("a replay", () => {
  it("hides an event day inside the window, never at its edges", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const round = replay(history, random(seed), 1);
      expect(round.days.length).toBe(DAYS + 1);
      const at = round.days.findIndex((d) => d === round.event!.date);
      expect(at).toBeGreaterThanOrEqual(10);
      expect(at).toBeLessThanOrEqual(DAYS - 6);
    }
  });

  it("knows each event's real day", () => {
    for (const event of EVENTS) expect(history.series(event.pair).some((d) => d.date === event.date)).toBe(true);
  });

  it("can also pick a quiet window anywhere", () => {
    const round = replay(history, random(5), 0);
    expect(round.event).toBeNull();
    expect(round.days.length).toBe(DAYS + 1);
    expect(round.prices.length).toBe(DAYS * STEPS + 1);
  });
});

describe("a live round", () => {
  it("starts from today's rate and is labelled simulated", () => {
    const round = live(history, "USD/JPY", 158.45, random(7));
    expect(round.prices[0]).toBe(158.45);
    expect(round.simulated).toBe(true);
    expect(round.prices.length).toBe(DAYS * STEPS + 1);
  });
});
