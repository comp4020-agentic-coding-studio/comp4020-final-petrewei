// The trading desk for one round: every player's account, their one open
// position, and the broker's rules, marked against a single shared price.
// It knows nothing of clocks or pages; the server feeds it prices and
// orders, and passes on the events it returns (margin calls, stop-outs).
//
// The rules are an offshore broker's, the kind the parody's heroine picks
// for its leverage: up to 1000x, a margin call at 50% margin level, a
// stop-out at 20%, and a "zero-cut" that wipes a negative balance but
// takes the player out of the market until the next round.

export const START = 1_000_000;
// A ladder a log-scale slider snaps to (ADR 0024): Japan's retail cap of
// Australia's 30× for major pairs is on it, offshore 1000× tops it.
export const LEVERAGES = [1, 2, 5, 10, 30, 50, 100, 200, 500, 1000];
// The whole spread as a fraction of the price: half on entry, half on exit.
export const SPREAD = 0.0002;
export const CALL = 0.5;
export const STOP_OUT = 0.2;
// A broke player (wiped out, or left with crumbs and nothing open) may
// borrow from Dad's savings, twice a round. It gets them back in the game
// but the debt comes off their result.
export const BORROW = 300_000;
export const LOANS = 2;
// A stop loss or take profit is set between 1% and 50% away (ADR 0033).
const inRange = (pct: number): boolean => pct >= 1 && pct <= 50;
export const BROKE = 100_000;

export type Side = 1 | -1;
export type Position = {
  side: Side;
  // What the position is worth at entry, in account money, and how many
  // units of the pair that bought; together they give the average entry.
  notional: number;
  units: number;
  entry: number;
  leverage: number;
  margin: number;
  // A stop loss and a take profit, as prices, or null (ADR 0032).
  stop: number | null;
  take: number | null;
  called: boolean;
};
// `out` is set by a forced cut, or a close that leaves nothing, and is
// cleared by a loan; `cuts`
// counts forced closes, so a page can tell when a new one happens;
// `traded` says whether the player placed an order this round at all;
// `left` that they walked out of it and only watch until the bell.
export type Account = { balance: number; debt: number; pos: Position | null; out: boolean; cuts: number; traded: boolean; left: boolean };
export type Fill = { kind: "open" | "add" | "close" | "stop" | "take" | "call" | "stopout" | "zerocut"; who: string; price: number; pnl: number; leverage?: number; side?: Side };

const half = SPREAD / 2;
// Players buy at the ask and sell at the bid.
const fill = (mid: number, side: Side): number => mid * (1 + side * half);
// The prices a sell and a buy fill at now, for a page to show.
export const quote = (mid: number): { bid: number; ask: number } => ({ bid: fill(mid, -1), ask: fill(mid, 1) });

export class Desk {
  price: number;
  private accounts = new Map<string, Account>();

  constructor(price: number) {
    this.price = price;
  }

  join(who: string): void {
    if (!this.accounts.has(who)) this.accounts.set(who, { balance: START, debt: 0, pos: null, out: false, cuts: 0, traded: false, left: false });
  }

  players(): string[] {
    return [...this.accounts.keys()];
  }

  account(who: string): Account {
    const account = this.accounts.get(who);
    if (!account) throw new Error(`no account for ${who}`);
    return account;
  }

  // What the open position would make if closed now, at the bid or ask.
  pnl(who: string, mid = this.price): number {
    const pos = this.account(who).pos;
    if (!pos) return 0;
    return pos.side * (pos.units * fill(mid, -pos.side as Side) - pos.notional);
  }

  equity(who: string): number {
    return this.account(who).balance + this.pnl(who);
  }

  used(who: string): number {
    return this.account(who).pos?.margin ?? 0;
  }

  free(who: string): number {
    return this.equity(who) - this.used(who);
  }

  // The prices at which an open position meets a margin call and the
  // forced loss cut: where equity falls to CALL or STOP_OUT of the margin.
  // Solving balance + pnl(mid) = level × margin for mid, spread included,
  // so they are the prices mark() acts at.
  lines(who: string): { call: number; cut: number } | null {
    const { balance, pos } = this.account(who);
    if (!pos) return null;
    const at = (level: number) => (pos.side * (level * pos.margin - balance) + pos.notional) / (pos.units * (1 - pos.side * half));
    return { call: at(CALL), cut: at(STOP_OUT) };
  }

