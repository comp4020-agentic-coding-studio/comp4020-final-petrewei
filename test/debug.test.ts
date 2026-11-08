import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// ADR 0019: the hidden debug mode. Only the operator, holding STATS_KEY,
// may turn it on; it is a signed cookie, never the key; everyone else
// gets a 404 for its script and its actions, which change nothing.
const KEY = "test-key-debug-0123456789abcdef";
let s: Server;
afterEach(() => s.stop());

const app = () => client(s.base);
// Turning debug on: the page with ?debug=KEY sets the debug cookie.
async function debugCookie(visitor: string): Promise<string> {
  const res = await fetch(`${s.base}/?debug=${KEY}`, { headers: { cookie: visitor }, redirect: "manual" });
  const set = res.headers.get("set-cookie") ?? "";
  const dbg = set.match(/dbg=[^;]+/)?.[0];
  if (!dbg) throw new Error(`no debug cookie: ${res.status} ${set}`);
  return `${visitor}; ${dbg}`;
}
const debug = (cookie: string | undefined, body: unknown) =>
  fetch(`${s.base}/api/debug`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

it("turns on only with the key, and never puts the key in the cookie", async () => {
  s = await server(8098, { STATS_KEY: KEY });
  const { visitor } = app();
  const me = await visitor();
  for (const q of ["", "?debug=", "?debug=wrong", `?debug=${KEY}x`]) {
    const res = await fetch(`${s.base}/${q}`, { headers: { cookie: me } });
    expect(res.headers.get("set-cookie") ?? "", q).not.toContain("dbg=");
  }
  const cookie = await debugCookie(me);
  expect(cookie).not.toContain(KEY);
  // the debug script is served with debug on, and to nobody else
  expect((await fetch(`${s.base}/debug.js`, { headers: { cookie } })).status).toBe(200);
  expect((await fetch(`${s.base}/debug.js`, { headers: { cookie: me } })).status).toBe(404);
});

it("is shut to everyone when no key is set", async () => {
  s = await server(8098);
  const { visitor } = app();
  const me = await visitor();
  const res = await fetch(`${s.base}/?debug=`, { headers: { cookie: me } });
  expect(res.headers.get("set-cookie") ?? "").not.toContain("dbg=");
  expect((await debug(me, { kind: "status" })).status).toBe(404);
});

it("refuses debug actions without debug mode, or with a forged or another's cookie", async () => {
  s = await server(8098, { STATS_KEY: KEY });
  const { visitor } = app();
  const me = await visitor();
  const other = await visitor();
  const mine = await debugCookie(me);
  const dbg = mine.match(/dbg=[^;]+/)![0];
  for (const cookie of [undefined, me, `${me}; dbg=forged`, `${other}; ${dbg}`]) {
    expect((await debug(cookie, { kind: "status" })).status, String(cookie)).toBe(404);
  }
  expect((await debug(mine, { kind: "status" })).status).toBe(200);
});

it("resets the hall of fame, and logs who did it", async () => {
  s = await server(8098, { STATS_KEY: KEY, TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open, state } = app();
  const a = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 3 });
  let bell = await state(a);
  for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(a);
  expect(bell.career.length).toBeGreaterThan(0);
  const cookie = await debugCookie(a);
  expect((await debug(cookie, { kind: "reset-fame" })).status).toBe(200);
  expect((await state(a)).career).toEqual([]);
  // it stays reset through a restart
  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));
  await s.restart();
  expect((await state(a)).career).toEqual([]);
  const log = (await (await fetch(`${s.base}/api/log?key=${KEY}`)).json()) as { recent: { ev: string; action?: string }[] };
  expect(log.recent.some((l) => l.ev === "debug" && l.action === "reset-fame")).toBe(true);
}, 20_000);

it("starts a round, ends it at the bell, and skips the break", async () => {
  s = await server(8098, { STATS_KEY: KEY });
  const { visitor, page, state } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    const cookie = await debugCookie(me);
    expect((await state(me)).phase).toBe("lobby");
    expect((await debug(cookie, { kind: "start", mode: "rewind" })).status).toBe(200);
    expect((await state(me)).phase).toBe("trade");
    expect((await debug(cookie, { kind: "end", mode: "rewind" })).status).toBe(200);
    expect((await state(me)).phase).toBe("break");
    expect((await debug(cookie, { kind: "lobby", mode: "rewind" })).status).toBe(200);
    expect((await state(me)).phase).toBe("lobby");
  } finally {
    tab.close();
  }
});

it("puts the debugger in a margin call or a losscut, to see the warnings", async () => {
  s = await server(8098, { STATS_KEY: KEY });
  const { visitor, page, state, act } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    const cookie = await debugCookie(me);
    await debug(cookie, { kind: "start", mode: "rewind" });
    expect((await act(me, { kind: "buy", leverage: 100, share: 0.5 })).status).toBe(200);
    expect((await debug(cookie, { kind: "call", mode: "rewind" })).status).toBe(200);
    const called = await state(me);
    expect((called.you.pos as unknown as { called: boolean }).called).toBe(true);
    expect((await debug(cookie, { kind: "cut", mode: "rewind" })).status).toBe(200);
    const cut = await state(me);
    expect(cut.you.pos).toBeNull();
    expect(cut.you.cuts).toBe(1);
    // and puts the money back
    expect((await debug(cookie, { kind: "reset-me", mode: "rewind" })).status).toBe(200);
    expect((await state(me)).you).toMatchObject({ balance: 10_000, cuts: 0, debt: 0, pos: null });
  } finally {
    tab.close();
  }
});

