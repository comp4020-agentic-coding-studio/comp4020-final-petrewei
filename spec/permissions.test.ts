import { expect, it } from "vitest";
import { act, attempt, baseUrl, live, open, page, sleep, state, type Trader, visitor } from "./helpers.ts";

// ADR 0010: the server decides who may see and change what. A person acts
// only through their own cookie, on their own account; the page is told
// everyone's side, leverage and net worth, but never their cookie or stop.

it("refuses an order the broker does not offer, changing nothing", async () => {
  const me = await visitor();
  for (const body of [{ kind: "buy", leverage: 7 }, { kind: "buy", leverage: 25 }, { kind: "buy", leverage: 30, stake: 2 }, { kind: "sell", leverage: 30, stake: -1 }, { kind: "hack" }, { kind: "borrow" }, { kind: "stop", pct: 1 }, { kind: "stop", at: 1 }]) {
    const res = await attempt(body, me);
    expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toEqual(expect.any(String));
  }
  const s = await state(me);
  expect(s.you).toMatchObject({ balance: s.start, pos: null, debt: 0 });
});

it("refuses a body too large to be an order, counted in bytes", async () => {
  const me = await visitor();
  expect((await attempt({ kind: "pray", pad: "x".repeat(2000) }, me)).status).toBe(400);
  // 600 two-byte letters: 600 characters, but 1,200 bytes
  expect((await attempt({ kind: "pray", pad: "é".repeat(600) }, me)).status).toBe(400);
});

it("refuses a body that is JSON but not an order, and keeps running", async () => {
  for (const raw of ["null", "42", '"buy"', "[]", "{"]) {
    const res = await fetch(new URL("/api/act", baseUrl), { method: "POST", headers: { "content-type": "application/json" }, body: raw });
    expect(res.status, raw).toBe(400);
  }
  expect((await fetch(new URL("/", baseUrl))).status).toBe(200);
});

it.skipIf(live)("acts only on the sender's own account", async () => {
  const a = await visitor();
  const b = await visitor();
  await open();
  expect((await act(a, { kind: "buy", leverage: 10, stake: 0.5 })).status).toBe(200);
  // b cannot close or stop a's position: b has none of their own
  expect((await act(b, { kind: "close" })).status).toBe(409);
  expect((await act(b, { kind: "stop", at: 0.0001 })).status).toBe(409);
  expect((await state(a)).you.pos).toMatchObject({ side: 1, leverage: 10 });
  expect((await state(b)).you.pos).toBeNull();
});

it.skipIf(live)("refuses an order the broker does not offer, even one that would close a position", async () => {
  const a = await visitor();
  await open();
  await act(a, { kind: "buy", leverage: 10, stake: 0.5 });
  expect((await act(a, { kind: "sell", leverage: 7 })).status).toBe(409);
  expect((await act(a, { kind: "sell", leverage: 10, stake: 99 })).status).toBe(409);
  expect((await state(a)).you.pos).toMatchObject({ side: 1 });
});

it.skipIf(live)("never shows a person's cookie, stop or take profit to anyone else", async () => {
  const a = await visitor();
  const b = await visitor();
  await open();
  await act(a, { kind: "sell", leverage: 5, stake: 0.5 });
  // the page asks for each a percentage away; the server sets the level
  expect((await act(a, { kind: "stop", pct: 5 })).status).toBe(200);
  expect((await act(a, { kind: "take", pct: 3 })).status).toBe(200);
  const pos = (await state(a)).you.pos as unknown as { stop: number; take: number };
  const price = (await state(a)).prices.at(-1)!;
  expect(pos.stop).toBeGreaterThan(price);
  expect(pos.take).toBeLessThan(price);
  const seen = JSON.stringify(await state(b));
  expect(seen).not.toContain(a.slice(2));
  expect(seen).not.toContain(String(pos.stop));
  expect(seen).not.toContain(String(pos.take));
});

