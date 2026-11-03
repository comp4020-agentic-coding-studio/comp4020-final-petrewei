// The price between two closes, as a day of 48 half-hour ticks. Where a plot has real minutes the game
// plays those; this is for the rest, the two yuan plots and Simulation, and it is made to behave as the
// real minutes did when measured over forty-six ordinary days of six pairs (EUR/USD, GBP/USD, USD/JPY,
// AUD/USD, EUR/CHF, AUD/JPY, from the files in raw/): test/bridge.test.ts holds it to those figures.
//
//  - Activity follows the sessions. By four-hour block from the 17:00 open, a day's movement was 14%, 12%,
//    22%, 20%, 20% and 12%: quiet overnight, busiest as London and New York overlap. Matched.
//  - Half-hour moves have fat tails, a kurtosis of 4.4 against 3 for a normal, so now and then one is big.
//    Matched, at 4.5.
//  - A day's high to low was 1.7 times its open to close (median). This is the one it does not reach: the
//    bridge gives about 1.5. Real days trend within the day, which a walk pinned to its close lacks, and
//    stretching the range to 1.7 would take an invented drift, so the shortfall is left and stated.

export const TICKS_PER_DAY = 48;

// A day's volatility in each four-hour block, as measured, so each half hour carries a share of the day.
const BLOCK_SHARE = [0.14, 0.12, 0.22, 0.2, 0.2, 0.12];
// What each half hour's size is relative to an even day: the share of its block, over the even share. It is
// raised to a power, since pinning the walk to the close evens out a day, and the power that gives back the
// measured shares is 2.2 (found by trying: at 1 the busiest blocks came out 18% against 20 to 22).
const SHARPEN = 2.2;
const SHARP = Array.from({ length: TICKS_PER_DAY }, (_, i) => ((BLOCK_SHARE[Math.floor(i / 8)] / 8) * TICKS_PER_DAY) ** SHARPEN);
const MEAN = SHARP.reduce((a, b) => a + b, 0) / TICKS_PER_DAY;
const PROFILE = SHARP.map((v) => v / MEAN);

const normal = (rnd: () => number): number => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// A Student-t draw with four degrees of freedom, scaled to unit variance, for the fat tails. Four, because
// the session profile and the pinning thin the tails of the draw, and four came out at the measured 4.4.
function fat(rnd: () => number): number {
  const df = 4;
  let chi = 0;
  for (let i = 0; i < df; i++) chi += normal(rnd) ** 2;
  return (normal(rnd) / Math.sqrt(chi / df)) / Math.sqrt(df / (df - 2));
}

// One day's ticks, from `open` to `close` (both prices), as 48 prices, the last of them the close. `vol` is the
// day's own typical move as a fraction of price, and `wild` scales the random part beyond a plain day (1 is a plain
// day). A move that is large against `vol` is carried by the first ticks and the rest stay near it: `gap` is the
// share of the move that arrives at once, in the first tick.
export function dayOf(open: number, close: number, vol: number, rnd: () => number, wild = 1, gap = 0): number[] {
  const from = Math.log(open);
  const to = Math.log(close);
  const move = to - from;
  const first = move * gap;
  const left = move - first;
  // the random part, in the session profile, then pinned so the day lands on its close
  const walk = [0];
  for (let i = 0; i < TICKS_PER_DAY; i++) walk.push(walk[i] + fat(rnd) * vol * wild * Math.sqrt(PROFILE[i] / TICKS_PER_DAY));
  const out: number[] = [];
  for (let i = 1; i <= TICKS_PER_DAY; i++) {
    const t = i / TICKS_PER_DAY;
    const pinned = walk[i] - t * walk[TICKS_PER_DAY];
    out.push(i === TICKS_PER_DAY ? close : Math.exp(from + first + left * t + pinned));
  }
  return out;
}
