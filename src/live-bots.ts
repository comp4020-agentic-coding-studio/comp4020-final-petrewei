// The house traders in Live (ADR 0095, 0097): each of the comic's seven plays its own habit on a real pair it favours,
// as a real Live player: its own saved account, on the board beside people, bankrupt in the end and back at the next
// Sydney midnight like anyone. Each bot's strategy was written for a round's one-pair desk, so a small view of its
// Live account on its pair answers what the strategy asks, and what it chooses is sent through Live's own action, the
// one a page sends, so a bot bends no rule a person cannot.
import { BOTS, type Action } from "./bots.ts";
import { type BookAccount, equity, level, pnlOf, used } from "./book.ts";
import { cross, type Usd } from "./feed.ts";
import { BROKE, type Desk } from "./fx.ts";

// Each bot's pair, by its habit: Kurumi and Kizuna chase the yen carry trade, Mochiko and Inago the big majors, Yasuko
// shorts the euro, Mebuki keeps to the franc, Nana to the Australian dollar at home.
export const PAIRS: Record<string, string> = {
  "bot:kurumi": "AUD/JPY", "bot:kizuna": "GBP/JPY", "bot:mochiko": "EUR/USD", "bot:inago": "USD/JPY",
  "bot:yasuko": "EUR/GBP", "bot:mebuki": "USD/CHF", "bot:nana": "AUD/USD",
};
// How many recent prices a bot reads, as many as its habits look back.
const SEEN = 40;

export type LiveSide = {
  // a bot's Live account, or null while it waits for the next Sydney midnight after a bankruptcy
  account: (bot: string) => BookAccount | null;
  // Live's own action, as a page sends it; answers null or a refusal
  act: (bot: string, input: Record<string, unknown>) => string | null;
};

// What a bot's strategy reads of a round's desk, answered from its Live account on its own pair.
function deskOf(a: BookAccount, pair: string, usd: Usd): Desk {
  const pos = a.positions[pair];
  const view = {
    account: () => ({ balance: a.balance, debt: a.debt, out: false, pos: pos ? { side: pos.side, leverage: pos.leverage, margin: pos.margin, entry: pos.entry } : null }),
    pnl: () => (pos ? pnlOf(pos, pair, usd) : 0),
    free: () => equity(a, usd) - used(a),
    level: () => (used(a) ? level(a, usd) : Infinity),
    broke: () => !pos && a.balance < BROKE,
  };
  return view as unknown as Desk;
}

// A strategy's choice as the action a page would send for that pair; praying has no place in Live.
function inputOf(action: Action, pair: string): Record<string, unknown> | null {
  switch (action.kind) {
    case "order": return { kind: action.side === 1 ? "buy" : "sell", pair, leverage: action.leverage, share: action.share ?? 1, sl: action.sl ?? null, tp: action.tp ?? null };
    case "close": return { kind: "close", pair };
    case "borrow": return { kind: "borrow", pair };
    case "repay": return { kind: "repay", pair };
    case "stop": return { kind: "stop", pair, pct: action.pct ?? null };
    case "take": return { kind: "take", pair, pct: action.pct ?? null };
    case "pend": return { kind: "pend", pair, side: action.side, at: action.at, leverage: action.leverage, share: action.share, sl: action.sl ?? null, tp: action.tp ?? null };
    case "unpend": return { kind: "unpend", pair };
    default: return null;
  }
}

export class LiveBots {
  private prices = new Map<string, number[]>();
  private rnd: () => number;
  constructor(rnd: () => number = Math.random) {
    this.rnd = rnd;
  }

  // One beat: each bot reads its pair's recent prices and its own Live account, and does at most one thing, through
  // Live's own action. A bot waiting out a bankruptcy does nothing until its account opens again.
  step(usd: Usd, live: LiveSide): void {
    for (const b of BOTS) {
      const pair = PAIRS[b.id];
      if (!pair) continue;
      const seen = [...(this.prices.get(b.id) ?? []), cross(usd, pair)].slice(-SEEN);
      this.prices.set(b.id, seen);
      const a = live.account(b.id);
      if (!a) continue;
      const action = b.act(deskOf(a, pair, usd), b.id, seen, this.rnd);
      const input = action && inputOf(action, pair);
      if (input) live.act(b.id, { mode: "live", ...input });
    }
  }
}
