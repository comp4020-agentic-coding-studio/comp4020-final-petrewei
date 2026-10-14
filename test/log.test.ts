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
  await open(30);
  await act(a, { kind: "buy", leverage: 5 });
  for (let i = 0; i < 400 && (await state()).phase !== "break"; i++) await new Promise((r) => setTimeout(r, 20));
  const bell = await state(await visitor());
  expect(bell.phase).toBe("break");
  expect(JSON.stringify(bell)).not.toContain(a.slice(2));
}, 20_000);
