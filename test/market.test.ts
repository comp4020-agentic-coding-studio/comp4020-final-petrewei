import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DAYS, EFFECTS, EVENTS, GAP, History, LOOKBACK, NEWS_SIZE, NEWS_WORDS, PAIRS, SCENARIOS, STEPS, drawNews, newsDrift, path, random, replay, scenario, storyOf } from "../src/market.ts";

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
  it("plays every plot, and each lands its day between day 11 and day 28 of the thirty", () => {
    for (const plot of EVENTS) {
      for (let seed = 1; seed <= 25; seed++) {
        const round = replay(history, random(seed), plot.id);
        expect(round.event?.id, plot.id).toBe(plot.id);
        expect(round.pair, plot.id).toBe(plot.pair);
        expect(round.days.length).toBe(DAYS + 1);
        expect(round.prices.length).toBe(DAYS * STEPS + 1);
        const at = round.days.indexOf(plot.date);
        expect(at, `${plot.id} seed ${seed}`).toBeGreaterThanOrEqual(11);
        expect(at, `${plot.id} seed ${seed}`).toBeLessThanOrEqual(DAYS - 2);
      }
    }
  });

  it("starts each plot at a different place in the calendar, so the day it lands on moves", () => {
    for (const plot of EVENTS) {
      const lands = new Set(Array.from({ length: 40 }, (_, seed) => replay(history, random(seed + 1), plot.id).days.indexOf(plot.date)));
      expect(lands.size, plot.id).toBeGreaterThan(5);
    }
  });

  it("draws a plot at random when none is named, and every plot comes up", () => {
    const seen = new Set(Array.from({ length: 300 }, (_, seed) => replay(history, random(seed + 1)).event!.id));
    expect(seen.size).toBe(EVENTS.length);
  });

  it("has thirteen plots, each a real day in the data, with its own pair, id and date", () => {
    expect(EVENTS.length).toBe(13);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    expect(new Set(EVENTS.map((e) => e.date)).size, "clues and notes are keyed by date").toBe(EVENTS.length);
    for (const event of EVENTS) expect(history.series(event.pair).some((d) => d.date === event.date), event.id).toBe(true);
  });

  it("makes each plot's day stand out: the move around it is a real one", () => {
    // a swan is a market that broke, so some move around the day is large for its pair
    for (const event of EVENTS) {
      const series = history.series(event.pair).map((d) => d.rate);
      const at = history.series(event.pair).findIndex((d) => d.date === event.date);
      const typical = Math.sqrt(series.slice(at - 40, at - 10).slice(1).reduce((a, x, i) => a + Math.log(x / series[at - 40 + i]) ** 2, 0) / 29);
      const worst = Math.max(...Array.from({ length: 11 }, (_, k) => Math.abs(Math.log(series[at + k - 1] / series[at + k - 11]))));
      expect(worst / typical, event.id).toBeGreaterThan(3);
    }
  });
});

