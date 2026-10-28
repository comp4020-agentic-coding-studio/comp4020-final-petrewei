# ADR 0056: A Warning Lesson at 1000×

Status: accepted, 29 October 2026. Adds two lessons before the last one in [ADR 0013](0013-a-private-tutorial.md), and changes the card of [ADR 0055](0055-five-seconds-pause-and-end.md); its two lessons were merged into one, and its warning moved into it, by [ADR 0057](0057-dads-savings-are-taken-not-borrowed.md).

## 1 Context

Peter asked for the tutorial to end by choosing the highest leverage, showing the risk of trading that way, and teaching the player a warning lesson. He also asked for Start again to be a symbol, like Pause and End.

## 2 Decision

**1000× Leverage.** The lesson sets Leverage to 1000× and Stake to 100% and presses Buy, as the other lessons do for their own settings, and refuses any other leverage. The price then rises 0.03% and falls about 0.1%, each step the size of an ordinary minute. The player's margin call comes at the fifth step and the forced loss cut at the sixth, from the same desk and rules as the real markets.

**The Warning.** A second lesson says what just happened: the spread alone took 20% of the account on the buy, a rise of 0.03% made it feel like skill, and a fall of 0.1% closed it out at a 90% loss. Nobody can call moves this small, so the top leverage is a coin flip tilted by the spread, and a few such flips end any account. It ends with advice: keep leverage low, risk little, use a Stop Loss. Both lessons are in all three languages. They come after Dad's Savings, which ends on the loss of the 30× lesson, and before You're Ready, so the tutorial now has fourteen lessons.

**Start again as a symbol.** The ↻ button joins ⏸ and ⏹ in the card's top row, with its words kept as its label and tip in each language. The bottom row has Next and Why?.

## 3 Consequences

- A player who finishes the tutorial has seen the largest leverage on the menu take an account in seconds, on practice money.
- The numbers in the warning are the desk's. `test/tutorial.test.ts` checks that the rise stays under 0.05%, that a margin call and a forced cut follow, and that about a tenth of the money is left, so the text cannot drift from the rules.
- The lesson's wording is mine and the numbers were played through before they were written; my first draft said 30% and a quarter, which the play-through showed was wrong.
- The auto-helper does this lesson for a player who waits, with the same press as any other.
- The README and ADR 0054 count the lessons as fourteen.
