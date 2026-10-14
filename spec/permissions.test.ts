import { expect, it } from "vitest";
import { act, attempt, live, open, page, sleep, state, type Trader, visitor } from "./helpers.ts";

// ADR 0010: the server decides who may see and change what. A person acts
// only through their own cookie, on their own account; the page is told
// everyone's side, leverage and net worth, but never their cookie or stop.

it("refuses an order the broker does not offer, changing nothing", async () => {
  const me = await visitor();
  for (const body of [{ kind: "buy", leverage: 7 }, { kind: "buy", leverage: 25, stake: 2 }, { kind: "sell", leverage: 25, stake: -1 }, { kind: "hack" }, { kind: "borrow" }]) {
    const res = await attempt(body, me);
    expect(res.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toEqual(expect.any(String));
  }
  const s = await state(me);
  expect(s.you).toMatchObject({ balance: s.start, pos: null, debt: 0 });
});

it("refuses a body too large to be an order", async () => {
  const res = await attempt({ kind: "buy", leverage: 25, pad: "x".repeat(2000) }, await visitor());
  expect(res.status).toBe(400);
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

it.skipIf(live)("never shows a person's cookie or stop to anyone else", async () => {
  const a = await visitor();
  const b = await visitor();
  await open();
  await act(a, { kind: "sell", leverage: 5, stake: 0.5 });
  const price = (await state(a)).prices.at(-1)!;
  expect((await act(a, { kind: "stop", at: price * 1.05 })).status).toBe(200);
  const seen = JSON.stringify(await state(b));
  expect(seen).not.toContain(a.slice(2));
  expect(seen).not.toContain(String(price * 1.05));
  expect((await state(a)).you.pos?.stop).toBeCloseTo(price * 1.05);
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
    const seen = (await p.next(() => true, 2000)) as { traders: Trader[]; you: { name: string } };
    const names = seen.traders.map((t) => t.name);
    expect(names).toContain(seen.you.name);
    expect(names).not.toContain((await state(idle)).you.name);
  } finally {
    p.close();
  }
});
