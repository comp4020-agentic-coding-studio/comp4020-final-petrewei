import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayOpen, MIN_BARS, parseBars, plotDays, plotTicks, rawFile, stamp, TICK_MINUTES, ticksOf, trades } from "../scripts/build-minutes.ts";
import { DAY_TICKS, EVENTS, Minutes, PLAY_DAYS, PRE_ROLL_DAYS, SWAN_DAY } from "../src/market.ts";

// Replay's intraday prices are real minute bars, cut by scripts/build-minutes.ts into data/minutes.csv. These
// checks hold the cutting to its rules on a small file written here, so they run anywhere, and the shipped
// file to what the plots promise. The raw downloads are not in the repo, so a check on them skips without them.
const bar = (date: string, time: string, o: number, h = o, l = o, c = o): string => `${date},${time},${o},${h},${l},${c},0`;

describe("the cutting of minute bars into 30-minute ticks", () => {
  it("takes each tick from the last bar at or before its end, so a gap shows as the tick it landed in", () => {
    const bars = parseBars([bar("2015.01.15", "04:29", 1.2), bar("2015.01.15", "04:30", 1.2, 1.2, 1.0, 1.1), bar("2015.01.15", "04:31", 1.0)].join("\n"));
    const from = dayOpen("2015-01-15");
    // in half-hour ticks, as the worked example is written (the rule holds at any step): 04:30 EST is 11.5 hours into
    // the day that opens at 17:00, the 24th tick, which closes at 12:00 into it
    const ticks = ticksOf(bars, from, 48, 30);
    expect(ticks).toHaveLength(48);
    expect(ticks[22], "the half hour before the shock is still at the peg").toBe(1.2);
    expect(ticks[23], "the half hour of the shock closes where it landed").toBe(1.0);
  });

  it("carries the price on through minutes with no bar, and opens a day from the price before it", () => {
    const bars = parseBars([bar("2015.01.14", "16:59", 1.5), bar("2015.01.15", "09:00", 1.6)].join("\n"));
    const ticks = ticksOf(bars, dayOpen("2015-01-15"), 48, 30);
    expect(ticks[0], "no bar in the first half hour, so the day opens on the last price of the day before").toBe(1.5);
    expect(new Set(ticks.slice(0, 28)).size, "a quiet stretch is one price").toBe(1);
    expect(ticks[47], "and the later bar is taken up").toBe(1.6);
  });

  // The days that open on a Friday and a Saturday evening have no trade. A plot is six trading days, the weekend
  // left out and Friday's close joined to Sunday's open, so no plot shows a flat line for a day.
  it("opens a plot on six trading days, the day the market broke fourth of them, the weekend left out", () => {
    for (const date of ["2015-01-15", "2016-06-24", "2008-09-15", "2020-03-19"]) {
      const days = plotDays(date);
      expect(days, date).toHaveLength(PRE_ROLL_DAYS + PLAY_DAYS);
      for (const d of days) expect(trades(d), `${date}: a day that opens on a ${new Date(d * 60_000).getUTCDay()} is not a trading day`).toBe(true);
      expect(days[PRE_ROLL_DAYS + SWAN_DAY - 1], `${date}: the plot's own day is the third played`).toBe(dayOpen(date));
      days.slice(1).forEach((d, i) => expect([1440, 3 * 1440], `${date}: a day follows the last by one day, or three over a weekend`).toContain(d - days[i]));
    }
  });

  it("joins Friday's close to Sunday's open when a plot crosses a weekend, as a broker's chart does", () => {
    // 24 June 2016 was a Friday: the day after it opens on Sunday evening, three days on
    const days = plotDays("2016-06-24");
    const at = days.indexOf(dayOpen("2016-06-24"));
    expect(days[at + 1] - days[at], "the day after the referendum is the Sunday evening open, three days on").toBe(3 * 1440);
  });

  // A day with fewer than MIN_BARS bars is shut: the weekend, and a holiday such as the turn of the year, when AUD/JPY's
  // file for 2018 has nothing for the 30th and 31st of December. A file of many bars a day is open every day.
  const openDays = (from: string, days: number, perDay = MIN_BARS + 1): string => {
    const lines: string[] = [];
    const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10), 17, 0);
    for (let d = 0; d < days; d++) {
      const at = new Date(start + d * 86_400_000);
      if (at.getUTCDay() === 6 || at.getUTCDay() === 5) continue;
      for (let m = 0; m < perDay; m++) {
        const t = new Date(at.getTime() + m * 60_000);
        lines.push(bar(t.toISOString().slice(0, 10).replaceAll("-", "."), t.toISOString().slice(11, 16), 1 + m * 1e-5));
      }
    }
    return lines.join("\n");
  };

  it("cuts six trading days of ticks from a file that spans them", () => {
    const bars = parseBars(openDays("2016-06-12", 21));
    // seven days of 48, and the price at the end of the last, which the round ends on
    expect(plotTicks(bars, "2016-06-24")).toHaveLength((PRE_ROLL_DAYS + PLAY_DAYS) * DAY_TICKS + 1);
  });

  it("skips a holiday the file shows shut, as it skips the weekend, and takes a day more from the other side", () => {
    // the FX day that opens at 17:00 on 21 June has no bars: it is not one of the six, so the window takes the day before it
    const shut = dayOpen("2016-06-22");
    const kept = openDays("2016-06-12", 21)
      .split("\n")
      .filter((l) => {
        const [date, time] = l.split(",");
        const at = stamp(date, time);
        return !(at >= shut && at < shut + 1440);
      });
    const days = plotDays("2016-06-24", parseBars(kept.join("\n")));
    expect(days).toHaveLength(PRE_ROLL_DAYS + PLAY_DAYS);
    expect(days.includes(shut), "the shut day is left out").toBe(false);
    expect(days, "and the plot's own day is still the fourth of the six").toContain(dayOpen("2016-06-24"));
    expect(days.indexOf(dayOpen("2016-06-24"))).toBe(PRE_ROLL_DAYS + SWAN_DAY - 1);
  });

  it("stops and says so when the file does not reach far enough, and does not look for ever", () => {
    // a file that begins on the day of the plot has none of the trading days before it
    const bars = parseBars(openDays("2016-06-23", 6));
    expect(() => plotTicks(bars, "2016-06-24")).toThrow(/2016-06-24/);
  });

  it("starts the day at 17:00 on a clock that never moves for daylight saving", () => {
    // 17:00 on 14 January and 17:00 on 14 July are both a day's start on the files' fixed clock
    for (const date of ["2015-01-15", "2015-07-15"]) expect(dayOpen(date) % (24 * 60), date).toBe(17 * 60);
  });
});

