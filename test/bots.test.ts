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
    desk.order(hana.id, 1, 25, 0.5);
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
