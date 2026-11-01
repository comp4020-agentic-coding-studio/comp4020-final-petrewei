import { afterEach, expect, it } from "vitest";
import { BORROW, START } from "../src/fx.ts";
import { CAUGHT_COST, CUT_COST, LOAN_COST } from "../src/score.ts";
import { client } from "../spec/helpers.ts";
import { server, type Server } from "./server.ts";

let s: Server;
afterEach(() => s?.stop());
type Debrief = { beforeFees: number; financing: number; balance: number; debt: number; net: number; returnPct: number; cuts: number; loans: number; caught: number; cutPenalty: number; loanPenalty: number; caughtPenalty: number; bonus: number; score: number };
type Bell = { result: { debrief: Debrief | null; ranking: { you: boolean; balance: number; score: number }[] } };

it("gives each player a private bell breakdown that reconciles money, fees, loans and the ranked score", async () => {
  s = await server(8191, { TICK_MS: "50", COUNTDOWN_TICKS: "1" });
  const c = client(s.base);
  const me = await c.visitor();
  const watcher = await c.visitor();
  const tabs = [await c.page(me), await c.page(watcher)];
  try {
    await c.act(me, { kind: "start" });
    expect(await tabs[0].next((e) => e.phase === "trade", 2000)).not.toBeNull();
    // Mark enough financing to survive rounding to whole account yen.
    const bought = await c.act(me, { kind: "buy", leverage: 30 });
    expect(bought.status, JSON.stringify(await bought.clone().json())).toBe(200);
    expect(await tabs[0].next((e) => Number(e.tick) >= 5, 5000), "five ticks pass while the position is open").not.toBeNull();
    // A replay opens on a day the market broke, so the price may already have cut this position
    // (a 30x one in a few ticks): the market's verdict is a way the round can go, and the
    // breakdown must reconcile either way. Only a refusal that is not "nothing to close" is wrong.
    const closed = await c.act(me, { kind: "close" });
    if (closed.status !== 200) expect((await closed.json()).error, "close was refused for another reason").toBe("Nothing to close.");
    expect((await c.act(me, { kind: "finish" })).status).toBe(200);
    const bell = await c.state(me) as unknown as Bell;
    const d = bell.result.debrief!;
    expect(d).toBeTruthy();
    // financing is charged each tick the position is open, so it is there unless the market cut
    // the position before its first whole yen
    if (d.cuts === 0) expect(d.financing).toBeGreaterThan(0);
    expect(d.balance - d.debt).toBe(d.net);
    expect(START + d.beforeFees - d.financing).toBe(d.net);
    expect(d.returnPct).toBeCloseTo((d.net / START - 1) * 100);
    expect(d.cutPenalty).toBe(d.cuts * CUT_COST);
    expect(d.loanPenalty).toBe(d.loans * LOAN_COST);
    expect(d.caughtPenalty).toBe(d.caught * CAUGHT_COST);
    expect(d.debt).toBe(d.loans * BORROW);
    expect(d.score).toBeCloseTo(Math.round((d.returnPct - d.cutPenalty - d.loanPenalty - d.caughtPenalty + d.bonus) * 10) / 10);
    expect(bell.result.ranking.find((r) => r.you)).toMatchObject({ balance: d.net, score: d.score });
    expect((await c.state(watcher) as unknown as Bell).result.debrief).toBeNull();
    expect(bell.result.ranking.every((r) => !("financing" in r) && !("debrief" in r))).toBe(true);
    expect(JSON.stringify(await c.state(watcher))).not.toContain(me.slice(2));
  } finally {
    tabs.forEach((t) => t.close());
  }
});

it("explains a forced cut and a discovered loan without deducting the loan twice", async () => {
  const debugKey = "debrief-test-only";
  s = await server(8191, { TICK_MS: "100", COUNTDOWN_TICKS: "1", STATS_KEY: debugKey });
  const c = client(s.base);
  const me = await c.visitor();
  const enabled = await fetch(`${s.base}/?debug=${debugKey}`, { headers: { cookie: me } });
  const debugCookie = enabled.headers.get("set-cookie")!.match(/dbg=[^;]+/)![0];
  const tab = await c.page(me);
  try {
    await c.act(me, { kind: "start" });
    expect(await tab.next((e) => e.phase === "trade", 2000)).not.toBeNull();
    await c.act(me, { kind: "buy", leverage: 30 });
    const cut = await fetch(`${s.base}/api/debug`, { method: "POST", headers: { cookie: `${me}; ${debugCookie}`, "content-type": "application/json" }, body: JSON.stringify({ kind: "cut", mode: "replay" }) });
    expect(cut.status).toBe(200);
    expect((await c.act(me, { kind: "borrow" })).status).toBe(200);
    await c.act(me, { kind: "finish" });
    const d = (await c.state(me) as unknown as Bell).result.debrief!;
    expect(d).toMatchObject({ cuts: 1, loans: 1, caught: 1, debt: BORROW, cutPenalty: CUT_COST, loanPenalty: LOAN_COST, caughtPenalty: CAUGHT_COST });
    expect(d.net).toBe(d.balance - BORROW);
    expect(START + d.beforeFees - d.financing).toBe(d.net);
    expect(d.score).toBe(Math.round((d.returnPct - CUT_COST - LOAN_COST - CAUGHT_COST) * 10) / 10);
    // The next round has no prior private breakdown, even for a past trader.
    await c.act(me, { kind: "dismiss" });
    await c.act(me, { kind: "start" });
    expect((await c.state(me) as unknown as { result: unknown }).result).toBeNull();
    await c.act(me, { kind: "cancel" });
  } finally {
    tab.close();
  }
});
