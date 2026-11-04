import { afterEach, expect, it } from "vitest";
import { START, STEP } from "../src/fx.ts";
import { BANKRUPT_COST, CUT_COST } from "../src/score.ts";
import { client } from "../spec/helpers.ts";
import { server, type Server } from "./server.ts";

let s: Server;
afterEach(() => s?.stop());
type Debrief = { beforeFees: number; financing: number; interest: number; balance: number; debt: number; net: number; returnPct: number; cuts: number; cutPenalty: number; bankruptPenalty: number; bonus: number; score: number };
type Bell = { result: { debrief: Debrief | null; ranking: { you: boolean; balance: number; score: number }[] } };

it("gives each player a private bell breakdown that reconciles money, fees, credit and the ranked score", async () => {
  s = await server(8191, { TICK_MS: "50", COUNTDOWN_TICKS: "1" });
  const c = client(s.base);
  const me = await c.visitor();
  const watcher = await c.visitor();
  const tabs = [await c.page(me), await c.page(watcher)];
  try {
    await c.act(me, { kind: "start" });
    expect(await tabs[0].next((e) => e.phase === "trade", 2000)).not.toBeNull();
    // Enough financing to survive rounding to whole dollars: 100× on A$10,000 pays about 10 cents a tick.
    const bought = await c.act(me, { kind: "buy", leverage: 100 });
    expect(bought.status, JSON.stringify(await bought.clone().json())).toBe(200);
    expect(await tabs[0].next((e) => Number(e.tick) >= 20, 5000), "twenty ticks pass while the position is open").not.toBeNull();
    // A replay opens on a day the market broke, so the price may already have cut this position
    // (a 100x one in a few ticks): the market's verdict is a way the round can go, and the
    // breakdown must reconcile either way. Only a refusal that is not "nothing to close" is wrong.
    const closed = await c.act(me, { kind: "close" });
    if (closed.status !== 200) expect((await closed.json()).error, "close was refused for another reason").toBe("Nothing to close.");
    expect((await c.act(me, { kind: "finish" })).status).toBe(200);
    const bell = await c.state(me) as unknown as Bell;
    const d = bell.result.debrief!;
    expect(d).toBeTruthy();
    // financing is charged each tick the position is open, so it is there unless the market cut
    // the position before its first whole dollar
    if (d.cuts === 0) expect(d.financing).toBeGreaterThan(0);
    expect(Math.round(d.balance - d.debt)).toBe(d.net);
    expect(START + d.beforeFees - d.financing - d.interest).toBe(d.net);
    expect(d.returnPct).toBeCloseTo((d.net / START - 1) * 100);
    expect(d.cutPenalty).toBe(d.cuts * CUT_COST);
    expect(d.bankruptPenalty).toBe(d.net < 0 ? BANKRUPT_COST : 0);
    expect(d.score).toBeCloseTo(Math.round((d.returnPct - d.cutPenalty - d.bankruptPenalty + d.bonus) * 10) / 10);
    expect(bell.result.ranking.find((r) => r.you)).toMatchObject({ balance: d.net, score: d.score });
    expect((await c.state(watcher) as unknown as Bell).result.debrief).toBeNull();
    expect(bell.result.ranking.every((r) => !("financing" in r) && !("debrief" in r))).toBe(true);
    expect(JSON.stringify(await c.state(watcher))).not.toContain(me.slice(2));
  } finally {
    tabs.forEach((t) => t.close());
  }
});

it("explains a forced cut and emergency credit, with its interest, without deducting the debt twice", async () => {
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
    expect(d).toMatchObject({ cuts: 1, cutPenalty: CUT_COST });
    // what is owed is the step and the interest it has run up since, which the breakdown names
    expect(d.debt).toBeGreaterThanOrEqual(STEP);
    expect(d.interest).toBe(Math.round(d.debt - STEP));
    expect(Math.round(d.balance - d.debt)).toBe(d.net);
    expect(START + d.beforeFees - d.financing - d.interest).toBe(d.net);
    expect(d.score).toBe(Math.round((d.returnPct - CUT_COST - d.bankruptPenalty) * 10) / 10);
    // The next round has no prior private breakdown, even for a past trader.
    await c.act(me, { kind: "dismiss" });
    await c.act(me, { kind: "start" });
    expect((await c.state(me) as unknown as { result: unknown }).result).toBeNull();
    await c.act(me, { kind: "cancel" });
  } finally {
    tab.close();
  }
});
