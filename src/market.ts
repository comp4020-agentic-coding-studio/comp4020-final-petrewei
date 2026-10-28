// Where a round's prices come from. A replay plays one of thirteen plots, thirty
// real trading days in which a market broke, from the ECB's daily reference rates
// (data/ecb.csv, source: ECB; the crosses are derived), with the dates hidden until
// the round ends. A Scenario round starts from today's rate and simulates a random
// market for thirty days.
// Free sources give one rate a day, so between closes the price wanders
// on a random bridge that always lands on the real close; a day that
// moved a lot opens with a gap, as the market did, and stops slip.

// The pairs a Simulation may start from: every one is two of the six currencies the ECB
// publishes, so each has its real history since 1999 (the yuan since April 2005).
export const PAIRS = ["USD/JPY", "EUR/USD", "GBP/USD", "AUD/USD", "USD/CHF", "EUR/CHF", "USD/CNY", "AUD/JPY", "EUR/JPY", "GBP/JPY", "EUR/GBP", "EUR/AUD", "GBP/CHF", "GBP/AUD"] as const;
export type Pair = (typeof PAIRS)[number];
// Thirty days a round, nine ticks a day, and thirty more days of the market
// before it, drawn to the left of the open so the chart is never empty and the
// new price arrives at its right end (ADR 0062).
export const DAYS = 30;
export const LOOKBACK = 30;
export const STEPS = 9;
// A day that moved more than this opens with most of its move at once.
export const GAP = 0.015;

type Day = { date: string; rate: number };
// `history` is the market in the thirty days before the open, as ticks ending at
// the open price, so `prices[0]` follows it; it is part of the chart and of
// nothing else: no order, score or clock reads it.
export type Round = { pair: Pair; days: string[]; prices: number[]; history: number[]; event: Episode | null; simulated: boolean; scenario?: string; headlines?: Headline[]; news?: News[] };

// The plots of a replay: thirteen real days on which the market broke, each with the
// pair it broke on. A round is placed so the day lands between day 11 and day 28 of the
// thirty, with at least ten days to read first; the plain windows of the first version
// are gone. Each note is shown when the round ends, so the room learns what it just
// traded through, and its clues, in every language, are in public/i18n-long.js.
export type Episode = { id: string; pair: Pair; date: string; title: string; note: string };
export const EVENTS: Episode[] = [
  { id: "franc-cap-dropped", pair: "EUR/CHF", date: "2015-01-15", title: "Francogeddon", note: "The Swiss National Bank dropped its 1.20 floor without warning. The franc jumped about 15% in a day (30% at the worst minute), stops filled far past their levels, and brokers went bust." },
  { id: "franc-cap-set", pair: "EUR/CHF", date: "2011-09-06", title: "The franc floor", note: "The Swiss National Bank capped the franc at 1.20 per euro and promised unlimited intervention. EUR/CHF leapt 8% in a morning." },
  { id: "carry-unwind-2008", pair: "AUD/JPY", date: "2008-10-24", title: "The carry trade unwinds", note: "After Lehman Brothers failed, leveraged yen-funded bets on the high-yielding Australian dollar were dumped at once. AUD/JPY fell from about 107 in July to about 55 in October." },
  { id: "lehman", pair: "AUD/JPY", date: "2008-09-15", title: "Lehman Brothers fails", note: "Lehman Brothers filed for bankruptcy on 15 September 2008. Traders had been selling the high-yielding Australian dollar for the safe yen for weeks: AUD/JPY fell about 10% in the three weeks up to the day." },
  { id: "brexit", pair: "GBP/USD", date: "2016-06-24", title: "Brexit", note: "The UK voted to leave the EU. The pound fell about 8% overnight, to its lowest since 1985." },
  { id: "yuan-devaluation", pair: "USD/CNY", date: "2015-08-11", title: "The yuan devaluation", note: "China's central bank devalued the yuan's daily fixing by nearly 2%, the most in two decades, and kept going for three days." },
  { id: "covid", pair: "AUD/USD", date: "2020-03-19", title: "COVID crash", note: "As the pandemic shut economies, everyone ran for US dollars. AUD/USD fell 12% in ten days to an 18-year low." },
  { id: "carry-unwind-2024", pair: "USD/JPY", date: "2024-08-05", title: "Carry unwind, again", note: "A Bank of Japan rate rise and weak US data sent yen carry trades running for the exit. The Nikkei fell 12% in a day." },
  { id: "euro-rescue", pair: "EUR/USD", date: "2000-09-22", title: "The G7 buys the euro", note: "The euro had fallen more than a quarter since its launch. The central banks of the G7 bought it together, for the first time, and EUR/USD jumped over 4% in a day." },
  { id: "ecb-qe", pair: "EUR/USD", date: "2015-01-23", title: "The ECB prints money", note: "The European Central Bank announced it would buy over a trillion euros of bonds. The euro fell almost 4% in a day, to its lowest in twelve years." },
  { id: "yuan-revalued", pair: "USD/CNY", date: "2005-07-21", title: "The yuan is unpegged", note: "China ended its fixed rate of 8.28 yuan to the dollar and let the yuan rise 2% overnight. After ten years of standing still, the yuan had its biggest one-day move for the next twenty-one years." },
  { id: "quant-crash", pair: "AUD/JPY", date: "2007-08-16", title: "The quant crash", note: "Funds that had borrowed yen to bet on higher-yielding currencies were forced to sell as credit markets froze. AUD/JPY fell almost 7% in a day, the first tremor of the 2008 crisis." },
  { id: "bear-stearns", pair: "USD/JPY", date: "2008-03-17", title: "Bear Stearns is rescued", note: "JPMorgan bought the failing Bear Stearns bank in a deal the Federal Reserve arranged over the weekend. The dollar fell more than 4% against the yen." },
];

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

