// The order ticket's arithmetic (ADR 0024), shared by the page and the
// checks: where a leverage sits on its log-scale slider and which rung a
// slider position snaps to, the stakes, a signed percentage, and where a
// net worth sits on the meter.

// What share of free money an order puts up: evenly spaced.
export const STAKES = [0.25, 0.5, 0.75, 1];

// The rungs of the leverage ladder sit evenly along the slider, however far
// apart they are in leverage (ADR 0059): a rung's place is its number in the
// ladder, over the last number. A leverage between two rungs sits at the nearer.
const rung = (lev, ladder) => ladder.reduce((best, r, i) => (Math.abs(Math.log(r / lev)) < Math.abs(Math.log(ladder[best] / lev)) ? i : best), 0);
export const levPos = (lev, ladder) => rung(lev, ladder) / (ladder.length - 1);
// The rung nearest a slider position, so a drag lands where the eye expects.
export function levAt(pos, ladder) {
  const p = Math.min(1, Math.max(0, pos));
  return ladder[Math.round(p * (ladder.length - 1))];
}

// A change as a signed percentage: two places, or two significant figures
// for a move too small for two places, so a real move never reads as 0.
// A true minus sign, so plus and minus line up.
export function pct(change) {
  if (change === 0) return "0.00%";
  const sign = change > 0 ? "+" : "−";
  const p = Math.abs(change) * 100;
  const body = p >= 1000 ? Math.round(p).toLocaleString("en") : p >= 100 ? p.toFixed(1) : p >= 0.01 ? p.toFixed(2) : p.toPrecision(2);
  return `${sign}${body}%`;
}

// The meter: net worth as a multiple of the starting money, on a log
// scale centred on 1, so halving and doubling are the same distance from
// the start. A tenth of the money or less fills nothing; ten times fills it.
export function gauge(worth) {
  if (!(worth > 0)) return 0;
  return Math.min(1, Math.max(0, 0.5 + Math.log10(worth) / 2));
}

// A stop loss or take profit's distance from the price (ADR 0032, 0033):
// a log-scale ladder from 1% to 50%.
export const DISTANCES = [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50];
const LO = Math.log(DISTANCES[0]);
const SPAN = Math.log(DISTANCES.at(-1)) - LO;
export const distPos = (d) => (Math.log(d) - LO) / SPAN;
export function distAt(pos) {
  const p = Math.min(1, Math.max(0, pos));
  return DISTANCES.reduce((best, d) => (Math.abs(distPos(d) - p) < Math.abs(distPos(best) - p) ? d : best));
}
// What a move of `pct` percent makes or loses on a margin at a leverage.
export const moveYen = (margin, leverage, pct) => Math.round((margin * leverage * pct) / 100);

// One track for both exits (ADR 0033): the stop loss on the left half,
// its distance growing leftwards from 1% beside the middle to 50% at the
// left end, and the take profit on the right half, growing rightwards the
// same way. A thin gap at the middle keeps the two apart: the nearest a
// stop loss may be, 1%, sits just left of it, and a take profit's just
// right, so a position's exits never read as each other.
const GAP = 0.02;
const HALF = 0.5 - GAP;
export const exitPos = ({ kind, dist }) => (kind === "sl" ? HALF - distPos(dist) * HALF : 0.5 + GAP + distPos(dist) * HALF);
export function exitAt(pos) {
  const p = Math.min(1, Math.max(0, pos));
  const kind = p < 0.5 ? "sl" : "tp";
  const from = kind === "sl" ? HALF - Math.min(p, HALF) : Math.max(p - (0.5 + GAP), 0);
  return { kind, dist: distAt(from / HALF) };
}

// The coloured fill of one thumb on the joined track (ADR 0034), as
// fractions of that thumb's own half. A native slider paints to the left of
// its thumb, which is right for a take profit, growing rightwards from the
// middle, but backwards for a stop loss, growing leftwards: so the page
// draws the fill itself. The stop loss's runs from its thumb to the middle
// (the right end of its half), the take profit's from the middle (the left
// end of its half) to its thumb; both are longer the further the distance.
export function fillSpan(kind, value, min, max) {
  const at = (value - min) / (max - min);
  return kind === "sl" ? { from: at, to: 1 } : { from: 0, to: at };
}
