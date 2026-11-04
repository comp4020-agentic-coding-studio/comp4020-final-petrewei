import { expect, it } from "vitest";
import { act, live, open, state, visitor } from "./helpers.ts";

// ADR 0078: a pending order is asked for as a side, a way and a distance, never a price; the server sets its level
// from its own price and shows it back, one at a time, and a cancel takes it away.
it.skipIf(live)("sets a pending order from the server's price, shows it back, replaces it and cancels it", async () => {
  await open();
  const me = await visitor();
  expect((await act(me, { kind: "pend", side: 1, toward: -1, pct: 2, leverage: 10, stake: 0.5 })).status).toBe(200);
  const first = (await state(me)).you as unknown as { pending: { type: string; at: number; leverage: number } | null };
  expect(first.pending).toMatchObject({ type: "buy-limit", leverage: 10 });
  const price = (await state(me)).prices.at(-1)!;
  expect(first.pending!.at / price).toBeGreaterThan(0.97);
  expect(first.pending!.at / price).toBeLessThan(0.99);
  // a price in the request is ignored: the page cannot choose the level
  await act(me, { kind: "pend", side: -1, toward: 1, pct: 5, leverage: 30, stake: 0.25, at: 1 });
  const second = (await state(me)).you as unknown as { pending: { type: string; at: number } | null };
  expect(second.pending?.type).toBe("sell-limit");
  expect(second.pending!.at).toBeGreaterThan(price);
  expect((await act(me, { kind: "unpend" })).status).toBe(200);
  expect(((await state(me)).you as unknown as { pending: unknown }).pending).toBeNull();
  expect((await act(me, { kind: "unpend" })).status).toBe(409);
});

it.skipIf(live)("refuses a pending order at a distance off the list", async () => {
  await open();
  const me = await visitor();
  const r = await act(me, { kind: "pend", side: 1, toward: -1, pct: 3, leverage: 10, stake: 0.5 });
  expect(r.status).toBe(409);
});
