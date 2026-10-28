# ADR 0059: A Card That Always Reads, and a Ladder with Even Rungs

Status: accepted, 29 October 2026. Changes the lesson card of [ADR 0054](0054-a-compact-lesson-card-and-a-helper-that-waits.md) and [ADR 0057](0057-dads-savings-are-taken-not-borrowed.md), the countdown of [ADR 0055](0055-five-seconds-pause-and-end.md), the sliders of [ADR 0058](0058-a-fee-that-grows-with-leverage-and-a-scale-for-every-rung.md), and the offer of Dad's savings in ADR 0057.

## 1 Context

Peter used the tutorial and the ticket and asked for several changes at once. The Why? button should go, and the lesson text should always show. The restart button did not work, and a back button was wanted. By merging the last lessons he had meant adjusting leverage and stake once, to show the loss cut and the other extremes on one setting, not squeezing them into one lesson: several lessons and steps were fine, but each step's words short. The card's layout, the countdown and the tip needed changing. The leverage ladder should lose 50× and be evenly spaced, the sliders should change colour as they rise, the leverage notes should be more descriptive, the indicator ⓘ should go in favour of hover tips, and the chart's mode text and the empty space under Pray should go. Sell and Buy should each say, in one line, what they earn on.

## 2 Decision

**Ten lessons on one setting.** The tutorial is ten lessons again. Sell now includes closing the short, and the Stop Loss lesson sets 10× and 100%, buys, and drags the stop, in one lesson: two moves in one lesson, each marked, with the pointer on the move that is due. The last three set Leverage and Stake once, at 1000× and 100%. In the first, a margin call and the forced cut come on tiny moves. In the second, the pop-up offers "borrow". In the third, the player buys again on the same setting, the price gaps, they are wiped out, and Dad finds out. Every lesson's text is now one or two short sentences.

**Restart, back, and why restart failed.** Each lesson's starting money and price are kept. ↻ starts the current lesson again, ⏪ goes to the start of the one before, and ⏹ resets everything. Restart did nothing once the tutorial was finished, because it restored a lesson that no longer existed: it now restarts the last lesson.

**The card.** There is no Why? button and the text is always shown. The title and task are on the left, and the head, the lesson number and the five buttons, is above the text on the right. On a phone the chart is too short to share, so the card sits under it and covers nothing.

**The tip and the countdown.** The countdown is 9 seconds and leads the tip, "8s · 1/2 The price of one dollar, in yen.", so it shows from the start. The tip is one line.

**The ladder and the colours.** The ladder is 1, 2, 5, 10, 30, 100, 200, 500, 1000, with the rungs evenly spaced, so one arrow key moves one rung. Leverage and Stake take a colour from their level: green to Australia's 30× cap, amber at it, through orange to red at 1000×. Stake has no legal cap, so it runs a gentler range of its own.

**Notes in the comic's voice.** The leverage notes are now phrases, from "Index-fund energy" at 1× to Kurumi's own "It's okay, I've got leverage" at 1000×, with 30× still naming Australia's cap, and the Japanese and Chinese notes are written fresh, not translated.

**Smaller things.** MA, BB and RSI show their definition on hover and the ⓘ is gone, so a click only toggles them. The mode text in the chart's head is gone; a clue or headline still shows, over the chart's top left, so it never moves the chart. Sell and Buy carry a line saying they earn on a fall and on a rise. The refusal line takes no room while it is empty.

**Dad's offer keeps its place.** A position at 1000× crosses the margin call line back and forth, and a player could be offered Dad's savings and refused one tick later. A margin call is now remembered for ten ticks, about five seconds, so the offer and the rule agree.

## 3 Consequences

- A player sets leverage once for the last three lessons and sees what that setting does, as Peter asked.
- A browser check at 1280, 390 and 360 pixels, in all three languages, found the Sell and Buy notes widening the ticket and a gap card cut off on a phone; both were fixed. Every card then fit, and the phone card no longer covers the chart.
- Two tests of Dad finding out in a market failed in 2 of every 14 runs. The cause was a real rule, not the tests, and the fix above made them pass 16 of 16.
- The Japanese and Chinese lesson text and notes are mine and have not been read by a native speaker.
- The heat's colours are green, amber and red, so a player who cannot tell them apart still has the number, the tick and the note.
