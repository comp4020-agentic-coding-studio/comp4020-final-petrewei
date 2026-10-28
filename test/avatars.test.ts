import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BOTS as FACES, PEOPLE, face, svg } from "../public/avatars.js";
import { BOTS } from "../src/bots.ts";

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
