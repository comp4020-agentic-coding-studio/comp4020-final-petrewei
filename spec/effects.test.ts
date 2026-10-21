import { expect, it } from "vitest";
import { act, live, open, page, state, visitor } from "./helpers.ts";

// Effects are for the room: when someone prays, trades big, banks a
// result or is cut, every page on the tab is told, so each can pop a
// bubble over that trader. A pop names the trader by short code, never
// by cookie, and the list holds only the last few seconds.
type Pop = { n: number; who: string; kind: string; lev?: number; pnl?: number };
const pops = (e: Record<string, unknown> | null): Pop[] => (e?.pops as Pop[] | undefined) ?? [];

it("sends a short list of recent pops, each by short code", async () => {
  const s = (await state()) as unknown as { pops: Pop[] };
  expect(s.pops).toEqual(expect.any(Array));
  expect(s.pops.length).toBeLessThanOrEqual(40);
  for (const p of s.pops) expect(p.who).toMatch(/^([0-9a-f]{6}|bot:[a-z]+)$/);
});

it.skipIf(live)("pops a prayer on every page on the tab", async () => {
  const me = await visitor();
  const other = await visitor();
  await open(20);
  const theirs = await page(other);
  try {
    const code = (await state(me)).you.code;
    expect((await act(me, { kind: "pray" })).status).toBe(200);
    const seen = await theirs.next((e) => pops(e).some((p) => p.who === code && p.kind === "pray"), 3000);
    expect(seen).not.toBeNull();
    expect(JSON.stringify(seen)).not.toContain(me.slice(2));
  } finally {
    theirs.close();
  }
});

it.skipIf(live)("pops a closed trade's result, and a big bet's leverage", async () => {
  const me = await visitor();
  const other = await visitor();
  await open(20);
  const theirs = await page(other);
  try {
    const code = (await state(me)).you.code;
    expect((await act(me, { kind: "buy", leverage: 400, stake: 0.1 })).status).toBe(200);
    expect(await theirs.next((e) => pops(e).some((p) => p.who === code && p.kind === "wild" && p.lev === 400), 3000)).not.toBeNull();
    expect((await act(me, { kind: "close" })).status).toBe(200);
    const closed = await theirs.next((e) => pops(e).some((p) => p.who === code && p.kind === "close"), 3000);
    expect(pops(closed).find((p) => p.who === code && p.kind === "close")?.pnl).toEqual(expect.any(Number));
  } finally {
    theirs.close();
  }
});
