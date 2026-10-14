import { expect, it } from "vitest";
import { act, live, open, page, visitor } from "./helpers.ts";

// The brief's real-time requirement, against the running app: a trade one
// person makes reaches another person's open page within about a second,
// with no reload. Pages listen on /api/events (server-sent events).

// Read-only, so it runs against the live market too.
it("streams the market to an open page", async () => {
  const p = await page();
  try {
    expect(p.res.status).toBe(200);
    expect(p.res.headers.get("content-type")).toMatch(/^text\/event-stream/);
    expect(await p.next((e) => Array.isArray(e.prices) && typeof e.pair === "string", 2000)).not.toBeNull();
  } finally {
    p.close();
  }
});

it("moves the price on its own, about twice a second", async () => {
  const p = await page();
  try {
    const first = (await p.next(() => true, 2000)) as { round: number; tick: number };
    const later = (await p.next((e) => e.round !== first.round || (e.tick as number) >= first.tick + 2, 3000)) as { tick: number } | null;
    expect(later).not.toBeNull();
  } finally {
    p.close();
  }
});

it.skipIf(live)("shows one person's trade on another's page within a second", async () => {
  const trader = await visitor();
  const watcher = await page(await visitor());
  // the trader's own page, so they are in the room under their name
  const own = await page(trader);
  const me = (await own.next(() => true, 2000)) as { you: { name: string } };
  try {
    await open();
    const heard = watcher.next((e) => (e.traders as { name: string; side: number; leverage: number }[]).some((t) => t.name === me.you.name && t.side === -1 && t.leverage === 5), 1000);
    const started = Date.now();
    expect((await act(trader, { kind: "sell", leverage: 5, stake: 0.25 })).status).toBe(200);
    const seen = await heard;
    expect(seen).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    // the watcher sees it is someone else's position
    expect((seen!.traders as { name: string; you: boolean }[]).find((t) => t.name === me.you.name)?.you).toBe(false);
  } finally {
    watcher.close();
    own.close();
  }
});
