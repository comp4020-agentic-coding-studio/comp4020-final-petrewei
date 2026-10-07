import { describe, expect, inject, it } from "vitest";
import { MIN_WORDS, width } from "../src/lines.ts";

// ADR 0003, an archive of broken lines: a line of moved words that stood for
// long enough is kept when it breaks, newest first.
const baseUrl = inject("baseUrl");

// Writing a line puts a poem in the public archive, so those tests run only
// against a throwaway server (locally and in CI), never against the live door.
const live = new URL(baseUrl).hostname.endsWith(".fly.dev");

type Magnet = { id: string; text: string; x: number; y: number };
type Poem = { text: string; at: string };

async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

async function words(...texts: string[]): Promise<Magnet[]> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const all = ((await res.json()) as { magnets: Magnet[] }).magnets;
  return texts.map((t) => all.find((m) => m.text === t)!);
}

const move = (m: Magnet, cookie: string, x: number, y: number): Promise<Response> =>
  fetch(new URL(`/api/magnets/${m.id}`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ x, y }),
  });

const archive = async (): Promise<{ poems: Poem[]; standsFor: number }> =>
  (await fetch(new URL("/api/poems", baseUrl))).json() as Promise<{ poems: Poem[]; standsFor: number }>;

// Lays words out left to right in a row, a little apart, the way a person would.
async function write(line: Magnet[], cookie: string, y: number): Promise<void> {
  let x = 0.3;
  for (const m of line) {
    expect((await move(m, cookie, x, y)).status).toBe(200);
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
    await move(line[1], me, 0.8, 0.3);
    expect((await archive()).poems.length).toBe(before);
    await move(line[0], me, 0.8, 0.36);
    await move(line[2], me, 0.8, 0.42);
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
      await new Promise((r) => setTimeout(r, standsFor + 500));

      const heard = new AbortController();
      const stream = await fetch(new URL("/api/events", baseUrl), { signal: heard.signal });
      await move(line[1], me, 0.7, 0.3);
      const [newest] = (await archive()).poems;
      expect(newest.text).toBe("the moons is");

      const reader = stream.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 1000;
      while (!text.includes('"type":"poem"') && Date.now() < deadline) {
        text += decoder.decode((await reader.read()).value, { stream: true });
      }
      heard.abort();
      expect(text).toContain('"text":"the moons is"');
      for (const [i, m] of line.entries()) await move(m, me, 0.7, 0.36 + i * 0.06);
    },
    30_000,
  );
});
