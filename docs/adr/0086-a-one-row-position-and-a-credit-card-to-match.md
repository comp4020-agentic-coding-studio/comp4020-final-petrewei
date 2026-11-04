# ADR 0086: A One-Row Position and a Credit Card to Match

Status: accepted, 5 November 2026. Changes the exits' names of [ADR 0085](0085-a-finer-clock-a-golden-credit-card-and-a-real-calendar.md), its credit card and its 2× key. Peter asked for each change below.

## 1 Decision

**The position's header takes one row.** Its exits column reads SL / TP, its tip naming Stop Loss and Take Profit, and the forced-close column reads Stop-out. Under a 900px panel the entry and margin columns drop, so the row never overflows its card. The order card keeps Stop Loss and Take Profit in full; the short forms appear only on the position's switches and column, which a check holds.

**Emergency Credit matches the empty position.** With no debt, the card is one row under its heading: no debt, the daily and yearly rate, and Borrow at the right end, the same height as Your Position with nothing open. Repay and the bar for the line drawn appear only while something is owed. On a phone the rate takes a line of its own rather than being cut.

**Double speed sits left of pause, as an icon.** The key shows the double-forward arrow alone; its tip and label still say 2×, and it fills gold while on.

**A borrower is in the round.** Borrowing marks the player as trading, so the bell ranks a borrower who never ordered and charges their interest, which a check had found missing.

## 2 Consequences

A position panel under 900px, a phone's included, hides the entry and the margin; the price now, the exits and the profit stay.
