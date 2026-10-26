# ADR 0034: A Toggle for Each Exit

Status: accepted, 26 October 2026; the position's editor replaced by [ADR 0035](0035-drag-exits-on-the-chart.md). Replaces the ticket control of [ADR 0033](0033-one-track-for-both-exits.md); the 1% to 50% range, the full names and Australia's cap of that ADR stand.

## 1 Context

Peter tried the one-switch track of ADR 0033 and found two faults. The red fill of the stop loss ran on the wrong side: it grew from its left end towards the thumb, when the stop loss grows from the middle outwards, to the left. And he wanted it more compact, with a toggle of its own for each exit, one on each side, and only a percentage, no amounts in yen.

## 2 Decision

**A toggle each.** The stop loss toggle sits at the left with its percentage, the take profit toggle at the right with its own, over one joined track holding a thumb for each: "Stop loss 5% ... 10% Take profit". Each exit is grey while its own toggle is off, still showing its percentage, and is sent with an order only when on. Peter chose that dragging a thumb switches its own toggle on, so a distance you have set is never left grey and unsent. The yen amounts are gone from the ticket.

**The fill, drawn by the page.** A native slider paints to the left of its thumb, which suits the take profit and is backwards for the stop loss. The page now draws both fills itself: the stop loss's from its thumb to the middle, the take profit's from the middle to its thumb, so each is longer the further the distance and empty at 1%. The spans come from one tested function, `fillSpan`, in `public/ticket.js`.

## 3 Consequences

- The control is one row of two toggles above one thin track, about half the height.
- The ticket no longer says what an exit would lose or make; the position's own editor still does, as before.
- With the longest text, "Take profit 50%", the two toggles clear each other by 23px at 360px, and in Japanese and Chinese by more.
- `test/ticket.test.ts` checks the fill runs the right way for each exit and grows with the distance; `test/tips.test.ts` that there is a toggle for each, the stop loss left and the take profit right, over one track, with a percentage and no yen.
- A browser check measured the fills in pixels: at 50% the stop loss's spanned the whole left half and the take profit's the whole right half, and at 1% each was nothing; and that each toggle alone decides what an order carries.
