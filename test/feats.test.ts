import { describe, expect, it } from "vitest";
import { FEATS, fromBell, fromCredit, fromFill } from "../src/feats.ts";
import { Desk } from "../src/fx.ts";
import { T } from "../public/i18n.js";

// ADR 0082: achievements, awarded by the server from what the desk did. Each rule reads the desk's own fills, so a
// page can claim none of them.
const fill = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, who: "a", price: 100, pnl: 0, ...extra }) as Parameters<typeof fromFill>[0];

describe("achievements", () => {
  it("names each in every language, with a hint for the ones not yet earned", () => {
    for (const lang of ["en", "ja", "zh"] as const) {
      expect(Object.keys(T[lang].ui.feats as unknown as object).sort(), lang).toEqual([...FEATS].sort());
      const words = T[lang].ui.feats as unknown as Record<string, string[]>;
      for (const f of FEATS) expect(words[f].every((w) => w.length > 0), `${lang} ${f}`).toBe(true);
    }
  });
  it("awards the first close, a win, and a win held through a margin call", () => {
    expect(fromFill(fill("close", { pnl: -5 }), false)).toEqual(["first"]);
    expect(fromFill(fill("take", { pnl: 5 }), false)).toEqual(["first", "win"]);
    expect(fromFill(fill("close", { pnl: 5 }), true)).toEqual(["first", "win", "diamond"]);
  });
  it("awards a forced cut and a wipe-out, each as itself", () => {
    expect(fromFill(fill("stopout", { pnl: -5 }), true)).toContain("cut");
    expect(fromFill(fill("zerocut", { pnl: -5 }), true)).toContain("void");
  });
  it("awards a pending order's fill and a 1000× order, but not a click at less", () => {
    expect(fromFill(fill("open", { pending: true, leverage: 10 }), false)).toEqual(["patient"]);
    expect(fromFill(fill("open", { leverage: 1000 }), false)).toEqual(["maxLev"]);
    expect(fromFill(fill("open", { leverage: 300 }), false)).toEqual([]);
  });
  it("awards credit drawn, and repaid only to nothing", () => {
    expect(fromCredit("borrow", 100_000)).toEqual(["credit"]);
    expect(fromCredit("repay", 125)).toEqual([]);
    expect(fromCredit("repay", 0)).toEqual(["debtFree"]);
  });
  it("awards at the bell a bankruptcy, a replay ended up, and a replay's year named", () => {
    expect(fromBell({ replay: false, net: -1, start: 1, yearRight: false })).toEqual(["bankrupt"]);
    expect(fromBell({ replay: true, net: 2, start: 1, yearRight: true })).toEqual(["swan", "historian"]);
    expect(fromBell({ replay: false, net: 2, start: 1, yearRight: false })).toEqual([]);
  });
  it("tells a held margin call from the desk's own fills, and a pending fill from a click", () => {
    const desk = new Desk(100);
    desk.join("a");
    desk.order("a", 1, 1000);
    desk.mark(99.965);
    desk.mark(100.2);
    const [closed] = desk.close("a") as ReturnType<Desk["mark"]>;
    expect(closed.called, "the call is remembered after the level recovers").toBe(true);
    desk.pend("a", { side: 1, at: 99, leverage: 10, stake: 0.5 });
    const [opened] = desk.mark(98.9);
    expect(opened).toMatchObject({ kind: "open", pending: true });
  });
});
