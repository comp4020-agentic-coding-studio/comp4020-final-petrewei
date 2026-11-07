import { expect, it } from "vitest";
import { LEVERAGES, RULES } from "../src/fx.ts";
import { act, live, open, page, state, visitor } from "./helpers.ts";

// Rewind and Random are two markets, chosen by tab, running side by side:
// each has its own round, price and room, and a trade on one never shows
// on the other. Read-only checks run against the live app too.

it("runs a Rewind and a Random at the same time", async () => {
  const past = await state(undefined, "rewind");
  const now = await state(undefined, "random");
  expect(past.mode).toBe("rewind");
  expect(past.simulated).toBe(false);
  expect(now.mode).toBe("random");
  expect(now.simulated).toBe(true);
});

// ADR 0091: the tabs' old ids, from before they were renamed, and the names before those, lead to the tabs they
// became, so a page loaded before a deploy and an old link still reach the right market.
it("takes every old name of a tab as that tab", async () => {
  for (const [old, now] of [["replay", "rewind"], ["history", "rewind"], ["simulation", "random"], ["scenario", "random"], ["marathon", "live"]] as const) {
    expect((await state(undefined, old as "rewind")).mode, old).toBe(now);
  }
});

it("treats an unknown mode as Rewind", async () => {
  expect((await state(undefined, "bogus" as "rewind")).mode).toBe("rewind");
});

it("streams only the chosen market to a page", async () => {
  const p = await page(undefined, "random");
  try {
    const first = (await p.next(() => true, 2000)) as { mode: string };
    expect(first.mode).toBe("random");
  } finally {
    p.close();
  }
});

// A trade is the room's business on its own tab only: another market's page, and a visitor's
// private tutorial, never see it. Both directions, since each is its own way to leak.
it.skipIf(live)("keeps a trade on one tab off every other tab, in both directions", async () => {
  for (const [from, other] of [["random", "rewind"], ["rewind", "random"]] as const) {
    const trader = await visitor();
    const onSame = await page(await visitor(), from);
    const onOther = await page(await visitor(), other);
    const onTutorial = await page(await visitor(), "tutorial");
    const own = await page(trader, from);
    const me = (await own.next(() => true, 2000)) as { you: { code: string } };
    // by short code, which is unique; a dealt name can be shared by two visitors
    const shows = (e: Record<string, unknown>): boolean => ((e.traders as { id: string; side: number }[] | undefined) ?? []).some((t) => t.id === me.you.code && t.side === 1);
    try {
      await open(8, from);
      const seenHere = onSame.next(shows, 1000);
      const seenElsewhere = onOther.next(shows, 1500);
      const seenInTutorial = onTutorial.next(shows, 1500);
      expect((await act(trader, { kind: "buy", leverage: 3, share: 0.25, mode: from })).status, from).toBe(200);
      expect(await seenHere, `${from} page sees the trade`).not.toBeNull();
      expect(await seenElsewhere, `${other} page must not see a ${from} trade`).toBeNull();
      expect(await seenInTutorial, `a tutorial page must not see a ${from} trade`).toBeNull();
      expect((await state(trader, from)).you.pos).not.toBeNull();
      expect((await state(trader, other)).you.pos).toBeNull();
    } finally {
      onSame.close();
      onOther.close();
      onTutorial.close();
      own.close();
    }
  }
});

it.skipIf(live)("counts who is on each tab", async () => {
  const p = await page(await visitor(), "random");
  try {
    const seen = (await p.next(() => true, 2000)) as { here: { random: number } };
    expect(seen.here.random).toBeGreaterThanOrEqual(1);
  } finally {
    p.close();
  }
});

// ADR 0062, ADR 0075: a round is shown after a stretch of the market before it, which a whole state carries once, so
// the chart opens full. How long that stretch and the round are is the market's own business, and has changed, so this
// holds what the page relies on and not the length: the history ends on the open, and the round's length is its prices.
// A rewind's history is real prices with no date anywhere in it, so the hidden day stays hidden.
it("sends the market before a round with a whole state, ending where the round opens", async () => {
  for (const mode of ["rewind", "random"] as const) {
    const s = await state(undefined, mode);
    expect(s.history!.length, `${mode} has a history to draw`).toBeGreaterThan(s.steps);
    expect((s.history!.length - 1) % s.steps, `${mode}: the history is a whole number of candles`).toBe(0);
    expect(s.total, `${mode}: the round's length is its prices`).toBeGreaterThan(s.steps);
    expect(s.total % s.steps, `${mode}: the round is a whole number of candles`).toBe(0);
    for (const p of s.history!) expect(Number.isFinite(p) && p > 0, mode).toBe(true);
    if (s.tick === 0) expect(s.history!.at(-1), `${mode}: the history ends on the open`).toBeCloseTo(s.prices[0], 9);
  }
});

it("keeps every date out of a rewind's history and prices", async () => {
  const s = await state(undefined, "rewind");
  expect(JSON.stringify({ h: s.history, p: s.prices })).not.toMatch(/(19|20)\d\d-\d\d-\d\d/);
});

// The page keeps no copy of the broker's numbers: every state carries them, so a change
// on the server shows on the page without an edit there.
it("sends the desk's own numbers with every state, so a page keeps no copy", async () => {
  for (const mode of ["rewind", "random"] as const) {
    const s = await state(undefined, mode);
    // what the desk itself says: tuning one of these changes this, and nothing else
    expect(s.desk, mode).toMatchObject({ cap: RULES.cap, fee: RULES.fee, step: RULES.step, limit: RULES.limit, tiers: RULES.tiers });
    expect(s.desk.ticksPerMinute, mode).toBeGreaterThan(0);
    expect(s.leverages, mode).toEqual(LEVERAGES);
    expect(s.desk.distances, mode).toEqual(RULES.distances);
    expect(s.leverages, mode).toContain(s.desk.cap);
  }
});