  // Equity over margin in use; Infinity with nothing open.
  level(who: string): number {
    const used = this.used(who);
    return used ? this.equity(who) / used : Infinity;
  }

  // Buy (1) or sell (-1) with a share of free margin. An order against the
  // open position closes it: the desk keeps one position per player, so a
  // reversal takes two clicks and the second is a decision.
  // A stop loss and a take profit may ride on an order, as distances from
  // the price; they attach only if it opens a position (ADR 0032).
  order(who: string, side: Side, leverage: number, stake = 1, with_: { sl?: number | null; tp?: number | null } = {}): Fill[] | string {
    const account = this.account(who);
    if (account.left) return "You left this round. You can watch it to the bell.";
    if (account.out) return "You are out of the market until next round.";
    if (!LEVERAGES.includes(leverage)) return "No such leverage.";
    if (!(stake > 0 && stake <= 1)) return "Stake must be between 0 and 1.";
    if (with_.sl != null && !inRange(with_.sl)) return "A Stop Loss must be between 1% and 50% away.";
    if (with_.tp != null && !inRange(with_.tp)) return "A Take Profit must be between 1% and 50% away.";
    if (account.pos && account.pos.side !== side) return this.close(who);
    const margin = Math.floor(this.free(who) * stake);
    if (margin <= 0) return "No free margin left.";
    const notional = margin * leverage;
    const units = notional / fill(this.price, side);
    account.traded = true;
    const pos = account.pos;
    if (!pos) {
      const away = (pct: number | null | undefined, sign: number) => (pct == null ? null : this.price * (1 + (sign * pct) / 100));
      account.pos = { side, notional, units, entry: notional / units, leverage, margin, stop: away(with_.sl, -side), take: away(with_.tp, side), called: false };
      return [{ kind: "open", who, price: this.price, pnl: 0, leverage, side }];
    }
    // Adding to a position merges it, so the entry is the average paid.
    pos.notional += notional;
    pos.units += units;
    pos.entry = pos.notional / pos.units;
    pos.margin += margin;
    pos.leverage = Math.round(pos.notional / pos.margin);
    return [{ kind: "add", who, price: this.price, pnl: this.pnl(who), leverage: pos.leverage, side }];
  }

  // A stop `pct` percent from the current price on the losing side, or no
  // stop with null: what a player asks for, set from the desk's own price.
  stopAway(who: string, pct: number | null): string | null {
    if (pct !== null && !inRange(pct)) return "A Stop Loss must be between 1% and 50% away.";
    const pos = this.account(who).pos;
    return this.stop(who, pos && pct !== null ? this.price * (1 - (pos.side * pct) / 100) : null);
  }

  // A stop closes the position once the price reaches it, filling at that
  // price, which after a gap may be far past the stop.
  stop(who: string, at: number | null): string | null {
    const pos = this.account(who).pos;
    if (!pos) return "Open a position first.";
    if (at !== null && pos.side === 1 && at >= this.price) return "A long's Stop Loss must be below the price.";
    if (at !== null && pos.side === -1 && at <= this.price) return "A short's Stop Loss must be above the price.";
    pos.stop = at;
    return null;
  }

  // A take profit `pct` percent from the price on the winning side, or none
  // with null (ADR 0032).
  takeAway(who: string, pct: number | null): string | null {
    if (pct !== null && !inRange(pct)) return "A Take Profit must be between 1% and 50% away.";
    const pos = this.account(who).pos;
    return this.take(who, pos && pct !== null ? this.price * (1 + (pos.side * pct) / 100) : null);
  }

  // A take profit closes the position once the price reaches it, at that
  // price, or better if the price gaps past it.
  take(who: string, at: number | null): string | null {
    const pos = this.account(who).pos;
    if (!pos) return "Open a position first.";
    if (at !== null && pos.side === 1 && at <= this.price) return "A long's Take Profit must be above the price.";
    if (at !== null && pos.side === -1 && at >= this.price) return "A short's Take Profit must be below the price.";
    pos.take = at;
    return null;
  }

