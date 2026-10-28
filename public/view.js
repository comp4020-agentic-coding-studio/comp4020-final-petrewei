// What the chart shows (ADR 0062): the market before the round opened, then the
// round as it plays, as a window of thirty whole days and today's ticks so far.
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
