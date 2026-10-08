import { describe, expect, it } from "vitest";
import { attempt, live, magnets, move, visitor } from "./helpers.ts";

// The fridge's contract, against the running app: a fixed vocabulary where
// each word exists once, a server that changes nothing but a position, and a
// move that persists and is marked as its mover's.

describe("the vocabulary", () => {
  it("has every word exactly once", async () => {
    const texts = (await magnets()).map((m) => m.text);
    // ADR 0004: about 160, enough for ordinary lines, few enough to run out
    expect(texts.length).toBeGreaterThanOrEqual(150);
    expect(texts.length).toBeLessThanOrEqual(170);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("refuses any change but a position, so nobody can write their own word", async () => {
    const [first] = await magnets();
    const res = await attempt(`/api/magnets/${first.id}`, { x: first.x, y: first.y, text: "anything" });
    expect(res.status).toBe(400);
    expect((await magnets()).find((m) => m.id === first.id)?.text).toBe(first.text);
  });

  it("refuses a position off the door", async () => {
    const [first] = await magnets();
    expect((await attempt(`/api/magnets/${first.id}`, { x: 1.5, y: 0.5 })).status).toBe(400);
    expect((await attempt(`/api/magnets/${first.id}`, { x: -0.1, y: 0.5 })).status).toBe(400);
  });

  it("has no magnet the vocabulary doesn't", async () => {
    expect((await attempt("/api/magnets/m99999", { x: 0.5, y: 0.5 })).status).toBe(404);
  });
});

describe.skipIf(live)("a move", () => {
  it("is still there when the visitor comes back, marked as theirs and nobody else's", async () => {
    const me = await visitor();
    const other = await visitor();
    const before = (await magnets())[3];
    const res = await move(before.id, { x: 0.4321, y: 0.1234 }, me);
    expect(res.status).toBe(200);
    // the word just moved is drawn on top; read from the move's own response,
    // since another visitor could move a word before a second request
    expect(((await res.json()) as { onTop: boolean }).onTop).toBe(true);

    const mine = (await magnets(me)).find((m) => m.id === before.id);
    expect(mine).toMatchObject({ x: 0.4321, y: 0.1234, mine: true });
    const theirs = (await magnets(other)).find((m) => m.id === before.id);
    expect(theirs).toMatchObject({ x: 0.4321, y: 0.1234, mine: false });
  });
});
