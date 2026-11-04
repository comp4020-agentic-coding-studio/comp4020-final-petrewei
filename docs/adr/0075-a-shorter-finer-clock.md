# ADR 0075: A Shorter, Finer Clock

Status: accepted, 4 November 2026. Builds on [ADR 0073](0073-real-minutes-for-replay.md) and [ADR 0074](0074-six-more-stories.md). Peter asked for a round far shorter than thirty days, finer ticks, and indicators and chart to match.

## 1 Context

A market breaks in a day, and a thirty-day round of daily ticks hid that. Peter wanted a week or less, a finer step, and real data where it exists.

## 2 Decision

**The window is five played trading days after two of history.** A day is 48 half-hour ticks. A round is 241 ticks, about two minutes at 500 ms a tick, so its length stays and its content is fifteen times finer. The page's candle is two hours, four ticks, sixty to a round (a four-hour candle, eight ticks, drew bodies too thin to read, and two ticks drew nothing but noise), and the history is twenty-four whole candles and the opening price, 97 ticks. The named day is the third played day.

**Replay plays `data/minutes.csv` for seventeen of nineteen stories.** The two yuan stories have no free minute data, so they keep the ECB's daily closes, joined by `dayOf` in `src/bridge.ts`, a session-shaped fat-tailed walk pinned to each close, and the round says it is bridged. The bridge matches measured real days in session shares and tail weight, and falls short on range, 1.5 times the day's move against 1.7 real; the shortfall is stated in the file.

**Simulation is thirty units, each eight ticks and two chart candles.** The scripts are unchanged and each unit is drawn by the same bridge. The history is the real last days of the chosen pair.

**The indicators were shortened to fit the clock.** The averages are one and two days (the slower must fit in the twenty-four candles shown, or it starts after the chart does), the bands two days, and the strength index fourteen candles, and the labels and tips name their spans.

**The chart counts days.** Grid lines mark days, and the clock reads the day of five. Headlines and clues fire once a day, and a story's clues come before its event.

**The licence is Peter's call.** HistData states no terms; Peter decided an educational project used in Australia may use it. The About page and footer credit HistData in three languages, and the data and build script come out if anyone asks.

## 3 What Is Lost, and What Was Measured Before Changing It

Seventeen stories now play the same prices every time; only the yuan stories vary. Mirroring a story or starting it at a random hour was considered and rejected, since either would put prices the market never made under a note that says what it did.

A per-story window was agreed in principle and then measured. Every real story's widest day is inside its five days. Lehman's is the Wednesday, two days after the bankruptcy; its biggest day of all, the rescue rally on the Friday, is a day past the window, and moving the window to hold it would put the bankruptcy on the first played day with no room for its clues. So no story gains enough, and the window stays the same for all.

Simulation's volatility was measured against Replay's real weeks, not an ordinary week as first compared: its crash scenarios range 7–13% in a round where Replay's real weeks have a median of 7%, from 4.6% to 23%. Scaling it by 0.7 brought them to Replay's median but put the peg's break below 8%, where the franc's real one was 13% in an hour, and the scenario checks that hold a crash to that size failed. The checks were kept and the scaling was not made.

## 4 What Was Not Checked

The clues are unsourced and the Japanese and Chinese text is not native-reviewed.
