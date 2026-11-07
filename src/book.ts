// Live's accounts (ADR 0087): one Australian-dollar account per player, held across days until it goes bankrupt,
// with one position per pair, as a real FX account has. Every position's profit is in its pair's quote currency and
// counts in dollars at the rate now. The broker's rules act on the whole account: a margin call at 50% of the margin in
// use and a stop-out at 20%, which closes everything. The fee and the credit's interest are charged each fifteen
// minutes of real time, the game's tick, so a night's position pays a night's fee.
import { CALL, DISTANCES, feeRate, LEVERAGES, LIMIT, SPREAD, STEP, START, STOP_OUT, dailyRate, type Side } from "./fx.ts";
import { convert, type Currency, type Usd, cross } from "./feed.ts";
import { shareMargin } from "../public/ticket.js";

const half = SPREAD / 2;
const fill = (mid: number, side: Side): number => mid * (1 + side * half);
export const SLOTS_A_DAY = 96;
// Under this much net worth, with nothing open, an account is bankrupt: too little to trade, and borrowing adds as much
// debt as cash, so it cannot be saved.
export const BUST = 100;

export type BookPosition = { side: Side; units: number; entry: number; margin: number; leverage: number; stop: number | null; take: number | null; fees: number; opened: number };
export type BookTrade = { pair: string; side: Side; leverage: number; entry: number; exit: number; how: "close" | "stop" | "take" | "stopout"; pnl: number; pct: number; at: number };
export type BookAccount = { balance: number; debt: number; interest: number; positions: Record<string, BookPosition>; called: boolean; cuts: number; trades: BookTrade[]; opened: number; peak: number; slot: number; pair: string };
export type BookFill = { kind: "open" | "add" | "close" | "stop" | "take" | "call" | "stopout"; pair: string; price: number; pnl: number; leverage?: number; side?: Side };

export const fresh = (now: number, slot: number, pair = "AUD/USD"): BookAccount => ({ balance: START, debt: 0, interest: 0, positions: {}, called: false, cuts: 0, trades: [], opened: now, peak: START, slot, pair });

const quoteOf = (pair: string) => pair.split("/")[1] as Currency;
const baseOf = (pair: string) => pair.split("/")[0] as Currency;

// A position's result in dollars at these rates, closed at the bid or ask, its fees taken.
export function pnlOf(pos: BookPosition, pair: string, usd: Usd): number {
  const mid = cross(usd, pair);
  return pos.side * pos.units * (fill(mid, -pos.side as Side) - pos.entry) * convert(usd, quoteOf(pair), "AUD") - pos.fees;
}
export const openPnl = (a: BookAccount, usd: Usd): number => Object.entries(a.positions).reduce((n, [p, pos]) => n + pnlOf(pos, p, usd), 0);
export const equity = (a: BookAccount, usd: Usd): number => a.balance + openPnl(a, usd);
export const used = (a: BookAccount): number => Object.values(a.positions).reduce((n, p) => n + p.margin, 0);
export const level = (a: BookAccount, usd: Usd): number => (used(a) ? equity(a, usd) / used(a) : Infinity);
export const worth = (a: BookAccount, usd: Usd): number => equity(a, usd) - a.debt;

