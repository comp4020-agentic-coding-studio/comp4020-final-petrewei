// Marathon (ADR 0087): a market that never closes, on real prices. Every player has one Australian-dollar account kept
// on the volume, trades any of the twenty-one pairs at the price now, and keeps it across days until it goes bankrupt;
// then the run is put on the Marathon board and a new account opens at the next midnight in Sydney. There is no round,
// no bell and no house trader: the prices, the central banks' news and the week's releases are all real.
//
// The prices are fifteen-minute slots, the game's tick (ADR 0085): the chart is a pair's closes for five days, the
// newest slot's close moving with each poll. Each slot that passes charges every account its fees and interest, and
// the broker's rules act on every poll. When the server wakes after sleeping, the slots it missed are replayed in
// order, so a stop or a stop-out that would have filled in the night fills at its own slot's price.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BookAccount, type BookFill, borrow, bankrupt, charge, close, enforce, equity, exit, fresh, level, lines, nextSydneyMidnight, openPnl, order, pnlOf, repay, used, worth } from "./book.ts";
import { LEVERAGES, LIMIT, quote, RULES, START } from "./fx.ts";
import { CURRENCIES, Live, SLOT_MS, cross, type Usd } from "./live.ts";
import { News } from "./news.ts";
import { PAIRS, type Pair } from "./market.ts";

export type Run = { key: string; name: string; draw: number | null; face: string; opened: number; ended: number; peak: number; how: "bankrupt" | "running"; worth: number };
type Saved = { accounts: Record<string, BookAccount>; runs: Run[]; waits: Record<string, number>; slot: number; names?: Record<string, [string, number | null]> };
export type Who = { nameAt: (k: string) => { name: string; draw: number | null }; named: (who: string) => boolean; key: (who: string) => string; short: (who: string) => string; name: (who: string) => string; draw: (who: string) => number | null; face: (who: string) => string; faceAt: (k: string) => string };
export type FeedLine = { text: string; kind: string; key: string; args: Record<string, string | number> };

const POLL_MS = Number(process.env.MARATHON_POLL_MS ?? 5_000);
const NEWS_MS = 10 * 60_000;
const CAL_MS = 60 * 60_000;
const BOARD = 10;
// Yahoo keeps a month of fifteen-minute closes: history missing from further back never comes, so trading resumes on
// what there is rather than staying paused for everyone.
const HISTORY_MS = 30 * 86_400_000;

export class Marathon {
  live: Live;
  news: News;
  private file: string;
  accounts = new Map<string, BookAccount>();
  private names = new Map<string, string>();
  private draws = new Map<string, number | null>();
  runs: Run[] = [];
  // a bankrupt player's key, and when their next account opens
  waits = new Map<string, number>();
  feed: FeedLine[] = [];
  headline: { cur: string; title: string; source: string; link: string; at: number } | null = null;
  // the last slot the accounts were charged for
  slot = 0;
  private refreshing = false;
  private gap = false;
  private selections = new Map<string, string>();
  private polling: ReturnType<typeof setInterval> | null = null;
  private lastNews = 0;
  private lastCal = 0;
  private lastBack = 0;
  private lastExtended = 0;
  private dirty = false;
  private watching: () => number;
  private onChange: () => void;
  private log: (who: string | null, ev: string, fields: Record<string, unknown>) => void;
  readonly w: Who;

  constructor(dir: string, w: Who, opts: { live?: Live; news?: News; watching: () => number; onChange: () => void; log: (who: string | null, ev: string, fields: Record<string, unknown>) => void }) {
    this.file = join(dir, "marathon.json");
    this.w = w;
    this.live = opts.live ?? new Live();
    this.news = opts.news ?? new News();
    this.watching = opts.watching;
    this.onChange = opts.onChange;
    this.log = opts.log;
    if (existsSync(this.file)) {
      const s = JSON.parse(readFileSync(this.file, "utf8")) as Saved;
      this.accounts = new Map(Object.entries(s.accounts));
      this.runs = s.runs ?? [];
      this.waits = new Map(Object.entries(s.waits ?? {}));
      this.slot = s.slot ?? 0;
      // the names last seen, so the board names a player who has not looked in since a restart
      for (const [k, [n, d]] of Object.entries(s.names ?? {})) {
        this.names.set(k, n);
        this.draws.set(k, d);
      }
    }
    setInterval(() => this.save(), 5_000).unref();
  }

