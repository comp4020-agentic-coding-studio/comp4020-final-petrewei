import { expect, it } from "vitest";
import { attempt, page, state, visitor } from "./helpers.ts";

// The Tutorial tab is each person's private market. Its lessons are
// enforced by the server, it shows nobody else, and nothing in it touches
// the shared markets or the hall of fame. It changes only the visitor's
// own practice account, so these checks run against the live app too.

it("starts a new visitor at the first lesson, alone", async () => {
  const s = (await state(await visitor(), "tutorial")) as unknown as { mode: string; lesson: { n: number }; traders: unknown[] };
  expect(s.mode).toBe("tutorial");
  expect(s.lesson.n).toBe(1);
  expect(s.traders).toEqual([]);
});

it("refuses a move the lesson does not teach, with a hint", async () => {
  const me = await visitor();
  const res = await attempt({ mode: "tutorial", kind: "sell", leverage: 1 }, me);
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/Next/);
});

it("keeps each visitor's lessons to themselves", async () => {
  const a = await visitor();
  const b = await visitor();
  expect((await attempt({ mode: "tutorial", kind: "next" }, a)).status).toBe(200);
  const lessonOf = async (c: string): Promise<number> => ((await state(c, "tutorial")) as unknown as { lesson: { n: number } }).lesson.n;
  expect(await lessonOf(a)).toBe(2);
  expect(await lessonOf(b)).toBe(1);
});

it("streams a visitor's own tutorial to their page", async () => {
  const me = await visitor();
  const p = await page(me, "tutorial");
  try {
    const first = (await p.next(() => true, 2000)) as { mode: string; lesson: { title: string } };
    expect(first.mode).toBe("tutorial");
    expect(first.lesson.title).toEqual(expect.any(String));
  } finally {
    p.close();
  }
});