// Where one pair's price would bring the whole account to a margin call and a stop-out, every other currency's dollar
// rate as it is now. The pair's price moves its quote currency's worth in dollars too, so the line is found by halving
// the range, from the account's own equity, not by a formula that would hold that worth still.
export function lines(a: BookAccount, pair: string, usd: Usd): { call: number; cut: number } | null {
  const pos = a.positions[pair];
  if (!pos) return null;
  const base = baseOf(pair);
  const quote = quoteOf(pair);
  // the pair's price times f: the base's dollar rate times f, or, for a pair priced in dollars of the base, the quote's over f
  const at = (f: number): Usd => (base !== "USD" ? { ...usd, [base]: usd[base] * f } : { ...usd, [quote]: usd[quote] / f });
  const mid = cross(usd, pair);
  const find = (target: number): number => {
    // against the position: down for a long, up for a short; the level falls the further it goes
    let near = 0;
    let far = Math.log(pos.side === 1 ? 1e-3 : 1e3);
    if (level(a, at(Math.exp(far))) > target) return NaN;
    for (let i = 0; i < 60; i++) {
      const m = (near + far) / 2;
      if (level(a, at(Math.exp(m))) > target) near = m;
      else far = m;
    }
    return mid * Math.exp((near + far) / 2);
  };
  const call = find(CALL);
  const cut = find(STOP_OUT);
  return { call: Number.isFinite(call) ? call : (null as unknown as number), cut: Number.isFinite(cut) ? cut : (null as unknown as number) };
}

function settle(a: BookAccount, pair: string, usd: Usd, how: BookTrade["how"], now: number): BookFill {
  const pos = a.positions[pair];
  const pnl = pnlOf(pos, pair, usd);
  const mid = cross(usd, pair);
  a.trades.push({ pair, side: pos.side, leverage: pos.leverage, entry: pos.entry, exit: fill(mid, -pos.side as Side), how, pnl: Math.round(pnl), pct: pnl / pos.margin, at: now });
  a.trades = a.trades.slice(-50);
  a.balance += pnl;
  delete a.positions[pair];
  // Losses still offset the rest of the portfolio until the final position closes.
  if (!Object.keys(a.positions).length) a.balance = Math.max(0, Math.round(a.balance));
  return { kind: how, pair, price: mid, pnl };
}

// An order on one pair: `share` of net worth as margin, cut to what is free; against an open position it closes it.
export function order(a: BookAccount, pair: string, usd: Usd, side: Side, leverage: number, share: number, exits: { sl?: number | null; tp?: number | null }, now: number): BookFill[] | string {
  if (!LEVERAGES.includes(leverage)) return "No such leverage.";
  if (!(share > 0 && share <= 1)) return "Margin must be between 0 and 1.";
  for (const [d, name] of [[exits.sl, "Stop Loss"], [exits.tp, "Take Profit"]] as const) if (d != null && !DISTANCES.includes(d)) return `A ${name} must be 1%, 2%, 5%, 10%, 20% or 50% away.`;
  const pos = a.positions[pair];
  if (pos && pos.side !== side) return [settle(a, pair, usd, "close", now)];
  const margin = shareMargin(equity(a, usd), used(a), share);
  if (margin <= 0) return "No free margin left.";
  const mid = cross(usd, pair);
  const price = fill(mid, side);
  // the dollars it controls, in units of the pair's base currency
  const units = (margin * leverage) / convert(usd, baseOf(pair), "AUD");
  if (!pos) {
    const away = (pct: number | null | undefined, sign: number) => (pct == null ? null : mid * (1 + (sign * pct) / 100));
    a.positions[pair] = { side, units, entry: price, margin, leverage, stop: away(exits.sl, -side), take: away(exits.tp, side), fees: 0, opened: now };
    return [{ kind: "open", pair, price: mid, pnl: 0, leverage, side }];
  }
  pos.entry = (pos.entry * pos.units + price * units) / (pos.units + units);
  pos.units += units;
  pos.margin += margin;
  // the merged position's leverage is what it controls over its margin, read at the nearest rung
  const merged = (pos.leverage * (pos.margin - margin) + leverage * margin) / pos.margin;
  pos.leverage = LEVERAGES.reduce((b, r) => (Math.abs(Math.log(r / merged)) < Math.abs(Math.log(b / merged)) ? r : b));
  return [{ kind: "add", pair, price: mid, pnl: pnlOf(pos, pair, usd), leverage: pos.leverage, side }];
}

