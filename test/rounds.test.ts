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
type Seen = { round: number; phase: string; countdown: number; startedCode: string | null; breakLeft: number; you: { code: string; pos: unknown; equity: number }; result: { ranking: Row[] } | null; career: { you: boolean; rounds: number; profit: number }[]; feed: { key: string }[] };
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
  s = await server(8095, { TICK_MS: "4", COUNTDOWN_TICKS: "2" });
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
  const bought = await act(me, { kind: "buy", leverage: 1, mode: "simulation" });
  expect(bought.status, JSON.stringify(await bought.clone().json())).toBe(200);
  const called = await debug({ kind: "call", mode: "simulation" });
  expect(called.status, JSON.stringify(await called.clone().json())).toBe(200);
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

// ADR 0064: the lobby chooses the next round. Replay moves to its next plot, by number
// only; Simulation takes a pair. Only someone on the tab may, only in the lobby, and what a
// plot is stays secret: the room is told its number and its pair, never its name or day.
it("lets the lobby move Replay on to its next plot, telling the room its number and no more", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "40", CHOOSE_MS: "0" });
  const { visitor, page, act, look, attempt } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    type Lobby = Seen & { plot: { n: number; of: number } | null; pair: string; pairs: string[] | null };
    const first = (await look(me)) as Lobby;
    expect(first.phase).toBe("lobby");
    expect(first.plot?.of).toBe(13);
    expect(first.pairs, "Replay has no pair to choose").toBeNull();
    const seen = [first.plot!.n];
    for (let i = 0; i < 13; i++) {
      expect((await act(me, { kind: "choose", what: "next", mode: "replay" })).status).toBe(200);
      const x = (await look(me)) as Lobby;
      seen.push(x.plot!.n);
      // the room learns a number and a pair, and nothing that says what happened or when
      expect(JSON.stringify({ ...x, prices: 0, history: 0 }), `plot ${x.plot!.n}`).not.toMatch(/(19|20)\d\d-\d\d-\d\d|Lehman|Brexit|COVID|Francogeddon/);
    }
    // thirteen steps from any plot go round the whole list and back to where it began
    expect(new Set(seen).size).toBe(13);
    expect(seen.at(-1)).toBe(seen[0]);
    // a visitor with no tab open may not choose, and nobody may name a plot that is not there
    expect((await attempt({ kind: "choose", what: "next", mode: "replay" }, await visitor())).status).toBe(409);
    expect((await act(me, { kind: "choose", what: "nonsense", mode: "replay" })).status).toBe(409);
    // and once the countdown has begun, the round is fixed
    await act(me, { kind: "start", mode: "replay" });
    const refused = await act(me, { kind: "choose", what: "next", mode: "replay" });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/about to start/);
  } finally {
    tab.close();
  }
}, 30_000);

it("lets the lobby give a Simulation its pair, which the round then starts from", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2", CHOOSE_MS: "0" });
  const { visitor, page, act, look, until, attempt } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    type Lobby = Seen & { pair: string; pairs: string[] | null; plot: unknown };
    const lobby = (await look(me, "simulation")) as Lobby;
    expect(lobby.pairs!.length).toBeGreaterThanOrEqual(12);
    expect(lobby.plot, "Simulation has no plots").toBeNull();
    for (const pair of ["EUR/JPY", "GBP/CHF", "USD/CNY"]) {
      expect((await act(me, { kind: "choose", what: pair, mode: "simulation" })).status, pair).toBe(200);
      expect(((await look(me, "simulation")) as Lobby).pair).toBe(pair);
    }
    expect((await attempt({ kind: "choose", what: "XXX/YYY", mode: "simulation" }, me)).status).toBe(409);
    // the pair chosen is the pair played
    await act(me, { kind: "start", mode: "simulation" });
    const trading = (await until(me, (x) => x.phase === "trade", 10_000, "simulation")) as Lobby;
    expect(trading.pair).toBe("USD/CNY");
  } finally {
    tab.close();
  }
}, 30_000);

