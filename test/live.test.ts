// ADR 0087: Live, on real prices. The book's arithmetic with fixed rates (a position's result in dollars, the
// account-wide margin level and stop-out, bankruptcy), the feed's crosses from a recorded answer, and the news filter,
// without the network: the sources are replaced by fixed text.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { bankrupt, borrow, charge, close, enforce, equity, fresh, level, lines, nextSydneyMidnight, order, pnlOf, worth } from "../src/book.ts";
import { START, STEP } from "../src/fx.ts";
import { cross, Feed, SLOT_MS, type Usd } from "../src/feed.ts";
import { News, parseCalendar, parseFeed } from "../src/news.ts";
import { Live, type Who } from "../src/live.ts";
import { spark } from "./yahoo-fake.ts";

const usd = (over: Partial<Usd> = {}): Usd => ({ EUR: 1.12, GBP: 1.35, AUD: 0.7, USD: 1, CHF: 1 / 0.82, CNY: 1 / 6.67, JPY: 1 / 158, ...over });

describe("the Live book", () => {
  // ADR 0095: the house traders in Live, each on a real pair of its own, trading at the price it is given and told in
  // the feed by pair, never touching a player's account.
  it("lets the house traders trade Live's prices, each on its pair, told in the feed", async () => {
    const { LiveBots } = await import("../src/live-bots.ts");
    let seed = 1;
    const bots = new LiveBots(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const said: { key: string; args: Record<string, string | number> }[] = [];
    // a market that falls then rises, so the dip-buyers and trend-chasers both have something to do
    for (let i = 0; i < 200; i++) bots.step(usd({ AUD: 0.7 * (1 + 0.004 * Math.sin(i / 9)), JPY: 1 / (158 * (1 + 0.003 * Math.cos(i / 7))) }), (_t, _k, key, args) => said.push({ key, args }));
    const opened = said.filter((x) => x.key === "m-bought" || x.key === "m-sold");
    expect(opened.length, "the bots trade").toBeGreaterThan(3);
    for (const x of opened) {
      expect(String(x.args.who)).toMatch(/^bot:/);
      expect(String(x.args.pair)).toMatch(/^[A-Z]{3}\/[A-Z]{3}$/);
    }
    expect(new Set(opened.map((x) => x.args.who)).size, "more than one of them").toBeGreaterThan(1);
  });

  // ADR 0095: a price alert rings once when the price reaches its level, from whichever side it was set, and is gone.
  it("rings an alert once when the price reaches it, and refuses one it cannot keep", async () => {
    const { setAlert, ringAlerts, cancelAlert } = await import("../src/book.ts");
    const a = fresh(0, 0);
    expect(setAlert(a, "AUD/USD", usd(), 0.71)).toBeNull();
    expect(setAlert(a, "AUD/USD", usd(), 0.69)).toBeNull();
    expect(ringAlerts(a, usd()), "nothing reached yet").toEqual([]);
    expect(ringAlerts(a, usd({ AUD: 0.711 })).map((x) => x.at), "the one above rings when the price rises to it").toEqual([0.71]);
    expect(a.alerts!.map((x) => x.at)).toEqual([0.69]);
    expect(ringAlerts(a, usd({ AUD: 0.711 })), "a rung alert does not ring again").toEqual([]);
    expect(setAlert(a, "AUD/USD", usd(), 0)).toMatch(/Type the price/);
    expect(setAlert(a, "AUD/USD", usd(), 2)).toMatch(/within 50%/);
    for (const at of [0.72, 0.73, 0.74, 0.75]) setAlert(a, "AUD/USD", usd(), at);
    expect(setAlert(a, "AUD/USD", usd(), 0.76)).toMatch(/five alerts/);
    expect(cancelAlert(a, "AUD/USD", 0.72)).toBeNull();
    expect(cancelAlert(a, "AUD/USD", 0.72)).toMatch(/no such alert/);
  });

  // ADR 0095: Live's daily line. Each Sydney day an account starts from its net worth then; at the next midnight there,
  // the day it closes is kept as yesterday, its change and the trades closed in it. Nothing moves within a day.
  it("keeps each Sydney day's change and trades, and starts the next from net worth then", async () => {
    const { rollDay, sydneyDay } = await import("../src/book.ts");
    // 23:00 on 8 November in Sydney (UTC+11) is 12:00 UTC; midnight there is 13:00 UTC
    const evening = Date.UTC(2026, 10, 8, 12);
    const morning = Date.UTC(2026, 10, 8, 14);
    expect(sydneyDay(evening)).toBe("2026-11-08");
    expect(sydneyDay(morning)).toBe("2026-11-09");
    const a = fresh(evening, 0);
    expect(rollDay(a, usd(), evening)).toBe(true);
    expect(a).toMatchObject({ day: "2026-11-08", dayWorth: START });
    expect(rollDay(a, usd(), evening + 30 * 60_000), "the same day changes nothing").toBe(false);
    a.balance += 250;
    a.trades.push({ pair: "AUD/USD", side: 1, leverage: 10, entry: 0.7, exit: 0.71, how: "close", pnl: 250, pct: 0.1, at: evening + 60_000 });
    expect(rollDay(a, usd(), morning)).toBe(true);
    expect(a.yesterday).toEqual({ day: "2026-11-08", change: 250, trades: 1 });
    expect(a).toMatchObject({ day: "2026-11-09", dayWorth: START + 250 });
  });

  // ADR 0094: a pair either way round is a market of its own. Buying AUD/EUR and selling EUR/AUD are the same bet on
  // the Australian dollar against the euro: when the euro falls, each makes about the same in Australian dollars.
  it("trades a pair either way round, buying one the mirror of selling the other", () => {
    const r = usd();
    const reversed = fresh(0, 0);
    const standard = fresh(0, 0);
    expect(order(reversed, "AUD/EUR", r, 1, 10, 0.5, {}, 0)).not.toBeTypeOf("string");
    expect(order(standard, "EUR/AUD", r, -1, 10, 0.5, {}, 0)).not.toBeTypeOf("string");
    expect(cross(r, "AUD/EUR") * cross(r, "EUR/AUD")).toBeCloseTo(1, 9);
    const euroFalls = usd({ EUR: 1.12 * 0.99 });
    const onReversed = pnlOf(reversed.positions["AUD/EUR"], "AUD/EUR", euroFalls);
    const onStandard = pnlOf(standard.positions["EUR/AUD"], "EUR/AUD", euroFalls);
    expect(onReversed).toBeGreaterThan(0);
    expect(onStandard).toBeGreaterThan(0);
    // the same move, a little apart: one is sized in Australian dollars, the other in euros
    expect(Math.abs(onReversed - onStandard) / onStandard).toBeLessThan(0.02);
  });

  it("opens one position per pair and counts each one's result in Australian dollars", () => {
    const a = fresh(0, 0);
    const r = usd();
    expect(order(a, "AUD/JPY", r, 1, 10, 0.25, {}, 0)).not.toBeTypeOf("string");
    expect(order(a, "EUR/USD", r, -1, 10, 0.25, {}, 0)).not.toBeTypeOf("string");
    expect(Object.keys(a.positions)).toEqual(["AUD/JPY", "EUR/USD"]);
    // A$2,500 at 10x on AUD/JPY controls A$25,000; a 1% rise in the yen price of the dollar is about A$250
    const up = usd({ JPY: 1 / (158 * 1.01) });
    // 1% of A$25,000, the yen's profit worth a little less at the new rate, less the spread: A$242.50
    expect(pnlOf(a.positions["AUD/JPY"], "AUD/JPY", up)).toBeCloseTo(25_000 * 0.01 / 1.01 - 5, 1);
    // a short on EUR/USD makes money when the euro falls, paid in dollars and counted in Australian dollars
    const down = usd({ EUR: 1.12 * 0.99 });
    expect(pnlOf(a.positions["EUR/USD"], "EUR/USD", down)).toBeGreaterThan(240);
    expect(pnlOf(a.positions["EUR/USD"], "EUR/USD", down)).toBeLessThan(250);
  });

  it("stops out the whole account when its margin level falls to 20%, closing every pair", () => {
    const a = fresh(0, 0);
    order(a, "AUD/USD", usd(), 1, 100, 0.5, {}, 0);
    order(a, "GBP/USD", usd(), 1, 100, 1, {}, 0);
    // both longs against the US dollar: a 0.9% fall in each takes the level under 20%
    const crash = usd({ AUD: 0.7 * 0.991, GBP: 1.35 * 0.991 });
    expect(level(a, crash)).toBeLessThan(0.2);
    const fills = enforce(a, crash, 1);
    expect(fills.map((f) => f.kind)).toEqual(["stopout", "stopout"]);
    expect(a.positions).toEqual({});
    expect(a.cuts).toBe(1);
  });

  it("nets winning and losing positions before applying zero-cut protection", () => {
    const a = fresh(0, 0);
    const rates = usd();
    order(a, "AUD/USD", rates, 1, 100, 0.5, {}, 0);
    order(a, "GBP/USD", rates, 1, 100, 0.25, {}, 0);
    const crash = usd({ AUD: rates.AUD * 0.95, GBP: rates.GBP * 1.01 });
    expect(equity(a, crash)).toBeLessThan(0);
    const fills = enforce(a, crash, 1);
    expect(fills).toHaveLength(2);
    expect(fills[1].pnl).toBeGreaterThan(0);
    expect(a.balance).toBe(0);
    expect(bankrupt(a, crash)).toBe(true);
  });

  it("puts one pair's stop-out where the whole account would reach 20%", () => {
    const a = fresh(0, 0);
    const r = usd();
    order(a, "AUD/USD", r, 1, 30, 1, {}, 0);
    const at = lines(a, "AUD/USD", r)!;
    expect(level(a, usd({ AUD: at.cut * 1.0001 }))).toBeGreaterThan(0.2);
    expect(level(a, usd({ AUD: at.cut * 0.9999 }))).toBeLessThan(0.2);
  });

  it("charges fees and interest by the fifteen minutes, and reverses with a second click, not one", () => {
    const a = fresh(0, 0);
    order(a, "AUD/USD", usd(), 1, 100, 0.5, {}, 0);
    borrow(a);
    const before = equity(a, usd()) - a.debt;
    for (let i = 0; i < 96; i++) charge(a);
    expect(equity(a, usd()) - a.debt).toBeLessThan(before);
    expect(a.debt).toBeGreaterThan(STEP * 1.004);
    // a sell against the long closes it; a second sell would open a short
    expect((order(a, "AUD/USD", usd(), -1, 10, 0.25, {}, 1) as { kind: string }[])[0].kind).toBe("close");
    expect(a.positions["AUD/USD"]).toBeUndefined();
  });

  it("calls an account with nothing open and under A$100 bankrupt, and opens the next at midnight in Sydney", () => {
    const a = fresh(0, 0);
    expect(bankrupt(a, usd())).toBe(false);
    a.balance = 50;
    expect(bankrupt(a, usd())).toBe(true);
    expect(worth(a, usd())).toBe(50);
    // 9:00 on 5 November 2026 in Sydney (UTC+11) is 22:00 on the 4th in UTC; the next midnight there is 13:00 UTC the 5th
    expect(new Date(nextSydneyMidnight(Date.UTC(2026, 10, 4, 22))).toISOString()).toBe("2026-11-05T13:00:00.000Z");
    expect(close(a, "AUD/USD", usd(), 0)).toBe("Nothing to close.");
    expect(START).toBe(10_000);
  });
});

describe("the live feed", () => {
  it("crosses all 21 pairs from six dollar rates, so every pair agrees with every other, and goes stale", async () => {
    const t = Date.UTC(2026, 10, 4, 21, 0) / 1000;
    const answer = spark(t + 300, [t - 900, t], (_s, p, at) => (at === t ? p : p * 0.999));
    let now = (t + 400) * 1000;
    const quotes = new Feed(async () => answer, () => now);
    await quotes.backfill();
    const last = quotes.latest()!;
    expect(cross(last, "AUD/JPY")).toBeCloseTo(0.7 * 158, 6);
    expect(cross(last, "EUR/GBP")).toBeCloseTo(1.12 / 1.35, 6);
    expect(cross(last, "CNY/JPY")).toBeCloseTo(158 / 6.67, 6);
    expect(cross(last, "EUR/AUD") * cross(last, "AUD/JPY")).toBeCloseTo(cross(last, "EUR/JPY"), 6);
    expect(quotes.live()).toBe(true);
    answer.spark.result[1].response[0].meta.regularMarketTime -= 3600;
    await quotes.poll();
    expect(quotes.live(["EUR/USD"])).toBe(true);
    expect(quotes.live(["GBP/USD"])).toBe(false);
    expect(quotes.live(["EUR/USD", "GBP/USD"])).toBe(false);
    now += 11 * 60_000;
    expect(quotes.live(), "no price for over ten minutes is a shut market").toBe(false);
  });

  it("requires intermediate quotes for the account's currencies, even when another currency has the slot", async () => {
    const start = Date.parse("2026-11-04T10:00:00Z") / 1000;
    const answer = spark(start + 2700, [start, start + 900, start + 1800]);
    const pound = answer.spark.result.find((row) => row.symbol === "GBPUSD=X")!;
    const closes: (number | null)[] = pound.response[0].indicators.quote[0].close;
    closes[1] = null;
    const quotes = new Feed(async () => answer, () => (start + 2700) * 1000);
    await quotes.backfill();
    expect(quotes.coversSince(start * 1000 / SLOT_MS + 1, ["EUR/USD"])).toBe(true);
    expect(quotes.coversSince(start * 1000 / SLOT_MS + 1, ["GBP/USD"])).toBe(false);
  });

  it.each([
    ["2026-07-03T20:45:00Z", "2026-07-05T21:00:00Z"],
    ["2026-11-06T21:45:00Z", "2026-11-08T22:00:00Z"],
    ["2026-10-30T20:45:00Z", "2026-11-01T22:00:00Z"],
  ])("allows the weekly closure from %s to %s, and waits for the last trading slot only while it may still come", async (friday, sunday) => {
    const last = Date.parse(friday);
    const opens = Date.parse(sunday);
    const complete = new Feed(async () => spark(opens / 1000, [last / 1000]), () => opens);
    await complete.backfill();
    expect(complete.coversSince(last / SLOT_MS + 1, ["EUR/USD"])).toBe(true);
    // Friday's last bar not yet sent, asked minutes after it: it may still come, so it is waited for
    let now = last + 20 * 60_000;
    const missing = new Feed(async () => spark(now / 1000, [(last - SLOT_MS) / 1000]), () => now);
    await missing.backfill();
    expect(missing.coversSince(last / SLOT_MS, ["EUR/USD"])).toBe(false);
    // still not sent when the market opens two days later: Yahoo never will, and waiting would never end
    now = opens;
    expect(missing.coversSince(last / SLOT_MS, ["EUR/USD"])).toBe(true);
  });

  it.each([
    ["2025-12-24T21:45:00Z", "2025-12-25T22:00:00Z"],
    ["2025-12-31T21:45:00Z", "2026-01-01T22:00:00Z"],
    ["2026-12-24T21:45:00Z", "2026-12-27T22:00:00Z"],
  ])("allows the holiday closure from %s to %s, and a bar that proves the feed traded is waited for only while recent", async (before, after) => {
    const last = Date.parse(before);
    const opens = Date.parse(after);
    const closed = new Feed(async () => spark(opens / 1000, [last / 1000]), () => opens);
    await closed.backfill();
    expect(closed.coversSince(last / SLOT_MS + 1, ["GBP/USD"])).toBe(true);
    const answer = spark(opens / 1000, [last / 1000, (last + SLOT_MS) / 1000]);
    const pound = answer.spark.result.find((row) => row.symbol === "GBPUSD=X")!;
    const prices: (number | null)[] = pound.response[0].indicators.quote[0].close;
    prices[1] = null;
    // asked minutes after the slot the euro traded in and the pound has not yet been sent: the pound is waited for
    let now = last + 2 * SLOT_MS + 5 * 60_000;
    const partial = new Feed(async () => answer, () => now);
    await partial.backfill();
    expect(partial.coversSince(last / SLOT_MS + 1, ["GBP/USD"])).toBe(false);
    // once the holiday is over, a bar never sent is not waited for
    now = opens;
    expect(partial.coversSince(last / SLOT_MS + 1, ["GBP/USD"])).toBe(true);
  });
});

const people: Who = {
  nameAt: (name) => ({ name, draw: null }), named: () => true, key: (who) => who,
  short: (who) => who, name: (who) => who, draw: () => null, face: () => "p0", faceAt: () => "p0",
};

// Yahoo leaves a few fifteen-minute bars out of most weeks, for one currency or another, and never sends them: a server
// that slept over one must not wait for it for ever, or Live would stand still for everyone after most restarts.
it("trades on after a sleep over a bar the source never sends", async () => {
  const start = Date.parse("2026-11-04T10:00:00Z");
  let now = start;
  const quotes = new Feed(async () => {
    const times: number[] = [];
    for (let t = start - 8 * SLOT_MS; t <= now; t += SLOT_MS) times.push(t / 1000);
    const hole = (start + 2 * SLOT_MS) / 1000;
    const answer = spark(now / 1000, times);
    const euro = answer.spark.result.find((row) => row.symbol === "EURUSD=X")!.response[0];
    const closes: (number | null)[] = euro.indicators.quote[0].close;
    closes[times.indexOf(hole)] = null;
    return answer;
  }, () => now);
  const news = new News(async () => "[]");
  news.banks = async () => [];
  const dir = mkdtempSync(join(tmpdir(), "losscut-never-sent-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
  await m.refresh(now);
  expect(m.act("trader", { kind: "buy", pair: "EUR/USD", leverage: 10, share: 0.25 }, now)).toBeNull();
  now += 6 * SLOT_MS;
  await m.refresh(now);
  now += 2 * 60 * 60_000;
  await m.refresh(now);
  expect(m.view("trader", {}).historyGap).toBe(false);
  expect(m.slot).toBe(Math.floor(now / SLOT_MS));
});

it("waits for an internal history gap and charges every recovered trading slot exactly once", async () => {
  const start = Date.parse("2026-11-04T10:00:00Z");
  let now = start;
  let recover = false;
  const quotes = new Feed(async () => {
    const times = now === start ? [start - SLOT_MS] : recover
      ? Array.from({ length: Math.floor((now - start) / SLOT_MS) }, (_, i) => start + (i + 1) * SLOT_MS)
      : [start + SLOT_MS];
    return spark(now / 1000, times.map((time) => time / 1000));
  }, () => now);
  const news = new News(async () => "[]");
  news.banks = async () => [];
  const dir = mkdtempSync(join(tmpdir(), "losscut-history-gap-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
  await m.refresh(now);
  expect(m.act("trader", { kind: "borrow" }, now)).toBeNull();
  now += 3 * SLOT_MS;
  await m.refresh(now);
  expect(m.slot).toBe(start / SLOT_MS);
  expect(m.view("trader", {}).historyGap).toBe(true);
  expect(m.accounts.get("trader")!.debt).toBe(STEP);
  expect(m.act("new", { kind: "buy", leverage: 10 }, now)).toMatch(/missing price history/);
  now += 60_000;
  await m.refresh(now);
  expect(m.accounts.get("trader")!.debt).toBe(STEP);
  recover = true;
  now += 61 * 60_000;
  await m.refresh(now);
  const slots = Math.floor((now - start) / SLOT_MS);
  expect(m.view("trader", {}).historyGap).toBe(false);
  expect(m.slot).toBe(Math.floor(now / SLOT_MS));
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96) ** slots, 8);
  await m.refresh(now);
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96) ** slots, 8);
});

it("does not advance one slot when an exposed currency has not supplied that slot yet", async () => {
  const start = Date.parse("2026-11-04T10:00:00Z");
  let now = start;
  let recover = false;
  const quotes = new Feed(async () => {
    const answer = spark(now / 1000, [start / 1000]);
    if (now > start && !recover) answer.spark.result.find((row) => row.symbol === "AUDUSD=X")!.response[0].meta.regularMarketTime = (start + SLOT_MS / 2) / 1000;
    return answer;
  }, () => now);
  const news = new News(async () => "[]");
  news.banks = async () => [];
  const dir = mkdtempSync(join(tmpdir(), "losscut-currency-gap-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
  await m.refresh(now);
  expect(m.act("trader", { kind: "borrow" }, now)).toBeNull();
  now += SLOT_MS;
  await m.refresh(now);
  expect(m.slot).toBe(start / SLOT_MS);
  expect(m.accounts.get("trader")!.debt).toBe(STEP);
  recover = true;
  await m.refresh(now);
  expect(m.slot).toBe(now / SLOT_MS);
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96), 8);
});

it("waits for missing history, then settles a missed bankruptcy before a new trade can open", async () => {
  const friday = Date.parse("2026-11-06T10:00:00Z");
  const monday = Date.parse("2026-11-09T10:00:00Z");
  let now = friday;
  let recover = false;
  const quotes = new Feed(async (url) => {
    // Recovery supplies every trading slot, omitting only the Friday 17:00–Sunday 17:00 New York closure.
    const recovered = Array.from({ length: Math.floor((now - friday) / SLOT_MS) + 1 }, (_, i) => friday + i * SLOT_MS)
      .filter((time) => time < Date.parse("2026-11-06T22:00:00Z") || time >= Date.parse("2026-11-08T22:00:00Z"));
    const times = now === friday ? [friday - SLOT_MS]
      : recover && url.includes("range=1mo") ? recovered
      : [monday - SLOT_MS];
    // the Australian dollar halves in the slot after Friday's close: a bankruptcy the server slept through
    return spark(now / 1000, times.map((t) => t / 1000), (symbol, p, t) => (symbol === "AUDUSD=X" && t * 1000 === friday + SLOT_MS ? p / 2 : p));
  }, () => now);
  let releaseNews!: () => void;
  const news = new News(async () => "");
  news.banks = () => new Promise((resolve) => { releaseNews = () => resolve([]); });
  const dir = mkdtempSync(join(tmpdir(), "losscut-live-test-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => {
    m.save();
    rmSync(dir, { recursive: true, force: true });
  });
  const first = m.refresh(now);
  await expect.poll(() => m.slot).toBe(friday / SLOT_MS);
  expect(m.view("spectator", {}).you.equity).toBe(START);
  expect(m.accounts.has("spectator")).toBe(false);
  expect(m.act("trader", { kind: "buy", leverage: 100 }, now)).toBeNull();
  releaseNews();
  await first;
  news.banks = async () => [];
  now = monday;
  await m.refresh(now);
  expect(m.slot).toBe(friday / SLOT_MS);
  expect(m.act("new", { kind: "buy", leverage: 100 }, now)).toMatch(/missing price history/);
  recover = true;
  now += 61 * 60_000;
  await m.refresh(now);
  expect(m.runs[0].ended).toBe(friday + SLOT_MS);
  expect(m.waits.get("trader")).toBe(nextSydneyMidnight(friday + SLOT_MS));
  expect(m.act("trader", { kind: "buy", leverage: 100 }, now)).toBeNull();
  expect(m.accounts.get("trader")?.trades).toEqual([]);
});

it("trades again after a sleep longer than the source's month of history, rather than pausing for ever", async () => {
  const before = Date.parse("2026-09-01T10:00:00Z");
  const after = Date.parse("2026-11-09T10:00:00Z");
  let now = before;
  const quotes = new Feed(async () => {
    return spark(now / 1000, [(now - SLOT_MS) / 1000]);
  }, () => now);
  const news = new News(async () => "");
  news.banks = async () => [];
  const dir = mkdtempSync(join(tmpdir(), "losscut-live-test-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  await m.refresh(now);
  expect(m.act("sleeper", { kind: "buy", leverage: 10, share: 0.25 }, now)).toBeNull();
  now = after;
  await m.refresh(now);
  expect(m.act("sleeper", { kind: "close" }, now), "two months on, the missing history cannot come, so trading resumes").toBeNull();
});

describe("the news", () => {
  it("keeps a bank's rate decisions with a link to its own site, and the week's high-impact releases for our currencies", () => {
    const xml = `<rss><item><title>Statement by the Monetary Policy Board: Monetary Policy Decision</title><link>https://www.rba.gov.au/media-releases/2026/mr-26-30.html</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item><item><title>Speech at a dinner</title><link>https://www.rba.gov.au/speeches/x.html</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item><item><title>Monetary policy, from elsewhere</title><link>https://example.com/x</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item></rss>`;
    const items = parseFeed(xml, { cur: "AUD", source: "Reserve Bank of Australia", url: "", keep: /monetary policy/i });
    expect(items.map((i) => i.title)).toEqual(["Statement by the Monetary Policy Board: Monetary Policy Decision"]);
    const cal = parseCalendar(JSON.stringify([{ title: "Cash Rate", country: "AUD", date: "2026-11-03T14:30:00+11:00", impact: "High", forecast: "4.85%", previous: "4.60%" }, { title: "Housing", country: "AUD", date: "2026-11-03T11:30:00+11:00", impact: "Low" }, { title: "Jobs", country: "CAD", date: "2026-11-06T08:30:00-05:00", impact: "High" }]));
    expect(cal).toEqual([{ cur: "AUD", title: "Cash Rate", at: Date.parse("2026-11-03T14:30:00+11:00"), forecast: "4.85%", previous: "4.60%", actual: "" }]);
  });
});

// The server's Live, on a fake price source the check controls: an account opens at A$10,000, trades any pair at
// the server's price, keeps several pairs, survives a restart, and refuses orders when the price is stale.
import { createServer } from "node:http";
import { afterEach } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

let s: Server | null = null;
let feed: ReturnType<typeof createServer> | null = null;
afterEach(async () => {
  await s?.stop();
  s = null;
  feed?.close();
  feed = null;
});

it("runs a Live account on the server across pairs and a restart, and shuts with a stale price", async () => {
  let stale = false;
  feed = createServer((_req, res) => {
    const t = Math.floor(Date.now() / 1000) - (stale ? 3600 : 0);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(spark(t, [t - 1800, t - 900], (_s, p, at) => (at === t - 900 ? p : p * 1.001))));
  }).listen(8195);
  s = await server(8194, { LIVE_FEED: "http://localhost:8195", LIVE_NEWS: "off", LIVE_POLL_MS: "200" });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me, "live");
  type M = { phase: string; live: boolean; pair: string; prices: number[]; you: { equity: number; positions: { pair: string; side: number; leverage: number }[]; out: boolean } };
  const look = async () => (await (await fetch(`${s!.base}/api/state?mode=live`, { headers: { cookie: me } })).json()) as M;
  try {
    for (let i = 0; i < 50 && !(await look()).live; i++) await new Promise((r) => setTimeout(r, 100));
    const first = await look();
    expect(first).toMatchObject({ phase: "trade", live: true, pair: "AUD/USD" });
    expect(first.you.equity).toBe(10_000);
    expect(first.prices.at(-1)).toBeCloseTo(0.7, 6);
    const go = (body: Record<string, unknown>) => c.act(me, { mode: "live", ...body });
    const bought = await go({ kind: "buy", pair: "AUD/JPY", leverage: 30, share: 0.25 });
    expect(bought.status, await bought.clone().text()).toBe(200);
    expect((await go({ kind: "sell", pair: "EUR/USD", leverage: 10, share: 0.25 })).status).toBe(200);
    // the page sends no price: a price in the order changes nothing
    expect((await go({ kind: "buy", pair: "NOT/APAIR", leverage: 30, price: 1 })).status).toBe(200);
    expect((await go({ kind: "pair", pair: "XXX/YYY" })).status).toBe(409);
    const two = await look();
    // the order with a pair the server does not offer went to the chart's pair, AUD/USD, at the server's own price
    expect(two.you.positions.map((p) => p.pair).sort()).toEqual(["AUD/JPY", "AUD/USD", "EUR/USD"]);
    expect(two.you.positions.find((p) => p.pair === "AUD/JPY")).toMatchObject({ side: 1, leverage: 30 });
    expect(two.you.positions.find((p) => p.pair === "EUR/USD")).toMatchObject({ side: -1, leverage: 10 });
    // a deploy stops the server with SIGTERM, which saves the accounts; they are there when it starts again
    tab.close();
    const gone = new Promise((r) => s!.proc.once("exit", r));
    s.proc.kill("SIGTERM");
    await gone;
    await s.restart();
    const tab1 = await c.page(me, "live");
    for (let i = 0; i < 50 && !(await look()).live; i++) await new Promise((r) => setTimeout(r, 100));
    const back = await look();
    tab1.close();
    expect(back.you.positions.map((p) => p.pair)).toEqual(expect.arrayContaining(["AUD/JPY", "EUR/USD"]));
    // an hour without a price is a shut market: orders wait
    stale = true;
    const tab2 = await c.page(me, "live");
    for (let i = 0; i < 50 && (await look()).live; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await look()).phase).toBe("shut");
    const refused = await go({ kind: "close", pair: "AUD/JPY" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/market is closed/);
    tab2.close();
  } finally {
    tab.close();
  }
}, 30_000);
