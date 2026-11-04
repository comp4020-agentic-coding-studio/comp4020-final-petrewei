# ADR 0079: A Pending Order at a Typed Price, and a Position in View

Status: accepted, 4 November 2026. Changes how a pending order is asked for in [ADR 0078](0078-pending-orders-an-account-order-panel-and-a-page-that-spans.md). Peter asked for the pending order to take a typed price, for SL and TP's distances under their switches, for no empty rows, for the guess at the year on the chart, for the clock to name its units, for a position row to stay in view on the first screen, and for the stake to show its amounts.

## 1 Context

A pending order chosen by side, direction and distance took three controls and two rows, and is not how a trader thinks of one: they have a price in mind. The rule in `CLAUDE.md` is that a page never sends a price or an amount of money, so that a player cannot choose what they are filled at.

## 2 Decision

**The level is typed, and is only a trigger.** The ticket's pending order is Buy or Sell, a price, and Place, on one line, with what it makes under them. The server names it a Limit or a Stop by which side of its own price the level sits, and refuses a level at the price, one more than half the price away, or none. When a tick reaches the level, the order fills at the server's price on that tick, as a click would, never at the number typed, so the rule's purpose stands: the page names a condition, never the price of a fill. A test holds that a buy typed at 98.5 fills at the ask over 97 when the price gaps there.

**The stake shows its amounts.** Beside the stake, the note reads "¥250,000 controls ¥7,500,000" for the order as set, replacing "of your account"; the slider's percentage stays at the right, so the share and the money are both in view.

**The ticket is leaner.** Each exit's distance sits under its switch. The preview takes no second line when it has one phrase, the line above the pending order is gone, and so is the one above a pending row under the position. Column names show only over rows: none over "No open position", and an empty hall of fame says no one has finished a round.

**The chart holds the guess, and the clock names units.** The guess at the year sits over the chart's lower left, beside the prayers, as a guess about what the chart shows. The clock reads "Day 2/5 14h" in English, "2/5日 14時" in Japanese and "2/5天 14时" in Chinese. The hour is the game's hour of its trading day, counted from the day's start, never a replay's own time, which would hint at its date.

**A position row stays in view.** On a desktop the chart and the card are shorter by the position's heading, column names and one row, so an open position never falls below the fold. At 1920 by 970 and 1536 by 730 the card fits whole; at 1366 by 657 it is about 35px over and scrolls within itself, which keeps the position in view, the trade Peter asked for.