// ADR 0032: a stop loss and take profit may ride on an order, as
// distances; the server sets them at its own price when it opens.
it.skipIf(live)("attaches a stop loss and take profit sent with an order", async () => {
  const a = await visitor();
  await open();
  expect((await act(a, { kind: "buy", leverage: 10, stake: 0.5, sl: 2, tp: 4 })).status).toBe(200);
  const s = await state(a);
  const pos = s.you.pos as unknown as { stop: number; take: number; entry: number };
  expect(pos.stop).toBeLessThan(pos.entry);
  expect(pos.take).toBeGreaterThan(pos.entry);
  // out of range opens nothing
  const b = await visitor();
  const res = await act(b, { kind: "buy", leverage: 10, sl: 70 });
  expect(res.status).toBe(409);
  expect((await state(b)).you.pos).toBeNull();
});

// A replay's dates are the round's secret until the bell, so the page is
// sent day numbers and prices, never a date or the event's name.
it("keeps a replay's dates from the page until the bell", async () => {
  const s = await state();
  const text = JSON.stringify({ ...s, result: null, feed: s.feed.filter((f) => !f.text.startsWith("That was")) });
  if (s.phase === "trade") {
    expect(text).not.toMatch(/(19|20)\d\d-\d\d-\d\d/);
    for (const name of ["Francogeddon", "Lehman", "Brexit", "COVID", "carry trade", "unwind"]) expect(text).not.toContain(name);
  }
});

// The room lists who is there: the bots, people with the page open, and
// anyone still holding a position. A visitor who looked and left is not a
// trader, so they don't crowd the ranking.
it.skipIf(live)("lists only people present or trading", async () => {
  const idle = await visitor();
  await open();
  const glance = await page(idle);
  await glance.next(() => true, 2000);
  glance.close();
  await sleep(200);
  const p = await page(await visitor());
  try {
    // By short code, not name: names are drawn from a few hundred, so a
    // trader already in the room can share the idle visitor's.
    const seen = (await p.next(() => true, 2000)) as { traders: Trader[]; you: { code: string } };
    const codes = seen.traders.map((t) => t.id);
    expect(codes).toContain(seen.you.code);
    expect(codes).not.toContain((await state(idle)).you.code);
  } finally {
    p.close();
  }
});

// Crit 10: classmates are narrated by trader name and short code, so the
// page tells each person both, and the log shows that same code for them.
it("tells a visitor their own trader name and short code on the page", async () => {
  const me = await visitor();
  const s = (await state(me)) as unknown as { you: { name: string; code: string } };
  expect(s.you.name).toMatch(/^[A-Z][a-z]+$/);
  expect(s.you.code).toMatch(/^[0-9a-f]{6}$/);
  expect(me).not.toContain(s.you.code);
  expect(await (await fetch(new URL("/", baseUrl))).text()).toContain('id="whoami"');
});

// The order ticket shows the price a buy and a sell would fill at. The
// spread is the broker's rule, so the server sends both prices; the page
// never works one out.
it("sends the buy and sell price, the spread apart, around the price", async () => {
  const s = (await state()) as unknown as { prices: number[]; bid: number; ask: number };
  const mid = s.prices.at(-1)!;
  expect(s.bid).toBeLessThan(mid);
  expect(s.ask).toBeGreaterThan(mid);
  expect((s.ask - s.bid) / mid).toBeCloseTo(0.0002, 6);
});

it.skipIf(live)("tells a trader their own margin lines, and nobody theirs", async () => {
  const me = await visitor();
  await open();
  expect((await act(me, { kind: "buy", leverage: 100, stake: 0.5 })).status).toBe(200);
  const s = (await state(me)) as unknown as { you: { pos: { entry: number; call: number; cut: number } }; traders: Record<string, unknown>[] };
  expect(s.you.pos.call).toBeLessThan(s.you.pos.entry);
  expect(s.you.pos.cut).toBeLessThan(s.you.pos.call);
  // whether the broker is calling now, for the page's warning
  expect((s.you.pos as unknown as { called: boolean }).called).toBe(false);
  const other = await state(await visitor());
  expect(JSON.stringify(other)).not.toContain(String(s.you.pos.call));
});
