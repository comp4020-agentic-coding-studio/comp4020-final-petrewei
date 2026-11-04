import { expect, it } from "vitest";
import { act, live, open, state, visitor } from "./helpers.ts";

// Lecture 10: what happens when two people act at the same moment (ADR
// 0014). The server handles one request at a time, so each lands whole,
// in arrival order, at the price when it arrives; nobody's order is lost
// or applied to someone else. test/log.test.ts checks two Starts at once
// on a fresh server.

it.skipIf(live)("fills every one of a crowd's simultaneous orders, each on its own account", async () => {
  await open();
  const crowd = await Promise.all(Array.from({ length: 12 }, () => visitor()));
  const results = await Promise.all(crowd.map((c, i) => act(c, { kind: i % 2 ? "buy" : "sell", leverage: 3, stake: 0.25 })));
  expect(results.map((r) => r.status)).toEqual(crowd.map(() => 200));
  const positions = await Promise.all(crowd.map((c) => state(c)));
  positions.forEach((p, i) => expect(p.you.pos, `trader ${i}`).toMatchObject({ side: i % 2 ? 1 : -1, leverage: 3 }));
});

it.skipIf(live)("lands a double click as one order, then one add", async () => {
  await open();
  const me = await visitor();
  const [one, two] = await Promise.all([act(me, { kind: "buy", leverage: 3, stake: 0.5 }), act(me, { kind: "buy", leverage: 3, stake: 0.5 })]);
  expect([one.status, two.status]).toEqual([200, 200]);
  const { you } = await state(me);
  // A stake is a share of the whole account (ADR 0076): half of it, then half again, which is all of it. An order
  // lost leaves about half the account in, and the old rule, a share of what was free, three quarters; both fail here
  // (the old rule was checked to). Net worth moves with the price between the clicks and the read, so the bound is a
  // tenth either side of it. That the second order is cut to what is free is held by test/fx.test.ts, on the desk,
  // since the desk never has more than its free money to give.
  expect(you.pos?.margin).toBeGreaterThan(you.equity * 0.9);
  expect(you.pos?.margin).toBeLessThan(you.equity * 1.1);
});
