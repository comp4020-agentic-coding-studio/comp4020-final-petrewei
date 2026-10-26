// Where a round's prices come from. A replay plays forty real trading days
// of one pair from the ECB's daily reference rates (data/ecb.csv, source:
// ECB; the crosses are derived), with the dates hidden until the round
// ends. A Scenario round starts from today's rate and plays out a scripted
// market for forty days.
// Free sources give one rate a day, so between closes the price wanders
// on a random bridge that always lands on the real close; a day that
// moved a lot opens with a gap, as the market did, and stops slip.

export const PAIRS = ["USD/JPY", "EUR/USD", "GBP/USD", "AUD/USD", "USD/CHF", "EUR/CHF", "USD/CNY", "AUD/JPY"] as const;
export type Pair = (typeof PAIRS)[number];
// Forty days a round, nine ticks a day.
export const DAYS = 40;
export const STEPS = 9;
// A day that moved more than this opens with most of its move at once.
export const GAP = 0.015;

type Day = { date: string; rate: number };
export type Round = { pair: Pair; days: string[]; prices: number[]; event: Episode | null; simulated: boolean; scenario?: string; headlines?: Headline[] };
export type Episode = { pair: Pair; date: string; title: string; note: string };

// The famous days a replay may hide. Each note is shown when the round
// ends, so the room learns what it just traded through.
export const EVENTS: Episode[] = [
  { pair: "EUR/CHF", date: "2015-01-15", title: "Francogeddon", note: "The Swiss National Bank dropped its 1.20 floor without warning. The franc jumped about 15% in a day (30% at the worst minute), stops filled far past their levels, and brokers went bust." },
  { pair: "EUR/CHF", date: "2011-09-06", title: "The franc floor", note: "The Swiss National Bank capped the franc at 1.20 per euro and promised unlimited intervention. EUR/CHF leapt 8% in a morning." },
  { pair: "AUD/JPY", date: "2008-10-24", title: "The carry trade unwinds", note: "After Lehman Brothers failed, leveraged yen-funded bets on the high-yielding Australian dollar were dumped at once. AUD/JPY fell from about 107 in July to about 55 in October." },
  { pair: "USD/JPY", date: "2008-09-15", title: "Lehman Brothers fails", note: "Lehman Brothers filed for bankruptcy on 15 September 2008. The yen, the funding currency of the carry trade, rose as the world deleveraged." },
  { pair: "GBP/USD", date: "2016-06-24", title: "Brexit", note: "The UK voted to leave the EU. The pound fell about 8% overnight, to its lowest since 1985." },
  { pair: "USD/CNY", date: "2015-08-11", title: "The yuan devaluation", note: "China's central bank devalued the yuan's daily fixing by nearly 2%, the most in two decades, and kept going for three days." },
  { pair: "AUD/USD", date: "2020-03-19", title: "COVID crash", note: "As the pandemic shut economies, everyone ran for US dollars. AUD/USD fell 12% in ten days to an 18-year low." },
  { pair: "USD/JPY", date: "2022-09-22", title: "Japan intervenes", note: "With the yen at a 24-year low, Japan's Ministry of Finance bought yen for the first time since 1998, after a slide from 115 to 145." },
  { pair: "USD/JPY", date: "2024-08-05", title: "Carry unwind, again", note: "A Bank of Japan rate rise and weak US data sent yen carry trades running for the exit. The Nikkei fell 12% in a day." },
  { pair: "GBP/USD", date: "2022-09-26", title: "The mini-budget", note: "The UK's unfunded tax cuts sent the pound to an all-time low against the dollar and forced the Bank of England to step in." },
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

// A replay round: with chance `eventChance` a window around a famous day,
// placed so the room has ten days of calm first; otherwise any window.
export function replay(history: History, rnd: () => number, eventChance: number): Round {
  if (rnd() < eventChance) {
    const event = EVENTS[Math.floor(rnd() * EVENTS.length)];
    const series = history.series(event.pair);
    const at = series.findIndex((d) => d.date === event.date);
    const start = at - (10 + Math.floor(rnd() * (DAYS - 15)));
    return window(series.slice(start, start + DAYS + 1), event.pair, rnd, event);
  }
  const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
  const series = history.series(pair);
  const start = Math.floor(rnd() * (series.length - DAYS - 1));
  return window(series.slice(start, start + DAYS + 1), pair, rnd, null);
}

function window(days: Day[], pair: Pair, rnd: () => number, event: Episode | null): Round {
  return { pair, days: days.map((d) => d.date), prices: path(days.map((d) => d.rate), rnd), event, simulated: false };
}

// The simulated tab, Scenario (ADR 0027): a round from today's real rate
// that plays out one of a few scripted markets, each modelled on a real
// one, hidden until the bell. A script says, for each day, how far the
// market drifts and how wild it is, as multiples of the pair's own daily
// volatility over the past year; the headlines say just enough, on the
// day, for a careful trader to read it. The reveal names the real market
// it was modelled on, so the bell teaches as History's does.
// A headline is shown on its day; its words, in every language, are in
// public/i18n-long.js under the scenario's id, in the same order.
export type Headline = { day: number };
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

// A Scenario round from today's real rate: forty simulated days, each
// move drawn at the pair's real volatility over the past year and bent by
// the scenario's plan. The day the scenario turns is drawn, so the turn
// can't be timed by the calendar. `pick` forces a scenario, for checks.
export function scenario(history: History, pair: Pair, rate: number, rnd: () => number, pick?: string): Round {
  const recent = history.series(pair).slice(-251);
  const moves = recent.slice(1).map((d, i) => Math.log(d.rate / recent[i].rate));
  // A floor of 0.4% a day, so a pegged pair still moves enough to play.
  const vol = Math.max(0.004, Math.sqrt(moves.reduce((s, m) => s + m * m, 0) / moves.length));
  const script = SCENARIOS.find((x) => x.id === pick) ?? SCENARIOS[Math.floor(rnd() * SCENARIOS.length)];
  const crash = 18 + Math.floor(rnd() * 12);
  // Each script runs either way up, so no one can just sell every round: a
  // peg can break up as well as down, a carry trade unwind either way.
  const way = rnd() < 0.5 ? 1 : -1;
  const closes = [rate];
  for (let d = 0; d < DAYS; d++) {
    const { drift, vol: wild } = script.plan(d, crash, (way * Math.log(closes[d] / rate)) / vol);
    closes.push(closes[d] * Math.exp((way * drift + normal(rnd) * wild) * vol));
  }
  const days = closes.map((_, d) => `day ${d}`);
  return { pair, days, prices: path(closes, rnd), event: null, simulated: true, scenario: script.id, headlines: script.headlines };
}
