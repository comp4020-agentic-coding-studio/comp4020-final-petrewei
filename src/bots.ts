// The house traders, so one person can play a round and a crowd has
// someone to laugh at. Each is a character from the comic, by family and
// given name, playing the retail-trader habit the comic gives her (ADRs
// 0015 and 0018); never Kurumi's father or mother. The page shows their
// names and mottos in its own language. A bot looks at
// its own account and the recent prices and returns at most one action.
import type { Desk, Side } from "./fx.ts";

export type Action = { kind: "order"; side: Side; leverage: number; stake?: number } | { kind: "close" } | { kind: "stop"; pct: number | null } | { kind: "pray" } | { kind: "borrow" };
export type Bot = { id: string; name: string; motto: string; act: (desk: Desk, me: string, prices: number[], rnd: () => number) => Action | null };

const trend = (prices: number[], n: number): number => (prices.length > n ? prices.at(-1)! / prices.at(-1 - n)! - 1 : 0);

export const BOTS: Bot[] = [
  {
    // Kurumi: a stop-loss is admitting defeat. Buys every dip with absurd
    // leverage, averages down while there is margin, prays, borrows.
    id: "bot:kurumi",
    name: "Fukuga Kurumi",
    motto: "It's okay, I've got leverage~♪",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      if (desk.broke(me)) return rnd() < 0.1 ? { kind: "borrow" } : null;
      if (!pos) return rnd() < 0.15 ? { kind: "order", side: trend(prices, 9) < 0 ? 1 : -1, leverage: rnd() < 0.5 ? 500 : 1000, stake: 0.5 } : null;
      if (desk.pnl(me) >= 0) return null;
      if (desk.free(me) > 0) return rnd() < 0.3 ? { kind: "order", side: pos.side, leverage: pos.leverage, stake: 1 } : null;
      if (desk.level(me) < 0.8) return { kind: "pray" };
      return null;
    },
  },
  {
    // Mochiko: cold and rational. Follows the trend at modest leverage,
    // always with a tight stop.
    id: "bot:mochiko",
    name: "Kogane Mochiko",
    motto: "A stable market is a trader's enemy.",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      const t = trend(prices, 18);
      if (!pos) {
        if (Math.abs(t) < 0.002 || rnd() > 0.2) return null;
        return { kind: "order", side: t > 0 ? 1 : -1, leverage: 10, stake: 0.6 };
      }
      if (pos.stop === null) return { kind: "stop", pct: 0.4 };
      if (desk.pnl(me) > pos.margin * 0.3) return { kind: "close" };
      return null;
    },
  },
  {
    // Yasuko: burned once already, so she only ever sells, and holds.
    id: "bot:yasuko",
    name: "Takane Yasuko",
    motto: "I've seen how this ends. It goes down.",
    act(desk, me, _prices, rnd) {
      if (!desk.account(me).pos && rnd() < 0.05) return { kind: "order", side: -1, leverage: 25, stake: 0.7 };
      return null;
    },
  },
  {
    // Mebuki: trades so she never has to work. Buys the high-yielder for
    // the interest and never sells.
    id: "bot:mebuki",
    name: "Yamashi Mebuki",
    motto: "I just don't want to work. The interest can do it.",
    act(desk, me, _prices, rnd) {
      const pos = desk.account(me).pos;
      if (!pos && rnd() < 0.1) return { kind: "order", side: 1, leverage: 25, stake: 0.5 };
      if (pos && desk.pnl(me) < -pos.margin * 0.3 && rnd() < 0.05) return { kind: "order", side: 1, leverage: 25, stake: 1 };
      return null;
    },
  },
  {
    // Inago: from the later chapters, a new hire from the countryside. Her
    // name is the locust of イナゴトレード: she swarms onto any big move,
    // the way it went, at high leverage, and flees at the first loss.
    id: "bot:inago",
    name: "Sakata Inago",
    motto: "Everyone's buying! Me too!",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      const t = trend(prices, 3);
      if (!pos) return Math.abs(t) > 0.003 && rnd() < 0.5 ? { kind: "order", side: t > 0 ? 1 : -1, leverage: 500, stake: 0.5 } : null;
      return desk.pnl(me) < 0 ? { kind: "close" } : null;
    },
  },
  {
    // Nana, "Banana": saw Yasuko's losscut at school and calls FX hell.
    // She will only buy what she believes in, unleveraged, and hold it.
    id: "bot:nana",
    name: "Zenba Nana",
    motto: "FX is hell. I just buy what I believe in.",
    act(desk, me, _prices, rnd) {
      if (!desk.account(me).pos && rnd() < 0.05) return { kind: "order", side: 1, leverage: 1, stake: 0.8 };
      return null;
    },
  },
  {
    // Kizuna: three months into a sales job and chasing a billion yen.
    // Adds to every winner and lets the losers run.
    id: "bot:kizuna",
    name: "Tsukimori Kizuna",
    motto: "A billion yen, then I quit. Want in?",
    act(desk, me, prices, rnd) {
      const pos = desk.account(me).pos;
      if (!pos) return rnd() < 0.1 ? { kind: "order", side: trend(prices, 9) >= 0 ? 1 : -1, leverage: 100, stake: 0.3 } : null;
      if (desk.pnl(me) > 0 && desk.free(me) > 0) return rnd() < 0.4 ? { kind: "order", side: pos.side, leverage: pos.leverage, stake: 0.3 } : null;
      return null;
    },
  },
];