// ADR 0027: the simulated tab, Simulation, plays out one of a few shaped
// markets from today's rate, hidden until the bell. Each script must leave
// its mark in the prices, over any seed, or the reveal is only a label.
describe("a scenario round", () => {
  const closes = (round: { prices: number[] }) => round.prices.filter((_, i) => i % STEPS === 0);
  // Which way a run went is read on a day before any script's turn, which is day 13 at the
  // earliest; the middle of a thirty-day round is already after it.
  const GRIND = 10;
  const moves = (c: number[]) => c.slice(1).map((x, i) => Math.log(x / c[i]));
  // the scenario's own shape, with no news on top of it, which is checked on its own below
  const run = (id: string, seed: number) => scenario(history, "EUR/CHF", 1.08, random(seed), id, true);
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

  it("starts from today's rate, labelled simulated, with its scenario named", () => {
    const round = scenario(history, "USD/JPY", 158.45, random(7));
    expect(round.prices[0]).toBe(158.45);
    expect(round.simulated).toBe(true);
    expect(round.prices.length).toBe(DAYS * STEPS + 1);
    expect(SCENARIOS.map((x) => x.id)).toContain(round.scenario);
  });

  it("draws every scenario, and each has headlines for the feed", () => {
    const seen = new Set(seeds.concat(seeds.map((s) => s + 100)).map((s) => scenario(history, "USD/JPY", 150, random(s)).scenario));
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
      const c = raw[GRIND] > raw[0] ? raw : raw.map((x) => 1 / x);
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
      const c = raw[GRIND] > raw[0] ? raw : raw.map((x) => 1 / x);
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

// ADR 0030: a Replay round drips two clues before its hidden day, as Scenario's
// headlines do, never naming it.
describe("a replay's clues", () => {
  it("drops two clues before the hidden day", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const round = replay(history, random(seed));
      const day = round.days.indexOf(round.event!.date);
      expect(round.headlines, `seed ${seed}`).toHaveLength(2);
      for (const h of round.headlines!) expect(h.day, `seed ${seed}`).toBeLessThan(day);
      expect(round.headlines![0].day).toBeLessThan(round.headlines![1].day);
    }
  });

  it("has two clues for every famous day, in every language, that don't give it away", async () => {
    const { LANGS, T } = await import("../public/i18n.js");
    for (const lang of LANGS) {
      for (const e of EVENTS) {
        const clues = T[lang].clues?.[e.date];
        expect(clues, `${lang} ${e.date}`).toHaveLength(2);
        for (const c of clues) {
          // no year, and not the event's own title
          expect(c, `${lang} ${e.date}`).not.toMatch(/(19|20)\d\d/);
          expect(c, `${lang} ${e.date}`).not.toContain(T[lang].events?.[e.date]?.title ?? e.title);
        }
      }
    }
  });
});

// ADR 0062: a round is thirty days, drawn after thirty days of the market before
// it, so the chart opens full and the new price arrives at its right end. The
// history is real for both tabs and ends on the open price, so nothing jumps.
describe("the thirty days before a round", () => {
  const ticks = LOOKBACK * STEPS + 1;
  it("is thirty days of ticks that end on the open, in a replay and in a simulation", () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const round of [replay(history, random(seed)), scenario(history, "USD/JPY", 158.45, random(seed))]) {
        expect(round.history.length, `seed ${seed}`).toBe(ticks);
        expect(round.history.at(-1), `seed ${seed}: the history ends where the round opens`).toBeCloseTo(round.prices[0], 9);
        for (const p of round.history) expect(Number.isFinite(p) && p > 0).toBe(true);
      }
    }
  });
  it("is the real market just before a replay's open, so a famous day is never inside it", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const round = replay(history, random(seed));
      const series = history.series(round.pair);
      const start = series.findIndex((d) => d.date === round.days[0]);
      const real = series.slice(start - LOOKBACK, start + 1).map((d) => d.rate);
      const closes = round.history.filter((_, i) => i % STEPS === 0);
      real.forEach((rate, i) => expect(closes[i], `seed ${seed} day ${i}`).toBeCloseTo(rate, 9));
      expect(real.length).toBe(LOOKBACK + 1);
    }
  });
  it("is the pair's real last thirty days for a simulation, ending on today's rate", () => {
    const series = history.series("EUR/USD");
    const round = scenario(history, "EUR/USD", 1.2345, random(4));
    const closes = round.history.filter((_, i) => i % STEPS === 0);
    expect(closes.at(-1)).toBeCloseTo(1.2345, 9);
    series.slice(-LOOKBACK).forEach((d, i) => expect(closes[i], `day ${i}`).toBeCloseTo(d.rate, 9));
  });
});

