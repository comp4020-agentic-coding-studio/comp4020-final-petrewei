import { afterEach, expect, it } from "vitest";
import { client, type Mode } from "../spec/helpers.ts";
import { EVENTS } from "../src/market.ts";
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
    expect((await act(me, { kind: "buy", leverage: 3, mode: "replay" })).status).toBe(200);
    const x = await look(me);
    expect(x.phase).toBe("countdown");
    expect(x.you.pos).toMatchObject({ side: 1, leverage: 3 });
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
    await act(other, { kind: "buy", leverage: 3, mode: "replay" });
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
    await act(other, { kind: "buy", leverage: 3, mode: "replay" });
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

// ADR 0085: whoever rules the round may run it at 2× for everyone, which moves the market two ticks a beat; nobody else
// may, and everyone is told.
it("lets the starter run the round at 2× for everyone, and nobody else", async () => {
  s = await server(8096, { TICK_MS: "100", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const other = await visitor();
  const tabs = [await page(me), await page(other)];
  try {
    await act(me, { kind: "start", mode: "replay" });
    await until(me, (x) => x.phase === "trade");
    expect((await act(other, { kind: "fast", mode: "replay" })).status).toBe(409);
    // ticks in a second at 1×, then at 2×
    const rate = async () => {
      const a = ((await look(me)) as unknown as { tick: number }).tick;
      await new Promise((r) => setTimeout(r, 1000));
      return ((await look(me)) as unknown as { tick: number }).tick - a;
    };
    const slow = await rate();
    expect((await act(me, { kind: "fast", mode: "replay" })).status).toBe(200);
    const seen = (await look(other)) as unknown as { speed: number; feed: { key: string }[] };
    expect(seen.speed, "everyone sees it").toBe(2);
    expect(seen.feed.some((f) => f.key === "fast")).toBe(true);
    const quick = await rate();
    expect(quick, `${quick} ticks a second at 2× against ${slow} at 1×`).toBeGreaterThanOrEqual(slow * 1.6);
    expect((await act(me, { kind: "normal", mode: "replay" })).status).toBe(200);
    expect(((await look(other)) as unknown as { speed: number }).speed).toBe(1);
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

// ADR 0080: in a real market, emergency credit is drawn and repaid a step at a time; the room is told, what is owed
// grows by the tick with its daily interest, and the bell docks the score of anyone left owing more than they have.
async function onCredit(port: number) {
  s = await server(port, { TICK_MS: "20", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, until, look } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  await act(me, { kind: "start", mode: "simulation" });
  await until(me, (x) => x.phase === "trade", 10_000, "simulation");
  const lent = await act(me, { kind: "borrow", mode: "simulation" });
  expect(lent.status, JSON.stringify(await lent.clone().json())).toBe(200);
  return { me, tab, act, until, look };
}
type Owing = Seen & { you: { debt: number; credit: number; bankrupt: boolean } };

it("lends a step of credit in a market round, tells the room, and grows what is owed by the tick", async () => {
  const { me, tab, act, until, look } = await onCredit(8096);
  try {
    const first = (await look(me, "simulation")) as Owing;
    expect(first.feed.map((f) => f.key)).toContain("borrowed");
    expect(first.you.debt).toBeGreaterThanOrEqual(100_000);
    const later = (await until(me, (x) => (x as Owing).you.debt > first.you.debt, 10_000, "simulation")) as Owing;
    expect(later.you.debt, "interest is added to what is owed").toBeGreaterThan(first.you.debt);
    expect(later.you.credit).toBe(1_000_000 - later.you.debt);
    // repaid a step from the cash it put in, which leaves only the interest owed
    expect((await act(me, { kind: "repay", mode: "simulation" })).status).toBe(200);
    const after = (await look(me, "simulation")) as Owing;
    expect(after.you.debt).toBeLessThan(later.you.debt);
    expect(after.feed.map((f) => f.key)).toContain("repaid");
  } finally {
    tab.close();
  }
}, 40_000);

it("counts the interest against a borrower at the bell, with no bankruptcy cost while they are worth more than nothing", async () => {
  const { me, tab, until } = await onCredit(8096);
  try {
    const bell = await until(me, (x) => x.phase === "break", 30_000, "simulation");
    const mine = bell.result!.ranking.find((r) => r.you)! as Row & { score: number; balance: number };
    // never traded, so the step sits as cash and the interest is the whole loss
    expect(mine.balance).toBeLessThan(1_000_000);
    expect(mine.balance).toBeGreaterThan(0);
    expect(mine.score).toBeCloseTo(Math.round((mine.balance / 1_000_000 - 1) * 1000) / 10, 1);
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
    await act(me, { kind: "buy", leverage: 3, stake: 0.5, mode: "replay" });
    const res = await attempt({ kind: "leave", mode: "replay" }, me);
    expect(res.status).toBe(400);
    const x = await look(me);
    expect(x.you.pos, "the position is untouched").not.toBeNull();
    expect((await act(me, { kind: "buy", leverage: 3, stake: 0.5, mode: "replay" })).status, "and orders are still taken").toBe(200);
    expect(JSON.stringify(x)).not.toMatch(/"left"/);
  } finally {
    tab.close();
  }
});

// ADR 0064, ADR 0070: the lobby chooses the next round. Replay takes a plot by its number
// only; Simulation takes a pair. Only someone on the tab may, only in the lobby, and what a
// plot is stays secret: the room is told its number and its pair, never its name or day.
it("lets the lobby give Replay any of its plots by number, telling the room the number and pair and no more", async () => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "40", CHOOSE_MS: "0" });
  const { visitor, page, act, look, attempt } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    type Lobby = Seen & { pair: string; pairs: string[] | null; replayPlots: { n: number; pair: string }[] | null; replayPlot: number | null; prices: number[] };
    const first = (await look(me)) as Lobby;
    expect(first.phase).toBe("lobby");
    expect(first.pairs, "Replay has no free pair to choose").toBeNull();
    expect(first.replayPlots).toEqual(EVENTS.map((e, i) => ({ n: i + 1, pair: e.pair })));
    const opens = new Map<string, number>();
    for (const { n, pair } of first.replayPlots!) {
      expect((await act(me, { kind: "choose", what: n, mode: "replay" })).status, `plot ${n}`).toBe(200);
      const x = (await look(me)) as Lobby;
      expect(x.replayPlot).toBe(n);
      expect(x.pair).toBe(pair);
      opens.set(EVENTS[n - 1].id, x.prices[0]);
      // the room learns a number and a pair, and nothing that says what happened or when
      expect(JSON.stringify({ ...x, prices: 0, history: 0 }), `plot ${n}`).not.toMatch(/(19|20)\d\d-\d\d-\d\d|Lehman|Brexit|COVID|Francogeddon/);
    }
    // two plots of one pair are told apart: USD/CNY stood near 8.2 at its 2005 unpegging and
    // near 6.2 at its 2015 devaluation, and each is chosen exactly, every time
    const yuan = EVENTS.flatMap((e, i) => (e.pair === "USD/CNY" ? [{ n: i + 1, date: e.date }] : []));
    const unpegged = yuan.find((p) => p.date.startsWith("2005"))!.n;
    const devalued = yuan.find((p) => p.date.startsWith("2015"))!.n;
    for (const n of [unpegged, devalued, unpegged, devalued]) {
      await act(me, { kind: "choose", what: n, mode: "replay" });
      expect(((await look(me)) as Lobby).prices[0] > 7, `plot ${n}`).toBe(n === unpegged);
    }
    // a visitor with no tab open may not choose, and nobody may name a plot that is not there
    expect((await attempt({ kind: "choose", what: 1, mode: "replay" }, await visitor())).status).toBe(409);
    // one past the last plot, and well past it, are refused as surely as a pair, a string or a fraction
    for (const what of ["nonsense", "EUR/CHF", "3", 0, EVENTS.length + 1, EVENTS.length + 100, -1, 1.5, null]) {
      expect((await act(me, { kind: "choose", what, mode: "replay" })).status, JSON.stringify(what)).toBe(409);
    }
    // and once the countdown has begun, the round is fixed
    await act(me, { kind: "start", mode: "replay" });
    const refused = await act(me, { kind: "choose", what: 1, mode: "replay" });
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
    type Lobby = Seen & { pair: string; pairs: string[] | null; replayPlots: unknown };
    const lobby = (await look(me, "simulation")) as Lobby;
    expect(lobby.pairs!.length).toBeGreaterThanOrEqual(12);
    expect(lobby.replayPlots, "Simulation has no Replay plots").toBeNull();
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
    expect((await act(me, { kind: "buy", leverage: 3, stake: 0.5, sl: 5, tp: 10, mode: "replay" })).status).toBe(200);
    expect((await act(other, { kind: "sell", leverage: 3, mode: "replay" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 200));
    // A replay opens on a day the market broke, so the price may reach my stop or take profit before I close:
    // then the close is refused with nothing to close, and the trade's end is marked as that stop or take instead.
    const closed = await act(me, { kind: "close", mode: "replay" });
    if (closed.status !== 200) expect((await closed.json()).error, "the close was refused for another reason").toBe("Nothing to close.");
    const mine = (await look(me)) as Marked;
    const theirs = (await look(other)) as Marked;
    const opened = mine.marks.find((m) => m.you && m.kind === "open");
    expect(opened, "my open is marked, and flagged as mine").toMatchObject({ side: 1, who: mine.you.code });
    expect(mine.marks.some((m) => m.you && ["close", "stop", "take", "stopout", "zerocut"].includes(m.kind)), "so is the end of my trade, however it came").toBe(true);
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
    // a mark names the moment a trade ended ("stop" or "take" are kinds of that), but never carries a stop's
    // level or a trader's setting for one
    for (const m of mine.marks) expect(Object.keys(m).sort(), "a mark holds no price, level or setting").toEqual(["face", "kind", "side", "tick", "who", "you"]);
    expect(wire, "no stop or take-profit setting is on the wire").not.toMatch(/"sl"|"tp"|"stop":|"take":/);
  } finally {
    for (const t of tabs) t.close();
  }
}, 30_000);

// ADR 0064: a Simulation's news goes out on its day, in the feed and pinned over the chart, as
// a story's number only. Which way the story pushes the price stays on the server: the words
// are the hint, and the wire never says whether a story is real or a rumour.
// ADR 0064, 0085: a Simulation's news is a calendar of named releases, listed when the round opens and told on their
// days; the wire carries the release, its currency and its outcome, as a trader would read them, and never the effect
// the engine gives the price.
it("tells a Simulation's releases on their days, after listing them, and never sends which way they push", async () => {
  s = await server(8096, { TICK_MS: "8", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, look } = app();
  const me = await visitor();
  const tab = await page(me, "simulation");
  try {
    await act(me, { kind: "start", mode: "simulation" });
    const told = new Set<string>();
    const listed = new Set<string>();
    let pinned = false;
    for (const end = Date.now() + 15_000; Date.now() < end; ) {
      const x = (await look(me, "simulation")) as unknown as { phase: string; headline: { release?: Record<string, unknown> } | null; feed: { key: string; args: Record<string, unknown> }[] };
      for (const f of x.feed.filter((f) => f.key === "calendar")) {
        expect(Object.keys(f.args).sort(), "a calendar line has the release and its time").toEqual(["cur", "d", "h", "kind"]);
        listed.add(`${f.args.cur}:${f.args.kind}`);
      }
      for (const f of x.feed.filter((f) => f.key === "release")) {
        expect(Object.keys(f.args).sort(), "a release carries its name, currency and outcome").toEqual(["cur", "kind", "outcome"]);
        expect(["strong", "weak", "inline", "back"]).toContain(f.args.outcome);
        told.add(`${f.args.cur}:${f.args.kind}`);
      }
      if (x.headline?.release) pinned = true;
      expect(JSON.stringify({ feed: x.feed, headline: x.headline }), "the effect is never on the wire").not.toMatch(/"effect"|vshape|"rise"|"fall"|"none"/);
      if (x.phase === "break") break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(listed.size, "the calendar lists two releases or more").toBeGreaterThanOrEqual(2);
    expect(told.size, "and each is told").toBe(listed.size);
    for (const r of told) expect(listed, "nothing is told that was not listed").toContain(r);
    expect(pinned, "a release is pinned over the chart while it is the latest").toBe(true);
    // and the whole calendar travels with every state, so the page can pin it above a feed that scrolls (ADR 0085)
    const last = (await look(me, "simulation")) as unknown as { calendar: { kind: string; cur: string; outcome: string | null }[] };
    expect(last.calendar.map((c) => `${c.cur}:${c.kind}`).sort()).toEqual([...listed].sort());
    expect(last.calendar.every((c) => c.outcome !== null), "by the bell every release has been told").toBe(true);
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

it.each(["replay", "simulation"] as const)("clears a paused %s round when its starter finishes it", async (mode) => {
  s = await server(8096, { TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, look, until } = app();
  const me = await visitor();
  const tab = await page(me, mode);
  try {
    await act(me, { kind: "start", mode });
    await until(me, (x) => x.phase === "trade", 10_000, mode);
    expect((await act(me, { kind: "pause", mode })).status).toBe(200);
    expect((await look(me, mode) as Seen & { paused: number | null }).paused).toBeGreaterThan(0);
    expect((await act(me, { kind: "resume", mode })).status).toBe(200);
    const resumed = await look(me, mode);
    expect((resumed as Seen & { paused: number | null }).paused).toBeNull();
    expect(resumed.phase).toBe("trade");
    expect((await act(me, { kind: "pause", mode })).status).toBe(200);
    expect((await act(me, { kind: "finish", mode })).status).toBe(200);
    const ended = await look(me, mode);
    expect(ended.phase).toBe("break");
    expect((ended as Seen & { paused: number | null }).paused, "the bell must not remain paused").toBeNull();
    expect(ended.result).not.toBeNull();
  } finally {
    tab.close();
  }
});
