# ADR 0062: Thirty-Day Rounds and a Chart That Opens Full

Status: accepted, 29 October 2026; the first of five stages. Changes the rounds of [ADR 0009](0009-a-parody-fx-trading-floor.md) and [ADR 0027](0027-scenario-replaces-live.md), and the chart's header of [ADR 0042](0042-headed-and-foldable-chart-and-position.md).

## 1 Context

Peter asked for a bigger change to the markets, in nine parts: rounds of thirty days instead of forty, thirty days of the market drawn before the open so the new price arrives at the chart's right end, the quote floating over the chart to save space, twenty or more designed black-swan plots for Replay with a way to switch between them, a choice of currency pair for Simulation, Pray moved to the chart and split into rise and fall, the stop and take-profit distances cut to six, bot and player icons on the chart, and news in both modes. That is too much to build and check at once, so Peter chose to have it in stages, each deployed before the next. This is the first.

## 2 Decision

**Thirty days.** A round is thirty days of nine ticks, about two minutes. A Simulation's turn now comes between day 13 and day 22, and a Replay's famous day between day 11 and day 28: late enough for the story to have built, with at least two days after it. A fixed shape was kept for each script, so a carry unwind still falls for five days.

**Thirty days before the open.** A round carries `history`, the market's thirty days before it, as ticks ending on the open price. In Replay it is the real thirty days before the window, and in Simulation the pair's real last thirty days, ending on today's rate. It is sent with a whole state and kept by the page between updates, and no order, score or clock reads it.

**The window.** The chart shows thirty whole days and today's ticks so far, starting on a day boundary of the whole market, so a candle is the same ticks from one redraw to the next and only today's grows. The newest tick is at the right edge and the older ticks slide left. A first version slid by a tick, which would have re-bucketed every candle on each redraw. The averages and bands are worked out on the whole market and then cut to the days shown, so a twenty-day average has its days at once. This logic is `public/view.js`, shared with its checks.

**The quote floats.** The pair, price, change, Pause, End and the clock sit in a strip over the chart's top left, on a patch of the chart's own colour, and the plot leaves headroom for it. The headline moved to the chart's lower left and the broker's warning under the quote. On a phone the switches drop under the quote.

## 3 Consequences

- The chart opens full instead of empty, and a twenty-day average shows from the first tick for its last ten days of history.
- The history is real price shape with no date, so the date stays hidden, but a player who knows a famous run-up may recognise it. That follows from Peter's choice of real prices for both modes.
- The checks that read a scenario's direction at the middle of the round now read it on day 10, since the middle of thirty days is after the earliest turn.
- A browser check at 1280 and 390 pixels, in English, Japanese and Chinese, found the legend cut by the quote, the headline over the RSI pane, the switches over the quote on a phone, and the lobby's clock label clipped; each was fixed. On a phone the chart is only about 270px high, so the quote and switches take much of it, and the saving is smaller there than on desktop.
- Not done yet, in this order: the new Replay plots with a random start and a way to switch between them, Simulation's pair choice and more pairs, Pray split and moved with the six distances, and the icons and news. Peter chose to accept about fifteen real plots, not twenty, since the ECB's daily rates show only that many distinct real events.
