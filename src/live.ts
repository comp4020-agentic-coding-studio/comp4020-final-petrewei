import type { LiveState } from "../public/protocol.js";
// Live (ADR 0087): a market that never closes, on real prices. Every player has one Australian-dollar account kept
// on the volume, trades any of the twenty-one pairs at the price now, and keeps it across days until it goes bankrupt;
// then the run is put on the Live board and a new account opens at the next midnight in Sydney. There is no round,
// no bell and no house trader: the prices, the central banks' news and the week's releases are all real.
//
// The prices are fifteen-minute slots, the game's tick (ADR 0085): the chart is a pair's closes for five days, the
// newest slot's close moving with each poll. Each slot that passes charges every account its fees and interest, and
// the broker's rules act on every poll. When the server wakes after sleeping, the slots it missed are replayed in
// order, so a stop or a stop-out that would have filled in the night fills at its own slot's price.
import { join } from "node:path";
import { type BookAccount, type BookFill, borrow, bankrupt, cancelAlert, cancelPending, ringAlerts, setAlert, setPending, triggerPending, charge, close, enforce, equity, exit, fresh, level, lines, nextSydneyMidnight, openPnl, order, pnlOf, repay, rollDay, used, worth } from "./book.ts";
import { LEVERAGES, LIMIT, quote, RULES, START } from "./fx.ts";
import { tradeAction } from "./actions.ts";
import { LiveBots } from "./live-bots.ts";
import { pipOf } from "../public/ticket.js";
import { CURRENCIES, Feed, SLOT_MS, cross, type Usd } from "./feed.ts";
import { nextOpen } from "./history-policy.ts";
import { News } from "./news.ts";
import { ALL_PAIRS, isPair } from "./market.ts";
import { systemClock, type Clock, type Timer } from "./clock.ts";
import { jsonStorage, renameStore, type Store, type Storage } from "./storage.ts";
import { liveValid, migrateLive } from "./saved.ts";

export type Run = { key: string; name: string; draw: number | null; face: string; opened: number; ended: number; peak: number; how: "bankrupt" | "running"; worth: number };
type TraderName = [name: string, draw: number | null];

type Saved = { accounts: Record<string, BookAccount>; runs: Run[]; waits: Record<string, number>; slot: number; names?: Record<string, TraderName>; agents?: string[] };
export type Who = { nameAt: (k: string) => { name: string; draw: number | null }; named: (who: string) => boolean; key: (who: string) => string; short: (who: string) => string; name: (who: string) => string; draw: (who: string) => number | null; face: (who: string) => string; faceAt: (k: string) => string };
export type FeedLine = { text: string; kind: string; key: string; args: Record<string, string | number>; when?: number };

const POLL_MS = Number(process.env.LIVE_POLL_MS ?? 5_000);
const NEWS_MS = 10 * 60_000;
const CAL_MS = 60 * 60_000;
const BOARD = 10;
// Yahoo keeps a month of fifteen-minute closes: history missing from further back never comes, so trading resumes on
// what there is rather than staying paused for everyone.
const HISTORY_MS = 30 * 86_400_000;

export class Live {
  quotes: Feed;
  news: News;
  private store: Store<Saved>;
  accounts = new Map<string, BookAccount>();
  private names = new Map<string, TraderName>();
  runs: Run[] = [];
  // a bankrupt player's key, and when their next account opens
  waits = new Map<string, number>();
  feed: FeedLine[] = [];
  // the market stories already told in the timeline, so a refresh never tells one twice
  private toldStories = new Set<string>();
  // the career keys of AI agents playing through MCP, so the board marks their rows (ADR 0096); never sent itself
  agents = new Set<string>();
  // the house traders, each on a pair of its own, told in the feed and never on the board (ADR 0095)
  private bots = new LiveBots();
  // the last slot the accounts were charged for
  slot = 0;
  private refreshing = false;
  private gap = false;
  private selections = new Map<string, string>();
  private polling: Timer | null = null;
  private saving: Timer;
  private clock: Clock;
  private pollMs: number;
  private disposed = false;
  private lastNews = 0;
  private lastCal = 0;
  private lastBack = 0;
  private lastExtended = 0;
  private dirty = false;
  private watching: () => number;
  private onChange: () => void;
  private log: (who: string | null, ev: string, fields: Record<string, unknown>) => void;
  readonly w: Who;

