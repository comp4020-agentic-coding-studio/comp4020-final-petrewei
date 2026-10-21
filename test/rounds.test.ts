import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// ADR 0022: a round's controls. The countdown is five seconds, and orders
// are taken during it; whoever pressed Start may cancel it, or end the
// round early for everyone, which rings the bell at once; anyone may leave
// a round for themselves and watch it out; after the bell anyone may close
// it straight away, or hold it longer.
let s: Server;
afterEach(() => s.stop());

type Row = { code: string; you: boolean; sat?: boolean; left?: boolean; balance: number };
type Seen = { phase: string; countdown: number; startedCode: string | null; breakLeft: number; you: { code: string; left?: boolean; pos: unknown; equity: number }; result: { ranking: Row[] } | null; career: { you: boolean; rounds: number; profit: number }[]; feed: { key: string }[] };
const app = () => {
  const c = client(s.base);
  const look = async (cookie?: string): Promise<Seen> => (await c.state(cookie)) as unknown as Seen;
  const until = async (cookie: string, test: (x: Seen) => boolean, ms = 10_000): Promise<Seen> => {
    let x = await look(cookie);
    for (const end = Date.now() + ms; !test(x) && Date.now() < end; ) {
      await new Promise((r) => setTimeout(r, 20));
      x = await look(cookie);
    }
    return x;
  };
  return { ...c, look, until };
};

it("counts down five seconds by default", async () => {
  s = await server(8096);
  const { visitor, page, act, look } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    expect((await act(me, { kind: "start", mode: "history" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("countdown");
    expect(x.countdown).toBe(5);
    expect(x.startedCode).toBe(x.you.code);
  } finally {
    tab.close();
  }
});

it("takes orders during the countdown, at the opening price", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "40" });
  const { visitor, page, act, look } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    await act(me, { kind: "start", mode: "history" });
    expect((await act(me, { kind: "buy", leverage: 5, mode: "history" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("countdown");
    expect(x.you.pos).toMatchObject({ side: 1, leverage: 5 });
    // and may close it again before trading opens
    expect((await act(me, { kind: "close", mode: "history" })).status).toBe(200);
  } finally {
    tab.close();
  }
});

it("lets only the starter cancel the countdown, back to the lobby, with no record", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "200" });
  const { visitor, page, act, look } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "history" });
    await act(other, { kind: "buy", leverage: 5, mode: "history" });
    const refused = await act(other, { kind: "cancel", mode: "history" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/Only .* who pressed Start/);
    expect((await act(me, { kind: "cancel", mode: "history" })).status).toBe(200);
    const x = await look(other);
    expect(x.phase).toBe("lobby");
    expect(x.you.pos).toBeNull();
    expect(x.you.equity).toBe(1_000_000);
    expect(x.career).toEqual([]);
    // nothing to cancel now
    expect((await act(me, { kind: "cancel", mode: "history" })).status).toBe(409);
  } finally {
    for (const t of tabs) t.close();
  }
});

it("lets the starter end the round early for everyone, ringing the bell", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    await act(other, { kind: "buy", leverage: 5, mode: "history" });
    const refused = await act(other, { kind: "finish", mode: "history" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/Only .* who pressed Start/);
    expect((await act(me, { kind: "finish", mode: "history" })).status).toBe(200);
    const x = await until(other, (y) => y.phase === "break");
    expect(x.phase).toBe("break");
    expect(x.result?.ranking.find((r) => r.you)).toMatchObject({ sat: false });
    expect(x.career.find((c) => c.you)?.rounds).toBe(1);
  } finally {
    for (const t of tabs) t.close();
  }
});

it("lets a starter who has left be replaced: anyone on the tab may end it", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until } = app();
  const me = await visitor();
  const other = await visitor();
  const mine = await page(me);
  const theirs = await page(other);
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    mine.close();
    await new Promise((r) => setTimeout(r, 200));
    expect((await act(other, { kind: "finish", mode: "history" })).status).toBe(200);
    expect((await until(other, (y) => y.phase === "break")).phase).toBe("break");
  } finally {
    theirs.close();
  }
});

