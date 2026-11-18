# ADR 0081: Closed Trades, Each with a Verdict

Status: accepted, 5 November 2026; its privacy line is superseded by [ADR 0100](0100-a-players-closed-trades-are-shown-to-the-room-and-credit-can-be-repaid-at-once.md), which shows a player's closed trades to the room on request. Peter asked for what the demo games do well to be learned, not copied.

## 1 Decision

The desk keeps each player's closed trades for the round: side, leverage, entry, exit, how it ended, and its result in yen and as a share of its margin. The page shows its own, newest first, folded under the position, with a row per trade and a dry line on each. The line is chosen by how the trade ended, a forced cut or a wipe-out naming itself, or else by its result on its margin, in seven bands; the bands are a function beside the ticket's other arithmetic, and tested. The lines mock the habit, never the trader, and are the game's own words in each language. Another visitor's state never carries a player's trades.
