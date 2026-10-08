import { describe, expect, it } from "vitest";
import { get, live, move, page, post, visitor, word } from "./helpers.ts";

// Theft notices: when someone moves a word you placed, you're told. If you
// have the page open the notice arrives live; if you don't, it waits for you.
// Notices never say who took it.

const taken = async (cookie: string): Promise<string[]> => (await get<{ taken: string[] }>("/api/taken", cookie)).taken;

const TEXT = "letter";

describe.skipIf(live)("theft notices", () => {
  it("tells you live, and only you, when someone takes a word you placed", async () => {
    const a = await visitor();
    const b = await visitor();
    const m = await word(TEXT);
    expect((await move(m.id, { x: 0.3, y: 0.3 }, a)).status).toBe(200);
    const pageA = await page(a);
    const pageB = await page(b);
    try {
      const isNotice = (e: Record<string, unknown>): boolean => e.type === "taken" && e.id === m.id;
      const heardA = pageA.next(isNotice, 1000);
      const heardB = pageB.next(isNotice, 600);
      expect((await move(m.id, { x: 0.31, y: 0.31 }, b)).status).toBe(200);
      expect(await heardA).toEqual({ type: "taken", id: m.id, text: TEXT });
      expect(await heardB).toBeNull();
      // A saw it live, so nothing waits for A
      expect(await taken(a)).toEqual([]);
    } finally {
      pageA.close();
      pageB.close();
    }
  });

  it("keeps the notice for when you come back, until you've seen it", async () => {
    const a = await visitor();
    const b = await visitor();
    const m = await word(TEXT);
    expect((await move(m.id, { x: 0.3, y: 0.3 }, a)).status).toBe(200);
    // moving your own word again isn't a theft
    expect((await move(m.id, { x: 0.32, y: 0.3 }, a)).status).toBe(200);
    expect(await taken(a)).toEqual([]);

    expect((await move(m.id, { x: 0.33, y: 0.3 }, b)).status).toBe(200);
    expect(await taken(a)).toEqual([TEXT]);
    expect(await taken(b)).toEqual([]);

    expect((await post("/api/taken/seen", a)).status).toBe(200);
    expect(await taken(a)).toEqual([]);
  });
});
