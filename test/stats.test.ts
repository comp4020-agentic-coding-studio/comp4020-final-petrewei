import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Server, server } from "./server.ts";

// ADR 0007: the activity log names visitors by short code, so who took whose
// word, and only the holder of STATS_KEY may read it. These checks need a key
// set, so they run on a server of their own.
const KEY = "test-key-0123456789abcdef";
type Line = { t: string; who: string; ev: string; word?: string; from?: string };
type Stats = { here: number; holding: number; recent: Line[]; words: { used: [string, number][]; unused: string[] } };

let s: Server;
beforeAll(async () => {
  s = await server(8098, { STATS_KEY: KEY });
});
afterAll(() => s.stop());

const stats = async (): Promise<Stats> => (await fetch(`${s.base}/api/stats?key=${KEY}`)).json() as Promise<Stats>;
async function visitor(): Promise<string> {
  const res = await fetch(`${s.base}/api/magnets`);
  return res.headers.get("set-cookie")!.match(/v=[^;]+/)![0];
}
const move = (id: string, cookie: string, x: number): Promise<Response> =>
  fetch(`${s.base}/api/magnets/${id}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ x, y: 0.2 }) });

describe("the log, with the key", () => {
  it("opens the page and its numbers", async () => {
    expect((await fetch(`${s.base}/stats?key=${KEY}`)).status).toBe(200);
    expect((await fetch(`${s.base}/api/stats?key=${KEY}`)).status).toBe(200);
  });

  it("stays shut to a wrong key, and to none", async () => {
    for (const q of ["", "?key=wrong", `?key=${KEY}x`]) {
      expect((await fetch(`${s.base}/stats${q}`)).status).toBe(404);
      expect((await fetch(`${s.base}/api/stats${q}`)).status).toBe(404);
    }
  });

  it("names a mover, and whose word they took, by short code, never the cookie", async () => {
    const a = await visitor();
    const b = await visitor();
    await move("m12", a, 0.3);
    await move("m12", b, 0.31);
    const line = (await stats()).recent.find((l) => l.ev === "move" && l.from);
    expect(line?.who).toMatch(/^[0-9a-f]{6}$/);
    expect(line?.from).toMatch(/^[0-9a-f]{6}$/);
    expect(a).not.toContain(line!.from);
    expect(b).not.toContain(line!.who);
  });

  it("counts how often each word has moved, and names the words nobody has", async () => {
    const me = await visitor();
    await move("m13", me, 0.4);
    await move("m13", me, 0.41);
    const { words } = await stats();
    const used = new Map(words.used);
    expect(used.get("window")).toBeGreaterThanOrEqual(2);
    expect(words.unused).not.toContain("window");
    expect(words.unused.length + words.used.length).toBeGreaterThanOrEqual(150);
    // most used first
    const counts = words.used.map(([, n]) => n);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("counts the visitors with the fridge open", async () => {
    const before = (await stats()).here;
    const page = new AbortController();
    await fetch(`${s.base}/api/events`, { headers: { cookie: await visitor() }, signal: page.signal });
    expect((await stats()).here).toBe(before + 1);
    page.abort();
  });
});
