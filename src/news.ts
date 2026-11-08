// Live's real news (ADR 0087): the central banks of the seven currencies, from their own press feeds, and this
// week's high-impact releases for them, from a public economic calendar. Each item is what the source said, its
// headline in English with its time and a link to the source, never rewritten; pages say it is the source's own words.
import type { Currency } from "./feed.ts";

export type Item = { id: string; cur: Currency; source: string; title: string; at: number; link: string };
export type Release = { cur: Currency; title: string; at: number; forecast: string; previous: string; actual: string };

// Each bank's feed, and which of its items move a currency: rate decisions and the statements around them, not
// every speech or statistical table.
const BANKS: { cur: Currency; source: string; url: string; keep: RegExp }[] = [
  { cur: "AUD", source: "Reserve Bank of Australia", url: "https://www.rba.gov.au/rss/rss-cb-media-releases.xml", keep: /monetary policy|cash rate|statement/i },
  { cur: "USD", source: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", keep: /FOMC|federal funds|monetary policy|statement/i },
  { cur: "EUR", source: "European Central Bank", url: "https://www.ecb.europa.eu/rss/press.html", keep: /monetary policy|interest rate|press conference|decision/i },
  { cur: "GBP", source: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news", keep: /bank rate|monetary policy/i },
  { cur: "JPY", source: "Bank of Japan", url: "https://www.boj.or.jp/en/rss/whatsnew.xml", keep: /monetary policy|policy rate|outlook for economic/i },
  { cur: "CHF", source: "Swiss National Bank", url: "https://www.snb.ch/public/en/rss/news", keep: /monetary policy|policy rate|assessment/i },
];
const CALENDAR = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Losscut/1.0" };
type Get = (url: string) => Promise<string>;
// LIVE_NEWS=off keeps the checks off the network; the bank feeds and the calendar are then empty
const get: Get = async (url) => {
  if (process.env.LIVE_NEWS === "off") throw new Error("news off");
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8_000), redirect: "follow" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
};

const unescape = (s: string): string => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
const field = (item: string, ...names: string[]): string => {
  for (const n of names) {
    const m = item.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`));
    if (m) return unescape(m[1]);
  }
  return "";
};

// A feed's items, newest first, kept to those that move its currency.
export function parseFeed(xml: string, bank: (typeof BANKS)[number]): Item[] {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([it]) => {
    const title = field(it, "title").replace(/\s+/g, " ");
    const link = field(it, "link");
    const at = Date.parse(field(it, "pubDate", "dc:date")) || 0;
    return { id: `${bank.cur}:${link || title}`, cur: bank.cur, source: bank.source, title, at, link };
  }).filter((i) => i.title && i.at && bank.keep.test(i.title) && /^https?:\/\/www\.(rba\.gov\.au|federalreserve\.gov|ecb\.europa\.eu|bankofengland\.co\.uk|boj\.or\.jp|snb\.ch)\//.test(i.link));
}

const OURS = new Set(["EUR", "GBP", "AUD", "USD", "CHF", "CNY", "JPY"]);
export function parseCalendar(json: string): Release[] {
  const rows = JSON.parse(json) as { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string; actual?: string }[];
  return rows.filter((r) => r.impact === "High" && OURS.has(r.country)).map((r) => ({ cur: r.country as Currency, title: r.title, at: Date.parse(r.date), forecast: r.forecast ?? "", previous: r.previous ?? "", actual: r.actual ?? "" })).filter((r) => r.at).sort((a, b) => a.at - b.at);
}

// Live's market headlines: a big outlet's market feed first, then backups in order when it fails. Each headline is the
// outlet's own words, credited and linked to its site, never rewritten; the page says so.
export type Story = { id: string; source: string; title: string; at: number; link: string; score: number };
export const MARKET_FEEDS: { source: string; url: string; site: RegExp }[] = [
  { source: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", site: /^https?:\/\/(www\.)?cnbc\.com\// },
  { source: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml", site: /^https?:\/\/(www\.)?bbc\.(co\.uk|com)\// },
  { source: "ABC News", url: "https://www.abc.net.au/news/feed/51892/rss.xml", site: /^https?:\/\/(www\.)?abc\.net\.au\// },
  { source: "FXStreet", url: "https://www.fxstreet.com/rss/news", site: /^https?:\/\/(www\.)?fxstreet\.com\// },
];
// How much a headline is about money, currencies first: words that move the seven currencies weigh most, then rates
// and prices, then markets in general. Nothing scores zero and is dropped.
const WEIGHTS: [RegExp, number][] = [
  [/\b(forex|currenc(y|ies)|exchange rate|dollar|euro|yen|pound|sterling|franc|yuan|renminbi|aussie)\b/i, 5],
  [/\b(fed|federal reserve|ecb|bank of england|boj|bank of japan|rba|reserve bank|snb|central bank|pboc)\b/i, 5],
  [/\b(interest rates?|rate (cut|hike|rise)|inflation|cpi|jobs report|payrolls|unemployment|gdp|recession|tariffs?)\b/i, 3],
  [/\b(bonds?|yields?|treasur(y|ies)|gold|oil|crude|commodit(y|ies))\b/i, 2],
  [/\b(stocks?|shares|markets?|wall street|s&p|nasdaq|dow|asx|nikkei|ftse|equities|investors?)\b/i, 1],
];
export const relevance = (title: string): number => WEIGHTS.reduce((n, [re, w]) => n + (re.test(title) ? w : 0), 0);
// Stories stay for three days: markets publish little at weekends, so a day would leave the list empty on a Sunday.
const KEEP = 3 * 86_400_000;

// A feed's market stories from the last three days, the most relevant and newest first, each linked to the outlet's own site.
export function parseMarketFeed(xml: string, feed: (typeof MARKET_FEEDS)[number], now: number): Story[] {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([it]) => {
    const title = field(it, "title").replace(/\s+/g, " ");
    const link = field(it, "link");
    const at = Date.parse(field(it, "pubDate", "dc:date")) || 0;
    return { id: `${feed.source}:${link || title}`, source: feed.source, title, at, link, score: relevance(title) };
  }).filter((i) => i.title && i.at && i.score > 0 && now - i.at < KEEP && i.at <= now + 3_600_000 && feed.site.test(i.link))
    // a feed may list one story twice; keep it once
    .filter((i, n, all) => all.findIndex((j) => j.title === i.title) === n)
    .sort((a, b) => b.score - a.score || b.at - a.at);
}

export class News {
  items: Item[] = [];
  calendar: Release[] = [];
  stories: Story[] = [];
  private fetchText: Get;
  constructor(fetchText: Get = get) {
    this.fetchText = fetchText;
  }
  // New items since the last look, oldest first; a feed that fails is skipped until the next look.
  async banks(): Promise<Item[]> {
    const seen = new Set(this.items.map((i) => i.id));
    const got = (await Promise.allSettled(BANKS.map(async (b) => parseFeed(await this.fetchText(b.url), b)))).flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const fresh = got.filter((i) => !seen.has(i.id));
    this.items = [...this.items, ...fresh].sort((a, b) => b.at - a.at).slice(0, 40);
    return fresh.sort((a, b) => a.at - b.at);
  }
  // The market headlines: the first feed that answers, in order, so a failing outlet falls to the next; with none
  // answering, the last good headlines stay until they age out.
  async markets(now: number): Promise<Story[]> {
    for (const feed of MARKET_FEEDS) {
      try {
        const got = parseMarketFeed(await this.fetchText(feed.url), feed, now);
        if (got.length) {
          this.stories = got.slice(0, 12);
          return this.stories;
        }
      } catch {
        // this outlet failed; try the next
      }
    }
    this.stories = this.stories.filter((i) => now - i.at < KEEP);
    return this.stories;
  }
  async week(): Promise<void> {
    try {
      this.calendar = parseCalendar(await this.fetchText(CALENDAR));
    } catch {
      // the calendar's source limits how often it is read; the last week's list stays
    }
  }
}
