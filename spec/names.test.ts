import { expect, it } from "vitest";
import { drawn } from "../public/names.js";
import { baseUrl, live, page, state, type Trader, visitor } from "./helpers.ts";

// ADR 0017: a person may pick their own trader name, or draw another at
// random. The server decides what a name may be, so a page's code cannot
// take a house trader's name or someone else's, or slip HTML into a room.
const post = (cookie: string, body: unknown): Promise<Response> =>
  fetch(new URL("/api/name", baseUrl), { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
type Draw = { name: string; draw: number };
const draw = async (cookie: string): Promise<Draw> => (await (await fetch(new URL("/api/name", baseUrl), { headers: { cookie } })).json()) as Draw;
const suggest = async (cookie: string): Promise<string> => (await draw(cookie)).name;

// Refusals change nothing, so these run against the live app too.
it("refuses a name that is empty, too long, not plain text, or a house trader's", async () => {
  const me = await visitor();
  const before = (await state(me)).you.name;
  for (const name of ["", "   ", "x".repeat(21), "久留美久留美久留美久留美", "<b>Bold</b>", "a‮b", "Kurumi", " kurumi ", "KURUMI", "Fukuga Kurumi", "fukuga  kurumi", "福賀くるみ", "福贺久留美", "韭留美", "Mochiko", "Tsukimori Kizuna", "善波なな", "ばなな", "酒田いなご", "高根やす子", 42, null]) {
    const res = await post(me, { name });
    expect(res.status, JSON.stringify(name)).toBe(400);
    expect((await res.json()).error, JSON.stringify(name)).toEqual(expect.any(String));
  }
  expect((await state(me)).you.name).toBe(before);
});

it("suggests a drawn name nobody holds, without changing anything", async () => {
  const me = await visitor();
  const before = (await state(me)).you.name;
  const names = new Set<string>();
  for (let i = 0; i < 8; i++) names.add(await suggest(me));
  for (const n of names) expect(n).toMatch(/^[A-Z][a-z]+$/);
  expect(names.size).toBeGreaterThan(1);
  expect((await state(me)).you.name).toBe(before);
});

it.skipIf(live)("keeps a chosen name, shows it to the room, and lets nobody else take it", async () => {
  const me = await visitor();
  const other = await visitor();
  const name = `Tester ${Math.random().toString(36).slice(2, 8)}`;
  const res = await post(me, { name: `  ${name.replace(" ", "   ")} ` });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name, draw: null });
  expect((await state(me)).you.name).toBe(name);
  // another person's open page sees the new name beside the same code
  const mine = await page(me);
  const theirs = await page(other);
  try {
    const code = (await state(me)).you.code;
    const has = (e: Record<string, unknown>) => (e.traders as Trader[] | undefined)?.find((t) => t.id === code);
    const seen = has((await theirs.next((e) => !!has(e), 5000)) ?? {});
    expect(seen?.name).toBe(name);
  } finally {
    mine.close();
    theirs.close();
  }
  // a name is one person's, whatever its case or spacing
  for (const taken of [name, name.toUpperCase(), name.replace(" ", "  ")]) expect((await post(other, { name: taken })).status, taken).toBe(409);
  // and a person may take back their own, or write it in Japanese
  expect((await post(me, { name })).status).toBe(200);
  const ja = `太郎${name.slice(-4)}`;
  expect((await post(me, { name: ja })).status).toBe(200);
  expect((await state(me)).you.name).toBe(ja);
});

it.skipIf(live)("takes a suggested name when it is chosen", async () => {
  const me = await visitor();
  const name = await suggest(me);
  expect((await post(me, { name })).status).toBe(200);
  expect((await state(me)).you.name).toBe(name);
});

it("sends a drawn name with its draw, so each page can write it in its language", async () => {
  const me = await visitor();
  const { name, draw: d } = await draw(me);
  expect(drawn("en", d)).toBe(name);
  // a person who never chose has a drawn name too
  const s = await state(me);
  expect(s.you.draw).toEqual(expect.any(Number));
  expect(drawn("en", s.you.draw as number)).toBe(s.you.name);
});

it.skipIf(live)("takes a drawn name in any language as the draw, and holds all its forms", async () => {
  const me = await visitor();
  const other = await visitor();
  const { draw: d } = await draw(me);
  expect((await post(me, { name: drawn("ja", d) })).status).toBe(200);
  const s = await state(me);
  expect(s.you.draw).toEqual(d);
  expect(s.you.name).toBe(drawn("en", d));
  for (const lang of ["en", "ja", "zh"] as const) expect((await post(other, { name: drawn(lang, d) })).status, lang).toBe(409);
  // a typed name has no draw: it is the same in every language
  expect((await post(me, { name: `Typed ${Math.random().toString(36).slice(2, 7)}` })).status).toBe(200);
  expect((await state(me)).you.draw).toBeNull();
});

// ADR 0038: a visitor with no record has not chosen a name or a face, so
// their page opens the name box; once they save a name they are named.
it.skipIf(live)("says a newcomer is not yet named, until they choose a name", async () => {
  const me = await visitor();
  expect((await state(me)).you.named).toBe(false);
  expect((await post(me, { name: `Newbie ${Math.random().toString(36).slice(2, 7)}` })).status).toBe(200);
  expect((await state(me)).you.named).toBe(true);
});
it("saves the name a newcomer keeps from the box, even their dealt one", async () => {
  const me = await visitor();
  const dealt = (await state(me)).you.name;
  if (live) return;
  expect((await post(me, { name: dealt })).status).toBe(200);
  expect((await state(me)).you.named).toBe(true);
  expect((await state(me)).you.name).toBe(dealt);
});
