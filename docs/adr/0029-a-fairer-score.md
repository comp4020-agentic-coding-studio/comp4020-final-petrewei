# ADR 0029: A Fairer Score

Status: accepted, 26 October 2026. Changes how the bell and the hall of fame rank, kept in `src/score.ts`.

## 1 Context

The bell ranked by net worth and the hall by total profit. A lucky 1000× round beat careful play, and busting cost only that round, so the ranking rewarded the gamble the game warns against; and the hall rewarded playing many rounds, as profit adds up. The agent suggested scoring that counts risk; Peter chose it, with clues for Replay and speech for the bots.

## 2 Decision

A round's score is its percentage result, net of debt, less 10 points for each forced losscut and 5 for each loan from Dad. The money already counts what a cut and a loan cost; the score marks them again, so two traders who both end 50% down are ranked by how they got there, and the one who cut their own loss comes first. The bell ranks by score and shows it after the percentage, in bold and small type; the yen is in the row's tip.

The hall ranks by average score per round, and only players with three rounds or more. Newer players are listed after, dimmed and without a medal, with a tip saying how many rounds they have; a player busted in their first round, recorded before the bell, is listed too. Careers saved before scores are given one from their profit, as a percentage, so the hall carries over.

## 3 Consequences

- Reckless play now costs rank, not only money: at the first bell it was tried, Kurumi, cut twice and borrowing twice, scored −200 against her −160%.
- One lucky round no longer tops the hall.
- The costs, 10 and 5, are a judgement; they live in one file, `src/score.ts`, to be tuned.
- `test/score.test.ts` checks the score, the costs, a careful loss ranking above a forced one, the three-round minimum, and that a first-round bust is listed; `test/log.test.ts` checks the bell is ranked by score and an old career is scored from its profit.
