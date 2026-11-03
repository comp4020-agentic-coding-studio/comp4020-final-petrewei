# ADR 0075: A Shorter, Finer Clock

Status: accepted, 4 November 2026. Builds on [ADR 0073](0073-real-minutes-for-replay.md) and [ADR 0074](0074-six-more-stories.md). Peter asked for a round far shorter than thirty days, finer ticks, and indicators and chart to match.

## 1 Context

A market breaks in a day, and a thirty-day round of daily ticks hid that. Peter wanted a week or less, a finer step, and real data where it exists.

## 2 Decision

**The window is five played trading days after two of history.** A day is 48 half-hour ticks. A round is 241 ticks, about two minutes at 500 ms a tick, so its length stays and its content is fifteen times finer. The page's candle is four hours, eight ticks, thirty to a round, and the history is twelve whole candles and the opening price, 97 ticks. The named day is the third played day.

**Replay plays `data/minutes.csv` for seventeen of nineteen stories.** The two yuan stories have no free minute data, so they keep the ECB's daily closes, joined by `dayOf` in `src/bridge.ts`, a session-shaped fat-tailed walk pinned to each close, and the round says it is bridged. The bridge matches measured real days in session shares and tail weight, and falls short on range, 1.5 times the day's move against 1.7 real; the shortfall is stated in the file.

**Simulation is thirty units, each one candle.** The scripts are unchanged and each unit is drawn by the same bridge. The history is the real last days of the chosen pair.

**The indicators were shortened to fit the clock.** The averages are one and three days, the bands two days, and the strength index nine candles, and the labels and tips name their spans.

**The chart counts days.** Grid lines mark days, and the clock reads the day of five. Headlines and clues fire once a day, and a story's clues come before its event.

**The licence is Peter's call.** HistData states no terms; Peter decided an educational project used in Australia may use it. The About page and footer credit HistData in three languages, and the data and build script come out if anyone asks.

## 3 What Is Lost

Seventeen stories now play the same prices every time; only the yuan stories vary. Mirroring or a random start inside the file are the options, and neither is built. Simulation's volatility matches the old game's, about eight times a real week's, and its calm part in trending scenarios is five to seven times real. Several slow stories, and Lehman, lose part of their story in five days; a per-story window was agreed in principle and is not built.

## 4 What Was Not Checked

The clues are unsourced and the Japanese and Chinese text is not native-reviewed.