  save(force = false): void {
    if (!this.dirty && !force) return;
    this.dirty = false;
    try {
      const data: Saved = { accounts: Object.fromEntries(this.accounts), runs: this.runs, waits: Object.fromEntries(this.waits), slot: this.slot, names: Object.fromEntries([...this.names].map(([k, n]) => [k, [n, this.draws.get(k) ?? null]])) };
      writeFileSync(`${this.file}.tmp`, JSON.stringify(data));
      renameSync(`${this.file}.tmp`, this.file);
    } catch (e) {
      console.error("marathon save failed:", e instanceof Error ? e.message : "unknown");
    }
  }

  say(text: string, kind: string, key: string, args: Record<string, string | number> = {}): void {
    this.feed = [...this.feed, { text, kind, key, args }].slice(-60);
  }

  // Polls run only while someone has the tab open; the first look fetches the days before.
  wake(): void {
    if (this.polling) return;
    const tick = () => void this.refresh().catch(() => {});
    this.lastBack = 0;
    tick();
    this.polling = setInterval(() => {
      if (!this.watching()) {
        clearInterval(this.polling!);
        this.polling = null;
        return;
      }
      tick();
    }, POLL_MS);
    this.polling.unref?.();
  }

  async refresh(at?: number): Promise<void> {
    if (this.refreshing) return;
    const now = at ?? Date.now();
    this.refreshing = true;
    try {
      if (!this.live.slots.length || now - this.lastBack > CAL_MS) {
        await this.live.backfill();
        this.lastBack = now;
      } else await this.live.poll();
      this.gap = this.missingHistory(now);
      if (this.gap && now - this.lastExtended > CAL_MS) {
        this.lastExtended = now;
        await this.live.backfill(true);
        this.gap = this.missingHistory(now);
      }
      if (!this.gap) this.advance(at ?? Date.now());
    } catch {
      // A newly fetched quote remains unavailable if historical recovery failed.
      this.gap ||= this.missingHistory(now);
    } finally {
      this.live.trim();
      this.refreshing = false;
    }
    this.onChange();
    await this.updateNews(now);
  }

  // Whether slots since the last one charged are missing from what the source sent, while some account is exposed to
  // them: settling those accounts on later prices would skip a stop-out or a bankruptcy that happened in between.
  private missingHistory(now: number): boolean {
    if (!this.slot || (this.live.slots.at(-1)?.slot ?? 0) <= this.slot + 1 || now - this.slot * SLOT_MS > HISTORY_MS) return false;
    const exposed = [...this.accounts.values()].filter((a) => a.debt > 0 || used(a) > 0);
    return exposed.length > 0 && !this.live.coversSince(this.slot + 1, exposed.flatMap((a) => Object.keys(a.positions)));
  }

  private async updateNews(now: number): Promise<void> {
    if (now - this.lastNews <= NEWS_MS && now - this.lastCal <= CAL_MS) return;
    if (now - this.lastNews > NEWS_MS) {
      this.lastNews = now;
      const first = !this.news.items.length;
      const fresh = await this.news.banks().catch(() => []);
      // the first look sets what has already been said; only what is new after it, or from the last day, is told
      for (const i of fresh.filter((i) => !first || now - i.at < 86_400_000)) {
        this.say(`${i.source}: ${i.title}`, "news", "bank", { cur: i.cur, source: i.source, title: i.title });
        this.headline = { cur: i.cur, title: i.title, source: i.source, link: i.link, at: i.at };
      }
    }
    if (now - this.lastCal > CAL_MS) {
      this.lastCal = now;
      await this.news.week();
    }
    this.onChange();
  }