it("lets a person leave the round alone: closed out, then watching, listed as left", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "buy", leverage: 5, mode: "history" });
    await act(other, { kind: "buy", leverage: 5, mode: "history" });
    expect((await act(me, { kind: "leave", mode: "history" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("trade");
    expect(x.you.left).toBe(true);
    expect(x.you.pos).toBeNull();
    // no more orders this round, and nobody else is touched
    expect((await act(me, { kind: "buy", leverage: 5, mode: "history" })).status).toBe(409);
    expect((await look(other)).you.pos).not.toBeNull();
    expect((await act(me, { kind: "leave", mode: "history" })).status).toBe(409);
    await act(me, { kind: "finish", mode: "history" });
    const bell = await until(me, (y) => y.phase === "break");
    const row = bell.result!.ranking.find((r) => r.you)!;
    expect(row.left).toBe(true);
    // listed last, unranked, after the traders
    expect(bell.result!.ranking.at(-1)?.you).toBe(true);
    // leaving keeps what was banked in the hall: a loss can't be walked away from
    expect(bell.career.find((c) => c.you)?.rounds).toBe(1);
  } finally {
    for (const t of tabs) t.close();
  }
}, 20_000);

it("lets anyone close the bell now, or hold it longer", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look, attempt } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "finish", mode: "history" });
    const bell = await until(me, (x) => x.phase === "break");
    expect((await act(me, { kind: "hold", mode: "history" })).status).toBe(200);
    expect((await look(me)).breakLeft).toBeGreaterThan(bell.breakLeft + 20);
    // held, but capped: a bell can't be held for ever
    for (let i = 0; i < 20; i++) await act(me, { kind: "hold", mode: "history" });
    expect((await look(me)).breakLeft).toBeLessThanOrEqual(300);
    // someone who is not on the tab can't touch it
    expect((await attempt({ kind: "dismiss", mode: "history" }, await visitor())).status).toBe(409);
    expect((await act(me, { kind: "dismiss", mode: "history" })).status).toBe(200);
    expect((await look(me)).phase).toBe("lobby");
    // and neither works outside the bell
    expect((await act(me, { kind: "hold", mode: "history" })).status).toBe(409);
    expect((await act(me, { kind: "dismiss", mode: "history" })).status).toBe(409);
  } finally {
    tab.close();
  }
}, 20_000);

// ADR 0024: anyone on the tab may pause a trading round, freezing the
// price and the orders for everyone, and anyone may resume it; it resumes
// by itself after a minute. A round started in ironman mode cannot pause.
it("pauses for everyone and resumes, by anyone on the tab", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look, attempt } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    expect((await act(other, { kind: "pause", mode: "history" })).status).toBe(200);
    const paused = (await look(me)) as Seen & { paused: number | null; tick: number };
    expect(paused.paused).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 400));
    const later = (await look(me)) as Seen & { tick: number };
    // the price stands still and orders wait
    expect(later.tick).toBe(paused.tick);
    const refused = await act(me, { kind: "buy", leverage: 5, mode: "history" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/paused/);
    expect((await act(me, { kind: "pause", mode: "history" })).status).toBe(409);
    // someone not on the tab may not resume it
    expect((await attempt({ kind: "resume", mode: "history" }, await visitor())).status).toBe(409);
    expect((await act(me, { kind: "resume", mode: "history" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(((await look(me)) as Seen & { tick: number }).tick).toBeGreaterThan(paused.tick);
    expect((await act(me, { kind: "resume", mode: "history" })).status).toBe(409);
  } finally {
    for (const t of tabs) t.close();
  }
}, 20_000);

it("resumes a pause by itself after a minute, and says so", async () => {
  // a test's minute is 40 ticks of 50ms
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2", PAUSE_TICKS: "40" });
  const { visitor, page, act, until } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    await act(me, { kind: "start", mode: "history" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "pause", mode: "history" });
    const resumed = await until(me, (x) => (x as Seen & { paused: number | null }).paused === null, 15_000);
    expect((resumed as Seen & { paused: number | null }).paused).toBeNull();
    expect(resumed.feed.some((f) => f.key === "unpaused")).toBe(true);
  } finally {
    tab.close();
  }
}, 20_000);

it("starts an ironman round, which nobody can pause", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    expect((await act(me, { kind: "start", mode: "history", ironman: true })).status).toBe(200);
    expect(((await look(me)) as Seen & { ironman: boolean }).ironman).toBe(true);
    await until(me, (x) => x.phase === "trade");
    const refused = await act(me, { kind: "pause", mode: "history" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/ironman/i);
    // the next round is an ordinary one unless asked again
    await act(me, { kind: "finish", mode: "history" });
    await until(me, (x) => x.phase === "break");
    await act(me, { kind: "dismiss", mode: "history" });
    await act(me, { kind: "start", mode: "history" });
    expect(((await look(me)) as Seen & { ironman: boolean }).ironman).toBe(false);
  } finally {
    tab.close();
  }
}, 20_000);
