# ADR 0080: Emergency Credit Replaces Dad's Savings

Status: accepted, 5 November 2026. Supersedes [ADR 0057](0057-dads-savings-are-taken-not-borrowed.md), and changes the score of [ADR 0029](0029-a-fairer-score.md) and the last lessons of the tutorial. Peter asked, from two demo games he shared, for Dad's savings to become emergency credit with heavy interest, so that a negative endgame, bankruptcy, is plain.

## 1 Context

Dad's savings were two fixed loans a round, open only under a margin call or when broke, found out after a while, with the player then grounded. The cost was a flat penalty in the score, so a player never watched debt grow, and a round could not end in anything worse than being grounded.

## 2 Decision

**A credit line, drawn and repaid a step at a time.** Anyone may draw ¥100,000 at a time, up to ¥1,000,000, whenever the round trades, from a row under the account's meter that shows what is owed and its daily rate. A pop-up still offers a step to a player cut out or broke, since it is their way back in. A step is repaid from free cash, the balance less the margin in use, never from a position. The page sends only "borrow" or "repay"; the server sets every amount.

**Interest that rises with the debt.** What is owed grows by a daily rate, 2% a day up to ¥300,000, 4% to ¥600,000 and 6% above, charged a tick's share each tick and added to the debt. The whole line left a five-day round costs over a third of itself. The rates are the broker's numbers, sent with every state, so the page keeps no copy.

**Bankruptcy is the bad end.** Owing more than you have is bankruptcy: a stamp, a line in the feed, and 50 points off the score. The loan and found-out penalties are gone, since the interest is now in the money; the score's deduction is kept only for the outcome that the money alone does not make obvious. At the bell the debt is settled to the whole yen, so the breakdown, which now names the interest, adds up in the yen it shows.

**The tutorial ends in bankruptcy.** Its credit lesson draws a step after the forced cut, and its last lesson's gap wipes the player out with the step still owed. A finished tutorial offers no more credit.

**Kurumi still borrows when broke, and never repays.** The habit is the satire; the comic's family and its grief stay out of it, and Dad's savings leave the money's words in every language. Jokes about hiding a loss from Dad, in the leverage notes and prayers, stay, since they mock the habit, not the system.