// ADR 0064: news in a Simulation. Three stories break in a round, and each may push the
// price afterwards, as a rise, a fall or a V, or do nothing at all. The push is real, in
// the prices the round plays, and the words are only a hint.
describe("news in a simulation", () => {
  it("draws up to three stories a round, apart from each other, all before the scenario turns", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const crash = 13 + (seed % 10);
      const news = drawNews(random(seed), crash);
      expect(news.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(news.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      for (const [i, n] of news.entries()) {
        expect(n.day, `seed ${seed}`).toBeGreaterThanOrEqual(3);
        expect(n.day, `seed ${seed}: news is the build-up, done before the turn`).toBeLessThanOrEqual(crash - 2);
        expect(EFFECTS).toContain(n.effect);
        expect(n.n).toBeLessThan(NEWS_WORDS);
        if (i) expect(n.day - news[i - 1].day, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("has the words for every story in every language, in the order the numbers expect", async () => {
    const { LANGS, T } = await import("../public/i18n.js");
    for (const lang of LANGS) {
      expect(T[lang].stories, lang).toHaveLength(EFFECTS.length * NEWS_WORDS);
      for (const [i, text] of T[lang].stories.entries()) {
        expect(text, `${lang} ${i}`).toEqual(expect.stringMatching(/\S{4}/));
        // a story is a hint: it says what the market fears, and never what the price will do
        expect(text, `${lang} ${i}`).not.toMatch(/\b(will|going to) (rise|fall|drop|jump|surge|crash)\b/i);
      }
    }
    // a story's number is its effect's place and its own, so the first of each effect is 0, 3, 6, 9
    expect(EFFECTS.map((effect) => storyOf({ day: 5, effect, n: 0 }))).toEqual([0, 3, 6, 9]);
    expect(storyOf({ day: 5, effect: "none", n: 2 })).toBe(EFFECTS.length * NEWS_WORDS - 1);
  });

  it("makes every effect come up, a rumour that does nothing among them", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, seed) => drawNews(random(seed + 1), 15)).flat().map((n) => n.effect));
    expect([...seen].sort()).toEqual([...EFFECTS].sort());
  });

  it("pushes a rise up and a fall down by the same amount, and a V back to where it began", () => {
    const total = (effect: "rise" | "fall" | "vshape" | "none") => Array.from({ length: DAYS }, (_, d) => newsDrift([{ day: 10, effect, n: 0 }], d)).reduce((a, x) => a + x, 0);
    expect(total("rise")).toBeCloseTo(NEWS_SIZE, 9);
    expect(total("fall")).toBeCloseTo(-NEWS_SIZE, 9);
    expect(total("vshape"), "a V ends where it began").toBeCloseTo(0, 9);
    expect(total("none")).toBe(0);
    // a V goes down first, then up
    expect(newsDrift([{ day: 10, effect: "vshape", n: 0 }], 10)).toBeLessThan(0);
    expect(newsDrift([{ day: 10, effect: "vshape", n: 0 }], 13)).toBeGreaterThan(0);
    // and nothing happens before the story breaks
    for (const effect of EFFECTS) expect(newsDrift([{ day: 10, effect, n: 0 }], 9), effect).toBe(0);
  });

  it("moves the price in the round it is told in, in the way it says, on average", () => {
    // Forced: the same seed's round with one story, against the round with none, differs by the push.
    const base = (seed: number) => scenario(history, "EUR/USD", 1.1, random(seed), "chop");
    const moves = { rise: [] as number[], fall: [] as number[] };
    for (let seed = 1; seed <= 150; seed++) {
      const round = base(seed);
      const closes = round.prices.filter((_, i) => i % STEPS === 0);
      for (const n of round.news!) {
        if (n.effect !== "rise" && n.effect !== "fall") continue;
        // the three days of the story, against the drift the chop script would have given them anyway
        moves[n.effect].push(Math.log(closes[n.day + 3] / closes[n.day]));
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
    expect(moves.rise.length).toBeGreaterThan(40);
    expect(moves.fall.length).toBeGreaterThan(40);
    // EUR/USD moves about 0.34% a day; a story pushes about two of those, close to 0.7%, before the noise
    expect(mean(moves.rise), "a rise story is followed by a rise").toBeGreaterThan(0.003);
    expect(mean(moves.fall), "a fall story is followed by a fall").toBeLessThan(-0.003);
  });

  it("does not turn a rumour into a move: after a story that does nothing the price is as it was", () => {
    const after: number[] = [];
    for (let seed = 1; seed <= 150; seed++) {
      const round = scenario(history, "EUR/USD", 1.1, random(seed), "chop");
      const closes = round.prices.filter((_, i) => i % STEPS === 0);
      for (const n of round.news!) if (n.effect === "none") after.push(Math.log(closes[n.day + 3] / closes[n.day]));
    }
    expect(after.length).toBeGreaterThan(30);
    expect(Math.abs(after.reduce((a, x) => a + x, 0) / after.length), "a rumour has no direction").toBeLessThan(0.006);
  });

  it("is visible but not a second crash, and leaves the scenario's own shape standing", () => {
    // a story's push is a couple of daily volatilities, a small share of a scripted turn, which
    // is nine to twenty-four
    expect(NEWS_SIZE).toBeGreaterThanOrEqual(1.5);
    expect(NEWS_SIZE).toBeLessThan(9);
    // with news on, a carry trade still climbs and unwinds in most rounds: the stories are the
    // build-up and never land on the turn
    const closes = (round: { prices: number[] }) => round.prices.filter((_, i) => i % STEPS === 0);
    let held = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const raw = closes(scenario(history, "EUR/CHF", 1.08, random(seed), "carry"));
      const c = raw[10] > raw[0] ? raw : raw.map((x) => 1 / x);
      const top = c.indexOf(Math.max(...c));
      if (top > DAYS * 0.4 && c.at(-1)! / c[top] < 0.97) held++;
    }
    expect(held / 200, "the unwind still shows").toBeGreaterThan(0.75);
  });
});

