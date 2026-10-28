import { expect, it } from "vitest";
import { LEVERAGES, RULES } from "../src/fx.ts";
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

// ADR 0062: a round is thirty days, shown after thirty days of the market before it,
// which a whole state carries once. A replay's history is real prices with no date
// anywhere in it, so the hidden day stays hidden.
it("sends the thirty days before a round with a whole state, ending where the round opens", async () => {
  for (const mode of ["replay", "simulation"] as const) {
    const s = await state(undefined, mode);
    expect(s.total, mode).toBe(30 * s.steps);
    expect(s.history, mode).toHaveLength(30 * s.steps + 1);
    for (const p of s.history!) expect(Number.isFinite(p) && p > 0, mode).toBe(true);
    if (s.tick === 0) expect(s.history!.at(-1), `${mode}: the history ends on the open`).toBeCloseTo(s.prices[0], 9);
  }
});

it("keeps every date out of a replay's history and prices", async () => {
  const s = await state(undefined, "replay");
  expect(JSON.stringify({ h: s.history, p: s.prices })).not.toMatch(/(19|20)\d\d-\d\d-\d\d/);
});

// The page keeps no copy of the broker's numbers: every state carries them, so a change
// on the server shows on the page without an edit there.
it("sends the desk's own numbers with every state, so a page keeps no copy", async () => {
  for (const mode of ["replay", "simulation"] as const) {
    const s = await state(undefined, mode);
    // what the desk itself says: tuning one of these changes this, and nothing else
    expect(s.desk, mode).toMatchObject({ cap: RULES.cap, fee: RULES.fee, borrow: RULES.borrow });
    expect(s.desk.ticksPerMinute, mode).toBeGreaterThan(0);
    expect(s.leverages, mode).toEqual(LEVERAGES);
    expect(s.desk.distances, mode).toEqual(RULES.distances);
    expect(s.leverages, mode).toContain(s.desk.cap);
  }
});

