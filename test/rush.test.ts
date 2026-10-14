import { describe, expect, it } from "vitest";
import { POOL, Rush, value } from "../src/rush.ts";

// ADR 0009, Fridge Rush: a shared pool of letter magnets, each existing once.
// Players snatch letters into a tray of seven, steal from each other, and
// spell words; a word scores once per round, for whoever plays it first.
// The clock and dictionary are passed in, so rounds run instantly.

const WORDS = new Set(["cat", "act", "tac", "star", "rats", "quiz", "tea"]);

function setup(players = ["a", "b"]) {
  let now = 0;
  const rush = new Rush({ roundMs: 120_000, breakMs: 10_000, stealMs: 3_000, words: WORDS, now: () => now, shuffle: (xs) => xs });
  for (const p of players) rush.join(p);
  return { rush, tick: (ms: number) => (now += ms) };
}

const letter = (rush: Rush, ch: string): string => rush.door().find((t) => t.ch === ch)!.id;

describe("the pool", () => {
  it("holds Scrabble's 98 letters, each once", () => {
    expect(POOL.length).toBe(98);
    expect(POOL.filter((c) => c === "e").length).toBe(12);
    expect(POOL.filter((c) => c === "q").length).toBe(1);
  });
  it("values rare letters higher", () => {
    expect(value("q")).toBeGreaterThan(value("e"));
  });
});

describe("a round", () => {
  it("doesn't start with one player, and starts with two", () => {
    const { rush } = setup(["a"]);
    expect(rush.state().phase).toBe("lobby");
    rush.join("b");
    expect(rush.state().phase).toBe("play");
  });

  it("lets a letter be snatched once, into a tray of at most seven", () => {
    const { rush } = setup();
    const c = letter(rush, "c");
    expect(rush.snatch("a", c)).toBe(true);
    expect(rush.snatch("b", c)).toBe(false);
    expect(rush.tray("a").map((t) => t.ch)).toEqual(["c"]);
    for (const ch of ["e", "e", "e", "e", "e", "e"]) rush.snatch("a", letter(rush, ch));
    expect(rush.tray("a").length).toBe(7);
    expect(rush.snatch("a", letter(rush, "e"))).toBe(false);
  });

  it("scores a dictionary word from the tray, returns its letters, and takes the word for the round", () => {
    const { rush } = setup();
    for (const ch of ["c", "a", "t"]) rush.snatch("a", letter(rush, ch));
    for (const ch of ["c", "a", "t"]) rush.snatch("b", letter(rush, ch));
    const played = rush.play("a", "cat");
    expect(played.ok).toBe(true);
    expect(played.points).toBe((value("c") + value("a") + value("t")) * 1);
    expect(rush.tray("a")).toEqual([]);
    expect(rush.door().filter((t) => t.ch === "c").length).toBeGreaterThan(0);
    expect(rush.play("b", "cat")).toMatchObject({ ok: false, why: "taken" });
    expect(rush.play("b", "act").ok).toBe(true);
  });

  it("refuses a word not in the dictionary, or not in the tray", () => {
    const { rush } = setup();
    for (const ch of ["c", "a", "t"]) rush.snatch("a", letter(rush, ch));
    expect(rush.play("a", "cta")).toMatchObject({ ok: false, why: "not a word" });
    expect(rush.play("a", "tea")).toMatchObject({ ok: false, why: "not in your tray" });
    expect(rush.tray("a").length).toBe(3);
  });

  it("pays more for longer words", () => {
    const { rush } = setup();
    for (const ch of ["s", "t", "a", "r"]) rush.snatch("a", letter(rush, ch));
    const four = rush.play("a", "star").points!;
    expect(four).toBe((value("s") + value("t") + value("a") + value("r")) * 2);
  });

  it("lets a player steal a letter from a rival's tray, then makes them wait", () => {
    const { rush, tick } = setup();
    rush.snatch("b", letter(rush, "q"));
    rush.snatch("b", letter(rush, "z"));
    const q = rush.tray("b")[0].id;
    expect(rush.steal("a", "b", q)).toBe(true);
    expect(rush.tray("a").map((t) => t.ch)).toEqual(["q"]);
    const z = rush.tray("b")[0].id;
    expect(rush.steal("a", "b", z)).toBe(false);
    tick(3_001);
    expect(rush.steal("a", "b", z)).toBe(true);
  });

  it("ends with a ranking, returns every letter, and clears taken words for the next round", () => {
    const { rush, tick } = setup();
    for (const ch of ["c", "a", "t"]) rush.snatch("a", letter(rush, ch));
    rush.play("a", "cat");
    rush.snatch("b", letter(rush, "q"));
    tick(120_001);
    const ended = rush.tick();
    expect(ended?.ranking[0]).toEqual(["a", expect.any(Number)]);
    expect(rush.state().phase).toBe("break");
    expect(rush.door().length).toBe(98);
    tick(10_001);
    rush.tick();
    expect(rush.state().phase).toBe("play");
    for (const ch of ["c", "a", "t"]) rush.snatch("a", letter(rush, ch));
    expect(rush.play("a", "cat").ok).toBe(true);
  });

  it("returns a leaving player's letters to the door, and waits in the lobby below two", () => {
    const { rush } = setup();
    rush.snatch("b", letter(rush, "q"));
    rush.leave("b");
    expect(rush.door().length).toBe(98);
    expect(rush.state().phase).toBe("lobby");
  });

  it("refuses actions outside a round", () => {
    const { rush } = setup(["a"]);
    expect(rush.snatch("a", rush.door()[0].id)).toBe(false);
  });
});
