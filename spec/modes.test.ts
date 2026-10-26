import { expect, it } from "vitest";
import { act, live, open, page, state, visitor } from "./helpers.ts";

// History and Scenario are two markets, chosen by tab, running side by side:
// each has its own round, price and room, and a trade on one never shows
// on the other. Read-only checks run against the live app too.

it("runs a Replay and a Scenario at the same time", async () => {
  const past = await state(undefined, "replay");
  const now = await state(undefined, "scenario");
  expect(past.mode).toBe("replay");
  expect(past.simulated).toBe(false);
  expect(now.mode).toBe("scenario");
  expect(now.simulated).toBe(true);
});

// The tab was called Live; an old page or link that still asks for it
// gets Scenario, not Replay (ADR 0027).
it("takes the old name, live, as Scenario", async () => {
  expect((await state(undefined, "live" as "scenario")).mode).toBe("scenario");
});

it("treats an unknown mode as Replay", async () => {
  expect((await state(undefined, "bogus" as "replay")).mode).toBe("replay");
});

// The tab was called History; an old page or link that still asks for it
// gets Replay (ADR 0028).
it("takes the old name, history, as Replay", async () => {
  expect((await state(undefined, "history" as "replay")).mode).toBe("replay");
});

it("streams only the chosen market to a page", async () => {
  const p = await page(undefined, "scenario");
  try {
    const first = (await p.next(() => true, 2000)) as { mode: string };
    expect(first.mode).toBe("scenario");
  } finally {
    p.close();
  }
});

it.skipIf(live)("keeps a trade on one tab off the other", async () => {
  const trader = await visitor();
  const onScenario = await page(await visitor(), "scenario");
  const onReplay = await page(await visitor(), "replay");
  const own = await page(trader, "scenario");
  const me = (await own.next(() => true, 2000)) as { you: { name: string } };
  const shows = (e: Record<string, unknown>): boolean => (e.traders as { name: string; side: number }[]).some((t) => t.name === me.you.name && t.side === 1);
  try {
    await open(8, "scenario");
    const seenLive = onScenario.next(shows, 1000);
    const seenHistory = onReplay.next(shows, 1500);
    expect((await act(trader, { kind: "buy", leverage: 5, stake: 0.25, mode: "scenario" })).status).toBe(200);
    expect(await seenLive).not.toBeNull();
    expect(await seenHistory).toBeNull();
    expect((await state(trader, "scenario")).you.pos).not.toBeNull();
    expect((await state(trader, "replay")).you.pos).toBeNull();
  } finally {
    onScenario.close();
    onReplay.close();
    own.close();
  }
});

it.skipIf(live)("counts who is on each tab", async () => {
  const p = await page(await visitor(), "scenario");
  try {
    const seen = (await p.next(() => true, 2000)) as { here: { scenario: number } };
    expect(seen.here.scenario).toBeGreaterThanOrEqual(1);
  } finally {
    p.close();
  }
});
