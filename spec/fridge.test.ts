import { describe, expect, inject, it } from "vitest";

// The fridge's contract, against the running app: a fixed vocabulary where
// each word exists once, moves that persist, and a visitor who can find what
// they moved when they come back. Each test puts the magnet back where it was.
const baseUrl = inject("baseUrl");

type Magnet = { id: string; text: string; x: number; y: number; mine: boolean };

// A cookie jar of one: each "visitor" is the v= cookie the server hands out.
async function visitor(): Promise<string> {
  const res = await fetch(new URL("/api/magnets", baseUrl));
  const cookie = res.headers.get("set-cookie")?.match(/v=[^;]+/)?.[0];
  if (!cookie) throw new Error("the server set no visitor cookie");
  return cookie;
}

async function magnets(cookie?: string): Promise<Magnet[]> {
  const res = await fetch(new URL("/api/magnets", baseUrl), {
    headers: cookie ? { cookie } : {},
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { magnets: Magnet[] }).magnets;
}

const move = (id: string, body: unknown, cookie?: string): Promise<Response> =>
  fetch(new URL(`/api/magnets/${id}`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

describe("the vocabulary", () => {
  it("has every word exactly once", async () => {
    const texts = (await magnets()).map((m) => m.text);
    expect(texts.length).toBeGreaterThan(50);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("refuses any change but a position, so nobody can write their own word", async () => {
    const [first] = await magnets();
    const res = await move(first.id, { x: first.x, y: first.y, text: "anything" });
    expect(res.status).toBe(400);
    expect((await magnets()).find((m) => m.id === first.id)?.text).toBe(first.text);
  });

  it("refuses a position off the door", async () => {
    const [first] = await magnets();
    expect((await move(first.id, { x: 1.5, y: 0.5 })).status).toBe(400);
    expect((await move(first.id, { x: -0.1, y: 0.5 })).status).toBe(400);
  });

  it("has no magnet the vocabulary doesn't", async () => {
    expect((await move("m99999", { x: 0.5, y: 0.5 })).status).toBe(404);
  });
});

describe("a move", () => {
  it("is still there when the visitor comes back, marked as theirs and nobody else's", async () => {
    const me = await visitor();
    const other = await visitor();
    const before = (await magnets())[3];
    try {
      const res = await move(before.id, { x: 0.4321, y: 0.1234 }, me);
      expect(res.status).toBe(200);

      const after = await magnets(me);
      expect(after.find((m) => m.id === before.id)).toMatchObject({ x: 0.4321, y: 0.1234, mine: true });
      // last in the list is drawn last, so the word just moved is on top
      expect(after.at(-1)?.id).toBe(before.id);

      const theirs = (await magnets(other)).find((m) => m.id === before.id);
      expect(theirs).toMatchObject({ x: 0.4321, y: 0.1234, mine: false });
    } finally {
      await move(before.id, { x: before.x, y: before.y });
    }
  });
});
