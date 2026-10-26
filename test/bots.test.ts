import { describe, expect, it } from "vitest";
import { BOTS } from "../src/bots.ts";
import { Desk } from "../src/fx.ts";

// The house traders' habits have to be ones the desk lets them act out,
// or a parody is only a name.
const hana = BOTS.find((b) => b.id === "bot:kurumi")!;
const always = () => 0;

describe("Kurumi", () => {
  it("averages down on a losing position while she still has margin", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 30, 0.5);
    desk.mark(99);
    const action = hana.act(desk, hana.id, [100, 99], always);
    expect(action).toMatchObject({ kind: "order", side: 1 });
    const result = desk.order(hana.id, 1, (action as { leverage: number }).leverage, (action as { stake: number }).stake);
    expect(result).toMatchObject([{ kind: "add" }]);
  });

  it("prays when there is nothing left to add", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 100);
    desk.mark(99.6);
    expect(hana.act(desk, hana.id, [100, 99.6], always)).toEqual({ kind: "pray" });
  });

  it("borrows from Dad once she is broke", () => {
    const desk = new Desk(100);
    desk.join(hana.id);
    desk.order(hana.id, 1, 1000);
    desk.mark(90);
    expect(desk.account(hana.id).out).toBe(true);
    expect(hana.act(desk, hana.id, [100, 90], always)).toEqual({ kind: "borrow" });
  });
});

// The later chapters' three, each the habit the comic gives her.
const by = (id: string) => BOTS.find((b) => b.id === id)!;

describe("Sakata Inago", () => {
  it("jumps on a big move, the way it went, at high leverage", () => {
    const inago = by("bot:inago");
    const desk = new Desk(100);
    desk.join(inago.id);
    const up = [100, 100, 100, 100, 100, 100.2, 100.5, 101];
    expect(inago.act(desk, inago.id, up, always)).toMatchObject({ kind: "order", side: 1, leverage: expect.any(Number) });
    expect((inago.act(desk, inago.id, up, always) as { leverage: number }).leverage).toBeGreaterThanOrEqual(100);
    expect(inago.act(desk, inago.id, [100, 100, 100, 100, 100, 100, 100, 100], always)).toBeNull();
  });
});

describe("Zenba Nana", () => {
  it("only ever buys, at 1×, and holds", () => {
    const nana = by("bot:nana");
    const desk = new Desk(100);
    desk.join(nana.id);
    expect(nana.act(desk, nana.id, [100, 90], always)).toEqual({ kind: "order", side: 1, leverage: 1, stake: expect.any(Number) });
    desk.order(nana.id, 1, 1, 0.5);
    desk.mark(80);
    expect(nana.act(desk, nana.id, [100, 80], always)).toBeNull();
  });
});

describe("Tsukimori Kizuna", () => {
  it("adds to a winner, chasing a billion", () => {
    const kizuna = by("bot:kizuna");
    const desk = new Desk(100);
    desk.join(kizuna.id);
    desk.order(kizuna.id, 1, 100, 0.3);
    desk.mark(100.3);
    expect(kizuna.act(desk, kizuna.id, [100, 100.3], always)).toMatchObject({ kind: "order", side: 1 });
  });
});

// ADR 0032: Mochiko, the disciplined one, opens with a stop loss and a take
// profit attached, so she never holds a trade without both exits.
describe("Mochiko", () => {
  it("opens with a stop loss and a take profit attached", () => {
    const mochiko = BOTS.find((b) => b.id === "bot:mochiko")!;
    const desk = new Desk(100);
    desk.join(mochiko.id);
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 0.05);
    const action = mochiko.act(desk, mochiko.id, rising, () => 0) as { kind: string; sl?: number; tp?: number };
    expect(action).toMatchObject({ kind: "order", side: 1 });
    expect(action.sl).toBeGreaterThan(0);
    expect(action.tp).toBeGreaterThan(action.sl!);
    const result = desk.order(mochiko.id, 1, 10, 0.6, { sl: action.sl, tp: action.tp });
    expect(result).toMatchObject([{ kind: "open" }]);
    const pos = desk.account(mochiko.id).pos!;
    expect(pos.stop).not.toBeNull();
    expect(pos.take).not.toBeNull();
  });
});

// A bot's refused order is only a bot doing nothing, so a leverage that
// leaves the ladder would silence her without a sound (ADR 0033). Run each
// bot through many situations and require every order it makes to stand.
describe("every bot's orders", () => {
  it("use a leverage the broker offers, and an exit it accepts", async () => {
    const { LEVERAGES } = await import("../src/fx.ts");
    for (const bot of BOTS) {
      for (let seed = 1; seed <= 200; seed++) {
        let x = seed;
        const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
        const desk = new Desk(100);
        desk.join(bot.id);
        const prices = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3 + seed) * 3 + (seed % 2 ? i : -i) * 0.05);
        for (let i = 20; i < prices.length; i++) {
          desk.mark(prices[i]);
          const a = bot.act(desk, bot.id, prices.slice(0, i + 1), rnd);
          if (a?.kind !== "order") continue;
          expect(LEVERAGES, `${bot.id} seed ${seed}`).toContain(a.leverage);
          const out = desk.order(bot.id, a.side, a.leverage, a.stake, { sl: a.sl, tp: a.tp });
          // Being out of the market, or short of margin, is the round's doing;
          // a refusal about the order itself is the bot's.
          if (typeof out === "string") expect(out, `${bot.id} seed ${seed}`).toMatch(/out of the market|No free margin|left this round/);
        }
      }
    }
  });
});
