import { describe, expect, it } from "vitest";
import { MIN_WORDS, width } from "../src/lines.ts";
import { get, live, type Magnet, move, page, sleep, visitor, word } from "./helpers.ts";

// ADR 0003, an archive of broken lines: a line of moved words that stood for
// long enough is kept when it breaks, newest first.

type Poem = { text: string; at: string };
const archive = (): Promise<{ poems: Poem[]; standsFor: number }> => get("/api/poems");
const words = (...texts: string[]): Promise<Magnet[]> => Promise.all(texts.map((t) => word(t)));

// Lays words out left to right in a row, a little apart, the way a person would.
async function write(line: Magnet[], cookie: string, y: number): Promise<void> {
  let x = 0.3;
  for (const m of line) {
    expect((await move(m.id, { x, y }, cookie)).status).toBe(200);
    x += width(m.text) + 0.008;
  }
}

describe("the archive", () => {
  it("is readable by anyone", async () => {
    const { poems, standsFor } = await archive();
    expect(Array.isArray(poems)).toBe(true);
    expect(standsFor).toBeGreaterThan(0);
  });

  it.skipIf(live)("doesn't keep a line that was broken straight away", async () => {
    const me = await visitor();
    const line = await words("a", "cold", "night");
    const before = (await archive()).poems.length;
    await write(line, me, 0.12);
    await move(line[1].id, { x: 0.8, y: 0.3 }, me);
    expect((await archive()).poems.length).toBe(before);
  });

  it.skipIf(live)(
    "keeps a line that stood, when it breaks, newest first",
    async () => {
      const me = await visitor();
      const line = await words("the", "moon", "is", "-s");
      expect(line.length).toBeGreaterThanOrEqual(MIN_WORDS);
      const { standsFor } = await archive();
      // "the moon -s is" reads as "the moons is": an ending joins its word
      await write([line[0], line[1], line[3], line[2]], me, 0.05);
      await sleep(standsFor + 500);

      const p = await page();
      try {
        const heard = p.next((e) => e.type === "poem", 1000);
        await move(line[1].id, { x: 0.7, y: 0.3 }, me);
        expect((await archive()).poems[0].text).toBe("the moons is");
        expect(await heard).toMatchObject({ type: "poem", text: "the moons is" });
      } finally {
        p.close();
      }
    },
    30_000,
  );
});
