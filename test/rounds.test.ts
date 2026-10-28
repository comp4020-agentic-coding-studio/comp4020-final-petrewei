import { afterEach, expect, it } from "vitest";
import { client, type Mode } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// ADR 0022: a round's controls. The countdown is five seconds, and orders
// are taken during it; whoever pressed Start may cancel it, or end the
// round early for everyone, which rings the bell at once; after the bell anyone may close
// it straight away, or hold it longer.
let s: Server;
afterEach(() => s.stop());

type Row = { code: string; you: boolean; sat?: boolean; balance: number; guess?: number | null; bonus?: number };
type Seen = { phase: string; countdown: number; startedCode: string | null; breakLeft: number; you: { code: string; pos: unknown; equity: number }; result: { ranking: Row[] } | null; career: { you: boolean; rounds: number; profit: number }[]; feed: { key: string }[] };
const app = () => {
  const c = client(s.base);
  const look = async (cookie?: string, mode: Mode = "replay"): Promise<Seen> => (await c.state(cookie, mode)) as unknown as Seen;
  const until = async (cookie: string, test: (x: Seen) => boolean, ms = 10_000, mode: Mode = "replay"): Promise<Seen> => {
    let x = await look(cookie, mode);
    for (const end = Date.now() + ms; !test(x) && Date.now() < end; ) {
      await new Promise((r) => setTimeout(r, 20));
      x = await look(cookie, mode);
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
    expect((await act(me, { kind: "start", mode: "replay" })).status).toBe(200);
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
    await act(me, { kind: "start", mode: "replay" });
    expect((await act(me, { kind: "buy", leverage: 5, mode: "replay" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("countdown");
    expect(x.you.pos).toMatchObject({ side: 1, leverage: 5 });
    // and may close it again before trading opens
    expect((await act(me, { kind: "close", mode: "replay" })).status).toBe(200);
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
    await act(me, { kind: "start", mode: "replay" });
    await act(other, { kind: "buy", leverage: 5, mode: "replay" });
    const refused = await act(other, { kind: "cancel", mode: "replay" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/Only .* who pressed Start/);
    expect((await act(me, { kind: "cancel", mode: "replay" })).status).toBe(200);
    const x = await look(other);
    expect(x.phase).toBe("lobby");
    expect(x.you.pos).toBeNull();
    expect(x.you.equity).toBe(1_000_000);
    expect(x.career).toEqual([]);
    // nothing to cancel now
    expect((await act(me, { kind: "cancel", mode: "replay" })).status).toBe(409);
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
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    await act(other, { kind: "buy", leverage: 5, mode: "replay" });
    const refused = await act(other, { kind: "finish", mode: "replay" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/Only .* who pressed Start/);
    expect((await act(me, { kind: "finish", mode: "replay" })).status).toBe(200);
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
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    mine.close();
    await new Promise((r) => setTimeout(r, 200));
    expect((await act(other, { kind: "finish", mode: "replay" })).status).toBe(200);
    expect((await until(other, (y) => y.phase === "break")).phase).toBe("break");
  } finally {
    theirs.close();
  }
});

// ADR 0050: a replay hides its famous day until the bell, and so does what it
// sends: a clue is told to a page by an opaque number, never by the date it
// leads to, which is the answer to Name That Year. Rounds are random and only
// some hide a day, so several are played and every state and feed line is read.
it("never puts a replay's famous date on the wire before the bell, in a clue or the pinned headline", async () => {
  s = await server(8095, { TICK_MS: "4", COUNTDOWN_TICKS: "2", EVENT_CHANCE: "1" });
  const { visitor, page, act, look } = app();
  const me = await visitor();
  let tab = await page(me);
  const dates = /(19|20)\d\d-\d\d-\d\d/;
  let clues = 0;
  try {
    for (let round = 0; round < 6; round++) {
      // starting a round needs the tab open, so open it afresh each round
      tab.close();
      tab = await page(me);
      const began = await act(me, { kind: "start", mode: "replay" });
      expect(began.status, `round ${round}: ${await began.clone().text()}`).toBe(200);
      for (const end = Date.now() + 15_000; Date.now() < end; ) {
        const x = (await look(me)) as unknown as { phase: string; headline: unknown; feed: { key: string; args: Record<string, unknown> }[] };
        if (x.phase === "trade") {
          const wire = JSON.stringify({ headline: x.headline, feed: x.feed });
          expect(wire, "a date was sent while the round was trading").not.toMatch(dates);
          clues += x.feed.filter((f) => f.key === "clue").length;
          for (const f of x.feed.filter((f) => f.key === "clue")) expect(f.args, "a clue names its date").not.toHaveProperty("date");
        }
        if (x.phase === "break") break;
        await new Promise((r) => setTimeout(r, 15));
      }
      await act(me, { kind: "dismiss", mode: "replay" });
      for (const end = Date.now() + 10_000; Date.now() < end; ) {
        if (((await look(me)) as unknown as { phase: string }).phase === "lobby") break;
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    expect(clues, "no round showed a clue, so nothing was checked").toBeGreaterThan(0);
  } finally {
    tab.close();
  }
}, 120_000);

// ADR 0057: in a real market, a player who "borrows" from Dad's savings is
// found out after a while, or at the bell if the round ends first, whichever
// comes first: everything is closed, they are grounded, the room is told, and
// the score is docked. The same rule as the tutorial's, in every mode. The
// margin call is forced through the debug route (ADR 0019), so the check does
// not depend on where a random price goes.
const KEY = "test-key-rounds-0123456789abcdef";
async function inACall(port: number, env: Record<string, string>) {
  s = await server(port, { TICK_MS: "20", COUNTDOWN_TICKS: "2", STATS_KEY: KEY, ...env });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  const set = (await fetch(`${s.base}/?debug=${KEY}`, { headers: { cookie: me }, redirect: "manual" })).headers.get("set-cookie") ?? "";
  const cookie = `${me}; ${set.match(/dbg=[^;]+/)![0]}`;
  const debug = (body: unknown) => fetch(`${s.base}/api/debug`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  await act(me, { kind: "start", mode: "simulation" });
  await until(me, (x) => x.phase === "trade", 10_000, "simulation");
  expect((await act(me, { kind: "buy", leverage: 1000, mode: "simulation" })).status).toBe(200);
  expect((await debug({ kind: "call", mode: "simulation" })).status).toBe(200);
  const lent = await act(me, { kind: "borrow", mode: "simulation" });
  expect(lent.status, JSON.stringify(await lent.clone().json())).toBe(200);
  return { me, tab, act, until, look };
}

it("has Dad find out about a \"loan\" in a market round, and tells the room", async () => {
  const { me, tab, act, until, look } = await inACall(8096, { DAD_TICKS: "6" });
  try {
    const caught = await until(me, (x) => x.feed.some((f) => f.key === "caught"), 10_000, "simulation");
    expect(caught.feed.map((f) => f.key)).toContain("caught");
    const after = (await look(me, "simulation")) as Seen & { you: { out: boolean; caught: number; pos: unknown } };
    expect(after.you.caught).toBe(1);
    expect(after.you.out).toBe(true);
    expect(after.you.pos).toBeNull();
    // and a second "loan" is refused: Dad has hidden the rest
    const again = await act(me, { kind: "borrow", mode: "simulation" });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/hidden|gone/);
  } finally {
    tab.close();
  }
}, 40_000);

it("has Dad find out at the bell if the round ends before he would have, and docks the score", async () => {
  // Dad's delay is far longer than the round, so only the bell can reveal it
  const { me, tab, until, look } = await inACall(8096, { DAD_TICKS: "100000" });
  try {
    expect(((await look(me, "simulation")) as Seen & { you: { caught: number } }).you.caught, "not found out yet").toBe(0);
    const bell = await until(me, (x) => x.phase === "break", 30_000, "simulation");
    expect(bell.feed.map((f) => f.key), "Dad found out at the bell").toContain("caught");
    const mine = bell.result!.ranking.find((r) => r.you)! as Row & { score: number };
    // the loan and Dad's punishment are both in the score
    expect(mine.score).toBeLessThan(-14);
  } finally {
    tab.close();
  }
}, 60_000);

// ADR 0060: there is no leaving a round. The action, the desk's rule, the
// button and the words are gone, and an old page that still sends it is turned
// away like any unknown action, and changes nothing.
it("no longer lets anyone leave a round, and an old page that asks is refused", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look, attempt } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "buy", leverage: 5, stake: 0.5, mode: "replay" });
    const res = await attempt({ kind: "leave", mode: "replay" }, me);
    expect(res.status).toBe(400);
    const x = await look(me);
    expect(x.you.pos, "the position is untouched").not.toBeNull();
    expect((await act(me, { kind: "buy", leverage: 5, stake: 0.5, mode: "replay" })).status, "and orders are still taken").toBe(200);
    expect(JSON.stringify(x)).not.toMatch(/"left"/);
  } finally {
    tab.close();
  }
});