  constructor(dir: string, w: Who, opts: { quotes?: Feed; news?: News; clock?: Clock; storage?: Storage; pollMs?: number; watching: () => number; onChange: () => void; log: (who: string | null, ev: string, fields: Record<string, unknown>) => void }) {
    // the accounts were saved as marathon.json before the tab was renamed Live (ADR 0091)
    renameStore(join(dir, "marathon.json"), join(dir, "live.json"));
    this.store = (opts.storage ?? jsonStorage).open<Saved>(join(dir, "live.json"), { initial: () => ({ accounts: {}, runs: [], waits: {}, slot: 0 }), validate: liveValid, migrateLegacy: migrateLive });
    this.w = w;
    this.clock = opts.clock ?? systemClock;
    this.pollMs = opts.pollMs ?? POLL_MS;
    this.quotes = opts.quotes ?? new Feed(undefined, this.clock.now);
    this.news = opts.news ?? new News();
    this.watching = opts.watching;
    this.onChange = opts.onChange;
    this.log = opts.log;
    {
      const s = this.store.read();
      this.accounts = new Map(Object.entries(s.accounts));
      this.runs = s.runs ?? [];
      this.waits = new Map(Object.entries(s.waits ?? {}));
      this.slot = s.slot ?? 0;
      // the names last seen, so the board names a player who has not looked in since a restart
      for (const [key, [name, draw]] of Object.entries(s.names ?? {})) this.names.set(key, [name, draw]);
      // which players are AI agents, kept so an agent's row keeps its badge through a restart (ADR 0096)
      for (const k of s.agents ?? []) this.agents.add(k);
    }
    this.saving = this.clock.every(() => this.save(), 5_000).unref();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.saving.cancel();
    this.polling?.cancel();
    this.polling = null;
    this.save(true);
  }

  save(force = false): void {
    if (!this.dirty && !force) return;
    try {
      const names = Object.fromEntries<TraderName>([...this.names].map(([key, [name, draw]]) => [key, [name, draw]]));
      const data: Saved = { accounts: Object.fromEntries(this.accounts), runs: this.runs, waits: Object.fromEntries(this.waits), slot: this.slot, names, agents: [...this.agents].filter((k) => this.accounts.has(k) || this.runs.some((r) => r.key === k)) };
      this.store.write(data);
      this.dirty = false;
    } catch (e) {
      console.error("live save failed:", e instanceof Error ? e.message : "unknown");
    }
  }

  say(text: string, kind: string, key: string, args: Record<string, string | number> = {}): void {
    // each line is stamped when it is said, so the feed shows the time of a trade and a story alike
    this.feed = [...this.feed, { text, kind, key, args, when: this.clock.now() }].slice(-60);
  }

  // Polls run only while someone has the tab open; the first look fetches the days before.
  wake(): void {
    if (this.polling || this.disposed) return;
    const tick = () => void this.refresh().catch(() => {});
    this.lastBack = 0;
    tick();
    this.polling = this.clock.every(() => {
      if (!this.watching()) {
        this.polling!.cancel();
        this.polling = null;
        return;
      }
      tick();
    }, this.pollMs);
    this.polling.unref?.();
  }