// The bell ends a pause as well as trading, from whichever way a round ends: the console's End is one,
// the starter's Finish another (checked in rounds.test.ts). A pause left standing would show Resume in the bell.
it("ends a paused round with no pause left standing", async () => {
  s = await server(8098, { STATS_KEY: KEY, TICK_MS: "50", COUNTDOWN_TICKS: "2" });
  const { visitor, page, act, state } = app();
  const me = await visitor();
  const tab = await page(me);
  try {
    const cookie = await debugCookie(me);
    expect((await debug(cookie, { kind: "start", mode: "rewind" })).status).toBe(200);
    expect((await act(me, { kind: "pause", mode: "rewind" })).status).toBe(200);
    expect(((await state(me)) as unknown as { paused: number | null }).paused, "it is paused").toBeGreaterThan(0);
    expect((await debug(cookie, { kind: "end", mode: "rewind" })).status).toBe(200);
    const bell = (await state(me)) as unknown as { phase: string; paused: number | null };
    expect(bell.phase).toBe("break");
    expect(bell.paused, "the bell must not remain paused").toBeNull();
  } finally {
    tab.close();
  }
});

// The operator can remove one Live account by the short code the board shows, such as a test account left on it; it is
// gone from the board and stays gone through a restart, the removal is logged, and nobody without the key can do it.
it("removes one Live account by its short code, for the operator alone", async () => {
  const { createServer } = await import("node:http");
  const { spark } = await import("./yahoo-fake.ts");
  const feed = createServer((_req, res) => {
    const t = Math.floor(Date.now() / 1000);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(spark(t, [t - 1800, t - 900])));
  }).listen(8096);
  try {
    s = await server(8098, { STATS_KEY: KEY, LIVE_FEED: "http://localhost:8096", LIVE_NEWS: "off", LIVE_POLL_MS: "200" });
    const { visitor, page, act } = app();
    const junk = await visitor();
    const keep = await visitor();
    const tab = await page(junk, "live");
    const board = async () => ((await (await fetch(`${s.base}/api/state?mode=live`, { headers: { cookie: keep } })).json()) as { board: { code?: string; key?: string; name: string }[]; live: boolean });
    try {
      for (let i = 0; i < 50 && !(await board()).live; i++) await new Promise((r) => setTimeout(r, 100));
      // a buy just after a fifteen-minute slot turns can meet Live settling the slot for the first account's position,
      // a brief wait by design; this check is about removal, so it buys once Live accepts, failing if it never does
      for (const who of [junk, keep]) {
        let status = 0;
        for (let i = 0; i < 30 && status !== 200; i++) {
          status = (await act(who, { kind: "buy", mode: "live", leverage: 1, share: 0.25 })).status;
          if (status !== 200) await new Promise((r) => setTimeout(r, 200));
        }
        expect(status).toBe(200);
      }
    } finally {
      tab.close();
    }
    const code = ((await (await fetch(`${s.base}/api/state?mode=live`, { headers: { cookie: junk } })).json()) as { you: { code: string } }).you.code;
    expect((await board()).board.length).toBe(2);
    // a visitor without the key cannot remove an account
    expect((await debug(keep, { kind: "remove-live", code })).status).toBe(404);
    const cookie = await debugCookie(keep);
    expect((await debug(cookie, { kind: "remove-live", code: "zzzzzz" })).status, "no such account").toBe(409);
    expect((await debug(cookie, { kind: "remove-live", name: "nobody-has-this" })).status, "no such name").toBe(409);
    // the board shows names, not codes, so the operator removes by the name it shows
    const junkName = ((await (await fetch(`${s.base}/api/state?mode=live`, { headers: { cookie: junk } })).json()) as { you: { name: string } }).you.name;
    expect((await debug(cookie, { kind: "remove-live", name: junkName })).status).toBe(200);
    expect((await board()).board.map((r) => r.name), "only the kept account left").not.toContain(junkName);
    expect((await board()).board.length).toBe(1);
    s.proc.kill("SIGTERM");
    await new Promise((r) => s.proc.once("exit", r));
    await s.restart();
    // the board lists running accounts once Live has a price again, so wait for it before reading
    const reopened = await page(keep, "live");
    try {
      for (let i = 0; i < 50 && !(await board()).live; i++) await new Promise((r) => setTimeout(r, 100));
      expect((await board()).board.length, "still gone after a restart").toBe(1);
    } finally {
      reopened.close();
    }
    const log = (await (await fetch(`${s.base}/api/log?key=${KEY}`)).json()) as { recent: { ev: string; action?: string }[] };
    expect(log.recent.some((l) => l.ev === "debug" && l.action === "remove-live")).toBe(true);
  } finally {
    feed.close();
  }
}, 40_000);
