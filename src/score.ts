// The score (ADR 0029). A round is scored by its percentage result, net of
// debt, less a cost for each forced losscut and each loan from Dad: the
// money already counts those, but the score marks them too, so a lucky
// all-in can't beat steady play on money alone. The hall of fame ranks by
// average score per round, and only once a player has enough rounds that
// one big round can't carry them.

export const CUT_COST = 10;
export const LOAN_COST = 5;
// Dad's punishment for each loan he finds out about (ADR 0057), which the bell
// applies to every loan, found out in the round or not.
export const CAUGHT_COST = 10;
export const MIN_ROUNDS = 3;
// Naming a replay's year before the bell (ADR 0030): the right year, or
// one off.
export const YEAR_BONUS = 5;
export const NEAR_BONUS = 2;

export function guessBonus(guess: number | null, year: number): number {
  if (guess === null) return 0;
  return guess === year ? YEAR_BONUS : Math.abs(guess - year) === 1 ? NEAR_BONUS : 0;
}

export function score(r: { start: number; net: number; cuts: number; loans: number; caught?: number }): number {
  return ((r.net - r.start) / r.start) * 100 - r.cuts * CUT_COST - r.loans * LOAN_COST - (r.caught ?? 0) * CAUGHT_COST;
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
