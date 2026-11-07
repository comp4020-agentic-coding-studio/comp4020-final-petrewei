// Builds data/minutes.csv, the real intraday prices the Rewind plots play, from the minute bars
// downloaded from HistData (https://www.histdata.com, MetaTrader M1 files, kept in raw/ and never
// committed). Run it by hand when a file is added:
//
//   node scripts/build-minutes.ts
//
// For each plot it cuts seven trading days, the two before and the five that are played, so the day the
// market broke is the third of the five, and it writes one price every 15 minutes (96 a day). A
// day here is an FX day, which opens at 17:00 New York standard time the evening before, as the
// files' own clock does (they are fixed at UTC-5 and never move for daylight saving). The days that
// open on a Friday and a Saturday evening have no trade, so they are left out and Friday's close is
// joined to Sunday's open, as a broker's chart joins it: that join is the weekend gap, a real jump
// the market made, and the only one in a plot besides the event. A minute inside a trading day with
// no bar had no trade, so the price carries on from the minute before.
//
// The output has one block per plot, so the game reads a file of a few thousand rows and never the
// raw files. A plot whose file is missing is left out, and the game plays it from the ECB's daily
// closes as before.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAY_TICKS, EVENTS, PLAY_DAYS, PRE_ROLL_DAYS, SWAN_DAY } from "../src/market.ts";

// The clock is the game's own (src/market.ts), so the file is cut as the game slices it; a tick is then this long.
export const TICK_MINUTES = (24 * 60) / DAY_TICKS;

type Bar = { at: number; o: number; h: number; l: number; c: number };

// The files' clock, in minutes since the epoch, as if the clock were UTC (it is fixed EST, so only
// differences matter, and a day is 17:00 to 17:00 on it).
export const stamp = (date: string, time: string): number => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5)) / 60_000;

export function parseBars(csv: string): Bar[] {
  const bars: Bar[] = [];
  for (const line of csv.split("\n")) {
    const f = line.trim().split(",");
    if (f.length < 6) continue;
    bars.push({ at: stamp(f[0], f[1]), o: +f[2], h: +f[3], l: +f[4], c: +f[5] });
  }
  return bars.sort((a, b) => a.at - b.at);
}

// The 17:00 that opens the FX day containing the given calendar date's trading, 24 hours on.
// An FX day is named for the date it closes on, so ECB's 15 January is the day from 17:00 on the 14th.
export function dayOpen(date: string): number {
  return stamp(date.replaceAll("-", "."), "00:00") - 7 * 60;
}

// One price every `step` minutes from `from`, for `count` ticks. A tick is the close of the last bar
// at or before its end, so a bar that gapped shows as the tick it landed in; a tick with no bar
// carries the price before it. `open` is the price the first tick carries from.
export function ticksOf(bars: Bar[], from: number, count: number, step = TICK_MINUTES): number[] {
  let i = 0;
  while (i < bars.length && bars[i].at < from) i++;
  let last = i > 0 ? bars[i - 1].c : bars[0].o;
  const out: number[] = [];
  for (let n = 0; n < count; n++) {
    const end = from + (n + 1) * step;
    while (i < bars.length && bars[i].at < end) last = bars[i++].c;
    out.push(last);
  }
  return out;
}

// Whether an FX day trades: it opens at 17:00 on a Sunday to Thursday, and the two that open on a Friday and
// a Saturday evening are the weekend. (The clock is the files' own, fixed, so a weekday is read from it.)
export function trades(open: number): boolean {
  const day = new Date(open * 60_000).getUTCDay();
  return day !== 5 && day !== 6;
}

// A day with fewer bars than this had no market: the weekend, and the holidays when every desk is shut, such as the
// turn of the year. A quiet day has hundreds of bars; a closed one has none.
export const MIN_BARS = 100;

