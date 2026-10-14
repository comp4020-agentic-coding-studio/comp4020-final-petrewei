import { describe, expect, it } from "vitest";
import { Game, owner, PROMPTS, type Word } from "../src/game.ts";

// ADR 0008, rounds with a prompt: a standing line of three or more words earns
// its owner a point per word per second, doubled if it answers the round's
// prompt. Rounds run on a clock the test controls.

const w = (id: string, text: string, by: string): Word => ({ id, text, movedBy: by });

describe("who owns a line", () => {
  it("is whoever placed most of its words", () => {
    expect(owner([w("1", "the", "a"), w("2", "moon", "a"), w("3", "is", "b")])).toBe("a");
  });
  it("on a tie, is whoever placed its last word", () => {
    expect(owner([w("1", "the", "a"), w("2", "moon", "b")])).toBe("b");
    expect(owner([w("1", "the", "b"), w("2", "moon", "a")])).toBe("a");
  });
});

describe("prompts", () => {
  it("each say whether a line answers them, from its words alone", () => {
    const colour = PROMPTS.find((p) => p.id === "colour")!;
    expect(colour.test(["the", "blue", "sea"])).toBe(true);
    expect(colour.test(["the", "cold", "sea"])).toBe(false);
    const long = PROMPTS.find((p) => p.id === "long")!;
    expect(long.test(["a", "b", "c", "d"])).toBe(false);
    expect(long.test(["a", "b", "c", "d", "e"])).toBe(true);
  });
});

function setup() {
  let now = 0;
  const game = new Game({ roundMs: 180_000, breakMs: 15_000, now: () => now, pick: () => PROMPTS.find((p) => p.id === "colour")! });
  return { game, tick: (ms: number) => (now += ms) };
}

describe("a round", () => {
  it("scores a standing line a point per word per second, doubled if it answers the prompt", () => {
    const { game, tick } = setup();
    game.score([[w("1", "the", "a"), w("2", "cold", "a"), w("3", "sea", "a")]]);
    tick(10_000);
    game.score([[w("1", "the", "a"), w("2", "cold", "a"), w("3", "sea", "a")]]);
    expect(game.scores.get("a")).toBeCloseTo(30);
    game.score([[w("1", "the", "b"), w("2", "blue", "b"), w("3", "sea", "b")]]);
    tick(10_000);
    game.score([[w("1", "the", "b"), w("2", "blue", "b"), w("3", "sea", "b")]]);
    expect(game.scores.get("b")).toBeCloseTo(60);
  });

  it("doesn't score lines shorter than three words", () => {
    const { game, tick } = setup();
    game.score([[w("1", "the", "a"), w("2", "sea", "a")]]);
    tick(10_000);
    game.score([[w("1", "the", "a"), w("2", "sea", "a")]]);
    expect(game.scores.get("a") ?? 0).toBe(0);
  });

  it("ends after its time with a ranking, then starts the next after a break", () => {
    const { game, tick } = setup();
    game.score([[w("1", "a", "x"), w("2", "b", "x"), w("3", "c", "x")]]);
    tick(180_001);
    const ended = game.score([]);
    expect(ended?.ranking[0]).toEqual(["x", expect.any(Number)]);
    expect(game.state().phase).toBe("break");
    tick(15_001);
    game.score([]);
    expect(game.state().phase).toBe("play");
    expect(game.scores.size).toBe(0);
  });

  it("doesn't score during the break", () => {
    const { game, tick } = setup();
    tick(180_001);
    game.score([]);
    game.score([[w("1", "a", "x"), w("2", "b", "x"), w("3", "c", "x")]]);
    tick(5_000);
    game.score([[w("1", "a", "x"), w("2", "b", "x"), w("3", "c", "x")]]);
    expect(game.scores.get("x") ?? 0).toBe(0);
  });
});
