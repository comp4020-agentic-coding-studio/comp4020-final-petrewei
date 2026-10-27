import { expect, it } from "vitest";
import { act, live, open, page, state, visitor } from "./helpers.ts";

// Replay and Simulation are two markets, chosen by tab, running side by side:
// each has its own round, price and room, and a trade on one never shows
// on the other. Read-only checks run against the live app too.

it("runs a Replay and a Simulation at the same time", async () => {
  const past = await state(undefined, "replay");
  const now = await state(undefined, "simulation");
  expect(past.mode).toBe("replay");
  expect(past.simulated).toBe(false);
  expect(now.mode).toBe("simulation");
  expect(now.simulated).toBe(true);
});

// The tab was called Live; an old page or link that still asks for it
// gets Simulation, not Replay (ADRs 0027, 0047).
it("takes the old names, live and scenario, as Simulation", async () => {
  for (const old of ["live", "scenario"]) expect((await state(undefined, old as "simulation")).mode, old).toBe("simulation");
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
  const p = await page(undefined, "simulation");
  try {
    const first = (await p.next(() => true, 2000)) as { mode: string };
    expect(first.mode).toBe("simulation");
  } finally {
    p.close();
  }
});

it.skipIf(live)("keeps a trade on one tab off the other", async () => {
  const trader = await visitor();
  const onSimulation = await page(await visitor(), "simulation");
  const onReplay = await page(await visitor(), "replay");
  const own = await page(trader, "simulation");
  const me = (await own.next(() => true, 2000)) as { you: { name: string } };
  const shows = (e: Record<string, unknown>): boolean => (e.traders as { name: string; side: number }[]).some((t) => t.name === me.you.name && t.side === 1);
  try {
    await open(8, "simulation");
    const seenLive = onSimulation.next(shows, 1000);
    const seenHistory = onReplay.next(shows, 1500);
    expect((await act(trader, { kind: "buy", leverage: 5, stake: 0.25, mode: "simulation" })).status).toBe(200);
    expect(await seenLive).not.toBeNull();
    expect(await seenHistory).toBeNull();
    expect((await state(trader, "simulation")).you.pos).not.toBeNull();
    expect((await state(trader, "replay")).you.pos).toBeNull();
  } finally {
    onSimulation.close();
    onReplay.close();
    own.close();
  }
});

it.skipIf(live)("counts who is on each tab", async () => {
  const p = await page(await visitor(), "simulation");
  try {
    const seen = (await p.next(() => true, 2000)) as { here: { simulation: number } };
    expect(seen.here.simulation).toBeGreaterThanOrEqual(1);
  } finally {
    p.close();
  }
});
