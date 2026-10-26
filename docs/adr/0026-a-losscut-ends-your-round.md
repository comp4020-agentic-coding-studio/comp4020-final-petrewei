# ADR 0026: A Losscut Ends Your Round

Status: accepted, 26 October 2026. Changes the broker's rules of [ADR 0009](0009-a-parody-fx-trading-floor.md), kept in `src/fx.ts`.

## 1 Context

Peter found the forced loss cut too soft. A stop-out closed a position at 20% margin level and left the player trading on what remained, so a 1000× player could be cut three or four times a round, and the 強制ロスカット stamp came so often it stopped meaning anything. He first asked whether the cut should move to 0% and force a character reset.

## 2 Options

- **Cut at 0%, with a character reset:** a position closed at 0% is already a wipe-out, which the zero-cut handles; the margin call would lose its warning, the stamp would come no less often, and a reset would erase the trader the room just watched fall. Real brokers cut at 20 to 50% because a gap can carry an account below nothing.
- **Leave the cut at 20%, and let it end the round:** what is left is kept, but the player is out until the bell, as a wipe-out already was.

## 3 Decision

The agent recommended the second, and Peter chose that a loan from Dad is the only way back in. A stop-out now sets the account's `out` flag, as a zero-cut did: no orders until the bell, the ticket shut, 💀 in the room. The money left is kept and counts at the bell. A player who is out is broke, so the loan is offered, ¥300,000 twice a round, its debt off the result; a second cut on borrowed money puts them out again, and when Dad's savings are gone they watch. A player's own stop, or their own close at a loss, does not put them out. The bots follow the same rule; only Kurumi borrows, so a cut ends the round for the rest, and she runs back to Dad.

The stamp says the round is over, or that the player was wiped out when nothing is left; the feed says who is out of the round; the order preview, while out, says only Dad's money gets them back in.

## 4 Consequences

- A losscut is rare and final, and the loan is the only door back: the comic's trap is the game's.
- The margin call keeps its meaning, as the last warning before a round ends.
- Reckless bots sit out the end of a round once cut, except Kurumi, who borrows straight back in, as the comic's heroine would.
- `test/fx.test.ts` checks that a stop-out puts the player out, that only a loan brings them back, that a second cut on it ends the round when the savings are gone, and that a player's own stop or close does not.
