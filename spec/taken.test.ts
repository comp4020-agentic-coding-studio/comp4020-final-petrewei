import { describe, expect, inject, it } from "vitest";

// Theft notices: when someone moves a word you placed, you're told. If you
// have the page open the notice arrives live; if you don't, it waits for you.
// Notices never say who took it.
const baseUrl = inject("baseUrl");

type Magnet = { id: string; text: string; x: number; y: number };

async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

async function word(text: string): Promise<Magnet> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const found = ((await res.json()) as { magnets: Magnet[] }).magnets.find((m) => m.text === text);
  if (!found) throw new Error(`no magnet "${text}"`);
  return found;
}

const move = (m: Magnet, cookie: string, x: number, y: number): Promise<Response> =>
  fetch(new URL(`/api/magnets/${m.id}`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ x, y }),
  });

const taken = async (cookie: string): Promise<string[]> =>
  ((await (await fetch(new URL("/api/taken", baseUrl), { headers: { cookie } })).json()) as { taken: string[] })
    .taken;

// Reads a stream until `needle` appears or `ms` passes; resolves with what it read.
async function listen(body: ReadableStream<Uint8Array>, needle: string, ms: number): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => reader.cancel(), ms);
  let text = "";
  try {
    while (!text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timeout);
  }
  return text;
}

const TEXT = "letter";

describe("theft notices", () => {
  it("tells you live, and only you, when someone takes a word you placed", async () => {
    const a = await visitor();
    const b = await visitor();
    const m = await word(TEXT);
    const pageA = new AbortController();
    const pageB = new AbortController();
    try {
      expect((await move(m, a, 0.3, 0.3)).status).toBe(200);
      const streamA = await fetch(new URL("/api/events", baseUrl), { headers: { cookie: a }, signal: pageA.signal });
      const streamB = await fetch(new URL("/api/events", baseUrl), { headers: { cookie: b }, signal: pageB.signal });
      const needle = `{"type":"taken","id":"${m.id}","text":"${TEXT}"}`;
      const heardA = listen(streamA.body!, needle, 1000);
      const heardB = listen(streamB.body!, needle, 600);

      expect((await move(m, b, 0.31, 0.31)).status).toBe(200);
      expect(await heardA).toContain(needle);
      expect(await heardB).not.toContain(needle);
      // A saw it live, so nothing waits for A
      expect(await taken(a)).toEqual([]);
    } finally {
      pageA.abort();
      pageB.abort();
      await move(m, await visitor(), m.x, m.y);
    }
  });

  it("keeps the notice for when you come back, until you've seen it", async () => {
    const a = await visitor();
    const b = await visitor();
    const m = await word(TEXT);
    try {
      expect((await move(m, a, 0.3, 0.3)).status).toBe(200);
      // moving your own word again isn't a theft
      expect((await move(m, a, 0.32, 0.3)).status).toBe(200);
      expect(await taken(a)).toEqual([]);

      expect((await move(m, b, 0.33, 0.3)).status).toBe(200);
      expect(await taken(a)).toEqual([TEXT]);
      expect(await taken(b)).toEqual([]);

      const seen = await fetch(new URL("/api/taken/seen", baseUrl), { method: "POST", headers: { cookie: a } });
      expect(seen.status).toBe(200);
      expect(await taken(a)).toEqual([]);
    } finally {
      await move(m, await visitor(), m.x, m.y);
    }
  });
});
