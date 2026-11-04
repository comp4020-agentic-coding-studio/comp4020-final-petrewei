// Where a round's prices come from. A replay plays one of nineteen plots, five real
// trading days in which a market broke, with the dates hidden until the round ends: real
// minute prices (data/minutes.csv, from HistData) for seventeen, and for the two yuan plots
// the ECB's daily reference rates (data/ecb.csv, source: ECB) with the price between closes
// on a random bridge that always lands on the real close. A Simulation round starts from
// today's rate and simulates a random market, thirty candles long.

import { dayOf, normal, span, TICKS_PER_DAY } from "./bridge.ts";

// The pairs a Simulation may start from: every one is two of the six currencies the ECB
// publishes, so each has its real history since 1999 (the yuan since April 2005).
export const PAIRS = ["USD/JPY", "EUR/USD", "GBP/USD", "AUD/USD", "USD/CHF", "EUR/CHF", "USD/CNY", "AUD/JPY", "EUR/JPY", "GBP/JPY", "EUR/GBP", "EUR/AUD", "GBP/CHF", "GBP/AUD"] as const;
export type Pair = (typeof PAIRS)[number];
// A Simulation's plan, headlines and news count in units, thirty of them a round: a candle each.
export const UNITS = 30;
// The new clock (ADR 0075): a day is 48 half-hour ticks, a chart candle 4 of them (two hours), a plot's round five days
// and the market before it two, drawn to the left of the open so the chart is never empty and the new price arrives
// at its right end (ADR 0062).
export const DAY_TICKS = TICKS_PER_DAY;
// the chart's candle: 4 ticks, two hours, twelve to a day and twenty-four across the two days shown
export const CANDLE = 4;
// a Simulation's unit, the step its scripts, headlines and news count in: 8 ticks, four hours, two chart candles
export const UNIT = 8;
export const PLAY_DAYS = 5;
export const PRE_ROLL_DAYS = 2;
// The day the market broke is the third of the five played, so two days of clues come before it.
export const SWAN_DAY = 3;
// A day that moved more than this opens with most of its move at once.
export const GAP = 0.015;

type Day = { date: string; rate: number };
// `history` is the market in the two days before the open, as ticks ending at
// the open price, so `prices[0]` follows it; it is part of the chart and of
// nothing else: no order, score or clock reads it.
export type Round = { pair: Pair; days: string[]; prices: number[]; history: number[]; event: Episode | null; source: Source; scenario?: string; headlines?: Headline[]; news?: News[]; unit: number };
// Where a round's prices come from: a made-up market from today's rate (Simulation), a plot's real minutes, or a plot's
// real daily closes with the ticks between them bridged (the two yuan plots). The feed says which as the round opens.
export type Source = "simulation" | "minutes" | "bridged";

