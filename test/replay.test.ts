import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDLE, DAY_TICKS, EVENTS, History, Minutes, PLAY_DAYS, PRE_ROLL_DAYS, random, replayRound } from "../src/market.ts";

// Replay on the new clock (ADR 0075): two days of the market before the round and five played, 48 half-hour ticks a
// day, the real minutes where a plot has them and the ECB's closes bridged where it has not. These hold what the
// server and the page rely on, for every plot, real and simulated alike.
const root = join(import.meta.dirname, "..");
const history = new History(readFileSync(join(root, "data", "ecb.csv"), "utf8"));
const minutes = new Minutes(readFileSync(join(root, "data", "minutes.csv"), "utf8"));

describe("a replay round on the new clock", () => {
  it("is five played days of 48 ticks after two days of history, for every plot", () => {
    for (const e of EVENTS) {
      const r = replayRound(history, minutes, random(3), e.id);
      expect(r.event?.id, e.id).toBe(e.id);
      expect(r.prices, `${e.id} plays five days`).toHaveLength(PLAY_DAYS * DAY_TICKS + 1);
      expect(r.history, `${e.id} has two days behind it, and the open`).toHaveLength(PRE_ROLL_DAYS * DAY_TICKS + 1);
      expect((r.history.length - 1) % CANDLE, `${e.id}: the history is a whole number of candles`).toBe(0);
      expect(r.dayTicks).toBe(DAY_TICKS);
    }
  });

  it("opens where the history ends, so the chart joins without a jump", () => {
    for (const e of EVENTS) {
      const r = replayRound(history, minutes, random(5), e.id);
      expect(r.history.at(-1), `${e.id}: the history ends on the open`).toBe(r.prices[0]);
    }
  });

  it("holds only real, positive prices", () => {
    for (const e of EVENTS) {
      const r = replayRound(history, minutes, random(7), e.id);
      for (const p of [...r.history, ...r.prices]) expect(Number.isFinite(p) && p > 0, e.id).toBe(true);
    }
  });

  it("plays a plot's real minutes exactly, and calls only the plots without them bridged, never simulated", () => {
    for (const e of EVENTS) {
      const r = replayRound(history, minutes, random(9), e.id);
      // `simulated` is the Simulation tab's word for a market made up from today's rate: a Replay is real days, always
      expect(r.simulated, `${e.id} is never a Simulation`).toBe(false);
      expect(r.bridged, e.id).toBe(!minutes.has(e.id));
      if (!minutes.has(e.id)) continue;
      const real = minutes.of(e.id)!;
      const open = PRE_ROLL_DAYS * DAY_TICKS;
      // the history is the first ticks up to and including the open, the round the open and all that follows
      expect(r.history, `${e.id}: the history is the real ticks before the open`).toEqual(real.slice(0, open + 1));
      expect(r.prices, `${e.id}: the round is the real ticks from the open`).toEqual(real.slice(open));
      expect(r.prices[0], `${e.id}: the open is the first tick of the first day played`).toBe(real[PRE_ROLL_DAYS * DAY_TICKS]);
    }
  });

  // The two yuan plots have no minutes, so they play the ECB's recorded daily rates, each day bridged to its close. The
  // record is exact at the end of each day, which is where the bridge lands, so a plot that is bridged still plays the
  // real daily closes, and the only invented part is the ticks between them.
  it("lands a bridged plot on the ECB's recorded close at the end of every day", () => {
    const bridged = EVENTS.filter((e) => !minutes.has(e.id));
    expect(bridged.length, "the yuan plots, which have no free minutes").toBeGreaterThanOrEqual(2);
    for (const e of bridged) {
      const r = replayRound(history, minutes, random(11), e.id);
      expect(r.bridged, e.id).toBe(true);
      const series = history.series(e.pair);
      const at = series.findIndex((d) => d.date === e.date);
      // seven days: the first closes at tick 47, and the plot's own day is the fifth of the seven, 2 + 3 = index 4
      const ticks = [...r.history.slice(0, -1), ...r.prices];
      for (let d = 0; d < PRE_ROLL_DAYS + PLAY_DAYS; d++) {
        const real = series[at - 4 + d + 1].rate;
        expect(ticks[(d + 1) * DAY_TICKS - 1], `${e.id}: day ${d + 1} ends on the recorded close`).toBeCloseTo(real, 9);
      }
    }
  });

  it("gives a plot's real minutes the same every time, since they are the record, and a simulated one a fresh path", () => {
    const real = EVENTS.find((e) => minutes.has(e.id))!;
    expect(replayRound(history, minutes, random(1), real.id).prices).toEqual(replayRound(history, minutes, random(2), real.id).prices);
    const fake = EVENTS.find((e) => !minutes.has(e.id))!;
    expect(replayRound(history, minutes, random(1), fake.id).prices).not.toEqual(replayRound(history, minutes, random(2), fake.id).prices);
  });

  // Which story a Start draws is left to chance, so every story must be drawable, and none so favoured that the others
  // are rarely seen: with nineteen stories and six hundred draws each is expected about thirty times.
  it("draws a plot at random when none is named, and every plot comes up, none far more than its share", () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 600; seed++) {
      const id = replayRound(history, minutes, random(seed)).event!.id;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect(seen.size, "every story is drawn").toBe(EVENTS.length);
    const share = 600 / EVENTS.length;
    for (const [id, n] of seen) {
      expect(n, `${id} is drawn ${n} times, about ${share.toFixed(0)} expected`).toBeGreaterThan(share * 0.4);
      expect(n, `${id} is drawn ${n} times, about ${share.toFixed(0)} expected`).toBeLessThan(share * 1.9);
    }
  });

  it("puts both clues before the day the market broke, never on it", () => {
    const r = replayRound(history, minutes, random(4), EVENTS[0].id);
    expect(r.headlines).toHaveLength(2);
    const swanDay = 2; // the third played day, counting from 0
    for (const h of r.headlines!) expect(h.day, "a clue comes before the day it leads to").toBeLessThan(swanDay);
    expect(r.headlines![0].day).toBeLessThan(r.headlines![1].day);
  });

  it("makes a candle of whole four-hour blocks, so a day is a whole number of candles", () => {
    expect(DAY_TICKS % CANDLE).toBe(0);
    expect(CANDLE * 6).toBe(DAY_TICKS);
  });

  it("names the days of the round without a date being what the round is called by", () => {
    const r = replayRound(history, minutes, random(2), EVENTS[0].id);
    expect(r.days.length).toBeGreaterThan(0);
    for (const d of r.days) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
