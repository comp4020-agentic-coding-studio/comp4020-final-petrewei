import { afterEach, expect, it } from "vitest";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

// Crit 10 and ADR 0010: the server logs who did what by short code, the log
// and the hall of fame outlive a hard kill, and only the holder of
// STATS_KEY may read the log. A server of its own, with a fast clock.
const KEY = "test-key-log-0123456789abcdef";
type Line = { t: string; who: string; name?: string; ev: string; side?: string; leverage?: number };
type Log = { here: number; recent: Line[] };
let s: Server;
afterEach(() => s.stop());

const log = async (): Promise<Log> => (await fetch(`${s.base}/api/log?key=${KEY}`)).json() as Promise<Log>;
const app = () => client(s.base);

it("opens the log with the key, and to nobody else", async () => {
  s = await server(8097, { STATS_KEY: KEY });
  expect((await fetch(`${s.base}/log?key=${KEY}`)).status).toBe(200);
  expect((await fetch(`${s.base}/api/log?key=${KEY}`)).status).toBe(200);
  for (const q of ["", "?key=wrong", `?key=${KEY}x`]) expect((await fetch(`${s.base}/api/log${q}`)).status).toBe(404);
});

it("is shut to everyone when no key is set", async () => {
  s = await server(8097);
  expect((await fetch(`${s.base}/api/log?key=`)).status).toBe(404);
});

it("tells two traders apart by short code and name, never by cookie", async () => {
  s = await server(8097, { STATS_KEY: KEY, TICK_MS: "100" });
  const { visitor, act, open } = app();
  const a = await visitor();
  const b = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 25 });
  await act(b, { kind: "sell", leverage: 5 });
  const trades = (await log()).recent.filter((l) => l.ev === "open" && l.side);
  const buy = trades.find((l) => l.side === "buy" && l.leverage === 25)!;
  const sell = trades.find((l) => l.side === "sell" && l.leverage === 5)!;
  expect(buy.who).toMatch(/^[0-9a-f]{6}$/);
  expect(sell.who).toMatch(/^[0-9a-f]{6}$/);
  expect(buy.who).not.toBe(sell.who);
  expect(buy.name).toEqual(expect.any(String));
  expect(JSON.stringify(await log())).not.toContain(a.slice(2));
  // the bots trade too, but only people's lines are kept
  expect((await log()).recent.some((l) => l.who.startsWith("bot:"))).toBe(false);
}, 20_000);

it("keeps the log and the hall of fame through a hard kill", async () => {
  s = await server(8097, { STATS_KEY: KEY, TICK_MS: "10" });
  const { visitor, act, open, state } = app();
  const a = await visitor();
  await open(30);
  // a wipe-out at 1000x is recorded at once, before the round ends
  await act(a, { kind: "buy", leverage: 1000 });
  let busted = false;
  for (let i = 0; i < 200 && !busted; i++) {
    busted = (await log()).recent.some((l) => l.ev === "stopout" || l.ev === "zerocut");
    if (!busted) {
      await new Promise((r) => setTimeout(r, 25));
      const st = await state(a);
      if (!st.you.pos && !st.you.out && !st.you.broke) await act(a, { kind: "buy", leverage: 1000 });
    }
  }
  expect(busted).toBe(true);
  const fame = async () => (await state(a)).career;
  expect((await fame()).find((c) => c.you)?.busts).toBeGreaterThanOrEqual(1);

  s.proc.kill("SIGKILL");
  await new Promise((r) => s.proc.once("exit", r));
  await s.restart();
  expect((await log()).recent.some((l) => l.ev === "stopout" || l.ev === "zerocut")).toBe(true);
  expect((await fame()).find((c) => c.you)?.busts).toBeGreaterThanOrEqual(1);
}, 30_000);

// ADR 0010: the bell's ranking names everyone who traded, by trader name;
// it must not carry their cookies, any more than the room does.
it("keeps cookies out of the bell's ranking", async () => {
  s = await server(8097, { TICK_MS: "10" });
  const { visitor, act, open, state } = app();
  const a = await visitor();
  const b = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  // b's own reading of the bell, taken in the same request that sees it
  let bell = await state(b);
  for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(b);
  expect(bell.phase).toBe("break");
  expect(JSON.stringify(bell)).not.toContain(a.slice(2));
}, 20_000);

// A career starts with a trade: someone who only watched a round gets no
// row in the hall of fame, so it lists players, not passers-by.
it("gives a career to traders, not watchers", async () => {
  s = await server(8097, { TICK_MS: "10" });
  const { visitor, act, open, page, state } = app();
  const trader = await visitor();
  const watcher = await visitor();
  const watching = await page(watcher);
  await open(30);
  await act(trader, { kind: "buy", leverage: 5 });
  let bell = await state(trader);
  for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(trader);
  watching.close();
  expect(bell.career.filter((c) => c.rounds > 0)).toHaveLength(1);
  expect(bell.career[0].you).toBe(true);
  expect((await state(watcher)).career.some((c) => c.you)).toBe(false);
}, 20_000);

// After the bell a market goes back to the lobby and waits, rather than
// starting the next round by itself.
it("returns to the lobby after the bell, and stays there", async () => {
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { open, state } = app();
  expect((await state()).phase).toBe("lobby");
  await open(30);
  let seen = await state();
  for (const until = Date.now() + 15_000; seen.phase !== "lobby" && Date.now() < until; ) seen = await state();
  expect(seen.phase).toBe("lobby");
  await new Promise((r) => setTimeout(r, 500));
  expect((await state()).phase).toBe("lobby");
}, 30_000);

// Crit 10 is narrated from `flyctl logs`, the server's stdout. The bots
// trade every few seconds and would bury two classmates' lines, so they
// print nothing; their results still close each round's "end" line.
it("prints people's actions and rounds to stdout, never the bots'", async () => {
  s = await server(8097, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  const { visitor, act, open, state } = app();
  const a = await visitor();
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  let seen = await state();
  for (const until = Date.now() + 15_000; seen.phase !== "break" && seen.phase !== "lobby" && Date.now() < until; ) seen = await state();
  const lines = s.out.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l) as Line);
  expect(lines.some((l) => l.ev === "open" && /^[0-9a-f]{6}$/.test(l.who))).toBe(true);
  expect(lines.some((l) => l.ev === "end")).toBe(true);
  expect(lines.filter((l) => l.who.startsWith("bot:"))).toEqual([]);
}, 30_000);