  // Charge each slot that has passed since the last, in order, with that slot's prices, and act on the rules at each.
  advance(now = Date.now()): void {
    const slots = this.live.slots;
    if (!slots.length) return;
    const last = slots.at(-1)!.slot;
    if (!this.slot) this.slot = last;
    for (const { slot, usd } of slots) {
      if (slot <= this.slot) continue;
      const at = slot * SLOT_MS;
      // A past slot's close is final. The newest slot can still move and requires live prices.
      const closed = slot !== last || now - at >= SLOT_MS;
      for (const [k, a] of this.accounts) {
        charge(a);
        if (closed || this.live.live(Object.keys(a.positions))) this.report(k, enforce(a, usd, at));
      }
      this.bust(at, usd);
      this.slot = slot;
      this.dirty = true;
    }
    // and the rules on the price now
    const usd = this.live.latest()!;
    for (const [k, a] of this.accounts) {
      if (this.live.live(Object.keys(a.positions))) this.report(k, enforce(a, usd, now));
    }
    this.bust(now, usd);
  }

  private report(k: string, fills: BookFill[]): void {
    if (!fills.length) return;
    this.dirty = true;
    const name = this.names.get(k) ?? "A trader";
    for (const f of fills) {
      const args = { who: k.slice(0, 6), name, draw: this.draws.get(k) ?? -1, pair: f.pair, pnl: Math.round(f.pnl) };
      if (f.kind === "stop") this.say(`${name}'s stop filled on ${f.pair}`, f.pnl >= 0 ? "win" : "loss", "m-stopped", args);
      else if (f.kind === "take") this.say(`${name} took profit on ${f.pair}`, "win", "m-took", args);
      else if (f.kind === "stopout") this.say(`強制ロスカット! ${name} was stopped out on ${f.pair}`, "bust", "m-stopout", args);
      else if (f.kind === "call") this.say(`Margin call for ${name}.`, "call", "m-call", { who: k.slice(0, 6), name, draw: this.draws.get(k) ?? -1 });
    }
  }

  // Accounts with nothing open and worth too little to trade are closed and put on the board.
  private bust(now: number, usd: Usd): void {
    for (const [k, a] of this.accounts) {
      if (!bankrupt(a, usd)) continue;
      const until = nextSydneyMidnight(now);
      this.runs.push({ key: k, name: this.names.get(k) ?? "", draw: this.draws.get(k) ?? null, face: this.w.faceAt(k), opened: a.opened, ended: now, peak: a.peak, how: "bankrupt", worth: Math.round(worth(a, usd)) });
      this.runs = this.runs.slice(-500);
      this.accounts.delete(k);
      this.waits.set(k, until);
      this.say(`${this.names.get(k) ?? "A trader"} went bankrupt after ${days(now - a.opened)}.`, "bust", "m-bankrupt", { who: k.slice(0, 6), name: this.names.get(k) ?? "", draw: this.draws.get(k) ?? -1, days: days(now - a.opened) });
      this.log(null, "marathon-bankrupt", { code: k.slice(0, 6), days: days(now - a.opened), peak: a.peak });
      this.dirty = true;
    }
  }

  // Names by key, kept from the last time each person was seen, for the feed and the board.
  private seen(who: string, k: string): void {
    const name = this.w.name(who);
    const draw = this.w.draw(who);
    if (this.names.get(k) !== name || this.draws.get(k) !== draw) this.dirty = true;
    this.names.set(k, name);
    this.draws.set(k, draw);
  }

  // An unopened account is a preview. Only a successful financial action persists it.
  private preview(k: string, now: number): BookAccount | null {
    const a = this.accounts.get(k);
    if (a) return a;
    if (now < (this.waits.get(k) ?? 0)) return null;
    return fresh(now, this.slot, this.selections.get(k));
  }

  private tradable(a: BookAccount | null, pair: string): boolean {
    return !this.gap && this.live.live([pair, ...Object.keys(a?.positions ?? {})]);
  }

