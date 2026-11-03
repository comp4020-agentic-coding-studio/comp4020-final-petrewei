import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayOpen, PLAYED_DAYS, PRE_DAYS, parseBars, plotDays, plotTicks, rawFile, SWAN_DAY, TICK_MINUTES, TICKS_PER_DAY, ticksOf, trades } from "../scripts/build-minutes.ts";
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

  // The days that open on a Friday and a Saturday evening have no trade. A plot is six trading days, the weekend
  // left out and Friday's close joined to Sunday's open, so no plot shows a flat line for a day.
  it("opens a plot on six trading days, the day the market broke fourth of them, the weekend left out", () => {
    for (const date of ["2015-01-15", "2016-06-24", "2008-09-15", "2020-03-19"]) {
      const days = plotDays(date);
      expect(days, date).toHaveLength(PRE_DAYS + PLAYED_DAYS);
      for (const d of days) expect(trades(d), `${date}: a day that opens on a ${new Date(d * 60_000).getUTCDay()} is not a trading day`).toBe(true);
      expect(days[PRE_DAYS + SWAN_DAY - 1], `${date}: the plot's own day is the third played`).toBe(dayOpen(date));
      days.slice(1).forEach((d, i) => expect([1440, 3 * 1440], `${date}: a day follows the last by one day, or three over a weekend`).toContain(d - days[i]));
    }
  });

  it("joins Friday's close to Sunday's open when a plot crosses a weekend, as a broker's chart does", () => {
    // 24 June 2016 was a Friday: the day after it opens on Sunday evening, three days on
    const days = plotDays("2016-06-24");
    const at = days.indexOf(dayOpen("2016-06-24"));
    expect(days[at + 1] - days[at], "the day after the referendum is the Sunday evening open, three days on").toBe(3 * 1440);
  });

  it("makes the same trading days from a bar file as a plot's ticks are cut from", () => {
    const bars = parseBars([bar("2016.06.23", "17:00", 1.5), bar("2016.06.26", "17:00", 1.4)].join("\n"));
    expect(plotTicks(bars, "2016-06-24")).toHaveLength((PRE_DAYS + PLAYED_DAYS) * TICKS_PER_DAY);
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

  // A weekend day is one price all through, where a pegged day, the franc's before the floor went, still ticks
  // among a handful. So the test is a day with more than one price, not a day that wanders.
  it("has no day of a single price: the weekend is not in the game", () => {
    for (const [id, prices] of byPlot) {
      for (let d = 0; d < PRE_DAYS + PLAYED_DAYS; d++) {
        const day = prices.slice(d * TICKS_PER_DAY, (d + 1) * TICKS_PER_DAY);
        expect(new Set(day).size, `${id}: day ${d + 1} is one price all through`).toBeGreaterThan(1);
      }
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
    expect(byPlot.get("franc-cap-dropped")).toEqual(plotTicks(bars, "2015-01-15"));
  });
});
