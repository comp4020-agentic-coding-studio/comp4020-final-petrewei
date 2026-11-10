import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Feed, SLOT_MS } from "../src/feed.ts";
import { parseQuotes } from "../src/quotes.ts";
it("classifies observed, carried and closed slots from a recorded provider answer, with no slot left pending", async () => {
  const fixture: unknown = JSON.parse(readFileSync("test/fixtures/spark-sparse.json", "utf8"));
  let now = 1793786400 * 1000;
  const quotes = new Feed(async () => fixture, () => now);
  await quotes.backfill();
  const slot = Math.floor(now / SLOT_MS);
  expect(quotes.quality(slot, ["AUD/USD"])).toBe("observed");
  // a skipped bar is carried from the price before it at once, never waited for: the game is play money, so a recent
  // hole is settled on the carried price instead of pausing Live (ADR 0097)
  expect(quotes.quality(slot - 1, ["AUD/USD"])).toBe("carried");
  expect(quotes.quality(slot - 5, ["AUD/USD"])).toBe("carried");
  expect(quotes.coversSince(slot - 8, ["AUD/USD"])).toBe(true);
  now += 60 * 60_000;
  expect(quotes.coversSince(slot - 8, ["AUD/USD"])).toBe(true);
  expect(quotes.quality(Math.floor(Date.parse("2026-11-07T12:00:00Z") / SLOT_MS))).toBe("closed");
  expect(quotes.diagnostics().lastSuccess).toBe(1793786400 * 1000);
});
it("validates malformed provider rows before merging and preserves the last good feed on failure", async () => {
  expect(() => parseQuotes({ spark: { result: [{ symbol: "AUDUSD=X", response: [null] }] } })).toThrow("no valid prices");
  expect(() => parseQuotes(null)).toThrow("no prices");
  let data: unknown = JSON.parse(readFileSync("test/fixtures/spark-sparse.json", "utf8"));
  const quotes = new Feed(async () => data, () => 1793786400 * 1000);
  await quotes.poll(); const prices = quotes.series("AUD/USD").prices;
  data = { spark: { result: [{ symbol: "AUDUSD=X", response: [{}] }] } };
  await expect(quotes.poll()).rejects.toThrow("no valid prices");
  expect(quotes.series("AUD/USD").prices).toEqual(prices);
  expect(quotes.diagnostics().failures).toBe(1);
});
it("names when the FX week next opens: Sunday 17:00 in New York, after the weekend or a holiday", async () => {
  const { nextOpen } = await import("../src/history-policy.ts");
  const at = (iso: string): string => new Date(nextOpen(Date.parse(iso))!).toISOString();
  // Saturday 7 November 2026, noon UTC: the week opens Sunday 8 November at 17:00 New York, 22:00 UTC (EST)
  expect(at("2026-11-07T12:00:00Z")).toBe("2026-11-08T22:00:00.000Z");
  // Friday 6 November 2026 at 17:30 New York, just after the close: the same Sunday open
  expect(at("2026-11-06T22:30:00Z")).toBe("2026-11-08T22:00:00.000Z");
  // in summer New York is on EDT, so the open is 21:00 UTC: Saturday 4 July 2026 opens Sunday 5 July
  expect(at("2026-07-04T12:00:00Z")).toBe("2026-07-05T21:00:00.000Z");
  // Christmas Day 2026 is a Friday, closed from 17:00 on the 24th; the market stays shut to the Sunday open
  expect(at("2026-12-25T12:00:00Z")).toBe("2026-12-27T22:00:00.000Z");
  // during trading hours there is no next open to wait for
  expect(nextOpen(Date.parse("2026-11-10T12:00:00Z"))).toBeNull();
});
it("says when the FX week is open: Sunday 17:00 to Friday 17:00 in New York", async () => {
  const { weekOpen } = await import("../src/history-policy.ts");
  expect(weekOpen(Date.parse("2026-11-10T12:00:00Z")), "a Tuesday").toBe(true);
  expect(weekOpen(Date.parse("2026-11-07T12:00:00Z")), "a Saturday").toBe(false);
  expect(weekOpen(Date.parse("2026-11-08T21:50:00Z")), "Sunday before the open").toBe(false);
  expect(weekOpen(Date.parse("2026-11-08T22:10:00Z")), "Sunday after the open").toBe(true);
});