// ADR 0064: a prayer is for a rise or for a fall, which changes the words and nothing
// else. The chart never hears it: the price and the account are what they were.
it("takes a prayer for a rise or a fall, says which in the feed, and changes nothing else", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    const before = (await look(me)) as Seen & { you: { balance: number; equity: number; pos: unknown } };
    expect((await act(me, { kind: "pray", way: 1, mode: "replay" })).status).toBe(200);
    expect((await act(me, { kind: "pray", way: -1, mode: "replay" })).status).toBe(200);
    // a stale page that sends no way is a prayer for a rise, and a nonsense way is too
    expect((await act(me, { kind: "pray", mode: "replay" })).status).toBe(200);
    expect((await act(me, { kind: "pray", way: 7, mode: "replay" })).status).toBe(200);
    const after = (await look(me)) as Seen & { you: { balance: number; equity: number; pos: unknown } };
    const keys = after.feed.map((f) => f.key);
    expect(keys, "the first prayer of each way is told").toContain("prayed-rise");
    expect(keys).toContain("prayed-fall");
    expect(after.you.balance, "a prayer costs nothing").toBe(before.you.balance);
    expect(after.you.pos, "and opens nothing").toBeNull();
    // the feed names the way in plain words
    const fall = after.feed.find((f) => f.key === "prayed-fall") as unknown as { text: string };
    expect(fall.text).toMatch(/fall/);
    expect(fall.text).toMatch(/It does nothing/);
  } finally {
    tab.close();
  }
}, 30_000);

