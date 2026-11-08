import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { drawn, GIVEN } from "../public/names.js";
import { client } from "../spec/helpers.ts";
import { type Server, server } from "./server.ts";

let s: Server;
afterEach(() => s?.stop());

// Preload only the disposable child: keep HTTP clients real while controlling
// its external rates or clock, without adding test switches to the application.
const preload = (code: string) => ({ NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(code).replaceAll("'", "%27")}` });

// A newcomer whose cookie points at a held name is dealt the next free one instead, never the owner's; the owner can
// still save their name in any language, and the newcomer still cannot claim it.
it("deals a newcomer a free name, never one held, and lets the owner keep theirs", async () => {
  s = await server(8190);
  const c = client(s.base);
  const owner = await c.visitor();
  const mine = (await c.state(owner)).you;
  const rename = (cookie: string, name: string) => fetch(`${s.base}/api/name`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name }) });
  expect((await rename(owner, mine.name)).status).toBe(200);
  // Pick another visitor whose cookie points at that held draw: they are dealt a different, free name.
  let id: string;
  do {
    id = randomUUID();
  } while (createHash("sha256").update(id).digest().readUInt16BE(1) % GIVEN.length !== mine.draw);
  const newcomer = `v=${id}`;
  const tab = await c.page(newcomer);
  try {
    const dealt = (await c.state(newcomer)).you;
    expect(dealt.named).toBe(false);
    expect(dealt.draw, "never dealt the owner's held name").not.toBe(mine.draw);
    expect(dealt.name).not.toBe(mine.name);
    for (const lang of ["en", "ja", "zh"] as const) {
      const res = await rename(owner, drawn(lang, mine.draw!));
      expect(res.status, lang).toBe(200);
      expect(await res.json()).toEqual({ name: mine.name, draw: mine.draw });
    }
    expect((await rename(newcomer, mine.name)).status).toBe(409);
    expect((await c.state(newcomer)).you.named).toBe(false);
  } finally {
    tab.close();
  }
});

it("refuses malformed dispatch values without stopping the server or exposing a round", async () => {
  s = await server(8190);
  for (const kind of ["__defineGetter__", "constructor", "toString", "__proto__", { toString: null }, [], 7, null]) {
    const res = await fetch(`${s.base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
    expect(res.status, JSON.stringify(kind)).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown action." });
  }
  for (const mode of ["toString", "constructor", "__proto__"]) {
    const res = await fetch(`${s.base}/api/state?mode=${mode}`);
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("rewind");
  }
  const badMode = await client(s.base).attempt({ kind: "buy", leverage: 1, mode: { toString: null } });
  expect(badMode.status).toBe(409);
  expect((await fetch(s.base)).status).toBe(200);
});

it("updates idle pages when people enter, leave or switch markets", async () => {
  s = await server(8190);
  const c = client(s.base);
  const a = await c.page(await c.visitor());
  await a.next(() => true, 1000);
  const b = await c.page(await c.visitor());
  let tutorial: Awaited<ReturnType<typeof c.page>> | undefined;
  let simulation: Awaited<ReturnType<typeof c.page>> | undefined;
  try {
    const joined = await a.next((e) => (e.here as { rewind: number }).rewind === 2, 1000);
    expect(joined?.traders).toHaveLength(9);
    b.close();
    const left = await a.next((e) => (e.here as { rewind: number }).rewind === 1, 1000);
    expect(left).not.toBeNull();
    expect(left?.traders).toHaveLength(8);
    tutorial = await c.page(await c.visitor(), "tutorial");
    simulation = await c.page(await c.visitor(), "random");
    expect(await tutorial.next((e) => (e.here as { random: number }).random === 1, 1000)).not.toBeNull();
    expect(await a.next((e) => (e.here as { random: number }).random === 1, 1000)).not.toBeNull();
  } finally {
    a.close();
    b.close();
    tutorial?.close();
    simulation?.close();
  }
});

