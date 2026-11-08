# ADR 0095: Gameplay for the Player and the Room

Status: accepted, 8 November 2026. Adds to the ticket of [ADR 0094](0094-every-pair-either-way-round.md), the bell's debrief and Live of [ADR 0087](0087-marathon-on-real-prices-and-accounts-in-australian-dollars.md). Peter asked for every one of seven proposed additions.

## 1 Context

The ticket said how much margin went in but not what a move would do to it, so leverage read as a number rather than a risk. Live forgot a player's leverage and margin each time the pair changed, gave no reason to come back tomorrow, and could only be watched, not waited on. Live was empty when no one else played, and a round's room ranked everyone but gave two friends nothing to settle between them.

## 2 Decision

**The risk in money.** The margin note reads as the money a 1% move makes or loses at the chosen margin and leverage, worked out on the page from the player's own choices.

**Each Live pair keeps its choice.** The page remembers the leverage and margin last chosen for each Live pair, in the browser, and brings them back when that pair is chosen again. Only a preference is kept; the server still decides what may be ordered.

**What if, at the bell.** The debrief takes the player's biggest trade by margin and replays it at 1×, at the 30× cap and at 1000×, through the same price path and the same stop-out rule, saying where a leverage would have been stopped out. The server works it out, as it owns the fills.

**A daily line in Live.** Each account's worth is noted at the start of each Sydney day, so Live shows today's change, yesterday's, and how many days in a row the player came back. It is kept with the account.

**Price alerts in Live.** A player sets up to five levels on a pair; the server tells that player alone when the price reaches one, and the alert is gone. An alert is a price the player chose, never an order.

**House traders in Live.** Each of the comic's seven trades a real pair it favours, at Live's price, with a desk of its own that is never saved, and its trades are told in Live's feed. They are noise to keep a player company and are on no board.

**Duels in a round.** A person in a round's room may challenge another, who accepts from a banner; the bell compares their scores for the round and names the winner, or a draw. A duel is between people, by short code, and lasts one round: it survives the lobby being redrawn and ends when the room leaves the bell.

## 3 Consequences

Every addition speaks all three languages and the server keeps every rule: the page sends only a choice, a level or a short code. Live's saved accounts gain optional fields for the day, yesterday and alerts, so old files still load. House traders add a beat of work to each Live poll.