describe("the plots' real minutes, as shipped in data/minutes.csv", () => {
  // read as the server reads it, so a check here is a check of what the game plays
  const minutes = new Minutes(readFileSync("data/minutes.csv", "utf8"));
  const byPlot = new Map(minutes.ids().map((id) => [id, minutes.of(id)!]));
  const ids = new Set(EVENTS.map((e) => e.id));

  it("holds seven days of 30-minute ticks and the last day's closing price for each plot it has, and only for plots that exist", () => {
    expect(byPlot.size, "at least the franc, whose real file is the first one").toBeGreaterThanOrEqual(1);
    for (const [id, prices] of byPlot) {
      expect(ids.has(id), `${id} is a plot`).toBe(true);
      expect(prices, id).toHaveLength((PRE_ROLL_DAYS + PLAY_DAYS) * DAY_TICKS + 1);
      for (const p of prices) expect(Number.isFinite(p) && p > 0, id).toBe(true);
    }
  });

  // The plot's date is the day the ECB's daily rate first shows the event, which the minutes sometimes put a
  // day either side: the euro began falling on the day the ECB announced its bond buying, and the ECB's rate that
  // shows it is the next day's. So the named day is the third played day, and the day of the widest range, which
  // is what a candle shows and so what a flash crash is (a spike that comes back, a small move over the day, a big
  // range), is within one day of it. One plot is known not to be: Lehman's bankruptcy was a Monday, and the market
  // was wildest a week later, in the days of AIG and the run on money funds, so its window is on the bankruptcy and
  // its widest day is the last. It is named here so another plot cannot join it unseen.
  const WIDEST_ELSEWHERE = new Set(["lehman"]);
  it("puts the day the market broke in the middle of the five played, with its widest day within one day of it", () => {
    for (const [id, prices] of byPlot) {
      const played = prices.slice(PRE_ROLL_DAYS * DAY_TICKS);
      const ranges = Array.from({ length: PLAY_DAYS }, (_, d) => {
        const day = played.slice(d * DAY_TICKS, (d + 1) * DAY_TICKS);
        return Math.log(Math.max(...day) / Math.min(...day));
      });
      const widest = ranges.indexOf(Math.max(...ranges)) + 1;
      if (WIDEST_ELSEWHERE.has(id)) expect(Math.abs(widest - SWAN_DAY), `${id} is no longer an exception: its widest day is ${widest}`).toBeGreaterThan(1);
      else expect(Math.abs(widest - SWAN_DAY), `${id}: its widest day is played day ${widest}`).toBeLessThanOrEqual(1);
    }
  });

  // A weekend day is one price all through, where a pegged day, the franc's before the floor went, still ticks
  // among a handful. So the test is a day with more than one price, not a day that wanders.
  it("has no day of a single price: the weekend is not in the game", () => {
    for (const [id, prices] of byPlot) {
      for (let d = 0; d < PRE_ROLL_DAYS + PLAY_DAYS; d++) {
        const day = prices.slice(d * DAY_TICKS, (d + 1) * DAY_TICKS);
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
