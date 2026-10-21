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
  await act(a, { kind: "buy", leverage: 5 });
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
    expect((await debug(cookie, { kind: "start", mode: "history" })).status).toBe(200);
    expect((await state(me)).phase).toBe("trade");
    expect((await debug(cookie, { kind: "end", mode: "history" })).status).toBe(200);
    expect((await state(me)).phase).toBe("break");
    expect((await debug(cookie, { kind: "lobby", mode: "history" })).status).toBe(200);
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
    await debug(cookie, { kind: "start", mode: "history" });
    expect((await act(me, { kind: "buy", leverage: 100, stake: 0.5 })).status).toBe(200);
    expect((await debug(cookie, { kind: "call", mode: "history" })).status).toBe(200);
    const called = await state(me);
    expect((called.you.pos as unknown as { called: boolean }).called).toBe(true);
    expect((await debug(cookie, { kind: "cut", mode: "history" })).status).toBe(200);
    const cut = await state(me);
    expect(cut.you.pos).toBeNull();
    expect(cut.you.cuts).toBe(1);
    // and puts the money back
    expect((await debug(cookie, { kind: "reset-me", mode: "history" })).status).toBe(200);
    expect((await state(me)).you).toMatchObject({ balance: 1_000_000, cuts: 0, debt: 0, pos: null });
  } finally {
    tab.close();
  }
});
