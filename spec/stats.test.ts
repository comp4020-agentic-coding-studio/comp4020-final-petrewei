import { describe, expect, inject, it } from "vitest";
import { live } from "./live.ts";

// Crit 10: every action is logged server-side, one structured line each, and
// /stats is a live view of who is here and what they're doing. Visitors appear
// by a short id derived from their cookie, never the cookie itself.
const baseUrl = inject("baseUrl");

type Line = { t: string; who: string; ev: string; word?: string };
type Stats = { here: number; holding: number; recent: Line[] };

const stats = async (): Promise<Stats> => (await fetch(new URL("/api/stats", baseUrl))).json() as Promise<Stats>;

async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

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
    const res = await fetch(new URL("/api/magnets", baseUrl));
    const m = ((await res.json()) as { magnets: { id: string; text: string; x: number; y: number }[] }).magnets.find(
      (w) => w.text === "summer",
    )!;
    await fetch(new URL(`/api/magnets/${m.id}`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", cookie: me },
      body: JSON.stringify({ x: m.x, y: m.y }),
    });
    const line = (await stats()).recent.find((l) => l.ev === "move" && l.word === "summer");
    expect(line).toBeDefined();
    expect(line!.who).toMatch(/^[0-9a-f]{6}$/);
    expect(me).not.toContain(line!.who);
    expect(new Date(line!.t).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it.skipIf(live)("counts the visitors with the fridge open, and tells their pages", async () => {
    const before = (await stats()).here;
    const me = await visitor();
    const page = new AbortController();
    const stream = await fetch(new URL("/api/events", baseUrl), { headers: { cookie: me }, signal: page.signal });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 1000;
    while (!text.includes('"type":"presence"') && Date.now() < deadline) {
      text += decoder.decode((await reader.read()).value, { stream: true });
    }
    expect(text).toContain(`{"type":"presence","here":${before + 1}}`);
    expect((await stats()).here).toBe(before + 1);
    page.abort();
    let after = -1;
    for (let i = 0; i < 20 && after !== before; i++) {
      await new Promise((r) => setTimeout(r, 50));
      after = (await stats()).here;
    }
    expect(after).toBe(before);
  });
});
