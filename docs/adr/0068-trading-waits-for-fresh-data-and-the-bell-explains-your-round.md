# ADR 0068: Trading Waits for Fresh Data, and the Bell Explains Your Round

Status: accepted, 1 November 2026. Adds to [ADR 0029](0029-a-fairer-score.md) and [ADR 0057](0057-dads-savings-are-taken-not-borrowed.md).

## 1 Context

A page that lost its stream kept showing the last price and kept its buttons live, so an order could be placed on a price the server had moved past. The bell gave a score with no account of how it was made, and on a phone Close could scroll out of reach. Nothing in `spec/` or `test/` drove a real browser.

## 2 Decision

**Trading waits for fresh data.** The page shows when it is connecting, reconnecting, offline or restored in a popup that disappears after one second and takes no space in the layout. Every market control stays disabled until a full state arrives, even after the popup disappears. A stream that goes quiet is replaced after three missed five-second beats; the server sends a named heartbeat so an idle room is not mistaken for a dead one. A reply lost on the way is never sent again: the next state shows what landed.

**The bell explains your round, to you only.** The server keeps each player's breakdown for the round: the result before financing, the financing paid, net worth, loans owed, and each deduction from the score. Others see none of it, and it is cleared when the next round starts.

**A fixed strip on a phone** shows profit or loss, margin level and Close while a position is open.

**Browser checks.** Playwright runs the game in English, Japanese and Chinese at desktop and phone sizes against its own server, never the public market, and runs in CI before the deploy. It is a development dependency only; the app still has none.

## 3 What was not done

- **No test of comprehension.** The playtest guide in `docs/browser-checks.md` is ready, and no session with new players has been held.
- **The page still keeps its own copy of the connection state** in a few variables, since the stream and the controls are both in the page.

## 4 Consequences

The page is safer on a poor connection, at the cost of a short wait after each reconnect. CI takes longer by the browser install and twelve checks.
