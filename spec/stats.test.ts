import { describe, expect, it } from "vitest";
import { baseUrl, get, live, move, page, sleep, visitor, word } from "./helpers.ts";

// Crit 10: every action is logged server-side, one structured line each, and
// /stats is a live view of who is here and what they're doing. Visitors appear
// by a short id derived from their cookie, never the cookie itself.

type Line = { t: string; who: string; ev: string; word?: string };
type Stats = { here: number; holding: number; recent: Line[] };
const stats = (): Promise<Stats> => get("/api/stats");

describe("the live view", () => {
  it("is a page, and its numbers are readable by anyone", async () => {
    expect((await fetch(new URL("/stats", baseUrl))).status).toBe(200);
    const s = await stats();
    expect(s.here).toBeGreaterThanOrEqual(0);
    expect(s.holding).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(s.recent)).toBe(true);
  });

  it.skipIf(live)("logs a move by a short id, never the cookie", async () => {
    const me = await visitor();
    const m = await word("summer");
    await move(m.id, { x: m.x, y: m.y }, me);
    const line = (await stats()).recent.find((l) => l.ev === "move" && l.word === "summer");
    expect(line).toBeDefined();
    expect(line!.who).toMatch(/^[0-9a-f]{6}$/);
    expect(me).not.toContain(line!.who);
    expect(new Date(line!.t).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it.skipIf(live)("counts the visitors with the fridge open, and tells their pages", async () => {
    const before = (await stats()).here;
    const p = await page(await visitor());
    const told = await p.next((e) => e.type === "presence", 1000);
    expect(told).toEqual({ type: "presence", here: before + 1 });
    expect((await stats()).here).toBe(before + 1);
    p.close();
    let after = -1;
    for (let i = 0; i < 20 && after !== before; i++) {
      await sleep(50);
      after = (await stats()).here;
    }
    expect(after).toBe(before);
  });
});
