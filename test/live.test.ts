// ADR 0087: Live, on real prices. The book's arithmetic with fixed rates (a position's result in dollars, the
// account-wide margin level and stop-out, bankruptcy), the feed's crosses from a recorded answer, and the news filter,
// without the network: the sources are replaced by fixed text.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { bankrupt, borrow, charge, close, enforce, equity, fresh, level, lines, marginLines, nextSydneyMidnight, order, pnlOf, worth } from "../src/book.ts";
import { START, STEP } from "../src/fx.ts";
import { cross, Feed, SLOT_MS, type Usd } from "../src/feed.ts";
import { News, parseFeed } from "../src/news.ts";
import { Live, type Who } from "../src/live.ts";
import { spark } from "./yahoo-fake.ts";

const usd = (over: Partial<Usd> = {}): Usd => ({ EUR: 1.12, GBP: 1.35, AUD: 0.7, USD: 1, CHF: 1 / 0.82, CNY: 1 / 6.67, JPY: 1 / 158, ...over });

describe("the Live book", () => {
  // ADR 0095: the house traders in Live, each on a real pair of its own, trading at the price it is given and told in
  // the feed by pair, never touching a player's account.
  // ADR 0097: the house traders are real Live players. Each trades its favourite pair through Live's own action, on its
  // own account, and one waiting out a bankruptcy does nothing until its account opens again.
  it("lets the house traders trade Live through its own action, each on its pair and its own account", async () => {
    const { LiveBots, PAIRS } = await import("../src/live-bots.ts");
    let seed = 1;
    const bots = new LiveBots(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    const accounts = new Map<string, ReturnType<typeof fresh>>();
    const sent: { bot: string; input: Record<string, unknown> }[] = [];
    const waiting = "bot:nana";
    const live = {
      account: (bot: string) => (bot === waiting ? null : (accounts.get(bot) ?? accounts.set(bot, fresh(0, 0)).get(bot)!)),
      act: (bot: string, input: Record<string, unknown>) => (sent.push({ bot, input }), null),
    };
    // a market that falls then rises, so the dip-buyers and trend-chasers both have something to do
    for (let i = 0; i < 200; i++) bots.step(usd({ AUD: 0.7 * (1 + 0.004 * Math.sin(i / 9)), JPY: 1 / (158 * (1 + 0.003 * Math.cos(i / 7))) }), live);
    const orders = sent.filter((x) => x.input.kind === "buy" || x.input.kind === "sell");
    expect(orders.length, "the bots trade").toBeGreaterThan(3);
    for (const x of sent) {
      expect(x.input.mode, "through Live's own action").toBe("live");
      expect(x.input.pair, `${x.bot} on its own pair`).toBe(PAIRS[x.bot]);
    }
    expect(new Set(orders.map((x) => x.bot)).size, "more than one of them").toBeGreaterThan(1);
    expect(sent.some((x) => x.bot === waiting), "a bot waiting out a bankruptcy does nothing").toBe(false);
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

  // Live's pending orders, one per pair as Live has one position per pair: a level the player typed, only a trigger,
  // filled at the live price on the poll that reaches it, a gap filling at the gapped price as a broker's would.
  it("fills a pending order at the live price once it reaches the level, one per pair", async () => {
    const { setPending, cancelPending, triggerPending } = await import("../src/book.ts");
    const a = fresh(0, 0);
    // AUD/USD is 0.70: a buy below the price waits as a limit
    expect(setPending(a, "AUD/USD", usd(), { side: 1, at: 0.69, leverage: 10, share: 0.25 })).toBeNull();
    expect(a.pending!["AUD/USD"].type).toBe("buy-limit");
    expect(triggerPending(a, usd(), 0), "not reached").toEqual([]);
    // the price gaps through the level to 0.685: it fills at that price, not the typed 0.69
    const fills = triggerPending(a, usd({ AUD: 0.685 }), 0);
    expect(fills.map((f) => f.kind)).toEqual(["open"]);
    expect(a.positions["AUD/USD"].entry).toBeCloseTo(0.685, 2);
    expect(a.pending?.["AUD/USD"], "a filled order is gone").toBeUndefined();
    // one per pair: a second on the same pair replaces the first
    expect(setPending(a, "EUR/USD", usd(), { side: -1, at: 1.13, leverage: 3, share: 0.25 })).toBeNull();
    expect(setPending(a, "EUR/USD", usd(), { side: -1, at: 1.14, leverage: 3, share: 0.25 })).toBeNull();
    expect(a.pending!["EUR/USD"].at).toBe(1.14);
    expect(cancelPending(a, "EUR/USD")).toBeNull();
    expect(cancelPending(a, "EUR/USD")).toMatch(/no pending order/i);
    // the rounds' refusals
    expect(setPending(a, "AUD/USD", usd(), { side: 1, at: 0, leverage: 10, share: 0.25 })).toMatch(/Type the price/);
    expect(setPending(a, "AUD/USD", usd(), { side: 1, at: 2, leverage: 10, share: 0.25 })).toMatch(/within 50%/);
    expect(setPending(a, "AUD/USD", usd(), { side: 1, at: 0.7, leverage: 10, share: 0.25 })).toMatch(/price now/);
    expect(setPending(a, "AUD/USD", usd(), { side: 1, at: 0.69, leverage: 7, share: 0.25 })).toMatch(/leverage/);
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
    // a trade is closed as the game closes one, which is what counts it; the account then holds A$250 more
    expect(typeof order(a, "AUD/USD", usd(), 1, 10, 0.5, {}, evening + 30_000)).not.toBe("string");
    const gain = { ...usd(), AUD: usd().AUD * 1.01 };
    const closed = close(a, "AUD/USD", gain, evening + 60_000);
    expect(typeof closed).not.toBe("string");
    const change = Math.round(worth(a, gain)) - START;
    expect(change, "the close made money").toBeGreaterThan(0);
    expect(rollDay(a, gain, morning)).toBe(true);
    expect(a.yesterday).toEqual({ day: "2026-11-08", change, trades: 1 });
    expect(a).toMatchObject({ day: "2026-11-09", dayWorth: START + change });
  });

  // The history keeps the last fifty trades, so a day's count taken from it stops at fifty: a day with sixty closes read
  // fifty. The count is kept as trades close, and the history is only what is shown.
  it("counts every trade closed in a Sydney day, even past the fifty the history keeps", async () => {
    const { rollDay } = await import("../src/book.ts");
    const evening = Date.UTC(2026, 10, 8, 12);
    const morning = Date.UTC(2026, 10, 8, 14);
    const a = fresh(evening, 0);
    rollDay(a, usd(), evening);
    for (let i = 0; i < 60; i++) {
      const bought = order(a, "AUD/USD", usd(), 1, 1, 0.01, {}, evening + i * 1000);
      expect(typeof bought).not.toBe("string");
      close(a, "AUD/USD", usd(), evening + i * 1000 + 500);
    }
    expect(a.trades.length, "the history keeps fifty").toBe(50);
    rollDay(a, usd(), morning);
    expect(a.yesterday?.trades, "the day had sixty closes").toBe(60);
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
    // Live trades 24/5: in the FX week a currency quiet for an hour, as Europe is before it opens on a Sunday evening,
    // still trades on its last price, so one pair is never shut while the rest trade
    answer.spark.result[1].response[0].meta.regularMarketTime -= 3600;
    await quotes.poll();
    expect(quotes.live(["EUR/USD"])).toBe(true);
    expect(quotes.live(["GBP/USD"]), "an hour's quiet mid-week still trades").toBe(true);
    // but a price stale for over two hours is a feed outage, never a frozen price to trade against
    now += 2 * 3_600_000;
    expect(quotes.live(["GBP/USD"]), "two hours stale is an outage").toBe(false);
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
    // a hole in the pound is carried from the price before it, not waited for (ADR 0097)
    expect(quotes.coversSince(start * 1000 / SLOT_MS + 1, ["GBP/USD"])).toBe(true);
    expect(quotes.quality(start * 1000 / SLOT_MS + 1, ["GBP/USD"])).toBe("carried");
  });

  it.each([
    ["2026-07-03T20:45:00Z", "2026-07-05T21:00:00Z"],
    ["2026-11-06T21:45:00Z", "2026-11-08T22:00:00Z"],
    ["2026-10-30T20:45:00Z", "2026-11-01T22:00:00Z"],
  ])("allows the weekly closure from %s to %s, and carries a last trading slot that never came", async (friday, sunday) => {
    const last = Date.parse(friday);
    const opens = Date.parse(sunday);
    const complete = new Feed(async () => spark(opens / 1000, [last / 1000]), () => opens);
    await complete.backfill();
    expect(complete.coversSince(last / SLOT_MS + 1, ["EUR/USD"])).toBe(true);
    // Friday's last bar not yet sent, asked minutes after it: it is carried at once and not waited for
    let now = last + 20 * 60_000;
    const missing = new Feed(async () => spark(now / 1000, [(last - SLOT_MS) / 1000]), () => now);
    await missing.backfill();
    expect(missing.coversSince(last / SLOT_MS, ["EUR/USD"])).toBe(true);
    // and the same when the market opens two days later
    now = opens;
    expect(missing.coversSince(last / SLOT_MS, ["EUR/USD"])).toBe(true);
  });

  it.each([
    ["2025-12-24T21:45:00Z", "2025-12-25T22:00:00Z"],
    ["2025-12-31T21:45:00Z", "2026-01-01T22:00:00Z"],
    ["2026-12-24T21:45:00Z", "2026-12-27T22:00:00Z"],
  ])("allows the holiday closure from %s to %s, and carries a bar that proves the feed traded but never came", async (before, after) => {
    const last = Date.parse(before);
    const opens = Date.parse(after);
    const closed = new Feed(async () => spark(opens / 1000, [last / 1000]), () => opens);
    await closed.backfill();
    expect(closed.coversSince(last / SLOT_MS + 1, ["GBP/USD"])).toBe(true);
    const answer = spark(opens / 1000, [last / 1000, (last + SLOT_MS) / 1000]);
    const pound = answer.spark.result.find((row) => row.symbol === "GBPUSD=X")!;
    const prices: (number | null)[] = pound.response[0].indicators.quote[0].close;
    prices[1] = null;
    // asked minutes after the slot the euro traded in and the pound has not been sent: the pound is carried, not waited for
    let now = last + 2 * SLOT_MS + 5 * 60_000;
    const partial = new Feed(async () => answer, () => now);
    await partial.backfill();
    expect(partial.coversSince(last / SLOT_MS + 1, ["GBP/USD"])).toBe(true);
    // and the same once the holiday is over
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

// The operator removes a Live player by the name the board shows, even one Live never named itself (a player who
// traded once and never looked in again), whose board name is the app's name for them.
it("removes a Live account by the name the board shows, though Live never saved one", async () => {
  const news = new News(async () => "[]");
  news.banks = async () => [];
  const quotes = new Feed(async () => spark(Date.now() / 1000, [Date.now() / 1000 - 900]), () => Date.now());
  const dir = mkdtempSync(join(tmpdir(), "losscut-remove-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  // an account Live holds no name for: the board shows people.nameAt(key), which here is the key itself
  m.accounts.set("Lv2459", fresh(0, 0));
  expect(m.remove({ name: "Lv2459" })).toBe(true);
  expect(m.accounts.has("Lv2459")).toBe(false);
  expect(m.remove({ name: "Lv2459" })).toBe(false);
});

// An AI agent's row keeps its badge through a restart: Live saves which players are agents, beside their accounts.
it("keeps an AI agent marked on the board through a restart", async () => {
  const news = new News(async () => "[]");
  news.banks = async () => [];
  const make = () => new Live(dir, people, { quotes: new Feed(async () => spark(Date.now() / 1000, [Date.now() / 1000 - 900]), () => Date.now()), news, watching: () => 0, onChange: () => {}, log: () => {} });
  const dir = mkdtempSync(join(tmpdir(), "losscut-agent-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  const first = make();
  first.accounts.set("agent-key", fresh(0, 0));
  first.agents.add("agent-key");
  first.save(true);
  first.dispose();
  const again = make();
  expect(again.agents.has("agent-key")).toBe(true);
  again.dispose();
});

// The feed reads newest first, as the page lists it and as the rounds' feed does: a story told later sits above one told
// earlier, and the cap drops the oldest. Stories older than a day are never told, so a restart does not bring back what
// is no longer news.
describe("Live's feed", () => {
  const hour = 3_600_000;
  const stories = (at: number) => [
    { id: "a", source: "Investing.com", title: "Dollar steadies after jobs report", at: at - 40 * hour, link: "https://www.investing.com/a", score: 8 },
    { id: "b", source: "Investing.com", title: "Sterling today: pound firms", at: at - 20 * hour, link: "https://www.investing.com/b", score: 5 },
    { id: "c", source: "Investing.com", title: "Euro yields linger at one-month lows", at: at - 2 * hour, link: "https://www.investing.com/c", score: 10 },
  ];
  const market = async (at: number) => {
    const now = at;
    const quotes = new Feed(async () => spark(now / 1000, [now / 1000]), () => now);
    const news = new News(async () => "[]");
    news.banks = async () => [];
    news.markets = async () => stories(now);
    const dir = mkdtempSync(join(tmpdir(), "losscut-feed-order-"));
    const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
    onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
    await m.refresh(now);
    return m;
  };

  it("lists the newest line first", async () => {
    const m = await market(Date.parse("2026-11-10T10:00:00Z"));
    const lines = m.view("reader", {}).feed.filter((f) => f.kind === "news").map((f) => (f.args as Record<string, unknown>).title);
    expect(lines[0], "the story told last is on top").toBe("Euro yields linger at one-month lows");
  });

  // A central bank's own words and the outlets' stories are two sources told in one pass; the list is by when each
  // was published, so a bank's statement sits among the stories by its time and not below all of them.
  it("orders a bank's statement among the stories by when it was published", async () => {
    const at = Date.parse("2026-11-10T10:00:00Z");
    const quotes = new Feed(async () => spark(at / 1000, [at / 1000]), () => at);
    const news = new News(async () => "[]");
    news.banks = async () => [{ id: "boj", cur: "JPY", source: "Bank of Japan", title: "Summary of Opinions", at: at - 11 * hour, link: "https://www.boj.or.jp/x" }];
    news.markets = async () => stories(at);
    const dir = mkdtempSync(join(tmpdir(), "losscut-feed-merge-"));
    const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
    onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
    await m.refresh(at);
    const told = m.view("reader", {}).feed.filter((f) => f.kind === "news").map((f) => Number((f.args as Record<string, unknown>).at));
    expect(told.length, "the bank and the two stories under a day old").toBe(3);
    expect(told, "newest first").toEqual([...told].sort((a, b) => b - a));
  });

  // Live shows no release calendar, so it asks for none: the one source nothing read was an hourly download.
  it("asks for no release calendar", async () => {
    const at = Date.parse("2026-11-10T10:00:00Z");
    const asked: string[] = [];
    const quotes = new Feed(async () => spark(at / 1000, [at / 1000]), () => at);
    const news = new News(async (url) => { asked.push(url); return "[]"; });
    const dir = mkdtempSync(join(tmpdir(), "losscut-no-calendar-"));
    const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
    onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
    await m.refresh(at);
    expect(asked.filter((u) => /faireconomy|ff_calendar|calendar/i.test(u)), "no calendar is fetched").toEqual([]);
    expect(asked.length, "the banks' and the outlets' feeds are still read").toBeGreaterThan(0);
  });

  // A house trader's lines name it by its own id, so a page can show it in its own language; a person's carry the short
  // code as ever. A cut of the id to six letters named nobody the page knew, and the English name was shown instead.
  it("names a house trader in its feed lines by its id, and a person by the short code", async () => {
    const at = Date.parse("2026-11-10T10:00:00Z");
    const quotes = new Feed(async () => spark(at / 1000, [at / 1000]), () => at);
    const news = new News(async () => "[]");
    news.banks = async () => [];
    const dir = mkdtempSync(join(tmpdir(), "losscut-bot-name-"));
    const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
    onTestFinished(() => { m.save(); rmSync(dir, { recursive: true, force: true }); });
    await m.refresh(at);
    const who = (k: string): unknown => {
      m.accounts.set(k, { ...fresh(at, 0), called: false });
      (m as unknown as { report(k: string, f: unknown[]): void }).report(k, [{ kind: "call", pair: "", price: 0, pnl: 0 }]);
      return (m.view("reader", {}).feed[0].args as Record<string, unknown>).who;
    };
    expect(who("bot:kurumi"), "a house trader goes by its id").toBe("bot:kurumi");
    expect(who("abcdef0123456789"), "a person goes by the short code").toBe("abcdef");
  });

  it("tells no story older than a day", async () => {
    const m = await market(Date.parse("2026-11-10T10:00:00Z"));
    const titles = m.view("reader", {}).feed.filter((f) => f.kind === "news").map((f) => (f.args as Record<string, unknown>).title);
    expect(titles).not.toContain("Dollar steadies after jobs report");
    expect(titles).toContain("Sterling today: pound firms");
  });

  it("keeps the newest sixty lines and drops the oldest", async () => {
    const m = await market(Date.parse("2026-11-10T10:00:00Z"));
    for (let i = 0; i < 70; i++) m.say(`line ${i}`, "info", "x");
    const lines = m.view("reader", {}).feed;
    expect(lines).toHaveLength(60);
    expect(lines[0].text, "the last said is first").toBe("line 69");
    expect(lines.at(-1)!.text, "the oldest kept is the sixty-first from the end").toBe("line 10");
  });
});

it("carries a skipped slot instead of waiting, and charges every slot exactly once", async () => {
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
  // nothing waits: the skipped slots are carried from the price before them, so Live has moved on and nobody is held
  const slots = Math.floor((now - start) / SLOT_MS);
  expect(m.view("trader", {}).historyGap).toBe(false);
  expect(m.slot).toBe(Math.floor(now / SLOT_MS));
  expect(m.act("new", { kind: "buy", leverage: 10 }, now), "a newcomer trades").toBeNull();
  expect(m.act("trader", { kind: "close" }, now), "and so does the one with credit").not.toMatch(/missing price history/);
  // every slot, carried or sent, charged once: the interest on the debt compounds exactly one slot at a time
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96) ** slots, 8);
  // the late bars arriving afterwards charge nothing more
  recover = true;
  now += 60_000;
  await m.refresh(now);
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96) ** slots, 8);
  await m.refresh(now);
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96) ** slots, 8);
});

it("advances a slot whose newest quote is stale and charges it once, not again when the quote refreshes", async () => {
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
  // nothing waits for the Australian dollar's quote: the slot is settled, and charged once
  expect(m.slot).toBe(now / SLOT_MS);
  expect(m.accounts.get("trader")!.debt).toBeCloseTo(STEP * (1 + 0.005 / 96), 8);
  recover = true;
  await m.refresh(now);
  expect(m.slot).toBe(now / SLOT_MS);
  expect(m.accounts.get("trader")!.debt, "the refreshed quote charges nothing more").toBeCloseTo(STEP * (1 + 0.005 / 96), 8);
});

// The cost of never waiting, accepted for a play-money game (ADR 0097): a crash in a slot the source skipped is carried
// at the price before it, so an account that the market wiped out in that slot is not stopped out at that slot. It is
// stopped out when a real price shows the loss, and trading is never held in the meantime.
it("carries a slot the server slept through, and stops the account out on the first real price that shows the loss", async () => {
  const friday = Date.parse("2026-11-06T10:00:00Z");
  const monday = Date.parse("2026-11-09T10:00:00Z");
  let now = friday;
  const quotes = new Feed(async () => {
    const times = now === friday ? [friday - SLOT_MS] : [monday - SLOT_MS];
    // the Australian dollar halves after Friday's close and stays there: Monday's real price shows the loss
    return spark(now / 1000, times.map((t) => t / 1000), (symbol, p, t) => (symbol === "AUDUSD=X" && t * 1000 >= friday + SLOT_MS ? p / 2 : p));
  }, () => now);
  const news = new News(async () => "");
  news.banks = async () => [];
  const dir = mkdtempSync(join(tmpdir(), "losscut-live-test-"));
  const m = new Live(dir, people, { quotes, news, watching: () => 0, onChange: () => {}, log: () => {} });
  onTestFinished(() => {
    m.save();
    rmSync(dir, { recursive: true, force: true });
  });
  await m.refresh(now);
  expect(m.view("spectator", {}).you.equity).toBe(START);
  expect(m.accounts.has("spectator")).toBe(false);
  expect(m.act("trader", { kind: "buy", leverage: 100 }, now)).toBeNull();
  now = monday;
  await m.refresh(now);
  expect(m.slot, "Live has moved on over the weekend and the slots it missed").toBe(Math.floor(monday / SLOT_MS));
  expect(m.view("trader", {}).historyGap, "nobody is held").toBe(false);
  // Monday's real price is half of Friday's, so the 100x position is stopped out on it, and the account is settled once
  expect(m.runs.length, "settled once, not twice").toBe(1);
  expect(m.waits.get("trader")).toBe(nextSydneyMidnight(m.runs[0].ended));
  expect(m.act("trader", { kind: "buy", leverage: 100 }, now), "and a new account waits for Sydney midnight").toMatch(/./);
  await m.refresh(now);
  expect(m.runs.length, "a second refresh settles nothing more").toBe(1);
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
  it("keeps a bank's rate decisions with a link to its own site", () => {
    const xml = `<rss><item><title>Statement by the Monetary Policy Board: Monetary Policy Decision</title><link>https://www.rba.gov.au/media-releases/2026/mr-26-30.html</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item><item><title>Speech at a dinner</title><link>https://www.rba.gov.au/speeches/x.html</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item><item><title>Monetary policy, from elsewhere</title><link>https://example.com/x</link><pubDate>Tue, 03 Nov 2026 03:30:00 GMT</pubDate></item></rss>`;
    const items = parseFeed(xml, { cur: "AUD", source: "Reserve Bank of Australia", url: "", keep: /monetary policy/i });
    expect(items.map((i) => i.title)).toEqual(["Statement by the Monetary Policy Board: Monetary Policy Decision"]);
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
    const t = Math.floor(Date.now() / 1000) - (stale ? 3 * 3600 : 0);
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
    // a price stale past the outage limit, three hours, is a shut market at any hour of the week: orders wait
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

// A margin line is the price at which the whole account's level falls to the target, so at that price the level is the
// target, however the line was found. Positions that share a currency are solved once and reused, so they are asked
// through one closure as the server does, in any order, and each answer must still be its own pair's.
it("puts every position's margin and stop-out lines where the account's level reaches them, whichever pair is asked first", () => {
  const quotes = usd();
  const account = fresh(0, 0);
  const held: [string, 1 | -1, number][] = [["AUD/USD", 1, 30], ["AUD/JPY", -1, 100], ["EUR/AUD", 1, 10], ["USD/CHF", -1, 30], ["GBP/AUD", -1, 10], ["EUR/GBP", 1, 3]];
  for (const [pair, side, leverage] of held) expect(order(account, pair, quotes, side, leverage, 0.08, {}, 0), pair).toEqual(expect.any(Array));
  const asked = [...held].reverse().concat(held).map(([pair]) => pair);
  const risk = marginLines(account, quotes);
  const seen = new Map<string, string>();
  let located = 0;
  for (const pair of asked) {
    const line = risk(pair);
    expect(line, pair).not.toBeNull();
    // the same pair asked again, in another place in the order, gives the same answer
    const text = JSON.stringify(line);
    expect(seen.get(pair) ?? text, `${pair} asked again`).toBe(text);
    seen.set(pair, text);
    for (const [target, price] of [[0.5, line!.call], [0.2, line!.cut]] as const) {
      if (price === null) continue;
      // the pair's price moved to the line, as the line is defined: its base's dollar rate by the ratio, or its quote's by the inverse
      const [base, quote] = pair.split("/") as [keyof Usd, keyof Usd];
      const ratio = price / (quotes[base] / quotes[quote]);
      const moved = base !== "USD" ? { ...quotes, [base]: quotes[base] * ratio } : { ...quotes, [quote]: quotes[quote] / ratio };
      expect(level(account, moved), `${pair} level at its line for ${target}`).toBeCloseTo(target, 6);
      located++;
    }
  }
  expect(located, "lines were found and checked").toBeGreaterThan(6);
});

// The margin lines are priced by arithmetic written out in the loop, because going through cross() and convert() for
// every step of every search cost seven times as much. The two must stay the same number: a level worked out by the
// margin code at a rate equals the level worked out by level(), which prices through cross() and convert().
it("prices a position in the margin lines as level() does, through cross() and convert()", () => {
  const quotes = usd({ AUD: 0.66, JPY: 1 / 151, EUR: 1.09 });
  const account = fresh(0, 0);
  for (const [pair, side, leverage] of [["AUD/JPY", 1, 30], ["EUR/USD", -1, 10], ["CHF/JPY", 1, 100]] as const) order(account, pair, quotes, side, leverage, 0.1, {}, 0);
  const line = marginLines(account, quotes)("AUD/JPY")!;
  expect(Number.isFinite(line.cut) && Number.isFinite(line.call), "a line exists for this account").toBe(true);
  const [b, q] = ["AUD", "JPY"] as const;
  const ratio = line.cut / (quotes[b] / quotes[q]);
  expect(level(account, { ...quotes, [b]: quotes[b] * ratio })).toBeCloseTo(0.2, 6);
});

it("locates the stop-out in the direction the whole account loses", () => {
  const quotes = usd();
  const account = fresh(0, 0);
  expect(order(account, "AUD/USD", quotes, 1, 1, 0.1, {}, 0)).toEqual(expect.any(Array));
  expect(order(account, "AUD/JPY", quotes, -1, 100, 0.5, {}, 0)).toEqual(expect.any(Array));
  const cut = lines(account, "AUD/USD", quotes)?.cut;
  expect(cut).toBeGreaterThan(quotes.AUD);
  expect(cut).toBeLessThan(quotes.AUD + 0.02);
  expect(level(account, { ...quotes, AUD: cut! })).toBeCloseTo(0.2, 8);
});
