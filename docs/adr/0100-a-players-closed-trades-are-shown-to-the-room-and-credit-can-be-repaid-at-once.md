# ADR 0100: A Player's Closed Trades Are Shown to the Room, and Credit Can Be Repaid at Once

Status: accepted, 19 November 2026. Supersedes the privacy line of [ADR 0081](0081-closed-trades-with-a-verdict.md), "another visitor's state never carries a player's trades", and adds a second way to repay the credit of [ADR 0080](0080-emergency-credit-replaces-dads-savings.md), whose step stays. Peter asked for both, with a button on each panel's heading.

## 1 Context

Each panel's heading was to carry a button of its own, as Your Position carries Closed Trades. Two of the buttons Peter chose change a rule rather than a page.

- He wanted to see what other players traded. ADR 0081 kept each player's closed trades to themselves, and a check in `spec/permissions.test.ts` held it.
- He wanted Emergency Credit to repay the whole debt at once. ADR 0080 repays A$1,000 a step, so clearing a large debt took up to ten presses.

## 2 Options

### 2.1 Other Players' Trades

- **Closed trades only.** A person's row in the Room opens their closed trades this round: side, leverage, entry, exit, how it ended and its result. An open position's stop and take profit stay private, as do their margin lines.
- **Closed trades and the open position.** The same, with the open position's side and leverage. The room already shows those two as a badge on the row, so this adds nothing new.
- **Keep them private.** ADR 0081 as it is.

### 2.2 Repaying Credit

- **Pay all you can.** One action pays as much of the debt as free cash allows; what cash cannot cover stays owed.
- **All or nothing.** Refuses unless free cash covers the whole debt.
- **Steps only.** ADR 0080 as it is.

## 3 Decision

Peter chose **closed trades only** and **pay all you can**.

- **Closed trades are public within the room.** A round's closed trades are what the room already watched happen in the feed, as each fill and close is said there; collecting them under the person's name tells nothing the feed did not. They are sent only when a player asks for them, by the person's short code, never the cookie, and only for people in the same room and round. An open position's stop, take profit and margin lines stay private, as ADR 0010 requires. Live shows the same for its players, from their own last twenty closes.
- **Repay all pays from free cash, never from a position.** The page sends `repay` with `all: true` and the server sets the amount: the whole debt or the free cash, whichever is less, with the same refusals as a step. The step stays for a player who wants to keep some cash in hand.

## 4 Consequences

- `spec/permissions.test.ts` no longer holds that another player's trades are hidden. It holds instead that they are shown only on request, only for someone in the room, and never with a stop, a take profit or a cookie.
- The room learns more about each player, which is the point: the bell already ranks them, and a wipe-out is meant to be watched.
- Repaying the whole line in one press can leave a player with almost no free cash; it never closes a position to do it, and the step is still there.
