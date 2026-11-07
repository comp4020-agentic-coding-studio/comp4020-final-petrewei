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

const unescape = (s: string): string => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
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

export class News {
  items: Item[] = [];
  calendar: Release[] = [];
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
  async week(): Promise<void> {
    try {
      this.calendar = parseCalendar(await this.fetchText(CALENDAR));
    } catch {
      // the calendar's source limits how often it is read; the last week's list stays
    }
  }
}
