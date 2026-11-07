// Live's real prices (ADR 0087): six dollar rates from Yahoo Finance's public chart service, polled every few
// seconds while anyone watches, from which all twenty-one pairs of the seven currencies are crossed, so every pair agrees
// with every other. The offshore yuan, CNH, stands for the yuan: the onshore rate stops overnight. Prices are kept as
// fifteen-minute closes, the game's own tick (ADR 0085), the newest slot's close being the price now.
import { PAIRS, type Pair } from "./market.ts";
import { CURRENCIES, SLOT_MS, SYMBOLS, parseQuotes, type Currency, type Fetcher, type Usd } from "./quotes.ts";
import { SETTLED_MS, slotQuality, type Quality } from "./history-policy.ts";
import { yahoo } from "./yahoo.ts";
export { CURRENCIES, SLOT_MS, type Currency, type Fetcher, type Usd } from "./quotes.ts";
export const STALE_MS = 10 * 60_000;
const KEEP = 96 * 6;
const currenciesFor = (pairs: readonly string[]): Set<Currency> => new Set<Currency>(["AUD", ...pairs.flatMap((pair) => pair.split("/") as Currency[])]);
export const cross = (usd: Usd, pair: string): number => {
  const [b, q] = pair.split("/") as [Currency, Currency];
  return usd[b] / usd[q];
};
// What one unit of `from` is worth in `to`.
export const convert = (usd: Usd, from: Currency, to: Currency): number => usd[from] / usd[to];

export class Feed {
  // slot number (ms since epoch / SLOT_MS) to dollar rates, in order
  slots: { slot: number; usd: Usd }[] = [];
  // when the newest price was struck, by the source's clock
  at = 0;
  private fetched = new Map<number, Set<Currency>>();
  private traded = new Set<number>();
  private times: Partial<Record<Currency, number>> = {};
  failures = 0;
  private get: Fetcher;
  private host: string;
  lastSuccess = 0;
  private url(range: string): string { return `${this.host}/v7/finance/spark?symbols=${Object.values(SYMBOLS).map(([s]) => s).join(",")}&range=${range}&interval=15m`; }
  private now: () => number;
  constructor(get: Fetcher = yahoo, now: () => number = Date.now, privateHost = process.env.LIVE_FEED ?? "https://query2.finance.yahoo.com") {
    this.get = get;
    this.host = privateHost;
    this.now = now;
  }

  private merge(data: unknown): void {
    const observations = parseQuotes(data);
    const bySlot = new Map<number, Partial<Usd>>();
    const fetched = new Map<number, Set<Currency>>();
    const traded = new Set<number>();
    const record = (slot: number, cur: Currency, price: number): void => {
      bySlot.set(slot, { ...bySlot.get(slot), [cur]: price });
      const currencies = fetched.get(slot) ?? new Set<Currency>();
      currencies.add(cur);
      fetched.set(slot, currencies);
    };
    const times: Partial<Record<Currency, number>> = {};
    const quotes: Partial<Usd> = {};
    for (const observation of observations) {
      const { slot, cur, price, historical, at } = observation;
      record(slot, cur, price);
      if (historical) traded.add(slot);
      if (at !== undefined) { times[cur] = at; quotes[cur] = price; }
    }
    this.fetched = fetched;
    this.traded = traded;
    const known = new Map(this.slots.map((x) => [x.slot, x.usd]));
    for (const [s, part] of bySlot) known.set(s, { ...(known.get(s) ?? ({} as Usd)), ...part, USD: 1 } as Usd);
    // a currency missing from a slot carries its last price forward
    let last: Partial<Usd> = {};
    this.slots = [...known.entries()].sort((a, b) => a[0] - b[0]).map(([slot, usd]) => {
      const full = { ...last, ...usd } as Usd;
      last = full;
      return { slot, usd: full };
    }).filter((x) => CURRENCIES.every((c) => x.usd[c] > 0));
    const newest = this.slots.at(-1);
    if (newest) {
      const cutoff = newest.slot * SLOT_MS - STALE_MS;
      for (const cur of CURRENCIES) {
        const price = quotes[cur];
        if (price !== undefined && (times[cur] ?? 0) >= cutoff) newest.usd[cur] = price;
      }
    }
    this.times = times;
    this.at = Math.max(0, ...Object.values(times));
    this.lastSuccess = this.now();
  }