export function close(a: BookAccount, pair: string, usd: Usd, now: number): BookFill[] | string {
  return a.positions[pair] ? [settle(a, pair, usd, "close", now)] : "Nothing to close.";
}

// A stop or take profit on an open position, a distance from the price now, or none.
export function exit(a: BookAccount, pair: string, usd: Usd, kind: "stop" | "take", pct: number | null): string | null {
  const pos = a.positions[pair];
  if (!pos) return "Open a position first.";
  if (pct !== null && !DISTANCES.includes(pct)) return `A ${kind === "stop" ? "Stop Loss" : "Take Profit"} must be 1%, 2%, 5%, 10%, 20% or 50% away.`;
  const mid = cross(usd, pair);
  const sign = kind === "stop" ? -pos.side : pos.side;
  pos[kind] = pct === null ? null : mid * (1 + (sign * pct) / 100);
  return null;
}

// The broker's rules at these rates: each position's stop and take profit, then the account's margin level.
export function enforce(a: BookAccount, usd: Usd, now: number): BookFill[] {
  const fills: BookFill[] = [];
  for (const [pair, pos] of Object.entries(a.positions)) {
    const mid = cross(usd, pair);
    if (pos.stop !== null && (pos.side === 1 ? mid <= pos.stop : mid >= pos.stop)) fills.push(settle(a, pair, usd, "stop", now));
    else if (pos.take !== null && (pos.side === 1 ? mid >= pos.take : mid <= pos.take)) fills.push(settle(a, pair, usd, "take", now));
  }
  const lvl = level(a, usd);
  if (lvl <= STOP_OUT) {
    // the stop-out closes everything, the worst first
    const worst = Object.keys(a.positions).sort((x, y) => pnlOf(a.positions[x], x, usd) - pnlOf(a.positions[y], y, usd));
    for (const pair of worst) fills.push(settle(a, pair, usd, "stopout", now));
    a.cuts++;
    a.called = false;
  } else if (lvl <= CALL && !a.called) {
    a.called = true;
    fills.push({ kind: "call", pair: "", price: 0, pnl: openPnl(a, usd) });
  } else if (lvl > CALL) a.called = false;
  a.peak = Math.max(a.peak, Math.round(worth(a, usd)));
  return fills;
}

// A fifteen-minute slot gone by: each position pays its fee, and what is owed its interest.
export function charge(a: BookAccount): void {
  for (const pos of Object.values(a.positions)) pos.fees += pos.margin * feeRate(pos.leverage);
  if (a.debt > 0) {
    const due = (a.debt * dailyRate(a.debt)) / SLOTS_A_DAY;
    a.debt += due;
    a.interest += due;
  }
}

export function borrow(a: BookAccount): string | null {
  const room = Math.floor(LIMIT - a.debt);
  if (room <= 0) return "Your credit line is used up.";
  const take = Math.min(STEP, room);
  a.balance += take;
  a.debt += take;
  return null;
}
export function repay(a: BookAccount): string | null {
  if (a.debt <= 0) return "You owe nothing.";
  const pay = Math.min(STEP, Math.ceil(a.debt), Math.floor(a.balance - used(a)));
  if (pay <= 0) return "You have no free cash to repay with.";
  a.balance -= pay;
  a.debt = Math.max(0, a.debt - pay);
  return null;
}

export const bankrupt = (a: BookAccount, usd: Usd): boolean => !Object.keys(a.positions).length && worth(a, usd) < BUST;

// The next midnight in Sydney after `now`, when a bankrupt player's new account opens.
export function nextSydneyMidnight(now: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const sinceMidnight = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + (now % 1000);
  // a day ahead of today's midnight; a daylight-saving change that night is an hour either way, then corrected
  let at = now - sinceMidnight + 86_400_000;
  const h = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "2-digit", hourCycle: "h23" }).format(new Date(at)));
  if (h === 23) at += 3_600_000;
  else if (h === 1) at -= 3_600_000;
  return at;
}
