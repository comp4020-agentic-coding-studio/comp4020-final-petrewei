# ADR 0033: One Track for Both Exits, and Australia's Cap Alone

Status: accepted, 26 October 2026; its ticket control replaced by [ADR 0034](0034-a-toggle-for-each-exit.md). Changes the ticket of [ADR 0032](0032-stop-loss-and-take-profit.md) and the leverage ladder of [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md).

## 1 Context

Peter found the first stop loss and take profit control unclear. It abbreviated both as SL and TP; each had its own switch and slider, shown only when on; the distance began at 0.1%. He asked for the names in full; the slider and the amounts always visible, grey when off; 1% as the smallest distance and 50% as the largest; one switch and one slider for both, the stop loss to the left and the take profit to the right. He also asked to drop Japan's 25× cap from the leverage and keep only Australia's 30×.

## 2 Decision

**One control.** A single switch, "Stop loss and take profit", sits above a single track. The stop loss is a red thumb that moves in the left half; the take profit a green one in the right half, each held to its own half so the two never cross, with a thin line between. Peter chose two thumbs on one track over a single thumb that sets one exit, or one that sets both alike. The distance grows away from the middle: a thumb beside the line is 1%, and at either end 50%. The scale is logarithmic, so the ends are not squeezed, over a ladder of 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30 and 50%.

**Always shown.** With the switch off the track and both lines of text stay, turned grey, and neither exit is sent; on, they are red and green and ride on the order. Each line says its name in full and what it would lose or make at the chosen leverage and stake, such as "Stop loss 5% away: −¥1,500,000". Nowhere does the page, a tip, a lesson or a refusal say SL or TP; the position's cells read "+ Stop loss" and "+ Take profit", and the table's headers the same.

**1% to 50%.** The desk refuses a distance under 1% or over 50%. Mochiko's stop was 0.4%, so it became 1%, with a take profit at 3%, which at her 10× is a tenth of her margin lost or three tenths made.

**Australia's cap alone.** The ladder is 1, 2, 5, 10, 30, 50, 100, 200, 500 and 1000×, and the track marks 30×. The tutorial's leverage and gap lessons, and three bots that bought at 25×, moved to 30×; the lesson now says 30× is Australia's limit and puts the margin call at about 1.9%, where it said 2.2%, and still "about 2%". The About pages say a 3.3% move takes everything at 30×. The server refuses 25×.

## 3 Consequences

- One look says whether the trade carries its exits, what each would cost or earn, and how far away it sits.
- A stop loss is never tighter than 1%, so a tight scalper's stop is no longer allowed; the position's own cells share the same range.
- Written first, `test/bots.test.ts` runs every bot through two hundred situations each and requires its orders to stand; it caught Mochiko's stop falling out of range.
- `test/ticket.test.ts` checks the ladder, the two-sided track, and that every thumb position places the exit exactly as far as it reads; `test/tips.test.ts` that there is one switch and one track and that SL and TP appear nowhere, in any language, lesson or refusal.