  // Five days of fifteen-minute closes, at start and on the hour after.
  async backfill(extended = false): Promise<void> {
    this.merge(await this.get(this.url(extended ? "1mo" : "5d")));
  }

  trim(): void {
    this.slots = this.slots.slice(-KEEP);
  }
  // The day's closes and the price now, every few seconds.
  async poll(): Promise<void> {
    try {
      this.merge(await this.get(this.url("1d")));
      this.failures = 0;
    } catch (e) {
      this.failures++;
      throw e;
    }
  }
  // Whether every trading slot from `slot` on has a price of its own for each of these pairs' currencies, so that
  // settling an account across them misses nothing. Yahoo leaves a few fifteen-minute bars out of most weeks and never
  // sends them; a slot older than SETTLED_MS is therefore taken as final, its hole carried over from the slot before,
  // and only a recent slot, which may still arrive, is waited for.
  coversSince(slot: number, pairs: readonly string[]): boolean {
    const last = this.slots.at(-1)?.slot;
    if (last === undefined) return false;
    const settled = Math.floor((this.now() - SETTLED_MS) / SLOT_MS);
    for (let at = Math.max(slot, settled + 1); at <= last; at++) if (this.quality(at, pairs) === "pending") return false;
    return true;
  }

  quality(slot: number, pairs: readonly string[] = PAIRS): Quality {
    return slotQuality(slot, [...currenciesFor(pairs)], this.fetched.get(slot), this.traded.has(slot), this.now());
  }
  // A settled hole for every currency needs a carry just as a single-currency hole does.
  // Keep synthesized slots separate from provider observations, and bound recovery to the provider's month.
  settlementSlots(): { slot: number; usd: Usd }[] {
    const first = this.slots[0]; const last = this.slots.at(-1);
    if (!first || !last) return [];
    const observed = new Map(this.slots.map((row) => [row.slot, row]));
    const result: { slot: number; usd: Usd }[] = [];
    let previous = first.usd;
    for (let slot = Math.max(first.slot, last.slot - 31 * 96); slot <= last.slot; slot++) {
      const row = observed.get(slot);
      if (row) { result.push(row); previous = row.usd; }
      else if (this.quality(slot) === "carried") result.push({ slot, usd: { ...previous } });
    }
    return result;
  }
  diagnostics() {
    const quality: Record<Quality, number> = { observed: 0, carried: 0, pending: 0, closed: 0 };
    const last = this.slots.at(-1)?.slot;
    if (last !== undefined) for (let slot = Math.max(this.slots[0].slot, last - KEEP + 1); slot <= last; slot++) quality[this.quality(slot)]++;
    return { failures: this.failures, lastSuccess: this.lastSuccess, priceAt: this.at, latestSlot: this.slots.at(-1)?.slot ?? null, quality, settlementMs: SETTLED_MS };
  }

  live(pairs?: readonly string[]): boolean {
    const currencies = pairs ? currenciesFor(pairs) : CURRENCIES;
    const now = this.now();
    return this.slots.length > 0 && [...currencies].every((cur) => {
      if (cur === "USD") return true;
      const at = this.times[cur];
      return at !== undefined && at <= now && now - at < STALE_MS;
    });
  }
  latest(): Usd | null {
    return this.slots.at(-1)?.usd ?? null;
  }
  // A pair's closes, oldest first, and the slot number of the newest.
  series(pair: Pair | string): { prices: number[]; last: number } {
    return { prices: this.slots.map((x) => cross(x.usd, pair)), last: this.slots.at(-1)?.slot ?? 0 };
  }
}

export const LIVE_PAIRS: readonly Pair[] = PAIRS;
