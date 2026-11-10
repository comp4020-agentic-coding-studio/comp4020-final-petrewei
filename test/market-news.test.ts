import { describe, expect, it } from "vitest";
import { MARKET_FEEDS, News, parseMarketFeed, relevance } from "../src/news.ts";

// Live's market headlines: a big outlet's market feed, with backups in order when it fails, each headline kept as the
// outlet wrote it, credited and linked, and scored so the stories about money and currencies come first.
const rss = (items: [string, string, string][]) =>
  `<rss><channel>${items.map(([title, link, date]) => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`).join("")}</channel></rss>`;
const cnbc = MARKET_FEEDS.find((f) => f.source === "CNBC")!;
const now = Date.parse("2026-11-09T01:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toUTCString();

describe("market headlines", () => {
  it("scores a story about rates, currencies or markets above one about nothing to do with money", () => {
    expect(relevance("Fed holds interest rates steady as inflation cools")).toBeGreaterThan(relevance("Celebrity chef opens new restaurant"));
    expect(relevance("Australian dollar falls as RBA signals a pause")).toBeGreaterThan(relevance("Stocks edge higher on Wall Street"));
    expect(relevance("Celebrity chef opens new restaurant")).toBe(0);
  });

  it("keeps only market stories, newest and most relevant first, as the outlet wrote them with its link", () => {
    const feed = cnbc;
    const items = parseMarketFeed(rss([
      ["Yen slides past 155 per dollar as BOJ holds", "https://www.cnbc.com/a", ago(1)],
      ["Celebrity chef opens new restaurant", "https://www.cnbc.com/b", ago(1)],
      ["Oil prices jump on supply worries", "https://www.cnbc.com/c", ago(2)],
    ]), feed, now);
    expect(items.map((i) => i.title)).toEqual(["Yen slides past 155 per dollar as BOJ holds", "Oil prices jump on supply worries"]);
    expect(items[0]).toMatchObject({ source: feed.source, link: "https://www.cnbc.com/a" });
  });

  it("keeps a weekend's stories, and drops one older than three days, so the list turns over", () => {
    expect(parseMarketFeed(rss([["Dollar steadies after jobs report", "https://www.cnbc.com/sat", ago(30)]]), cnbc, now)).toHaveLength(1);
    const items = parseMarketFeed(rss([["Dollar steadies after jobs report", "https://www.cnbc.com/old", ago(80)]]), cnbc, now);
    expect(items).toEqual([]);
  });

  it("decodes the outlet's entities and keeps a story listed twice only once", () => {
    const items = parseMarketFeed(rss([
      ["Fed&apos;s rate path &amp; the dollar", "https://www.cnbc.com/a", ago(1)],
      ["Fed&apos;s rate path &amp; the dollar", "https://www.cnbc.com/b", ago(1)],
    ]), cnbc, now);
    expect(items.map((i) => i.title)).toEqual(["Fed's rate path & the dollar"]);
  });

  it("refuses a link off the outlet's own site", () => {
    const items = parseMarketFeed(rss([["Fed cuts rates", "https://evil.example/x", ago(1)]]), cnbc, now);
    expect(items).toEqual([]);
  });

  it("falls back to the next feed in order when the first fails, and reads no further once one answers", async () => {
    const asked: string[] = [];
    const news = new News(async (url) => {
      asked.push(url);
      if (url !== MARKET_FEEDS[1].url) throw new Error("down");
      return rss([["Euro rises as ECB keeps rates on hold", "https://www.cnbc.com/news/business-1", ago(1)]]);
    });
    const items = await news.markets(now);
    expect(asked, "the first feed is asked, fails, and the second answers; no third is read").toEqual([MARKET_FEEDS[0].url, MARKET_FEEDS[1].url]);
    expect(items[0]).toMatchObject({ source: MARKET_FEEDS[1].source, title: "Euro rises as ECB keeps rates on hold" });
  });

  // Investing.com's forex feed leads: it is almost all about currencies, and it publishes at weekends when the general
  // outlets do not. The others stay behind it, so a feed that blocks the server never leaves Live without headlines.
  it("reads Investing.com's forex feed first, and the general outlets only when it fails", () => {
    expect(MARKET_FEEDS[0]).toMatchObject({ source: "Investing.com", url: "https://www.investing.com/rss/news_1.rss" });
    expect(MARKET_FEEDS.slice(1).map((f) => f.source)).toEqual(["CNBC", "BBC News", "ABC News", "FXStreet"]);
  });

  it("accepts a story linked to Investing.com's own site and refuses one linked elsewhere", () => {
    const investing = MARKET_FEEDS[0];
    const items = parseMarketFeed(rss([
      ["Sterling today: Pound firms as dollar retreats from Friday rally", "https://www.investing.com/news/forex-news/sterling-today-1", ago(2)],
      ["Dollar steadies after jobs report", "https://evil.example/investing.com/x", ago(2)],
    ]), investing, now);
    expect(items.map((i) => i.title)).toEqual(["Sterling today: Pound firms as dollar retreats from Friday rally"]);
    expect(items[0]).toMatchObject({ source: "Investing.com", link: "https://www.investing.com/news/forex-news/sterling-today-1" });
  });

  it("falls to CNBC when Investing.com is blocked, so headlines never stop", async () => {
    const asked: string[] = [];
    const news = new News(async (url) => {
      asked.push(url);
      if (url === MARKET_FEEDS[0].url) throw new Error("403");
      return rss([["Stocks rally as bond yields fall", "https://www.cnbc.com/2026/11/09/x", ago(1)]]);
    });
    const items = await news.markets(now);
    expect(asked).toEqual([MARKET_FEEDS[0].url, MARKET_FEEDS[1].url]);
    expect(items[0]).toMatchObject({ source: "CNBC" });
  });

  // The footer credits every outlet whose headlines can appear (CLAUDE.md), in every language: a source added to the
  // list without its credit would show a headline under no name.
  it("credits every outlet it reads in the footer, in every language", async () => {
    const { LANGS, T } = await import("../public/i18n.js");
    for (const lang of LANGS) for (const feed of MARKET_FEEDS) expect(T[lang].ui.footer, `${lang} footer names ${feed.source}`).toContain(feed.source);
  });

  // Live shows no release calendar (its feed is news and trades alone), so the footer must not credit one.
  it("does not credit a calendar the page no longer shows, in any language", async () => {
    const { LANGS, T } = await import("../public/i18n.js");
    for (const lang of LANGS) expect(T[lang].ui.footer, `${lang} footer`).not.toMatch(/ForexFactory/i);
  });

  it("keeps the last good headlines when every feed fails", async () => {
    let up = true;
    const news = new News(async () => {
      if (!up) throw new Error("down");
      return rss([["Stocks rally as bond yields fall", "https://www.cnbc.com/2026/11/09/x", ago(1)]]);
    });
    await news.markets(now);
    up = false;
    expect((await news.markets(now)).map((i) => i.title)).toEqual(["Stocks rally as bond yields fall"]);
  });
});