  async refresh(at?: number): Promise<void> {
    if (this.refreshing || this.disposed) return;
    const now = at ?? this.clock.now();
    this.refreshing = true;
    try {
      if (!this.quotes.slots.length || now - this.lastBack > CAL_MS) {
        await this.quotes.backfill();
        this.lastBack = now;
      } else await this.quotes.poll();
      if (this.disposed) return;
      this.gap = this.missingHistory(now);
      if (this.gap && now - this.lastExtended > CAL_MS) {
        this.lastExtended = now;
        await this.quotes.backfill(true);
        if (this.disposed) return;
        this.gap = this.missingHistory(now);
      }
      if (!this.gap) this.advance(at ?? this.clock.now());
      // the house traders trade real prices as real Live players while Live is open (ADR 0095, 0097): each through
      // Live's own action, on its own account, bankrupt and back at Sydney midnight like anyone
      const usd = this.quotes.latest();
      if (usd && !this.gap && this.quotes.live()) {
        const t = at ?? this.clock.now();
        this.bots.step(usd, { account: (bot) => this.preview(bot, t), act: (bot, input) => this.act(bot, input, t) });
      }
    } catch {
      if (this.disposed) return;
      // A newly fetched quote remains unavailable if historical recovery failed.
      this.gap ||= this.missingHistory(now);
    } finally {
      this.quotes.trim();
      this.refreshing = false;
    }
    if (this.disposed) return;
    this.onChange();
    await this.updateNews(now);
  }

  // Whether slots since the last one charged are missing from what the source sent, while some account is exposed to
  // them: settling those accounts on later prices would skip a stop-out or a bankruptcy that happened in between.
  private missingHistory(now: number): boolean {
    if (!this.slot || (this.quotes.slots.at(-1)?.slot ?? 0) <= this.slot || now - this.slot * SLOT_MS > HISTORY_MS) return false;
    // only people are waited for: a house trader (ADR 0097) is a character, and a stop-out it skips costs nobody
    const exposed = [...this.accounts].filter(([k, a]) => !k.startsWith("bot:") && (a.debt > 0 || used(a) > 0)).map(([, a]) => a);
    return exposed.length > 0 && !this.quotes.coversSince(this.slot + 1, exposed.flatMap((a) => Object.keys(a.positions)));
  }

  private async updateNews(now: number): Promise<void> {
    if (now - this.lastNews <= NEWS_MS && now - this.lastCal <= CAL_MS) return;
    if (now - this.lastNews > NEWS_MS) {
      this.lastNews = now;
      const first = !this.news.items.length;
      const fresh = await this.news.banks().catch(() => []);
      if (this.disposed) return;
      // the first look sets what has already been said; only what is new after it, or from the last day, is told
      // a central bank's decision moves a currency most, so it ranks above any market story
      for (const i of fresh.filter((i) => !first || now - i.at < 86_400_000)) {
        this.say(`${i.source}: ${i.title}`, "news", "bank", { cur: i.cur, source: i.source, title: i.title, link: i.link, at: i.at, score: 20 });
      }
      // the market's own headlines, from a big outlet with backups, each told in the timeline once, oldest first, so the
      // newest sits at the top; the page pins the most important of the recent news
      const stories = await this.news.markets(now).catch(() => this.news.stories);
      if (this.disposed) return;
      for (const x of stories.filter((x) => !this.toldStories.has(x.id)).sort((a, b) => a.at - b.at)) {
        this.toldStories.add(x.id);
        this.say(`${x.source}: ${x.title}`, "news", "market", { source: x.source, title: x.title, link: x.link, at: x.at, score: x.score });
      }
    }
    if (now - this.lastCal > CAL_MS) {
      this.lastCal = now;
      await this.news.week();
      if (this.disposed) return;
    }
    this.onChange();
  }

