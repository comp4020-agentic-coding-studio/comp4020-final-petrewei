import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAYS, EVENTS, GAP, History, PAIRS, SCENARIOS, STEPS, live, path, random, replay } from "../src/market.ts";

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


// ADR 0027: the simulated tab, Scenario, plays out one of a few scripted
// markets from today's rate, hidden until the bell. Each script must leave
// its mark in the prices, over any seed, or the reveal is only a label.
describe("a scenario round", () => {
  const closes = (round: { prices: number[] }) => round.prices.filter((_, i) => i % STEPS === 0);
  const moves = (c: number[]) => c.slice(1).map((x, i) => Math.log(x / c[i]));
  const run = (id: string, seed: number) => live(history, "EUR/CHF", 1.08, random(seed), id);
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

  it("starts from today's rate, labelled simulated, with its scenario named", () => {
    const round = live(history, "USD/JPY", 158.45, random(7));
    expect(round.prices[0]).toBe(158.45);
    expect(round.simulated).toBe(true);
    expect(round.prices.length).toBe(DAYS * STEPS + 1);
    expect(SCENARIOS.map((x) => x.id)).toContain(round.scenario);
  });

  it("draws every scenario, and each has headlines for the feed", () => {
    const seen = new Set(seeds.concat(seeds.map((s) => s + 100)).map((s) => live(history, "USD/JPY", 150, random(s)).scenario));
    expect(seen.size).toBe(SCENARIOS.length);
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
    for (const x of SCENARIOS) {
      expect(x.headlines.length, x.id).toBeGreaterThanOrEqual(2);
      for (const h of x.headlines) expect(h.day, x.id).toBeLessThan(DAYS);
    }
  });

  it("breaks a peg: calm, then one day that dwarfs the rest", () => {
    for (const seed of seeds) {
      const m = moves(closes(run("peg", seed))).map(Math.abs);
      const big = Math.max(...m);
      expect(big, `seed ${seed}`).toBeGreaterThan(0.08);
      const before = m.slice(0, m.indexOf(big));
      expect(before.length, `seed ${seed}`).toBeGreaterThanOrEqual(12);
      expect(Math.max(...before), `seed ${seed}`).toBeLessThan(big / 5);
    }
  });

  it("unwinds a carry trade: a long grind one way, then a fall that takes it back", () => {
    for (const seed of seeds) {
      const raw = closes(run("carry", seed));
      // run either way up: read it on the grind's own side
      const c = raw[Math.floor(DAYS / 2)] > raw[0] ? raw : raw.map((x) => 1 / x);
      const top = c.indexOf(Math.max(...c));
      expect(top, `seed ${seed}`).toBeGreaterThan(DAYS * 0.4);
      expect(c[top] / c[0], `seed ${seed}`).toBeGreaterThan(1.02);
      expect(c.at(-1)! / c[top], `seed ${seed}`).toBeLessThan(0.95);
    }
  });

  it("runs each script either way up, so selling every round is no plan", () => {
    for (const x of SCENARIOS.filter((x) => x.id !== "chop")) {
      const ends = seeds.map((seed) => Math.sign(Math.log(run(x.id, seed).prices.at(-1)! / 1.08)));
      expect(ends.filter((e) => e > 0).length, x.id).toBeGreaterThan(3);
      expect(ends.filter((e) => e < 0).length, x.id).toBeGreaterThan(3);
    }
  });

  it("chops: no trend, but bigger daily swings than a calm market", () => {
    for (const seed of seeds) {
      const c = closes(run("chop", seed));
      const m = moves(c);
      const swing = Math.sqrt(m.reduce((s, x) => s + x * x, 0) / m.length);
      expect(Math.abs(Math.log(c.at(-1)! / c[0])), `seed ${seed}`).toBeLessThan(swing * 6);
    }
  });

  it("shocks on one day, then trends the same way", () => {
    for (const seed of seeds) {
      const m = moves(closes(run("shock", seed)));
      const at = m.reduce((b, x, i) => (Math.abs(x) > Math.abs(m[b]) ? i : b), 0);
      const way = Math.sign(m[at]);
      const after = m.slice(at + 1, at + 4).reduce((a, x) => a + x, 0);
      expect(Math.sign(after), `seed ${seed}`).toBe(way);
    }
  });

  it("builds a bubble that then turns", () => {
    for (const seed of seeds) {
      const raw = closes(run("bubble", seed));
      const c = raw[Math.floor(DAYS / 2)] > raw[0] ? raw : raw.map((x) => 1 / x);
      const top = c.indexOf(Math.max(...c));
      expect(top, `seed ${seed}`).toBeGreaterThan(DAYS * 0.4);
      expect(c.at(-1)! < c[top], `seed ${seed}`).toBe(true);
    }
  });

  it("intervenes: a slide, then one day that turns it", () => {
    for (const seed of seeds) {
      const raw = closes(run("intervention", seed));
      // read it with the intervention, the biggest move, pointing up
      const big = moves(raw).reduce((a, x) => (Math.abs(x) > Math.abs(a) ? x : a), 0);
      const c = big > 0 ? raw : raw.map((x) => 1 / x);
      const m = moves(c);
      const turn = m.indexOf(Math.max(...m));
      expect(turn, `seed ${seed}`).toBeGreaterThan(DAYS * 0.4);
      expect(c[turn] < c[0], `seed ${seed}`).toBe(true);
    }
  });

  it("ends every scenario's prices positive and finite", () => {
    for (const x of SCENARIOS) for (const seed of seeds) for (const p of run(x.id, seed).prices) expect(Number.isFinite(p) && p > 0, `${x.id} ${seed}`).toBe(true);
  });
});

// Each script is told at the bell and in the feed in every language, with
// one headline for each day the script has one.
it("tells every scenario, and each of its headlines, in every language", async () => {
  const { LANGS, T } = await import("../public/i18n.js");
  for (const lang of LANGS) {
    for (const x of SCENARIOS) {
      const story = T[lang].scenarios[x.id];
      expect(story, `${lang} ${x.id}`).toMatchObject({ name: expect.any(String), note: expect.any(String) });
      expect(story.headlines, `${lang} ${x.id}`).toHaveLength(x.headlines.length);
      for (const h of story.headlines) expect(h.length, `${lang} ${x.id}`).toBeGreaterThan(5);
    }
    expect(Object.keys(T[lang].scenarios).sort(), lang).toEqual(SCENARIOS.map((x) => x.id).sort());
  }
});