  act(who: string, input: Record<string, unknown>, now = Date.now()): string | null {
    const kind = input.kind;
    const k = this.w.key(who);
    const a = this.preview(k, now);
    if (!a) return "Your account is closed until midnight in Sydney.";
    if (kind === "pair") {
      if (typeof input.pair !== "string" || !PAIRS.includes(input.pair as Pair)) return "No such pair.";
      a.pair = input.pair;
      if (this.accounts.has(k)) this.dirty = true;
      else {
        this.selections.delete(k);
        this.selections.set(k, a.pair);
        if (this.selections.size > 1024) this.selections.delete(this.selections.keys().next().value!);
      }
      return null;
    }
    const pair = typeof input.pair === "string" && PAIRS.includes(input.pair as Pair) ? input.pair : a.pair;
    const usd = this.live.latest();
    if (this.gap) return "Marathon is waiting for missing price history.";
    if (!usd || !this.tradable(a, pair)) return "The market is closed: prices are not live. Orders wait for the next price.";
    let result: BookFill[] | string | null;
    if (kind === "buy" || kind === "sell") {
      const dist = (v: unknown) => (typeof v === "number" ? v : null);
      const side = kind === "buy" ? 1 : -1;
      const leverage = Number(input.leverage);
      const stake = typeof input.stake === "number" ? input.stake : 1;
      result = order(a, pair, usd, side, leverage, stake, { sl: dist(input.sl), tp: dist(input.tp) }, now);
    } else if (kind === "close") {
      result = close(a, pair, usd, now);
    } else if (kind === "stop" || kind === "take") {
      result = exit(a, pair, usd, kind, typeof input.pct === "number" ? input.pct : null);
    } else if (kind === "borrow" || kind === "repay") {
      result = kind === "borrow" ? borrow(a) : repay(a);
      if (!result) this.say(kind === "borrow" ? `${this.w.name(who)} drew emergency credit.` : `${this.w.name(who)} repaid credit.`, kind === "borrow" ? "wild" : "info", kind === "borrow" ? "borrowed" : "repaid", { who: this.w.short(who), name: this.w.name(who), draw: this.w.draw(who) ?? -1, amount: RULES.step, debt: Math.round(a.debt) });
    } else return "Unknown action.";
    if (typeof result === "string") return result;
    if (Array.isArray(result)) for (const fill of result) this.told(who, fill);
    this.seen(who, k);
    if (!this.accounts.has(k)) {
      this.accounts.set(k, a);
      this.waits.delete(k);
      this.selections.delete(k);
      this.log(who, "marathon-open", {});
    }
    this.log(who, `marathon-${kind}`, { pair });
    this.dirty = true;
    this.report(k, enforce(a, usd, now));
    this.bust(now, usd);
    return null;
  }

  private told(who: string, f: BookFill): void {
    const name = this.w.name(who);
    const args = { who: this.w.short(who), name, draw: this.w.draw(who) ?? -1, pair: f.pair, pnl: Math.round(f.pnl), lev: f.leverage ?? 0 };
    if (f.kind === "open" || f.kind === "add") this.say(`${name} ${f.side === 1 ? "bought" : "sold"} ${f.pair} at ${f.leverage}×`, f.side === 1 ? "buy" : "sell", f.side === 1 ? "m-bought" : "m-sold", args);
    else if (f.kind === "close") this.say(`${name} closed ${f.pair}`, f.pnl >= 0 ? "win" : "loss", "m-closed", args);
  }

  board(now = Date.now()): (Run & { you?: boolean })[] {
    const usd = this.live.latest();
    const running: Run[] = usd ? [...this.accounts].filter(([, a]) => used(a) > 0 || a.trades.length > 0).map(([k, a]) => ({ key: k, ...(this.names.has(k) ? { name: this.names.get(k)!, draw: this.draws.get(k) ?? null } : this.w.nameAt(k)), face: this.w.faceAt(k), opened: a.opened, ended: now, peak: a.peak, how: "running" as const, worth: Math.round(worth(a, usd)) })) : [];
    // longest-lasting first: the marathon's measure is how long an account survives
    return [...running, ...this.runs].sort((a, b) => b.ended - b.opened - (a.ended - a.opened)).slice(0, BOARD);
  }

