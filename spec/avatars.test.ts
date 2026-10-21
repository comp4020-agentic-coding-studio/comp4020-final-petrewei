import { expect, it } from "vitest";
import { PEOPLE, svg } from "../public/avatars.js";
import { BOTS } from "../src/bots.ts";
import { baseUrl, page, state, visitor } from "./helpers.ts";

// ADR 0021: every trader has a pixel face. A house trader's is their own;
// a person is dealt a plain one from their cookie, as their name is, so it
// is theirs on every page and after a restart. Read-only, so live too.
type Faced = { face: string };

it("serves the faces to the page", async () => {
  const res = await fetch(new URL("/avatars.js", baseUrl));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
});

it("gives each house trader their own face, and each person a plain one", async () => {
  const me = await visitor();
  const tab = await page(me);
  try {
    const s = await state(me);
    for (const b of BOTS) expect((s.traders.find((t) => t.id === b.id) as unknown as Faced | undefined)?.face, b.id).toBe(b.id);
    const mine = (s.you as unknown as Faced).face;
    expect(mine).toMatch(/^p\d+$/);
    expect(Number(mine.slice(1))).toBeLessThan(PEOPLE.length);
    // the same face on the next look, and in the room
    expect(((await state(me)).you as unknown as Faced).face).toBe(mine);
    const row = (await state(me)).traders.find((t) => t.you) as unknown as Faced | undefined;
    if (row) expect(row.face).toBe(mine);
  } finally {
    tab.close();
  }
});

it("deals people more than one face", async () => {
  const faces = new Set<string>();
  for (let i = 0; i < 12; i++) faces.add(((await state(await visitor())).you as unknown as Faced).face);
  expect(faces.size).toBeGreaterThan(1);
});

it("draws the face the server names, as pixels", () => {
  expect(svg("bot:kurumi")).toContain("<rect");
});
