// What the chart shows (ADR 0062): the market before the round opened, then the
// round as it plays, as a window of whole candles, as many as the history holds, and today's ticks so far.
// Pure, so the page and the checks share it.
//
// The window starts on a day boundary of the whole market, so a candle is the same
// ticks from one redraw to the next and only today's grows; it slides a day at a
// time. The newest tick is placed at the right edge (`x`), and older ones count
// back from it, so the new price arrives at the right end and the rest slides left.
export function windowed(state) {
  // The tutorial has no history: its round runs from the left, as it always did.
  if (!state.history?.length) return state;
  const steps = state.steps;
  const all = state.history.slice(0, -1).concat(state.prices);
  const days = (state.history.length - 1) / steps;
  const wholeDays = Math.floor((all.length - 1) / steps);
  const first = Math.max(0, wholeDays - days) * steps;
  // `all` goes with the window so indicators are worked out on the whole market and
  // only then cut to the days shown: a twenty-day average has its twenty days at once.
  return { ...state, prices: all.slice(first), total: days * steps, all, skip: first / steps };
}

// Where tick `i` of the window is drawn, as a share of the plot's width: the newest
// tick at 1, one window older at 0. With no history, the round runs left to right.
export function place(state, i) {
  const last = state.prices.length - 1;
  return state.all ? (i - last) / state.total + 1 : i / state.total;
}

// The chart's range (a viewer's choice, kept in this browser): the whole window, or only its last day or six hours,
// drawn with finer candles so a small move is big enough to see. `ticks` is the span shown and `candle` the ticks in
// one candle; the whole window keeps the market's own. Every range holds about the same number of candles, so a
// phone's chart is no more crowded zoomed in than out.
export const RANGES = { all: null, "1d": { ticks: 96, candle: 4 }, "6h": { ticks: 24, candle: 1 } };

// The window cut to a range. Candles start on the range's own boundaries of the market's clock (the tick count), so
// a candle is the same ticks from one redraw to the next, and the indicators are worked out on everything there is
// with the same candles before they are cut to the ones shown. A range as long as the window, or longer, is the window.
export function zoomed(state, range) {
  const r = RANGES[range];
  const src = state.all ?? state.prices;
  if (!r || r.ticks >= src.length - 1 || r.ticks >= state.total) return state;
  const zero = state.tick - (src.length - 1);
  const off = (((r.candle - (zero % r.candle)) % r.candle) + r.candle) % r.candle;
  const all = src.slice(off);
  const whole = Math.floor((all.length - 1) / r.candle);
  const first = Math.max(0, whole - r.ticks / r.candle) * r.candle;
  return { ...state, prices: all.slice(first), steps: r.candle, total: r.ticks, all, skip: first / r.candle };
}
