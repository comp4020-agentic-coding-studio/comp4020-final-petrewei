import { afterEach, expect, it } from "vitest";
import { client, type Mode } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// ADR 0022: a round's controls. The countdown is five seconds, and orders
// are taken during it; whoever pressed Start may cancel it, or end the
// round early for everyone, which rings the bell at once; anyone may leave
// a round for themselves and watch it out; after the bell anyone may close
// it straight away, or hold it longer.
let s: Server;
afterEach(() => s.stop());

type Row = { code: string; you: boolean; sat?: boolean; left?: boolean; balance: number; guess?: number | null; bonus?: number };
type Seen = { phase: string; countdown: number; startedCode: string | null; breakLeft: number; you: { code: string; left?: boolean; pos: unknown; equity: number }; result: { ranking: Row[] } | null; career: { you: boolean; rounds: number; profit: number }[]; feed: { key: string }[] };
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

it("lets a person leave the round alone: closed out, then watching, listed as left", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "buy", leverage: 5, mode: "replay" });
    await act(other, { kind: "buy", leverage: 5, mode: "replay" });
    expect((await act(me, { kind: "leave", mode: "replay" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("trade");
    expect(x.you.left).toBe(true);
    expect(x.you.pos).toBeNull();
    // no more orders this round, and nobody else is touched
    expect((await act(me, { kind: "buy", leverage: 5, mode: "replay" })).status).toBe(409);
    expect((await look(other)).you.pos).not.toBeNull();
    expect((await act(me, { kind: "leave", mode: "replay" })).status).toBe(409);
    await act(me, { kind: "finish", mode: "replay" });
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
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "finish", mode: "replay" });
    const bell = await until(me, (x) => x.phase === "break");
    expect((await act(me, { kind: "hold", mode: "replay" })).status).toBe(200);
    expect((await look(me)).breakLeft).toBeGreaterThan(bell.breakLeft + 20);
    // held, but capped: a bell can't be held for ever
    for (let i = 0; i < 20; i++) await act(me, { kind: "hold", mode: "replay" });
    expect((await look(me)).breakLeft).toBeLessThanOrEqual(300);
    // someone who is not on the tab can't touch it
    expect((await attempt({ kind: "dismiss", mode: "replay" }, await visitor())).status).toBe(409);
    expect((await act(me, { kind: "dismiss", mode: "replay" })).status).toBe(200);
    expect((await look(me)).phase).toBe("lobby");
    // and neither works outside the bell
    expect((await act(me, { kind: "hold", mode: "replay" })).status).toBe(409);
    expect((await act(me, { kind: "dismiss", mode: "replay" })).status).toBe(409);
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
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    expect((await act(other, { kind: "pause", mode: "replay" })).status).toBe(200);
    const paused = (await look(me)) as Seen & { paused: number | null; tick: number };
    expect(paused.paused).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 400));
    const later = (await look(me)) as Seen & { tick: number };
    // the price stands still and orders wait
    expect(later.tick).toBe(paused.tick);
    const refused = await act(me, { kind: "buy", leverage: 5, mode: "replay" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/paused/);
    expect((await act(me, { kind: "pause", mode: "replay" })).status).toBe(409);
    // someone not on the tab may not resume it
    expect((await attempt({ kind: "resume", mode: "replay" }, await visitor())).status).toBe(409);
    expect((await act(me, { kind: "resume", mode: "replay" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(((await look(me)) as Seen & { tick: number }).tick).toBeGreaterThan(paused.tick);
    expect((await act(me, { kind: "resume", mode: "replay" })).status).toBe(409);
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
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    await act(me, { kind: "pause", mode: "replay" });
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
    expect((await act(me, { kind: "start", mode: "replay", ironman: true })).status).toBe(200);
    expect(((await look(me)) as Seen & { ironman: boolean }).ironman).toBe(true);
    await until(me, (x) => x.phase === "trade");
    const refused = await act(me, { kind: "pause", mode: "replay" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/ironman/i);
    // the next round is an ordinary one unless asked again
    await act(me, { kind: "finish", mode: "replay" });
    await until(me, (x) => x.phase === "break");
    await act(me, { kind: "dismiss", mode: "replay" });
    await act(me, { kind: "start", mode: "replay" });
    expect(((await look(me)) as Seen & { ironman: boolean }).ironman).toBe(false);
  } finally {
    tab.close();
  }
}, 20_000);

// ADR 0030: in a replay's second half, anyone in the round may name the
// year it is from, privately; the bell shows each guess and pays for a
// right one in the score.
it("takes a year guess in a replay's second half, private until the bell", async () => {
  s = await server(8096, { TICK_MS: "20", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look, attempt } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    // not before halfway
    const early = await act(me, { kind: "guess", year: 2015, mode: "replay" });
    expect(early.status).toBe(409);
    expect((await early.json()).error).toMatch(/halfway/);
    await until(me, (x) => (x as Seen & { tick: number }).tick >= 20 * 9);
    for (const bad of [1990, 2099, "2015", null]) expect((await act(me, { kind: "guess", year: bad, mode: "replay" })).status, String(bad)).toBe(400);
    expect((await act(me, { kind: "guess", year: 2010, mode: "replay" })).status).toBe(200);
    expect((await act(me, { kind: "guess", year: 2012, mode: "replay" })).status).toBe(200);
    // mine to see, nobody else's
    expect(((await look(me)) as Seen & { you: { guess: number | null } }).you.guess).toBe(2012);
    // nowhere in the other's view: not as their guess, nor any "guess" field
    const seen = (await look(other)) as Seen & { you: { guess: number | null } };
    expect(seen.you.guess).toBeNull();
    expect(JSON.stringify(seen)).not.toMatch(/"guess(es)?":\s*2012/);
    // someone not on the tab can't guess
    expect((await attempt({ kind: "guess", year: 2012, mode: "replay" }, await visitor())).status).toBe(409);
    await act(me, { kind: "finish", mode: "replay" });
    const bell = (await until(me, (x) => x.phase === "break")) as Seen & { result: { ranking: (Row & { guess?: number | null; bonus?: number })[] } };
    const mine = bell.result.ranking.find((r) => r.you)!;
    expect(mine.guess).toBe(2012);
    expect(mine.bonus).toEqual(expect.any(Number));
  } finally {
    for (const t of tabs) t.close();
  }
}, 30_000);

it("takes no year guess in a Simulation round", async () => {
  s = await server(8096, { TICK_MS: "20", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    await act(me, { kind: "start", mode: "simulation" });
    await until(me, (x) => x.phase === "trade", 10_000, "simulation");
    const res = await act(me, { kind: "guess", year: 2015, mode: "simulation" });
    expect(res.status).toBe(409);
  } finally {
    tab.close();
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
// the score is docked. The same rule as the tutorial's, in every mode.
it("has Dad find out about a \"loan\" in a market round, and tells the room", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2", DAD_TICKS: "6" });
  const { visitor, page, act, until } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    await act(me, { kind: "start", mode: "simulation" });
    await until(me, (x) => x.phase === "trade", 10_000, "simulation");
    // a position at the top of the menu meets a margin call or a cut within moments
    await act(me, { kind: "buy", leverage: 1000, mode: "simulation" });
    const hurt = await until(me, (x) => x.feed.some((f) => ["call", "stopout", "zerocut"].includes(f.key)), 15_000, "simulation");
    expect(hurt.feed.some((f) => ["call", "stopout", "zerocut"].includes(f.key)), "the 1000× position was hurt").toBe(true);
    expect((await act(me, { kind: "borrow", mode: "simulation" })).status).toBe(200);
    const caught = await until(me, (x) => x.feed.some((f) => f.key === "caught"), 10_000, "simulation");
    expect(caught.feed.map((f) => f.key)).toContain("caught");
    const after = (await app().look(me, "simulation")) as Seen & { you: { out: boolean; caught: number; pos: unknown } };
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
  s = await server(8096, { TICK_MS: "20", COUNTDOWN_TICKS: "2", DAD_TICKS: "100000" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    await act(me, { kind: "start", mode: "simulation" });
    await until(me, (x) => x.phase === "trade", 10_000, "simulation");
    await act(me, { kind: "buy", leverage: 1000, mode: "simulation" });
    await until(me, (x) => x.feed.some((f) => ["call", "stopout", "zerocut"].includes(f.key)), 15_000, "simulation");
    expect((await act(me, { kind: "borrow", mode: "simulation" })).status).toBe(200);
    expect(((await look(me, "simulation")) as Seen & { you: { caught: number } }).you.caught, "not found out yet").toBe(0);
    const bell = await until(me, (x) => x.phase === "break", 30_000, "simulation");
    expect(bell.feed.map((f) => f.key), "Dad found out at the bell").toContain("caught");
    const mine = bell.result!.ranking.find((r) => r.you)! as Row & { score: number };
    // the loan, a forced cut or a wipe-out and Dad's punishment are all in the score
    expect(mine.score).toBeLessThan(-20);
  } finally {
    tab.close();
  }
}, 60_000);
