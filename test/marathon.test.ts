// ADR 0087: Marathon, on real prices. The book's arithmetic with fixed rates (a position's result in dollars, the
// account-wide margin level and stop-out, bankruptcy), the feed's crosses from a recorded answer, and the news filter,
// without the network: the sources are replaced by fixed text.
import { describe, expect, it } from "vitest";
import { bankrupt, borrow, charge, close, enforce, equity, fresh, level, lines, nextSydneyMidnight, order, pnlOf, worth } from "../src/book.ts";
import { START, STEP } from "../src/fx.ts";
import { cross, Live, type Usd } from "../src/live.ts";
import { parseCalendar, parseFeed } from "../src/news.ts";

const usd = (over: Partial<Usd> = {}): Usd => ({ EUR: 1.12, GBP: 1.35, AUD: 0.7, USD: 1, CHF: 1 / 0.82, CNY: 1 / 6.67, JPY: 1 / 158, ...over });

describe("the Marathon book", () => {
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
    const row = (symbol: string, p: number) => ({ symbol, response: [{ meta: { regularMarketPrice: p, regularMarketTime: t + 300 }, timestamp: [t - 900, t], indicators: { quote: [{ close: [p * 0.999, p] }] } }] });
    const answer = { spark: { result: [row("EURUSD=X", 1.12), row("GBPUSD=X", 1.35), row("AUDUSD=X", 0.7), row("CHF=X", 0.82), row("CNH=X", 6.67), row("JPY=X", 158)] } };
    let now = (t + 400) * 1000;
    const live = new Live(async () => answer, () => now);
    await live.backfill();
    const last = live.latest()!;
    expect(cross(last, "AUD/JPY")).toBeCloseTo(0.7 * 158, 6);
    expect(cross(last, "EUR/GBP")).toBeCloseTo(1.12 / 1.35, 6);
    expect(cross(last, "CNY/JPY")).toBeCloseTo(158 / 6.67, 6);
    expect(cross(last, "EUR/AUD") * cross(last, "AUD/JPY")).toBeCloseTo(cross(last, "EUR/JPY"), 6);
    expect(live.live()).toBe(true);
    now += 11 * 60_000;
    expect(live.live(), "no price for over ten minutes is a shut market").toBe(false);
  });
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

// The server's Marathon, on a fake price source the check controls: an account opens at A$10,000, trades any pair at
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

it("runs a Marathon account on the server across pairs and a restart, and shuts with a stale price", async () => {
  let stale = false;
  feed = createServer((_req, res) => {
    const t = Math.floor(Date.now() / 1000) - (stale ? 3600 : 0);
    const row = (symbol: string, p: number) => ({ symbol, response: [{ meta: { regularMarketPrice: p, regularMarketTime: t }, timestamp: [t - 1800, t - 900], indicators: { quote: [{ close: [p * 1.001, p] }] } }] });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ spark: { result: [row("EURUSD=X", 1.12), row("GBPUSD=X", 1.35), row("AUDUSD=X", 0.7), row("CHF=X", 0.82), row("CNH=X", 6.67), row("JPY=X", 158)] } }));
  }).listen(8195);
  s = await server(8194, { MARATHON_FEED: "http://localhost:8195", MARATHON_NEWS: "off", MARATHON_POLL_MS: "200" });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me, "marathon");
  type M = { phase: string; live: boolean; pair: string; prices: number[]; you: { equity: number; positions: { pair: string; side: number; leverage: number }[]; out: boolean } };
  const look = async () => (await (await fetch(`${s!.base}/api/state?mode=marathon`, { headers: { cookie: me } })).json()) as M;
  try {
    for (let i = 0; i < 50 && !(await look()).live; i++) await new Promise((r) => setTimeout(r, 100));
    const first = await look();
    expect(first).toMatchObject({ phase: "trade", live: true, pair: "AUD/USD" });
    expect(first.you.equity).toBe(10_000);
    expect(first.prices.at(-1)).toBeCloseTo(0.7, 6);
    const go = (body: Record<string, unknown>) => c.act(me, { mode: "marathon", ...body });
    const bought = await go({ kind: "buy", pair: "AUD/JPY", leverage: 30, stake: 0.25 });
    expect(bought.status, await bought.clone().text()).toBe(200);
    expect((await go({ kind: "sell", pair: "EUR/USD", leverage: 10, stake: 0.25 })).status).toBe(200);
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
    const tab1 = await c.page(me, "marathon");
    for (let i = 0; i < 50 && !(await look()).live; i++) await new Promise((r) => setTimeout(r, 100));
    const back = await look();
    tab1.close();
    expect(back.you.positions.map((p) => p.pair)).toEqual(expect.arrayContaining(["AUD/JPY", "EUR/USD"]));
    // an hour without a price is a shut market: orders wait
    stale = true;
    const tab2 = await c.page(me, "marathon");
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
