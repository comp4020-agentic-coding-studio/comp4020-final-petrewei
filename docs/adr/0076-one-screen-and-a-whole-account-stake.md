# ADR 0076: One Screen, and a Stake of the Whole Account

Status: accepted, 4 November 2026. Changes the stake slider's meaning in [ADR 0024](0024-pause-ironman-and-a-trading-ticket.md) and the account's own panel. Peter asked for the stake to manage the whole account, for the chart, the order, the account and the position to fit one desktop screen, and then for the order and the account to merge.

## 1 Context

The stake was a share of free money, so 25% meant less after every order, and its note, ticks, number and preview said the same thing four times. On a desktop the order ticket and the account stood in a column 690px tall, which a screen at 125% scaling, about 730px under the browser, cut off. Free trading with several positions is planned, so the design could not assume one.

## 2 Decision

**A stake is a share of the whole account.** The desk puts up the stake times net worth, cut to what is free: 25% is a quarter of what you have however much is in use. The desk and the page's preview call one function, `stakeMargin` in `public/ticket.js`, so the two cannot follow different rules; the page has net worth to the whole yen, as the server sends it, so the preview can differ from the fill by a yen. The function lives with the ticket's arithmetic, where the server already takes shared code from, and is marked there as the desk's rule. The slider stays, as Peter preferred to buttons, with "of your account" beside it and the "puts in, controls" preview under it. Bots barely change: only Kizuna, who adds to winners, makes 6.7 orders a round where she made 11.4 ever smaller ones, with the same rate of forced cuts.

**The ticket and the account are one card.** The order sits over what it does to the account. The right column's screen is itself the card's box, so its corners stay put when it scrolls, and the two sections inside are flat with a line between. The account stays a section of its own, so the bell takes only the ticket's place after a round and the money stays in view beside the result. The position spans the width under the chart, a list that can hold more than one later.

**The chart fills its column.** On a desktop the left column is the window's height under the header, and the chart takes what the position leaves: 622px tall at 1920 by 970, where it was always 380. The side column grew from 340px to 392px, the width at which Sell's and Buy's notes keep to one line beside the card's own scroll bar, at every desktop width; a first version widened it to 400px from 1440px, which a review removed as doing nothing the 392px did not. The chart is drawn in the CSS pixels it is shown at, so its text keeps its size at any width and is sharp on a scaled screen.

**No text is smaller.** The room came from spacing and from the layout. Merging the leverage and stake rows side by side was measured and refused: each slider would be about 180px, and leverage's seven tick labels need about 155px, so they would overlap.

## 3 What a Laptop Gives Up

At 1366 by 768 and 1280 by 720, Peter chose to drop Sell's and Buy's notes ("Earns when the price falls") outside the tutorial, where their tips still say it. That saves 30px. A later review found that the laptop's tighter spacing had never applied, since rules after it overrode it; with that fixed, 1366 by 768 fits whole, and 1280 by 720 is 8px over, so the card scrolls within itself there and its last line, the margin key, sits just below. That line is kept because it is the only place the 50% call and 20% cut are stated; the bar's marks name them but not their levels. Every size from 1366 by 768 up fits.

## 4 What Was Not Done

The position's own stop loss and take profit sliders still show under it while a position is open, since the tutorial's stop lesson points at them; a reveal per row waits for free trading.