// The plots of a replay: nineteen real stories in which the market broke, each with the
// pair it broke on. The day it broke is the third of the five played, with two days to read first.
// Each note is shown when the round ends, so the room learns what it just
// traded through, and its clues, in every language, are in public/i18n-long.js.
export type Episode = { id: string; pair: Pair; date: string; title: string; note: string };
export const EVENTS: Episode[] = [
  { id: "franc-cap-dropped", pair: "EUR/CHF", date: "2015-01-15", title: "Francogeddon", note: "The Swiss National Bank dropped its 1.20 floor without warning. In an hour the euro lost about 13% against the franc, and at the day's low 19%. Stops filled far past their levels, and brokers went bust." },
  { id: "franc-cap-set", pair: "EUR/CHF", date: "2011-09-06", title: "The franc floor", note: "The Swiss National Bank capped the franc at 1.20 per euro and promised unlimited intervention. EUR/CHF leapt 8% in a morning." },
  { id: "carry-unwind-2008", pair: "AUD/JPY", date: "2008-10-24", title: "The carry trade unwinds", note: "After Lehman Brothers failed, leveraged yen-funded bets on the high-yielding Australian dollar were dumped at once. In five days AUD/JPY fell 20%, and by its October low it was 46% below its July high." },
  { id: "lehman", pair: "AUD/JPY", date: "2008-09-15", title: "Lehman Brothers fails", note: "Lehman Brothers filed for bankruptcy on 15 September 2008. Traders had been selling the high-yielding Australian dollar for the safe yen for weeks: AUD/JPY fell about 10% in the three weeks up to the day." },
  { id: "brexit", pair: "GBP/USD", date: "2016-06-24", title: "Brexit", note: "The UK voted to leave the EU. Over the night the pound fell about 9%, to its lowest since 1985." },
  { id: "yuan-devaluation", pair: "USD/CNY", date: "2015-08-11", title: "The yuan devaluation", note: "China's central bank devalued the yuan's daily fixing by nearly 2%, the most in two decades, and kept going for three days." },
  { id: "covid", pair: "AUD/USD", date: "2020-03-19", title: "COVID crash", note: "As the pandemic shut economies, everyone ran for US dollars. AUD/USD fell 12% in ten days to an 18-year low." },
  { id: "carry-unwind-2024", pair: "USD/JPY", date: "2024-08-05", title: "Carry unwind, again", note: "A Bank of Japan rate rise and weak US data sent yen carry trades running for the exit. The Nikkei fell 12% in a day." },
  { id: "euro-rescue", pair: "EUR/USD", date: "2000-09-22", title: "The G7 buys the euro", note: "The euro had fallen more than a quarter since its launch. The central banks of the G7 bought it together, for the first time, and EUR/USD rose about 2% in a day." },
  { id: "ecb-qe", pair: "EUR/USD", date: "2015-01-23", title: "The ECB prints money", note: "The European Central Bank announced it would buy over a trillion euros of bonds. The euro fell about 2% on the day of the announcement and 1% more the next day, to its lowest in twelve years." },
  { id: "yuan-revalued", pair: "USD/CNY", date: "2005-07-21", title: "The yuan is unpegged", note: "China ended its fixed rate of 8.28 yuan to the dollar and let the yuan rise 2% overnight. After ten years of standing still, the yuan had its biggest one-day move for the next twenty-one years." },
  { id: "quant-crash", pair: "AUD/JPY", date: "2007-08-16", title: "The quant crash", note: "Funds that had borrowed yen to bet on higher-yielding currencies were forced to sell as credit markets froze. AUD/JPY fell about 6% in a day, the first tremor of the 2008 crisis." },
  { id: "bear-stearns", pair: "USD/JPY", date: "2008-03-17", title: "Bear Stearns is rescued", note: "JPMorgan bought the failing Bear Stearns bank in a deal the Federal Reserve arranged over the weekend. The dollar fell 1.5% against the yen on the Monday and bounced 2.4% the day after." },
  { id: "uk-mini-budget", pair: "GBP/USD", date: "2022-09-26", title: "The mini-budget", note: "The UK government announced £45 billion of unfunded tax cuts on the Friday. When trading reopened on Sunday evening the pound fell by as much as 5% in Asian hours, to $1.0327, the lowest against the dollar on record." },
  { id: "brexit-flash", pair: "GBP/USD", date: "2016-10-07", title: "The pound's flash crash", note: "In the thin early hours of the Asian session, with London asleep, the pound fell about 6% in two minutes, to a 31-year low, then recovered most of it. The Bank for International Settlements found no single cause: the hour, when few were trading, made the market easy to push, and a news story added little." },
  { id: "kiwi-yen-flash", pair: "AUD/JPY", date: "2019-01-03", title: "The new year flash crash", note: "On 3 January 2019, with Tokyo on holiday and the market thin, Apple warned that its sales would fall short. The yen jumped, and in a few minutes the Australian dollar fell about 7% against it. Stops were hit far from their prices, and about half of the move reversed within the hour." },
  { id: "fukushima", pair: "USD/JPY", date: "2011-03-17", title: "Fukushima and the yen", note: "After the earthquake the yen rose to a record 76.25 to the dollar on 17 March 2011, on talk that Japanese insurers would bring money home to pay claims, which Japan's finance ministry denied. The next day the G7 sold yen together, for the first time in over a decade." },
  { id: "abenomics", pair: "USD/JPY", date: "2013-04-04", title: "The Bank of Japan doubles down", note: "On 4 April 2013 the Bank of Japan promised to double the money in circulation within two years. The yen fell 3.6% against the dollar that day, one of its biggest one-day falls in decades, and kept falling." },
  { id: "boj-ycc", pair: "USD/JPY", date: "2022-12-20", title: "The Bank of Japan surprises", note: "On 20 December 2022 the Bank of Japan, which had insisted it would not, widened the band for its bond yields. Almost nobody expected it before April. The yen rose about 3% against the dollar in a day, and Japan's bond yields jumped." },
];

