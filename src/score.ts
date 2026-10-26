// The score (ADR 0029). A round is scored by its percentage result, net of
// debt, less a cost for each forced losscut and each loan from Dad: the
// money already counts those, but the score marks them too, so a lucky
// all-in can't beat steady play on money alone. The hall of fame ranks by
// average score per round, and only once a player has enough rounds that
// one big round can't carry them.

export const CUT_COST = 10;
export const LOAN_COST = 5;
export const MIN_ROUNDS = 3;

export function score(r: { start: number; net: number; cuts: number; loans: number }): number {
  return ((r.net - r.start) / r.start) * 100 - r.cuts * CUT_COST - r.loans * LOAN_COST;
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
