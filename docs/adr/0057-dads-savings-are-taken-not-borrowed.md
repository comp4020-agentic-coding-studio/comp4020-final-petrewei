# ADR 0057: Dad's Savings Are Taken, Not Borrowed

Status: accepted, 29 October 2026. Changes the loan of [ADR 0009](0009-a-parody-fx-trading-floor.md) and [ADR 0026](0026-a-losscut-ends-your-round.md), the score of [ADR 0029](0029-a-fairer-score.md), and the tutorial of [ADR 0013](0013-a-private-tutorial.md), [ADR 0054](0054-a-compact-lesson-card-and-a-helper-that-waits.md), [ADR 0055](0055-five-seconds-pause-and-end.md) and [ADR 0056](0056-a-warning-lesson-at-1000x.md).

## 1 Context

Peter pointed out that in the comic Kurumi does not borrow from her father's savings. She takes the money from the dresser at home while he is out, and he finds out and punishes her. The story pages for the third and fourth episodes say so: she pays three million yen of his savings into her account to dodge a forced loss cut, and in the fourth he tells her it was stolen, she drops the cash in front of him, confesses, and he begs her to quit. Peter asked for the word to stay, in quotation marks, with what happens after it shown, in every mode, and for the offer to be a pop-up and not a button in a panel. He also asked for the tutorial to be ten lessons again, the last five merged into one, with the ⏹ button resetting the tutorial, a ↻ button restarting only the lesson, and a ⏩ button doing the lesson at once; and for the lesson card to span the chart's bottom, with its task and Why? at the right end and no Next button.

## 2 Decision

**"Borrow" in quotation marks.** Every string that says it, in all three languages, quotes it and says Dad is out. The hover tip says it means take, and that he will know.

**A pop-up, in every mode.** A dialog beside the ticket offers ¥300,000, twice a round, when the player is under a margin call, or broke, with nothing open. It is not modal, so the position can still be closed, and Not now dismisses it. The offer is the same in Replay, Simulation and the tutorial. The Order Ticket has no Borrow button any more.

**Dad finds out.** A "loan" is found out 30 seconds later, or at the bell if the round ends first, even when it ends before 30 seconds. The desk closes whatever the player holds, grounds them for the round, and counts the loan as found out. The room is told in the feed, the player sees a stamp, and the score loses 10 points for each loan found out, on top of the 5 each loan already cost. Once found out, there is no second "loan": Dad has hidden the rest.

**The tutorial.** The last five lessons become one, "The Highest Leverage: 1000×". The player buys at 1000×, watches a margin call and the forced cut on moves of a tenth of a percent, takes the offered "loan" from the pop-up, buys again, and meets a gap through everything. They are wiped out, Dad finds out, and the tutorial ends. A lesson of several moves keeps its stage, so the pointer lights the press that belongs to it. The welcome has two looks and no Next: a click moves on, and the page sends the move itself after the last look.

**The card.** It spans the chart's bottom, with its words on the left and the task and Why? at its right end, and leaves the chart's right 28% (14% on a phone) clear, for the last fall of a lesson. The buttons in its top row are ⏩ skip, ⏸ pause, ↻ start the lesson again and ⏹ reset the tutorial. Skip does the lesson's own moves through the same rules as a player's; a lesson restarted keeps the money and price it began with.

## 3 Consequences

- Every mode now shows the same offer, and the same punishment follows it. A bot that borrows is found out like anyone.
- Dad's discovery is in `src/fx.ts` and the server, tested in `test/fx.test.ts`, `test/rounds.test.ts` (a real round, found out in time and at the bell, with the score) and `test/tutorial.test.ts` (the whole last lesson).
- The tutorial shows a "loan" and what follows, not just the loan, which is the part of the comic that matters.
- The tutorial's auto-helper presses "borrow" for a player who waits, like any other step.
- I took the three million yen and the discovery from the story pages' own summaries. Nothing is quoted from the comic, and the mother is not used.
- The Japanese and Chinese text is mine and has not been read by a native speaker.