const normal = (rnd: () => number): number => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// Nine ticks a day between real closes: a random walk pinned to land on
// each close, its wiggle sized to the day's move. A big day gaps first.
export function path(closes: number[], rnd: () => number): number[] {
  const prices = [closes[0]];
  for (let d = 1; d < closes.length; d++) {
    const from = Math.log(closes[d - 1]);
    const to = Math.log(closes[d]);
    const move = to - from;
    const gap = Math.abs(move) > GAP ? move * 0.8 : 0;
    const sigma = Math.max(Math.abs(move), 0.002) / Math.sqrt(STEPS);
    // A walk of STEPS steps, then bent so it ends where the day closed.
    const walk = [0];
    for (let s = 1; s <= STEPS; s++) walk.push(walk[s - 1] + normal(rnd) * sigma * (gap ? 0.3 : 1));
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const pinned = walk[s] - t * walk[STEPS];
      const drift = gap ? gap + (move - gap) * t : move * t;
      prices.push(s === STEPS ? closes[d] : Math.exp(from + drift + pinned));
    }
  }
  return prices;
}

// A replay round of one plot, drawn at random or named by `pick` (the lobby's choice of
// plot). The window is placed so the day lands between day 11 and day 28 of the thirty:
// at least ten days of the build-up to read, and two days after it. Where it starts in
// the calendar is the plot's own, and the room is not told.
export function replay(history: History, rnd: () => number, pick?: string): Round {
  const event = EVENTS.find((e) => e.id === pick) ?? EVENTS[Math.floor(rnd() * EVENTS.length)];
  const series = history.series(event.pair);
  const at = series.findIndex((d) => d.date === event.date);
  const start = at - (11 + Math.floor(rnd() * 18));
  return window(series, start, event.pair, rnd, event);
}

// A replay that hides a famous day drips two clues before it (ADR 0030),
// a third and two thirds of the way there; their words, in every
// language, are in public/i18n-long.js under the day's date.
function window(series: Day[], start: number, pair: Pair, rnd: () => number, event: Episode): Round {
  const days = series.slice(start, start + DAYS + 1);
  // The thirty days before the open, ending on it, so the chart is continuous.
  const before = series.slice(start - LOOKBACK, start + 1).map((d) => d.rate);
  const dates = days.map((d) => d.date);
  const at = dates.indexOf(event.date);
  const headlines = [{ day: Math.floor(at / 3) }, { day: Math.floor((2 * at) / 3) }];
  return { pair, days: dates, prices: path(days.map((d) => d.rate), rnd), history: path(before, rnd), event, simulated: false, headlines };
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

// A Scenario round from today's real rate: thirty simulated days, each
// move drawn at the pair's real volatility over the past year and bent by
// the scenario's plan. The day the scenario turns is drawn, so the turn
// can't be timed by the calendar. `pick` forces a scenario, for checks.
// `quiet` plays the scenario with no news, so a check can read its shape alone.
export function scenario(history: History, pair: Pair, rate: number, rnd: () => number, pick?: string, quiet = false): Round {
  const recent = history.series(pair).slice(-251);
  const moves = recent.slice(1).map((d, i) => Math.log(d.rate / recent[i].rate));
  // A floor of 0.4% a day, so a pegged pair still moves enough to play.
  const vol = Math.max(0.004, Math.sqrt(moves.reduce((s, m) => s + m * m, 0) / moves.length));
  const script = SCENARIOS.find((x) => x.id === pick) ?? SCENARIOS[Math.floor(rnd() * SCENARIOS.length)];
  // The turn comes between day 13 and day 22: late enough for the story to have
  // built, with twelve calm days to read, and early enough that eight are left
  // for it to play out (a carry unwind falls for five).
  const crash = 13 + Math.floor(rnd() * 10);
  // Each situation runs either way up, so no one can just sell every round: a
  // peg can break up as well as down, a carry trade unwind either way.
  const way = rnd() < 0.5 ? 1 : -1;
  const news = quiet ? [] : drawNews(rnd, crash);
  const closes = [rate];
  for (let d = 0; d < DAYS; d++) {
    const { drift, vol: wild } = script.plan(d, crash, (way * Math.log(closes[d] / rate)) / vol);
    // what the news does on this day, on top of the scenario's own drift; it is the same way
    // up for everyone, since it is a story and not a bet
    closes.push(closes[d] * Math.exp((way * drift + newsDrift(news, d) + normal(rnd) * wild) * vol));
  }
  const days = closes.map((_, d) => `day ${d}`);
  // The pair's real last thirty days, then today's rate as the open, so what the
  // chart shows before the round is real and the round starts where it ends.
  const before = [...history.series(pair).slice(-LOOKBACK).map((d) => d.rate), rate];
  return { pair, days, prices: path(closes, rnd), history: path(before, rnd), event: null, simulated: true, scenario: script.id, headlines: script.headlines, news };
}