// The real half-hour prices of the plots that have them, from data/minutes.csv (scripts/build-minutes.ts): a plot's
// id to its ticks, the two days before the round first, then the days played, 48 ticks a day.
export class Minutes {
  private plots = new Map<string, number[]>();
  constructor(csv: string) {
    for (const line of csv.trim().split("\n").slice(1)) {
      const [id, , price] = line.split(",");
      let plot = this.plots.get(id);
      if (!plot) this.plots.set(id, (plot = []));
      plot.push(Number(price));
    }
  }
  of(id: string): number[] | undefined {
    return this.plots.get(id);
  }
  ids(): string[] {
    return [...this.plots.keys()];
  }
}

type Row = { date: string; per: Record<string, number> };

export class History {
  private rows: Row[] = [];

  constructor(csv: string) {
    const [head, ...lines] = csv.trim().split("\n");
    const names = head.split(",").slice(1);
    for (const line of lines) {
      const [date, ...cells] = line.split(",");
      const per: Record<string, number> = { EUR: 1 };
      names.forEach((name, i) => (per[name] = Number(cells[i])));
      this.rows.push({ date, per });
    }
  }

  on(date: string): Row {
    const row = this.rows.find((r) => r.date === date);
    if (!row) throw new Error(`no rates on ${date}`);
    return row;
  }

  // Units of the quote currency per one of the base, from euro rates.
  rate(row: Row, pair: Pair): number {
    const [base, quote] = pair.split("/");
    return row.per[quote] / row.per[base];
  }

  // Each pair's series is built once and kept: a few thousand days each.
  private cache = new Map<Pair, Day[]>();
  series(pair: Pair): Day[] {
    let days = this.cache.get(pair);
    if (!days) {
      days = this.rows.map((r) => ({ date: r.date, rate: this.rate(r, pair) })).filter((d) => Number.isFinite(d.rate));
      this.cache.set(pair, days);
    }
    return days;
  }

  latest(pair: Pair): Day {
    return this.series(pair).at(-1)!;
  }
}

// A small seeded generator, so tests and replays can be repeated.
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// A replay round on the new clock (ADR 0075): the plot's own window of five days, two days of the market before
// it as the chart's history, 48 half-hour ticks a day. A plot with real minutes plays them as they were. One without,
// the two yuan plots, plays the ECB's daily closes over the same days, each day bridged by `dayOf` and the day the
// ECB first shows the break opening with its gap. The open is the last tick of the history, shared with the first
// of the round, so the chart joins without a jump.
export function replayRound(history: History, minutes: Minutes, rnd: () => number, pick?: string): Round {
  const event = EVENTS.find((e) => e.id === pick) ?? EVENTS[Math.floor(rnd() * EVENTS.length)];
  const real = minutes.of(event.id);
  const ticks = real ?? simulated(history, event, rnd);
  // the open is the first tick of the first day played; the history is the days before it and ends on it, so it
  // is a whole number of candles and a tick longer than the days it holds, as the page's window expects
  const open = PRE_ROLL_DAYS * DAY_TICKS;
  return {
    pair: event.pair,
    days: dayNames(history, event),
    prices: ticks.slice(open),
    history: ticks.slice(0, open + 1),
    event,
    source: real ? "minutes" : "bridged",
    // a clue on each day before the one the market broke, the first and second played; the text is the server's to look up
    headlines: Array.from({ length: SWAN_DAY - 1 }, (_, day) => ({ day })),
    // a replay's clues are counted in days
    unit: DAY_TICKS,
  };
}

