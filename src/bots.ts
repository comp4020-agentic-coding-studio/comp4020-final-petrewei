// The house traders, so one person can play a round and a crowd has
// someone to laugh at. Each is an original parody of a retail-trader
// habit the comic satirises; none is a character from it. A bot looks at
// its own account and the recent prices and returns at most one action.
import { Desk, type Side } from "./fx.ts";

export type Action = { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; at: number } | { kind: "pray" } | { kind: "borrow" };
export type Bot = { id: string; name: string; motto: string; act: (desk: Desk, me: string, prices: number[], rnd: () => number) => Action | null };

const trend = (prices: number[], n: number): number => (prices.length > n ? prices.at(-1)! / prices.at(-1 - n)! - 1 : 0);

export const BOTS: Bot[] = [
  {
    // Buys every dip with absurd leverage, never cuts, averages down, prays.
    id: "bot:hana",
    name: "Hana All-In",
    motto: "Leverage fixes everything~♪",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      if (desk.account(me).out) return rnd() < 0.1 ? { kind: "borrow" } : null;
      if (!pos) return rnd() < 0.15 ? { kind: "order", side: trend(prices, 9) < 0 ? 1 : -1, leverage: rnd() < 0.5 ? 400 : 1000, stake: 0.5 } : null;
      if (desk.pnl(me) < 0 && desk.level(me) < 0.8) return rnd() < 0.3 ? { kind: "order", side: pos.side, leverage: 1000, stake: 1 } : { kind: "pray" };
      return null;
    },
  },
  {
    // Follows the trend at modest leverage, always with a tight stop.
    id: "bot:rei",
    name: "Rei Glacier",
    motto: "Cut the loss. Feelings are a spread you pay.",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      const t = trend(prices, 18);
      if (!pos) {
        if (Math.abs(t) < 0.002 || rnd() > 0.2) return null;
        return { kind: "order", side: t > 0 ? 1 : -1, leverage: 10, stake: 0.6 };
      }
      if (pos.stop === null) return { kind: "stop", at: desk.price * (1 - pos.side * 0.004) };
      if (desk.pnl(me) > pos.margin * 0.3) return { kind: "close" };
      return null;
    },
  },
  {
    // Only ever sells, and holds, because the end is always near.
    id: "bot:natsu",
    name: "Natsu Shortwell",
    motto: "Everything goes down eventually. I can wait.",
    act(desk, me, _prices, rnd) {
      if (!desk.account(me).pos && rnd() < 0.05) return { kind: "order", side: -1, leverage: 25, stake: 0.7 };
      return null;
    },
  },
  {
    // The housewife carry trader: buys the high-yielder and never sells.
    id: "bot:carry",
    name: "Mrs Carry",
    motto: "The interest pays for dinner. What could go wrong?",
    act(desk, me, _prices, rnd) {
      const pos = desk.account(me).pos;
      if (!pos && rnd() < 0.1) return { kind: "order", side: 1, leverage: 25, stake: 0.5 };
      if (pos && desk.pnl(me) < -pos.margin * 0.3 && rnd() < 0.05) return { kind: "order", side: 1, leverage: 25, stake: 1 };
      return null;
    },
  },
];
