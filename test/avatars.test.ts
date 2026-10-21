import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BOTS as FACES, PEOPLE, face, svg } from "../public/avatars.js";
import { BOTS } from "../src/bots.ts";
import { client } from "../spec/helpers.ts";
import { server } from "./server.ts";

// ADR 0021: pixel faces, drawn as rows of a 16×16 grid. Every house trader
// has their own, and people are dealt one of a set of plain ones.
const grid = (id: string) => {
  const { colors, rows } = face(id);
  expect(rows, id).toHaveLength(16);
  for (const row of rows) {
    expect(row, id).toHaveLength(16);
    for (const ch of row.replaceAll(".", "")) expect("kspmwg".includes(ch) || ch in colors, `${id}: ${ch}`).toBe(true);
  }
  for (const c of Object.values(colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
};

it("draws every house trader a face of their own", () => {
  for (const b of BOTS) {
    expect(FACES[b.id], b.id).toBeDefined();
    grid(b.id);
  }
  const drawings = BOTS.map((b) => JSON.stringify(FACES[b.id]));
  expect(new Set(drawings).size).toBe(BOTS.length);
});

it("has a set of plain faces for people, all different", () => {
  expect(PEOPLE.length).toBeGreaterThanOrEqual(10);
  PEOPLE.forEach((_, i) => grid(`p${i}`));
  expect(new Set(PEOPLE.map((p) => JSON.stringify(p))).size).toBe(PEOPLE.length);
  // a name the file does not know gets a plain face, never nothing
  expect(face("p99999")).toBe(PEOPLE[99999 % PEOPLE.length]);
  expect(PEOPLE).toContain(face("<img>"));
});

it("draws a face as square pixels and nothing else", () => {
  for (const id of [...Object.keys(FACES), "p0", "<script>"]) {
    const s = svg(id, 24);
    expect(s).toMatch(/^<svg [^>]*viewBox="0 0 16 16" width="24" height="24" shape-rendering="crispEdges"/);
    expect(s.replace(/^<svg[^>]*>|<\/svg>$/g, "").replace(/<rect x="\d+" y="\d+" width="\d+" height="1" fill="#[0-9a-f]{6}"\/>/g, "")).toBe("");
  }
});

// The comic's art is not copied (CLAUDE.md): the faces are text, and no
// image file of a character is in the public folder.
it("keeps every face as text, with no image file of a character", () => {
  expect(readFileSync("public/avatars.js", "utf8")).not.toMatch(/data:image|\.(png|jpe?g|webp|gif)\b/i);
});

// A career is filed by the cookie's hash, so the hall of fame and the
// bell show the same face as the room.
it("shows a person the same face in the room, at the bell and in the hall", async () => {
  const s = await server(8099, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  try {
    const { visitor, act, open, state } = client(s.base);
    const a = await visitor();
    await open(30);
    await act(a, { kind: "buy", leverage: 5 });
    type Faced = { face: string; you: boolean };
    const mine = ((await state(a)).you as unknown as Faced).face;
    let bell = await state(a);
    for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(a);
    const result = (bell as unknown as { result: { ranking: Faced[] } }).result;
    expect(result.ranking.find((r) => r.you)?.face).toBe(mine);
    expect((bell.career as unknown as Faced[]).find((c) => c.you)?.face).toBe(mine);
    for (const r of result.ranking.filter((r) => !r.you)) expect(r.face).toMatch(/^(bot:\w+|p\d+)$/);
  } finally {
    await s.stop();
  }
}, 20_000);

// A chosen face is kept on the volume, so it outlives a hard kill, and
// the hall of fame shows it too.
it("keeps a chosen face through a hard kill, in the room and the hall", async () => {
  const s = await server(8099, { TICK_MS: "10", COUNTDOWN_TICKS: "2" });
  try {
    const { visitor, act, open, state } = client(s.base);
    const a = await visitor();
    type Faced = { face: string; you: boolean };
    const face = ((await state(a)).you as unknown as Faced).face === "p5" ? "p6" : "p5";
    const res = await fetch(`${s.base}/api/face`, { method: "POST", headers: { "content-type": "application/json", cookie: a }, body: JSON.stringify({ face }) });
    expect(res.status).toBe(200);
    await open(30);
    await act(a, { kind: "buy", leverage: 5 });
    let bell = await state(a);
    for (const until = Date.now() + 10_000; bell.phase !== "break" && Date.now() < until; ) bell = await state(a);
    expect((bell.career as unknown as Faced[]).find((c) => c.you)?.face).toBe(face);
    s.proc.kill("SIGKILL");
    await new Promise((r) => s.proc.once("exit", r));
    await s.restart();
    const after = await state(a);
    expect((after.you as unknown as Faced).face).toBe(face);
    expect((after.career as unknown as Faced[]).find((c) => c.you)?.face).toBe(face);
  } finally {
    await s.stop();
  }
}, 30_000);