// The ECB's trading days around a plot's date, for the reveal ("from X to Y"): the days of the round, two before the
// first and so on, read off the real calendar and never shown before the bell.
function dayNames(history: History, event: Episode): string[] {
  const series = history.series(event.pair);
  const at = series.findIndex((d) => d.date === event.date);
  return series.slice(at - (SWAN_DAY - 1), at - (SWAN_DAY - 1) + PLAY_DAYS).map((d) => d.date);
}

// A plot with no minutes, from the ECB's daily closes: the two days before the round and the five played, each day
// bridged to its close. The day the ECB first shows the event opens with most of its move at once, as a fix or a
// peg's break does, and the rest of the days are plain ones sized to the pair's own usual day.
function simulated(history: History, event: Episode, rnd: () => number): number[] {
  const series = history.series(event.pair);
  const at = series.findIndex((d) => d.date === event.date);
  // day d ends on the close d places on, so the day the market broke (the fifth of seven) ends on the day itself
  const first = at - (PRE_ROLL_DAYS + SWAN_DAY);
  // one close more than the days, so the last day is bridged to its own close and the day after supplies the one tick
  // that follows it, as the real plots end on a price past their last day
  const closes = series.slice(first, first + PRE_ROLL_DAYS + PLAY_DAYS + 2).map((d) => d.rate);
  // the pair's usual day, from the forty days before the plot, with a floor so a pegged pair still moves enough to play
  const recent = series.slice(at - 41, at - 1);
  const logs = recent.slice(1).map((d, i) => Math.log(d.rate / recent[i].rate));
  const vol = Math.max(0.0015, Math.sqrt(logs.reduce((a, m) => a + m * m, 0) / logs.length));
  const out: number[] = [];
  let from = closes[0];
  for (let d = 1; d < closes.length; d++) {
    const breaks = Math.abs(Math.log(closes[d] / closes[d - 1])) > GAP;
    out.push(...dayOf(from, closes[d], vol, rnd, breaks ? 2 : 1, breaks ? 0.8 : 0));
    from = closes[d];
  }
  // seven days and the first tick of the eighth, so the round ends on a price as the real plots do
  return out.slice(0, (PRE_ROLL_DAYS + PLAY_DAYS) * DAY_TICKS + 1);
}

// The simulated tab, Scenario (ADR 0027): a round from today's real rate
// that simulates a random market shaped by one of a few situations, each
// modelled on a real one, hidden until the bell. A situation says, for each
// day, how far the market drifts and how wild it is, as multiples of the
// pair's own daily volatility over the past year; the headlines say just
// enough, on the day, for a careful trader to read it. The reveal names the real market
// it was modelled on, so the bell teaches as History's does.
// A headline is shown on its day; its words, in every language, are in
// public/i18n-long.js under the scenario's id, in the same order.
export type Headline = { day: number };

// News in a Simulation (ADR 0064): a story that breaks on a day, and may do something to the
// price afterwards, or nothing. `rise` and `fall` push it three days on, `vshape` drops it for
// two days and brings it back over three, and `none` is a rumour that moves nothing. The text
// is only a hint: it says what the market is worried about, never what it will do. `n` picks
// the words, from the table for its effect in public/i18n-long.js.
// How many headlines the table has for each effect, so a draw can name one that exists.
export const NEWS_WORDS = 3;
export const EFFECTS = ["rise", "fall", "vshape", "none"] as const;
export type Effect = (typeof EFFECTS)[number];
export type News = { day: number; effect: Effect; n: number };
// A story's number in the table of words: the effects in order, NEWS_WORDS stories each.
export const storyOf = (news: News): number => EFFECTS.indexOf(news.effect) * NEWS_WORDS + news.n;
// How far a news shock moves the price over its days, in the pair's own daily volatilities:
// about half a percent on a major pair, a move a careful trader can see coming. Measured: at 3 it
// blurred a carry trade's unwind in a quarter of rounds, at 2 the unwind still shows in four in five.
export const NEWS_SIZE = 2;

