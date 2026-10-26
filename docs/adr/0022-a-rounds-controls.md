# ADR 0022: A Round's Controls

Status: accepted, 21 October 2026; its controls moved by [ADR 0039](0039-a-tidier-page.md). Changes the lobby and bell of [ADR 0012](0012-history-and-live-as-tabs.md), section 5, and adds a row to [ADR 0010](0010-who-may-see-and-change-what.md).

## 1 Context

A round ran on rails: ten seconds of countdown with the ticket shut, three minutes nobody could stop or leave, and twenty seconds of bell. Peter asked for a five-second countdown in which people may already trade; a way to cancel a Start; a way for one person to leave a round and watch, without their net worth; a way to end the whole round early for everyone; and a way to close the bell at once or hold it longer. The rooms are shared, so each control had to be clear about whose round it changes.

## 2 Decision

The countdown is five seconds. The price stands at the open throughout, so orders, closes and stops are taken at that price; praying and borrowing wait for trading, since a still price gives them nothing to act on.

Ending a round for everyone, and cancelling its countdown, is the starter's, as Peter chose: the person who pressed Start owns the round, so nobody else can cut it short on them. If the starter has left the tab, anyone still on it may, so a room is never stuck. Ending early rings the bell at once, as Peter chose: every position settles at the current price, the bell shows the ranking and the reveal, and the hall records it like any round. A cancelled countdown voids its orders and goes back to the lobby: the round never happened. Both ask for confirmation in the page, and the feed says who did it.

Anyone may leave a round. Their position closes at the current price, the ticket shuts, and they watch to the bell, where they are listed after the ranked traders, without a rank or an amount, as having left. The agent chose to keep their result in the hall of fame when they had traded, so leaving cannot erase a loss; nobody else's account is touched.

Anyone on the tab may close the bell, which returns the room to the lobby for everyone, or hold it thirty seconds more, up to five minutes, so a bell is never held for ever. Somebody not on the tab can do none of this. The server decides every one of these, and refuses each outside its phase.

## 3 Consequences

- A round can be started, abandoned or cut short in a click, and a quiet room is not held to three minutes.
- A starter who ends a round early ends it for a room that may be winning; the confirmation is the only guard, by Peter's choice of who may.
- Closing the bell closes it for everyone on the tab, as the bell is shared.
- A browser check found the countdown's banner hidden under the indicator switches, so it sits at the foot of the chart.
- `test/rounds.test.ts` checks the five seconds, orders in the countdown, that only the starter may cancel or end and that anyone may once the starter has gone, that leaving closes one account alone and lists it as left, and that the bell can be closed or held, within its cap.