  view(who: string, here: Record<string, number>) {
    const now = Date.now();
    const k = this.w.key(who);
    const a = this.preview(k, now);
    if (this.accounts.has(k)) this.seen(who, k);
    const usd = this.live.latest();
    const pair = a?.pair ?? "AUD/USD";
    const { prices, last } = this.live.series(pair);
    const mid = prices.at(-1) ?? 1;
    const positions = a && usd ? Object.entries(a.positions).map(([p, pos]) => ({ pair: p, side: pos.side, entry: pos.entry, leverage: pos.leverage, margin: pos.margin, stop: pos.stop, take: pos.take, now: cross(usd, p), live: this.tradable(a, p), pnl: Math.round(pnlOf(pos, p, usd)), ...lines(a, p, usd) })) : [];
    const pos = positions.find((p) => p.pair === pair) ?? null;
    const eq = a ? (usd ? equity(a, usd) : a.balance) : 0;
    const live = this.tradable(a, pair);
    return {
      mode: "marathon",
      phase: live ? "trade" : this.live.slots.length ? "shut" : "waiting",
      live,
      historyGap: this.gap,
      priceAt: this.live.at,
      pair,
      pairs: PAIRS,
      currencies: CURRENCIES,
      // a yen pair is priced to two places and its pip is 0.01; the page reads the pip from this (3 for yen pairs)
      digits: pair.endsWith("/JPY") ? 3 : 5,
      // the chart's prices: the pair's closes, the newest moving; the slot is the clock, 96 a day
      prices,
      from: 0,
      tick: last,
      total: prices.length - 1,
      steps: 8,
      dayTicks: 96,
      history: [],
      slotMs: SLOT_MS,
      start: START,
      speed: 1,
      rules: false,
      ironman: false,
      paused: null,
      round: 0,
      headline: this.headline,
      calendar: this.news.calendar.filter((c) => c.at > now - 86_400_000).slice(0, 12),
      bankNews: this.news.items.slice(0, 8).map((i) => ({ cur: i.cur, source: i.source, title: i.title, at: i.at, link: i.link })),
      reopens: a ? null : this.waits.get(k) ?? null,
      you: {
        name: this.w.name(who),
        draw: this.w.draw(who),
        named: this.w.named(who),
        face: this.w.face(who),
        code: this.w.short(who),
        balance: a?.balance ?? 0,
        equity: Math.round(eq),
        pnl: a && usd ? Math.round(openPnl(a, usd)) : 0,
        level: a && usd && used(a) ? Math.round(level(a, usd) * 100) : null,
        out: !a,
        guess: null,
        debt: Math.round(a?.debt ?? 0),
        credit: Math.max(0, LIMIT - Math.round(a?.debt ?? 0)),
        broke: false,
        bankrupt: !a,
        cuts: a?.cuts ?? 0,
        opened: a?.opened ?? null,
        peak: a?.peak ?? null,
        used: a ? used(a) : 0,
        pos: pos && { side: pos.side, entry: pos.entry, leverage: pos.leverage, margin: pos.margin, stop: pos.stop, take: pos.take, called: !!a?.called, call: pos.call, cut: pos.cut },
        positions,
        pending: null,
        feats: [],
        trades: (a?.trades ?? []).slice(-20).reverse(),
      },
      traders: [],
      feed: this.feed,
      pops: [],
      marks: [],
      result: null,
      board: this.board(now).map(({ key: rk, ...r }) => ({ ...r, days: days(r.ended - r.opened), you: rk === k })),
      career: [],
      leverages: LEVERAGES,
      desk: { ...RULES, ticksPerMinute: 60_000 / SLOT_MS },
      minRounds: 0,
      ...quote(mid),
      here,
    };
  }
}

// How long, in whole days and hours, for the feed and the board.
export function days(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