export type Scenario = {
  id: string;
  // The day's drift (in daily volatilities, signed) and wildness, given the
  // day, the day the scenario turns, and how far the price has wandered
  // from the open, in daily volatilities.
  plan: (day: number, crash: number, away: number) => { drift: number; vol: number };
  headlines: Headline[];
};

// Days of the round, counted from 0.
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const SCENARIOS: Scenario[] = [
  {
    // A currency held to a floor, very still, until the floor is dropped in
    // one day: Switzerland, 15 January 2015.
    id: "peg",
    plan: (d, crash) => (d < crash ? { drift: 0, vol: 0.15 } : d === crash ? { drift: -24, vol: 0.4 } : { drift: 0.6, vol: 1.6 }),
    headlines: [
      { day: 4 },
      { day: 12 },
    ],
  },
  {
    // Borrowing cheap to hold a high-yielding currency: a long, calm climb,
    // then everyone leaves at once. The yen carry trade, August 2024.
    id: "carry",
    plan: (d, crash) => (d < crash ? { drift: 0.55, vol: 0.6 } : d < crash + 5 ? { drift: -4.5, vol: 1.8 } : { drift: -0.3, vol: 1.2 }),
    headlines: [
      { day: 6 },
      { day: 20 },
    ],
  },
  {
    // A surprise decision moves the market in a day, and the trend follows.
    // The yuan's devaluation, 11 August 2015.
    id: "shock",
    plan: (d, crash) => (d < crash ? { drift: 0, vol: 0.8 } : d === crash ? { drift: -9, vol: 0.5 } : d < crash + 4 ? { drift: -1.6, vol: 1.3 } : { drift: -0.3, vol: 1 }),
    headlines: [
      { day: 5 },
      { day: 14 },
    ],
  },
  {
    // A trend everyone joins, until it turns. Sterling before and after the
    // vote, June 2016, run the other way.
    id: "bubble",
    plan: (d, crash) => (d < crash ? { drift: lerp(0.3, 1.2, d / crash), vol: 0.9 } : { drift: -1.7, vol: 1.8 }),
    headlines: [
      { day: 8 },
      { day: 22 },
    ],
  },
  {
    // No trend at all, only swings: the market that takes stops both ways,
    // pulled back towards where it opened whenever it strays.
    id: "chop",
    plan: (_d, _c, away) => ({ drift: -0.5 * away, vol: 1.2 }),
    headlines: [
      { day: 6 },
      { day: 18 },
    ],
  },
  {
    // A currency falling day after day, until its government steps in and
    // buys it back. Japan, 22 September 2022.
    id: "intervention",
    plan: (d, crash) => (d < crash ? { drift: -0.7, vol: 0.9 } : d === crash ? { drift: 12, vol: 0.6 } : { drift: 0.2, vol: 1.3 }),
    headlines: [
      { day: 9 },
      { day: 20 },
    ],
  },
];

// Up to three stories break in a Simulation, all before the scenario turns: between day 3 and two
// days before the turn, at least three days apart. News is the build-up, a hint at what is
// coming or a false alarm; it never lands on the turn or after it, where it would blur the
// scenario the round is about. A story is a rise, a fall or a V a little less than half the
// time each, and a rumour that does nothing for the rest: news is a hint, and some of it is wrong.
export function drawNews(rnd: () => number, crash: number): News[] {
  const out: News[] = [];
  const last = crash - 2;
  for (let tries = 0; out.length < 3 && tries < 60; tries++) {
    const day = 3 + Math.floor(rnd() * (last - 3));
    if (out.some((n) => Math.abs(n.day - day) < 3)) continue;
    const roll = rnd();
    const effect: Effect = roll < 0.25 ? "rise" : roll < 0.5 ? "fall" : roll < 0.7 ? "vshape" : "none";
    out.push({ day, effect, n: Math.floor(rnd() * NEWS_WORDS) });
  }
  return out.sort((a, b) => a.day - b.day);
}

