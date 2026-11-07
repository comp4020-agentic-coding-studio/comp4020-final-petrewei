// Untrusted provider boundary: normalize valid positive prices, and retain their provenance.
import { record, finite } from "./storage.ts";
export const CURRENCIES = ["EUR", "GBP", "AUD", "USD", "CHF", "CNY", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Usd = Record<Currency, number>;
export const SLOT_MS = 15 * 60_000;
export const SYMBOLS: Record<Exclude<Currency, "USD">, [string, boolean]> = { EUR: ["EURUSD=X", true], GBP: ["GBPUSD=X", true], AUD: ["AUDUSD=X", true], CHF: ["CHF=X", false], CNY: ["CNH=X", false], JPY: ["JPY=X", false] };
export type Fetcher = (url: string) => Promise<unknown>;
export type Observation = { slot: number; cur: Currency; price: number; historical: boolean; at?: number };
export function parseQuotes(data: unknown): Observation[] {
  if (!record(data) || !record(data.spark) || !Array.isArray(data.spark.result) || !data.spark.result.length) throw new Error("no prices");
  const observations: Observation[] = [];
  for (const row of data.spark.result) {
    if (!record(row) || !Array.isArray(row.response)) continue;
    const cur = (Object.keys(SYMBOLS) as Exclude<Currency, "USD">[]).find((c) => SYMBOLS[c][0] === row.symbol);
    const response: unknown = row.response[0];
    if (!cur || !record(response)) continue;
    const toUsd = (price: number): number => SYMBOLS[cur][1] ? price : 1 / price;
    const indicators = response.indicators;
    const quote: unknown = record(indicators) && Array.isArray(indicators.quote) ? indicators.quote[0] : null;
    const closes = record(quote) && Array.isArray(quote.close) ? quote.close : [];
    if (Array.isArray(response.timestamp)) response.timestamp.forEach((time: unknown, index: number) => {
      const price: unknown = closes[index];
      if (finite(time) && finite(price) && price > 0) observations.push({ cur, price: toUsd(price), slot: Math.floor(time * 1000 / SLOT_MS), historical: true });
    });
    const meta = response.meta;
    if (record(meta) && finite(meta.regularMarketTime) && finite(meta.regularMarketPrice) && meta.regularMarketPrice > 0) {
      const at = meta.regularMarketTime * 1000;
      observations.push({ cur, price: toUsd(meta.regularMarketPrice), slot: Math.floor(at / SLOT_MS), at, historical: false });
    }
  }
  if (!observations.length) throw new Error("no valid prices");
  return observations;
}