it("uses a successful latest-rate fetch for the first Random round, including concurrent starts", async () => {
  s = await server(8190, {
    TICK_MS: "20",
    COUNTDOWN_TICKS: "1",
    CHOOSE_MS: "0",
    ...preload(`globalThis.fetch = async () => {
      await new Promise(r => setTimeout(r, 150));
      return { ok: true, json: async () => ({ date: "2026-10-30", rates: { USD: 2, JPY: 200, GBP: 1, CHF: 1, AUD: 1, CNY: 10 } }) };
    };`),
  });
  const c = client(s.base);
  const me = await c.visitor();
  const unopened = await c.state(me, "random");
  expect((await c.attempt({ kind: "start", mode: "random" }, me)).status).toBe(409);
  expect((await c.state(me, "random")).prices).toEqual(unopened.prices);
  const tab = await c.page(me, "random");
  try {
    await c.act(me, { kind: "choose", what: "USD/JPY", mode: "random" });
    const starts = await Promise.all([c.act(me, { kind: "start", mode: "random" }), c.act(me, { kind: "start", mode: "random" })]);
    expect(starts.map((r) => r.status).sort()).toEqual([200, 409]);
    const trading = await tab.next((e) => e.phase === "trade", 2000);
    expect((trading?.prices as number[])[0]).toBe(100);
    await c.act(me, { kind: "finish", mode: "random" });
    const bell = await c.state(me, "random") as unknown as { result: { facts: { from: string; source: string } } };
    expect(bell.result.facts.from).toBe("2026-10-30");
    expect(bell.result.facts.source).toContain("Frankfurter");
  } finally {
    tab.close();
  }
});

it("keeps the lobby's opening market when the rate service is unavailable", async () => {
  s = await server(8190, {
    TICK_MS: "20", COUNTDOWN_TICKS: "1",
    ...preload('globalThis.fetch = async () => { throw new Error("offline"); };'),
  });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me, "random");
  try {
    const before = await c.state(me, "random");
    expect((await c.act(me, { kind: "start", mode: "random" })).status).toBe(200);
    expect(await tab.next((e) => e.phase === "trade", 2000)).not.toBeNull();
    const trading = await c.state(me, "random");
    expect(trading.pair).toBe(before.pair);
    expect(trading.prices.slice(0, before.prices.length)).toEqual(before.prices);
    expect(trading.history).toEqual(before.history);
  } finally {
    tab.close();
  }
});

it("ignores a failed latest-rate reply, even one that carries a body", async () => {
  s = await server(8190, {
    TICK_MS: "20", COUNTDOWN_TICKS: "1",
    ...preload('globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ date: "2026-10-30", rates: { USD: 2, JPY: 200, GBP: 1, CHF: 1, AUD: 1, CNY: 10 } }) });'),
  });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me, "random");
  try {
    const before = await c.state(me, "random");
    expect((await c.act(me, { kind: "start", mode: "random" })).status).toBe(200);
    expect(await tab.next((e) => e.phase === "trade", 2000)).not.toBeNull();
    expect((await c.state(me, "random")).prices[0]).toBe(before.prices[0]);
  } finally {
    tab.close();
  }
});

it("ends the bell within five minutes of game time despite repeated holds", async () => {
  s = await server(8190, {
    COUNTDOWN_TICKS: "1",
    ...preload(`const interval = globalThis.setInterval;
      globalThis.setInterval = (fn, ms, ...args) => interval(fn, ms === 500 ? 1 : ms, ...args);`),
  });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me);
  try {
    await c.act(me, { kind: "start" });
    expect(await tab.next((e) => e.phase === "trade", 1000)).not.toBeNull();
    await c.act(me, { kind: "finish" });
    expect((await c.state(me)).phase).toBe("break");
    let state = await c.state(me);
    for (const until = Date.now() + 2500; state.phase === "break" && Date.now() < until;) {
      await c.act(me, { kind: "hold" });
      await new Promise((r) => setTimeout(r, 10));
      state = await c.state(me);
    }
    expect(state.phase).toBe("lobby");
  } finally {
    tab.close();
  }
});

it("keeps the chosen face on Tutorial and on its hall of fame", async () => {
  s = await server(8190, { TICK_MS: "20", COUNTDOWN_TICKS: "1" });
  const c = client(s.base);
  const me = await c.visitor();
  const tab = await c.page(me);
  try {
    expect((await fetch(`${s.base}/api/face`, { method: "POST", headers: { cookie: me, "content-type": "application/json" }, body: JSON.stringify({ face: "p3" }) })).status).toBe(200);
    await c.act(me, { kind: "start" });
    expect(await tab.next((e) => e.phase === "trade", 1000)).not.toBeNull();
    await c.act(me, { kind: "buy", leverage: 1 });
    await c.act(me, { kind: "finish" });
    const tutorial = await c.state(me, "tutorial") as unknown as { you: { face: string }; career: { you: boolean; face: string }[]; minRounds: number };
    expect(tutorial.you.face).toBe("p3");
    expect(tutorial.career.find((r) => r.you)?.face).toBe("p3");
    expect(tutorial.minRounds).toBe(3);
  } finally {
    tab.close();
  }
});
