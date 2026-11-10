# ADR 0097: The House Traders Are Live Players

Status: accepted, 9 November 2026. Changes how the seven house traders play Live in [ADR 0095](0095-gameplay-for-the-player-and-the-room.md). Peter asked for it.

## 1 Context

The comic's seven characters traded Live's real prices on private one-pair desks: they talked in the feed, but stood on no board, kept no account, and a wipe-out quietly reset them. Peter wanted them to play Live as people do, trading their own habits and going bankrupt and coming back like anyone.

## 2 Options

- **Rewrite each strategy for Live's many-pair book.** Seven rewrites of tested habits, on the day of the freeze.
- **A view and a translation.** Each strategy reads a few things of a round's desk (its position, profit, free margin, margin level, whether it is broke); answer them from the bot's Live account on its own pair, and send what it chooses through Live's own action.

## 3 Decision

**A view and a translation.** Each bot is a real Live player keyed by its own id: its account is saved with everyone's, it stands on the board with its own name and the pixel face it wears in the rounds, and Live's own rules bankrupt it and open its next account at Sydney midnight, as for anyone. What a strategy chooses goes through Live's own action, the one a page sends, so a bot bends no rule a person cannot. Praying, which Live has no place for, does nothing. Each keeps its favourite pair.

## 4 Consequences

Live has company that can be watched, beaten and outlasted, and a bankruptcy on the board can be a character's as well as a person's. Live's saved accounts now hold seven more, one per character. The strategies are unchanged, so a habit tuned for a round's two minutes now plays across days.

## 5 A Later Change: Bots Do Not Pause Live

Added 10 November 2026, after the showcase's first day of play. Yahoo leaves about one 15-minute bar in ten out for at least one of Live's six currencies, and Live waits for a recent missing bar before settling any account that holds a position or owes credit, so that no stop-out is skipped. With seven house traders holding positions most of the time, that wait paused Live for the people playing, who saw "Waiting for history".

Peter chose that a house trader's account no longer counts as exposed when Live decides whether to wait. A person's still does, so their stop-outs are never skipped. A bot may skip one over a missing bar; it is a character and the cost falls on nobody. A check holds both halves.

## 6 A Later Change: A Gap Holds Only the Exposed

Added 10 November 2026. A missing bar had still paused Live as a whole: no one could trade and every page said "Waiting for history". Peter asked that it never block every price and every trader.

A missing bar now holds only an account with a position or credit, and never a house trader's. Everyone else sees Live open and trades on, and prices and the chart keep moving. Settlement is unchanged: it still waits for the bar before any account is charged or stopped out, so each missed slot is charged once. While it waits, the house traders do not trade, since they trade after settlement. A per-account settlement cursor, so that a held account is caught up alone, is the next step and is not built.