  // Charge each slot that has passed since the last, in order, with that slot's prices, and act on the rules at each.
  advance(now = this.clock.now()): void {
    if (this.disposed) return;
    const slots = this.quotes.settlementSlots();
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
        if (closed || this.quotes.live(Object.keys(a.positions))) this.report(k, enforce(a, usd, at));
      }
      this.bust(at, usd);
      this.slot = slot;
      this.dirty = true;
    }
    // and the rules on the price now
    const usd = this.quotes.latest()!;
    // pending orders the live price has reached fill at that price, each on a pair that is trading now, so a stale
    // weekend price never fires one
    for (const [key, acc] of this.accounts) {
      if (!acc.pending || !Object.keys(acc.pending).length) continue;
      const out = triggerPending(acc, usd, now, (pair) => this.quotes.live([pair]));
      if (!out.length) continue;
      this.dirty = true;
      this.report(key, out.filter((f): f is BookFill => f.kind !== "pending-refused"));
      for (const r of out.filter((f) => f.kind === "pending-refused")) this.say(`A pending order on ${r.pair} could not be placed: ${"reason" in r ? r.reason : ""}`, "info", "pending-refused", { pair: r.pair });
    }
    // alerts the price has reached are told to their owner alone, and kept until they see them (ADR 0095)
    for (const acc of this.accounts.values()) {
      const rang = ringAlerts(acc, usd);
      if (rang.length) {
        acc.rang = [...(acc.rang ?? []), ...rang.map((x) => ({ pair: x.pair, at: x.at, when: now }))].slice(-10);
        this.dirty = true;
      }
      // a rung alert stays in its owner's feed for a day
      if (acc.rang?.some((x) => now - x.when > 86_400_000)) {
        acc.rang = acc.rang.filter((x) => now - x.when <= 86_400_000);
        this.dirty = true;
      }
    }
    // a new Sydney day for each account, its last day kept as yesterday (ADR 0095)
    for (const acc of this.accounts.values()) if (rollDay(acc, usd, now)) this.dirty = true;
    for (const [k, a] of this.accounts) {
      if (this.quotes.live(Object.keys(a.positions))) this.report(k, enforce(a, usd, now));
    }
    this.bust(now, usd);
  }

  private report(k: string, fills: BookFill[]): void {
    if (!fills.length) return;
    this.dirty = true;
    const name = this.names.get(k)?.[0] ?? "A trader";
    for (const f of fills) {
      const args = { who: k.slice(0, 6), name, draw: this.names.get(k)?.[1] ?? -1, pair: f.pair, pnl: Math.round(f.pnl) };
      if (f.kind === "stop") this.say(`${name}'s stop filled on ${f.pair}`, f.pnl >= 0 ? "win" : "loss", "m-stopped", args);
      else if (f.kind === "take") this.say(`${name} took profit on ${f.pair}`, "win", "m-took", args);
      else if (f.kind === "stopout") this.say(`強制ロスカット! ${name} was stopped out on ${f.pair}`, "bust", "m-stopout", args);
      else if (f.kind === "call") this.say(`Margin call for ${name}.`, "call", "m-call", { who: k.slice(0, 6), name, draw: this.names.get(k)?.[1] ?? -1 });
    }
  }

  // The operator removes one Live player, such as a test account, by their six-letter code or by the name the board
  // shows: their account, past runs and saved name, so they leave the board. False when nobody matches; a name two
  // players share is refused, so one removal never takes the wrong one.
  remove(who: { code?: string; name?: string }): boolean | "ambiguous" {
    const all = new Set([...this.accounts.keys(), ...this.runs.map((r) => r.key), ...this.names.keys()]);
    // the name the board shows: Live's own, a past run's, or the app's name for a player Live never named
    const nameOf = (k: string) => this.names.get(k)?.[0] ?? this.runs.find((r) => r.key === k)?.name ?? this.w.nameAt(k).name;
    const keys = new Set([...all].filter((k) => (who.code ? k.slice(0, 6) === who.code : nameOf(k) === who.name)));
    if (!keys.size) return false;
    if (!who.code && keys.size > 1) return "ambiguous";
    for (const k of keys) {
      this.accounts.delete(k);
      this.waits.delete(k);
      this.names.delete(k);
    }
    this.runs = this.runs.filter((r) => !keys.has(r.key));
    this.dirty = true;
    this.save(true);
    this.onChange();
    return true;
  }

  // Accounts with nothing open and worth too little to trade are closed and put on the board.
  private bust(now: number, usd: Usd): void {
    for (const [k, a] of this.accounts) {
      if (!bankrupt(a, usd)) continue;
      const until = nextSydneyMidnight(now);
      this.runs.push({ key: k, name: this.names.get(k)?.[0] ?? "", draw: this.names.get(k)?.[1] ?? null, face: this.w.faceAt(k), opened: a.opened, ended: now, peak: a.peak, how: "bankrupt", worth: Math.round(worth(a, usd)) });
      this.runs = this.runs.slice(-500);
      this.accounts.delete(k);
      this.waits.set(k, until);
      this.say(`${this.names.get(k)?.[0] ?? "A trader"} went bankrupt after ${days(now - a.opened)}.`, "bust", "m-bankrupt", { who: k.slice(0, 6), name: this.names.get(k)?.[0] ?? "", draw: this.names.get(k)?.[1] ?? -1, days: days(now - a.opened) });
      this.log(null, "live-bankrupt", { code: k.slice(0, 6), days: days(now - a.opened), peak: a.peak });
      this.dirty = true;
    }
  }

  // Names by key, kept from the last time each person was seen, for the feed and the board.
  private seen(who: string, k: string): void {
    const name = this.w.name(who);
    const draw = this.w.draw(who);
    const previous = this.names.get(k);
    if (previous?.[0] === name && previous[1] === draw) return;
    this.dirty = true;
    this.names.set(k, [name, draw]);
  }

  // An unopened account is a preview. Only a successful financial action persists it.
  private preview(k: string, now: number): BookAccount | null {
    const a = this.accounts.get(k);
    if (a) return a;
    if (now < (this.waits.get(k) ?? 0)) return null;
    return fresh(now, this.slot, this.selections.get(k));
  }

  // Whether a missing bar holds this account. Settlement waits for the bar for everyone it must settle, but Live does
  // not stop: only an account with a position or credit is held, and a house trader's never is (ADR 0097).
  private held(k: string, a: BookAccount | null): boolean {
    return this.gap && !k.startsWith("bot:") && !!a && (a.debt > 0 || used(a) > 0);
  }

  private tradable(k: string, a: BookAccount | null, pair: string): boolean {
    return !this.held(k, a) && this.quotes.live([pair, ...Object.keys(a?.positions ?? {})]);
  }

  act(who: string, input: Record<string, unknown>, now = this.clock.now()): string | null {
    const kind = input.kind;
    const k = this.w.key(who);
    const a = this.preview(k, now);
    if (!a) return "Your account is closed until midnight in Sydney.";
    // an alert, on a pair at a level the player typed (ADR 0095): it only tells, so it needs no live price to cancel
    if (kind === "alert" || kind === "unalert") {
      const pair = isPair(input.pair) ? input.pair : a.pair;
      const at = Number(input.at);
      if (kind === "unalert") {
        const out = cancelAlert(a, pair, at);
        if (!out) {
          this.dirty = true;
          this.log(who, "live-unalert", { pair, at });
        }
        return out;
      }
      const usd = this.quotes.latest();
      if (!usd) return "The market is closed: prices are not live. Orders wait for the next price.";
      if (!this.accounts.has(k)) return "Trade first: an alert is kept with your account.";
      const out = setAlert(a, pair, usd, at);
      if (!out) {
        this.dirty = true;
        this.log(who, "live-alert", { pair, at });
      }
      return out;
    }
    // a pending order on a pair, at a level the player typed (ADR 0078, 0079): one per pair, filled at the live price
    if (kind === "pend" || kind === "unpend") {
      const pair = isPair(input.pair) ? input.pair : a.pair;
      if (kind === "unpend") {
        const out = cancelPending(a, pair);
        if (!out) {
          this.dirty = true;
          this.log(who, "live-unpend", { pair });
        }
        return out;
      }
      const usd = this.quotes.latest();
      if (!usd || !this.tradable(k, a, pair)) return "The market is closed: prices are not live. Orders wait for the next price.";
      if (!this.accounts.has(k)) return "Trade first: a pending order is kept with your account.";
      const side = input.side === -1 ? -1 : 1;
      const out = setPending(a, pair, usd, { side, at: Number(input.at), leverage: Number(input.leverage), share: Number(input.share), sl: input.sl == null ? null : Number(input.sl), tp: input.tp == null ? null : Number(input.tp) });
      if (!out) {
        this.dirty = true;
        this.log(who, "live-pend", { pair, side, at: Number(input.at), lev: Number(input.leverage) });
      }
      return out;
    }
    if (kind === "pair") {
      if (!isPair(input.pair)) return "No such pair.";
      a.pair = input.pair;
      if (this.accounts.has(k)) this.dirty = true;
      else {
        this.selections.delete(k);
        this.selections.set(k, a.pair);
        if (this.selections.size > 1024) this.selections.delete(this.selections.keys().next().value!);
      }
      return null;
    }
    const pair = isPair(input.pair) ? input.pair : a.pair;
    const usd = this.quotes.latest();
    if (this.held(k, a)) return "Live is waiting for missing price history.";
    if (!usd || !this.tradable(k, a, pair)) return "The market is closed: prices are not live. Orders wait for the next price.";
    // the same decoder as the round markets', so an old page's fields are read the same way; Live has no prayer and
    // no pending order, which it refuses as unknown
    const action = tradeAction(input);
    let result: BookFill[] | string | null;
    if (action?.kind === "order") {
      result = order(a, pair, usd, action.side, action.leverage, action.share ?? 1, { sl: action.sl, tp: action.tp }, now);
    } else if (action?.kind === "close") {
      result = close(a, pair, usd, now);
    } else if (action?.kind === "stop" || action?.kind === "take") {
      result = exit(a, pair, usd, action.kind, action.pct);
    } else if (action?.kind === "borrow" || action?.kind === "repay") {
      result = action.kind === "borrow" ? borrow(a) : repay(a);
      if (!result) this.say(kind === "borrow" ? `${this.w.name(who)} drew emergency credit.` : `${this.w.name(who)} repaid credit.`, kind === "borrow" ? "wild" : "info", kind === "borrow" ? "borrowed" : "repaid", { who: this.w.short(who), name: this.w.name(who), draw: this.w.draw(who) ?? -1, amount: RULES.step, debt: Math.round(a.debt) });
    } else return "Unknown action.";
    if (typeof result === "string") return result;
    if (Array.isArray(result)) for (const fill of result) this.told(who, fill);
    this.seen(who, k);
    if (!this.accounts.has(k)) {
      this.accounts.set(k, a);
      this.waits.delete(k);
      this.selections.delete(k);
      this.log(who, "live-open", {});
    }
    this.log(who, `live-${kind}`, { pair });
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

  board(now = this.clock.now()): (Run & { you?: boolean })[] {
    const usd = this.quotes.latest();
    const running: Run[] = [];
    if (usd) for (const [k, account] of this.accounts) {
      if (!(used(account) > 0 || account.trades.length > 0)) continue;
      const savedName = this.names.get(k);
      const identity = savedName ? { name: savedName[0], draw: savedName[1] } : this.w.nameAt(k);
      running.push({
        key: k, ...identity, face: this.w.faceAt(k), opened: account.opened, ended: now,
        peak: account.peak, how: "running", worth: Math.round(worth(account, usd)),
      });
    }
    // longest-lasting first: the live's measure is how long an account survives
    return [...running, ...this.runs].sort((a, b) => b.ended - b.opened - (a.ended - a.opened)).slice(0, BOARD);
  }

  diagnostics() { return { ...this.quotes.diagnostics(), historyGap: this.gap, settledSlot: this.slot, recovery: this.gap ? "waiting-for-recent-history" : "ready" }; }

  view(who: string, here: Record<string, number>) {
    const now = this.clock.now();
    const k = this.w.key(who);
    const a = this.preview(k, now);
    if (this.accounts.has(k)) this.seen(who, k);
    const usd = this.quotes.latest();
    const pair = a?.pair ?? "AUD/USD";
    const { prices, last } = this.quotes.series(pair);
    const mid = prices.at(-1) ?? 1;
    const positions = a && usd ? Object.entries(a.positions).map(([p, pos]) => ({ pair: p, side: pos.side, entry: pos.entry, leverage: pos.leverage, margin: pos.margin, stop: pos.stop, take: pos.take, now: cross(usd, p), live: this.tradable(k, a, p), pnl: Math.round(pnlOf(pos, p, usd)), ...lines(a, p, usd) })) : [];
    const pos = positions.find((p) => p.pair === pair) ?? null;
    const eq = a ? (usd ? equity(a, usd) : a.balance) : 0;
    const live = this.tradable(k, a, pair);
    const state = {
      mode: "live" as const,
      simulated: false,
      phase: live ? "trade" as const : this.quotes.slots.length ? "shut" as const : "waiting" as const,
      live,
      // true only for an account the missing bar holds; Live is not paused for the others
      historyGap: this.held(k, a),
      // when the FX week next opens, sent only while the calendar has it shut, never for a mid-week outage
      opens: live ? null : nextOpen(now),
      // Live's chart: the indicators, and its days named by their date (ADR 0087)
      chart: { studies: true, days: "date" as const, slotMs: SLOT_MS },
      clock: { key: !this.quotes.slots.length ? "clockWait" as const : this.held(k, a) ? "clockGap" as const : live ? "clockLive" as const : "clockShut" as const, at: this.quotes.at || null },
      priceAt: this.quotes.at,
      pair,
      pairs: ALL_PAIRS,
      currencies: CURRENCIES,
      // a yen pair is priced to two places and its pip is 0.01; the page reads the pip from this (3 for yen pairs)
      pip: pipOf(pair),
      // the chart's prices: the pair's closes, the newest moving; the slot is the clock, 96 a day
      prices,
      from: 0,
      tick: last,
      total: prices.length - 1,
      steps: 8,
      dayTicks: 96,
      history: [],
      start: START,
      speed: 1,
      rules: false,
      ironman: false,
      paused: null,
      round: 0,
      // Live's news is all in the feed, the most important pinned there, so the chart carries no headline of its own
      headline: null,
      // no schedule of releases over the feed: the feed is news and trades alone
      calendar: [],
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
        // credit on the same terms as an order, as act requires: an open account and live prices
        lending: !!a && live,
        broke: false,
        bankrupt: !a,
        cuts: a?.cuts ?? 0,
        opened: a?.opened ?? null,
        // Live's daily line (ADR 0095): today's change from the day's start, yesterday's, and the days the account has run
        today: a && usd && a.dayWorth !== undefined ? Math.round(worth(a, usd)) - a.dayWorth : null,
        yesterday: a?.yesterday ?? null,
        // your alerts, and the ones that rang today, which only you see
        alerts: a?.alerts ?? [],
        days: a ? Math.floor((now - a.opened) / 86_400_000) + 1 : 0,
        peak: a?.peak ?? null,
        used: a ? used(a) : 0,
        pos: pos && { side: pos.side, entry: pos.entry, leverage: pos.leverage, margin: pos.margin, stop: pos.stop, take: pos.take, called: !!a?.called, call: pos.call, cut: pos.cut, pnl: pos.pnl },
        positions,
        // the pending order on the chart's pair, if any; each pair keeps its own
        pending: a?.pending?.[pair] ?? null,
        feats: [],
        trades: (a?.trades ?? []).slice(-20).reverse(),
      },
      traders: [],
      // the shared feed, with your own rung alerts first: a line each, for you alone
      feed: [...(a?.rang ?? []).slice().reverse().map((x) => ({ text: `${x.pair} reached ${x.at}.`, kind: "info", key: "alert-rang", args: { pair: x.pair, at: x.at } })), ...this.feed],
      pops: [],
      marks: [],
      result: null,
      board: this.board(now).map(({ key: rk, ...r }) => ({ ...r, days: days(r.ended - r.opened), you: rk === k, agent: this.agents.has(rk) })),
      career: [],
      leverages: LEVERAGES,
      desk: { ...RULES, ticksPerMinute: 60_000 / SLOT_MS },
      minRounds: 0,
      ...quote(mid),
      here,
    };
    return state satisfies LiveState;
  }
}

// How long, in whole days and hours, for the feed and the board.
export function days(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