  // For the debug console (ADR 0019): move one account's position so its
  // margin level is `level` at the current price, without touching the
  // price everyone shares. The desk's own rules then act on it at the
  // next mark. Solving balance + pnl = level × margin for the units.
  rebase(who: string, level: number): boolean {
    const account = this.account(who);
    const pos = account.pos;
    if (!pos) return false;
    const exit = fill(this.price, -pos.side as Side);
    pos.units = (pos.side * (level * pos.margin - account.balance) + pos.notional) / exit;
    pos.entry = pos.notional / pos.units;
    return true;
  }

  // Wipe one account back to the start, for the debug console.
  reset(who: string): void {
    this.accounts.set(who, { balance: START, debt: 0, pos: null, out: false, cuts: 0, traded: false, left: false });
  }

  // Move the price and enforce the rules on every account, in join order.
  mark(price: number): Fill[] {
    this.price = price;
    return [...this.accounts.keys()].flatMap((who) => this.enforce(who));
  }

  // The broker's rules on one account at the current price.
  enforce(who: string): Fill[] {
    const pos = this.account(who).pos;
    if (!pos) return [];
    const price = this.price;
    // A gap through everything is a wipe-out, whatever stop was set.
    if (this.equity(who) <= 0) return [this.settleOne(who, "zerocut")];
    // The stop first: when one move crosses both, assume the worse (ADR 0032).
    if (pos.stop !== null && (pos.side === 1 ? price <= pos.stop : price >= pos.stop)) return [this.settleOne(who, "stop")];
    if (pos.take !== null && (pos.side === 1 ? price >= pos.take : price <= pos.take)) return [this.settleOne(who, "take")];
    const level = this.level(who);
    if (level <= STOP_OUT) return [this.settleOne(who, "stopout")];
    if (level <= CALL && !pos.called) {
      pos.called = true;
      return [{ kind: "call", who, price, pnl: this.pnl(who) }];
    }
    if (level > CALL) pos.called = false;
    return [];
  }

  close(who: string): Fill[] | string {
    return this.account(who).pos ? [this.settleOne(who, "close")] : "Nothing to close.";
  }

  private settleOne(who: string, kind: "close" | "stop" | "take" | "stopout" | "zerocut"): Fill {
    const account = this.account(who);
    const pnl = this.pnl(who);
    account.balance = Math.max(0, Math.round(account.balance + pnl));
    account.pos = null;
    // A forced cut ends the player's round (ADR 0026): what is left is kept,
    // but only a loan from Dad lets them trade again. A wipe-out does too.
    if (kind === "stopout" || kind === "zerocut") {
      account.cuts++;
      account.out = true;
    }
    if (account.balance === 0) account.out = true;
    return { kind, who, price: this.price, pnl };
  }

  broke(who: string): boolean {
    const account = this.account(who);
    return !account.pos && (account.out || account.balance < BROKE);
  }

  // Walk out of the round: anything open is closed at the price, and the
  // account takes no more orders or loans until the next round.
  leave(who: string): Fill[] | string {
    const account = this.account(who);
    if (account.left) return "You already left this round.";
    const fills = account.pos ? [this.settleOne(who, "close")] : [];
    account.left = true;
    return fills;
  }

  borrow(who: string): string | null {
    const account = this.account(who);
    if (account.left) return "You left this round. You can watch it to the bell.";
    if (!this.broke(who)) return "You still have money. For now.";
    if (account.debt >= BORROW * LOANS) return "Dad's savings are gone.";
    account.balance += BORROW;
    account.debt += BORROW;
    account.out = false;
    return null;
  }

  // Close everything at the last price and rank by balance less debt.
  settle(): { who: string; balance: number; net: number }[] {
    for (const [who, account] of this.accounts) if (account.pos) this.settleOne(who, "close");
    return [...this.accounts].map(([who, a]) => ({ who, balance: a.balance, net: a.balance - a.debt })).sort((a, b) => b.net - a.net);
  }
}
