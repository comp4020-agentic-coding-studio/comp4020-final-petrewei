import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayOpen, PLAYED_DAYS, PRE_DAYS, parseBars, plotOpen, rawFile, SWAN_DAY, TICK_MINUTES, TICKS_PER_DAY, ticksOf } from "../scripts/build-minutes.ts";
import { EVENTS } from "../src/market.ts";

// Replay's intraday prices are real minute bars, cut by scripts/build-minutes.ts into data/minutes.csv. These
// checks hold the cutting to its rules on a small file written here, so they run anywhere, and the shipped
// file to what the plots promise. The raw downloads are not in the repo, so a check on them skips without them.
const bar = (date: string, time: string, o: number, h = o, l = o, c = o): string => `${date},${time},${o},${h},${l},${c},0`;

describe("the cutting of minute bars into 30-minute ticks", () => {
  it("takes each tick from the last bar at or before its end, so a gap shows as the tick it landed in", () => {
    const bars = parseBars([bar("2015.01.15", "04:29", 1.2), bar("2015.01.15", "04:30", 1.2, 1.2, 1.0, 1.1), bar("2015.01.15", "04:31", 1.0)].join("\n"));
    const from = dayOpen("2015-01-15");
    // 04:30 EST is 11.5 hours into the day that opens at 17:00, the 24th tick, which closes at 12:00 into it
    const ticks = ticksOf(bars, from, 48);
    expect(ticks).toHaveLength(48);
    expect(ticks[22], "the half hour before the shock is still at the peg").toBe(1.2);
    expect(ticks[23], "the half hour of the shock closes where it landed").toBe(1.0);
  });

  it("carries the price on through minutes with no bar, and opens a day from the price before it", () => {
    const bars = parseBars([bar("2015.01.14", "16:59", 1.5), bar("2015.01.15", "09:00", 1.6)].join("\n"));
    const ticks = ticksOf(bars, dayOpen("2015-01-15"), 48);
    expect(ticks[0], "no bar in the first half hour, so the day opens on the last price of the day before").toBe(1.5);
    expect(new Set(ticks.slice(0, 28)).size, "a quiet stretch is one price").toBe(1);
    expect(ticks[47], "and the later bar is taken up").toBe(1.6);
  });

  it("opens a plot so the day the market broke is the third of the five played, after a day before them", () => {
    // the plot's date is the FX day's closing date; its day opens at 17:00 the evening before, 48 ticks a day
    const open = plotOpen("2015-01-15");
    expect(dayOpen("2015-01-15") - open, "two played days and the day before come first").toBe((SWAN_DAY - 1 + PRE_DAYS) * 24 * 60);
    const dayOfTick = (t: number): number => Math.floor(t / TICKS_PER_DAY) + 1 - PRE_DAYS;
    const shock = (stamp: number): number => Math.floor((stamp - open) / TICK_MINUTES);
    // 04:30 on the 15th is 11.5 hours into the day that opens 17:00 on the 14th: tick 23 of that day
    expect(dayOfTick(shock(dayOpen("2015-01-15") + 11.5 * 60)), "the shock falls on played day three").toBe(SWAN_DAY);
  });

  it("starts the day at 17:00 on a clock that never moves for daylight saving", () => {
    // 17:00 on 14 January and 17:00 on 14 July are both a day's start on the files' fixed clock
    for (const date of ["2015-01-15", "2015-07-15"]) expect(dayOpen(date) % (24 * 60), date).toBe(17 * 60);
  });
});

describe("the plots' real minutes, as shipped in data/minutes.csv", () => {
  const rows = readFileSync("data/minutes.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const byPlot = new Map<string, number[]>();
  for (const [id, , price] of rows) byPlot.set(id, [...(byPlot.get(id) ?? []), Number(price)]);
  const ids = new Set(EVENTS.map((e) => e.id));

  it("holds six days of 30-minute ticks for each plot it has, and only for plots that exist", () => {
    expect(byPlot.size, "at least the franc, whose real file is the first one").toBeGreaterThanOrEqual(1);
    for (const [id, prices] of byPlot) {
      expect(ids.has(id), `${id} is a plot`).toBe(true);
      expect(prices, id).toHaveLength((PRE_DAYS + PLAYED_DAYS) * TICKS_PER_DAY);
      for (const p of prices) expect(Number.isFinite(p) && p > 0, id).toBe(true);
    }
  });

  // The plot's date is the day the ECB's daily rate first shows the event, which the minutes sometimes put a
  // day either side: the euro began falling on the day the ECB announced its bond buying, and the ECB's rate that
  // shows it is the next day's; the Bear Stearns rescue was a fall and then a bounce, the bounce the bigger day.
  // So the named day is the third played day, and the largest swing of a whole day is within one day of it.
  it("puts the day the market broke in the middle of the five played, with its biggest day within one day of it", () => {
    for (const [id, prices] of byPlot) {
      const played = prices.slice(PRE_DAYS * TICKS_PER_DAY);
      const swings = Array.from({ length: PLAYED_DAYS }, (_, d) => Math.abs(Math.log(played[d * TICKS_PER_DAY + TICKS_PER_DAY - 1] / played[d * TICKS_PER_DAY])));
      const biggest = swings.indexOf(Math.max(...swings)) + 1;
      expect(Math.abs(biggest - SWAN_DAY), `${id}: its biggest day is played day ${biggest}`).toBeLessThanOrEqual(1);
    }
  });

  it("has the Swiss franc's real gap: the peg to the break, in one tick", () => {
    const prices = byPlot.get("franc-cap-dropped")!;
    expect(prices[0], "pegged at 1.20 before").toBeCloseTo(1.2, 1);
    expect(Math.min(...prices), "it traded below parity, as it did").toBeLessThan(1);
    const moves = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
    expect(Math.min(...moves), "one half hour fell by more than a tenth").toBeLessThan(-0.1);
  });

  it("matches the raw minute file, tick for tick, where that file is on this machine", () => {
    const file = rawFile("raw/histdata", "EURCHF", 2015);
    if (!file || !existsSync(file)) return;
    const bars = parseBars(readFileSync(file, "utf8"));
    expect(byPlot.get("franc-cap-dropped")).toEqual(ticksOf(bars, plotOpen("2015-01-15"), (PRE_DAYS + PLAYED_DAYS) * TICKS_PER_DAY));
  });
});