// How many bars each FX day of a file holds, counted once and remembered for the file: a day is a 17:00 to 17:00
// stretch, named by the minute it opens.
const counts = new WeakMap<Bar[], Map<number, number>>();
function barsIn(bars: Bar[], day: number): number {
  let byDay = counts.get(bars);
  if (!byDay) {
    byDay = new Map();
    for (const b of bars) {
      const opens = b.at - (((b.at - 17 * 60) % 1440) + 1440) % 1440;
      byDay.set(opens, (byDay.get(opens) ?? 0) + 1);
    }
    counts.set(bars, byDay);
  }
  return byDay.get(day) ?? 0;
}

// Whether an FX day traded in a file, which is when it opens on a weekday and the file has bars in it. The file's own
// bars settle a holiday that the calendar cannot.
function open(bars: Bar[] | undefined, day: number): boolean {
  return trades(day) && (!bars || barsIn(bars, day) >= MIN_BARS);
}

// The openings of a plot's seven trading days, in order: the two before, then the five played, the day the market
// broke third of those. Walks back and forward over the weekend, and over any holiday the file shows shut, which are
// not days. Given no bars it goes by the calendar alone. One definition, used by the build and by the checks.
export function plotDays(date: string, bars?: Bar[]): number[] {
  const at = dayOpen(date);
  const days = [at];
  // a window that runs off either end of the file has no days there to give: stop, and say so, and not look for ever
  const first = bars?.[0].at ?? -Infinity;
  const last = bars?.at(-1)?.at ?? Infinity;
  for (let before = 0, d = at; before < SWAN_DAY - 1 + PRE_ROLL_DAYS; ) {
    d -= 1440;
    if (d + 1440 < first) throw new Error(`the file starts after the ${SWAN_DAY - 1 + PRE_ROLL_DAYS} trading days before ${date}`);
    if (open(bars, d)) {
      days.unshift(d);
      before++;
    }
  }
  for (let after = 0, d = at; after < PLAY_DAYS - SWAN_DAY; ) {
    d += 1440;
    if (d > last) throw new Error(`the file ends before the ${PLAY_DAYS - SWAN_DAY} trading days after ${date}`);
    if (open(bars, d)) {
      days.push(d);
      after++;
    }
  }
  return days;
}

// A plot's prices: each trading day's 48 ticks in turn, the first from the price before the day opened.
// One more tick follows the last day: the price at the end of it, so the days played are a whole number of candles of
// moves (240) and the round has a last price to end on.
export function plotTicks(bars: Bar[], date: string): number[] {
  const days = plotDays(date, bars);
  const ticks = days.flatMap((open) => ticksOf(bars, open, DAY_TICKS));
  return [...ticks, ticksOf(bars, days.at(-1)!, DAY_TICKS + 1).at(-1)!];
}

// The raw file for a pair and a year, wherever it was unpacked under raw/histdata.
export function rawFile(root: string, pair: string, year: number): string | null {
  const name = `DAT_MT_${pair}_M1_${year}.csv`;
  for (const dir of existsSync(root) ? readdirSync(root) : []) {
    const path = join(root, dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "raw", "histdata");
  const lines = ["id,tick,price"];
  const built: string[] = [];
  const missing: string[] = [];
  for (const e of EVENTS) {
    const pair = e.pair.replace("/", "");
    const year = +e.date.slice(0, 4);
    const file = rawFile(root, pair, year);
    if (!file) {
      missing.push(`${e.id} (${pair} ${year})`);
      continue;
    }
    // a window near the turn of the year reaches into the file of the year before or after, so those are read too
    const bars = [year - 1, year, year + 1]
      .map((y) => rawFile(root, pair, y))
      .filter((f): f is string => f !== null)
      .flatMap((f) => parseBars(readFileSync(f, "utf8")))
      .sort((a, b) => a.at - b.at);
    const prices = plotTicks(bars, e.date);
    prices.forEach((p, n) => lines.push(`${e.id},${n},${p}`));
    built.push(e.id);
  }
  writeFileSync(join(import.meta.dirname, "..", "data", "minutes.csv"), lines.join("\n") + "\n");
  console.log(`wrote ${built.length} plots: ${built.join(", ") || "none"}`);
  if (missing.length) console.log(`no raw file for ${missing.length}: ${missing.join(", ")}`);
}
