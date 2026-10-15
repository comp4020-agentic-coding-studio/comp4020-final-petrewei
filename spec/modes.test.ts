import { expect, it } from "vitest";
import { act, live, open, page, state, visitor } from "./helpers.ts";

// History and Live are two markets, chosen by tab, running side by side:
// each has its own round, price and room, and a trade on one never shows
// on the other. Read-only checks run against the live app too.

it("runs a History replay and a Live simulation at the same time", async () => {
  const history = await state(undefined, "history");
  const now = await state(undefined, "live");
  expect(history.mode).toBe("history");
  expect(history.simulated).toBe(false);
  expect(now.mode).toBe("live");
  expect(now.simulated).toBe(true);
});

it("treats an unknown mode as History", async () => {
  expect((await state(undefined, "bogus" as "history")).mode).toBe("history");
});

it("streams only the chosen market to a page", async () => {
  const p = await page(undefined, "live");
  try {
    const first = (await p.next(() => true, 2000)) as { mode: string };
    expect(first.mode).toBe("live");
  } finally {
    p.close();
  }
});

it.skipIf(live)("keeps a trade on one tab off the other", async () => {
  const trader = await visitor();
  const onLive = await page(await visitor(), "live");
  const onHistory = await page(await visitor(), "history");
  const own = await page(trader, "live");
  const me = (await own.next(() => true, 2000)) as { you: { name: string } };
  const shows = (e: Record<string, unknown>): boolean => (e.traders as { name: string; side: number }[]).some((t) => t.name === me.you.name && t.side === 1);
  try {
    await open(8, "live");
    const seenLive = onLive.next(shows, 1000);
    const seenHistory = onHistory.next(shows, 1500);
    expect((await act(trader, { kind: "buy", leverage: 5, stake: 0.25, mode: "live" })).status).toBe(200);
    expect(await seenLive).not.toBeNull();
    expect(await seenHistory).toBeNull();
    expect((await state(trader, "live")).you.pos).not.toBeNull();
    expect((await state(trader, "history")).you.pos).toBeNull();
  } finally {
    onLive.close();
    onHistory.close();
    own.close();
  }
});

it.skipIf(live)("counts who is on each tab", async () => {
  const p = await page(await visitor(), "live");
  try {
    const seen = (await p.next(() => true, 2000)) as { here: { live: number } };
    expect(seen.here.live).toBeGreaterThanOrEqual(1);
  } finally {
    p.close();
  }
});
