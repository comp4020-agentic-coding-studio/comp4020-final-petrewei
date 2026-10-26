# ADR 0032: Stop Loss and Take Profit

Status: accepted, 26 October 2026; its ticket changed by [ADR 0033](0033-one-track-for-both-exits.md), its position cells by [ADR 0035](0035-drag-exits-on-the-chart.md). Extends the broker's orders in `src/fx.ts`, set out in [ADR 0009](0009-a-parody-fx-trading-floor.md).

## 1 Context

A position could carry one exit, a stop, set by a single button at 1% away; there was no take profit, and no way to choose the distance. Peter asked for a stop loss and take profit mechanism. He chose a distance slider for each, and that both may be set as an order opens as well as on the position after.

## 2 Decision

A position carries a stop loss and a take profit, each a price or none. Each is asked for as a distance from the price, between just over 0% and 50%, and the desk sets it from its own price, so a page never sends a price. A stop loss sits on the losing side and fills at its level, or worse when the price gaps past it, as before; a take profit sits on the winning side and fills at its level, or better on a gap, as a limit order does. When one move crosses both, the stop fills: the cautious reading of a tick whose path inside is unknown.

On the ticket, a switch for each turns it on and shows a slider and what it would lose or make at the chosen leverage and stake; both ride on the order and attach only if it opens a position, so adding to a position keeps its exits. On the position, a cell for each shows its price and distance; a click opens a dialog with the same slider, the price it would sit at and what it would lose or make, Set, and Remove. The slider is logarithmic over a ladder from 0.1% to 20%. The chart draws the stop in red and the take profit in green, among the margin lines. Like the stop, a take profit is private to its trader.

Mochiko, the disciplined bot, opens with both: a 0.4% stop and a 3% take profit, about her old hand-taken exit at 10×. The tutorial's stop lesson now asks for + SL set 1% away.

## 3 Consequences

- A trader can plan the whole trade before opening it, which is the habit the game argues for.
- A take profit locks in a win before the price turns, and with it the score of [ADR 0029](0029-a-fairer-score.md).
- On a phone the position's two exits sit side by side with Close below, after a check found the old rule, written for one stop cell, laid them out unevenly.
- `test/fx.test.ts` checks a take profit fills, fills better on a gap, is refused on the wrong side or out of range, attaches on opening and not on adding, and loses to a stop crossed in the same move; `spec/permissions.test.ts` that both ride on an order and stay private; `test/ticket.test.ts` the slider and the yen; `test/bots.test.ts` Mochiko's exits.
