import { describe, expect, it } from "vitest";
import { CUT_COST, LOAN_COST, MIN_ROUNDS, hall, score } from "../src/score.ts";

// ADR 0029: a fairer score. A round is scored by its percentage result,
// less a cost for each forced losscut and each loan from Dad, so a lucky
// all-in can't beat steady play on money alone; the hall ranks by average
// score over at least three rounds, so one big round can't top it.
describe("a round's score", () => {
  it("is the percentage result when nothing went wrong", () => {
    expect(score({ start: 1_000_000, net: 1_100_000, cuts: 0, loans: 0 })).toBeCloseTo(10);
    expect(score({ start: 1_000_000, net: 950_000, cuts: 0, loans: 0 })).toBeCloseTo(-5);
  });

  it("costs points for each forced cut and each loan, on top of the money", () => {
    const clean = score({ start: 1_000_000, net: 500_000, cuts: 0, loans: 0 });
    expect(score({ start: 1_000_000, net: 500_000, cuts: 1, loans: 0 })).toBeCloseTo(clean - CUT_COST);
    expect(score({ start: 1_000_000, net: 500_000, cuts: 2, loans: 1 })).toBeCloseTo(clean - 2 * CUT_COST - LOAN_COST);
  });

  it("ranks a careful loss above the same loss taken by a forced cut", () => {
    const own = score({ start: 1_000_000, net: 500_000, cuts: 0, loans: 0 });
    const forced = score({ start: 1_000_000, net: 500_000, cuts: 1, loans: 0 });
    expect(own).toBeGreaterThan(forced);
  });
});

describe("the hall of fame", () => {
  const row = (key: string, rounds: number, points: number) => ({ key, rounds, points });

  it("ranks by average score, and only players with enough rounds", () => {
    const { ranked, unranked } = hall([row("lucky", 1, 400), row("steady", 5, 50), row("bold", 3, 60), row("new", 2, 30)]);
    expect(ranked.map((r) => r.key)).toEqual(["bold", "steady"]);
    expect(unranked.map((r) => r.key).sort()).toEqual(["lucky", "new"]);
    expect(ranked[0].average).toBeCloseTo(20);
  });

  // A bust is recorded at once, before the round ends, so a player can be
  // in the hall with no finished round yet: listed, unranked, never lost.
  it("lists a player with no finished round yet, unranked", () => {
    const { ranked, unranked } = hall([row("busted", 0, 0), row("steady", 3, 30)]);
    expect(ranked.map((r) => r.key)).toEqual(["steady"]);
    expect(unranked.map((r) => r.key)).toEqual(["busted"]);
    expect(unranked[0].average).toBe(0);
  });

  it("asks at least three rounds before ranking anyone", () => {
    expect(MIN_ROUNDS).toBeGreaterThanOrEqual(3);
  });
});
