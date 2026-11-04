// Marathon's real prices (ADR 0087): six dollar rates from Yahoo Finance's public chart service, polled every few
// seconds while anyone watches, from which all twenty-one pairs of the seven currencies are crossed, so every pair agrees
// with every other. The offshore yuan, CNH, stands for the yuan: the onshore rate stops overnight. Prices are kept as
// fifteen-minute closes, the game's own tick (ADR 0085), the newest slot's close being the price now.
import http from "node:http";
import https from "node:https";
import { PAIRS, type Pair } from "./market.ts";

export const CURRENCIES = ["EUR", "GBP", "AUD", "USD", "CHF", "CNY", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];
// Each currency's symbol, and whether the quote is dollars per unit (EURUSD) or units per dollar (JPY=X).
const SYMBOLS: Record<Exclude<Currency, "USD">, [string, boolean]> = { EUR: ["EURUSD=X", true], GBP: ["GBPUSD=X", true], AUD: ["AUDUSD=X", true], CHF: ["CHF=X", false], CNY: ["CNH=X", false], JPY: ["JPY=X", false] };
export const SLOT_MS = 15 * 60_000;
// A price older than this is not live: the market is shut (a weekend) or the feed is down, and orders wait.
export const STALE_MS = 10 * 60_000;
// Kept a little over five trading days of slots, as a Replay's chart shows.
const KEEP = 96 * 6;

// Dollars per one unit of each currency, by slot.
export type Usd = Record<Currency, number>;
type Spark = { spark?: { result?: { symbol: string; response: { meta: { regularMarketPrice: number; regularMarketTime: number }; timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] }[] } };
export type Fetcher = (url: string) => Promise<Spark>;

// Yahoo answers Fly's machine over IPv4 and times out over IPv6, where fetch may wait on it, so the request is made
// over IPv4 alone. A plain client is refused without a browser's name.
const yahoo: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    const req = (url.startsWith("https:") ? https : http).get(url, { family: 4, timeout: 8_000, headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Losscut/1.0" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`prices ${res.statusCode}`));
        try {
          resolve(JSON.parse(body) as Spark);
        } catch {
          reject(new Error("prices unreadable"));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("prices timed out")));
    req.on("error", reject);
  });
// MARATHON_FEED points the feed at another address with the same answer, for the checks, which never reach the network
const HOST = process.env.MARATHON_FEED ?? "https://query2.finance.yahoo.com";
const url = (range: string) => `${HOST}/v7/finance/spark?symbols=${Object.values(SYMBOLS).map(([s]) => s).join(",")}&range=${range}&interval=15m`;

export const cross = (usd: Usd, pair: string): number => {
  const [b, q] = pair.split("/") as [Currency, Currency];
  return usd[b] / usd[q];
};
// What one unit of `from` is worth in `to`.
export const convert = (usd: Usd, from: Currency, to: Currency): number => usd[from] / usd[to];

export class Live {
  // slot number (ms since epoch / SLOT_MS) to dollar rates, in order
  slots: { slot: number; usd: Usd }[] = [];
  // when the newest price was struck, by the source's clock
  at = 0;
  failures = 0;
  private get: Fetcher;
  private now: () => number;
  constructor(get: Fetcher = yahoo, now: () => number = Date.now) {
    this.get = get;
    this.now = now;
  }

  private merge(data: Spark, live: boolean): void {
    const rows = data.spark?.result;
    if (!rows?.length) throw new Error("no prices");
    const bySlot = new Map<number, Partial<Usd>>();
    let at = 0;
    for (const row of rows) {
      const cur = (Object.keys(SYMBOLS) as Exclude<Currency, "USD">[]).find((c) => SYMBOLS[c][0] === row.symbol);
      const r = row.response[0];
      if (!cur || !r) continue;
      const perUsd = !SYMBOLS[cur][1];
      const usd = (p: number) => (perUsd ? 1 / p : p);
      (r.timestamp ?? []).forEach((t, i) => {
        const c = r.indicators.quote[0]?.close[i];
        if (c == null || !(c > 0)) return;
        const s = Math.floor((t * 1000) / SLOT_MS);
        bySlot.set(s, { ...bySlot.get(s), [cur]: usd(c) });
      });
      // the price now goes in the slot it was struck in
      if (live && r.meta.regularMarketPrice > 0) {
        const s = Math.floor((r.meta.regularMarketTime * 1000) / SLOT_MS);
        bySlot.set(s, { ...bySlot.get(s), [cur]: usd(r.meta.regularMarketPrice) });
        // the market's time is the major pairs', which trade around the clock on weekdays
        if (cur === "EUR") at = r.meta.regularMarketTime * 1000;
      }
    }
    const known = new Map(this.slots.map((x) => [x.slot, x.usd]));
    for (const [s, part] of bySlot) known.set(s, { ...(known.get(s) ?? ({} as Usd)), ...part, USD: 1 } as Usd);
    // a currency missing from a slot carries its last price forward
    let last: Partial<Usd> = {};
    this.slots = [...known.entries()].sort((a, b) => a[0] - b[0]).map(([slot, usd]) => {
      const full = { ...last, ...usd } as Usd;
      last = full;
      return { slot, usd: full };
    }).filter((x) => CURRENCIES.every((c) => x.usd[c] > 0)).slice(-KEEP);
    // the source's own time of its last price: on a weekend it stays on Friday's close, and the market reads as shut
    if (at) this.at = at;
  }

  // Five days of fifteen-minute closes, at start and on the hour after.
  async backfill(): Promise<void> {
    this.merge(await this.get(url("5d")), true);
  }
  // The day's closes and the price now, every few seconds.
  async poll(): Promise<void> {
    try {
      this.merge(await this.get(url("1d")), true);
      this.failures = 0;
    } catch (e) {
      this.failures++;
      throw e;
    }
  }
  live(): boolean {
    return this.slots.length > 0 && this.now() - this.at < STALE_MS;
  }
  latest(): Usd | null {
    return this.slots.at(-1)?.usd ?? null;
  }
  // A pair's closes, oldest first, and the slot number of the newest.
  series(pair: Pair | string): { prices: number[]; last: number } {
    return { prices: this.slots.map((x) => cross(x.usd, pair)), last: this.slots.at(-1)?.slot ?? 0 };
  }
}

export const MARATHON_PAIRS: readonly Pair[] = PAIRS;
