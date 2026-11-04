// The score (ADR 0029, 0080). A round is scored by its percentage result, net of debt, less a cost for each forced
// losscut and a heavy one for ending bankrupt, owing more than you have: the money already counts both, but the score
// marks them too, so a lucky all-in can't beat steady play on money alone. Emergency credit costs its interest in the
// money, so it has no cost of its own. The hall of fame ranks by average score per round, and only once a player has
// enough rounds that one big round can't carry them.

export const CUT_COST = 10;
// Ending a round with a net worth under zero (ADR 0080).
export const BANKRUPT_COST = 50;
export const MIN_ROUNDS = 3;
// Naming a replay's year before the bell (ADR 0030): the right year, or
// one off.
export const YEAR_BONUS = 5;
export const NEAR_BONUS = 2;

export function guessBonus(guess: number | null, year: number): number {
  if (guess === null) return 0;
  return guess === year ? YEAR_BONUS : Math.abs(guess - year) === 1 ? NEAR_BONUS : 0;
}

type Result = { start: number; net: number; cuts: number };

export function scoreBreakdown(r: Result) {
  return {
    returnPct: ((r.net - r.start) / r.start) * 100,
    cutPenalty: r.cuts * CUT_COST,
    bankruptPenalty: r.net < 0 ? BANKRUPT_COST : 0,
  };
}

export function score(r: Result): number {
  const b = scoreBreakdown(r);
  return b.returnPct - b.cutPenalty - b.bankruptPenalty;
}

// The hall: players with enough rounds, best average first, then the rest,
// listed but unranked, by rounds played.
export function hall<T extends { rounds: number; points: number }>(rows: T[]): { ranked: (T & { average: number })[]; unranked: (T & { average: number })[] } {
  // A bust is recorded before its round ends, so a career may have no
  // finished round yet: it is listed, unranked, with no average.
  const all = rows.map((r) => ({ ...r, average: r.rounds ? r.points / r.rounds : 0 }));
  return {
    ranked: all.filter((r) => r.rounds >= MIN_ROUNDS).sort((a, b) => b.average - a.average),
    unranked: all.filter((r) => r.rounds < MIN_ROUNDS).sort((a, b) => b.rounds - a.rounds || b.average - a.average),
  };
}
