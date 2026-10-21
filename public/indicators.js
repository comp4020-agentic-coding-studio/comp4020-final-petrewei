// The chart's indicators, worked out on each day's close: moving averages,
// Bollinger bands and the RSI, the three a retail trader's chart opens
// with. A day with too little history gets null, never a guess. Plain
// functions on numbers, shared by the page and test/indicators.test.ts.

// Each day's last price: a day is `steps` ticks, and today's close so far
// is the latest price.
export function closes(prices, steps) {
  const out = [];
  for (let i = steps; i < prices.length; i += steps) out.push(prices[i]);
  if ((prices.length - 1) % steps !== 0 || prices.length === 1) out.push(prices.at(-1));
  return out;
}

export function sma(values, n) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v - (i >= n ? values[i - n] : 0);
    return i >= n - 1 ? sum / n : null;
  });
}

// The average, and k population standard deviations either side.
export function bollinger(values, n, k) {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    const window = values.slice(i - n + 1, i + 1);
    const mid = window.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(window.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
    return { mid, upper: mid + k * sd, lower: mid - k * sd };
  });
}

// Wilder's RSI: the first n moves averaged, then each move smoothed in
// at 1/n. A flat line is 50.
export function rsi(values, n) {
  const out = values.map(() => null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (i <= n) {
      gain += Math.max(d, 0) / n;
      loss += Math.max(-d, 0) / n;
    } else {
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    }
    if (i >= n) out[i] = gain + loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// Lays labels out down a column in the order of the heights they want,
// each at its own height or one row below the label above, never above
// `first`; a stack that would pass `last` is lifted to end there. So
// labels for lines close together never overlap or swap places.
export function stack(labels, first, last, gap) {
  const out = labels.map((l) => ({ ...l })).sort((a, b) => a.at - b.at);
  let next = first;
  for (const l of out) next = (l.at = Math.max(l.at, next)) + gap;
  const lift = Math.max(0, (out.at(-1)?.at ?? 0) - last);
  for (const l of out) l.at -= lift;
  return out;
}