// The push the news gives the price on one day, in daily volatilities: a rise or a fall spreads
// NEWS_SIZE over three days; a V falls for two days and comes back over three.
export function newsDrift(news: News[], day: number): number {
  let push = 0;
  for (const n of news) {
    const at = day - n.day;
    if (n.effect === "rise" && at >= 0 && at < 3) push += NEWS_SIZE / 3;
    else if (n.effect === "fall" && at >= 0 && at < 3) push -= NEWS_SIZE / 3;
    else if (n.effect === "vshape") push += at >= 0 && at < 2 ? -NEWS_SIZE / 2 : at >= 2 && at < 5 ? NEWS_SIZE / 3 : 0;
  }
  return push;
}

// A Simulation round on the new clock (ADR 0075): thirty simulated candles of eight half-hour ticks, a round as long
// as Replay's five days. A candle is the scenario's unit, what its plan and its headlines and its news call a day, so
// every script and every day it names is as it was written; only what a unit is on the screen has changed, a four-hour
// candle where it was a day of nine ticks. Each candle is bridged by `span` from the close before it to its own, so the
// ticks between are real-looking half hours. The history before the open is the pair's real last days, two of them,
// bridged the same way, ending on today's rate.
export function simulation(history: History, pair: Pair, rate: number, rnd: () => number, pick?: string, quiet = false): Round {
  const recent = history.series(pair).slice(-251);
  const moves = recent.slice(1).map((d, i) => Math.log(d.rate / recent[i].rate));
  // A floor of 0.4% a unit, so a pegged pair still moves enough to play.
  const vol = Math.max(0.004, Math.sqrt(moves.reduce((s, m) => s + m * m, 0) / moves.length));
  const script = SCENARIOS.find((x) => x.id === pick) ?? SCENARIOS[Math.floor(rnd() * SCENARIOS.length)];
  // The turn comes between unit 13 and unit 22, as before.
  const crash = 13 + Math.floor(rnd() * 10);
  const way = rnd() < 0.5 ? 1 : -1;
  const news = quiet ? [] : drawNews(rnd, crash);
  const closes = [rate];
  for (let d = 0; d < UNITS; d++) {
    const { drift, vol: wild } = script.plan(d, crash, (way * Math.log(closes[d] / rate)) / vol);
    closes.push(closes[d] * Math.exp((way * drift + newsDrift(news, d) + normal(rnd) * wild) * vol));
  }
  // a candle's own typical move is a unit's volatility over its eight ticks, so each tick is a sixth of a day's worth of noise
  const tickVol = vol / Math.sqrt(DAY_TICKS / UNIT);
  const prices = [closes[0]];
  for (let d = 1; d < closes.length; d++) prices.push(...span(closes[d - 1], closes[d], tickVol, rnd, ((d - 1) * UNIT) % DAY_TICKS, UNIT));
  // The pair's real last days, as daily closes ending on today's rate, each bridged to its own close.
  const real = [...history.series(pair).slice(-PRE_ROLL_DAYS).map((d) => d.rate), rate];
  const before: number[] = [real[0]];
  for (let d = 1; d < real.length; d++) before.push(...dayOf(before.at(-1)!, real[d], vol, rnd));
  return { pair, days: closes.map((_, d) => `day ${d}`), prices, history: before, event: null, source: "simulation", scenario: script.id, headlines: script.headlines, news,
    // a simulation's headlines and news are counted in its units, which are candles
    unit: UNIT };
}

