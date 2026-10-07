import { afterEach, describe, expect, inject, it } from "vitest";

// ADR 0002, one hand at a time: while one visitor holds a word, nobody else
// can grab or move it, and every open page is told it is held. Letting go,
// moving it, or closing the holder's last open page frees it.
const baseUrl = inject("baseUrl");

type Magnet = { id: string; text: string; x: number; y: number; held: boolean };

async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

async function word(text: string, cookie?: string): Promise<Magnet> {
  const res = await fetch(new URL("/api/magnets", baseUrl), { headers: cookie ? { cookie } : {} });
  const found = ((await res.json()) as { magnets: Magnet[] }).magnets.find((m) => m.text === text);
  if (!found) throw new Error(`no magnet "${text}"`);
  return found;
}

const post = (path: string, cookie: string, body?: unknown): Promise<Response> =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// One word for this file, so a hold here can't collide with a move elsewhere.
const TEXT = "whisper";
let holder = "";
afterEach(async () => {
  const m = await word(TEXT);
  if (holder) await post(`/api/magnets/${m.id}/release`, holder);
  holder = "";
});

describe("one hand at a time", () => {
  it("refuses a second grab and a move by anyone but the holder", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    // grabbing again is fine for the holder: a long drag renews its hold
    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(409);
    expect((await post(`/api/magnets/${m.id}`, b, { x: 0.5, y: 0.5 })).status).toBe(409);

    // another visitor sees it held; the holder doesn't see it as held against them
    expect((await word(TEXT, b)).held).toBe(true);
    expect((await word(TEXT, a)).held).toBe(false);
    expect((await word(TEXT)).x).toBe(m.x);
  });

  it("frees the word when the holder moves it, and when they let go", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    await post(`/api/magnets/${m.id}/grab`, a);
    expect((await post(`/api/magnets/${m.id}`, a, { x: m.x, y: m.y })).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/release`, b)).status).toBe(200);
    expect((await word(TEXT, a)).held).toBe(false);
  });

  it("frees the word when the holder's last open page closes", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    const page = new AbortController();
    const stream = await fetch(new URL("/api/events", baseUrl), {
      headers: { cookie: a },
      signal: page.signal,
    });
    expect(stream.status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, a)).status).toBe(200);
    expect((await post(`/api/magnets/${m.id}/grab`, b)).status).toBe(409);

    page.abort();
    let status = 0;
    for (let i = 0; i < 20 && status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await post(`/api/magnets/${m.id}/grab`, b)).status;
    }
    expect(status).toBe(200);
    holder = b;
  });

  it("tells other open pages when a word is taken and when it is free", async () => {
    const a = (holder = await visitor());
    const b = await visitor();
    const m = await word(TEXT);

    const page = new AbortController();
    const stream = await fetch(new URL("/api/events", baseUrl), {
      headers: { cookie: b },
      signal: page.signal,
    });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (needle: string): Promise<void> => {
      const deadline = Date.now() + 1000;
      while (!text.includes(needle)) {
        if (Date.now() > deadline) throw new Error(`no ${needle} event within 1s`);
        const { value } = await reader.read();
        text += decoder.decode(value, { stream: true });
      }
    };
    try {
      await post(`/api/magnets/${m.id}/grab`, a);
      await until(`{"type":"held","id":"${m.id}"}`);
      await post(`/api/magnets/${m.id}/release`, a);
      await until(`{"type":"released","id":"${m.id}"}`);
    } finally {
      page.abort();
    }
  });
});