// ADR 0064: the chart marks a trader's fills with their face. Each mark is a public
// moment (an open, an add, a close, a cut), by short code and face, with a flag for who is
// looking; never a cookie, a stop or a take profit.
it("marks each trader's open and close for the chart, by face and short code, never a cookie", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    type Mark = { tick: number; who: string; face: string; kind: string; side: number; you: boolean };
    type Marked = Seen & { marks: Mark[]; tick: number; you: { code: string } };
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    expect((await act(me, { kind: "buy", leverage: 5, stake: 0.5, sl: 5, tp: 10, mode: "replay" })).status).toBe(200);
    expect((await act(other, { kind: "sell", leverage: 5, mode: "replay" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    expect((await act(me, { kind: "close", mode: "replay" })).status).toBe(200);
    const mine = (await look(me)) as Marked;
    const theirs = (await look(other)) as Marked;
    const opened = mine.marks.find((m) => m.you && m.kind === "open");
    expect(opened, "my open is marked, and flagged as mine").toMatchObject({ side: 1, who: mine.you.code });
    expect(mine.marks.some((m) => m.you && m.kind === "close"), "so is my close").toBe(true);
    expect(mine.marks.find((m) => m.who === theirs.you.code && m.kind === "open"), "another's open is marked, not mine").toMatchObject({ side: -1, you: false });
    // the other person sees the same moments with the flag turned round
    expect(theirs.marks.find((m) => m.who === mine.you.code && m.kind === "open")?.you).toBe(false);
    expect(theirs.marks.find((m) => m.who === theirs.you.code && m.kind === "open")?.you).toBe(true);
    // a mark has a tick that is no later than now, a face the page can draw, and no secret in it
    for (const m of mine.marks) {
      expect(m.tick, "a mark is never from the future").toBeLessThanOrEqual(mine.tick);
      expect(m.face).toMatch(/^(bot:\w+|p\d+)$/);
    }
    const wire = JSON.stringify(mine.marks);
    expect(wire).not.toContain(me.slice(2));
    expect(wire).not.toContain(other.slice(2));
    expect(wire, "a stop or a take profit is not a moment").not.toMatch(/stop|take|"sl"|"tp"/);
  } finally {
    for (const t of tabs) t.close();
  }
}, 30_000);

// ADR 0064: a Simulation's news goes out on its day, in the feed and pinned over the chart, as
// a story's number only. Which way the story pushes the price stays on the server: the words
// are the hint, and the wire never says whether a story is real or a rumour.
it("tells a Simulation's news on its day by number, and never sends which way it pushes", async () => {
  s = await server(8096, { TICK_MS: "8", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, look } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    await act(me, { kind: "start", mode: "simulation" });
    const stories = new Set<number>();
    let pinned = false;
    for (const end = Date.now() + 15_000; Date.now() < end; ) {
      const x = (await look(me, "simulation")) as unknown as { phase: string; headline: { story?: number } | null; feed: { key: string; args: Record<string, unknown> }[] };
      for (const f of x.feed.filter((f) => f.key === "story")) {
        expect(Object.keys(f.args), "a story carries its number and nothing else").toEqual(["n"]);
        stories.add(f.args.n as number);
      }
      if (x.headline?.story !== undefined) {
        pinned = true;
        expect(Object.keys(x.headline)).toEqual(["story"]);
      }
      expect(JSON.stringify({ feed: x.feed, headline: x.headline }), "the effect is never on the wire").not.toMatch(/"effect"|vshape|"rise"|"fall"|"none"/);
      if (x.phase === "break") break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(stories.size, "a round tells at least two stories").toBeGreaterThanOrEqual(2);
    for (const n of stories) expect(n).toBeLessThan(12);
    expect(pinned, "a story is pinned over the chart while it is the latest").toBe(true);
  } finally {
    tab.close();
  }
}, 40_000);

// ADR 0064: a choice is for the round on show, and no more. One person cannot press it faster
// than the throttle, choosing what is already there changes nothing, and once a round starts
// the lobby goes back to drawing at random, or it would play one plot for ever.
it("keeps a choice to one round, throttles it, and does nothing for what is already chosen", async () => {
  s = await server(8096, { TICK_MS: "8", COUNTDOWN_TICKS: "2", CHOOSE_MS: "400" });
  const { visitor, page, act, look, until } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    type Lobby = Seen & { pair: string };
    expect((await act(me, { kind: "choose", what: "GBP/JPY", mode: "simulation" })).status).toBe(200);
    const again = await act(me, { kind: "choose", what: "EUR/AUD", mode: "simulation" });
    expect(again.status, "a second choice at once is turned away").toBe(409);
    expect((await again.json()).error).toMatch(/Slow down/);
    expect(((await look(me, "simulation")) as Lobby).pair, "and changes nothing").toBe("GBP/JPY");
    await new Promise((r) => setTimeout(r, 450));
    const round = (await look(me, "simulation")).round;
    expect((await act(me, { kind: "choose", what: "GBP/JPY", mode: "simulation" })).status).toBe(200);
    expect((await look(me, "simulation")).round, "choosing what is chosen draws nothing new").toBe(round);
    // the round that was chosen is the one played
    await act(me, { kind: "start", mode: "simulation" });
    expect(((await until(me, (x) => x.phase === "trade", 10_000, "simulation")) as Lobby).pair).toBe("GBP/JPY");
    // and a choice is spent: the next lobby shows a pair drawn at random, which over a few
    // draws is not always the one chosen (fourteen pairs, so a draw of the same one is rare)
    const next = new Set<string>();
    for (let draw = 0; draw < 12; draw++) {
      await act(me, { kind: "finish", mode: "simulation" });
      await until(me, (x) => x.phase === "lobby", 30_000, "simulation");
      next.add(((await look(me, "simulation")) as Lobby).pair);
      if (next.size > 1) break;
      await act(me, { kind: "start", mode: "simulation" });
      await until(me, (x) => x.phase === "trade", 10_000, "simulation");
    }
    expect(next.size, "the lobby is back to drawing at random").toBeGreaterThan(1);
  } finally {
    tab.close();
  }
}, 120_000);

