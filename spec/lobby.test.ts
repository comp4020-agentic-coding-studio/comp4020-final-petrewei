import { expect, it } from "vitest";
import { attempt, live, open, page, sleep, state, visitor } from "./helpers.ts";

// History and Live don't start by themselves: each waits in a lobby until
// someone on its tab presses Start, counts down so others can join, plays
// a round, and returns to the lobby after the bell.

it("refuses a Start from someone without the tab open", async () => {
  const s = await state(undefined, "random");
  const res = await attempt({ kind: "start", mode: "random" }, await visitor());
  if (s.phase === "lobby") expect((await res.json()).error).toMatch(/Open this tab/);
  else expect(res.status).toBe(409);
});

it("refuses a trade while the market waits in the lobby", async () => {
  const s = await state(undefined, "rewind");
  if (s.phase !== "lobby") return;
  const res = await attempt({ kind: "buy", leverage: 3, mode: "rewind" }, await visitor());
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/Press Start/);
});

it.skipIf(live)("holds the price still in the lobby", async () => {
  const before = await state(undefined, "random");
  if (before.phase !== "lobby") return;
  await sleep(1500);
  const after = await state(undefined, "random");
  expect(after.phase).toBe("lobby");
  expect(after.tick).toBe(before.tick);
});

it.skipIf(live)("counts down after a Start, then opens trading", async () => {
  await open(8, "random");
  const s = await state(undefined, "random");
  expect(s.phase).toBe("trade");
});

it.skipIf(live)("tells the tab who pressed Start", async () => {
  const me = await visitor();
  const tab = await page(me, "rewind");
  try {
    const first = (await tab.next(() => true, 2000)) as { phase: string; you: { name: string } };
    if (first.phase !== "lobby") return;
    expect((await attempt({ kind: "start", mode: "rewind" }, me)).status).toBe(200);
    const counting = (await tab.next((e) => e.phase === "countdown", 2000)) as { startedBy: string; countdown: number } | null;
    expect(counting?.startedBy).toBe(first.you.name);
    expect(counting?.countdown).toBeGreaterThan(0);
  } finally {
    tab.close();
  }
});
