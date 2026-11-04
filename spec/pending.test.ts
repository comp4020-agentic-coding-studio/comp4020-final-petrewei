import { expect, it } from "vitest";
import { act, live, open, state, visitor } from "./helpers.ts";

// ADR 0079: a pending order is asked for at a typed level, which is only a trigger; the server names it by where the
// level sits against its own price, shows it back, one at a time, and a cancel takes it away.
it.skipIf(live)("sets a pending order at the level typed, shows it back, replaces it and cancels it", async () => {
  await open();
  const me = await visitor();
  const price = (await state(me)).prices.at(-1)!;
  expect((await act(me, { kind: "pend", side: 1, at: price * 0.98, leverage: 10, stake: 0.5 })).status).toBe(200);
  const first = (await state(me)).you as unknown as { pending: { type: string; at: number; leverage: number } | null };
  expect(first.pending).toMatchObject({ type: "buy-limit", leverage: 10 });
  expect(first.pending!.at).toBeCloseTo(price * 0.98, 6);
  await act(me, { kind: "pend", side: -1, at: price * 1.05, leverage: 30, stake: 0.25 });
  const second = (await state(me)).you as unknown as { pending: { type: string; at: number } | null };
  expect(second.pending?.type).toBe("sell-limit");
  expect((await act(me, { kind: "unpend" })).status).toBe(200);
  expect(((await state(me)).you as unknown as { pending: unknown }).pending).toBeNull();
  expect((await act(me, { kind: "unpend" })).status).toBe(409);
});

it.skipIf(live)("refuses a pending level more than half the price away", async () => {
  await open();
  const me = await visitor();
  const price = (await state(me)).prices.at(-1)!;
  expect((await act(me, { kind: "pend", side: 1, at: price * 0.4, leverage: 10, stake: 0.5 })).status).toBe(409);
});
