# ADR 0065: Prayers, Six Distances, Faces and News

Status: accepted, 29 October 2026; stage three of the market changes of [ADR 0062](0062-thirty-day-rounds-and-a-chart-that-opens-full.md). Changes the ticket of [ADR 0033](0033-one-track-for-both-exits.md) and the prayer of [ADR 0025](0025-tips-and-pictures.md).

## 1 Context

Peter asked for Pray to move from the ticket to the chart and split into a prayer for a rise and one for a fall; for the stop loss and take profit to keep only 1, 2, 5, 10, 20 and 50 percent, with the numbers shown; for the chart to show bots and players at their key trades; and for news in both modes, real in Replay and simulated in Simulation, which might push the price, or do nothing.

## 2 Decision

**Two prayers, on the chart.** They sit at its lower left, away from the newest prices. Neither does anything, as before; the way changes the words, the bubble and the feed line, and each way is counted on its own so the first prayer of each is told. Kurumi prays for the way her own bet needs.

**Six distances, held by the desk.** The desk accepts only 1, 2, 5, 10, 20 and 50 percent, sends them in every state, and a page draws them evenly along each track with their numbers beneath. A distance that used to be allowed is refused. This broke Mochiko, whose 3% take profit was now turned away, so she never opened a position; her take profit is 5%, and a check that every bot's orders are ones the desk takes caught it.

**Faces on the chart.** A mark is a moment the feed already tells in words: an open, an add, a close, a stop, a take profit or a cut. It carries the short code, the face and the way, with a flag for the viewer, and never a cookie, a stop or a take profit. The chart draws the face at that tick's price with an arrow, a ring if it is yours.

**News.** In Replay the clues before the day are the news and push nothing, since the history is real. In Simulation up to three stories break before the scenario's turn, each a rise, a fall, a V or a rumour that does nothing, and the prices then follow them, so it is a hint and not a promise. Only the story's number is sent, never the effect. Its size was measured: at three daily volatilities a carry trade's unwind was blurred in a quarter of rounds, and at two it still shows in four of five, so two was used.

## 3 Consequences

- A news story is the build-up and never the turn, so it cannot hide the scenario the bell names.
- Prayer, the six distances, the marks and the news each have a check that fails when its rule is broken: a leaked effect, a cookie in a mark and an off-ladder distance were each put in and caught.
- The distances' words, in three languages, had to be shorter to fit a phone line.
- A news effect is the same way up in every round of one scenario, whichever way the scenario runs.
