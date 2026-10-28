# ADR 0058: A Fee That Grows with Leverage, and a Scale for Every Rung

Status: accepted, 29 October 2026. Adds to the broker's rules of [ADR 0009](0009-a-parody-fx-trading-floor.md) and changes the sliders of [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md) and [ADR 0033](0033-one-track-for-both-exits.md).

## 1 Context

Peter asked for a higher leverage to cost more, in interest or some other fee; for the scale under the sliders to show every rung, with the chosen one lit, and no "Australia's cap" text, since the note already says it; and for the account to be a panel of its own, apart from the ticket, in every mode.

## 2 Decision

**A financing fee.** Each tick an open position pays its margin times 1e-9 times its leverage squared. Over a round of 360 ticks that is 0.03% of the margin at 30×, 0.4% at 100×, 9% at 500× and 36% at 1000×: nothing to notice at the legal caps, and heavy at the top. The fee counts against the position's profit, so the Net Worth, Open P&L, Margin Level and the call and cut lines all include it. It is charged after the rules act on a tick, so the lines a page shows are the prices the next tick acts at. The ticket says what the chosen leverage costs a minute, from the same rate.

**A scale for every rung.** The leverage track marks 1, 2, 5, 10, 30, 50, 100, 200, 500 and 1000, each with a small tick, and the chosen one in the brand colour. The stake track does the same for its four. The "Australia's cap 30×" label is gone from the track; the note beside the label says it.

**An Account panel.** Net Worth, Open P&L, Margin Level, the meter and its key are a panel under the ticket, with a heading, an icon, and a fold, as the others. On a phone it follows the ticket.

## 3 Consequences

- A player who holds 1000× pays for it even if the price does not move, and a short trade at 1000× loses a fifth of the money to the spread and then bleeds.
- The page and the desk share one rate, and `test/tips.test.ts` fails if the page's number drifts from the desk's.
- `test/fx.test.ts` checks the fee's scaling, that it is charged each tick and counts against the profit, and that the margin lines stay where the desk acts.
- A bot's results shift a little at high leverage.
- A browser check at 1280×900, 390×800, 360×740 and 1000×800, in English, Japanese and Chinese, showed the panel, the scales, the lit rung and the fee line, with no page errors and no sideways scroll.
